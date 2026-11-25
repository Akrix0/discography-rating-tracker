import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getDb, getUserSetting, ROOT_DIR, setUserSetting, type Db } from './db.ts';
import { importCatalogData } from './importer.ts';
import { attachUserMiddleware, createAuthRouter, requireAuth } from './routes/auth.ts';
import { searchArtistCandidates } from './services/artistSearch.ts';
import { getJobStatus, startArtistImportJob } from './services/catalogBuilder.ts';
import { decryptText, encryptText } from './services/security.ts';
import { hasSpotifyCredentials, verifySpotifyCredentials } from './services/spotifyApi.ts';
import {
  CATEGORIES,
  DEFAULT_IMPORT_PREFS,
  type ArtistSummary,
  type LinkedReleaseSummary,
  type ReleaseDTO,
  type SongDTO,
} from './types.ts';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        frameSrc: ["'self'", 'https://open.spotify.com'],
        connectSrc: ["'self'", 'https://open.spotify.com'],
      },
    },
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(attachUserMiddleware(getDb));

function parseRatingInput(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 100) {
    return 'invalid';
  }
  return num;
}

function parseArtistIdParam(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '' || raw === 'all') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function hydrateSongs(db: Db, rows: Record<string, unknown>[]): Promise<SongDTO[]> {
  if (rows.length === 0) return [];
  const songIds = rows.map((r) => Number(r.id));
  const placeholders = songIds.map(() => '?').join(',');
  const relRows = await db.all<Record<string, unknown>>(
    `
    SELECT
      rs.song_id,
      rs.track_number,
      rs.disc_number,
      r.id,
      r.slug,
      r.title,
      r.category,
      r.release_type,
      r.release_date,
      r.release_year,
      r.cover_url,
      r.spotify_url
    FROM release_songs rs
    JOIN releases r ON r.id = rs.release_id
    WHERE rs.song_id IN (${placeholders})
    ORDER BY
      CASE r.category
        WHEN 'Studio Albums' THEN 1
        WHEN 'EPs' THEN 2
        WHEN 'Singles' THEN 3
        ELSE 4
      END ASC,
      r.release_year ASC,
      rs.track_number ASC
  `,
    songIds
  );

  const relMap = new Map<number, LinkedReleaseSummary[]>();
  for (const rr of relRows) {
    const sid = Number(rr.song_id);
    if (!relMap.has(sid)) relMap.set(sid, []);
    relMap.get(sid)!.push({
      id: Number(rr.id),
      slug: String(rr.slug),
      title: String(rr.title),
      category: rr.category as LinkedReleaseSummary['category'],
      release_type: rr.release_type as LinkedReleaseSummary['release_type'],
      release_date: rr.release_date ? String(rr.release_date) : null,
      release_year: rr.release_year !== null ? Number(rr.release_year) : null,
      cover_url: rr.cover_url ? String(rr.cover_url) : null,
      spotify_url: rr.spotify_url ? String(rr.spotify_url) : null,
      track_number: Number(rr.track_number),
      disc_number: Number(rr.disc_number),
    });
  }

  return rows.map((r) => {
    const id = Number(r.id);
    return {
      id,
      artist_id: Number(r.artist_id),
      artist_name: String(r.artist_name || ''),
      artist_slug: String(r.artist_slug || ''),
      canonical_key: String(r.canonical_key),
      title: String(r.title),
      version_tag: r.version_tag ? String(r.version_tag) : null,
      category: r.category as SongDTO['category'],
      is_alt_or_secondary: Boolean(r.is_alt_or_secondary),
      primary_release_id: r.primary_release_id !== null ? Number(r.primary_release_id) : null,
      primary_release_title: r.primary_release_title ? String(r.primary_release_title) : null,
      primary_release_slug: r.primary_release_slug ? String(r.primary_release_slug) : null,
      primary_release_date: r.primary_release_date ? String(r.primary_release_date) : null,
      primary_release_year:
        r.primary_release_year !== null && r.primary_release_year !== undefined
          ? Number(r.primary_release_year)
          : null,
      primary_release_type: r.primary_release_type
        ? (String(r.primary_release_type) as SongDTO['primary_release_type'])
        : null,
      duration_ms: r.duration_ms !== null ? Number(r.duration_ms) : null,
      cover_url: r.cover_url ? String(r.cover_url) : null,
      spotify_id: r.spotify_id ? String(r.spotify_id) : null,
      spotify_url: r.spotify_url ? String(r.spotify_url) : null,
      is_explicit: Boolean(r.is_explicit),
      is_verified: Boolean(r.is_verified),
      verification_note: r.verification_note ? String(r.verification_note) : null,
      created_at: String(r.created_at),
      rating: r.rating !== null && r.rating !== undefined ? Number(r.rating) : null,
      rating_updated_at: r.rating_updated_at ? String(r.rating_updated_at) : null,
      note: decryptText(r.note_enc ? String(r.note_enc) : ''),
      note_updated_at: r.note_updated_at ? String(r.note_updated_at) : null,
      releases: relMap.get(id) || [],
    };
  });
}

function mapReleaseRows(rows: Record<string, unknown>[]): ReleaseDTO[] {
  return rows.map((r) => ({
    id: Number(r.id),
    artist_id: Number(r.artist_id),
    artist_name: String(r.artist_name || ''),
    artist_slug: String(r.artist_slug || ''),
    slug: String(r.slug),
    title: String(r.title),
    category: r.category as ReleaseDTO['category'],
    release_type: r.release_type as ReleaseDTO['release_type'],
    release_date: r.release_date ? String(r.release_date) : null,
    release_year: r.release_year !== null ? Number(r.release_year) : null,
    cover_url: r.cover_url ? String(r.cover_url) : null,
    spotify_id: r.spotify_id ? String(r.spotify_id) : null,
    spotify_url: r.spotify_url ? String(r.spotify_url) : null,
    is_alt_or_secondary: Boolean(r.is_alt_or_secondary),
    is_verified: Boolean(r.is_verified),
    verification_note: r.verification_note ? String(r.verification_note) : null,
    created_at: String(r.created_at),
    rating: r.rating !== null && r.rating !== undefined ? Number(r.rating) : null,
    rating_updated_at: r.rating_updated_at ? String(r.rating_updated_at) : null,
    note: decryptText(r.note_enc ? String(r.note_enc) : ''),
    note_updated_at: r.note_updated_at ? String(r.note_updated_at) : null,
    track_count: Number(r.track_count || 0),
    rated_track_count: Number(r.rated_track_count || 0),
    average_track_rating:
      r.average_track_rating !== null && r.average_track_rating !== undefined
        ? Number(r.average_track_rating)
        : null,
  }));
}

