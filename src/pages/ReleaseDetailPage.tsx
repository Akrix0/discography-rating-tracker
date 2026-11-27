import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  ListMusic,
  Loader2,
  Radio,
  Trophy,
} from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import { usePreferences } from '../context/PreferencesContext';
import { CATEGORY_LABELS, RELEASE_TYPE_I18N } from '../i18n/translations';
import { CATEGORY_META, type ReleaseDetail } from '../types';
import { RatingControl } from '../components/RatingControl';
import { SongRow } from '../components/SongRow';
import { Tooltip } from '../components/Tooltip';
import { btnSecondary } from '../components/ui/buttonStyles';

export function ReleaseDetailPage() {
  const { idOrSlug } = useParams();
  const { refreshArtists, setSelectedArtistId } = useArtist();
  const { t, lang, theme } = usePreferences();
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAlbumPlayer, setShowAlbumPlayer] = useState(false);
  const [bestTrackBusyId, setBestTrackBusyId] = useState<number | null>(null);
  const [hideBusy, setHideBusy] = useState(false);

  const loadRelease = useCallback(async () => {
    if (!idOrSlug) return;
    setLoading(true);
    try {
      const data = await api.getReleaseDetail(idOrSlug);
      setRelease(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'uk'
            ? 'Не вдалося завантажити реліз'
            : 'Failed to load release'
      );
    } finally {
      setLoading(false);
    }
  }, [idOrSlug, lang]);

  useEffect(() => {
    void loadRelease();
  }, [loadRelease]);

  if (loading) {
    return <div className="h-72 rounded-3xl bg-[#13151c] animate-pulse" />;
  }

  if (error || !release) {
    return (
      <div className="rounded-2xl bg-[#13151c] border border-[#d95d4e]/40 p-8 text-center space-y-3">
        <p className="text-[#e87c6f] font-medium">
          {error || (lang === 'uk' ? 'Реліз не знайдено' : 'Release not found')}
        </p>
        <Link to="/releases" className="text-sm text-[#e09f5a] hover:underline inline-block">
          ← {t.allReleasesBack}
        </Link>
      </div>
    );
  }

  const catMeta = CATEGORY_META[release.category] || CATEGORY_META.Other;
  const showVerificationNote =
    Boolean(release.verification_note) &&
    !release.spotify_id &&
    !release.verification_note?.startsWith('Перевірено через');

  const discGroups: { discNumber: number; tracks: typeof release.tracks }[] = [];
  for (const track of release.tracks) {
    const discNum = track.disc_number || 1;
    const lastGroup = discGroups[discGroups.length - 1];
    if (lastGroup && lastGroup.discNumber === discNum) {
      lastGroup.tracks.push(track);
    } else {
      const existingGroup = discGroups.find((g) => g.discNumber === discNum);
      if (existingGroup) {
        existingGroup.tracks.push(track);
      } else {
        discGroups.push({ discNumber: discNum, tracks: [track] });
      }
    }
  }
  discGroups.sort((a, b) => a.discNumber - b.discNumber);
  const isMultiDisc = discGroups.length > 1;

  const handleSongUpdated = (
    songId: number,
    patch: { rating?: number | null; note?: string }
  ) => {
    setRelease((prev) => {
      if (!prev) return prev;
      const tracks = prev.tracks.map((tr) =>
        tr.id === songId
          ? {
              ...tr,
              ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
              ...(patch.note !== undefined ? { note: patch.note } : {}),
            }
          : tr
      );
      const rated = tracks.filter((tr) => tr.rating !== null);
      const avg =
        rated.length > 0
          ? Math.round((rated.reduce((sum, tr) => sum + (tr.rating || 0), 0) / rated.length) * 10) / 10
          : null;
      return {
        ...prev,
        tracks,
        rated_track_count: rated.length,
        average_track_rating: avg,
      };
    });
    void refreshArtists();
  };

  const handleToggleBestTrack = async (songId: number) => {
    const nextSongId = release.best_song_id === songId ? null : songId;
    setBestTrackBusyId(songId);
    try {
      const res = await api.setReleaseBestTrack(release.id, nextSongId);
      setRelease((prev) => {
        if (!prev) return prev;
        const tracks = prev.tracks.map((tr) => {
          const withoutCurrent = (tr.best_of_releases || []).filter((b) => b.id !== prev.id);
          if (res.bestSongId === tr.id) {
            return {
              ...tr,
              rating: res.songRating ?? 100,
              best_of_releases: [
                ...withoutCurrent,
                { id: prev.id, slug: prev.slug, title: prev.title },
              ],
            };
          }
          return {
            ...tr,
            best_of_releases: withoutCurrent,
          };
        });
        const rated = tracks.filter((tr) => tr.rating !== null);
        const avg =
          rated.length > 0
            ? Math.round((rated.reduce((sum, tr) => sum + (tr.rating || 0), 0) / rated.length) * 10) / 10
            : null;
        return {
          ...prev,
          best_song_id: res.bestSongId,
          best_song_title: res.bestSongTitle,
          tracks,
          rated_track_count: rated.length,
          average_track_rating: avg,
        };
      });
      void refreshArtists();
    } finally {
      setBestTrackBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          to="/releases"
          className="inline-flex items-center gap-1.5 text-sm text-[#9ca3af] hover:text-[#f3efe6] transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.allReleasesBack}</span>
        </Link>
        <Link
          to="/"
          onClick={() => setSelectedArtistId(release.artist_id)}
          className="text-xs font-semibold text-[#e09f5a] hover:underline truncate max-w-full"
        >
          {t.artistLabel} {release.artist_name} →
        </Link>
      </div>

      <section className="rounded-3xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-start">
          <div className="md:col-span-4 lg:col-span-3">
            <div className="max-w-[220px] sm:max-w-[260px] md:max-w-none mx-auto md:mx-0 aspect-square rounded-2xl overflow-hidden bg-[#1a1d27] border border-white/10 shadow-2xl shadow-black/60 flex items-center justify-center">
              {release.cover_url ? (
                <img
                  src={release.cover_url}
                  alt={release.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc3 className="w-20 h-20 text-[#374151]" />
              )}
            </div>
          </div>

          <div className="md:col-span-8 lg:col-span-9 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e09f5a]/15 text-[#e09f5a] border border-[#e09f5a]/30">
                  {release.artist_name}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${catMeta.badgeBg}`}>
                  {CATEGORY_LABELS[lang][release.category] || release.category}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-white/[0.06] text-[#d1d5db] border border-white/10">
                  {RELEASE_TYPE_I18N[lang][release.release_type] || release.release_type}
                </span>
              </div>

              <h1 className="font-display text-xl sm:text-3xl lg:text-4xl font-bold text-[#f3efe6] break-words">
                {release.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-[#9ca3af]">
                <span className="inline-flex items-center gap-1.5 font-mono-num">
                  <Calendar className="w-4 h-4 text-[#6b7280]" />
                  {release.release_date || release.release_year || t.dateUnknown}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono-num">
                  <ListMusic className="w-4 h-4 text-[#6b7280]" />
                  {t.tracksRatedSummary(release.track_count, release.rated_track_count)}
                </span>
                {isMultiDisc && (
                  <span className="inline-flex items-center gap-1.5 font-mono-num text-xs px-2.5 py-1 rounded-lg bg-[#e09f5a]/10 border border-[#e09f5a]/25 text-[#e09f5a] font-medium">
                    <Disc3 className="w-3.5 h-3.5 shrink-0" />
                    {t.discsCount(discGroups.length)}
                  </span>
                )}
                {release.average_track_rating !== null && (
                  <span className="font-mono-num text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                    {t.avgTrackScore} <strong className="text-[#f3efe6]">{release.average_track_rating}</strong>
                  </span>
                )}
                {release.best_song_title && (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[#e09f5a]/15 border border-[#e09f5a]/35 text-[#f3c969] inline-flex items-center gap-1.5 font-semibold max-w-full">
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {t.bestTrackOfLabel} {release.best_song_title}
                    </span>
                  </span>
                )}
              </div>

              {showVerificationNote && (
                <div className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af] pt-1">
                  <Info className="w-3.5 h-3.5 text-[#e09f5a] shrink-0" />
                  <span>{release.verification_note}</span>
                </div>
              )}

              <div className="pt-1 flex flex-wrap items-center gap-2.5 sm:gap-3">
                {release.spotify_url && (
                  <a
                    href={release.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl bg-[#1DB954]/15 hover:bg-[#1DB954]/25 border border-[#1DB954]/40 text-xs sm:text-sm font-semibold text-[#1DB954] inline-flex items-center gap-2 transition-colors"
                  >
                    <span>{t.openReleaseSpotify}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {release.spotify_id && (
                  <button
                    type="button"
                    onClick={() => setShowAlbumPlayer((v) => !v)}
                    className={`${btnSecondary} w-full sm:w-auto px-4 py-2 text-xs sm:text-sm`}
                  >
                    <Radio className="w-4 h-4 text-[#e09f5a]" />
                    <span>{showAlbumPlayer ? t.hideAlbumPlayer : t.showAlbumPlayer}</span>
                  </button>
                )}
                <Tooltip
                  content={release.is_hidden ? t.restoreReleaseTooltip : t.hideReleaseTooltip}
                >
                  <button
                    type="button"
                    disabled={hideBusy}
                    onClick={async () => {
                      const nextHidden = !release.is_hidden;
                      setHideBusy(true);
                      try {
                        await api.setReleaseHidden(release.id, nextHidden);
                        setRelease((prev) => (prev ? { ...prev, is_hidden: nextHidden } : prev));
                        void refreshArtists();
                      } finally {
                        setHideBusy(false);
                      }
                    }}
                    className={
                      release.is_hidden
                        ? 'w-full sm:w-auto justify-center px-4 py-2 rounded-xl bg-[#5fb38e]/15 hover:bg-[#5fb38e]/25 border border-[#5fb38e]/35 text-xs sm:text-sm font-semibold text-[#5fb38e] inline-flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer'
                        : `${btnSecondary} w-full sm:w-auto px-4 py-2 text-xs sm:text-sm`
                    }
                  >
                    {hideBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : release.is_hidden ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-[#9ca3af]" />
                    )}
                    <span>{release.is_hidden ? t.restoreReleaseBtn : t.hideReleaseBtn}</span>
                  </button>
                </Tooltip>
              </div>
            </div>

            {showAlbumPlayer && release.spotify_id && (
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0b0c10]">
                <iframe
                  title={`Spotify: ${release.title}`}
                  src={
                    theme === 'dark'
                      ? `https://open.spotify.com/embed/album/${release.spotify_id}?utm_source=generator&theme=0`
                      : `https://open.spotify.com/embed/album/${release.spotify_id}?utm_source=generator`
                  }
                  width="100%"
                  height="352"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                />
              </div>
            )}

            <div className="rounded-2xl bg-[#0b0c10]/70 border border-white/[0.08] p-4 sm:p-5 space-y-3">
              <div>
                <h2 className="text-sm font-bold text-[#f3efe6]">{t.subjectiveReleaseRating}</h2>
                <p className="text-[11px] text-[#9ca3af]">{t.subjectiveReleaseRatingSub}</p>
              </div>

              <RatingControl
                rating={release.rating}
                note={release.note}
                onSaveRating={(r) => api.saveReleaseRating(release.id, r)}
                onSaveNote={(n) => api.saveReleaseNote(release.id, n)}
                onUpdated={(patch) => {
                  setRelease((prev) =>
                    prev
                      ? {
                          ...prev,
                          ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
                          ...(patch.note !== undefined ? { note: patch.note } : {}),
                        }
                      : prev
                  );
                  void refreshArtists();
                }}
                notePlaceholder={t.releaseNotePlaceholder}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display text-xl font-bold text-[#f3efe6]">
            {t.tracklistTitle(release.tracks.length)}
          </h2>
          {isMultiDisc && (
            <span className="text-xs font-medium text-[#9ca3af] font-mono-num">
              {t.discsCount(discGroups.length)}
            </span>
          )}
        </div>
        {(() => {
          const renderSongRow = (track: (typeof release.tracks)[number]) => (
            <SongRow
              key={`${track.id}-${track.disc_number}-${track.track_number}`}
              song={track}
              trackNumber={track.track_number}
              currentReleaseId={release.id}
              isBestTrackOnCurrentRelease={release.best_song_id === track.id}
              bestTrackBusy={bestTrackBusyId === track.id}
              onToggleBestTrack={() => void handleToggleBestTrack(track.id)}
              onSongUpdated={handleSongUpdated}
            />
          );
          if (!isMultiDisc) {
            return <div className="space-y-3">{release.tracks.map(renderSongRow)}</div>;
          }
          return (
            <div className="space-y-6">
              {discGroups.map((group) => (
                <div key={group.discNumber} className="space-y-3">
                  <div className="flex items-center gap-3 px-1">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-[#13151c] border border-white/[0.08] text-xs font-bold text-[#f3efe6]">
                      <Disc3 className="w-3.5 h-3.5 text-[#e09f5a]" />
                      <span>{t.discLabel(group.discNumber)}</span>
                    </div>
                    <div className="h-px flex-1 bg-white/[0.08]" />
                    <span className="text-xs font-mono-num text-[#9ca3af]">
                      {t.discTracksCount(group.tracks.length)}
                    </span>
                  </div>
                  <div className="space-y-3">{group.tracks.map(renderSongRow)}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
