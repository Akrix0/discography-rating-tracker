import crypto from 'node:crypto';
import type { InStatement } from '@libsql/client';
import { isReleaseSecondary, isSongSecondary, type Db } from '../db.ts';
import {
  DEFAULT_IMPORT_PREFS,
  type Category,
  type ImportJobStatus,
  type ImportPreferences,
  type ReleaseType,
} from '../types.ts';
import {
  extractSpotifyArtistId,
  fetchJsonWithRetry,
  fetchWikidataSpotifyAlbumIds,
  resolveCandidateFromSpotifyId,
  resolveWikidataArtist,
  searchArtistCandidates,
} from './artistSearch.ts';
import { fetchFullArtistCatalogSpotifyApi, hasSpotifyCredentials } from './spotifyApi.ts';

const UA = 'UniversalDiscographyTracker/2.0 (local-personal-catalog)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const jobs = new Map<string, ImportJobStatus & { userId: number; updatedAt: number }>();

function pruneOldJobs() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of jobs.entries()) {
    if (j.status !== 'running' && j.updatedAt < cutoff) {
      jobs.delete(id);
    }
  }
}

export function getJobStatus(jobId: string, userId: number): ImportJobStatus | null {
  const j = jobs.get(jobId);
  if (!j || j.userId !== userId) return null;
  const { userId: _u, updatedAt: _t, ...rest } = j;
  return rest;
}

interface RawTrack {
  track_number: number;
  disc_number: number;
  title: string;
  duration_ms: number | null;
  spotify_id: string | null;
  spotify_url: string | null;
  is_explicit: boolean;
}

interface RawRelease {
  source: string;
  title: string;
  category: Category;
  release_type: ReleaseType;
  release_date: string | null;
  release_year: number | null;
  cover_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null;
  is_verified: boolean;
  verification_note: string | null;
  tracks: RawTrack[];
}

export interface ArtistImportRequest {
  userId: number;
  artistId?: number;
  name?: string;
  spotifyUrl?: string;
  spotifyId?: string | null;
  mbId?: string | null;
  deezerId?: string | null;
  itunesId?: string | null;
  imageUrl?: string | null;
  prefs?: Partial<ImportPreferences>;
}

function normalizeTitle(str: string): string {
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
  const s = normalizeTitle(str).replace(/\s+/g, '-');
  return s || `item-${Date.now()}`;
}

function parseReleaseYear(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function classifyRelease(
  title: string,
  rawType: string,
  trackCount: number
): { category: Category; releaseType: ReleaseType } {
  const t = title.toLowerCase();
  if (/\bmashup\b|\bsmashup\b/i.test(t)) {
    return { category: 'Mashups', releaseType: 'single' };
  }
  if (/\blive\b|\blive sessions?\b|\blive from\b|\bunplugged\b/i.test(t)) {
    return { category: 'Live Versions', releaseType: 'live' };
  }
  if (/\bremix(es)?\b|\bmix\b/i.test(t) && !/\bmixtape\b/i.test(t)) {
    return { category: 'Remixes', releaseType: 'single' };
  }
  if (/\bsped up\b|\bslowed\b|\bacoustic\b|\bdemo(s)?\b|\binstrumental\b|\bnightcore\b/i.test(t)) {
    return {
      category: 'Alternate Versions',
      releaseType: /\bdemo\b/i.test(t) ? 'demo' : trackCount >= 7 ? 'album' : 'single',
    };
  }
  if (/\bcover\b|\btribute\b/i.test(t)) {
    return { category: 'Covers', releaseType: trackCount <= 2 ? 'single' : 'album' };
  }

  const isDeluxe = /\b(deluxe|extended|expanded|anniversary|complete edition|special edition|reissue)\b/i.test(
    title
  );
  const hasEpWord = /\bep\b|\bmini[- ]?album\b/i.test(t);
  if (/\bspotify singles\b/i.test(t)) {
    return { category: 'Singles', releaseType: 'single' };
  }
  if (rawType === 'album' || (trackCount >= 7 && !hasEpWord)) {
    return {
      category: 'Studio Albums',
      releaseType: isDeluxe ? 'deluxe_album' : 'album',
    };
  }
  if (rawType === 'ep' || (hasEpWord && trackCount >= 3)) {
    return { category: 'EPs', releaseType: 'ep' };
  }
  if (rawType === 'single' || trackCount <= 2) {
    return { category: 'Singles', releaseType: 'single' };
  }
  if (trackCount >= 4 && trackCount <= 6) {
    return { category: 'EPs', releaseType: 'ep' };
  }
  return { category: 'Other', releaseType: 'other' };
}

function parseTrackVersion(trackTitle: string, release: RawRelease) {
  let raw = (trackTitle || '').trim();
  let versionTag: string | null = null;

  const dashMatch = raw.match(
    /^(.*?)\s+-\s+(Sped Up|Slowed Down|Slowed|Acoustic|Chill Version|Spotify Singles|Live.*|Demo|.*Remix|.*Mix|SMASHUP|Instrumental|Radio Edit|Extended.*)$/i
  );
  if (dashMatch) {
    raw = dashMatch[1].trim();
    versionTag = dashMatch[2].trim();
  }

  const parenMatch = raw.match(
    /^(.*?)\s*\(([^)]*(?:Sped Up|Slowed|Acoustic|Live|Demo|Remix|Mix|SMASHUP|Chill|Instrumental|Radio Edit|Version)[^)]*)\)\s*$/i
  );
  if (parenMatch) {
    raw = parenMatch[1].trim();
    versionTag = versionTag ? `${parenMatch[2].trim()} / ${versionTag}` : parenMatch[2].trim();
  }

  if (release.category === 'Live Versions' && (!versionTag || !/live/i.test(versionTag))) {
    versionTag = `Live (${release.title})`;
  } else if (release.release_type === 'demo' && (!versionTag || !/demo/i.test(versionTag))) {
    versionTag = 'Demo';
  }

  if (versionTag) {
    if (/^sped up$/i.test(versionTag)) versionTag = 'Sped Up';
    else if (/^slowed down$/i.test(versionTag) || /^slowed$/i.test(versionTag)) versionTag = 'Slowed Down';
    else if (/^demo$/i.test(versionTag)) versionTag = 'Demo';
  }

  const baseNorm = normalizeTitle(raw);
  const versionNorm = versionTag ? normalizeTitle(versionTag) : 'original';
  return {
    cleanTitle: raw || trackTitle,
    versionTag,
    baseNorm,
    versionNorm,
  };
}

