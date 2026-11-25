import { getUserSetting, type Db } from '../db.ts';
import type { ArtistCandidate } from '../types.ts';

let cachedToken: { token: string; expiresAt: number; credsKey: string } | null = null;

export async function getSpotifyCredentials(
  db: Db,
  userId?: number
): Promise<{ clientId: string; clientSecret: string } | null> {
  let clientId = '';
  let clientSecret = '';
  if (userId) {
    clientId = (await getUserSetting(db, userId, 'spotify_client_id')) || '';
    clientSecret = (await getUserSetting(db, userId, 'spotify_client_secret')) || '';
  }
  clientId = clientId || process.env.SPOTIFY_CLIENT_ID || '';
  clientSecret = clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
  if (!clientId.trim() || !clientSecret.trim()) return null;
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

export async function hasSpotifyCredentials(db: Db, userId?: number): Promise<boolean> {
  return (await getSpotifyCredentials(db, userId)) !== null;
}

async function fetchToken(clientId: string, clientSecret: string): Promise<{ token: string; expiresIn: number }> {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Spotify auth HTTP ${res.status}: ${errText.slice(0, 120)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { token: data.access_token, expiresIn: data.expires_in || 3600 };
}

export async function verifySpotifyCredentials(
  clientId: string,
  clientSecret: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await fetchToken(clientId.trim(), clientSecret.trim());
    cachedToken = null;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Не вдалося авторизуватись у Spotify API',
    };
  }
}

async function getAccessToken(db: Db, userId?: number): Promise<string> {
  const creds = await getSpotifyCredentials(db, userId);
  if (!creds) throw new Error('Spotify API credentials not configured');
  const credsKey = `${creds.clientId}:${creds.clientSecret}`;
  if (cachedToken && cachedToken.credsKey === credsKey && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }
  const { token, expiresIn } = await fetchToken(creds.clientId, creds.clientSecret);
  cachedToken = {
    token,
    credsKey,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return token;
}

async function spotifyGet<T>(db: Db, url: string, userId?: number): Promise<T> {
  const token = await getAccessToken(db, userId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function searchArtistsSpotify(
  db: Db,
  query: string,
  userId?: number
): Promise<ArtistCandidate[]> {
  const data = await spotifyGet<{
    artists?: {
      items?: {
        id: string;
        name: string;
        images?: { url: string; width: number }[];
        genres?: string[];
      }[];
    };
  }>(db, `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=6`, userId);

  return (data.artists?.items || []).map((a) => ({
    name: a.name,
    imageUrl: a.images?.[0]?.url || null,
    spotifyId: a.id,
    spotifyUrl: `https://open.spotify.com/artist/${a.id}`,
    mbId: null,
    deezerId: null,
    itunesId: null,
    albumCountHint: null,
    disambiguation: a.genres?.slice(0, 2).join(', ') || 'Spotify API',
    source: 'spotify_api',
  }));
}

export async function getArtistSpotify(
  db: Db,
  spotifyId: string,
  userId?: number
): Promise<{ id: string; name: string; imageUrl: string | null; spotifyUrl: string }> {
  const a = await spotifyGet<{
    id: string;
    name: string;
    images?: { url: string }[];
  }>(db, `https://api.spotify.com/v1/artists/${spotifyId}`, userId);

  return {
    id: a.id,
    name: a.name,
    imageUrl: a.images?.[0]?.url || null,
    spotifyUrl: `https://open.spotify.com/artist/${a.id}`,
  };
}

export interface RawSpotifyApiAlbum {
  id: string;
  name: string;
  album_type: string;
  release_date: string | null;
  images: { url: string; width: number }[];
  tracks: {
    track_number: number;
    disc_number: number;
    title: string;
    duration_ms: number | null;
    spotify_id: string;
    spotify_url: string;
    is_explicit: boolean;
  }[];
}

export async function fetchFullArtistCatalogSpotifyApi(
  db: Db,
  spotifyId: string,
  userId?: number,
  onProgress?: (processed: number, total: number) => void
): Promise<RawSpotifyApiAlbum[]> {
  let nextUrl: string | null =
    `https://api.spotify.com/v1/artists/${spotifyId}/albums?include_groups=album,single&limit=50`;
  const albumIds: string[] = [];
  const seen = new Set<string>();

  while (nextUrl) {
    type AlbumPage = {
      items?: { id: string; artists?: { id: string }[] }[];
      next: string | null;
    };
    const page: AlbumPage = await spotifyGet<AlbumPage>(db, nextUrl, userId);
    for (const item of page.items || []) {
      const hasArtist = (item.artists || []).some((a) => a.id === spotifyId);
      if (hasArtist && !seen.has(item.id)) {
        seen.add(item.id);
        albumIds.push(item.id);
      }
    }
    nextUrl = page.next;
  }

  const results: RawSpotifyApiAlbum[] = [];
  for (let i = 0; i < albumIds.length; i += 20) {
    const batch = albumIds.slice(i, i + 20);
    const data = await spotifyGet<{
      albums?: {
        id: string;
        name: string;
        album_type: string;
        release_date: string | null;
        images: { url: string; width: number }[];
        tracks?: {
          items?: {
            id: string;
            name: string;
            track_number: number;
            disc_number: number;
            duration_ms: number;
            explicit: boolean;
          }[];
        };
      }[];
    }>(db, `https://api.spotify.com/v1/albums?ids=${batch.join(',')}`, userId);

    for (const alb of data.albums || []) {
      if (!alb) continue;
      results.push({
        id: alb.id,
        name: alb.name,
        album_type: alb.album_type,
        release_date: alb.release_date || null,
        images: alb.images || [],
        tracks: (alb.tracks?.items || []).map((t) => ({
          track_number: t.track_number,
          disc_number: t.disc_number || 1,
          title: t.name,
          duration_ms: t.duration_ms || null,
          spotify_id: t.id,
          spotify_url: `https://open.spotify.com/track/${t.id}`,
          is_explicit: Boolean(t.explicit),
        })),
      });
    }
    onProgress?.(Math.min(i + batch.length, albumIds.length), albumIds.length);
  }

  return results;
}
