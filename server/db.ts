import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client, type InArgs, type InStatement } from '@libsql/client';
import type { CatalogFile, Category, ReleaseType } from './types.ts';
import {
  decryptText,
  encryptText,
  getAdminEmail,
  getAdminUserId,
} from './services/security.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const DB_PATH = process.env.MM_DB_PATH || path.join(DATA_DIR, 'tracker.sqlite');
export const SEED_MM_PATH = path.join(DATA_DIR, 'seed-mother-mother.json');

export interface Db {
  client: Client;
  get<T = Record<string, unknown>>(sql: string, args?: InArgs): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, args?: InArgs): Promise<T[]>;
  run(sql: string, args?: InArgs): Promise<{ changes: number; lastInsertRowid: number }>;
  batch(stmts: InStatement[]): Promise<void>;
  exec(sql: string): Promise<void>;
}

let dbPromise: Promise<Db> | null = null;

export function isReleaseSecondary(category: Category | string, releaseType: ReleaseType | string): number {
  return category === 'Alternate Versions' ||
    category === 'Remixes' ||
    category === 'Live Versions' ||
    releaseType === 'live' ||
    releaseType === 'demo'
    ? 1
    : 0;
}

export function isSongSecondary(category: Category | string, versionTag: string | null | undefined): number {
  return category === 'Alternate Versions' ||
    category === 'Remixes' ||
    category === 'Live Versions' ||
    Boolean(versionTag && versionTag.trim().length > 0)
    ? 1
    : 0;
}

