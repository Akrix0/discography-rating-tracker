import type { Db } from '../db.ts';
import type { ArtistCandidate } from '../types.ts';
import { getArtistSpotify, hasSpotifyCredentials, searchArtistsSpotify } from './spotifyApi.ts';

const UA = 'UniversalDiscographyTracker/2.0 (local-personal-catalog)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJsonWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 503 || res.status === 429) && attempt < retries) {
      await sleep(1400 * (attempt + 1));
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  throw new Error(`Exhausted retries for ${url}`);
}

export function extractSpotifyArtistId(input: string): string | null {
  const m = input.match(/(?:open\.spotify\.com\/artist\/|spotify:artist:)([a-zA-Z0-9]{22})/);
  return m ? m[1] : null;
}

function normalizeName(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ')
    .trim();
}

export async function searchArtistCandidates(
  db: Db,
  rawQuery: string,
  userId?: number
): Promise<ArtistCandidate[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const spotifyIdFromUrl = extractSpotifyArtistId(query);
  if (spotifyIdFromUrl) {
    return [await resolveCandidateFromSpotifyId(db, spotifyIdFromUrl, userId)];
  }

  const candidates: ArtistCandidate[] = [];
  const byNormName = new Map<string, ArtistCandidate>();

  const upsertCandidate = (cand: ArtistCandidate) => {
    const key = normalizeName(cand.name);
    const existing = byNormName.get(key);
    if (!existing) {
      byNormName.set(key, cand);
      candidates.push(cand);
    } else {
      if (!existing.imageUrl && cand.imageUrl) existing.imageUrl = cand.imageUrl;
      if (!existing.spotifyId && cand.spotifyId) {
        existing.spotifyId = cand.spotifyId;
        existing.spotifyUrl = cand.spotifyUrl;
      }
      if (!existing.mbId && cand.mbId) existing.mbId = cand.mbId;
      if (!existing.deezerId && cand.deezerId) existing.deezerId = cand.deezerId;
      if (!existing.itunesId && cand.itunesId) existing.itunesId = cand.itunesId;
      if (!existing.albumCountHint && cand.albumCountHint) existing.albumCountHint = cand.albumCountHint;
      if (!existing.disambiguation && cand.disambiguation) existing.disambiguation = cand.disambiguation;
    }
  };

  const tasks: Promise<void>[] = [];

  if (await hasSpotifyCredentials(db, userId)) {
    tasks.push(
      searchArtistsSpotify(db, query, userId)
        .then((list) => list.forEach(upsertCandidate))
        .catch(() => {})
    );
  }

  tasks.push(
    fetchJsonWithRetry<{
      data?: {
        id: number;
        name: string;
        picture_xl?: string;
        picture_medium?: string;
        nb_album?: number;
      }[];
    }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=6`)
      .then((dz) => {
        for (const a of dz.data || []) {
          upsertCandidate({
            name: a.name,
            imageUrl: a.picture_xl || a.picture_medium || null,
            spotifyId: null,
            spotifyUrl: null,
            mbId: null,
            deezerId: String(a.id),
            itunesId: null,
            albumCountHint: a.nb_album || null,
            disambiguation: a.nb_album ? `Deezer • ~${a.nb_album} релізів` : 'Deezer',
            source: 'deezer',
          });
        }
      })
      .catch(() => {})
  );

  tasks.push(
    fetchJsonWithRetry<{
      artists?: {
        id: string;
        name: string;
        country?: string;
        disambiguation?: string;
      }[];
    }>(`https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(`"${query}"`)}&limit=4&fmt=json`)
      .then(async (mb) => {
        const list = (mb.artists || []).slice(0, 3);
        for (const a of list) {
          let spId: string | null = null;
          let dzId: string | null = null;
          try {
            await sleep(900);
            const det = await fetchJsonWithRetry<{
              relations?: { url?: { resource?: string } }[];
            }>(`https://musicbrainz.org/ws/2/artist/${a.id}?inc=url-rels&fmt=json`);
            for (const rel of det.relations || []) {
              const resUrl = rel.url?.resource || '';
              const spMatch = resUrl.match(/open\.spotify\.com\/artist\/([a-zA-Z0-9]{22})/);
              if (spMatch) spId = spMatch[1];
              const dzMatch = resUrl.match(/deezer\.com\/(?:\w+\/)?artist\/(\d+)/);
              if (dzMatch) dzId = dzMatch[1];
            }
          } catch {
            // ignore
          }

          let spImage: string | null = null;
          if (spId) {
            try {
              const oembed = await fetchJsonWithRetry<{ thumbnail_url?: string }>(
                `https://open.spotify.com/oembed?url=https://open.spotify.com/artist/${spId}`
              );
              spImage = oembed.thumbnail_url || null;
            } catch {
              spImage = null;
            }
          }

          upsertCandidate({
            name: a.name,
            imageUrl: spImage,
            spotifyId: spId,
            spotifyUrl: spId ? `https://open.spotify.com/artist/${spId}` : null,
            mbId: a.id,
            deezerId: dzId,
            itunesId: null,
            albumCountHint: null,
            disambiguation: [a.country, a.disambiguation].filter(Boolean).join(' • ') || 'MusicBrainz',
            source: 'musicbrainz',
          });
        }
      })
      .catch(() => {})
  );

  await Promise.all(tasks);
  return candidates.slice(0, 8);
}

export async function resolveCandidateFromSpotifyId(
  db: Db,
  spotifyId: string,
  userId?: number
): Promise<ArtistCandidate> {
  let name = '';
  let imageUrl: string | null = null;
  const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`;

  if (await hasSpotifyCredentials(db, userId)) {
    try {
      const info = await getArtistSpotify(db, spotifyId, userId);
      name = info.name;
      imageUrl = info.imageUrl;
    } catch {
      // fall back to oEmbed
    }
  }

  if (!name) {
    const oembed = await fetchJsonWithRetry<{ title?: string; thumbnail_url?: string }>(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    );
    name = oembed.title || spotifyId;
    imageUrl = oembed.thumbnail_url || null;
  }

  let mbId: string | null = null;
  try {
    const mbUrl = await fetchJsonWithRetry<{
      relations?: { artist?: { id?: string; name?: string } }[];
    }>(
      `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(spotifyUrl)}&inc=artist-rels&fmt=json`
    );
    mbId = mbUrl.relations?.[0]?.artist?.id || null;
  } catch {
    mbId = null;
  }

  let deezerId: string | null = null;
  let albumCountHint: number | null = null;
  try {
    const dz = await fetchJsonWithRetry<{
      data?: { id: number; name: string; nb_album?: number; picture_xl?: string }[];
    }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`);
    const match = (dz.data || []).find((a) => normalizeName(a.name) === normalizeName(name));
    if (match) {
      deezerId = String(match.id);
      albumCountHint = match.nb_album || null;
      if (!imageUrl) imageUrl = match.picture_xl || null;
    }
  } catch {
    deezerId = null;
  }

  return {
    name,
    imageUrl,
    spotifyId,
    spotifyUrl,
    mbId,
    deezerId,
    itunesId: null,
    albumCountHint,
    disambiguation: 'Перевірений профіль Spotify',
    source: 'spotify_url',
  };
}
