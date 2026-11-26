import express from 'express';
import type { Db } from '../db.ts';
import { requireAuth } from './auth.ts';
import { decryptText, slugifyNickname } from '../services/security.ts';
import type { VisibilityMode } from '../types.ts';

const VALID_VISIBILITIES = new Set<VisibilityMode>(['everyone', 'friends', 'selected', 'nobody']);

function parseVisibility(raw: unknown, fallback: VisibilityMode): VisibilityMode {
  return raw === 'everyone' || raw === 'friends' || raw === 'selected' || raw === 'nobody'
    ? raw
    : fallback;
}

interface Relationship {
  iFollow: boolean;
  followsMe: boolean;
  isFriend: boolean;
}

type AllowlistScope = 'ratings' | 'notes' | 'connections';
type NotificationType = 'new_follower' | 'became_friends';

const sseClients = new Map<number, Set<express.Response>>();

function pushSseEvent(userId: number, eventName: string, data: unknown): void {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // Closed client will clean up on 'close'
    }
  }
}

async function getRelationship(db: Db, viewerId: number, targetId: number): Promise<Relationship> {
  if (viewerId === targetId) {
    return { iFollow: false, followsMe: false, isFriend: false };
  }
  const rows = await db.all<{ follower_id: number; following_id: number }>(
    `SELECT follower_id, following_id FROM user_follows
     WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)`,
    [viewerId, targetId, targetId, viewerId]
  );
  const iFollow = rows.some(
    (r) => Number(r.follower_id) === viewerId && Number(r.following_id) === targetId
  );
  const followsMe = rows.some(
    (r) => Number(r.follower_id) === targetId && Number(r.following_id) === viewerId
  );
  return { iFollow, followsMe, isFriend: iFollow && followsMe };
}

async function evaluateScopeAccess(
  db: Db,
  ownerId: number,
  viewerId: number,
  mode: VisibilityMode,
  scope: AllowlistScope,
  isFriend: boolean
): Promise<boolean> {
  if (ownerId === viewerId) return true;
  if (mode === 'everyone') return true;
  if (mode === 'nobody') return false;
  if (!isFriend) return false;
  if (mode === 'friends') return true;
  const hit = await db.get<{ viewer_id: number }>(
    `SELECT viewer_id FROM user_privacy_allowlist
     WHERE owner_id = ? AND viewer_id = ? AND scope = ?`,
    [ownerId, viewerId, scope]
  );
  return Boolean(hit);
}

async function resolveTargetUser(db: Db, rawParam: unknown) {
  const rawStr = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  let decoded = '';
  try {
    decoded = decodeURIComponent(String(rawStr || ''));
  } catch {
    decoded = String(rawStr || '');
  }
  const clean = decoded.trim().replace(/^@/, '');
  if (!clean) return undefined;

  const cols = `id, slug, display_name, avatar_url, bio, ratings_visibility, notes_visibility, connections_visibility, created_at`;
  if (/^\d+$/.test(clean)) {
    const byId = await db.get<Record<string, unknown>>(`SELECT ${cols} FROM users WHERE id = ?`, [
      Number(clean),
    ]);
    if (byId) return byId;
  }
  return db.get<Record<string, unknown>>(
    `SELECT ${cols} FROM users WHERE lower(slug) = lower(?)`,
    [clean]
  );
}

function mapPublicUserCard(r: Record<string, unknown>) {
  const iFollow = Boolean(Number(r.i_follow || 0));
  const followsMe = Boolean(Number(r.follows_me || 0));
  return {
    id: Number(r.id),
    slug: r.slug ? String(r.slug) : slugifyNickname(String(r.display_name || '')),
    displayName: String(r.display_name),
    avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
    bio: r.bio ? String(r.bio) : '',
    iFollow,
    followsMe,
    isFriend: iFollow && followsMe,
    createdAt: String(r.created_at),
  };
}