async function queryArtistsSummary(db: Db, userId: number): Promise<ArtistSummary[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT
      a.*,
      (SELECT COUNT(*) FROM releases r WHERE r.artist_id = a.id) AS totalReleases,
      (
        SELECT COUNT(*) FROM releases r
        JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ? AND rr.rating IS NOT NULL
        WHERE r.artist_id = a.id
      ) AS ratedReleases,
      (SELECT COUNT(*) FROM songs s WHERE s.artist_id = a.id) AS totalSongs,
      (
        SELECT COUNT(*) FROM songs s
        JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE s.artist_id = a.id
      ) AS ratedSongs,
      (
        SELECT ROUND(AVG(sr.rating), 1) FROM songs s
        JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE s.artist_id = a.id
      ) AS averageSongRating,
      (
        SELECT ROUND(AVG(rr.rating), 1) FROM releases r
        JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ? AND rr.rating IS NOT NULL
        WHERE r.artist_id = a.id
      ) AS averageReleaseRating
    FROM artists a
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    ORDER BY ua.added_at ASC, a.id ASC`,
    [userId, userId, userId, userId, userId]
  );

  return rows.map((r) => {
    const totalSongs = Number(r.totalSongs || 0);
    const ratedSongs = Number(r.ratedSongs || 0);
    const completionPercent = totalSongs > 0 ? Math.round((ratedSongs / totalSongs) * 1000) / 10 : 0;
    let prefs = DEFAULT_IMPORT_PREFS;
    if (r.import_prefs_json) {
      try {
        prefs = { ...DEFAULT_IMPORT_PREFS, ...JSON.parse(String(r.import_prefs_json)) };
      } catch {
        prefs = DEFAULT_IMPORT_PREFS;
      }
    }
    return {
      id: Number(r.id),
      slug: String(r.slug),
      name: String(r.name),
      image_url: r.image_url ? String(r.image_url) : null,
      spotify_id: r.spotify_id ? String(r.spotify_id) : null,
      spotify_url: r.spotify_url ? String(r.spotify_url) : null,
      mb_id: r.mb_id ? String(r.mb_id) : null,
      deezer_id: r.deezer_id ? String(r.deezer_id) : null,
      itunes_id: r.itunes_id ? String(r.itunes_id) : null,
      import_prefs: prefs,
      last_synced_at: r.last_synced_at ? String(r.last_synced_at) : null,
      created_at: String(r.created_at),
      totalReleases: Number(r.totalReleases || 0),
      ratedReleases: Number(r.ratedReleases || 0),
      totalSongs,
      ratedSongs,
      completionPercent,
      averageSongRating: r.averageSongRating !== null ? Number(r.averageSongRating) : null,
      averageReleaseRating: r.averageReleaseRating !== null ? Number(r.averageReleaseRating) : null,
    };
  });
}

// Public health check
app.get('/api/health', async (_req, res) => {
  const db = await getDb();
  const counts = await db.get(
    `SELECT
      (SELECT COUNT(*) FROM artists) AS artists,
      (SELECT COUNT(*) FROM releases) AS releases,
      (SELECT COUNT(*) FROM songs) AS songs`
  );
  res.json({ ok: true, ...counts });
});

// Auth routes
app.use('/api/auth', createAuthRouter(getDb));

// Protected user routes
app.get('/api/artists', requireAuth, async (req, res) => {
  const db = await getDb();
  res.json({ artists: await queryArtistsSummary(db, req.user!.id) });
});

app.get('/api/artists/search', requireAuth, async (req, res) => {
  const db = await getDb();
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ candidates: [] });
    return;
  }
  try {
    const candidates = await searchArtistCandidates(db, q, req.user!.id);
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Помилка пошуку виконавця' });
  }
});

app.post('/api/artists/import', requireAuth, async (req, res) => {
  const db = await getDb();
  const { name, spotifyUrl, spotifyId, mbId, deezerId, itunesId, imageUrl, prefs } = req.body || {};
  if (!name && !spotifyUrl && !spotifyId) {
    res.status(400).json({ error: 'Вкажіть назву виконавця або посилання на Spotify.' });
    return;
  }
  const jobId = startArtistImportJob(db, {
    userId: req.user!.id,
    name,
    spotifyUrl,
    spotifyId,
    mbId,
    deezerId,
    itunesId,
    imageUrl,
    prefs,
  });
  res.json({ jobId });
});

app.post('/api/artists/:id/sync', requireAuth, async (req, res) => {
  const db = await getDb();
  const artistId = Number(req.params.id);
  const exists = await db.get('SELECT 1 FROM user_artists WHERE user_id = ? AND artist_id = ?', [
    req.user!.id,
    artistId,
  ]);
  if (!exists) {
    res.status(404).json({ error: 'Виконавця не знайдено у вашій бібліотеці.' });
    return;
  }
  const jobId = startArtistImportJob(db, {
    userId: req.user!.id,
    artistId,
    prefs: req.body?.prefs,
  });
  res.json({ jobId });
});

app.get('/api/jobs/:jobId', requireAuth, (req, res) => {
  const job = getJobStatus(String(req.params.jobId), req.user!.id);
  if (!job) {
    res.status(404).json({ error: 'Задачу не знайдено.' });
    return;
  }
  res.json(job);
});

app.delete('/api/artists/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const artistId = Number(req.params.id);
  const info = await db.run('DELETE FROM user_artists WHERE user_id = ? AND artist_id = ?', [
    userId,
    artistId,
  ]);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Виконавця не знайдено.' });
    return;
  }
  // Remove this user's personal ratings & notes for this artist's items
  await db.run(
    `DELETE FROM song_ratings WHERE user_id = ? AND song_id IN (SELECT id FROM songs WHERE artist_id = ?)`,
    [userId, artistId]
  );
  await db.run(
    `DELETE FROM release_ratings WHERE user_id = ? AND release_id IN (SELECT id FROM releases WHERE artist_id = ?)`,
    [userId, artistId]
  );
  await db.run(
    `DELETE FROM notes WHERE user_id = ? AND target_type = 'song' AND target_id IN (SELECT id FROM songs WHERE artist_id = ?)`,
    [userId, artistId]
  );
  await db.run(
    `DELETE FROM notes WHERE user_id = ? AND target_type = 'release' AND target_id IN (SELECT id FROM releases WHERE artist_id = ?)`,
    [userId, artistId]
  );
  res.json({ ok: true, deletedArtistId: artistId });
});

app.get('/api/global/stats', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const artists = await queryArtistsSummary(db, userId);
  const totalArtists = artists.length;
  const totalSongs = artists.reduce((sum, a) => sum + a.totalSongs, 0);
  const ratedSongs = artists.reduce((sum, a) => sum + a.ratedSongs, 0);
  const totalReleases = artists.reduce((sum, a) => sum + a.totalReleases, 0);
  const ratedReleases = artists.reduce((sum, a) => sum + a.ratedReleases, 0);

  const avgRow = await db.get<{ overallAvgSong: number | null; overallAvgRelease: number | null }>(
    `SELECT
      (
        SELECT ROUND(AVG(sr.rating), 1)
        FROM song_ratings sr
        JOIN songs s ON s.id = sr.song_id
        JOIN user_artists ua ON ua.artist_id = s.artist_id AND ua.user_id = ?
        WHERE sr.user_id = ? AND sr.rating IS NOT NULL
      ) AS overallAvgSong,
      (
        SELECT ROUND(AVG(rr.rating), 1)
        FROM release_ratings rr
        JOIN releases r ON r.id = rr.release_id
        JOIN user_artists ua ON ua.artist_id = r.artist_id AND ua.user_id = ?
        WHERE rr.user_id = ? AND rr.rating IS NOT NULL
      ) AS overallAvgRelease`,
    [userId, userId, userId, userId]
  );

  const globalTopSongsRaw = await db.all<Record<string, unknown>>(
    `SELECT
      s.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      pr.title AS primary_release_title,
      pr.slug AS primary_release_slug,
      pr.release_date AS primary_release_date,
      pr.release_year AS primary_release_year,
      pr.release_type AS primary_release_type,
      sr.rating,
      sr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at
    FROM songs s
    JOIN artists a ON a.id = s.artist_id
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ? AND sr.rating IS NOT NULL
    LEFT JOIN releases pr ON pr.id = s.primary_release_id
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'song' AND n.target_id = s.id
    ORDER BY sr.rating DESC, sr.updated_at DESC
    LIMIT 15`,
    [userId, userId, userId]
  );

  const globalTopAlbumsRaw = await db.all<Record<string, unknown>>(
    `SELECT
      r.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      rr.rating,
      rr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at,
      (SELECT COUNT(*) FROM release_songs rs WHERE rs.release_id = r.id) AS track_count,
      (
        SELECT COUNT(*) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS rated_track_count,
      (
        SELECT ROUND(AVG(sr.rating), 1) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS average_track_rating
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ? AND rr.rating IS NOT NULL
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'release' AND n.target_id = r.id
    ORDER BY rr.rating DESC, rr.updated_at DESC
    LIMIT 12`,
    [userId, userId, userId, userId, userId]
  );

  const artistLeaderboard = [...artists].sort((a, b) => {
    const scoreA = a.averageSongRating ?? a.averageReleaseRating ?? -1;
    const scoreB = b.averageSongRating ?? b.averageReleaseRating ?? -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.ratedSongs - a.ratedSongs;
  });

  res.json({
    totalArtists,
    totalSongs,
    ratedSongs,
    completionPercent: totalSongs > 0 ? Math.round((ratedSongs / totalSongs) * 1000) / 10 : 0,
    totalReleases,
    ratedReleases,
    overallAverageSongRating: avgRow?.overallAvgSong ?? null,
    overallAverageReleaseRating: avgRow?.overallAvgRelease ?? null,
    artistLeaderboard,
    globalTopSongs: await hydrateSongs(db, globalTopSongsRaw),
    globalTopAlbums: mapReleaseRows(globalTopAlbumsRaw),
  });
});

app.get('/api/filters/meta', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const artistId = parseArtistIdParam(req.query.artistId);
  const hideSecondary = req.query.hideSecondary === '1';

  const relWhere: string[] = ['EXISTS (SELECT 1 FROM user_artists ua WHERE ua.artist_id = r.artist_id AND ua.user_id = ?)'];
  const relParams: (string | number)[] = [userId];
  if (artistId) {
    relWhere.push('r.artist_id = ?');
    relParams.push(artistId);
  }
  if (hideSecondary) {
    relWhere.push('r.is_alt_or_secondary = 0');
  }

  const years = (
    await db.all<{ year: number }>(
      `SELECT DISTINCT r.release_year AS year FROM releases r
       WHERE ${relWhere.join(' AND ')} AND r.release_year IS NOT NULL
       ORDER BY r.release_year DESC`,
      relParams
    )
  ).map((r) => Number(r.year));

  const songCatCounts = await Promise.all(
    CATEGORIES.map(async (cat) => {
      const conds = [
        'EXISTS (SELECT 1 FROM user_artists ua WHERE ua.artist_id = s.artist_id AND ua.user_id = ?)',
        `(s.category = ? OR EXISTS (
          SELECT 1 FROM release_songs rs JOIN releases r ON r.id = rs.release_id
          WHERE rs.song_id = s.id AND r.category = ?
        ))`,
      ];
      const params: (string | number)[] = [userId, cat, cat];
      if (artistId) {
        conds.push('s.artist_id = ?');
        params.push(artistId);
      }
      if (hideSecondary) {
        conds.push('s.is_alt_or_secondary = 0');
      }
      const row = await db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM songs s WHERE ${conds.join(' AND ')}`,
        params
      );
      return { category: cat, count: Number(row?.count || 0) };
    })
  );

  const relCatCounts = await db.all<{ category: string; count: number }>(
    `SELECT r.category, COUNT(*) AS count FROM releases r
     WHERE ${relWhere.join(' AND ')} GROUP BY r.category`,
    relParams
  );

  const releaseTypes = await db.all<{ release_type: string; count: number }>(
    `SELECT r.release_type, COUNT(*) AS count FROM releases r
     WHERE ${relWhere.join(' AND ')} GROUP BY r.release_type ORDER BY count DESC`,
    relParams
  );

  res.json({
    categories: CATEGORIES,
    years,
    songCategoryCounts: Object.fromEntries(songCatCounts.map((c) => [c.category, c.count])),
    releaseCategoryCounts: Object.fromEntries(relCatCounts.map((c) => [c.category, Number(c.count)])),
    releaseTypes: releaseTypes.map((rt) => ({
      release_type: rt.release_type,
      count: Number(rt.count),
    })),
  });
});

