import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckSquare,
  Disc3,
  Eraser,
  Eye,
  EyeOff,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import { usePreferences } from '../context/PreferencesContext';
import {
  CATEGORIES,
  type Category,
  type FilterMetaResponse,
  type FilterState,
  type Release,
} from '../types';
import { DEFAULT_FILTERS, FilterBar } from '../components/FilterBar';
import { ReleaseCard } from '../components/ReleaseCard';
import { Tooltip } from '../components/Tooltip';
import { btnPrimary, btnSecondary } from '../components/ui/buttonStyles';

export function ReleasesPage() {
  const { selectedArtistId, selectedArtist, refreshArtists } = useArtist();
  const { t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState<FilterMetaResponse | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [hiddenTotal, setHiddenTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [busyHideId, setBusyHideId] = useState<number | null>(null);

  // Bulk management state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkScenario, setBulkScenario] = useState<'keep_selected' | 'hide_selected'>(
    'keep_selected'
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(() => {
    const catParam = searchParams.get('category');
    const cats = catParam
      ? (catParam.split(',').filter((c) => (CATEGORIES as readonly string[]).includes(c)) as Category[])
      : [];
    const ratedParam = searchParams.get('ratedStatus');
    const hiddenParam = searchParams.get('hiddenFilter');
    return {
      ...DEFAULT_FILTERS,
      q: searchParams.get('q') || '',
      categories: cats,
      ratedStatus: ratedParam === 'rated' || ratedParam === 'unrated' ? ratedParam : 'all',
      hideSecondary: searchParams.get('hideSecondary') === '1',
      hiddenFilter:
        hiddenParam === 'hidden' || hiddenParam === 'all' ? hiddenParam : 'visible',
      sortBy: (searchParams.get('sortBy') as FilterState['sortBy']) || 'release_date',
      sortDir: (searchParams.get('sortDir') as FilterState['sortDir']) || 'desc',
    };
  });

  useEffect(() => {
    api
      .getFilterMeta(selectedArtistId, filters.hideSecondary)
      .then(setMeta)
      .catch(() => {});
  }, [selectedArtistId, filters.hideSecondary]);

  const fetchReleases = useCallback(
    async (f: FilterState, artistId: number | null, forceAllForBulk = false) => {
      if (hasLoadedOnce.current) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const effectiveFilters: FilterState = forceAllForBulk
          ? { ...f, hiddenFilter: 'all' }
          : f;
        const data = await api.getReleases(effectiveFilters, artistId);
        setReleases(data.releases);
        setHiddenTotal(data.hiddenTotal);
        hasLoadedOnce.current = true;
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchReleases(filters, selectedArtistId, bulkMode);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [filters, selectedArtistId, bulkMode, fetchReleases]);

  const handleChange = (next: FilterState) => {
    setFilters(next);
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.categories.length) params.set('category', next.categories.join(','));
    if (next.ratedStatus !== 'all') params.set('ratedStatus', next.ratedStatus);
    if (next.year) params.set('year', next.year);
    if (next.hideSecondary) params.set('hideSecondary', '1');
    if (next.hiddenFilter && next.hiddenFilter !== 'visible') {
      params.set('hiddenFilter', next.hiddenFilter);
    }
    if (next.sortBy !== 'release_date') params.set('sortBy', next.sortBy);
    if (next.sortDir !== 'desc') params.set('sortDir', next.sortDir);
    setSearchParams(params, { replace: true });
  };

  const handleToggleHidden = async (release: Release) => {
    const nextHidden = !release.is_hidden;
    setBusyHideId(release.id);
    try {
      await api.setReleaseHidden(release.id, nextHidden);
      await Promise.all([fetchReleases(filters, selectedArtistId, bulkMode), refreshArtists()]);
    } finally {
      setBusyHideId(null);
    }
  };

  const enterBulkMode = () => {
    setBulkScenario('keep_selected');
    setSelectedIds(new Set());
    setBulkMode(true);
    setToast(null);
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
  };

  const toggleBulkSelect = (releaseId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(releaseId)) next.delete(releaseId);
      else next.add(releaseId);
      return next;
    });
  };

  const handleApplyBulk = async () => {
    if (releases.length === 0) return;
    setApplyingBulk(true);
    try {
      const scopedReleaseIds = releases.map((r) => r.id);
      const selectedReleaseIds = Array.from(selectedIds).filter((id) =>
        scopedReleaseIds.includes(id)
      );
      const res = await api.bulkUpdateReleaseVisibility({
        mode: bulkScenario,
        selectedReleaseIds,
        scopedReleaseIds,
      });
      setBulkMode(false);
      setSelectedIds(new Set());
      setToast(t.bulkSavedToast(res.visibleCount, res.hiddenCount));
      window.setTimeout(() => setToast(null), 4000);
      await Promise.all([fetchReleases(filters, selectedArtistId, false), refreshArtists()]);
    } finally {
      setApplyingBulk(false);
    }
  };

  const totalBulkCount = releases.length;
  const selectedBulkCount = releases.reduce(
    (sum, r) => (selectedIds.has(r.id) ? sum + 1 : sum),
    0
  );
  const willStayCount =
    bulkScenario === 'keep_selected'
      ? selectedBulkCount
      : totalBulkCount - selectedBulkCount;
  const willHideCount =
    bulkScenario === 'keep_selected'
      ? totalBulkCount - selectedBulkCount
      : selectedBulkCount;

  const activeHiddenFilter = filters.hiddenFilter || 'visible';

  return (
    <div className={`space-y-6 ${bulkMode ? 'pt-28 sm:pt-24' : ''}`}>
      {/* Fixed Top Bulk Selection Panel (1.4) */}
      {bulkMode && (
        <div
          role="region"
          aria-label={t.bulkManageBtn}
          className="fixed top-0 left-0 right-0 z-50 bg-[#0b0c10]/95 backdrop-blur-xl border-b border-white/15 shadow-2xl"
        >
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Scenario Switch */}
              <div className="inline-flex rounded-xl bg-[#13151c] p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setBulkScenario('keep_selected')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    bulkScenario === 'keep_selected'
                      ? 'bg-[#5fb38e] text-[#0b0c10] shadow-sm'
                      : 'text-[#9ca3af] hover:text-[#f3efe6]'
                  }`}
                >
                  {t.bulkModeKeepLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkScenario('hide_selected')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    bulkScenario === 'hide_selected'
                      ? 'bg-[#d95d4e] text-white shadow-sm'
                      : 'text-[#9ca3af] hover:text-[#f3efe6]'
                  }`}
                >
                  {t.bulkModeHideLabel}
                </button>
              </div>

              {/* Real-time Stats */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-mono-num">
                <span className="px-2 py-1 rounded-lg bg-[#13151c] border border-white/10 text-[#9ca3af]">
                  {t.bulkStatsTotal}: <strong className="text-[#f3efe6]">{totalBulkCount}</strong>
                </span>
                <span className="px-2 py-1 rounded-lg bg-[#13151c] border border-white/10 text-[#9ca3af]">
                  {t.bulkStatsSelected}:{' '}
                  <strong className="text-[#e09f5a]">{selectedBulkCount}</strong>
                </span>
                <span className="px-2 py-1 rounded-lg bg-[#5fb38e]/10 border border-[#5fb38e]/30 text-[#5fb38e]">
                  {t.bulkStatsWillShow}: <strong>{willStayCount}</strong>
                </span>
                <span className="px-2 py-1 rounded-lg bg-[#d95d4e]/10 border border-[#d95d4e]/30 text-[#e87c6f]">
                  {t.bulkStatsWillHide}: <strong>{willHideCount}</strong>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2">
              <span className="hidden xl:inline text-[11px] text-[#9ca3af] mr-1">
                {bulkScenario === 'keep_selected' ? t.bulkModeKeepHint : t.bulkModeHideHint}
              </span>

              <button
                type="button"
                disabled={selectedBulkCount === 0}
                onClick={() => setSelectedIds(new Set())}
                className={`${btnSecondary} h-8 px-2.5 text-xs`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>{t.bulkClearBtn}</span>
              </button>

              <button
                type="button"
                onClick={exitBulkMode}
                className={`${btnSecondary} h-8 px-2.5 text-xs`}
              >
                <X className="w-3.5 h-3.5" />
                <span>{t.bulkCancelBtn}</span>
              </button>

              <button
                type="button"
                disabled={applyingBulk || releases.length === 0}
                onClick={() => void handleApplyBulk()}
                className={`${btnPrimary} h-8 px-3.5 text-xs`}
              >
                {applyingBulk ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{t.bulkApplyBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header & Bulk Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-[#f3efe6] break-words">
            {selectedArtist ? t.releasesOf(selectedArtist.name) : t.allLibraryReleases}
          </h1>
          <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">{t.releasesPageSub}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!bulkMode && (
            <div className="inline-flex rounded-xl bg-[#13151c] p-1 border border-white/[0.08]">
              {(
                [
                  {
                    key: 'visible' as const,
                    label: t.filterVisibleReleases,
                    icon: <Eye className="w-3.5 h-3.5" />,
                  },
                  {
                    key: 'hidden' as const,
                    label: t.filterHiddenReleases(hiddenTotal),
                    icon: <EyeOff className="w-3.5 h-3.5" />,
                  },
                  {
                    key: 'all' as const,
                    label: t.filterAllReleases,
                    icon: null,
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleChange({ ...filters, hiddenFilter: opt.key })}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    activeHiddenFilter === opt.key
                      ? 'bg-[#e09f5a] text-[#0b0c10]'
                      : 'text-[#9ca3af] hover:text-[#f3efe6]'
                  }`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          {!bulkMode && (
            <Tooltip content={t.bulkManageTooltip} align="end">
              <button
                type="button"
                onClick={enterBulkMode}
                className={`${btnSecondary} h-9 px-3.5 text-xs`}
              >
                <CheckSquare className="w-4 h-4 text-[#e09f5a]" />
                <span>{t.bulkManageBtn}</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {toast && (
        <div className="rounded-xl bg-[#13151c] border border-[#5fb38e]/40 px-4 py-2.5 text-xs sm:text-sm text-[#f3efe6] flex items-center justify-between">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs text-[#9ca3af] hover:text-[#f3efe6] cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      )}

      <FilterBar
        filters={filters}
        meta={meta}
        onChange={handleChange}
        onReset={() => handleChange(DEFAULT_FILTERS)}
        totalResults={releases.length}
        mode="releases"
      />

      {loading && !hasLoadedOnce.current ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-[#13151c] animate-pulse" />
          ))}
        </div>
      ) : releases.length === 0 ? (
        <div className="rounded-2xl bg-[#13151c] border border-white/[0.07] p-12 text-center space-y-3">
          <Disc3 className="w-10 h-10 text-[#4b5563] mx-auto" />
          <div className="text-base font-medium text-[#f3efe6]">
            {activeHiddenFilter === 'hidden' ? t.noHiddenReleasesFound : t.noReleasesFound}
          </div>
          <button
            type="button"
            onClick={() => handleChange(DEFAULT_FILTERS)}
            className={`${btnPrimary} px-4 py-2 text-sm`}
          >
            {t.resetAllFilters}
          </button>
        </div>
      ) : (
        <div
          className={`transition-all duration-200 ${
            bulkMode
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
              : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5'
          } ${isRefreshing ? 'opacity-75' : 'opacity-100'}`}
        >
          {releases.map((rel) => (
            <ReleaseCard
              key={rel.id}
              release={rel}
              showArtist={!selectedArtist}
              onToggleHidden={handleToggleHidden}
              hideBusy={busyHideId === rel.id}
              bulkMode={bulkMode}
              bulkScenario={bulkScenario}
              selected={selectedIds.has(rel.id)}
              onToggleSelect={toggleBulkSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
