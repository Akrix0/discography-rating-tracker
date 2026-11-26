import express from 'express';
import type { Db } from '../db.ts';
import { requireAuth } from './auth.ts';
import { decryptText } from '../services/security.ts';
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

async function getRelationship(db: Db, viewerId: number, targetId: number): Promise<Relationship> {
  if (viewerId === targetId) {
    return { iFollow: false, followsMe: false, isFriend: false };
  }
  const rows = await db.all<{ follower_id: number; following_id: number }>(
    `SELECT follower_id, following_id FROM user_follows
     WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)`,
    [viewerId, targetId, targetId, viewerId]
  );
  const iFollow = rows.some((r) => Number(r.follower_id) === viewerId && Number(r.following_id) === targetId);
  const followsMe = rows.some((r) => Number(r.follower_id) === targetId && Number(r.following_id) === viewerId);
  return { iFollow, followsMe, isFriend: iFollow && followsMe };
}

async function evaluateScopeAccess(
  db: Db,
  ownerId: number,
  viewerId: number,
  mode: VisibilityMode,
  scope: 'ratings' | 'notes',
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

function mapPublicUserCard(r: Record<string, unknown>) {
  const iFollow = Boolean(Number(r.i_follow || 0));
  const followsMe = Boolean(Number(r.follows_me || 0));
  return {
    id: Number(r.id),
    displayName: String(r.display_name),
    avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
    bio: r.bio ? String(r.bio) : '',
    iFollow,
    followsMe,
    isFriend: iFollow && followsMe,
    createdAt: String(r.created_at),
  };
}

export function createSocialRouter(getDbFn: () => Promise<Db>) {
  const router = express.Router();

  router.get('/overview', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;

    const [relationRows, userRow, allowRows] = await Promise.all([
      db.all<Record<string, unknown>>(
        `SELECT
          u.id, u.display_name, u.avatar_url, u.bio, u.created_at,
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
      db.get<{ ratings_visibility: string; notes_visibility: string }>(
        `SELECT ratings_visibility, notes_visibility FROM users WHERE id = ?`,
        [userId]
      ),
      db.all<{ viewer_id: number; scope: 'ratings' | 'notes' }>(
        `SELECT viewer_id, scope FROM user_privacy_allowlist WHERE owner_id = ?`,
        [userId]
      ),
    ]);

    const cards = relationRows.map(mapPublicUserCard);
    const friends = cards.filter((c) => c.isFriend);
    const followers = cards.filter((c) => c.followsMe && !c.iFollow);
    const following = cards.filter((c) => c.iFollow && !c.followsMe);

    const friendIdSet = new Set(friends.map((f) => f.id));

    res.json({
      friends,
      followers,
      following,
      privacy: {
        ratingsVisibility: parseVisibility(userRow?.ratings_visibility, 'everyone'),
        notesVisibility: parseVisibility(userRow?.notes_visibility, 'nobody'),
        selectedRatingsFriendIds: allowRows
          .filter((a) => a.scope === 'ratings' && friendIdSet.has(Number(a.viewer_id)))
          .map((a) => Number(a.viewer_id)),
        selectedNotesFriendIds: allowRows
          .filter((a) => a.scope === 'notes' && friendIdSet.has(Number(a.viewer_id)))
          .map((a) => Number(a.viewer_id)),
      },
    });
  });

  router.get('/search', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const q = String(req.query.q || '').trim().toLowerCase();

    const rows = q
      ? await db.all<Record<string, unknown>>(
          `SELECT
            u.id, u.display_name, u.avatar_url, u.bio, u.created_at,
            EXISTS(SELECT 1 FROM user_follows f1 WHERE f1.follower_id = ? AND f1.following_id = u.id) AS i_follow,
            EXISTS(SELECT 1 FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS follows_me
           FROM users u
           WHERE u.id != ? AND lower(u.display_name) LIKE ?
           ORDER BY lower(u.display_name) ASC
           LIMIT 25`,
          [userId, userId, userId, `%${q}%`]
        )
      : await db.all<Record<string, unknown>>(
          `SELECT
            u.id, u.display_name, u.avatar_url, u.bio, u.created_at,
            EXISTS(SELECT 1 FROM user_follows f1 WHERE f1.follower_id = ? AND f1.following_id = u.id) AS i_follow,
            EXISTS(SELECT 1 FROM user_follows f2 WHERE f2.follower_id = u.id AND f2.following_id = ?) AS follows_me
           FROM users u
           WHERE u.id != ?
           ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC
           LIMIT 20`,
          [userId, userId, userId]
        );

    res.json({ users: rows.map(mapPublicUserCard) });
  });

  router.post('/follow/:targetId', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const targetId = Number(req.params.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0 || targetId === userId) {
      res.status(400).json({ error: 'Некоректний користувач.' });
      return;
    }

    const exists = await db.get<{ id: number }>('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!exists) {
      res.status(404).json({ error: 'Користувача не знайдено.' });
      return;
    }

    await db.run(
      `INSERT OR IGNORE INTO user_follows (follower_id, following_id, created_at) VALUES (?, ?, ?)`,
      [userId, targetId, new Date().toISOString()]
    );

    const relationship = await getRelationship(db, userId, targetId);
    res.json({ ok: true, relationship });
  });

  router.delete('/follow/:targetId', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const targetId = Number(req.params.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0 || targetId === userId) {
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

    if (
      !VALID_VISIBILITIES.has(ratingsVisibility) ||
      !VALID_VISIBILITIES.has(notesVisibility)
    ) {
      res.status(400).json({ error: 'Некоректний режим приватності.' });
      return;
    }

    await db.run(
      `UPDATE users SET ratings_visibility = ?, notes_visibility = ?, updated_at = datetime('now') WHERE id = ?`,
      [ratingsVisibility, notesVisibility, userId]
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

    const selectedRatingsFriendIds = Array.from(
      new Set(rawRatingsIds.map(Number).filter((id) => friendIds.has(id)))
    );
    const selectedNotesFriendIds = Array.from(
      new Set(rawNotesIds.map(Number).filter((id) => friendIds.has(id)))
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
    ];
    if (inserts.length > 0) {
      await db.batch(inserts);
    }

    res.json({
      ok: true,
      privacy: {
        ratingsVisibility,
        notesVisibility,
        selectedRatingsFriendIds,
        selectedNotesFriendIds,
      },
    });
  });

  router.get('/users/:targetId', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const viewerId = req.user!.id;
    const targetId = Number(req.params.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Некоректний ID користувача.' });
      return;
    }

    const ownerRow = await db.get<Record<string, unknown>>(
      `SELECT id, display_name, avatar_url, bio, ratings_visibility, notes_visibility, created_at
       FROM users WHERE id = ?`,
      [targetId]
    );
    if (!ownerRow) {
      res.status(404).json({ error: 'Користувача не знайдено.' });
      return;
    }

    const relationship = await getRelationship(db, viewerId, targetId);
    const ratingsMode = parseVisibility(ownerRow.ratings_visibility, 'everyone');
    const notesMode = parseVisibility(ownerRow.notes_visibility, 'nobody');

    const [canViewRatings, canViewNotes, countsRow] = await Promise.all([
      evaluateScopeAccess(db, targetId, viewerId, ratingsMode, 'ratings', relationship.isFriend),
      evaluateScopeAccess(db, targetId, viewerId, notesMode, 'notes', relationship.isFriend),
      db.get<{ friendsCount: number; followersCount: number; followingCount: number }>(
        `SELECT
          (SELECT COUNT(*) FROM user_follows f1
           JOIN user_follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
           WHERE f1.follower_id = ?) AS friendsCount,
          (SELECT COUNT(*) FROM user_follows WHERE following_id = ?) AS followersCount,
          (SELECT COUNT(*) FROM user_follows WHERE follower_id = ?) AS followingCount`,
        [targetId, targetId, targetId]
      ),
    ]);

    const profile = {
      id: Number(ownerRow.id),
      displayName: String(ownerRow.display_name),
      avatarUrl: ownerRow.avatar_url ? String(ownerRow.avatar_url) : null,
      bio: ownerRow.bio ? String(ownerRow.bio) : '',
      ratingsVisibility: ratingsMode,
      notesVisibility: notesMode,
      createdAt: String(ownerRow.created_at),
    };

    const counts = {
      friends: Number(countsRow?.friendsCount || 0),
      followers: Number(countsRow?.followersCount || 0),
      following: Number(countsRow?.followingCount || 0),
    };

    if (!canViewRatings && !canViewNotes) {
      res.json({
        profile,
        counts,
        relationship,
        canViewRatings: false,
        canViewNotes: false,
        artists: [],
        ratedSongs: [],
        ratedReleases: [],
      });
      return;
    }

    const [artistRows, songRows, releaseRows] = await Promise.all([
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
    ]);

    res.json({
      profile,
      counts,
      relationship,
      canViewRatings,
      canViewNotes,
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