app.get('/api/stats', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const artistId = parseArtistIdParam(req.query.artistId);

  const scopeSong = artistId
    ? 'JOIN user_artists ua ON ua.artist_id = s.artist_id AND ua.user_id = ? WHERE s.artist_id = ?'
    : 'JOIN user_artists ua ON ua.artist_id = s.artist_id AND ua.user_id = ?';
  const scopeRel = artistId
    ? 'JOIN user_artists ua ON ua.artist_id = r.artist_id AND ua.user_id = ? WHERE r.artist_id = ?'
    : 'JOIN user_artists ua ON ua.artist_id = r.artist_id AND ua.user_id = ?';
  const scopeParams = artistId ? [userId, artistId] : [userId];

  const songStats = (await db.get<{
    totalSongs: number;
    ratedSongs: number;
    averageSongRating: number | null;
  }>(
    `SELECT
      COUNT(*) AS totalSongs,
      COUNT(sr.rating) AS ratedSongs,
      ROUND(AVG(sr.rating), 1) AS averageSongRating
    FROM songs s
    LEFT JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ? AND sr.rating IS NOT NULL
    ${scopeSong}`,
    [userId, ...scopeParams]
  )) || { totalSongs: 0, ratedSongs: 0, averageSongRating: null };

  const releaseStats = (await db.get<{
    totalReleases: number;
    ratedReleases: number;
    averageReleaseRating: number | null;
  }>(
    `SELECT
      COUNT(*) AS totalReleases,
      COUNT(rr.rating) AS ratedReleases,
      ROUND(AVG(rr.rating), 1) AS averageReleaseRating
    FROM releases r
    LEFT JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ? AND rr.rating IS NOT NULL
    ${scopeRel}`,
    [userId, ...scopeParams]
  )) || { totalReleases: 0, ratedReleases: 0, averageReleaseRating: null };

  const totalSongsNum = Number(songStats.totalSongs || 0);
  const ratedSongsNum = Number(songStats.ratedSongs || 0);
  const totalRelNum = Number(releaseStats.totalReleases || 0);
  const ratedRelNum = Number(releaseStats.ratedReleases || 0);

  const completionPercent =
    totalSongsNum > 0 ? Math.round((ratedSongsNum / totalSongsNum) * 1000) / 10 : 0;
  const releaseCompletionPercent =
    totalRelNum > 0 ? Math.round((ratedRelNum / totalRelNum) * 1000) / 10 : 0;

  const categoryBreakdown = await db.all<{
    category: string;
    total: number;
    rated: number;
    avgRating: number | null;
  }>(
    `SELECT
      s.category,
      COUNT(*) AS total,
      COUNT(sr.rating) AS rated,
      ROUND(AVG(sr.rating), 1) AS avgRating
    FROM songs s
    LEFT JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ? AND sr.rating IS NOT NULL
    ${scopeSong}
    GROUP BY s.category`,
    [userId, ...scopeParams]
  );

  const catMap = new Map(categoryBreakdown.map((c) => [c.category, c]));
  const orderedCategories = CATEGORIES.map((cat) => ({
    category: cat,
    total: Number(catMap.get(cat)?.total ?? 0),
    rated: Number(catMap.get(cat)?.rated ?? 0),
    avgRating: catMap.get(cat)?.avgRating !== undefined && catMap.get(cat)?.avgRating !== null
      ? Number(catMap.get(cat)!.avgRating)
      : null,
  }));

  const topSongsRaw = await db.all<Record<string, unknown>>(
    `SELECT
      s.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      pr.title AS primary_release_title,
      pr.slug AS primary_release_slug,
      pr.release_date AS primary_release_date,
      pr.release_year AS primary_release_year,
      pr.release_type AS primary_release_type,
      sr.rating,
      sr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at
    FROM songs s
    JOIN artists a ON a.id = s.artist_id
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ? AND sr.rating IS NOT NULL
    LEFT JOIN releases pr ON pr.id = s.primary_release_id
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'song' AND n.target_id = s.id
    ${artistId ? 'WHERE s.artist_id = ?' : ''}
    ORDER BY sr.rating DESC, sr.updated_at DESC
    LIMIT 10`,
    artistId ? [userId, userId, userId, artistId] : [userId, userId, userId]
  );

  const topAlbumsRaw = await db.all<Record<string, unknown>>(
    `SELECT
      r.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      rr.rating,
      rr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at,
      (SELECT COUNT(*) FROM release_songs rs WHERE rs.release_id = r.id) AS track_count,
      (
        SELECT COUNT(*) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS rated_track_count,
      (
        SELECT ROUND(AVG(sr.rating), 1) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS average_track_rating
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ? AND rr.rating IS NOT NULL
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'release' AND n.target_id = r.id
    ${artistId ? 'WHERE r.artist_id = ?' : ''}
    ORDER BY
      CASE WHEN r.category = 'Studio Albums' THEN 0 ELSE 1 END ASC,
      rr.rating DESC,
      rr.updated_at DESC
    LIMIT 8`,
    artistId ? [userId, userId, userId, userId, userId, artistId] : [userId, userId, userId, userId, userId]
  );

  const nextUnratedRaw = await db.all<Record<string, unknown>>(
    `SELECT
      s.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      pr.title AS primary_release_title,
      pr.slug AS primary_release_slug,
      pr.release_date AS primary_release_date,
      pr.release_year AS primary_release_year,
      pr.release_type AS primary_release_type,
      NULL AS rating,
      NULL AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at
    FROM songs s
    JOIN artists a ON a.id = s.artist_id
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    LEFT JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ?
    LEFT JOIN releases pr ON pr.id = s.primary_release_id
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'song' AND n.target_id = s.id
    WHERE sr.rating IS NULL
    ${artistId ? 'AND s.artist_id = ?' : ''}
    ORDER BY
      CASE WHEN s.spotify_id IS NOT NULL THEN 0 ELSE 1 END ASC,
      s.is_alt_or_secondary ASC,
      CASE WHEN s.category = 'Studio Albums' THEN 0 ELSE 1 END ASC,
      pr.release_year DESC,
      s.id ASC
    LIMIT 5`,
    artistId ? [userId, userId, userId, artistId] : [userId, userId, userId]
  );

  res.json({
    totalSongs: totalSongsNum,
    ratedSongs: ratedSongsNum,
    completionPercent,
    averageSongRating:
      songStats.averageSongRating !== null ? Number(songStats.averageSongRating) : null,
    totalReleases: totalRelNum,
    ratedReleases: ratedRelNum,
    releaseCompletionPercent,
    averageReleaseRating:
      releaseStats.averageReleaseRating !== null ? Number(releaseStats.averageReleaseRating) : null,
    categoryBreakdown: orderedCategories,
    topSongs: await hydrateSongs(db, topSongsRaw),
    topAlbums: mapReleaseRows(topAlbumsRaw),
    nextUnratedSongs: await hydrateSongs(db, nextUnratedRaw),
  });
});

