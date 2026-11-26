export type VisibilityMode = 'everyone' | 'friends' | 'selected' | 'nobody';

export interface UserDTO {
  id: number;
  slug: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  ratingsVisibility: VisibilityMode;
  notesVisibility: VisibilityMode;
  connectionsVisibility: VisibilityMode;
  createdAt: string;
  isAdmin: boolean;
}

export const CATEGORIES = [
  'Studio Albums',
  'EPs',
  'Singles',
  'Mashups',
  'Covers',
  'Live Versions',
  'Remixes',
  'Alternate Versions',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type ReleaseType =
  | 'album'
  | 'deluxe_album'
  | 'ep'
  | 'single'
  | 'live'
  | 'compilation'
  | 'demo'
  | 'other';

export interface ImportPreferences {
  includeCore: boolean;
  includeDeluxe: boolean;
  includeLive: boolean;
  includeRemixes: boolean;
  includeAlternate: boolean;
}

export const DEFAULT_IMPORT_PREFS: ImportPreferences = {
  includeCore: true,
  includeDeluxe: true,
  includeLive: false,
  includeRemixes: false,
  includeAlternate: false,
};

export interface ArtistSummary {
  id: number;
  slug: string;
  name: string;
  image_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null;
  mb_id: string | null;
  deezer_id: string | null;
  itunes_id: string | null;
  import_prefs: ImportPreferences;
  last_synced_at: string | null;
  created_at: string;
  totalReleases: number;
  ratedReleases: number;
  totalSongs: number;
  ratedSongs: number;
  completionPercent: number;
  averageSongRating: number | null;
  averageReleaseRating: number | null;
}

export interface ArtistCandidate {
  name: string;
  imageUrl: string | null;
  spotifyId: string | null;
  spotifyUrl: string | null;
  mbId: string | null;
  deezerId: string | null;
  itunesId: string | null;
  albumCountHint: number | null;
  disambiguation: string | null;
  source: string;
}

export interface ImportJobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'error';
  percent: number;
  stage: string;
  processedReleases: number;
  totalReleases: number;
  artistId?: number;
  artistSlug?: string;
  artistName?: string;
  addedReleases?: number;
  addedSongs?: number;
  error?: string;
}

export interface BestReleaseBadge {
  id: number;
  slug: string;
  title: string;
}

export interface LinkedReleaseSummary {
  id: number;
  slug: string;
  title: string;
  category: Category;
  release_type: ReleaseType;
  release_date: string | null;
  release_year: number | null;
  cover_url: string | null;
  spotify_url: string | null;
  track_number: number;
  disc_number: number;
}

export interface SongDTO {
  id: number;
  artist_id: number;
  artist_name: string;
  artist_slug: string;
  canonical_key: string;
  title: string;
  version_tag: string | null;
  category: Category;
  is_alt_or_secondary: boolean;
  primary_release_id: number | null;
  primary_release_title: string | null;
  primary_release_slug: string | null;
  primary_release_date: string | null;
  primary_release_year: number | null;
  primary_release_type: ReleaseType | null;
  duration_ms: number | null;
  cover_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null;
  is_explicit: boolean;
  is_verified: boolean;
  verification_note: string | null;
  created_at: string;
  rating: number | null;
  rank_order: number | null;
  rating_updated_at: string | null;
  note: string;
  note_updated_at: string | null;
  releases: LinkedReleaseSummary[];
  best_of_releases: BestReleaseBadge[];
}

export interface ReleaseDTO {
  id: number;
  artist_id: number;
  artist_name: string;
  artist_slug: string;
  slug: string;
  title: string;
  category: Category;
  release_type: ReleaseType;
  release_date: string | null;
  release_year: number | null;
  cover_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null;
  is_alt_or_secondary: boolean;
  is_verified: boolean;
  verification_note: string | null;
  created_at: string;
  rating: number | null;
  rating_updated_at: string | null;
  note: string;
  note_updated_at: string | null;
  track_count: number;
  rated_track_count: number;
  average_track_rating: number | null;
  best_song_id: number | null;
  best_song_title: string | null;
}

export interface ReleaseTrackDTO extends SongDTO {
  track_number: number;
  disc_number: number;
  track_title_on_release: string | null;
}

export interface ReleaseDetailDTO extends ReleaseDTO {
  tracks: ReleaseTrackDTO[];
}

export interface CatalogReleaseSeed {
  slug: string;
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
  tracks: {
    canonical_key: string;
    track_number: number;
    disc_number: number;
    track_title_on_release: string;
    spotify_track_id_on_release: string | null;
  }[];
}

export interface CatalogSongSeed {
  canonical_key: string;
  title: string;
  version_tag: string | null;
  category: Category;
  primary_release_slug: string | null;
  duration_ms: number | null;
  cover_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null;
  is_explicit: boolean;
  is_verified: boolean;
  verification_note: string | null;
}

export interface CatalogFile {
  generated_at: string;
  releases: CatalogReleaseSeed[];
  songs: CatalogSongSeed[];
}
