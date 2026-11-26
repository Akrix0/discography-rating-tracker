import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  HeartHandshake,
  Loader2,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import type { PublicUserCard, SocialOverviewResponse } from '../types';

export function FriendsPage() {
  const { user } = useAuth();
  const { t } = usePreferences();

  const [social, setSocial] = useState<SocialOverviewResponse | null>(null);
  const [loadingSocial, setLoadingSocial] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUserCard[]>([]);
  const [searching, setSearching] = useState(true);
  const [connTab, setConnTab] = useState<'friends' | 'followers' | 'following'>('friends');
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadSocial = useCallback(async () => {
    setLoadingSocial(true);
    try {
      const data = await api.getSocialOverview();
      setSocial(data);
    } finally {
      setLoadingSocial(false);
    }
  }, []);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await api.searchUsers(q);
      setSearchResults(res.users);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void loadSocial();
    const onSocialUpdated = () => {
      void Promise.all([loadSocial(), runSearch(searchQuery)]);
    };
    window.addEventListener('dtr:social-updated', onSocialUpdated);
    return () => window.removeEventListener('dtr:social-updated', onSocialUpdated);
  }, [loadSocial, runSearch, searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch(searchQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery, runSearch]);

  const handleFollowToggle = async (person: PublicUserCard) => {
    setBusyUserId(person.id);
    try {
      if (person.iFollow) {
        await api.unfollowUser(person.slug || person.id);
      } else {
        await api.followUser(person.slug || person.id);
      }
      await Promise.all([loadSocial(), runSearch(searchQuery)]);
      window.dispatchEvent(new CustomEvent('dtr:social-updated'));
    } finally {
      setBusyUserId(null);
    }
  };

  const handleCopyMyLink = async () => {
    if (!user) return;
    const url = `${window.location.origin}/users/${user.slug || user.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const renderUserCard = (person: PublicUserCard) => {
    const busy = busyUserId === person.id;
    const profilePath = `/users/${person.slug || person.id}`;
    return (
      <div
        key={person.id}
        className="rounded-xl bg-[#0b0c10]/70 border border-white/[0.07] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
              {person.isFriend ? (
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
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleFollowToggle(person)}
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
        </div>
      </div>
    );
  };

  const friends = social?.friends || [];
  const followers = social?.followers || [];
  const following = social?.following || [];

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl">
      {/* Top Header + Quick Share & Profile Actions */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-[#f3efe6] break-words">
            {t.friendsPageTitle}
          </h1>
          <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">{t.friendsPageSub}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {user && (
            <button
              type="button"
              onClick={() => void handleCopyMyLink()}
              className="h-9 px-3 rounded-xl bg-[#13151c] hover:bg-[#1a1d27] border border-white/10 text-xs font-medium text-[#e09f5a] inline-flex items-center gap-1.5 transition-colors"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-[#5fb38e]" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="font-mono-num">
                {copiedLink ? t.linkCopiedText : `@${user.slug}`}
              </span>
            </button>
          )}
          <Link
            to="/profile"
            className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#f3efe6] inline-flex items-center gap-1.5 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5 text-[#5fb38e]" />
            <span>{t.editMyProfileBtn}</span>
          </Link>
        </div>
      </div>

      {/* Prominent Find People Search Card RIGHT AT THE TOP */}
      <section className="rounded-2xl bg-gradient-to-br from-[#171923] via-[#13151c] to-[#1a1418] border border-white/[0.1] p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-[#e09f5a] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.findPeopleHeroTitle}
            </h2>
          </div>
          <span className="text-[11px] text-[#9ca3af] font-mono-num">
            {t.foundCount} {searchResults.length}
          </span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPeopleBySlugPlaceholder}
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#0b0c10] border border-white/15 text-sm text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
          />
        </div>

        {searching ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#e09f5a]" />
          </div>
        ) : searchResults.length === 0 ? (
          <div className="rounded-xl bg-[#0b0c10]/50 border border-dashed border-white/10 p-6 text-center text-xs sm:text-sm text-[#9ca3af]">
            {t.noUsersFound}
          </div>
        ) : (
          <div className="space-y-2.5">{searchResults.map(renderUserCard)}</div>
        )}
      </section>

      {/* Connections Tabs */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#5fb38e] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.friendsSectionTitle}
            </h2>
          </div>
          <p className="text-xs text-[#9ca3af] mt-1">{t.friendsMutualHint}</p>
        </div>

        <div className="grid grid-cols-3 sm:inline-flex gap-1 rounded-xl bg-[#0b0c10] p-1 border border-white/[0.08]">
          {(
            [
              { key: 'friends', label: `${t.tabFriends} (${friends.length})` },
              { key: 'followers', label: `${t.tabFollowers} (${followers.length})` },
              { key: 'following', label: `${t.tabFollowing} (${following.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setConnTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors text-center truncate ${
                connTab === tab.key
                  ? 'bg-[#d95d4e] text-white'
                  : 'text-[#9ca3af] hover:text-[#f3efe6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loadingSocial ? (
          <div className="h-24 rounded-xl bg-[#0b0c10]/50 animate-pulse" />
        ) : connTab === 'friends' ? (
          friends.length === 0 ? (
            <div className="rounded-xl bg-[#0b0c10]/50 border border-dashed border-white/10 p-6 text-center text-xs sm:text-sm text-[#9ca3af]">
              {t.noFriendsYet}
            </div>
          ) : (
            <div className="space-y-2.5">{friends.map(renderUserCard)}</div>
          )
        ) : connTab === 'followers' ? (
          followers.length === 0 ? (
            <div className="rounded-xl bg-[#0b0c10]/50 border border-dashed border-white/10 p-6 text-center text-xs sm:text-sm text-[#9ca3af]">
              {t.noFollowersYet}
            </div>
          ) : (
            <div className="space-y-2.5">{followers.map(renderUserCard)}</div>
          )
        ) : following.length === 0 ? (
          <div className="rounded-xl bg-[#0b0c10]/50 border border-dashed border-white/10 p-6 text-center text-xs sm:text-sm text-[#9ca3af]">
            {t.noFollowingYet}
          </div>
        ) : (
          <div className="space-y-2.5">{following.map(renderUserCard)}</div>
        )}
      </section>
    </div>
  );
}