app.get('/api/songs', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const artistId = parseArtistIdParam(req.query.artistId);
  const hideSecondary = req.query.hideSecondary === '1';
  const q = String(req.query.q || '').trim();
  const categories = String(req.query.categories || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const releaseTypes = String(req.query.releaseTypes || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ratedStatus = String(req.query.ratedStatus || 'all');
  const minRating =
    req.query.minRating !== undefined && req.query.minRating !== '' ? Number(req.query.minRating) : null;
  const maxRating =
    req.query.maxRating !== undefined && req.query.maxRating !== '' ? Number(req.query.maxRating) : null;
  const year = req.query.year !== undefined && req.query.year !== '' ? Number(req.query.year) : null;
  const sortBy = String(req.query.sortBy || 'release_date');
  const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where: string[] = ['1=1'];
  const params: (string | number)[] = [userId, userId, userId];

  if (artistId) {
    where.push('s.artist_id = ?');
    params.push(artistId);
  }
  if (hideSecondary) {
    where.push('s.is_alt_or_secondary = 0');
  }

  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(`(
      lower(s.title) LIKE ?
      OR lower(a.name) LIKE ?
      OR lower(COALESCE(s.version_tag, '')) LIKE ?
      OR lower(s.category) LIKE ?
      OR EXISTS (
        SELECT 1 FROM release_songs rs2
        JOIN releases r2 ON r2.id = rs2.release_id
        WHERE rs2.song_id = s.id AND (
          lower(r2.title) LIKE ? OR lower(r2.category) LIKE ? OR lower(r2.release_type) LIKE ?
        )
      )
    )`);
    params.push(like, like, like, like, like, like, like);
  }

  if (categories.length > 0) {
    const ph = categories.map(() => '?').join(',');
    where.push(`(
      s.category IN (${ph})
      OR EXISTS (
        SELECT 1 FROM release_songs rs_cat
        JOIN releases r_cat ON r_cat.id = rs_cat.release_id
        WHERE rs_cat.song_id = s.id AND r_cat.category IN (${ph})
      )
    )`);
    params.push(...categories, ...categories);
  }

  if (releaseTypes.length > 0) {
    const ph = releaseTypes.map(() => '?').join(',');
    where.push(`EXISTS (
      SELECT 1 FROM release_songs rs_rt
      JOIN releases r_rt ON r_rt.id = rs_rt.release_id
      WHERE rs_rt.song_id = s.id AND r_rt.release_type IN (${ph})
    )`);
    params.push(...releaseTypes);
  }

  if (ratedStatus === 'rated') {
    where.push('sr.rating IS NOT NULL');
  } else if (ratedStatus === 'unrated') {
    where.push('sr.rating IS NULL');
  }

  if (minRating !== null && !Number.isNaN(minRating) && minRating > 0) {
    where.push('sr.rating IS NOT NULL AND sr.rating >= ?');
    params.push(minRating);
  }
  if (maxRating !== null && !Number.isNaN(maxRating) && maxRating < 100) {
    where.push('sr.rating IS NOT NULL AND sr.rating <= ?');
    params.push(maxRating);
  }

  if (year !== null && !Number.isNaN(year)) {
    where.push(`(
      pr.release_year = ?
      OR EXISTS (
        SELECT 1 FROM release_songs rs_y
        JOIN releases r_y ON r_y.id = rs_y.release_id
        WHERE rs_y.song_id = s.id AND r_y.release_year = ?
      )
    )`);
    params.push(year, year);
  }

  let orderClause = '';
  switch (sortBy) {
    case 'title':
      orderClause = `lower(s.title) ${sortDir}, lower(COALESCE(s.version_tag, '')) ${sortDir}`;
      break;
    case 'rating':
      orderClause = `CASE WHEN sr.rating IS NULL THEN 1 ELSE 0 END ASC, sr.rating ${sortDir}, lower(s.title) ASC`;
      break;
    case 'created_at':
      orderClause = `s.created_at ${sortDir}, s.id ${sortDir}`;
      break;
    case 'release_date':
    default:
      orderClause = `CASE WHEN pr.release_date IS NULL AND pr.release_year IS NULL THEN 1 ELSE 0 END ASC, COALESCE(pr.release_date, printf('%04d-01-01', pr.release_year)) ${sortDir}, lower(s.title) ASC`;
      break;
  }

  const sql = `
    SELECT
      s.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      pr.title AS primary_release_title,
      pr.slug AS primary_release_slug,
      pr.release_date AS primary_release_date,
      pr.release_year AS primary_release_year,
      pr.release_type AS primary_release_type,
      sr.rating,
      sr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at
    FROM songs s
    JOIN artists a ON a.id = s.artist_id
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    LEFT JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ?
    LEFT JOIN releases pr ON pr.id = s.primary_release_id
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'song' AND n.target_id = s.id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderClause}
  `;

  const rows = await db.all<Record<string, unknown>>(sql, params);
  const songs = await hydrateSongs(db, rows);

  res.json({ total: songs.length, songs });
});

