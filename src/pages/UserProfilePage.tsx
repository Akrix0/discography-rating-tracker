import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Check,
  Copy,
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  HeartHandshake,
  Loader2,
  Lock,
  MessageSquare,
  Music2,
  Search,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { CATEGORY_LABELS } from '../i18n/translations';
import type { Category, PublicUserCard, PublicUserProfileResponse } from '../types';

type ProfileTab = 'songs' | 'releases' | 'friends' | 'followers' | 'following';

export function UserProfilePage() {
  const { idOrSlug } = useParams();
  const { user } = useAuth();
  const { t, lang } = usePreferences();

  const [data, setData] = useState<PublicUserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [busyConnUserId, setBusyConnUserId] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [tab, setTab] = useState<ProfileTab>('songs');
  const [artistFilter, setArtistFilter] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');
  const [connFilter, setConnFilter] = useState('');

  const loadProfile = useCallback(
    async (resetTabIfLocked = false) => {
      const key = (idOrSlug || '').trim();
      if (!key) {
        setError('Invalid user profile');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await api.getUserProfile(key);
        setData(res);
        setError(null);
        if (resetTabIfLocked) {
          if (!res.canViewRatings && !res.canViewNotes && res.canViewConnections) {
            setTab('friends');
          } else {
            setTab('songs');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t.errorText);
      } finally {
        setLoading(false);
      }
    },
    [idOrSlug, t.errorText]
  );

  useEffect(() => {
    setArtistFilter('all');
    setQ('');
    setConnFilter('');
    void loadProfile(true);
  }, [idOrSlug, loadProfile]);

  useEffect(() => {
    const onSocialUpdated = () => {
      void loadProfile(false);
    };
    window.addEventListener('dtr:social-updated', onSocialUpdated);
    return () => window.removeEventListener('dtr:social-updated', onSocialUpdated);
  }, [loadProfile]);

  if (
    user &&
    (idOrSlug === String(user.id) ||
      idOrSlug?.toLowerCase() === user.slug?.toLowerCase() ||
      (data && data.profile.id === user.id))
  ) {
    return <Navigate to="/profile" replace />;
  }

  const handleFollowToggle = async () => {
    if (!data) return;
    setFollowBusy(true);
    try {
      const key = data.profile.slug || data.profile.id;
      if (data.relationship.iFollow) {
        await api.unfollowUser(key);
      } else {
        await api.followUser(key);
      }
      await loadProfile(false);
      window.dispatchEvent(new CustomEvent('dtr:social-updated'));
    } finally {
      setFollowBusy(false);
    }
  };

  const handleConnectionFollowToggle = async (person: PublicUserCard) => {
    setBusyConnUserId(person.id);
    try {
      const key = person.slug || person.id;
      if (person.iFollow) {
        await api.unfollowUser(key);
      } else {
        await api.followUser(key);
      }
      await loadProfile(false);
      window.dispatchEvent(new CustomEvent('dtr:social-updated'));
    } finally {
      setBusyConnUserId(null);
    }
  };

  if (loading) {
    return <div className="h-56 rounded-3xl bg-[#13151c] animate-pulse" />;
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl bg-[#13151c] border border-[#d95d4e]/40 p-8 text-center space-y-3">
        <p className="text-[#e87c6f] font-medium">{error || t.errorText}</p>
        <Link to="/friends" className="text-sm text-[#e09f5a] hover:underline inline-block">
          {t.backToMyProfile}
        </Link>
      </div>
    );
  }

  const { profile, counts, relationship, canViewRatings, canViewNotes, canViewConnections } = data;
  const qLower = q.trim().toLowerCase();
  const connFilterLower = connFilter.trim().toLowerCase().replace(/^@/, '');

  const visibleSongs = data.ratedSongs.filter((s) => {
    if (artistFilter !== 'all' && s.artist_id !== artistFilter) return false;
    if (!qLower) return true;
    return (
      s.title.toLowerCase().includes(qLower) ||
      s.artist_name.toLowerCase().includes(qLower) ||
      (s.release_title || '').toLowerCase().includes(qLower)
    );
  });

  const visibleReleases = data.ratedReleases.filter((r) => {
    if (artistFilter !== 'all' && r.artist_id !== artistFilter) return false;
    if (!qLower) return true;
    return r.title.toLowerCase().includes(qLower) || r.artist_name.toLowerCase().includes(qLower);
  });

  const activeConnectionList =
    tab === 'friends'
      ? data.connections.friends
      : tab === 'followers'
      ? data.connections.followers
      : tab === 'following'
      ? data.connections.following
      : [];

  const filteredConnections = connFilterLower
    ? activeConnectionList.filter(
        (p) =>
          p.displayName.toLowerCase().includes(connFilterLower) ||
          p.slug.toLowerCase().includes(connFilterLower)
      )
    : activeConnectionList;

  const renderConnectionCard = (person: PublicUserCard) => {
    const isMe = user?.id === person.id;
    const profilePath = isMe ? '/profile' : `/users/${person.slug || person.id}`;
    const busy = busyConnUserId === person.id;

    return (
      <div
        key={person.id}
        className="rounded-xl bg-[#13151c] border border-white/[0.07] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3 min-w-0">
          <Link to={profilePath} className="shrink-0">
            {person.avatarUrl ? (
              <img
                src={person.avatarUrl}
                alt={person.displayName}
                className="w-11 h-11 rounded-xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-[#d95d4e]/20 border border-[#d95d4e]/30 flex items-center justify-center font-bold text-sm text-[#e09f5a] uppercase">
                {person.displayName.slice(0, 1)}
              </div>
            )}
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={profilePath}
                className="font-semibold text-sm text-[#f3efe6] hover:text-[#e09f5a] truncate transition-colors"
              >
                {person.displayName}
              </Link>
              <span className="font-mono-num text-[11px] text-[#6b7280] truncate">
                @{person.slug}
              </span>
              {isMe ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#e09f5a]/15 text-[#e09f5a] border border-[#e09f5a]/30">
                  {t.youBadge}
                </span>
              ) : person.isFriend ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#5fb38e]/15 text-[#5fb38e] border border-[#5fb38e]/30 inline-flex items-center gap-1">
                  <HeartHandshake className="w-3 h-3" />
                  {t.friendsBadge}
                </span>
              ) : person.iFollow ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#e09f5a]/15 text-[#e09f5a] border border-[#e09f5a]/30">
                  {t.followingBadge}
                </span>
              ) : person.followsMe ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-[#d1d5db] border border-white/15">
                  {t.followsYouBadge}
                </span>
              ) : null}
            </div>
            {person.bio && (
              <p className="text-xs text-[#9ca3af] line-clamp-2 mt-0.5">{person.bio}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={profilePath}
            className="h-8 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-[#f3efe6] inline-flex items-center justify-center transition-colors"
          >
            {t.openProfileBtn}
          </Link>
          {!isMe && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConnectionFollowToggle(person)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                person.iFollow
                  ? 'bg-white/[0.04] hover:bg-[#d95d4e]/20 text-[#9ca3af] hover:text-[#e87c6f] border-white/10'
                  : 'bg-[#d95d4e] hover:bg-[#c84d3e] text-white border-transparent'
              }`}
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : person.iFollow ? (
                <UserMinus className="w-3.5 h-3.5" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              <span>
                {person.iFollow
                  ? t.unfollowBtn
                  : person.followsMe
                  ? t.followBackBtn
                  : t.followBtn}
              </span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl">
      <div>
        <Link
          to="/friends"
          className="text-xs sm:text-sm text-[#9ca3af] hover:text-[#f3efe6] transition-colors"
        >
          {t.backToMyProfile}
        </Link>
      </div>

      {/* User Hero Card */}
      <section className="rounded-3xl bg-gradient-to-br from-[#171923] via-[#13151c] to-[#1a1418] border border-white/[0.08] p-4 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-start justify-between gap-5">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-[#1a1d27] border border-white/15 shrink-0 flex items-center justify-center">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-2xl sm:text-3xl font-bold text-[#e09f5a] uppercase">
                {profile.displayName.slice(0, 1)}
              </span>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-xl sm:text-3xl font-bold text-[#f3efe6] break-words">
                {profile.displayName}
              </h1>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/users/${profile.slug || profile.id}`
                    );
                    setCopiedUrl(true);
                    window.setTimeout(() => setCopiedUrl(false), 2000);
                  } catch {}
                }}
                className="px-2 py-0.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 font-mono-num text-[11px] text-[#9ca3af] hover:text-[#e09f5a] inline-flex items-center gap-1 transition-colors"
                title={t.copyMyLinkBtn}
              >
                {copiedUrl ? <Check className="w-3 h-3 text-[#5fb38e]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedUrl ? t.linkCopiedText : `@${profile.slug || profile.id}`}</span>
              </button>
              {relationship.isFriend ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#5fb38e]/15 text-[#5fb38e] border border-[#5fb38e]/30 inline-flex items-center gap-1">
                  <HeartHandshake className="w-3.5 h-3.5" />
                  {t.friendsBadge}
                </span>
              ) : relationship.followsMe ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-[#d1d5db] border border-white/15">
                  {t.followsYouBadge}
                </span>
              ) : null}
            </div>

            {profile.bio && (
              <p className="text-xs sm:text-sm text-[#d1d5db] whitespace-pre-wrap break-words max-w-2xl">
                {profile.bio}
              </p>
            )}

            {/* Clickable Social Counts */}
            {canViewConnections ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono-num">
                {(
                  [
                    { key: 'friends', label: `${counts.friends} ${t.tabFriends.toLowerCase()}` },
                    { key: 'followers', label: `${counts.followers} ${t.tabFollowers.toLowerCase()}` },
                    { key: 'following', label: `${counts.following} ${t.tabFollowing.toLowerCase()}` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={`px-2.5 py-1 rounded-lg border transition-colors ${
                      tab === item.key
                        ? 'bg-[#e09f5a]/20 text-[#e09f5a] border-[#e09f5a]/45'
                        : 'bg-white/[0.04] hover:bg-white/[0.1] text-[#d1d5db] border-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setTab('friends')}
                className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-[#9ca3af] inline-flex items-center gap-1.5 hover:text-[#f3efe6] transition-colors"
              >
                <Lock className="w-3 h-3" />
                <span>
                  {t.tabFriends} / {t.tabFollowers} / {t.tabFollowing}
                </span>
              </button>
            )}

            {/* 3 Independent Privacy Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border inline-flex items-center gap-1 ${
                  canViewRatings
                    ? 'bg-[#5fb38e]/15 text-[#5fb38e] border-[#5fb38e]/30'
                    : 'bg-white/[0.04] text-[#9ca3af] border-white/10'
                }`}
              >
                {canViewRatings ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {canViewRatings ? t.ratingsSharedBadge : t.ratingsPrivateBadge}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border inline-flex items-center gap-1 ${
                  canViewNotes
                    ? 'bg-[#e09f5a]/15 text-[#e09f5a] border-[#e09f5a]/30'
                    : 'bg-white/[0.04] text-[#9ca3af] border-white/10'
                }`}
              >
                {canViewNotes ? <MessageSquare className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {canViewNotes ? t.notesSharedBadge : t.notesPrivateBadge}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border inline-flex items-center gap-1 ${
                  canViewConnections
                    ? 'bg-[#7fa8d9]/15 text-[#9ec0e8] border-[#7fa8d9]/30'
                    : 'bg-white/[0.04] text-[#9ca3af] border-white/10'
                }`}
              >
                {canViewConnections ? <Users className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {canViewConnections ? t.connectionsSharedBadge : t.connectionsPrivateBadge}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={followBusy}
          onClick={() => void handleFollowToggle()}
          className={`w-full sm:w-auto justify-center h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 border transition-colors shrink-0 ${
            relationship.iFollow
              ? 'bg-white/[0.05] hover:bg-[#d95d4e]/20 text-[#f3efe6] hover:text-[#e87c6f] border-white/15'
              : 'bg-[#d95d4e] hover:bg-[#c84d3e] text-white border-transparent'
          }`}
        >
          {followBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : relationship.iFollow ? (
            <UserMinus className="w-4 h-4" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          <span>
            {relationship.iFollow
              ? t.unfollowBtn
              : relationship.followsMe
              ? t.followBackBtn
              : t.followBtn}
          </span>
        </button>
      </section>

      {/* Unified Profile Tabs */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-[#13151c] p-1 border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setTab('songs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === 'songs' ? 'bg-[#d95d4e] text-white' : 'text-[#9ca3af] hover:text-[#f3efe6]'
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>
                {t.songsRatedTab} ({canViewRatings || canViewNotes ? data.ratedSongs.length : '🔒'})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('releases')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === 'releases' ? 'bg-[#d95d4e] text-white' : 'text-[#9ca3af] hover:text-[#f3efe6]'
              }`}
            >
              <Disc3 className="w-3.5 h-3.5" />
              <span>
                {t.releasesRatedTab} ({canViewRatings || canViewNotes ? data.ratedReleases.length : '🔒'})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('friends')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === 'friends' ? 'bg-[#e09f5a] text-[#0b0c10]' : 'text-[#9ca3af] hover:text-[#f3efe6]'
              }`}
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              <span>
                {t.tabFriends} ({canViewConnections ? counts.friends : '🔒'})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('followers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === 'followers' ? 'bg-[#e09f5a] text-[#0b0c10]' : 'text-[#9ca3af] hover:text-[#f3efe6]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                {t.tabFollowers} ({canViewConnections ? counts.followers : '🔒'})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('following')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === 'following' ? 'bg-[#e09f5a] text-[#0b0c10]' : 'text-[#9ca3af] hover:text-[#f3efe6]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>
                {t.tabFollowing} ({canViewConnections ? counts.following : '🔒'})
              </span>
            </button>
          </div>

          {(tab === 'songs' || tab === 'releases') && (canViewRatings || canViewNotes) ? (
            <div className="flex flex-wrap items-center gap-2">
              {data.artists.length > 1 && (
                <select
                  value={artistFilter}
                  onChange={(e) =>
                    setArtistFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                  className="h-9 px-3 rounded-xl bg-[#13151c] border border-white/10 text-xs text-[#f3efe6] max-w-[180px]"
                >
                  <option value="all">{t.allArtists}</option>
                  {data.artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-[#6b7280] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t.searchSongsPlaceholder}
                  className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#13151c] border border-white/10 text-xs text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
                />
              </div>
            </div>
          ) : (tab === 'friends' || tab === 'followers' || tab === 'following') &&
            canViewConnections &&
            activeConnectionList.length > 0 ? (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#6b7280] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={connFilter}
                onChange={(e) => setConnFilter(e.target.value)}
                placeholder={t.filterConnectionsPlaceholder}
                className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#13151c] border border-white/10 text-xs text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
              />
            </div>
          ) : null}
        </div>

        {/* Ratings & Notes Tabs */}
        {(tab === 'songs' || tab === 'releases') && !canViewRatings && !canViewNotes ? (
          <div className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-8 sm:p-12 text-center space-y-2.5">
            <Lock className="w-10 h-10 text-[#6b7280] mx-auto" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.profileLockedTitle}
            </h2>
            <p className="text-xs sm:text-sm text-[#9ca3af] max-w-md mx-auto">
              {t.profileLockedSub}
            </p>
          </div>
        ) : tab === 'songs' ? (
          visibleSongs.length === 0 ? (
            <div className="rounded-2xl bg-[#13151c] border border-dashed border-white/10 p-8 text-center text-sm text-[#9ca3af]">
              {t.noSharedItems}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleSongs.map((song) => (
                <div
                  key={song.id}
                  className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-3.5 sm:p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#1a1d27] border border-white/10 shrink-0 flex items-center justify-center">
                        {song.cover_url ? (
                          <img src={song.cover_url} alt={song.title} className="w-full h-full object-cover" />
                        ) : (
                          <Disc3 className="w-6 h-6 text-[#4b5563]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#e09f5a] truncate">
                          {song.artist_name}
                        </div>
                        <div className="font-semibold text-sm sm:text-base text-[#f3efe6] break-words">
                          {song.title}
                          {song.version_tag && (
                            <span className="ml-1.5 text-xs text-[#e09f5a]">({song.version_tag})</span>
                          )}
                        </div>
                        <div className="text-xs text-[#9ca3af] flex flex-wrap items-center gap-2 mt-0.5">
                          <span>{CATEGORY_LABELS[lang][song.category as Category] || song.category}</span>
                          {song.release_title && <span>• {song.release_title}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canViewRatings && song.rating !== null && (
                        <span className="font-mono-num text-sm font-bold px-2.5 py-1 rounded-lg bg-[#5fb38e]/15 text-[#5fb38e] border border-[#5fb38e]/30">
                          {song.rating}/100
                        </span>
                      )}
                      {song.spotify_url && (
                        <a
                          href={song.spotify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 rounded-lg bg-[#1a1d27] border border-white/10 text-[#1DB954] flex items-center justify-center hover:bg-[#1DB954]/15"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {canViewNotes && song.note && (
                    <div className="rounded-xl bg-[#0b0c10]/70 border border-white/[0.06] px-3 py-2 text-xs sm:text-sm text-[#e5e0d5] whitespace-pre-wrap break-words flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-[#e09f5a] mt-0.5 shrink-0" />
                      <span>{song.note}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : tab === 'releases' ? (
          visibleReleases.length === 0 ? (
            <div className="rounded-2xl bg-[#13151c] border border-dashed border-white/10 p-8 text-center text-sm text-[#9ca3af]">
              {t.noSharedItems}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleReleases.map((rel) => (
                <div
                  key={rel.id}
                  className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#1a1d27] border border-white/10 shrink-0 flex items-center justify-center">
                        {rel.cover_url ? (
                          <img src={rel.cover_url} alt={rel.title} className="w-full h-full object-cover" />
                        ) : (
                          <Disc3 className="w-7 h-7 text-[#4b5563]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#e09f5a] truncate">
                          {rel.artist_name}
                        </div>
                        <div className="font-semibold text-sm sm:text-base text-[#f3efe6] break-words">
                          {rel.title}
                        </div>
                        <div className="text-xs text-[#9ca3af] mt-0.5">
                          {CATEGORY_LABELS[lang][rel.category as Category] || rel.category}
                          {rel.release_year ? ` • ${rel.release_year}` : ''}
                        </div>
                      </div>
                    </div>

                    {canViewRatings && rel.rating !== null && (
                      <span className="font-mono-num text-sm font-bold px-2.5 py-1 rounded-lg bg-[#e09f5a]/15 text-[#e09f5a] border border-[#e09f5a]/30 shrink-0">
                        {rel.rating}/100
                      </span>
                    )}
                  </div>

                  {canViewNotes && rel.note && (
                    <div className="rounded-xl bg-[#0b0c10]/70 border border-white/[0.06] px-3 py-2 text-xs sm:text-sm text-[#e5e0d5] whitespace-pre-wrap break-words flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-[#e09f5a] mt-0.5 shrink-0" />
                      <span>{rel.note}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : !canViewConnections ? (
          <div className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-8 sm:p-12 text-center space-y-2.5">
            <Lock className="w-10 h-10 text-[#6b7280] mx-auto" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.connectionsLockedTitle}
            </h2>
            <p className="text-xs sm:text-sm text-[#9ca3af] max-w-md mx-auto">
              {t.connectionsLockedSub}
            </p>
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="rounded-2xl bg-[#13151c] border border-dashed border-white/10 p-8 text-center text-sm text-[#9ca3af]">
            {connFilterLower
              ? t.noUsersFound
              : tab === 'friends'
              ? t.noFriendsYet
              : tab === 'followers'
              ? t.noFollowersYet
              : t.noFollowingYet}
          </div>
        ) : (
          <div className="space-y-2.5">{filteredConnections.map(renderConnectionCard)}</div>
        )}
      </div>
    </div>
  );
}