function createDbWrapper(client: Client): Db {
  return {
    client,
    async get<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T | undefined> {
      const res = await client.execute({ sql, args });
      return (res.rows[0] as unknown as T) ?? undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
      const res = await client.execute({ sql, args });
      return res.rows as unknown as T[];
    },
    async run(sql: string, args: InArgs = []): Promise<{ changes: number; lastInsertRowid: number }> {
      const res = await client.execute({ sql, args });
      return {
        changes: res.rowsAffected,
        lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
      };
    },
    async batch(stmts: InStatement[]): Promise<void> {
      const CHUNK = 80;
      for (let i = 0; i < stmts.length; i += CHUNK) {
        await client.batch(stmts.slice(i, i + CHUNK), 'write');
      }
    },
    async exec(sql: string): Promise<void> {
      await client.executeMultiple(sql);
    },
  };
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

async function initDb(): Promise<Db> {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

  let client: Client;
  if (tursoUrl) {
    client = createClient({
      url: tursoUrl,
      authToken: tursoToken || undefined,
    });
    console.log(`[DB] Connected to remote Turso database: ${tursoUrl}`);
  } else {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    // Check if an older single-user v2 local sqlite exists without users table
    if (fs.existsSync(DB_PATH)) {
      const probe = createClient({ url: `file:${DB_PATH.replace(/\\/g, '/')}` });
      try {
        const tbl = await probe.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
        );
        const oldRel = await probe.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='releases'`
        );
        if (oldRel.rows.length > 0 && tbl.rows.length === 0) {
          probe.close();
          const backupPath = DB_PATH.replace(/\.sqlite$/, '.v2.backup.sqlite');
          if (!fs.existsSync(backupPath)) {
            fs.renameSync(DB_PATH, backupPath);
            for (const ext of ['-wal', '-shm']) {
              if (fs.existsSync(DB_PATH + ext)) {
                fs.renameSync(DB_PATH + ext, backupPath + ext);
              }
            }
            console.log(`[DB] Backed up legacy single-user DB to ${backupPath}`);
          }
        } else {
          probe.close();
        }
      } catch {
        probe.close();
      }
    }
    client = createClient({ url: `file:${DB_PATH.replace(/\\/g, '/')}` });
    console.log(`[DB] Connected to local SQLite (libSQL): ${DB_PATH}`);
  }

  const db = createDbWrapper(client);
  await db.exec('PRAGMA foreign_keys = ON;');
  await createSchema(db);
  await seedMotherMotherIfEmpty(db);
  return db;
}

async function createSchema(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value_enc TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      image_url TEXT,
      spotify_id TEXT UNIQUE,
      spotify_url TEXT,
      mb_id TEXT,
      deezer_id TEXT,
      itunes_id TEXT,
      import_prefs_json TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_artists (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, artist_id)
    );

    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      release_type TEXT NOT NULL,
      release_date TEXT,
      release_year INTEGER,
      cover_url TEXT,
      spotify_id TEXT,
      spotify_url TEXT,
      is_alt_or_secondary INTEGER NOT NULL DEFAULT 0,
      is_verified INTEGER NOT NULL DEFAULT 1,
      verification_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      canonical_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      version_tag TEXT,
      category TEXT NOT NULL,
      is_alt_or_secondary INTEGER NOT NULL DEFAULT 0,
      primary_release_id INTEGER REFERENCES releases(id) ON DELETE SET NULL,
      duration_ms INTEGER,
      cover_url TEXT,
      spotify_id TEXT,
      spotify_url TEXT,
      is_explicit INTEGER NOT NULL DEFAULT 0,
      is_verified INTEGER NOT NULL DEFAULT 1,
      verification_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS release_songs (
      release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
      song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      track_number INTEGER NOT NULL DEFAULT 1,
      disc_number INTEGER NOT NULL DEFAULT 1,
      track_title_on_release TEXT,
      spotify_track_id_on_release TEXT,
      PRIMARY KEY (release_id, disc_number, track_number, song_id)
    );

    CREATE TABLE IF NOT EXISTS song_ratings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      rating INTEGER CHECK (rating IS NULL OR (rating >= 0 AND rating <= 100)),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, song_id)
    );

    CREATE TABLE IF NOT EXISTS release_ratings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
      rating INTEGER CHECK (rating IS NULL OR (rating >= 0 AND rating <= 100)),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, release_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('song', 'release')),
      target_id INTEGER NOT NULL,
      content_enc TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, target_type, target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_artists_user ON user_artists(user_id);
    CREATE INDEX IF NOT EXISTS idx_releases_artist ON releases(artist_id);
    CREATE INDEX IF NOT EXISTS idx_releases_category ON releases(category);
    CREATE INDEX IF NOT EXISTS idx_releases_year ON releases(release_year);
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
    CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
    CREATE INDEX IF NOT EXISTS idx_songs_secondary ON songs(is_alt_or_secondary);
    CREATE INDEX IF NOT EXISTS idx_songs_primary_release ON songs(primary_release_id);
    CREATE INDEX IF NOT EXISTS idx_release_songs_song ON release_songs(song_id);
    CREATE INDEX IF NOT EXISTS idx_song_ratings_user ON song_ratings(user_id);
    CREATE INDEX IF NOT EXISTS idx_release_ratings_user ON release_ratings(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user_target ON notes(user_id, target_type, target_id);

    CREATE TABLE IF NOT EXISTS visitor_sessions (
      visitor_id TEXT PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ip_hash TEXT,
      country TEXT,
      device_type TEXT NOT NULL DEFAULT 'desktop',
      browser TEXT NOT NULL DEFAULT 'Other',
      os TEXT NOT NULL DEFAULT 'Other',
      current_path TEXT NOT NULL DEFAULT '/',
      referrer TEXT,
      page_views INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visitor_last_seen ON visitor_sessions(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_visitor_user ON visitor_sessions(user_id);

    CREATE TABLE IF NOT EXISTS visit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      path TEXT NOT NULL,
      country TEXT,
      device_type TEXT NOT NULL DEFAULT 'desktop',
      browser TEXT NOT NULL DEFAULT 'Other',
      os TEXT NOT NULL DEFAULT 'Other',
      referrer TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visit_logs_created ON visit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_visit_logs_visitor ON visit_logs(visitor_id);
  `);

  const userCols = await db.all<{ name: string }>('PRAGMA table_info(users)');
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has('is_admin')) {
    await db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('last_seen_at')) {
    await db.exec('ALTER TABLE users ADD COLUMN last_seen_at TEXT;');
  }
  if (!colNames.has('last_path')) {
    await db.exec('ALTER TABLE users ADD COLUMN last_path TEXT;');
  }

  // Strictly enforce admin flag for the single configured owner account only
  await db.run(
    `UPDATE users SET is_admin = CASE WHEN id = ? AND lower(email) = ? THEN 1 ELSE 0 END`,
    [getAdminUserId(), getAdminEmail()]
  );
}

async function seedMotherMotherIfEmpty(db: Db): Promise<void> {
  const row = await db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM artists');
  if (row && Number(row.cnt) > 0) return;

  if (!fs.existsSync(SEED_MM_PATH)) {
    console.warn(`[DB] Seed file not found at ${SEED_MM_PATH}.`);
    return;
  }

  const catalog = JSON.parse(fs.readFileSync(SEED_MM_PATH, 'utf8')) as CatalogFile;
  const mmPrefs = JSON.stringify({
    includeCore: true,
    includeDeluxe: true,
    includeLive: true,
    includeRemixes: true,
    includeAlternate: true,
  });

  const artistRes = await db.run(
    `INSERT OR IGNORE INTO artists (
      slug, name, image_url, spotify_id, spotify_url, mb_id, deezer_id, itunes_id,
      import_prefs_json, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      'mother-mother',
      'Mother Mother',
      'https://image-cdn-fa.spotifycdn.com/image/ab67616100005174b87f3a2808a2660deca9a3b7',
      '0e86yPdC41PGRkLp2Q1Bph',
      'https://open.spotify.com/artist/0e86yPdC41PGRkLp2Q1Bph',
      '69681b02-05b8-4685-80cb-e98983b7a96f',
      '380362',
      '215388019',
      mmPrefs,
    ]
  );

  let artistId = artistRes.lastInsertRowid;
  if (!artistId) {
    const found = await db.get<{ id: number }>('SELECT id FROM artists WHERE slug = ?', [
      'mother-mother',
    ]);
    artistId = found?.id ?? 0;
  }
  if (!artistId) return;

  // Batch insert releases
  const relStmts: InStatement[] = catalog.releases.map((rel) => ({
    sql: `INSERT OR IGNORE INTO releases (
      artist_id, slug, title, category, release_type, release_date, release_year,
      cover_url, spotify_id, spotify_url, is_alt_or_secondary, is_verified, verification_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      artistId,
      `mother-mother--${rel.slug}`,
      rel.title,
      rel.category,
      rel.release_type,
      rel.release_date ?? null,
      rel.release_year ?? null,
      rel.cover_url ?? null,
      rel.spotify_id ?? null,
      rel.spotify_url ?? null,
      isReleaseSecondary(rel.category, rel.release_type),
      rel.is_verified ? 1 : 0,
      rel.verification_note ?? null,
    ],
  }));
  await db.batch(relStmts);

  const relRows = await db.all<{ id: number; slug: string }>(
    'SELECT id, slug FROM releases WHERE artist_id = ?',
    [artistId]
  );
  const releaseIdBySlug = new Map<string, number>();
  for (const r of relRows) {
    const origSlug = r.slug.replace(/^mother-mother--/, '');
    releaseIdBySlug.set(origSlug, Number(r.id));
  }

  // Batch insert songs
  const songStmts: InStatement[] = catalog.songs.map((song) => ({
    sql: `INSERT OR IGNORE INTO songs (
      artist_id, canonical_key, title, version_tag, category, is_alt_or_secondary,
      primary_release_id, duration_ms, cover_url, spotify_id, spotify_url,
      is_explicit, is_verified, verification_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      artistId,
      `${artistId}::${song.canonical_key}`,
      song.title,
      song.version_tag ?? null,
      song.category,
      isSongSecondary(song.category, song.version_tag),
      song.primary_release_slug ? releaseIdBySlug.get(song.primary_release_slug) ?? null : null,
      song.duration_ms ?? null,
      song.cover_url ?? null,
      song.spotify_id ?? null,
      song.spotify_url ?? null,
      song.is_explicit ? 1 : 0,
      song.is_verified ? 1 : 0,
      song.verification_note ?? null,
    ],
  }));
  await db.batch(songStmts);

  const songRows = await db.all<{ id: number; canonical_key: string }>(
    'SELECT id, canonical_key FROM songs WHERE artist_id = ?',
    [artistId]
  );
  const songIdByKey = new Map<string, number>();
  const prefix = `${artistId}::`;
  for (const s of songRows) {
    songIdByKey.set(s.canonical_key.startsWith(prefix) ? s.canonical_key.slice(prefix.length) : s.canonical_key, Number(s.id));
  }

  // Batch insert release_songs
  const linkStmts: InStatement[] = [];
  for (const rel of catalog.releases) {
    const relId = releaseIdBySlug.get(rel.slug);
    if (!relId) continue;
    for (const t of rel.tracks) {
      const songId = songIdByKey.get(t.canonical_key);
      if (!songId) continue;
      linkStmts.push({
        sql: `INSERT OR IGNORE INTO release_songs (
          release_id, song_id, track_number, disc_number,
          track_title_on_release, spotify_track_id_on_release
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          relId,
          songId,
          t.track_number,
          t.disc_number ?? 1,
          t.track_title_on_release ?? null,
          t.spotify_track_id_on_release ?? null,
        ],
      });
    }
  }
  await db.batch(linkStmts);
  console.log(`[DB] Seeded Mother Mother (${relRows.length} releases, ${songRows.length} songs).`);
}

export async function attachDefaultArtistsForUser(db: Db, userId: number): Promise<void> {
  const mm = await db.get<{ id: number }>('SELECT id FROM artists WHERE slug = ?', ['mother-mother']);
  if (mm) {
    await db.run('INSERT OR IGNORE INTO user_artists (user_id, artist_id) VALUES (?, ?)', [
      userId,
      mm.id,
    ]);
  }
}

export async function getUserSetting(db: Db, userId: number, key: string): Promise<string | null> {
  const row = await db.get<{ value_enc: string }>(
    'SELECT value_enc FROM user_settings WHERE user_id = ? AND key = ?',
    [userId, key]
  );
  if (!row) return null;
  return decryptText(row.value_enc);
}

export async function setUserSetting(
  db: Db,
  userId: number,
  key: string,
  value: string | null
): Promise<void> {
  if (value === null || value === '') {
    await db.run('DELETE FROM user_settings WHERE user_id = ? AND key = ?', [userId, key]);
    return;
  }
  await db.run(
    `INSERT INTO user_settings (user_id, key, value_enc, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, key) DO UPDATE SET value_enc = excluded.value_enc, updated_at = excluded.updated_at`,
    [userId, key, encryptText(value)]
  );
}