app.put('/api/songs/:id/rating', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const songId = Number(req.params.id);
  const parsed = parseRatingInput(req.body?.rating);
  if (parsed === 'invalid' || !Number.isInteger(songId)) {
    res.status(400).json({ error: 'Оцінка повинна бути цілим числом від 0 до 100 або null.' });
    return;
  }

  const exists = await db.get('SELECT id FROM songs WHERE id = ?', [songId]);
  if (!exists) {
    res.status(404).json({ error: 'Композицію не знайдено.' });
    return;
  }

  const now = new Date().toISOString();
  if (parsed === null) {
    await db.run('DELETE FROM song_ratings WHERE user_id = ? AND song_id = ?', [userId, songId]);
    res.json({ songId, rating: null, updatedAt: now });
    return;
  }

  await db.run(
    `INSERT INTO song_ratings (user_id, song_id, rating, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, song_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`,
    [userId, songId, parsed, now]
  );
  res.json({ songId, rating: parsed, updatedAt: now });
});

app.put('/api/songs/:id/note', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const songId = Number(req.params.id);
  const note = typeof req.body?.note === 'string' ? req.body.note : '';

  const exists = await db.get('SELECT id FROM songs WHERE id = ?', [songId]);
  if (!exists) {
    res.status(404).json({ error: 'Композицію не знайдено.' });
    return;
  }

  const now = new Date().toISOString();
  if (note.trim() === '') {
    await db.run(`DELETE FROM notes WHERE user_id = ? AND target_type = 'song' AND target_id = ?`, [
      userId,
      songId,
    ]);
    res.json({ songId, note: '', updatedAt: now });
    return;
  }

  await db.run(
    `INSERT INTO notes (user_id, target_type, target_id, content_enc, updated_at)
     VALUES (?, 'song', ?, ?, ?)
     ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET content_enc = excluded.content_enc, updated_at = excluded.updated_at`,
    [userId, songId, encryptText(note), now]
  );
  res.json({ songId, note, updatedAt: now });
});

