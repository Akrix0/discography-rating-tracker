export type VisibilityMode = 'everyone' | 'friends' | 'selected' | 'nobody';

export interface AuthUser {
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
  isAdmin?: boolean;
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

export const CATEGORY_META: Record<
  Category,
  { ukLabel: string; shortUk: string; accentClass: string; badgeBg: string }
> = {
  'Studio Albums': {
    ukLabel: 'Студійні альбоми',
    shortUk: 'Альбом',
    accentClass: 'text-[#e09f5a]',
    badgeBg: 'bg-[#e09f5a]/15 text-[#e09f5a] border-[#e09f5a]/30',
  },
  EPs: {
    ukLabel: 'Мініальбоми',
    shortUk: 'EP',
    accentClass: 'text-[#d98c5f]',
    badgeBg: 'bg-[#d98c5f]/15 text-[#d98c5f] border-[#d98c5f]/30',
  },
  Singles: {
    ukLabel: 'Сингли',
    shortUk: 'Сингл',
    accentClass: 'text-[#d95d4e]',
    badgeBg: 'bg-[#d95d4e]/15 text-[#e87c6f] border-[#d95d4e]/30',
  },
  Mashups: {
    ukLabel: 'Мешапи',
    shortUk: 'Мешап',
    accentClass: 'text-[#c97bb2]',
    badgeBg: 'bg-[#c97bb2]/15 text-[#dca0ca] border-[#c97bb2]/30',
  },
  Covers: {
    ukLabel: 'Кавери',
    shortUk: 'Кавер',
    accentClass: 'text-[#7fa8d9]',
    badgeBg: 'bg-[#7fa8d9]/15 text-[#9ec0e8] border-[#7fa8d9]/30',
  },
  'Live Versions': {
    ukLabel: 'Концертні версії',
    shortUk: 'Live',
    accentClass: 'text-[#5fb38e]',
    badgeBg: 'bg-[#5fb38e]/15 text-[#7cc9a7] border-[#5fb38e]/30',
  },
  Remixes: {
    ukLabel: 'Ремікси',
    shortUk: 'Ремікс',
    accentClass: 'text-[#9d8be0]',
    badgeBg: 'bg-[#9d8be0]/15 text-[#b8aaee] border-[#9d8be0]/30',
  },
  'Alternate Versions': {
    ukLabel: 'Альтернативні версії',
    shortUk: 'Альт.',
    accentClass: 'text-[#d9b45f]',
    badgeBg: 'bg-[#d9b45f]/15 text-[#e6c97f] border-[#d9b45f]/30',
  },
  Other: {
    ukLabel: 'Інші релізи',
    shortUk: 'Інше',
    accentClass: 'text-[#9ca3af]',
    badgeBg: 'bg-white/10 text-[#cbd5e1] border-white/15',
  },
};

export type ReleaseType =
  | 'album'
  | 'deluxe_album'
  | 'ep'
  | 'single'
  | 'live'
  | 'compilation'
  | 'demo'
  | 'other';

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  album: 'Альбом',
  deluxe_album: 'Deluxe / Extended альбом',
  ep: 'EP (мініальбом)',
  single: 'Сингл',
  live: 'Live-запис',
  compilation: 'Збірка',
  demo: 'Демо-альбом',
  other: 'Інше',
};

export interface ImportPreferences {
  includeCore: boolean;
  includeDeluxe: boolean;
  includeLive: boolean;
  includeRemixes: boolean;
  includeAlternate: boolean;
}

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