function determineSongCategory(versionTag: string | null, releaseCategory: Category): Category {
  const v = (versionTag || '').toLowerCase();
  if (v.includes('smashup') || v.includes('mashup')) return 'Mashups';
  if (v.includes('remix') || v.includes('mix')) return 'Remixes';
  if (v.includes('live')) return 'Live Versions';
  if (
    v.includes('sped up') ||
    v.includes('slowed') ||
    v.includes('acoustic') ||
    v.includes('demo') ||
    v.includes('chill') ||
    v.includes('instrumental')
  ) {
    return 'Alternate Versions';
  }
  return releaseCategory;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function hydrateSpotifyEmbedAlbum(
  albumId: string,
  artistName: string
): Promise<RawRelease | null> {
  try {
    const [embedHtml, pageHtml] = await Promise.all([
      fetchText(`https://open.spotify.com/embed/album/${albumId}`),
      fetchText(`https://open.spotify.com/album/${albumId}`).catch(() => ''),
    ]);
    const nextMatch = embedHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextMatch) return null;

    const entity = JSON.parse(nextMatch[1])?.props?.pageProps?.state?.data?.entity;
    if (!entity || !entity.name) return null;

    const subtitle = normalizeTitle(entity.subtitle || '');
    const artistNorm = normalizeTitle(artistName);
    if (!subtitle.includes(artistNorm)) return null;

    const releaseDate = pageHtml.match(/music:release_date"\s+content="([^"]+)"/)?.[1] || null;
    const ogImg = pageHtml.match(/property="og:image"\s+content="([^"]+)"/)?.[1] || null;
    const images = (entity.visualIdentity?.image || []) as { url: string; maxWidth?: number }[];
    const coverUrl =
      images.sort((a, b) => (b.maxWidth || 0) - (a.maxWidth || 0))[0]?.url || ogImg || null;

    const tracks: RawTrack[] = (entity.trackList || []).map(
      (t: { uri?: string; title: string; duration?: number; isExplicit?: boolean }, idx: number) => {
        const tid = t.uri?.split(':')[2] || null;
        return {
          track_number: idx + 1,
          disc_number: 1,
          title: t.title,
          duration_ms: typeof t.duration === 'number' ? t.duration : null,
          spotify_id: tid,
          spotify_url: tid ? `https://open.spotify.com/track/${tid}` : null,
          is_explicit: Boolean(t.isExplicit),
        };
      }
    );

    const rawType = tracks.length <= 2 ? 'single' : tracks.length <= 6 ? 'ep' : 'album';
    const { category, releaseType } = classifyRelease(entity.name, rawType, tracks.length);

    return {
      source: 'spotify_embed',
      title: entity.name,
      category,
      release_type: releaseType,
      release_date: releaseDate,
      release_year: parseReleaseYear(releaseDate),
      cover_url: coverUrl,
      spotify_id: albumId,
      spotify_url: `https://open.spotify.com/album/${albumId}`,
      is_verified: true,
      verification_note: 'Перевірено через офіційний Spotify Embed',
      tracks,
    };
  } catch {
    return null;
  }
}

function shouldKeepRelease(rel: RawRelease, prefs: ImportPreferences): boolean {
  if (rel.category === 'Live Versions') return prefs.includeLive;
  if (rel.category === 'Remixes') return prefs.includeRemixes;
  if (rel.category === 'Alternate Versions') return prefs.includeAlternate;
  if (rel.release_type === 'deluxe_album') return prefs.includeDeluxe;
  if (rel.category === 'Studio Albums' || rel.category === 'EPs' || rel.category === 'Singles') {
    return prefs.includeCore;
  }
  return prefs.includeCore;
}

function shouldKeepTrack(songCat: Category, versionTag: string | null, prefs: ImportPreferences): boolean {
  if (songCat === 'Live Versions') return prefs.includeLive;
  if (songCat === 'Remixes') return prefs.includeRemixes;
  if (songCat === 'Alternate Versions') return prefs.includeAlternate;
  if (versionTag && /sped up|slowed|demo|acoustic/i.test(versionTag) && !prefs.includeAlternate) {
    return false;
  }
  return true;
}

export function startArtistImportJob(db: Db, req: ArtistImportRequest): string {
  pruneOldJobs();
  const jobId = crypto.randomUUID();
  const prefs: ImportPreferences = {
    ...DEFAULT_IMPORT_PREFS,
    ...(req.prefs || {}),
  };

  jobs.set(jobId, {
    userId: req.userId,
    updatedAt: Date.now(),
    jobId,
    status: 'running',
    percent: 5,
    stage: 'Ініціалізація пошуку виконавця…',
    processedReleases: 0,
    totalReleases: 0,
  });

  void executeJob(db, jobId, req, prefs);
  return jobId;
}

async function executeJob(
  db: Db,
  jobId: string,
  req: ArtistImportRequest,
  prefs: ImportPreferences
): Promise<void> {
  const updateJob = (patch: Partial<ImportJobStatus>) => {
    const cur = jobs.get(jobId);
    if (cur) jobs.set(jobId, { ...cur, ...patch, updatedAt: Date.now() });
  };

  try {
    let artistName = req.name?.trim() || '';
    let spotifyId = req.spotifyId || (req.spotifyUrl ? extractSpotifyArtistId(req.spotifyUrl) : null);
    let mbId = req.mbId || null;
    let deezerId = req.deezerId || null;
    let itunesId = req.itunesId || null;
    let imageUrl = req.imageUrl || null;
    let effectivePrefs = prefs;

    if (req.artistId) {
      const existingArtist = await db.get<Record<string, unknown>>(
        'SELECT * FROM artists WHERE id = ?',
        [req.artistId]
      );
      if (!existingArtist) throw new Error('Виконавця не знайдено в базі.');
      artistName = String(existingArtist.name);
      spotifyId = spotifyId || (existingArtist.spotify_id ? String(existingArtist.spotify_id) : null);
      mbId = mbId || (existingArtist.mb_id ? String(existingArtist.mb_id) : null);
      deezerId = deezerId || (existingArtist.deezer_id ? String(existingArtist.deezer_id) : null);
      itunesId = itunesId || (existingArtist.itunes_id ? String(existingArtist.itunes_id) : null);
      imageUrl = imageUrl || (existingArtist.image_url ? String(existingArtist.image_url) : null);
      if (!req.prefs && existingArtist.import_prefs_json) {
        effectivePrefs = {
          ...DEFAULT_IMPORT_PREFS,
          ...JSON.parse(String(existingArtist.import_prefs_json)),
        };
      }
    }

    updateJob({ percent: 12, stage: 'Визначення профілю та ідентифікаторів виконавця…' });
    let wikidataId: string | null = null;

    if (artistName && (!spotifyId || !mbId)) {
      const wd = await resolveWikidataArtist(artistName);
      wikidataId = wd.wikidataId;
      spotifyId = spotifyId || wd.spotifyId;
      mbId = mbId || wd.mbId;
    }

    if (spotifyId && (!artistName || !mbId || !deezerId || !imageUrl)) {
      const resolved = await resolveCandidateFromSpotifyId(db, spotifyId, req.userId).catch(() => null);
      if (resolved) {
        artistName = artistName || resolved.name;
        imageUrl = imageUrl || resolved.imageUrl;
        mbId = mbId || resolved.mbId;
        deezerId = deezerId || resolved.deezerId;
      }
    }

    if (artistName && (!spotifyId || !deezerId || !mbId)) {
      const cands = await searchArtistCandidates(db, artistName, req.userId).catch(() => []);
      const normTarget = normalizeTitle(artistName);
      const best = cands.find((c) => normalizeTitle(c.name) === normTarget) || cands[0];
      if (best) {
        artistName = artistName || best.name;
        spotifyId = spotifyId || best.spotifyId;
        mbId = mbId || best.mbId;
        deezerId = deezerId || best.deezerId;
        imageUrl = imageUrl || best.imageUrl;
      }
    }

    if (!artistName) {
      throw new Error('Не вдалося визначити ім’я виконавця.');
    }

    if (!itunesId) {
      try {
        const itRes = await fetchJsonWithRetry<{
          results?: { artistId: number; artistName: string }[];
        }>(
          `https://itunes.apple.com/search?term=${encodeURIComponent(
            artistName
          )}&entity=musicArtist&limit=5`
        );
        const exact = (itRes.results || []).find(
          (a) => normalizeTitle(a.artistName) === normalizeTitle(artistName)
        );
        if (exact) itunesId = String(exact.artistId);
      } catch {
        itunesId = null;
      }
    }

    const rawReleases: RawRelease[] = [];

    if (spotifyId && (await hasSpotifyCredentials(db, req.userId))) {
      updateJob({ percent: 25, stage: `Завантаження повної дискографії ${artistName} через Spotify API…` });
      const apiAlbums = await fetchFullArtistCatalogSpotifyApi(
        db,
        spotifyId,
        req.userId,
        (proc, tot) => {
          const pct = 25 + Math.round((proc / Math.max(1, tot)) * 45);
          updateJob({
            percent: pct,
            processedReleases: proc,
            totalReleases: tot,
            stage: `Отримання треків Spotify API (${proc}/${tot})…`,
          });
        }
      );

      for (const alb of apiAlbums) {
        const { category, releaseType } = classifyRelease(alb.name, alb.album_type, alb.tracks.length);
        rawReleases.push({
          source: 'spotify_api',
          title: alb.name,
          category,
          release_type: releaseType,
          release_date: alb.release_date,
          release_year: parseReleaseYear(alb.release_date),
          cover_url: alb.images?.[0]?.url || null,
          spotify_id: alb.id,
          spotify_url: `https://open.spotify.com/album/${alb.id}`,
          is_verified: true,
          verification_note: 'Перевірено через офіційний Spotify Web API',
          tracks: alb.tracks,
        });
      }
    } else {
      const spotifyAlbumIds = new Set<string>();

      if (spotifyId) {
        updateJob({ percent: 22, stage: 'Сканування публічної сторінки Spotify…' });
        try {
          const html = await fetchText(`https://open.spotify.com/artist/${spotifyId}`);
          for (const m of html.matchAll(/album\/([a-zA-Z0-9]{22})/g)) {
            spotifyAlbumIds.add(m[1]);
          }
        } catch {
          // continue
        }
      }

      if (wikidataId) {
        updateJob({ percent: 26, stage: 'Пошук альбомів Spotify у базі Wikidata…' });
        const wdAlbIds = await fetchWikidataSpotifyAlbumIds(wikidataId);
        for (const id of wdAlbIds) {
          spotifyAlbumIds.add(id);
        }
      }

      if (mbId) {
        updateJob({ percent: 30, stage: 'Пошук релізів та посилань у MusicBrainz…' });
        let offset = 0;
        for (let page = 0; page < 3; page++) {
          try {
            const mbRel = await fetchJsonWithRetry<{
              'release-count'?: number;
              releases?: { relations?: { url?: { resource?: string } }[] }[];
            }>(
              `https://musicbrainz.org/ws/2/release?artist=${mbId}&inc=url-rels&limit=100&offset=${offset}&fmt=json`
            );
            for (const rel of mbRel.releases || []) {
              for (const r of rel.relations || []) {
                const m = r.url?.resource?.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]{22})/);
                if (m) spotifyAlbumIds.add(m[1]);
              }
            }
            if (!mbRel.releases || offset + mbRel.releases.length >= (mbRel['release-count'] || 0)) break;
            offset += 100;
            await sleep(1200);
          } catch {
            break;
          }
        }
      }

      const idList = [...spotifyAlbumIds];
      if (idList.length > 0) {
        updateJob({
          percent: 40,
          totalReleases: idList.length,
          processedReleases: 0,
          stage: `Верифікація ${idList.length} релізів зі Spotify…`,
        });
        for (let i = 0; i < idList.length; i += 5) {
          const batch = idList.slice(i, i + 5);
          const hydrated = await Promise.all(
            batch.map((id) => hydrateSpotifyEmbedAlbum(id, artistName))
          );
          rawReleases.push(...hydrated.filter((x): x is RawRelease => x !== null));
          const proc = Math.min(i + batch.length, idList.length);
          updateJob({
            percent: 40 + Math.round((proc / idList.length) * 25),
            processedReleases: proc,
            totalReleases: idList.length,
          });
          await sleep(150);
        }
      }

      if (deezerId) {
        updateJob({ percent: 68, stage: 'Доповнення дискографії через Deezer…' });
        try {
          const dzList = await fetchJsonWithRetry<{
            data?: {
              id: number;
              title: string;
              record_type: string;
              release_date: string;
              cover_xl?: string;
              cover_big?: string;
            }[];
          }>(`https://api.deezer.com/artist/${deezerId}/albums?limit=100`);

          const items = (dzList.data || []).slice(0, 80);
          for (const item of items) {
            const existing = rawReleases.find(
              (r) => normalizeTitle(r.title) === normalizeTitle(item.title)
            );
            if (existing) {
              if (!existing.release_date && item.release_date) {
                existing.release_date = item.release_date;
                existing.release_year = parseReleaseYear(item.release_date);
              }
              continue;
            }
            try {
              const det = await fetchJsonWithRetry<{
                artist?: { id: number };
                tracks?: {
                  data?: {
                    track_position?: number;
                    disk_number?: number;
                    title: string;
                    duration?: number;
                    explicit_lyrics?: boolean;
                  }[];
                };
              }>(`https://api.deezer.com/album/${item.id}`);
              if (det.artist?.id && String(det.artist.id) !== String(deezerId)) continue;
              const tracks: RawTrack[] = (det.tracks?.data || []).map((t, i) => ({
                track_number: t.track_position || i + 1,
                disc_number: t.disk_number || 1,
                title: t.title,
                duration_ms: t.duration ? t.duration * 1000 : null,
                spotify_id: null,
                spotify_url: null,
                is_explicit: Boolean(t.explicit_lyrics),
              }));
              if (!tracks.length) continue;
              const { category, releaseType } = classifyRelease(item.title, item.record_type, tracks.length);
              rawReleases.push({
                source: 'deezer',
                title: item.title,
                category,
                release_type: releaseType,
                release_date: item.release_date || null,
                release_year: parseReleaseYear(item.release_date),
                cover_url: item.cover_xl || item.cover_big || null,
                spotify_id: null,
                spotify_url: null,
                is_verified: true,
                verification_note:
                  'Метадані підтверджено (Deezer); для Spotify-плеєра підключіть Spotify Web API або вкажіть трек вручну',
                tracks,
              });
              await sleep(100);
            } catch {
              // skip
            }
          }
        } catch {
          // skip
        }
      }

      if (itunesId && rawReleases.length < 30) {
        updateJob({ percent: 76, stage: 'Перевірка додаткових релізів у Apple/iTunes…' });
        try {
          const itList = await fetchJsonWithRetry<{
            results?: {
              wrapperType: string;
              collectionId: number;
              collectionName: string;
              releaseDate?: string;
              artworkUrl100?: string;
            }[];
          }>(`https://itunes.apple.com/lookup?id=${itunesId}&entity=album&limit=80`);

          for (const col of (itList.results || [])
            .filter((x) => x.wrapperType === 'collection')
            .slice(0, 35)) {
            const cleanName = col.collectionName.replace(/\s*-\s*(Single|EP)$/i, '').trim();
            if (rawReleases.some((r) => normalizeTitle(r.title) === normalizeTitle(cleanName))) continue;
            try {
              const det = await fetchJsonWithRetry<{
                results?: {
                  wrapperType: string;
                  trackName: string;
                  trackNumber?: number;
                  discNumber?: number;
                  trackTimeMillis?: number;
                  trackExplicitness?: string;
                }[];
              }>(`https://itunes.apple.com/lookup?id=${col.collectionId}&entity=song`);
              const tracks: RawTrack[] = (det.results || [])
                .filter((x) => x.wrapperType === 'track')
                .map((t, i) => ({
                  track_number: t.trackNumber || i + 1,
                  disc_number: t.discNumber || 1,
                  title: t.trackName,
                  duration_ms: t.trackTimeMillis || null,
                  spotify_id: null,
                  spotify_url: null,
                  is_explicit: t.trackExplicitness === 'explicit',
                }));
              if (!tracks.length) continue;
              const rawType = /- EP$/i.test(col.collectionName)
                ? 'ep'
                : /- Single$/i.test(col.collectionName)
                ? 'single'
                : 'album';
              const { category, releaseType } = classifyRelease(cleanName, rawType, tracks.length);
              const rDate = col.releaseDate ? col.releaseDate.slice(0, 10) : null;
              rawReleases.push({
                source: 'itunes',
                title: cleanName,
                category,
                release_type: releaseType,
                release_date: rDate,
                release_year: parseReleaseYear(rDate),
                cover_url: col.artworkUrl100 ? col.artworkUrl100.replace('100x100bb', '600x600bb') : null,
                spotify_id: null,
                spotify_url: null,
                is_verified: true,
                verification_note: 'Метадані підтверджено (Apple/iTunes)',
                tracks,
              });
              await sleep(120);
            } catch {
              // skip
            }
          }
        } catch {
          // skip
        }
      }
    }

    updateJob({ percent: 84, stage: 'Фільтрація версій та дедуплікація композицій…' });
    const dedupedReleases = new Map<string, RawRelease>();
    for (const rel of rawReleases) {
      if (!shouldKeepRelease(rel, effectivePrefs)) continue;
      const sig = `${normalizeTitle(rel.title)}::${rel.tracks.map((t) => normalizeTitle(t.title)).join('|')}`;
      const prev = dedupedReleases.get(sig);
      if (!prev) {
        dedupedReleases.set(sig, rel);
      } else {
        const prevScore = (prev.spotify_id ? 20 : 0) + (prev.release_date ? 5 : 0);
        const curScore = (rel.spotify_id ? 20 : 0) + (rel.release_date ? 5 : 0);
        if (curScore > prevScore) dedupedReleases.set(sig, rel);
      }
    }

    const finalReleases = [...dedupedReleases.values()];
    if (finalReleases.length === 0) {
      throw new Error(
        'Не знайдено релізів, що відповідають обраним фільтрам. Спробуйте увімкнути більше категорій або додати Spotify Artist URL.'
      );
    }

    updateJob({ percent: 92, stage: 'Збереження каталогу до віддаленої бази даних…' });
    const persisted = await persistArtistCatalog(db, {
      userId: req.userId,
      existingArtistId: req.artistId,
      name: artistName,
      imageUrl,
      spotifyId,
      mbId,
      deezerId,
      itunesId,
      prefs: effectivePrefs,
      releases: finalReleases,
    });

    updateJob({
      status: 'completed',
      percent: 100,
      stage: 'Готово! Каталог успішно сформовано.',
      artistId: persisted.artistId,
      artistSlug: persisted.artistSlug,
      artistName: persisted.artistName,
      addedReleases: persisted.addedReleases,
      addedSongs: persisted.addedSongs,
    });
  } catch (err) {
    updateJob({
      status: 'error',
      error: err instanceof Error ? err.message : 'Помилка збору дискографії',
    });
  }
}

