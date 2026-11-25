import express, { type Request } from 'express';
import type { Db } from '../db.ts';
import { requireAdmin } from './auth.ts';
import {
  createRateLimiter,
  generateSecureToken,
  hashIpForAnalytics,
  isStrictAdminRow,
} from '../services/security.ts';

export const VISITOR_COOKIE_NAME = 'dtr_vid';
const VISITOR_ID_REGEX = /^[a-f0-9]{32}$/;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const PAGEVIEW_DEDUP_MS = 3 * 60 * 1000;

let pageviewCounter = 0;

function parseUserAgent(ua: string): {
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
} {
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    deviceType = 'tablet';
  } else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) {
    deviceType = 'mobile';
  }

  let os = 'Other';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome\/|crios\//i.test(ua)) browser = 'Chrome';
  else if (/firefox\/|fxios\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome|crios|edg|opr/i.test(ua)) browser = 'Safari';

  return { deviceType, browser, os };
}

function extractCountry(req: Request): string | null {
  const candidates = [
    req.get('cf-ipcountry'),
    req.get('x-vercel-ip-country'),
    req.get('x-country-code'),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const code = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') {
      return code;
    }
  }
  return null;
}

function sanitizePath(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '/';
  if (!s.startsWith('/')) return '/';
  return s.split('?')[0].slice(0, 160) || '/';
}

function sanitizeReferrer(raw: unknown, reqHost: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (reqHost && parsed.host.toLowerCase() === reqHost.toLowerCase()) return null;
    return `${parsed.host}${parsed.pathname}`.slice(0, 200);
  } catch {
    return null;
  }
}

export function createPresenceRouter(getDbFn: () => Promise<Db>) {
  const router = express.Router();

  const presenceRateLimit = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 120,
    message: 'Too many presence updates.',
  });

  router.post('/', presenceRateLimit, async (req, res) => {
    const db = await getDbFn();
    const event = req.body?.event === 'heartbeat' ? 'heartbeat' : 'pageview';
    const cleanPath = sanitizePath(req.body?.path);
    const referrer = sanitizeReferrer(req.body?.referrer, req.get('host'));

    const existingCookie = req.cookies?.[VISITOR_COOKIE_NAME];
    const hasValidVisitorCookie =
      typeof existingCookie === 'string' && VISITOR_ID_REGEX.test(existingCookie);
    const visitorId = hasValidVisitorCookie ? existingCookie : generateSecureToken(16);

    if (!hasValidVisitorCookie) {
      res.cookie(VISITOR_COOKIE_NAME, visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    const ua = String(req.get('user-agent') || '');
    const { deviceType, browser, os } = parseUserAgent(ua);
    const country = extractCountry(req);
    const ipHash = hashIpForAnalytics(req.ip || req.socket.remoteAddress || 'unknown');
    const userId = req.user ? req.user.id : null;
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO visitor_sessions (
        visitor_id, user_id, ip_hash, country, device_type, browser, os,
        current_path, referrer, page_views, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(visitor_id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, visitor_sessions.user_id),
        ip_hash = excluded.ip_hash,
        country = COALESCE(excluded.country, visitor_sessions.country),
        device_type = excluded.device_type,
        browser = excluded.browser,
        os = excluded.os,
        current_path = excluded.current_path,
        referrer = COALESCE(excluded.referrer, visitor_sessions.referrer),
        page_views = CASE
          WHEN ? = 'pageview' THEN visitor_sessions.page_views + 1
          ELSE visitor_sessions.page_views
        END,
        last_seen_at = excluded.last_seen_at`,
      [
        visitorId,
        userId,
        ipHash,
        country,
        deviceType,
        browser,
        os,
        cleanPath,
        referrer,
        nowIso,
        nowIso,
        event,
      ]
    );

    if (userId !== null) {
      await db.run(`UPDATE users SET last_seen_at = ?, last_path = ? WHERE id = ?`, [
        nowIso,
        cleanPath,
        userId,
      ]);
    }

    if (event === 'pageview') {
      const dedupCutoff = new Date(Date.now() - PAGEVIEW_DEDUP_MS).toISOString();
      const recentSame = await db.get<{ id: number }>(
        `SELECT id FROM visit_logs
         WHERE visitor_id = ? AND path = ? AND created_at > ?
         LIMIT 1`,
        [visitorId, cleanPath, dedupCutoff]
      );

      if (!recentSame) {
        await db.run(
          `INSERT INTO visit_logs (
            visitor_id, user_id, path, country, device_type, browser, os, referrer, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [visitorId, userId, cleanPath, country, deviceType, browser, os, referrer, nowIso]
        );
      }

      pageviewCounter++;
      if (pageviewCounter % 100 === 0) {
        const logRetentionCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const sessionRetentionCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
        await db.run(`DELETE FROM visit_logs WHERE created_at < ?`, [logRetentionCutoff]);
        await db.run(`DELETE FROM visitor_sessions WHERE last_seen_at < ?`, [sessionRetentionCutoff]);
      }
    }

    res.json({ ok: true });
  });

  return router;
}