app.get('/api/releases', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const artistId = parseArtistIdParam(req.query.artistId);
  const hideSecondary = req.query.hideSecondary === '1';
  const q = String(req.query.q || '').trim();
  const categories = String(req.query.categories || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const releaseTypes = String(req.query.releaseTypes || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ratedStatus = String(req.query.ratedStatus || 'all');
  const minRating =
    req.query.minRating !== undefined && req.query.minRating !== '' ? Number(req.query.minRating) : null;
  const maxRating =
    req.query.maxRating !== undefined && req.query.maxRating !== '' ? Number(req.query.maxRating) : null;
  const year = req.query.year !== undefined && req.query.year !== '' ? Number(req.query.year) : null;
  const sortBy = String(req.query.sortBy || 'release_date');
  const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where: string[] = ['1=1'];
  const params: (string | number)[] = [userId, userId, userId, userId, userId];

  if (artistId) {
    where.push('r.artist_id = ?');
    params.push(artistId);
  }
  if (hideSecondary) {
    where.push('r.is_alt_or_secondary = 0');
  }
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(
      `(lower(r.title) LIKE ? OR lower(a.name) LIKE ? OR lower(r.category) LIKE ? OR lower(r.release_type) LIKE ?)`
    );
    params.push(like, like, like, like);
  }
  if (categories.length > 0) {
    where.push(`r.category IN (${categories.map(() => '?').join(',')})`);
    params.push(...categories);
  }
  if (releaseTypes.length > 0) {
    where.push(`r.release_type IN (${releaseTypes.map(() => '?').join(',')})`);
    params.push(...releaseTypes);
  }
  if (ratedStatus === 'rated') {
    where.push('rr.rating IS NOT NULL');
  } else if (ratedStatus === 'unrated') {
    where.push('rr.rating IS NULL');
  }
  if (minRating !== null && !Number.isNaN(minRating) && minRating > 0) {
    where.push('rr.rating IS NOT NULL AND rr.rating >= ?');
    params.push(minRating);
  }
  if (maxRating !== null && !Number.isNaN(maxRating) && maxRating < 100) {
    where.push('rr.rating IS NOT NULL AND rr.rating <= ?');
    params.push(maxRating);
  }
  if (year !== null && !Number.isNaN(year)) {
    where.push('r.release_year = ?');
    params.push(year);
  }

  let orderClause = '';
  switch (sortBy) {
    case 'title':
      orderClause = `lower(r.title) ${sortDir}`;
      break;
    case 'rating':
      orderClause = `CASE WHEN rr.rating IS NULL THEN 1 ELSE 0 END ASC, rr.rating ${sortDir}, lower(r.title) ASC`;
      break;
    case 'created_at':
      orderClause = `r.created_at ${sortDir}, r.id ${sortDir}`;
      break;
    case 'release_date':
    default:
      orderClause = `CASE WHEN r.release_date IS NULL AND r.release_year IS NULL THEN 1 ELSE 0 END ASC, COALESCE(r.release_date, printf('%04d-01-01', r.release_year)) ${sortDir}, lower(r.title) ASC`;
      break;
  }

  const sql = `
    SELECT
      r.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      rr.rating,
      rr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at,
      (SELECT COUNT(*) FROM release_songs rs WHERE rs.release_id = r.id) AS track_count,
      (
        SELECT COUNT(*) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS rated_track_count,
      (
        SELECT ROUND(AVG(sr.rating), 1) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS average_track_rating
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
    LEFT JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ?
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'release' AND n.target_id = r.id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderClause}
  `;

  const rows = await db.all<Record<string, unknown>>(sql, params);
  const releases = mapReleaseRows(rows);
  res.json({ total: releases.length, releases });
});