const PRIORITY: Record<Category, number> = {
  'Studio Albums': 1,
  EPs: 2,
  Singles: 3,
  'Live Versions': 4,
  'Alternate Versions': 5,
  Remixes: 6,
  Covers: 7,
  Mashups: 8,
  Other: 9,
};

async function persistArtistCatalog(
  db: Db,
  payload: {
    userId: number;
    existingArtistId?: number;
    name: string;
    imageUrl: string | null;
    spotifyId: string | null;
    mbId: string | null;
    deezerId: string | null;
    itunesId: string | null;
    prefs: ImportPreferences;
    releases: RawRelease[];
  }
) {
  let addedReleases = 0;
  let addedSongs = 0;
  let artistId = payload.existingArtistId;
  let artistSlug = '';

  if (artistId) {
    const row = await db.get<{ slug: string }>('SELECT slug FROM artists WHERE id = ?', [artistId]);
    artistSlug = row!.slug;
    await db.run(
      `UPDATE artists
       SET name = COALESCE(?, name),
           image_url = COALESCE(?, image_url),
           spotify_id = COALESCE(?, spotify_id),
           spotify_url = COALESCE(?, spotify_url),
           mb_id = COALESCE(?, mb_id),
           deezer_id = COALESCE(?, deezer_id),
           itunes_id = COALESCE(?, itunes_id),
           import_prefs_json = ?,
           last_synced_at = datetime('now')
       WHERE id = ?`,
      [
        payload.name,
        payload.imageUrl,
        payload.spotifyId,
        payload.spotifyId ? `https://open.spotify.com/artist/${payload.spotifyId}` : null,
        payload.mbId,
        payload.deezerId,
        payload.itunesId,
        JSON.stringify(payload.prefs),
        artistId,
      ]
    );
  } else {
    if (payload.spotifyId) {
      const bySp = await db.get<{ id: number; slug: string }>(
        'SELECT id, slug FROM artists WHERE spotify_id = ?',
        [payload.spotifyId]
      );
      if (bySp) {
        artistId = Number(bySp.id);
        artistSlug = bySp.slug;
      }
    }
    if (!artistId) {
      const baseSlug = slugify(payload.name);
      let candidateSlug = baseSlug;
      let idx = 2;
      while (await db.get('SELECT 1 FROM artists WHERE slug = ?', [candidateSlug])) {
        candidateSlug = `${baseSlug}-${idx++}`;
      }
      artistSlug = candidateSlug;
      const ins = await db.run(
        `INSERT INTO artists (
          slug, name, image_url, spotify_id, spotify_url, mb_id, deezer_id, itunes_id,
          import_prefs_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          artistSlug,
          payload.name,
          payload.imageUrl,
          payload.spotifyId,
          payload.spotifyId ? `https://open.spotify.com/artist/${payload.spotifyId}` : null,
          payload.mbId,
          payload.deezerId,
          payload.itunesId,
          JSON.stringify(payload.prefs),
        ]
      );
      artistId = ins.lastInsertRowid;
    }
  }

  // Link artist to requesting user's library
  await db.run('INSERT OR IGNORE INTO user_artists (user_id, artist_id) VALUES (?, ?)', [
    payload.userId,
    artistId,
  ]);

  const sortedReleases = [...payload.releases].sort((a, b) => {
    const pa = PRIORITY[a.category] ?? 99;
    const pb = PRIORITY[b.category] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.release_year || 9999) - (b.release_year || 9999);
  });

  const existingRels = await db.all<{ id: number; title: string; spotify_id: string | null; slug: string }>(
    'SELECT id, title, spotify_id, slug FROM releases WHERE artist_id = ?',
    [artistId]
  );
  const relBySp = new Map<string, number>();
  const relByTitle = new Map<string, { id: number; spotify_id: string | null }>();
  const usedRelSlugs = new Set<string>(existingRels.map((r) => r.slug));

  for (const r of existingRels) {
    if (r.spotify_id) relBySp.set(r.spotify_id, Number(r.id));
    relByTitle.set(normalizeTitle(r.title), { id: Number(r.id), spotify_id: r.spotify_id });
  }

  const existingSongs = await db.all<{ id: number; canonical_key: string; spotify_id: string | null }>(
    'SELECT id, canonical_key, spotify_id FROM songs WHERE artist_id = ?',
    [artistId]
  );
  const songMap = new Map<string, { id: number; spotify_id: string | null }>();
  for (const s of existingSongs) {
    songMap.set(s.canonical_key, { id: Number(s.id), spotify_id: s.spotify_id });
  }

  const pendingLinks: InStatement[] = [];

  for (const rel of sortedReleases) {
    let releaseId: number | null = null;
    const normRelTitle = normalizeTitle(rel.title);
    if (rel.spotify_id && relBySp.has(rel.spotify_id)) {
      releaseId = relBySp.get(rel.spotify_id)!;
    } else if (relByTitle.has(normRelTitle)) {
      const foundTitle = relByTitle.get(normRelTitle)!;
      releaseId = foundTitle.id;
      if (!foundTitle.spotify_id && rel.spotify_id) {
        await db.run(
          `UPDATE releases SET spotify_id = ?, spotify_url = ?, cover_url = COALESCE(cover_url, ?),
           release_date = COALESCE(release_date, ?), release_year = COALESCE(release_year, ?),
           is_verified = 1, verification_note = COALESCE(?, verification_note) WHERE id = ?`,
          [
            rel.spotify_id,
            rel.spotify_url,
            rel.cover_url,
            rel.release_date,
            rel.release_year,
            rel.verification_note,
            releaseId,
          ]
        );
        foundTitle.spotify_id = rel.spotify_id;
        relBySp.set(rel.spotify_id, releaseId);
      }
    }

    if (releaseId) {
      await db.run(
        `UPDATE releases SET category = ?, release_type = ?, is_alt_or_secondary = ? WHERE id = ?`,
        [rel.category, rel.release_type, isReleaseSecondary(rel.category, rel.release_type), releaseId]
      );
      await db.run(
        `UPDATE songs SET category = ?, is_alt_or_secondary = ?
         WHERE primary_release_id = ? AND version_tag IS NULL`,
        [rel.category, isSongSecondary(rel.category, null), releaseId]
      );
    }

    if (!releaseId) {
      const baseRelSlug = `${artistSlug}--${slugify(rel.title)}${
        rel.release_year ? `-${rel.release_year}` : ''
      }`;
      let relSlug = baseRelSlug;
      let idx = 2;
      while (usedRelSlugs.has(relSlug) || (await db.get('SELECT 1 FROM releases WHERE slug = ?', [relSlug]))) {
        relSlug = `${baseRelSlug}-${idx++}`;
      }
      usedRelSlugs.add(relSlug);
      const insRel = await db.run(
        `INSERT INTO releases (
          artist_id, slug, title, category, release_type, release_date, release_year,
          cover_url, spotify_id, spotify_url, is_alt_or_secondary, is_verified, verification_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          artistId,
          relSlug,
          rel.title,
          rel.category,
          rel.release_type,
          rel.release_date,
          rel.release_year,
          rel.cover_url,
          rel.spotify_id,
          rel.spotify_url,
          isReleaseSecondary(rel.category, rel.release_type),
          rel.is_verified ? 1 : 0,
          rel.verification_note,
        ]
      );
      releaseId = insRel.lastInsertRowid;
      if (rel.spotify_id) relBySp.set(rel.spotify_id, releaseId);
      relByTitle.set(normalizeTitle(rel.title), { id: releaseId, spotify_id: rel.spotify_id });
      addedReleases++;
    }

    for (const track of rel.tracks) {
      const { cleanTitle, versionTag, baseNorm, versionNorm } = parseTrackVersion(track.title, rel);
      const songCat = determineSongCategory(versionTag, rel.category);
      if (!shouldKeepTrack(songCat, versionTag, payload.prefs)) continue;

      const canonicalKey = `${artistId}::${baseNorm}::${versionNorm}`;
      const existingSong = songMap.get(canonicalKey);
      let songId: number;
      if (existingSong) {
        songId = existingSong.id;
        if (!existingSong.spotify_id && track.spotify_id) {
          await db.run(
            `UPDATE songs SET spotify_id = ?, spotify_url = ?, is_verified = 1,
             verification_note = 'Перевірено через Spotify',
             cover_url = COALESCE(cover_url, ?), duration_ms = COALESCE(duration_ms, ?)
             WHERE id = ? AND spotify_id IS NULL`,
            [track.spotify_id, track.spotify_url, rel.cover_url, track.duration_ms, songId]
          );
          await db.run(
            `UPDATE release_songs SET spotify_track_id_on_release = ?
             WHERE release_id = ? AND song_id = ? AND spotify_track_id_on_release IS NULL`,
            [track.spotify_id, releaseId, songId]
          );
          existingSong.spotify_id = track.spotify_id;
        }
      } else {
        const insSong = await db.run(
          `INSERT INTO songs (
            artist_id, canonical_key, title, version_tag, category, is_alt_or_secondary,
            primary_release_id, duration_ms, cover_url, spotify_id, spotify_url,
            is_explicit, is_verified, verification_note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            artistId,
            canonicalKey,
            cleanTitle,
            versionTag,
            songCat,
            isSongSecondary(songCat, versionTag),
            releaseId,
            track.duration_ms,
            rel.cover_url,
            track.spotify_id,
            track.spotify_url,
            track.is_explicit ? 1 : 0,
            rel.is_verified ? 1 : 0,
            track.spotify_id ? 'Перевірено через Spotify' : rel.verification_note,
          ]
        );
        songId = insSong.lastInsertRowid;
        songMap.set(canonicalKey, { id: songId, spotify_id: track.spotify_id });
        addedSongs++;
      }

      pendingLinks.push({
        sql: `INSERT OR IGNORE INTO release_songs (
          release_id, song_id, track_number, disc_number,
          track_title_on_release, spotify_track_id_on_release
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          releaseId,
          songId,
          track.track_number,
          track.disc_number || 1,
          track.title,
          track.spotify_id,
        ],
      });
    }
  }

  if (pendingLinks.length > 0) {
    await db.batch(pendingLinks);
  }

  return { artistId, artistSlug, artistName: payload.name, addedReleases, addedSongs };
}
