import type {
  ArtistCandidate,
  ArtistSummary,
  AuthUser,
  FilterMetaResponse,
  FilterState,
  GlobalStatsResponse,
  ImportJobStatus,
  ImportPreferences,
  Release,
  ReleaseDetail,
  Song,
  StatsResponse,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'DiscographyTracker',
      ...(init?.headers || {}),
    },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Помилка запиту (${res.status})`);
  }
  return data as T;
}

function buildFilterParams(f: FilterState, artistId: number | null): string {
  const params = new URLSearchParams();
  if (artistId) params.set('artistId', String(artistId));
  if (f.hideSecondary) params.set('hideSecondary', '1');
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.categories.length > 0) params.set('categories', f.categories.join(','));
  if (f.releaseTypes.length > 0) params.set('releaseTypes', f.releaseTypes.join(','));
  if (f.ratedStatus !== 'all') params.set('ratedStatus', f.ratedStatus);
  if (f.minRating > 0) params.set('minRating', String(f.minRating));
  if (f.maxRating < 100) params.set('maxRating', String(f.maxRating));
  if (f.year) params.set('year', f.year);
  params.set('sortBy', f.sortBy);
  params.set('sortDir', f.sortDir);
  return params.toString();
}

export const api = {
  // Auth
  getMe: () => request<{ user: AuthUser | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, displayName: string) =>
    request<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  updateProfile: (payload: {
    displayName?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }) =>
    request<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Artists & Catalog
  getArtists: () => request<{ artists: ArtistSummary[] }>('/api/artists'),
  searchArtists: (q: string) =>
    request<{ candidates: ArtistCandidate[] }>(`/api/artists/search?q=${encodeURIComponent(q)}`),
  importArtist: (payload: {
    name?: string;
    spotifyUrl?: string;
    spotifyId?: string | null;
    mbId?: string | null;
    deezerId?: string | null;
    itunesId?: string | null;
    imageUrl?: string | null;
    prefs: ImportPreferences;
  }) =>
    request<{ jobId: string }>('/api/artists/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  syncArtist: (artistId: number, prefs?: ImportPreferences) =>
    request<{ jobId: string }>(`/api/artists/${artistId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ prefs }),
    }),
  getJobStatus: (jobId: string) => request<ImportJobStatus>(`/api/jobs/${jobId}`),
  deleteArtist: (artistId: number) =>
    request<{ ok: boolean }>(`/api/artists/${artistId}`, { method: 'DELETE' }),

  getGlobalStats: () => request<GlobalStatsResponse>('/api/global/stats'),
  getStats: (artistId: number | null) =>
    request<StatsResponse>(`/api/stats${artistId ? `?artistId=${artistId}` : ''}`),
  getFilterMeta: (artistId: number | null, hideSecondary: boolean) => {
    const p = new URLSearchParams();
    if (artistId) p.set('artistId', String(artistId));
    if (hideSecondary) p.set('hideSecondary', '1');
    return request<FilterMetaResponse>(`/api/filters/meta?${p.toString()}`);
  },
  getSongs: (filters: FilterState, artistId: number | null) =>
    request<{ total: number; songs: Song[] }>(`/api/songs?${buildFilterParams(filters, artistId)}`),
  getReleases: (filters: FilterState, artistId: number | null) =>
    request<{ total: number; releases: Release[] }>(
      `/api/releases?${buildFilterParams(filters, artistId)}`
    ),
  getReleaseDetail: (idOrSlug: string | number) =>
    request<ReleaseDetail>(`/api/releases/${idOrSlug}`),

  saveSongRating: (songId: number, rating: number | null) =>
    request<{ songId: number; rating: number | null; updatedAt: string }>(
      `/api/songs/${songId}/rating`,
      { method: 'PUT', body: JSON.stringify({ rating }) }
    ),

  saveSongNote: (songId: number, note: string) =>
    request<{ songId: number; note: string; updatedAt: string }>(
      `/api/songs/${songId}/note`,
      { method: 'PUT', body: JSON.stringify({ note }) }
    ),

  saveReleaseRating: (releaseId: number, rating: number | null) =>
    request<{ releaseId: number; rating: number | null; updatedAt: string }>(
      `/api/releases/${releaseId}/rating`,
      { method: 'PUT', body: JSON.stringify({ rating }) }
    ),

  saveReleaseNote: (releaseId: number, note: string) =>
    request<{ releaseId: number; note: string; updatedAt: string }>(
      `/api/releases/${releaseId}/note`,
      { method: 'PUT', body: JSON.stringify({ note }) }
    ),

  getSettings: () =>
    request<{ hasSpotifyApi: boolean; spotifyClientIdMasked: string | null }>('/api/settings'),
  saveSpotifySettings: (clientId: string, clientSecret: string) =>
    request<{ ok: boolean; hasSpotifyApi: boolean; spotifyClientIdMasked?: string | null }>(
      '/api/settings/spotify',
      { method: 'PUT', body: JSON.stringify({ clientId, clientSecret }) }
    ),

  importCatalog: (artistId: number, format: 'json' | 'csv', data: string) =>
    request<{ ok: boolean; addedReleases: number; addedSongs: number; linkedTracks: number }>(
      '/api/import/catalog',
      { method: 'POST', body: JSON.stringify({ artistId, format, data }) }
    ),

  exportUserData: () => request<Record<string, unknown>>('/api/export/userdata'),

  importUserData: (payload: unknown) =>
    request<{ ok: boolean; restoredRatings: number; restoredNotes: number }>(
      '/api/import/userdata',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
};

export function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—:—';
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
