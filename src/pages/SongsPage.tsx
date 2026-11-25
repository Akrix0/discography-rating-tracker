import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Music2 } from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import { usePreferences } from '../context/PreferencesContext';
import {
  CATEGORIES,
  type Category,
  type FilterMetaResponse,
  type FilterState,
  type ReleaseType,
  type Song,
} from '../types';
import { DEFAULT_FILTERS, FilterBar } from '../components/FilterBar';
import { SongRow } from '../components/SongRow';
import {
  getEmbedLoadMode,
  setEmbedLoadMode,
  type EmbedLoadMode,
} from '../components/SpotifyEmbed';

export function SongsPage() {
  const { selectedArtistId, selectedArtist, refreshArtists } = useArtist();
  const { t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState<FilterMetaResponse | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [embedMode, setEmbedModeState] = useState<EmbedLoadMode>(getEmbedLoadMode);

  const [filters, setFilters] = useState<FilterState>(() => {
    const catParam = searchParams.get('category');
    const cats = catParam
      ? (catParam.split(',').filter((c) => (CATEGORIES as readonly string[]).includes(c)) as Category[])
      : [];
    const ratedParam = searchParams.get('ratedStatus');
    const ratedStatus =
      ratedParam === 'rated' || ratedParam === 'unrated' ? ratedParam : 'all';
    const sortBy = (searchParams.get('sortBy') as FilterState['sortBy']) || 'release_date';
    const sortDir = (searchParams.get('sortDir') as FilterState['sortDir']) || 'desc';
    const rtParam = searchParams.get('releaseType');
    return {
      ...DEFAULT_FILTERS,
      q: searchParams.get('q') || '',
      categories: cats,
      releaseTypes: rtParam ? [rtParam as ReleaseType] : [],
      ratedStatus,
      year: searchParams.get('year') || '',
      hideSecondary: searchParams.get('hideSecondary') === '1',
      sortBy,
      sortDir,
    };
  });

  useEffect(() => {
    api
      .getFilterMeta(selectedArtistId, filters.hideSecondary)
      .then(setMeta)
      .catch(() => {});
  }, [selectedArtistId, filters.hideSecondary]);

  const fetchSongs = useCallback(
    async (currentFilters: FilterState, artistId: number | null) => {
      if (hasLoadedOnce.current) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const data = await api.getSongs(currentFilters, artistId);
        setSongs(data.songs);
        hasLoadedOnce.current = true;
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не вдалося завантажити композиції');
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    setPage(1);
    const timer = window.setTimeout(() => {
      void fetchSongs(filters, selectedArtistId);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [filters, selectedArtistId, fetchSongs]);

  const handleFilterChange = (next: FilterState) => {
    setFilters(next);
    setPage(1);
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.categories.length) params.set('category', next.categories.join(','));
    if (next.ratedStatus !== 'all') params.set('ratedStatus', next.ratedStatus);
    if (next.year) params.set('year', next.year);
    if (next.hideSecondary) params.set('hideSecondary', '1');
    if (next.sortBy !== 'release_date') params.set('sortBy', next.sortBy);
    if (next.sortDir !== 'desc') params.set('sortDir', next.sortDir);
    setSearchParams(params, { replace: true });
  };

  const handleReset = () => {
    handleFilterChange(DEFAULT_FILTERS);
  };

  const handleSongUpdated = (
    songId: number,
    patch: { rating?: number | null; note?: string }
  ) => {
    setSongs((prev) =>
      prev.map((s) =>
        s.id === songId
          ? {
              ...s,
              ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
              ...(patch.note !== undefined ? { note: patch.note } : {}),
            }
          : s
      )
    );
    void refreshArtists();
  };

  const totalPages = Math.max(1, Math.ceil(songs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const visibleSongs = songs.slice(startIdx, startIdx + pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#f3efe6]">
            {selectedArtist ? t.songsOf(selectedArtist.name) : t.allLibrarySongs}
          </h1>
          <p className="text-sm text-[#9ca3af] mt-1">{t.songsPageSub}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#9ca3af]">
          {isRefreshing && (
            <span className="inline-flex items-center gap-1.5 text-[#e09f5a]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t.updating}</span>
            </span>
          )}

          <div className="flex items-center gap-1.5">
            <span>{t.playersMode}</span>
            <select
              aria-label={t.playersMode}
              value={embedMode}
              onChange={(e) => {
                const next = e.target.value as EmbedLoadMode;
                setEmbedModeState(next);
                setEmbedLoadMode(next);
              }}
              className="h-8 px-2 rounded-lg bg-[#13151c] border border-white/10 text-[#f3efe6]"
            >
              <option value="auto">{t.modeAuto}</option>
              <option value="click">{t.modeClick}</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span>{t.perPage}</span>
            <select
              aria-label={t.perPage}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 px-2 rounded-lg bg-[#13151c] border border-white/10 text-[#f3efe6]"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      <FilterBar
        filters={filters}
        meta={meta}
        onChange={handleFilterChange}
        onReset={handleReset}
        totalResults={songs.length}
        mode="songs"
      />

      {error && (
        <div className="rounded-xl bg-[#d95d4e]/15 border border-[#d95d4e]/40 p-4 text-sm text-[#e87c6f]">
          {error}
        </div>
      )}

      {loading && !hasLoadedOnce.current ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-[#13151c] border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : visibleSongs.length === 0 ? (
        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-12 text-center space-y-3">
          <Music2 className="w-10 h-10 text-[#4b5563] mx-auto" />
          <div className="text-base font-medium text-[#f3efe6]">{t.nothingFound}</div>
          <p className="text-sm text-[#9ca3af]">{t.nothingFoundSub}</p>
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-[#d95d4e] text-white text-sm font-medium hover:bg-[#c84d3e] transition-colors"
          >
            {t.resetAllFilters}
          </button>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity duration-200 ${isRefreshing ? 'opacity-75' : 'opacity-100'}`}>
          {visibleSongs.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              showArtist={!selectedArtist}
              onSongUpdated={handleSongUpdated}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-[#9ca3af] font-mono-num">
            {t.shownRange(startIdx + 1, Math.min(startIdx + pageSize, songs.length), songs.length)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="h-9 px-3 rounded-lg bg-[#13151c] border border-white/10 text-sm text-[#f3efe6] disabled:opacity-40 inline-flex items-center gap-1 hover:bg-white/5"
            >
              <ChevronLeft className="w-4 h-4" /> {t.prev}
            </button>
            <span className="font-mono-num text-xs text-[#9ca3af] px-2">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="h-9 px-3 rounded-lg bg-[#13151c] border border-white/10 text-sm text-[#f3efe6] disabled:opacity-40 inline-flex items-center gap-1 hover:bg-white/5"
            >
              {t.next} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
