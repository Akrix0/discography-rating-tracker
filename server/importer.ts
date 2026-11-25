import { isReleaseSecondary, isSongSecondary, type Db } from './db.ts';
import { sanitizeHttpUrl } from './services/security.ts';
import { CATEGORIES, type Category, type ReleaseType } from './types.ts';

function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ')
    .trim();
}

function slugify(str: string): string {
  return normalizeText(str).replace(/\s+/g, '-') || `release-${Date.now()}`;
}

function extractSpotifyId(urlOrId: string | null | undefined, kind: 'album' | 'track'): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(new RegExp(`open\\.spotify\\.com/${kind}/([a-zA-Z0-9]{22})`));
  return m ? m[1] : null;
}

function validCategory(cat: string | undefined): Category {
  if (cat && (CATEGORIES as readonly string[]).includes(cat)) {
    return cat as Category;
  }
  return 'Other';
}

function validReleaseType(rt: string | undefined): ReleaseType {
  const allowed: ReleaseType[] = [
    'album',
    'deluxe_album',
    'ep',
    'single',
    'live',
    'compilation',
    'demo',
    'other',
  ];
  if (rt && allowed.includes(rt as ReleaseType)) return rt as ReleaseType;
  return 'other';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

interface FlatImportRow {
  release_title: string;
  release_category?: string;
  release_type?: string;
  release_date?: string;
  release_spotify_url?: string;
  cover_url?: string;
  song_title: string;
  version_tag?: string;
  song_category?: string;
  duration_ms?: number | null;
  song_spotify_url?: string;
  track_number?: number;
  disc_number?: number;
  verification_note?: string;
}

export async function importCatalogData(
  db: Db,
  userId: number,
  artistId: number,
  format: 'json' | 'csv',
  rawData: string
): Promise<{ addedReleases: number; addedSongs: number; linkedTracks: number }> {
  const artistRow = await db.get<{ id: number; slug: string }>(
    'SELECT id, slug FROM artists WHERE id = ?',
    [artistId]
  );
  if (!artistRow) {
    throw new Error('Обраного виконавця не знайдено.');
  }

  await db.run('INSERT OR IGNORE INTO user_artists (user_id, artist_id) VALUES (?, ?)', [
    userId,
    artistId,
  ]);

  let rows: FlatImportRow[] = [];

  if (format === 'csv') {
    const lines = rawData
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      throw new Error('CSV повинен містити заголовок і хоча б один рядок даних.');
    }
    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] ?? '';
      });
      if (!obj.song_title || !obj.release_title) continue;
      rows.push({
        release_title: obj.release_title,
        release_category: obj.release_category || obj.category,
        release_type: obj.release_type,
        release_date: obj.release_date,
        release_spotify_url: obj.release_spotify_url || obj.spotify_url,
        cover_url: obj.cover_url,
        song_title: obj.song_title || obj.title,
        version_tag: obj.version_tag,
        song_category: obj.song_category,
        duration_ms: obj.duration_ms ? Number(obj.duration_ms) : null,
        song_spotify_url: obj.song_spotify_url,
        track_number: obj.track_number ? Number(obj.track_number) : undefined,
        disc_number: obj.disc_number ? Number(obj.disc_number) : 1,
        verification_note: obj.verification_note,
      });
    }
  } else {
    const parsed = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      rows = parsed.map((item) => ({
        release_title: item.release_title || 'Imported Singles',
        release_category: item.release_category || item.category,
        release_type: item.release_type,
        release_date: item.release_date,
        release_spotify_url: item.release_spotify_url,
        cover_url: item.cover_url,
        song_title: item.song_title || item.title,
        version_tag: item.version_tag,
        song_category: item.song_category,
        duration_ms: item.duration_ms ? Number(item.duration_ms) : null,
        song_spotify_url: item.song_spotify_url || item.spotify_url,
        track_number: item.track_number ? Number(item.track_number) : undefined,
        disc_number: item.disc_number ? Number(item.disc_number) : 1,
        verification_note: item.verification_note,
      }));
    } else if (parsed && Array.isArray(parsed.releases)) {
      for (const rel of parsed.releases) {
        const tracks = Array.isArray(rel.tracks) ? rel.tracks : [];
        for (let idx = 0; idx < tracks.length; idx++) {
          const t = tracks[idx];
          rows.push({
            release_title: rel.title,
            release_category: rel.category,
            release_type: rel.release_type,
            release_date: rel.release_date,
            release_spotify_url: rel.spotify_url || rel.spotify_id,
            cover_url: rel.cover_url,
            song_title: t.title || t.track_title_on_release,
            version_tag: t.version_tag,
            song_category: t.category,
            duration_ms: t.duration_ms ?? null,
            song_spotify_url: t.spotify_url || t.spotify_id,
            track_number: t.track_number ?? idx + 1,
            disc_number: t.disc_number ?? 1,
            verification_note: t.verification_note || rel.verification_note,
          });
        }
      }
    } else {
      throw new Error('JSON повинен бути масивом композицій або об’єктом із полем "releases".');
    }
  }

  if (rows.length === 0) {
    throw new Error('Не знайдено жодного валідного запису для імпорту.');
  }

  let addedReleases = 0;
  let addedSongs = 0;
  let linkedTracks = 0;
  const trackCounters = new Map<number, number>();

  for (const r of rows) {
    if (!r.release_title || !r.song_title) continue;

    const relCategory = validCategory(r.release_category);
    const relType = validReleaseType(r.release_type);
    const relYear = r.release_date?.match(/(\d{4})/)?.[1]
      ? Number(r.release_date.match(/(\d{4})/)![1])
      : null;
    const relSpotifyId = extractSpotifyId(r.release_spotify_url, 'album');
    const relSpotifyUrl = relSpotifyId
      ? `https://open.spotify.com/album/${relSpotifyId}`
      : sanitizeHttpUrl(r.release_spotify_url);
    const safeCoverUrl = sanitizeHttpUrl(r.cover_url);

    const relRow = await db.get<{ id: number }>(
      'SELECT id FROM releases WHERE artist_id = ? AND lower(title) = lower(?)',
      [artistId, r.release_title]
    );
    let releaseId: number;
    if (relRow) {
      releaseId = Number(relRow.id);
    } else {
      const baseSlug = `${artistRow.slug}--${slugify(r.release_title + (relYear ? `-${relYear}` : ''))}`;
      let slug = baseSlug;
      let suffix = 2;
      while (await db.get('SELECT 1 FROM releases WHERE slug = ?', [slug])) {
        slug = `${baseSlug}-${suffix++}`;
      }
      const info = await db.run(
        `INSERT INTO releases (
          artist_id, slug, title, category, release_type, release_date, release_year,
          cover_url, spotify_id, spotify_url, is_alt_or_secondary, is_verified, verification_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          artistId,
          slug,
          r.release_title.trim(),
          relCategory,
          relType,
          r.release_date || null,
          relYear,
          safeCoverUrl,
          relSpotifyId,
          relSpotifyUrl,
          isReleaseSecondary(relCategory, relType),
          relSpotifyId ? 1 : 0,
          r.verification_note || 'Імпортовано користувачем',
        ]
      );
      releaseId = info.lastInsertRowid;
      addedReleases++;
    }

    const versionTag = r.version_tag?.trim() || null;
    const canonicalKey = `${artistId}::${normalizeText(r.song_title)}::${
      versionTag ? normalizeText(versionTag) : 'original'
    }`;
    const songSpotifyId = extractSpotifyId(r.song_spotify_url, 'track');
    const songSpotifyUrl = songSpotifyId
      ? `https://open.spotify.com/track/${songSpotifyId}`
      : sanitizeHttpUrl(r.song_spotify_url);

    const songRow = await db.get<{ id: number; spotify_id: string | null }>(
      'SELECT id, spotify_id FROM songs WHERE canonical_key = ?',
      [canonicalKey]
    );
    let songId: number;
    if (songRow) {
      songId = Number(songRow.id);
      if (!songRow.spotify_id && songSpotifyId && songSpotifyUrl) {
        await db.run(
          `UPDATE songs SET spotify_id = ?, spotify_url = ? WHERE id = ? AND spotify_id IS NULL`,
          [songSpotifyId, songSpotifyUrl, songId]
        );
      }
    } else {
      const songCategory = validCategory(r.song_category || relCategory);
      const info = await db.run(
        `INSERT INTO songs (
          artist_id, canonical_key, title, version_tag, category, is_alt_or_secondary,
          primary_release_id, duration_ms, cover_url, spotify_id, spotify_url, is_explicit,
          is_verified, verification_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          artistId,
          canonicalKey,
          r.song_title.trim(),
          versionTag,
          songCategory,
          isSongSecondary(songCategory, versionTag),
          releaseId,
          r.duration_ms && !Number.isNaN(r.duration_ms) ? r.duration_ms : null,
          safeCoverUrl,
          songSpotifyId,
          songSpotifyUrl,
          songSpotifyId ? 1 : 0,
          r.verification_note || 'Імпортовано користувачем',
        ]
      );
      songId = info.lastInsertRowid;
      addedSongs++;
    }

    const nextNum = (trackCounters.get(releaseId) || 0) + 1;
    const trackNum = r.track_number || nextNum;
    trackCounters.set(releaseId, Math.max(nextNum, trackNum));

    const linkInfo = await db.run(
      `INSERT OR IGNORE INTO release_songs (
        release_id, song_id, track_number, disc_number,
        track_title_on_release, spotify_track_id_on_release
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [releaseId, songId, trackNum, r.disc_number || 1, r.song_title.trim(), songSpotifyId]
    );
    if (linkInfo.changes > 0) linkedTracks++;
  }

  return { addedReleases, addedSongs, linkedTracks };
}
