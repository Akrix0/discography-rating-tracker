import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  HeartHandshake,
  Loader2,
  Lock,
  MessageSquare,
  Search,
  Trash2,
  UserPlus,
  Users,
  UserMinus,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import type {
  PrivacySettings,
  PublicUserCard,
  SocialOverviewResponse,
  VisibilityMode,
} from '../types';

async function resizeImageToDataUrl(file: File): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Invalid image file'));
      i.src = bitmapUrl;
    });

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unsupported');

    const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - minSide) / 2;
    const sy = ((img.naturalHeight || img.height) - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

    const webp = canvas.toDataURL('image/webp', 0.84);
    if (webp.startsWith('data:image/webp') && webp.length <= 135_000) return webp;
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const { t, lang } = usePreferences();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [social, setSocial] = useState<SocialOverviewResponse | null>(null);
  const [loadingSocial, setLoadingSocial] = useState(true);
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    ratingsVisibility: user?.ratingsVisibility || 'everyone',
    notesVisibility: user?.notesVisibility || 'nobody',
    selectedRatingsFriendIds: [],
    selectedNotesFriendIds: [],
  });
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyMsg, setPrivacyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'friends' | 'followers' | 'following' | 'search'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUserCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [copiedMySlug, setCopiedMySlug] = useState(false);

  const bioRef = useRef<HTMLTextAreaElement | null>(null);
  const hasAutoPickedTabRef = useRef(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  useLayoutEffect(() => {
    const el = bioRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(76, el.scrollHeight + 2)}px`;
  }, [bio]);

  const loadSocial = useCallback(async () => {
    setLoadingSocial(true);
    try {
      const data = await api.getSocialOverview();
      setSocial(data);
      setPrivacy(data.privacy);
      if (!hasAutoPickedTabRef.current) {
        hasAutoPickedTabRef.current = true;
        if (data.friends.length === 0 && data.followers.length === 0) {
          setActiveTab('search');
        }
      }
    } finally {
      setLoadingSocial(false);
    }
  }, []);

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

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
    if (activeTab !== 'search') return;
    const timer = window.setTimeout(() => {
      void runSearch(searchQuery);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activeTab, searchQuery, runSearch]);

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarUrl(dataUrl);
      setProfileMsg(null);
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: err instanceof Error ? err.message : t.errorText,
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await api.updateProfile({
        displayName,
        bio,
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });
      await refreshMe();
      setProfileMsg({ type: 'ok', text: t.profileSavedMsg });
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: err instanceof Error ? err.message : t.errorText,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePrivacy = async () => {
    setSavingPrivacy(true);
    setPrivacyMsg(null);
    try {
      const res = await api.updatePrivacy(privacy);
      setPrivacy(res.privacy);
      await refreshMe();
      setPrivacyMsg({ type: 'ok', text: t.privacySavedMsg });
    } catch (err) {
      setPrivacyMsg({
        type: 'err',
        text: err instanceof Error ? err.message : t.errorText,
      });
    } finally {
      setSavingPrivacy(false);
    }
  };

  const toggleFriendSelection = (scope: 'ratings' | 'notes', friendId: number) => {
    setPrivacy((prev) => {
      const key = scope === 'ratings' ? 'selectedRatingsFriendIds' : 'selectedNotesFriendIds';
      const exists = prev[key].includes(friendId);
      return {
        ...prev,
        [key]: exists ? prev[key].filter((id) => id !== friendId) : [...prev[key], friendId],
      };
    });
    setPrivacyMsg(null);
  };

  const handleFollowToggle = async (target: PublicUserCard) => {
    setBusyUserId(target.id);
    try {
      if (target.iFollow) {
        await api.unfollowUser(target.id);
      } else {
        await api.followUser(target.id);
      }
      await loadSocial();
      if (activeTab === 'search') {
        await runSearch(searchQuery);
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const visibilityOptions: { key: VisibilityMode; label: string }[] = [
    { key: 'everyone', label: t.visEveryone },
    { key: 'friends', label: t.visFriends },
    { key: 'selected', label: t.visSelected },
    { key: 'nobody', label: t.visNobody },
  ];

  const friends = social?.friends || [];
  const followers = social?.followers || [];
  const following = social?.following || [];

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

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-[#f3efe6] break-words">
            {t.profileTitle}
          </h1>
          <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">{t.profileSub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num shrink-0">
          {user?.slug && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}/users/${user.slug}`);
                  setCopiedMySlug(true);
                  window.setTimeout(() => setCopiedMySlug(false), 2000);
                } catch {}
              }}
              className="px-2.5 py-1 rounded-full bg-[#e09f5a]/15 hover:bg-[#e09f5a]/25 text-[#e09f5a] border border-[#e09f5a]/30 inline-flex items-center gap-1 transition-colors"
            >
              {copiedMySlug ? <Check className="w-3 h-3 text-[#5fb38e]" /> : <Copy className="w-3 h-3" />}
              <span>{copiedMySlug ? t.linkCopiedText : `/users/${user.slug}`}</span>
            </button>
          )}
          <Link
            to="/friends"
            className="px-2.5 py-1 rounded-full bg-[#d95d4e] hover:bg-[#c84d3e] text-white font-semibold transition-colors"
          >
            {t.goToFriendsSearchBtn}
          </Link>
        </div>
      </div>

      {/* Avatar, Nickname & Bio Editor */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-5">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-[#1a1d27] border border-white/15 shrink-0 flex items-center justify-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName || user?.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-display text-2xl sm:text-3xl font-bold text-[#e09f5a] uppercase">
                  {(displayName || user?.displayName || '?').slice(0, 1)}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 w-full space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#f3efe6] inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                  <Camera className="w-3.5 h-3.5 text-[#e09f5a]" />
                  <span>{t.uploadAvatarBtn}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleAvatarFile(e.target.files?.[0])}
                  />
                </label>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-[#d95d4e]/20 border border-white/10 text-xs text-[#9ca3af] hover:text-[#e87c6f] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.removeAvatarBtn}</span>
                  </button>
                )}
              </div>

              <input
                type="text"
                value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder={
                  avatarUrl.startsWith('data:')
                    ? lang === 'uk'
                      ? 'Завантажено власне фото (вставте URL щоб замінити)'
                      : 'Custom photo uploaded (paste URL to replace)'
                    : t.avatarUrlPlaceholder
                }
                className="w-full h-9 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-xs text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#9ca3af] mb-1.5">{t.displayNameField}</label>
              <input
                type="text"
                required
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9ca3af] mb-1.5">{t.emailField}</label>
              <div className="h-10 px-3 rounded-xl bg-[#0b0c10]/60 border border-white/[0.07] text-sm text-[#9ca3af] flex items-center justify-between gap-2">
                <span className="truncate">{user?.email}</span>
                <Link to="/settings" className="text-[11px] text-[#e09f5a] hover:underline shrink-0">
                  {t.navSettings}
                </Link>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-[#9ca3af] mb-1.5">
              <label>{t.bioLabel}</label>
              <span className="font-mono-num text-[11px] text-[#6b7280]">{bio.length}/500</span>
            </div>
            <textarea
              ref={bioRef}
              rows={2}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t.bioPlaceholder}
              className="w-full resize-y overflow-hidden rounded-xl bg-[#0b0c10] border border-white/10 p-3 text-sm text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingProfile}
              className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-[#e09f5a] hover:bg-[#d18f49] disabled:opacity-50 text-[#0b0c10] text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{t.saveProfileBtn}</span>
            </button>

            {profileMsg && (
              <div
                className={`text-xs flex items-center gap-1.5 ${
                  profileMsg.type === 'ok' ? 'text-[#5fb38e]' : 'text-[#e87c6f]'
                }`}
              >
                {profileMsg.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{profileMsg.text}</span>
              </div>
            )}
          </div>
        </form>
      </section>

      {/* Granular Independent Privacy Section */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#5fb38e] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.privacyTitle}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">{t.privacySub}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Ratings Privacy */}
          <div className="rounded-xl bg-[#0b0c10]/70 border border-white/[0.07] p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f3efe6]">
              <Eye className="w-4 h-4 text-[#e09f5a] shrink-0" />
              <span>{t.whoCanSeeRatings}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {visibilityOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPrivacy((p) => ({ ...p, ratingsVisibility: opt.key }));
                    setPrivacyMsg(null);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                    privacy.ratingsVisibility === opt.key
                      ? 'bg-[#e09f5a]/20 text-[#e09f5a] border-[#e09f5a]/50'
                      : 'bg-white/[0.03] text-[#9ca3af] border-white/10 hover:text-[#f3efe6]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {privacy.ratingsVisibility === 'selected' && (
              <div className="pt-2 border-t border-white/[0.06] space-y-2">
                <div className="text-[11px] text-[#9ca3af]">{t.selectFriendsLabel}</div>
                {friends.length === 0 ? (
                  <p className="text-xs text-[#6b7280]">{t.noMutualFriendsForSelect}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {friends.map((fr) => {
                      const checked = privacy.selectedRatingsFriendIds.includes(fr.id);
                      return (
                        <button
                          key={fr.id}
                          type="button"
                          onClick={() => toggleFriendSelection('ratings', fr.id)}
                          className={`px-2.5 py-1 rounded-full text-xs border inline-flex items-center gap-1.5 transition-colors ${
                            checked
                              ? 'bg-[#5fb38e]/20 text-[#5fb38e] border-[#5fb38e]/45'
                              : 'bg-white/[0.03] text-[#9ca3af] border-white/10 hover:text-[#f3efe6]'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                          <span>{fr.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes Privacy */}
          <div className="rounded-xl bg-[#0b0c10]/70 border border-white/[0.07] p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f3efe6]">
              <MessageSquare className="w-4 h-4 text-[#d95d4e] shrink-0" />
              <span>{t.whoCanSeeNotes}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {visibilityOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPrivacy((p) => ({ ...p, notesVisibility: opt.key }));
                    setPrivacyMsg(null);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                    privacy.notesVisibility === opt.key
                      ? 'bg-[#d95d4e]/20 text-[#e87c6f] border-[#d95d4e]/50'
                      : 'bg-white/[0.03] text-[#9ca3af] border-white/10 hover:text-[#f3efe6]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {privacy.notesVisibility === 'selected' && (
              <div className="pt-2 border-t border-white/[0.06] space-y-2">
                <div className="text-[11px] text-[#9ca3af]">{t.selectFriendsLabel}</div>
                {friends.length === 0 ? (
                  <p className="text-xs text-[#6b7280]">{t.noMutualFriendsForSelect}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {friends.map((fr) => {
                      const checked = privacy.selectedNotesFriendIds.includes(fr.id);
                      return (
                        <button
                          key={fr.id}
                          type="button"
                          onClick={() => toggleFriendSelection('notes', fr.id)}
                          className={`px-2.5 py-1 rounded-full text-xs border inline-flex items-center gap-1.5 transition-colors ${
                            checked
                              ? 'bg-[#5fb38e]/20 text-[#5fb38e] border-[#5fb38e]/45'
                              : 'bg-white/[0.03] text-[#9ca3af] border-white/10 hover:text-[#f3efe6]'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                          <span>{fr.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={savingPrivacy}
            onClick={() => void handleSavePrivacy()}
            className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-[#5fb38e] hover:bg-[#4ea07c] disabled:opacity-50 text-[#0b0c10] text-sm font-bold inline-flex items-center gap-2 transition-colors"
          >
            {savingPrivacy && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{t.savePrivacyBtn}</span>
          </button>

          {privacyMsg && (
            <div
              className={`text-xs flex items-center gap-1.5 ${
                privacyMsg.type === 'ok' ? 'text-[#5fb38e]' : 'text-[#e87c6f]'
              }`}
            >
              {privacyMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{privacyMsg.text}</span>
            </div>
          )}
        </div>
      </section>

      {/* Friends & Subscriptions */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#e09f5a] shrink-0" />
              <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
                {t.friendsSectionTitle}
              </h2>
            </div>
            <p className="text-xs text-[#9ca3af] mt-1">{t.friendsMutualHint}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:inline-flex gap-1 rounded-xl bg-[#0b0c10] p-1 border border-white/[0.08]">
          {(
            [
              { key: 'friends', label: `${t.tabFriends} (${friends.length})` },
              { key: 'followers', label: `${t.tabFollowers} (${followers.length})` },
              { key: 'following', label: `${t.tabFollowing} (${following.length})` },
              { key: 'search', label: t.tabFindPeople },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors text-center truncate ${
                activeTab === tab.key
                  ? 'bg-[#d95d4e] text-white'
                  : 'text-[#9ca3af] hover:text-[#f3efe6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'search' && (
          <div className="relative">
            <Search className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPeopleBySlugPlaceholder}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
            />
          </div>
        )}

        {loadingSocial ? (
          <div className="h-24 rounded-xl bg-[#0b0c10]/50 animate-pulse" />
        ) : activeTab === 'friends' ? (
          friends.length === 0 ? (
            <div className="rounded-xl bg-[#0b0c10]/50 border border-dashed border-white/10 p-6 text-center text-xs sm:text-sm text-[#9ca3af]">
              {t.noFriendsYet}
            </div>
          ) : (
            <div className="space-y-2.5">{friends.map(renderUserCard)}</div>
          )
        ) : activeTab === 'followers' ? (
          followers.length === 0 ? (
            <div className="rounded-xl bg-[#0b0c10]/50 border border-dashed border-white/10 p-6 text-center text-xs sm:text-sm text-[#9ca3af]">
              {t.noFollowersYet}
            </div>
          ) : (
            <div className="space-y-2.5">{followers.map(renderUserCard)}</div>
          )
        ) : activeTab === 'following' ? (
          following.length === 0 ? (
            <div className="rounded-xl bg-[#0b0c10]/50 border border-dashed border-white/10 p-6 text-center text-xs sm:text-sm text-[#9ca3af]">
              {t.noFollowingYet}
            </div>
          ) : (
            <div className="space-y-2.5">{following.map(renderUserCard)}</div>
          )
        ) : searching ? (
          <div className="py-8 flex justify-center">
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
    </div>
  );
}
