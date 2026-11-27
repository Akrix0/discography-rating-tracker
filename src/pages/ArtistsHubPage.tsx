import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  Disc3,
  Globe2,
  Loader2,
  Music2,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import { usePreferences } from '../context/PreferencesContext';
import type { GlobalStatsResponse } from '../types';
import { SongRow } from '../components/SongRow';
import { ReleaseCard } from '../components/ReleaseCard';
import { Tooltip } from '../components/Tooltip';
import { btnDanger, btnPrimary, btnSecondary } from '../components/ui/buttonStyles';
import {
  canMoveWithinSameRating,
  hasAnyTiedRating,
  reorderWithinSameRating,
  stepMoveWithinSameRating,
} from '../utils/reorderSameScore';

export function ArtistsHubPage() {
  const { setSelectedArtistId, refreshArtists, openAddModal } = useArtist();
  const { t } = usePreferences();
  const navigate = useNavigate();

  const [stats, setStats] = useState<GlobalStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'songs' | 'albums' | 'artists'>('songs');
  const [syncingArtistId, setSyncingArtistId] = useState<number | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ percent: number; stage: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragSongId, setDragSongId] = useState<number | null>(null);
  const [dragOverSongId, setDragOverSongId] = useState<number | null>(null);

  const loadGlobal = useCallback(async () => {
    try {
      const data = await api.getGlobalStats();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGlobal();
  }, [loadGlobal]);

  const handleOpenArtist = (artistId: number) => {
    setSelectedArtistId(artistId);
    navigate('/');
  };

  const handleSyncArtist = async (artistId: number) => {
    setSyncingArtistId(artistId);
    setSyncProgress({ percent: 5, stage: '…' });
    try {
      const { jobId } = await api.syncArtist(artistId);
      const timer = window.setInterval(async () => {
        try {
          const st = await api.getJobStatus(jobId);
          setSyncProgress({ percent: st.percent, stage: st.stage });
          if (st.status === 'completed') {
            window.clearInterval(timer);
            setSyncingArtistId(null);
            setSyncProgress(null);
            setToast(`${st.artistName}: +${st.addedReleases}, +${st.addedSongs}`);
            await refreshArtists();
            await loadGlobal();
          } else if (st.status === 'error') {
            window.clearInterval(timer);
            setSyncingArtistId(null);
            setSyncProgress(null);
            setToast(`${t.errorText}: ${st.error}`);
          }
        } catch {
          // retry
        }
      }, 600);
    } catch (err) {
      setSyncingArtistId(null);
      setSyncProgress(null);
      setToast(err instanceof Error ? err.message : t.errorText);
    }
  };

  const handleDeleteArtist = async (artistId: number) => {
    await api.deleteArtist(artistId);
    setConfirmDeleteId(null);
    const updated = await refreshArtists();
    setSelectedArtistId(updated[0]?.id ?? null);
    await loadGlobal();
    setToast(t.artistDeletedToast);
  };

  if (loading || !stats) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-36 rounded-3xl bg-[#13151c]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-[#13151c]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-[#171923] via-[#13151c] to-[#1a1418] border border-white/[0.08] p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
        <div className="space-y-2.5 max-w-2xl min-w-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e09f5a]/15 border border-[#e09f5a]/30 text-xs font-medium text-[#e09f5a]">
            <Globe2 className="w-3.5 h-3.5 shrink-0" />
            <span>{t.artistsCountBadge(stats.totalArtists)}</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-[#f3efe6] break-words">
            {t.hubTitle}
          </h1>
          <p className="text-xs sm:text-sm text-[#9ca3af]">{t.hubSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#d95d4e] hover:bg-[#c84d3e] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-lg shadow-[#d95d4e]/25 shrink-0 transition-colors"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>{t.addNewArtist}</span>
        </button>
      </section>

      {toast && (
        <div className="rounded-xl bg-[#13151c] border border-[#e09f5a]/40 px-4 py-3 text-sm text-[#f3efe6] flex items-center justify-between">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs text-[#9ca3af] hover:text-[#f3efe6]"
          >
            {t.close}
          </button>
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-3.5 sm:p-5 min-w-0">
          <div className="flex items-start justify-between gap-2 text-[11px] sm:text-xs text-[#9ca3af]">
            <span className="leading-tight">{t.artistsInDb}</span>
            <Users className="w-4 h-4 text-[#e09f5a] shrink-0" />
          </div>
          <div className="font-mono-num text-xl sm:text-3xl font-bold text-[#f3efe6] mt-2">
            {stats.totalArtists}
          </div>
        </div>
        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-3.5 sm:p-5 min-w-0">
          <div className="flex items-start justify-between gap-2 text-[11px] sm:text-xs text-[#9ca3af]">
            <span className="leading-tight">{t.ratedSongsLabel}</span>
            <Music2 className="w-4 h-4 text-[#5fb38e] shrink-0" />
          </div>
          <div className="font-mono-num text-xl sm:text-3xl font-bold text-[#5fb38e] mt-2">
            {stats.ratedSongs}/{stats.totalSongs}
          </div>
        </div>
        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-3.5 sm:p-5 min-w-0">
          <div className="flex items-start justify-between gap-2 text-[11px] sm:text-xs text-[#9ca3af]">
            <span className="leading-tight">{t.ratedReleasesLabel}</span>
            <Disc3 className="w-4 h-4 text-[#d98c5f] shrink-0" />
          </div>
          <div className="font-mono-num text-xl sm:text-3xl font-bold text-[#d98c5f] mt-2">
            {stats.ratedReleases}/{stats.totalReleases}
          </div>
        </div>
        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-3.5 sm:p-5 min-w-0">
          <div className="flex items-start justify-between gap-2 text-[11px] sm:text-xs text-[#9ca3af]">
            <span className="leading-tight">{t.avgAllSongs}</span>
            <TrendingUp className="w-4 h-4 text-[#d95d4e] shrink-0" />
          </div>
          <div className="font-mono-num text-xl sm:text-3xl font-bold text-[#d95d4e] mt-2">
            {stats.overallAverageSongRating !== null ? stats.overallAverageSongRating : '—'}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-bold text-[#f3efe6]">{t.artistLibrary}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {stats.artistLeaderboard.map((artist) => {
            const isSyncing = syncingArtistId === artist.id;
            const isConfirmingDel = confirmDeleteId === artist.id;
            return (
              <div
                key={artist.id}
                className="rounded-2xl bg-[#13151c] border border-white/[0.08] hover:border-white/20 p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[#1a1d27] border border-white/10 shrink-0 flex items-center justify-center">
                    {artist.image_url ? (
                      <img
                        src={artist.image_url}
                        alt={artist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Disc3 className="w-8 h-8 text-[#4b5563]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-bold text-[#f3efe6] truncate">
                      {artist.name}
                    </h3>
                    <div className="mt-1 text-xs text-[#9ca3af] font-mono-num">
                      {artist.totalReleases} {t.releasesWord} • {artist.totalSongs} {t.songsWord}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-white/[0.05] font-mono-num text-[#e09f5a]">
                        {t.songsBadge} {artist.averageSongRating ?? '—'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white/[0.05] font-mono-num text-[#5fb38e]">
                        {t.albumsBadge} {artist.averageReleaseRating ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-[#9ca3af] font-mono-num">
                    <span>
                      {t.ratedWord} {artist.ratedSongs}/{artist.totalSongs}
                    </span>
                    <span className="text-[#e09f5a]">{artist.completionPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#d95d4e] to-[#5fb38e] transition-all duration-500"
                      style={{ width: `${Math.min(100, artist.completionPercent)}%` }}
                    />
                  </div>
                </div>

                {isSyncing && syncProgress && (
                  <div className="text-xs text-[#e09f5a] flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">
                      {syncProgress.stage} ({syncProgress.percent}%)
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => handleOpenArtist(artist.id)}
                    className={`${btnSecondary} flex-1 min-w-0 h-9 px-2.5 text-xs font-semibold hover:bg-[#d95d4e] hover:text-white hover:border-transparent truncate`}
                  >
                    {t.openOverview}
                  </button>
                  <Tooltip content={t.checkUpdatesTitle} align="end">
                    <button
                      type="button"
                      disabled={syncingArtistId !== null}
                      onClick={() => handleSyncArtist(artist.id)}
                      aria-label={t.checkUpdatesTitle}
                      className={`${btnSecondary} h-9 px-3 text-xs text-[#d1d5db]`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{t.refresh}</span>
                    </button>
                  </Tooltip>

                  {isConfirmingDel ? (
                    <Tooltip content={t.deleteArtistDangerTooltip} align="end">
                      <button
                        type="button"
                        onClick={() => handleDeleteArtist(artist.id)}
                        className={`${btnPrimary} h-9 px-3 text-xs`}
                      >
                        {t.confirmDelete}
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip content={t.deleteArtistDangerTooltip} align="end">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(artist.id)}
                        aria-label={t.deleteArtistTitle}
                        className={`${btnDanger} h-9 w-9`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-5 h-5 text-[#e09f5a] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6] break-words">
              {t.globalLeaderboard}
            </h2>
          </div>

          <div className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex rounded-xl bg-[#13151c] p-1 border border-white/[0.08]">
            {(
              [
                { key: 'songs', label: t.tabTopSongs },
                { key: 'albums', label: t.tabTopAlbums },
                { key: 'artists', label: t.tabArtistRank },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-colors text-center truncate ${
                  activeTab === tab.key
                    ? 'bg-[#d95d4e] text-white'
                    : 'text-[#9ca3af] hover:text-[#f3efe6]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'songs' && (
          <div className="space-y-3">
            {stats.globalTopSongs.length === 0 ? (
              <div className="rounded-2xl bg-[#13151c] border border-dashed border-white/10 p-8 text-center text-sm text-[#9ca3af]">
                {t.noRatedSongsGlobal}
              </div>
            ) : (
              <>
                {hasAnyTiedRating(stats.globalTopSongs) && (
                  <p className="text-xs text-[#9ca3af] px-1">{t.reorderSameScoreHint}</p>
                )}
                {stats.globalTopSongs.map((song, idx) => {
                  const { canUp, canDown } = canMoveWithinSameRating(stats.globalTopSongs, idx);
                  const dragged = stats.globalTopSongs.find((s) => s.id === dragSongId);
                  const acceptsDrop = Boolean(
                    dragged && dragged.rating === song.rating && dragged.id !== song.id
                  );
                  return (
                    <SongRow
                      key={song.id}
                      song={song}
                      trackNumber={idx + 1}
                      showArtist
                      canMoveUp={canUp}
                      canMoveDown={canDown}
                      onMoveUp={() => {
                        const res = stepMoveWithinSameRating(stats.globalTopSongs, idx, -1);
                        if (!res) return;
                        setStats((prev) =>
                          prev ? { ...prev, globalTopSongs: res.nextList } : prev
                        );
                        void api.reorderSongsByRating(res.rating, res.orderedIdsForRating);
                      }}
                      onMoveDown={() => {
                        const res = stepMoveWithinSameRating(stats.globalTopSongs, idx, 1);
                        if (!res) return;
                        setStats((prev) =>
                          prev ? { ...prev, globalTopSongs: res.nextList } : prev
                        );
                        void api.reorderSongsByRating(res.rating, res.orderedIdsForRating);
                      }}
                      isDragging={dragSongId === song.id}
                      isDragOver={dragOverSongId === song.id && acceptsDrop}
                      onDragStartRow={() => setDragSongId(song.id)}
                      onDragOverRow={(e) => {
                        if (!acceptsDrop) return;
                        e.preventDefault();
                        setDragOverSongId(song.id);
                      }}
                      onDropRow={(e) => {
                        e.preventDefault();
                        if (dragSongId === null) return;
                        const res = reorderWithinSameRating(
                          stats.globalTopSongs,
                          dragSongId,
                          song.id
                        );
                        setDragSongId(null);
                        setDragOverSongId(null);
                        if (!res) return;
                        setStats((prev) =>
                          prev ? { ...prev, globalTopSongs: res.nextList } : prev
                        );
                        void api.reorderSongsByRating(res.rating, res.orderedIdsForRating);
                      }}
                      onDragEndRow={() => {
                        setDragSongId(null);
                        setDragOverSongId(null);
                      }}
                      onSongUpdated={() => {
                        void loadGlobal();
                        void refreshArtists();
                      }}
                    />
                  );
                })}
              </>
            )}
          </div>
        )}

        {activeTab === 'albums' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {stats.globalTopAlbums.length === 0 ? (
              <div className="col-span-full rounded-2xl bg-[#13151c] border border-dashed border-white/10 p-8 text-center text-sm text-[#9ca3af]">
                {t.noRatedAlbumsGlobal}
              </div>
            ) : (
              stats.globalTopAlbums.map((rel) => (
                <ReleaseCard key={rel.id} release={rel} showArtist />
              ))
            )}
          </div>
        )}

        {activeTab === 'artists' && (
          <div className="rounded-2xl bg-[#13151c] border border-white/[0.08] overflow-hidden">
            <div className="divide-y divide-white/[0.06]">
              {stats.artistLeaderboard.map((a, idx) => (
                <div
                  key={a.id}
                  className="p-3 sm:p-4 flex flex-wrap min-[380px]:flex-nowrap items-center justify-between gap-2.5 sm:gap-4 hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <span className="font-mono-num text-xs sm:text-sm text-[#6b7280] w-5 sm:w-6 text-center shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden bg-[#1a1d27] shrink-0">
                      {a.image_url && (
                        <img src={a.image_url} alt={a.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleOpenArtist(a.id)}
                        className="font-semibold text-sm text-[#f3efe6] hover:text-[#e09f5a] truncate block max-w-full text-left"
                      >
                        {a.name}
                      </button>
                      <div className="text-[11px] sm:text-xs text-[#9ca3af] font-mono-num truncate">
                        {a.ratedSongs} {t.songsWord} • {a.ratedReleases} {t.releasesWord}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 sm:gap-3 font-mono-num text-xs sm:text-sm shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] text-[#9ca3af]">{t.avgSongsCol}</div>
                      <div className="font-bold text-[#e09f5a]">{a.averageSongRating ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#9ca3af]">{t.avgAlbumsCol}</div>
                      <div className="font-bold text-[#5fb38e]">{a.averageReleaseRating ?? '—'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