export function createAdminRouter(getDbFn: () => Promise<Db>) {
  const router = express.Router();

  router.get('/analytics', requireAdmin(getDbFn), async (_req, res) => {
    const db = await getDbFn();
    const now = Date.now();
    const onlineCutoff = new Date(now - ONLINE_WINDOW_MS).toISOString();
    const h24Cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const d7Cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const d14Cutoff = new Date(now - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const d30Cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      onlineRow,
      stats24h,
      stats7d,
      stats30d,
      totalsRow,
      onlineRows,
      dailyRows,
      userRows,
      recentVisitorRows,
      deviceRows,
      browserRows,
      countryRows,
      topPathRows,
    ] = await Promise.all([
      db.get<{ onlineTotal: number; onlineUsers: number; onlineGuests: number }>(
        `SELECT
          COUNT(*) AS onlineTotal,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) AS onlineUsers,
          SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS onlineGuests
         FROM visitor_sessions
         WHERE last_seen_at >= ?`,
        [onlineCutoff]
      ),
      db.get<{ visitors: number; pageViews: number }>(
        `SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageViews
         FROM visit_logs WHERE created_at >= ?`,
        [h24Cutoff]
      ),
      db.get<{ visitors: number; pageViews: number }>(
        `SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageViews
         FROM visit_logs WHERE created_at >= ?`,
        [d7Cutoff]
      ),
      db.get<{ visitors: number; pageViews: number }>(
        `SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageViews
         FROM visit_logs WHERE created_at >= ?`,
        [d30Cutoff]
      ),
      db.get<{
        totalVisitorsAllTime: number;
        totalUsers: number;
        totalSongRatings: number;
        totalReleaseRatings: number;
        totalNotes: number;
      }>(
        `SELECT
          (SELECT COUNT(*) FROM visitor_sessions) AS totalVisitorsAllTime,
          (SELECT COUNT(*) FROM users) AS totalUsers,
          (SELECT COUNT(*) FROM song_ratings) AS totalSongRatings,
          (SELECT COUNT(*) FROM release_ratings) AS totalReleaseRatings,
          (SELECT COUNT(*) FROM notes) AS totalNotes`
      ),
      db.all<Record<string, unknown>>(
        `SELECT
          vs.*,
          u.email,
          u.display_name,
          u.password_hash,
          u.is_admin
         FROM visitor_sessions vs
         LEFT JOIN users u ON u.id = vs.user_id
         WHERE vs.last_seen_at >= ?
         ORDER BY vs.last_seen_at DESC`,
        [onlineCutoff]
      ),
      db.all<{ day: string; uniqueVisitors: number; pageViews: number }>(
        `SELECT
          substr(created_at, 1, 10) AS day,
          COUNT(DISTINCT visitor_id) AS uniqueVisitors,
          COUNT(*) AS pageViews
         FROM visit_logs
         WHERE substr(created_at, 1, 10) >= ?
         GROUP BY day
         ORDER BY day ASC`,
        [d14Cutoff]
      ),
      db.all<Record<string, unknown>>(
        `SELECT
          u.*,
          (SELECT COUNT(*) FROM user_artists ua WHERE ua.user_id = u.id) AS artists_count,
          (SELECT COUNT(*) FROM song_ratings sr WHERE sr.user_id = u.id) AS song_ratings_count,
          (SELECT COUNT(*) FROM release_ratings rr WHERE rr.user_id = u.id) AS release_ratings_count,
          (SELECT COUNT(*) FROM notes n WHERE n.user_id = u.id) AS notes_count,
          (SELECT vs.device_type FROM visitor_sessions vs WHERE vs.user_id = u.id ORDER BY vs.last_seen_at DESC LIMIT 1) AS device_type,
          (SELECT vs.browser FROM visitor_sessions vs WHERE vs.user_id = u.id ORDER BY vs.last_seen_at DESC LIMIT 1) AS browser,
          (SELECT vs.os FROM visitor_sessions vs WHERE vs.user_id = u.id ORDER BY vs.last_seen_at DESC LIMIT 1) AS os,
          (SELECT vs.country FROM visitor_sessions vs WHERE vs.user_id = u.id ORDER BY vs.last_seen_at DESC LIMIT 1) AS country,
          (SELECT COALESCE(SUM(vs.page_views), 0) FROM visitor_sessions vs WHERE vs.user_id = u.id) AS total_page_views
         FROM users u
         ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC`
      ),
      db.all<Record<string, unknown>>(
        `SELECT
          vs.*,
          u.email,
          u.display_name,
          u.password_hash,
          u.is_admin
         FROM visitor_sessions vs
         LEFT JOIN users u ON u.id = vs.user_id
         ORDER BY vs.last_seen_at DESC
         LIMIT 40`
      ),
      db.all<{ label: string; count: number }>(
        `SELECT device_type AS label, COUNT(*) AS count
         FROM visitor_sessions GROUP BY device_type ORDER BY count DESC`
      ),
      db.all<{ label: string; count: number }>(
        `SELECT browser AS label, COUNT(*) AS count
         FROM visitor_sessions GROUP BY browser ORDER BY count DESC`
      ),
      db.all<{ label: string; count: number }>(
        `SELECT COALESCE(country, 'Unknown') AS label, COUNT(*) AS count
         FROM visitor_sessions GROUP BY label ORDER BY count DESC LIMIT 10`
      ),
      db.all<{ path: string; views: number }>(
        `SELECT path, COUNT(*) AS views
         FROM visit_logs WHERE created_at >= ?
         GROUP BY path ORDER BY views DESC LIMIT 8`,
        [d30Cutoff]
      ),
    ]);

    const dailyMap = new Map(
      dailyRows.map((d) => [
        String(d.day),
        { uniqueVisitors: Number(d.uniqueVisitors || 0), pageViews: Number(d.pageViews || 0) },
      ])
    );
    const dailySeries: { date: string; uniqueVisitors: number; pageViews: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dateStr = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const hit = dailyMap.get(dateStr);
      dailySeries.push({
        date: dateStr,
        uniqueVisitors: hit?.uniqueVisitors ?? 0,
        pageViews: hit?.pageViews ?? 0,
      });
    }

    const mapVisitor = (r: Record<string, unknown>) => ({
      visitorIdShort: String(r.visitor_id).slice(0, 6),
      userId: r.user_id !== null && r.user_id !== undefined ? Number(r.user_id) : null,
      displayName: r.display_name ? String(r.display_name) : null,
      email: r.email ? String(r.email) : null,
      isAdmin: r.user_id
        ? isStrictAdminRow({
            id: r.user_id,
            email: r.email,
            display_name: r.display_name,
            password_hash: r.password_hash,
            is_admin: r.is_admin,
          })
        : false,
      currentPath: String(r.current_path || '/'),
      country: r.country ? String(r.country) : null,
      deviceType: String(r.device_type || 'desktop') as 'mobile' | 'tablet' | 'desktop',
      browser: String(r.browser || 'Other'),
      os: String(r.os || 'Other'),
      referrer: r.referrer ? String(r.referrer) : null,
      pageViews: Number(r.page_views || 1),
      firstSeenAt: String(r.first_seen_at),
      lastSeenAt: String(r.last_seen_at),
      isOnline: String(r.last_seen_at) >= onlineCutoff,
    });

    res.json({
      generatedAt: new Date(now).toISOString(),
      summary: {
        onlineTotal: Number(onlineRow?.onlineTotal || 0),
        onlineUsers: Number(onlineRow?.onlineUsers || 0),
        onlineGuests: Number(onlineRow?.onlineGuests || 0),
        visitors24h: Number(stats24h?.visitors || 0),
        pageViews24h: Number(stats24h?.pageViews || 0),
        visitors7d: Number(stats7d?.visitors || 0),
        pageViews7d: Number(stats7d?.pageViews || 0),
        visitors30d: Number(stats30d?.visitors || 0),
        pageViews30d: Number(stats30d?.pageViews || 0),
        totalVisitorsAllTime: Number(totalsRow?.totalVisitorsAllTime || 0),
        totalUsers: Number(totalsRow?.totalUsers || 0),
        totalSongRatings: Number(totalsRow?.totalSongRatings || 0),
        totalReleaseRatings: Number(totalsRow?.totalReleaseRatings || 0),
        totalNotes: Number(totalsRow?.totalNotes || 0),
      },
      onlineNow: onlineRows.map(mapVisitor),
      dailySeries,
      users: userRows.map((u) => {
        const lastSeenAt = u.last_seen_at ? String(u.last_seen_at) : null;
        return {
          id: Number(u.id),
          email: String(u.email),
          displayName: String(u.display_name),
          isAdmin: isStrictAdminRow(u),
          isOnline: Boolean(lastSeenAt && lastSeenAt >= onlineCutoff),
          lastSeenAt,
          lastPath: u.last_path ? String(u.last_path) : null,
          artistsCount: Number(u.artists_count || 0),
          songRatingsCount: Number(u.song_ratings_count || 0),
          releaseRatingsCount: Number(u.release_ratings_count || 0),
          notesCount: Number(u.notes_count || 0),
          totalPageViews: Number(u.total_page_views || 0),
          deviceType: u.device_type ? String(u.device_type) : null,
          browser: u.browser ? String(u.browser) : null,
          os: u.os ? String(u.os) : null,
          country: u.country ? String(u.country) : null,
          createdAt: String(u.created_at),
        };
      }),
      recentVisitors: recentVisitorRows.map(mapVisitor),
      breakdowns: {
        devices: deviceRows.map((d) => ({ label: String(d.label), count: Number(d.count || 0) })),
        browsers: browserRows.map((b) => ({ label: String(b.label), count: Number(b.count || 0) })),
        countries: countryRows.map((c) => ({ label: String(c.label), count: Number(c.count || 0) })),
        topPaths: topPathRows.map((p) => ({ path: String(p.path), views: Number(p.views || 0) })),
      },
    });
  });

  return router;
}