export interface Song {
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

export interface Release {
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

export interface ReleaseTrack extends Song {
  track_number: number;
  disc_number: number;
  track_title_on_release: string | null;
}

export interface ReleaseDetail extends Release {
  tracks: ReleaseTrack[];
}

export interface StatsResponse {
  totalSongs: number;
  ratedSongs: number;
  completionPercent: number;
  averageSongRating: number | null;
  totalReleases: number;
  ratedReleases: number;
  releaseCompletionPercent: number;
  averageReleaseRating: number | null;
  categoryBreakdown: {
    category: Category;
    total: number;
    rated: number;
    avgRating: number | null;
  }[];
  topSongs: Song[];
  topAlbums: Release[];
  nextUnratedSongs: Song[];
}

export interface GlobalStatsResponse {
  totalArtists: number;
  totalSongs: number;
  ratedSongs: number;
  completionPercent: number;
  totalReleases: number;
  ratedReleases: number;
  overallAverageSongRating: number | null;
  overallAverageReleaseRating: number | null;
  artistLeaderboard: ArtistSummary[];
  globalTopSongs: Song[];
  globalTopAlbums: Release[];
}

export interface FilterMetaResponse {
  categories: Category[];
  years: number[];
  songCategoryCounts: Record<string, number>;
  releaseCategoryCounts: Record<string, number>;
  releaseTypes: { release_type: ReleaseType; count: number }[];
}

export interface FilterState {
  q: string;
  categories: Category[];
  releaseTypes: ReleaseType[];
  ratedStatus: 'all' | 'rated' | 'unrated';
  minRating: number;
  maxRating: number;
  year: string;
  hideSecondary: boolean;
  sortBy: 'release_date' | 'title' | 'rating' | 'created_at';
  sortDir: 'asc' | 'desc';
}

export interface AdminVisitorSession {
  visitorIdShort: string;
  userId: number | null;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  currentPath: string;
  country: string | null;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  referrer: string | null;
  pageViews: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isOnline: boolean;
}

export interface AdminUserActivity {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  lastPath: string | null;
  artistsCount: number;
  songRatingsCount: number;
  releaseRatingsCount: number;
  notesCount: number;
  totalPageViews: number;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  createdAt: string;
}

export interface AdminAnalyticsResponse {
  generatedAt: string;
  summary: {
    onlineTotal: number;
    onlineUsers: number;
    onlineGuests: number;
    visitors24h: number;
    pageViews24h: number;
    visitors7d: number;
    pageViews7d: number;
    visitors30d: number;
    pageViews30d: number;
    totalVisitorsAllTime: number;
    totalUsers: number;
    totalSongRatings: number;
    totalReleaseRatings: number;
    totalNotes: number;
  };
  onlineNow: AdminVisitorSession[];
  dailySeries: { date: string; uniqueVisitors: number; pageViews: number }[];
  users: AdminUserActivity[];
  recentVisitors: AdminVisitorSession[];
  breakdowns: {
    devices: { label: string; count: number }[];
    browsers: { label: string; count: number }[];
    countries: { label: string; count: number }[];
    topPaths: { path: string; views: number }[];
  };
}

export interface PublicUserCard {
  id: number;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  iFollow: boolean;
  followsMe: boolean;
  isFriend: boolean;
  createdAt: string;
}

export interface PrivacySettings {
  ratingsVisibility: VisibilityMode;
  notesVisibility: VisibilityMode;
  connectionsVisibility: VisibilityMode;
  selectedRatingsFriendIds: number[];
  selectedNotesFriendIds: number[];
  selectedConnectionsFriendIds: number[];
}

export interface SocialOverviewResponse {
  friends: PublicUserCard[];
  followers: PublicUserCard[];
  following: PublicUserCard[];
  privacy: PrivacySettings;
}

export interface NotificationItem {
  id: number;
  type: 'new_follower' | 'became_friends';
  isRead: boolean;
  createdAt: string;
  actor: PublicUserCard;
}

export interface NotificationsResponse {
  unreadCount: number;
  notifications: NotificationItem[];
}

export interface PublicRatedSong {
  id: number;
  title: string;
  version_tag: string | null;
  category: string;
  cover_url: string | null;
  spotify_url: string | null;
  artist_id: number;
  artist_name: string;
  release_title: string | null;
  release_slug: string | null;
  rating: number | null;
  note: string | null;
  best_of_releases: BestReleaseBadge[];
  updatedAt: string;
}

export interface PublicRatedRelease {
  id: number;
  slug: string;
  title: string;
  category: string;
  release_type: string;
  release_year: number | null;
  cover_url: string | null;
  spotify_url: string | null;
  artist_id: number;
  artist_name: string;
  rating: number | null;
  note: string | null;
  best_song_title: string | null;
  updatedAt: string;
}

export interface PublicUserProfileResponse {
  profile: {
    id: number;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    ratingsVisibility: VisibilityMode;
    notesVisibility: VisibilityMode;
    connectionsVisibility: VisibilityMode;
    createdAt: string;
  };
  counts: {
    friends: number;
    followers: number;
    following: number;
  };
  relationship: {
    iFollow: boolean;
    followsMe: boolean;
    isFriend: boolean;
  };
  canViewRatings: boolean;
  canViewNotes: boolean;
  canViewConnections: boolean;
  connections: {
    friends: PublicUserCard[];
    followers: PublicUserCard[];
    following: PublicUserCard[];
  };
  artists: {
    id: number;
    name: string;
    slug: string;
    image_url: string | null;
    totalSongs: number;
    ratedSongs: number;
    averageSongRating: number | null;
  }[];
  ratedSongs: PublicRatedSong[];
  ratedReleases: PublicRatedRelease[];
}