app.get('/api/releases/:idOrSlug', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const key = String(req.params.idOrSlug);
  const isNum = /^\d+$/.test(key);

  const relRow = await db.get<Record<string, unknown>>(
    `
    SELECT
      r.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      rr.rating,
      rr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at,
      (SELECT COUNT(*) FROM release_songs rs WHERE rs.release_id = r.id) AS track_count,
      (
        SELECT COUNT(*) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS rated_track_count,
      (
        SELECT ROUND(AVG(sr.rating), 1) FROM release_songs rs
        JOIN song_ratings sr ON sr.song_id = rs.song_id AND sr.user_id = ? AND sr.rating IS NOT NULL
        WHERE rs.release_id = r.id
      ) AS average_track_rating
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    LEFT JOIN release_ratings rr ON rr.release_id = r.id AND rr.user_id = ?
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'release' AND n.target_id = r.id
    WHERE ${isNum ? 'r.id = ?' : 'r.slug = ?'}
  `,
    [userId, userId, userId, userId, isNum ? Number(key) : key]
  );

  if (!relRow) {
    res.status(404).json({ error: 'Реліз не знайдено.' });
    return;
  }

  const releaseId = Number(relRow.id);
  const trackRows = await db.all<Record<string, unknown>>(
    `
    SELECT
      s.*,
      a.name AS artist_name,
      a.slug AS artist_slug,
      rs.track_number,
      rs.disc_number,
      rs.track_title_on_release,
      pr.title AS primary_release_title,
      pr.slug AS primary_release_slug,
      pr.release_date AS primary_release_date,
      pr.release_year AS primary_release_year,
      pr.release_type AS primary_release_type,
      sr.rating,
      sr.updated_at AS rating_updated_at,
      COALESCE(n.content_enc, '') AS note_enc,
      n.updated_at AS note_updated_at
    FROM release_songs rs
    JOIN songs s ON s.id = rs.song_id
    JOIN artists a ON a.id = s.artist_id
    LEFT JOIN song_ratings sr ON sr.song_id = s.id AND sr.user_id = ?
    LEFT JOIN releases pr ON pr.id = s.primary_release_id
    LEFT JOIN notes n ON n.user_id = ? AND n.target_type = 'song' AND n.target_id = s.id
    WHERE rs.release_id = ?
    ORDER BY rs.disc_number ASC, rs.track_number ASC
  `,
    [userId, userId, releaseId]
  );

  const hydrated = await hydrateSongs(db, trackRows);
  const tracks = hydrated.map((song, idx) => ({
    ...song,
    track_number: Number(trackRows[idx].track_number),
    disc_number: Number(trackRows[idx].disc_number),
    track_title_on_release: trackRows[idx].track_title_on_release
      ? String(trackRows[idx].track_title_on_release)
      : null,
  }));

  res.json({
    ...mapReleaseRows([relRow])[0],
    tracks,
  });
});

app.put('/api/releases/:id/rating', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const releaseId = Number(req.params.id);
  const parsed = parseRatingInput(req.body?.rating);
  if (parsed === 'invalid' || !Number.isInteger(releaseId)) {
    res.status(400).json({ error: 'Оцінка повинна бути цілим числом від 0 до 100 або null.' });
    return;
  }

  const exists = await db.get('SELECT id FROM releases WHERE id = ?', [releaseId]);
  if (!exists) {
    res.status(404).json({ error: 'Реліз не знайдено.' });
    return;
  }

  const now = new Date().toISOString();
  if (parsed === null) {
    await db.run('DELETE FROM release_ratings WHERE user_id = ? AND release_id = ?', [
      userId,
      releaseId,
    ]);
    res.json({ releaseId, rating: null, updatedAt: now });
    return;
  }

  await db.run(
    `INSERT INTO release_ratings (user_id, release_id, rating, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, release_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`,
    [userId, releaseId, parsed, now]
  );
  res.json({ releaseId, rating: parsed, updatedAt: now });
});

app.put('/api/releases/:id/note', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const releaseId = Number(req.params.id);
  const note = typeof req.body?.note === 'string' ? req.body.note : '';

  const exists = await db.get('SELECT id FROM releases WHERE id = ?', [releaseId]);
  if (!exists) {
    res.status(404).json({ error: 'Реліз не знайдено.' });
    return;
  }

  const now = new Date().toISOString();
  if (note.trim() === '') {
    await db.run(
      `DELETE FROM notes WHERE user_id = ? AND target_type = 'release' AND target_id = ?`,
      [userId, releaseId]
    );
    res.json({ releaseId, note: '', updatedAt: now });
    return;
  }

  await db.run(
    `INSERT INTO notes (user_id, target_type, target_id, content_enc, updated_at)
     VALUES (?, 'release', ?, ?, ?)
     ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET content_enc = excluded.content_enc, updated_at = excluded.updated_at`,
    [userId, releaseId, encryptText(note), now]
  );
  res.json({ releaseId, note, updatedAt: now });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const cid = await getUserSetting(db, userId, 'spotify_client_id');
  res.json({
    hasSpotifyApi: await hasSpotifyCredentials(db, userId),
    spotifyClientIdMasked: cid ? `${cid.slice(0, 6)}••••••${cid.slice(-4)}` : null,
  });
});

app.put('/api/settings/spotify', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const clientId = String(req.body?.clientId || '').trim();
  const clientSecret = String(req.body?.clientSecret || '').trim();

  if (!clientId && !clientSecret) {
    await setUserSetting(db, userId, 'spotify_client_id', null);
    await setUserSetting(db, userId, 'spotify_client_secret', null);
    res.json({ ok: true, hasSpotifyApi: false });
    return;
  }

  if (!clientId || !clientSecret) {
    res.status(400).json({ error: 'Вкажіть одночасно і Client ID, і Client Secret.' });
    return;
  }

  const check = await verifySpotifyCredentials(clientId, clientSecret);
  if (!check.ok) {
    res.status(400).json({ error: `Ключі не пройшли перевірку Spotify: ${check.error}` });
    return;
  }

  await setUserSetting(db, userId, 'spotify_client_id', clientId);
  await setUserSetting(db, userId, 'spotify_client_secret', clientSecret);
  res.json({
    ok: true,
    hasSpotifyApi: true,
    spotifyClientIdMasked: `${clientId.slice(0, 6)}••••••${clientId.slice(-4)}`,
  });
});