async function loadUserNotifications(db: Db, userId: number) {
  const [unreadRow, rows] = await Promise.all([
    db.get<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_id = ? AND is_read = 0`,
      [userId]
    ),
    db.all<Record<string, unknown>>(
      `SELECT
        n.id, n.type, n.is_read, n.created_at,
        u.id AS actor_id, u.slug, u.display_name, u.avatar_url, u.bio, u.created_at AS actor_created_at,
        EXISTS(SELECT 1 FROM user_follows f1 WHERE f1.follower_id = ? AND f1.following_id = u.id) AS i_follow,
        EXISTS(SELECT 1 FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS follows_me
       FROM notifications n
       JOIN users u ON u.id = n.actor_id
       WHERE n.recipient_id = ?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 35`,
      [userId, userId, userId]
    ),
  ]);

  return {
    unreadCount: Number(unreadRow?.cnt || 0),
    notifications: rows.map((r) => ({
      id: Number(r.id),
      type: (r.type === 'became_friends' ? 'became_friends' : 'new_follower') as NotificationType,
      isRead: Boolean(Number(r.is_read || 0)),
      createdAt: String(r.created_at),
      actor: mapPublicUserCard({
        id: r.actor_id,
        slug: r.slug,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
        bio: r.bio,
        i_follow: r.i_follow,
        follows_me: r.follows_me,
        created_at: r.actor_created_at,
      }),
    })),
  };
}

export function createSocialRouter(getDbFn: () => Promise<Db>) {
  const router = express.Router();

  router.get('/notifications', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const data = await loadUserNotifications(db, req.user!.id);
    res.json(data);
  });

  router.get('/notifications/stream', requireAuth, (req, res) => {
    const userId = req.user!.id;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    req.socket?.setNoDelay?.(true);
    res.flushHeaders?.();

    let set = sseClients.get(userId);
    if (!set) {
      set = new Set();
      sseClients.set(userId, set);
    }
    set.add(res);

    try {
      res.write(`event: connected\ndata: {"ok":true}\n\n`);
    } catch {
      // ignore closed write
    }

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        // ignore closed write
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      const current = sseClients.get(userId);
      if (current) {
        current.delete(res);
        if (current.size === 0) {
          sseClients.delete(userId);
        }
      }
    });
  });

  router.post('/notifications/read', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const rawId = req.body?.id;
    const notifId = Number(rawId);

    if (rawId !== undefined && Number.isInteger(notifId) && notifId > 0) {
      await db.run(
        `UPDATE notifications SET is_read = 1 WHERE recipient_id = ? AND id = ?`,
        [userId, notifId]
      );
    } else {
      await db.run(
        `UPDATE notifications SET is_read = 1 WHERE recipient_id = ? AND is_read = 0`,
        [userId]
      );
    }

    const row = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_id = ? AND is_read = 0`,
      [userId]
    );
    const unreadCount = Number(row?.cnt || 0);
    pushSseEvent(userId, 'unread_sync', { unreadCount });
    res.json({ ok: true, unreadCount });
  });

  router.get('/overview', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;

    const [relationRows, userRow, allowRows] = await Promise.all([
      db.all<Record<string, unknown>>(
        `SELECT
          u.id, u.slug, u.display_name, u.avatar_url, u.bio, u.created_at,
          EXISTS(SELECT 1 FROM user_follows f1 WHERE f1.follower_id = ? AND f1.following_id = u.id) AS i_follow,
          EXISTS(SELECT 1 FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS follows_me
         FROM users u
         WHERE u.id != ?
           AND (
             EXISTS(SELECT 1 FROM user_follows f1 WHERE f1.follower_id = ? AND f1.following_id = u.id)
             OR EXISTS(SELECT 1 FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?)
           )
         ORDER BY lower(u.display_name) ASC`,
        [userId, userId, userId, userId, userId]
      ),
      db.get<{
        ratings_visibility: string;
        notes_visibility: string;
        connections_visibility: string;
      }>(
        `SELECT ratings_visibility, notes_visibility, connections_visibility FROM users WHERE id = ?`,
        [userId]
      ),
      db.all<{ viewer_id: number; scope: AllowlistScope }>(
        `SELECT viewer_id, scope FROM user_privacy_allowlist WHERE owner_id = ?`,
        [userId]
      ),
    ]);

    const cards = relationRows.map(mapPublicUserCard);
    const friends = cards.filter((c) => c.isFriend);
    const followers = cards.filter((c) => c.followsMe);
    const following = cards.filter((c) => c.iFollow);

    const friendIdSet = new Set(friends.map((f) => f.id));

    res.json({
      friends,
      followers,
      following,
      privacy: {
        ratingsVisibility: parseVisibility(userRow?.ratings_visibility, 'everyone'),
        notesVisibility: parseVisibility(userRow?.notes_visibility, 'nobody'),
        connectionsVisibility: parseVisibility(userRow?.connections_visibility, 'everyone'),
        selectedRatingsFriendIds: allowRows
          .filter((a) => a.scope === 'ratings' && friendIdSet.has(Number(a.viewer_id)))
          .map((a) => Number(a.viewer_id)),
        selectedNotesFriendIds: allowRows
          .filter((a) => a.scope === 'notes' && friendIdSet.has(Number(a.viewer_id)))
          .map((a) => Number(a.viewer_id)),
        selectedConnectionsFriendIds: allowRows
          .filter((a) => a.scope === 'connections' && friendIdSet.has(Number(a.viewer_id)))
          .map((a) => Number(a.viewer_id)),
      },
    });
  });

  router.get('/search', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const rawQ = String(req.query.q || '').trim();
    const urlMatch = rawQ.match(/\/users\/([^/?#]+)/i);
    let cleanQ = rawQ;
    if (urlMatch) {
      try {
        cleanQ = decodeURIComponent(urlMatch[1]);
      } catch {
        cleanQ = urlMatch[1];
      }
    }
    cleanQ = cleanQ.trim().replace(/^@/, '');

    const hasAlnum = /[a-z0-9\u0400-\u04ff]/i.test(cleanQ);
    const translitSlug = hasAlnum ? slugifyNickname(cleanQ) : '';

    const rows = cleanQ
      ? await db.all<Record<string, unknown>>(
          `SELECT
            u.id, u.slug, u.display_name, u.avatar_url, u.bio, u.created_at,
            EXISTS(SELECT 1 FROM user_follows f1 WHERE f1.follower_id = ? AND f1.following_id = u.id) AS i_follow,
            EXISTS(SELECT 1 FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS follows_me
           FROM users u
           WHERE u.id != ?
             AND (
               lower(u.display_name) LIKE ?
               OR lower(COALESCE(u.slug, '')) LIKE ?
               OR (? != '' AND lower(COALESCE(u.slug, '')) LIKE ?)
             )
           ORDER BY lower(u.display_name) ASC
           LIMIT 25`,
          [
            userId,
            userId,
            userId,
            `%${cleanQ.toLowerCase()}%`,
            `%${cleanQ.toLowerCase()}%`,
            translitSlug,
            `%${translitSlug}%`,
          ]
        )
      : await db.all<Record<string, unknown>>(
          `SELECT
            u.id, u.slug, u.display_name, u.avatar_url, u.bio, u.created_at,
            EXISTS(SELECT 1 FROM user_follows f1 WHERE f1.follower_id = ? AND f1.following_id = u.id) AS i_follow,
            EXISTS(SELECT 1 FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS follows_me
           FROM users u
           WHERE u.id != ?
           ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC
           LIMIT 24`,
          [userId, userId, userId]
        );

    res.json({ users: rows.map(mapPublicUserCard) });
  });

  router.post('/follow/:idOrSlug', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const targetRow = await resolveTargetUser(db, req.params.idOrSlug);
    if (!targetRow) {
      res.status(404).json({ error: 'Користувача не знайдено.' });
      return;
    }
    const targetId = Number(targetRow.id);
    if (targetId === userId) {
      res.status(400).json({ error: 'Неможливо підписатися на себе.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const ins = await db.run(
      `INSERT OR IGNORE INTO user_follows (follower_id, following_id, created_at) VALUES (?, ?, ?)`,
      [userId, targetId, nowIso]
    );

    const relationship = await getRelationship(db, userId, targetId);

    if (ins.changes > 0) {
      const notifType: NotificationType = relationship.isFriend ? 'became_friends' : 'new_follower';
      await db.run(
        `DELETE FROM notifications WHERE recipient_id = ? AND actor_id = ? AND is_read = 0`,
        [targetId, userId]
      );
      const notifIns = await db.run(
        `INSERT INTO notifications (recipient_id, actor_id, type, is_read, created_at) VALUES (?, ?, ?, 0, ?)`,
        [targetId, userId, notifType, nowIso]
      );
      const unreadRow = await db.get<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_id = ? AND is_read = 0`,
        [targetId]
      );
      const actor = req.user!;
      pushSseEvent(targetId, 'notification', {
        unreadCount: Number(unreadRow?.cnt || 1),
        notification: {
          id: Number(notifIns.lastInsertRowid),
          type: notifType,
          isRead: false,
          createdAt: nowIso,
          actor: {
            id: actor.id,
            slug: actor.slug,
            displayName: actor.displayName,
            avatarUrl: actor.avatarUrl,
            bio: actor.bio,
            iFollow: relationship.followsMe,
            followsMe: relationship.iFollow,
            isFriend: relationship.isFriend,
            createdAt: actor.createdAt,
          },
        },
      });
    }

    res.json({ ok: true, relationship });
  });

  router.delete('/follow/:idOrSlug', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const targetRow = await resolveTargetUser(db, req.params.idOrSlug);
    if (!targetRow) {
      res.status(404).json({ error: 'Користувача не знайдено.' });
      return;
    }
    const targetId = Number(targetRow.id);
    if (targetId === userId) {
      res.status(400).json({ error: 'Некоректний користувач.' });
      return;
    }

    await db.run(`DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?`, [
      userId,
      targetId,
    ]);
    // Breaking mutual follow removes "selected friend" exceptions cleanly
    await db.run(
      `DELETE FROM user_privacy_allowlist
       WHERE (owner_id = ? AND viewer_id = ?) OR (owner_id = ? AND viewer_id = ?)`,
      [userId, targetId, targetId, userId]
    );

    const relationship = await getRelationship(db, userId, targetId);
    res.json({ ok: true, relationship });
  });

  router.put('/privacy', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const ratingsVisibility = req.body?.ratingsVisibility;
    const notesVisibility = req.body?.notesVisibility;
    const rawConnections = req.body?.connectionsVisibility;
    const connectionsVisibility =
      rawConnections === undefined ? 'everyone' : rawConnections;

    if (
      !VALID_VISIBILITIES.has(ratingsVisibility) ||
      !VALID_VISIBILITIES.has(notesVisibility) ||
      !VALID_VISIBILITIES.has(connectionsVisibility)
    ) {
      res.status(400).json({ error: 'Некоректний режим приватності.' });
      return;
    }

    await db.run(
      `UPDATE users
       SET ratings_visibility = ?, notes_visibility = ?, connections_visibility = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [ratingsVisibility, notesVisibility, connectionsVisibility, userId]
    );

    // Fetch current mutual friends so only real mutual friends can stay in selected allowlist
    const mutualRows = await db.all<{ id: number }>(
      `SELECT f1.following_id AS id
       FROM user_follows f1
       JOIN user_follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
       WHERE f1.follower_id = ?`,
      [userId]
    );
    const friendIds = new Set(mutualRows.map((m) => Number(m.id)));

    const rawRatingsIds: unknown[] = Array.isArray(req.body?.selectedRatingsFriendIds)
      ? req.body.selectedRatingsFriendIds
      : [];
    const rawNotesIds: unknown[] = Array.isArray(req.body?.selectedNotesFriendIds)
      ? req.body.selectedNotesFriendIds
      : [];
    const rawConnectionsIds: unknown[] = Array.isArray(req.body?.selectedConnectionsFriendIds)
      ? req.body.selectedConnectionsFriendIds
      : [];

    const selectedRatingsFriendIds = Array.from(
      new Set(rawRatingsIds.map(Number).filter((id) => friendIds.has(id)))
    );
    const selectedNotesFriendIds = Array.from(
      new Set(rawNotesIds.map(Number).filter((id) => friendIds.has(id)))
    );
    const selectedConnectionsFriendIds = Array.from(
      new Set(rawConnectionsIds.map(Number).filter((id) => friendIds.has(id)))
    );

    const nowIso = new Date().toISOString();
    await db.run(`DELETE FROM user_privacy_allowlist WHERE owner_id = ?`, [userId]);

    const inserts = [
      ...selectedRatingsFriendIds.map((vid) => ({
        sql: `INSERT INTO user_privacy_allowlist (owner_id, viewer_id, scope, created_at) VALUES (?, ?, 'ratings', ?)`,
        args: [userId, vid, nowIso],
      })),
      ...selectedNotesFriendIds.map((vid) => ({
        sql: `INSERT INTO user_privacy_allowlist (owner_id, viewer_id, scope, created_at) VALUES (?, ?, 'notes', ?)`,
        args: [userId, vid, nowIso],
      })),
      ...selectedConnectionsFriendIds.map((vid) => ({
        sql: `INSERT INTO user_privacy_allowlist (owner_id, viewer_id, scope, created_at) VALUES (?, ?, 'connections', ?)`,
        args: [userId, vid, nowIso],
      })),
    ];
    if (inserts.length > 0) {
      await db.batch(inserts);
    }

    res.json({
      ok: true,
      privacy: {
        ratingsVisibility,
        notesVisibility,
        connectionsVisibility,
        selectedRatingsFriendIds,
        selectedNotesFriendIds,
        selectedConnectionsFriendIds,
      },
    });
  });

  router.get('/users/:idOrSlug', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const viewerId = req.user!.id;
    const ownerRow = await resolveTargetUser(db, req.params.idOrSlug);
    if (!ownerRow) {
      res.status(404).json({ error: 'Користувача не знайдено.' });
      return;
    }
    const targetId = Number(ownerRow.id);

    const relationship = await getRelationship(db, viewerId, targetId);
    const ratingsMode = parseVisibility(ownerRow.ratings_visibility, 'everyone');
    const notesMode = parseVisibility(ownerRow.notes_visibility, 'nobody');
    const connectionsMode = parseVisibility(ownerRow.connections_visibility, 'everyone');

    const [canViewRatings, canViewNotes, canViewConnections] = await Promise.all([
      evaluateScopeAccess(db, targetId, viewerId, ratingsMode, 'ratings', relationship.isFriend),
      evaluateScopeAccess(db, targetId, viewerId, notesMode, 'notes', relationship.isFriend),
      evaluateScopeAccess(
        db,
        targetId,
        viewerId,
        connectionsMode,
        'connections',
        relationship.isFriend
      ),
    ]);

    const profile = {
      id: Number(ownerRow.id),
      slug: ownerRow.slug ? String(ownerRow.slug) : slugifyNickname(String(ownerRow.display_name || '')),
      displayName: String(ownerRow.display_name),
      avatarUrl: ownerRow.avatar_url ? String(ownerRow.avatar_url) : null,
      bio: ownerRow.bio ? String(ownerRow.bio) : '',
      ratingsVisibility: ratingsMode,
      notesVisibility: notesMode,
      connectionsVisibility: connectionsMode,
      createdAt: String(ownerRow.created_at),
    };

    const connectionsPromise = canViewConnections
      ? db.all<Record<string, unknown>>(
          `SELECT
            u.id, u.slug, u.display_name, u.avatar_url, u.bio, u.created_at,
            EXISTS(SELECT 1 FROM user_follows tf WHERE tf.follower_id = ? AND tf.following_id = u.id) AS target_follows,
            EXISTS(SELECT 1 FROM user_follows ft WHERE ft.follower_id = u.id AND ft.following_id = ?) AS follows_target,
            EXISTS(SELECT 1 FROM user_follows vf WHERE vf.follower_id = ? AND vf.following_id = u.id) AS i_follow,
            EXISTS(SELECT 1 FROM user_follows vm WHERE vm.follower_id = u.id AND vm.following_id = ?) AS follows_me
           FROM users u
           WHERE u.id != ?
             AND (
               EXISTS(SELECT 1 FROM user_follows tf WHERE tf.follower_id = ? AND tf.following_id = u.id)
               OR EXISTS(SELECT 1 FROM user_follows ft WHERE ft.follower_id = u.id AND ft.following_id = ?)
             )
           ORDER BY lower(u.display_name) ASC`,
          [targetId, targetId, viewerId, viewerId, targetId, targetId, targetId]
        )
      : Promise.resolve([] as Record<string, unknown>[]);

    const contentPromise =
      canViewRatings || canViewNotes
        ? Promise.all([
            db.all<Record<string, unknown>>(
              `SELECT
                a.id, a.name, a.slug, a.image_url,
                (SELECT COUNT(*) FROM songs s WHERE s.artist_id = a.id) AS totalSongs,
                (SELECT COUNT(*) FROM song_ratings sr JOIN songs s ON s.id = sr.song_id WHERE s.artist_id = a.id AND sr.user_id = ?) AS ratedSongs,
                (SELECT ROUND(AVG(sr.rating), 1) FROM song_ratings sr JOIN songs s ON s.id = sr.song_id WHERE s.artist_id = a.id AND sr.user_id = ?) AS averageSongRating
               FROM user_artists ua
               JOIN artists a ON a.id = ua.artist_id
               WHERE ua.user_id = ?
               ORDER BY lower(a.name) ASC`,
              [targetId, targetId, targetId]
            ),
            db.all<Record<string, unknown>>(
              `SELECT
                s.id, s.title, s.version_tag, s.category, s.cover_url, s.spotify_url,
                a.id AS artist_id, a.name AS artist_name,
                pr.title AS release_title, pr.slug AS release_slug,
                sr.rating, sr.updated_at AS rating_updated_at,
                COALESCE(n.content_enc, '') AS note_enc, n.updated_at AS note_updated_at
               FROM user_artists ua
               JOIN songs s ON s.artist_id = ua.artist_id
               JOIN artists a ON a.id = s.artist_id
               LEFT JOIN releases pr ON pr.id = s.primary_release_id
               LEFT JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ?
               LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'song' AND n.target_id = s.id
               WHERE ua.user_id = ?
                 AND (
                   (? = 1 AND sr.rating IS NOT NULL)
                   OR (? = 1 AND n.content_enc IS NOT NULL AND n.content_enc != '')
                 )
               ORDER BY
                 CASE WHEN ? = 1 AND sr.rating IS NOT NULL THEN 0 ELSE 1 END ASC,
                 CASE WHEN ? = 1 THEN sr.rating ELSE 0 END DESC,
                 COALESCE(sr.updated_at, n.updated_at) DESC
               LIMIT 200`,
              [
                targetId,
                targetId,
                targetId,
                canViewRatings ? 1 : 0,
                canViewNotes ? 1 : 0,
                canViewRatings ? 1 : 0,
                canViewRatings ? 1 : 0,
              ]
            ),
            db.all<Record<string, unknown>>(
              `SELECT
                r.id, r.slug, r.title, r.category, r.release_type, r.release_year, r.cover_url, r.spotify_url,
                a.id AS artist_id, a.name AS artist_name,
                rr.rating, rr.updated_at AS rating_updated_at,
                COALESCE(n.content_enc, '') AS note_enc, n.updated_at AS note_updated_at
               FROM user_artists ua
               JOIN releases r ON r.artist_id = ua.artist_id
               JOIN artists a ON a.id = r.artist_id
               LEFT JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ?
               LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'release' AND n.target_id = r.id
               WHERE ua.user_id = ?
                 AND (
                   (? = 1 AND rr.rating IS NOT NULL)
                   OR (? = 1 AND n.content_enc IS NOT NULL AND n.content_enc != '')
                 )
               ORDER BY
                 CASE WHEN ? = 1 AND rr.rating IS NOT NULL THEN 0 ELSE 1 END ASC,
                 CASE WHEN ? = 1 THEN rr.rating ELSE 0 END DESC,
                 COALESCE(rr.updated_at, n.updated_at) DESC
               LIMIT 120`,
              [
                targetId,
                targetId,
                targetId,
                canViewRatings ? 1 : 0,
                canViewNotes ? 1 : 0,
                canViewRatings ? 1 : 0,
                canViewRatings ? 1 : 0,
              ]
            ),
          ])
        : Promise.resolve([[], [], []] as [
            Record<string, unknown>[],
            Record<string, unknown>[],
            Record<string, unknown>[],
          ]);

    const [connRows, [artistRows, songRows, releaseRows]] = await Promise.all([
      connectionsPromise,
      contentPromise,
    ]);

    const friendsList = canViewConnections
      ? connRows
          .filter((r) => Boolean(Number(r.target_follows || 0)) && Boolean(Number(r.follows_target || 0)))
          .map(mapPublicUserCard)
      : [];
    const followersList = canViewConnections
      ? connRows.filter((r) => Boolean(Number(r.follows_target || 0))).map(mapPublicUserCard)
      : [];
    const followingList = canViewConnections
      ? connRows.filter((r) => Boolean(Number(r.target_follows || 0))).map(mapPublicUserCard)
      : [];

    res.json({
      profile,
      counts: {
        friends: friendsList.length,
        followers: followersList.length,
        following: followingList.length,
      },
      relationship,
      canViewRatings,
      canViewNotes,
      canViewConnections,
      connections: {
        friends: friendsList,
        followers: followersList,
        following: followingList,
      },
      artists: artistRows.map((a) => ({
        id: Number(a.id),
        name: String(a.name),
        slug: String(a.slug),
        image_url: a.image_url ? String(a.image_url) : null,
        totalSongs: Number(a.totalSongs || 0),
        ratedSongs: canViewRatings ? Number(a.ratedSongs || 0) : 0,
        averageSongRating:
          canViewRatings && a.averageSongRating !== null ? Number(a.averageSongRating) : null,
      })),
      ratedSongs: songRows.map((s) => ({
        id: Number(s.id),
        title: String(s.title),
        version_tag: s.version_tag ? String(s.version_tag) : null,
        category: String(s.category),
        cover_url: s.cover_url ? String(s.cover_url) : null,
        spotify_url: s.spotify_url ? String(s.spotify_url) : null,
        artist_id: Number(s.artist_id),
        artist_name: String(s.artist_name),
        release_title: s.release_title ? String(s.release_title) : null,
        release_slug: s.release_slug ? String(s.release_slug) : null,
        rating: canViewRatings && s.rating !== null ? Number(s.rating) : null,
        note: canViewNotes && s.note_enc ? decryptText(String(s.note_enc)) : null,
        updatedAt: String(s.rating_updated_at || s.note_updated_at || ''),
      })),
      ratedReleases: releaseRows.map((r) => ({
        id: Number(r.id),
        slug: String(r.slug),
        title: String(r.title),
        category: String(r.category),
        release_type: String(r.release_type),
        release_year: r.release_year !== null ? Number(r.release_year) : null,
        cover_url: r.cover_url ? String(r.cover_url) : null,
        spotify_url: r.spotify_url ? String(r.spotify_url) : null,
        artist_id: Number(r.artist_id),
        artist_name: String(r.artist_name),
        rating: canViewRatings && r.rating !== null ? Number(r.rating) : null,
        note: canViewNotes && r.note_enc ? decryptText(String(r.note_enc)) : null,
        updatedAt: String(r.rating_updated_at || r.note_updated_at || ''),
      })),
    });
  });

  return router;
}
