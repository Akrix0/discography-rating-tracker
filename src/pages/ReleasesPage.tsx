import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Disc3 } from 'lucide-react';
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

export function ReleasesPage() {
  const { selectedArtistId, selectedArtist } = useArtist();
  const { t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState<FilterMetaResponse | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);

  const [filters, setFilters] = useState<FilterState>(() => {
    const catParam = searchParams.get('category');
    const cats = catParam
      ? (catParam.split(',').filter((c) => (CATEGORIES as readonly string[]).includes(c)) as Category[])
      : [];
    const ratedParam = searchParams.get('ratedStatus');
    return {
      ...DEFAULT_FILTERS,
      q: searchParams.get('q') || '',
      categories: cats,
      ratedStatus: ratedParam === 'rated' || ratedParam === 'unrated' ? ratedParam : 'all',
      hideSecondary: searchParams.get('hideSecondary') === '1',
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

  const fetchReleases = useCallback(async (f: FilterState, artistId: number | null) => {
    if (hasLoadedOnce.current) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await api.getReleases(f, artistId);
      setReleases(data.releases);
      hasLoadedOnce.current = true;
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchReleases(filters, selectedArtistId);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [filters, selectedArtistId, fetchReleases]);

  const handleChange = (next: FilterState) => {
    setFilters(next);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-[#f3efe6] break-words">
          {selectedArtist ? t.releasesOf(selectedArtist.name) : t.allLibraryReleases}
        </h1>
        <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">{t.releasesPageSub}</p>
      </div>

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
          <div className="text-base font-medium text-[#f3efe6]">{t.noReleasesFound}</div>
          <button
            type="button"
            onClick={() => handleChange(DEFAULT_FILTERS)}
            className="px-4 py-2 rounded-xl bg-[#d95d4e] text-white text-sm font-medium"
          >
            {t.resetAllFilters}
          </button>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 transition-opacity duration-200 ${
            isRefreshing ? 'opacity-75' : 'opacity-100'
          }`}
        >
          {releases.map((rel) => (
            <ReleaseCard key={rel.id} release={rel} showArtist={!selectedArtist} />
          ))}
        </div>
      )}
    </div>
  );
}