app.post('/api/import/catalog', requireAuth, async (req, res) => {
  const db = await getDb();
  const artistId = Number(req.body?.artistId);
  const format = req.body?.format === 'csv' ? 'csv' : 'json';
  const data = typeof req.body?.data === 'string' ? req.body.data : '';
  if (!artistId || !data.trim()) {
    res.status(400).json({ error: 'Вкажіть виконавця та дані для імпорту.' });
    return;
  }
  try {
    const result = await importCatalogData(db, req.user!.id, artistId, format, data);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Помилка імпорту.' });
  }
});

app.get('/api/export/userdata', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const songRatings = await db.all(
    `SELECT a.slug AS artist_slug, s.canonical_key, s.title, sr.rating, sr.updated_at
     FROM song_ratings sr
     JOIN songs s ON s.id = sr.song_id
     JOIN artists a ON a.id = s.artist_id
     WHERE sr.user_id = ?`,
    [userId]
  );
  const releaseRatings = await db.all(
    `SELECT a.slug AS artist_slug, r.slug, r.title, rr.rating, rr.updated_at
     FROM release_ratings rr
     JOIN releases r ON r.id = rr.release_id
     JOIN artists a ON a.id = r.artist_id
     WHERE rr.user_id = ?`,
    [userId]
  );
  const songNotesRaw = await db.all<{
    artist_slug: string;
    canonical_key: string;
    content_enc: string;
    updated_at: string;
  }>(
    `SELECT a.slug AS artist_slug, s.canonical_key, n.content_enc, n.updated_at
     FROM notes n
     JOIN songs s ON s.id = n.target_id
     JOIN artists a ON a.id = s.artist_id
     WHERE n.user_id = ? AND n.target_type = 'song'`,
    [userId]
  );
  const releaseNotesRaw = await db.all<{
    artist_slug: string;
    slug: string;
    content_enc: string;
    updated_at: string;
  }>(
    `SELECT a.slug AS artist_slug, r.slug, n.content_enc, n.updated_at
     FROM notes n
     JOIN releases r ON r.id = n.target_id
     JOIN artists a ON a.id = r.artist_id
     WHERE n.user_id = ? AND n.target_type = 'release'`,
    [userId]
  );

  res.json({
    exported_at: new Date().toISOString(),
    version: 3,
    songRatings,
    releaseRatings,
    songNotes: songNotesRaw.map((n) => ({
      artist_slug: n.artist_slug,
      canonical_key: n.canonical_key,
      content: decryptText(n.content_enc),
      updated_at: n.updated_at,
    })),
    releaseNotes: releaseNotesRaw.map((n) => ({
      artist_slug: n.artist_slug,
      slug: n.slug,
      content: decryptText(n.content_enc),
      updated_at: n.updated_at,
    })),
  });
});

app.post('/api/import/userdata', requireAuth, async (req, res) => {
  const db = await getDb();
  const userId = req.user!.id;
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'Некоректний формат резервної копії.' });
    return;
  }

  let restoredRatings = 0;
  let restoredNotes = 0;

  try {
    const resolveSong = async (artistSlug: string | undefined, canonicalKey: string) => {
      const bareKey = canonicalKey.replace(/^\d+::/, '');
      return db.get<{ id: number }>(
        `SELECT s.id FROM songs s JOIN artists a ON a.id = s.artist_id
         WHERE s.canonical_key = ? OR (a.slug = ? AND s.canonical_key LIKE '%::' || ?)`,
        [canonicalKey, artistSlug || 'mother-mother', bareKey]
      );
    };

    for (const item of payload.songRatings || []) {
      const s = await resolveSong(item.artist_slug, item.canonical_key);
      if (s && typeof item.rating === 'number') {
        await db.run(
          `INSERT INTO song_ratings (user_id, song_id, rating, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, song_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`,
          [userId, s.id, item.rating, item.updated_at || new Date().toISOString()]
        );
        restoredRatings++;
      }
    }
    for (const item of payload.releaseRatings || []) {
      const r =
        (await db.get<{ id: number }>('SELECT id FROM releases WHERE slug = ?', [item.slug])) ||
        (await db.get<{ id: number }>('SELECT id FROM releases WHERE slug = ?', [
          `mother-mother--${item.slug}`,
        ]));
      if (r && typeof item.rating === 'number') {
        await db.run(
          `INSERT INTO release_ratings (user_id, release_id, rating, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, release_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`,
          [userId, r.id, item.rating, item.updated_at || new Date().toISOString()]
        );
        restoredRatings++;
      }
    }
    for (const item of payload.songNotes || []) {
      const s = await resolveSong(item.artist_slug, item.canonical_key);
      if (s && typeof item.content === 'string') {
        await db.run(
          `INSERT INTO notes (user_id, target_type, target_id, content_enc, updated_at) VALUES (?, 'song', ?, ?, ?)
           ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET content_enc = excluded.content_enc, updated_at = excluded.updated_at`,
          [userId, s.id, encryptText(item.content), item.updated_at || new Date().toISOString()]
        );
        restoredNotes++;
      }
    }
    for (const item of payload.releaseNotes || []) {
      const r =
        (await db.get<{ id: number }>('SELECT id FROM releases WHERE slug = ?', [item.slug])) ||
        (await db.get<{ id: number }>('SELECT id FROM releases WHERE slug = ?', [
          `mother-mother--${item.slug}`,
        ]));
      if (r && typeof item.content === 'string') {
        await db.run(
          `INSERT INTO notes (user_id, target_type, target_id, content_enc, updated_at) VALUES (?, 'release', ?, ?, ?)
           ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET content_enc = excluded.content_enc, updated_at = excluded.updated_at`,
          [userId, r.id, encryptText(item.content), item.updated_at || new Date().toISOString()]
        );
        restoredNotes++;
      }
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Помилка відновлення.' });
    return;
  }

  res.json({ ok: true, restoredRatings, restoredNotes });
});

// Serve production Vite build if available
const distDir = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

await getDb();

app.listen(PORT, () => {
  console.log(`[Server] Discography & Rating Tracker API running at http://localhost:${PORT}`);
});
