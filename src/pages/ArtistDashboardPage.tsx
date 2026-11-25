import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Disc3,
  Music2,
  Percent,
  Award,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Play,
  RefreshCw,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import { usePreferences } from '../context/PreferencesContext';
import { CATEGORY_LABELS } from '../i18n/translations';
import { type StatsResponse } from '../types';
import { SongRow } from '../components/SongRow';

export function ArtistDashboardPage() {
  const { selectedArtist, selectedArtistId, refreshArtists } = useArtist();
  const { lang, t } = usePreferences();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStage, setSyncStage] = useState<string | null>(null);

  const loadStats = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.getStats(selectedArtistId);
        if (silent) {
          setStats((prev) =>
            prev
              ? {
                  ...data,
                  nextUnratedSongs: prev.nextUnratedSongs,
                }
              : data
          );
        } else {
          setStats(data);
        }
        setError(null);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : t.authFallbackError);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedArtistId, t.authFallbackError]
  );

  useEffect(() => {
    void loadStats(false);
  }, [loadStats]);

  const handleSongUpdated = (
    songId: number,
    patch: { rating?: number | null; note?: string }
  ) => {
    setStats((prev) =>
      prev
        ? {
            ...prev,
            nextUnratedSongs: prev.nextUnratedSongs.map((s) =>
              s.id === songId
                ? {
                    ...s,
                    ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
                    ...(patch.note !== undefined ? { note: patch.note } : {}),
                  }
                : s
            ),
          }
        : prev
    );
    void loadStats(true);
    void refreshArtists();
  };

  const handleSync = async () => {
    if (!selectedArtist) return;
    setSyncStage('…');
    try {
      const { jobId } = await api.syncArtist(selectedArtist.id);
      const timer = window.setInterval(async () => {
        try {
          const st = await api.getJobStatus(jobId);
          setSyncStage(`${st.stage} (${st.percent}%)`);
          if (st.status === 'completed' || st.status === 'error') {
            window.clearInterval(timer);
            setSyncStage(
              st.status === 'completed'
                ? `+${st.addedReleases} / +${st.addedSongs}`
                : `${t.errorText}: ${st.error}`
            );
            await refreshArtists();
            await loadStats(true);
            window.setTimeout(() => setSyncStage(null), 4000);
          }
        } catch {
          // retry
        }
      }, 600);
    } catch (err) {
      setSyncStage(err instanceof Error ? err.message : t.errorText);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-44 rounded-3xl bg-[#13151c] border border-white/5" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-[#13151c] border border-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl bg-[#13151c] border border-[#d95d4e]/40 p-6 text-center">
        <p className="text-[#e87c6f] font-medium">{error || t.errorText}</p>
      </div>
    );
  }

  const cards = [
    {
      label: t.totalSongsCard,
      value: stats.totalSongs,
      sub: t.uniqueTracksSub,
      icon: Music2,
      accent: 'text-[#f3efe6]',
    },
    {
      label: t.ratedSongsLabel,
      value: stats.ratedSongs,
      sub: t.leftToRateSub(Math.max(0, stats.totalSongs - stats.ratedSongs)),
      icon: Sparkles,
      accent: 'text-[#e09f5a]',
    },
    {
      label: t.ratingProgressCard,
      value: `${stats.completionPercent}%`,
      sub: t.catalogCompletionSub,
      icon: Percent,
      accent: 'text-[#5fb38e]',
    },
    {
      label: t.ratedReleasesLabel,
      value: `${stats.ratedReleases}/${stats.totalReleases}`,
      sub: t.separateSubjectiveSub,
      icon: Disc3,
      accent: 'text-[#d98c5f]',
    },
    {
      label: t.avgSongScoreCard,
      value: stats.averageSongRating !== null ? stats.averageSongRating : '—',
      sub: stats.averageSongRating !== null ? t.outOf100Sub : t.noRatingsYetSub,
      icon: TrendingUp,
      accent: 'text-[#d95d4e]',
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#171923] via-[#13151c] to-[#1a1418] border border-white/[0.08] p-4 sm:p-6 lg:p-8">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 max-w-2xl min-w-0">
            {selectedArtist?.image_url && (
              <img
                src={selectedArtist.image_url}
                alt={selectedArtist.name}
                className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl object-cover border border-white/15 shadow-2xl shrink-0"
              />
            )}
            <div className="space-y-3 min-w-0">
              <h1 className="font-display text-xl sm:text-3xl lg:text-4xl font-bold text-[#f3efe6] leading-tight break-words">
                {selectedArtist ? (
                  <>
                    {lang === 'uk' ? 'Дискографія ' : ''}
                    <span className="text-[#e09f5a]">{selectedArtist.name}</span>
                    {lang === 'en' ? ' Discography' : ''}
                  </>
                ) : (
                  t.overviewAllArtists
                )}
              </h1>
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <Link
                  to="/songs"
                  className="px-4 py-2 rounded-xl bg-[#d95d4e] hover:bg-[#c84d3e] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-lg shadow-[#d95d4e]/25"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{t.rateSongsBtn}</span>
                </Link>
                <Link
                  to="/releases"
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-[#f3efe6] text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors"
                >
                  <Disc3 className="w-4 h-4" />
                  <span>{t.releasesBtn(stats.totalReleases)}</span>
                </Link>
                {selectedArtist && (
                  <button
                    type="button"
                    onClick={handleSync}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-xs font-medium text-[#d1d5db] inline-flex items-center gap-1.5"
                  >
                    {syncStage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e09f5a]" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>{t.checkNewReleases}</span>
                  </button>
                )}
                {selectedArtist?.spotify_url && (
                  <a
                    href={selectedArtist.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-[#1DB954]/10 border border-[#1DB954]/30 text-xs font-medium text-[#1DB954] inline-flex items-center gap-1"
                  >
                    <span>Spotify</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {syncStage && <div className="text-xs text-[#e09f5a]">{syncStage}</div>}
            </div>
          </div>

          <div className="shrink-0 w-full lg:w-64 rounded-2xl bg-[#0b0c10]/70 border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-[#9ca3af]">
              <span>{t.overallProgress}</span>
              <span className="font-mono-num text-[#e09f5a] font-bold">
                {stats.completionPercent}%
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#d95d4e] via-[#e09f5a] to-[#5fb38e] transition-all duration-700"
                style={{ width: `${Math.min(100, stats.completionPercent)}%` }}
              />
            </div>
            <div className="text-xs text-[#9ca3af] flex justify-between font-mono-num">
              <span>
                {stats.ratedSongs} {t.ratedWord.toLowerCase()}
              </span>
              <span>{t.totalOf(stats.totalSongs)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {cards.map((c, idx) => {
          const Icon = c.icon;
          const isLastOdd = idx === cards.length - 1;
          return (
            <div
              key={c.label}
              className={`rounded-2xl bg-[#13151c] border border-white/[0.07] p-3.5 sm:p-5 flex flex-col justify-between gap-2.5 sm:gap-3 min-w-0 ${
                isLastOdd ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <span className="text-[11px] sm:text-xs text-[#9ca3af] font-medium leading-tight">
                  {c.label}
                </span>
                <Icon className={`w-4 h-4 ${c.accent} opacity-80 shrink-0`} />
              </div>
              <div>
                <div className={`font-mono-num text-xl sm:text-2xl xl:text-3xl font-bold ${c.accent}`}>
                  {c.value}
                </div>
                <div className="text-[11px] text-[#6b7280] mt-1 leading-tight">{c.sub}</div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6] min-w-0">
            {t.categoriesTitle}
          </h2>
          <Link
            to="/songs"
            className="text-xs text-[#e09f5a] hover:underline inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
          >
            {t.allSongsLink} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.categoryBreakdown.map((item) => {
            const pct = item.total > 0 ? Math.round((item.rated / item.total) * 100) : 0;
            return (
              <Link
                key={item.category}
                to={`/songs?category=${encodeURIComponent(item.category)}`}
                className="group rounded-xl bg-[#0b0c10]/60 hover:bg-[#1a1d27] border border-white/[0.06] hover:border-white/15 p-3.5 transition-all"
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#f3efe6] group-hover:text-[#e09f5a] transition-colors truncate">
                      {item.category}
                    </div>
                    <div className="text-[11px] text-[#6b7280] truncate">
                      {CATEGORY_LABELS[lang][item.category]}
                    </div>
                  </div>
                  <div className="text-right font-mono-num shrink-0">
                    <div className="text-xs text-[#f3efe6]">
                      {item.rated}/{item.total}
                    </div>
                    {item.avgRating !== null && (
                      <div className="text-[11px] text-[#5fb38e]">
                        {t.avgShort} {item.avgRating}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-[#e09f5a] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Award className="w-5 h-5 text-[#e09f5a] shrink-0" />
              <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6] min-w-0">
                {t.topSongsTitle}
              </h2>
            </div>
            <Link
              to="/songs?sortBy=rating&sortDir=desc&ratedStatus=rated"
              className="text-xs text-[#e09f5a] hover:underline shrink-0 whitespace-nowrap"
            >
              {t.viewAll}
            </Link>
          </div>

          {stats.topSongs.length === 0 ? (
            <div className="rounded-xl bg-[#0b0c10]/60 border border-dashed border-white/10 p-6 text-center text-sm text-[#9ca3af]">
              {t.noArtistRatedSongs}
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats.topSongs.map((song, idx) => (
                <div
                  key={song.id}
                  className="flex items-center gap-3 rounded-xl bg-[#0b0c10]/60 border border-white/[0.05] p-2.5"
                >
                  <span className="font-mono-num text-xs text-[#6b7280] w-5 text-center">
                    {idx + 1}
                  </span>
                  {song.cover_url ? (
                    <img
                      src={song.cover_url}
                      alt={song.title}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#1a1d27] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#f3efe6] truncate">
                      {song.title}
                      {song.version_tag && (
                        <span className="ml-1.5 text-xs text-[#e09f5a]">({song.version_tag})</span>
                      )}
                    </div>
                    <div className="text-xs text-[#9ca3af] truncate">
                      {song.primary_release_title || song.category}
                    </div>
                  </div>
                  <span className="font-mono-num text-sm font-bold text-[#5fb38e] px-2.5 py-1 rounded-lg bg-[#5fb38e]/10 border border-[#5fb38e]/25">
                    {song.rating}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Disc3 className="w-5 h-5 text-[#d95d4e] shrink-0" />
              <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6] min-w-0">
                {t.topAlbumsTitle}
              </h2>
            </div>
            <Link
              to="/releases?sortBy=rating&sortDir=desc&ratedStatus=rated"
              className="text-xs text-[#e09f5a] hover:underline shrink-0 whitespace-nowrap"
            >
              {t.viewAll}
            </Link>
          </div>

          {stats.topAlbums.length === 0 ? (
            <div className="rounded-xl bg-[#0b0c10]/60 border border-dashed border-white/10 p-6 text-center text-sm text-[#9ca3af]">
              {t.noArtistRatedAlbums}
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats.topAlbums.map((rel, idx) => (
                <Link
                  key={rel.id}
                  to={`/releases/${rel.slug}`}
                  className="flex items-center gap-3 rounded-xl bg-[#0b0c10]/60 hover:bg-[#1a1d27] border border-white/[0.05] p-2.5 transition-colors"
                >
                  <span className="font-mono-num text-xs text-[#6b7280] w-5 text-center">
                    {idx + 1}
                  </span>
                  {rel.cover_url ? (
                    <img
                      src={rel.cover_url}
                      alt={rel.title}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#1a1d27] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#f3efe6] truncate">{rel.title}</div>
                    <div className="text-xs text-[#9ca3af]">
                      {rel.category} • {rel.release_year || '—'}
                    </div>
                  </div>
                  <span className="font-mono-num text-sm font-bold text-[#e09f5a] px-2.5 py-1 rounded-lg bg-[#e09f5a]/10 border border-[#e09f5a]/25">
                    {rel.rating}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {stats.nextUnratedSongs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
                {t.quickRatingTitle}
              </h2>
              <p className="text-xs text-[#9ca3af]">{t.quickRatingSub}</p>
            </div>
            <Link
              to="/songs?ratedStatus=unrated"
              className="text-xs text-[#e09f5a] hover:underline shrink-0 whitespace-nowrap"
            >
              {t.allUnratedLink}
            </Link>
          </div>
          <div className="space-y-3">
            {stats.nextUnratedSongs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                showArtist={!selectedArtist}
                onSongUpdated={handleSongUpdated}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
