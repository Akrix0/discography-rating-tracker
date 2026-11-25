import { Search, RotateCcw, SlidersHorizontal, EyeOff } from 'lucide-react';
import {
  CATEGORIES,
  CATEGORY_META,
  RELEASE_TYPE_LABELS,
  type Category,
  type FilterMetaResponse,
  type FilterState,
  type ReleaseType,
} from '../types';

interface FilterBarProps {
  filters: FilterState;
  meta: FilterMetaResponse | null;
  onChange: (next: FilterState) => void;
  onReset: () => void;
  totalResults: number;
  mode: 'songs' | 'releases';
}

export const DEFAULT_FILTERS: FilterState = {
  q: '',
  categories: [],
  releaseTypes: [],
  ratedStatus: 'all',
  minRating: 0,
  maxRating: 100,
  year: '',
  hideSecondary: false,
  sortBy: 'release_date',
  sortDir: 'desc',
};

export function FilterBar({
  filters,
  meta,
  onChange,
  onReset,
  totalResults,
  mode,
}: FilterBarProps) {
  const toggleCategory = (cat: Category) => {
    const exists = filters.categories.includes(cat);
    const nextCats = exists
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    onChange({ ...filters, categories: nextCats });
  };

  const hasActiveFilters =
    filters.q !== '' ||
    filters.categories.length > 0 ||
    filters.releaseTypes.length > 0 ||
    filters.ratedStatus !== 'all' ||
    filters.minRating > 0 ||
    filters.maxRating < 100 ||
    filters.year !== '' ||
    filters.hideSecondary;

  const countsMap =
    mode === 'songs' ? meta?.songCategoryCounts : meta?.releaseCategoryCounts;

  return (
    <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.q}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            placeholder={
              mode === 'songs'
                ? 'Пошук за назвою пісні, альбому, артиста або типом…'
                : 'Пошук релізу за назвою, артистом або типом…'
            }
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
          />
        </div>

        <div className="md:col-span-3">
          <select
            aria-label="Сортувати за"
            value={`${filters.sortBy}:${filters.sortDir}`}
            onChange={(e) => {
              const [sortBy, sortDir] = e.target.value.split(':') as [
                FilterState['sortBy'],
                FilterState['sortDir'],
              ];
              onChange({ ...filters, sortBy, sortDir });
            }}
            className="w-full h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
          >
            <option value="release_date:desc">Дата виходу (найновіші)</option>
            <option value="release_date:asc">Дата виходу (найстаріші)</option>
            <option value="title:asc">За назвою (A–Z)</option>
            <option value="title:desc">За назвою (Z–A)</option>
            <option value="rating:desc">Оцінка (найвища → найнижча)</option>
            <option value="rating:asc">Оцінка (найнижча → найвища)</option>
            <option value="created_at:desc">Дата додавання (новіші)</option>
            <option value="created_at:asc">Дата додавання (раніші)</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            aria-label="Рік виходу"
            value={filters.year}
            onChange={(e) => onChange({ ...filters, year: e.target.value })}
            className="w-full h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
          >
            <option value="">Усі роки</option>
            {(meta?.years || []).map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!hasActiveFilters}
            className="w-full h-10 px-3 rounded-xl border border-white/10 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white/[0.03] hover:bg-white/[0.08] text-[#f3efe6]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Скинути</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs text-[#9ca3af] mr-1">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Категорії:
        </span>
        {CATEGORIES.map((cat) => {
          const active = filters.categories.includes(cat);
          const count = countsMap?.[cat] ?? 0;
          const metaStyle = CATEGORY_META[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all inline-flex items-center gap-1.5 ${
                active
                  ? `${metaStyle.badgeBg} ring-1 ring-white/25`
                  : 'bg-[#0b0c10]/70 text-[#9ca3af] border-white/[0.08] hover:border-white/20 hover:text-[#f3efe6]'
              }`}
            >
              <span>{cat}</span>
              <span className="font-mono-num text-[10px] opacity-75">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-[#0b0c10] p-1 border border-white/[0.08]">
            {(
              [
                { key: 'all', label: 'Усі' },
                { key: 'rated', label: 'Оцінені' },
                { key: 'unrated', label: 'Неоцінені' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChange({ ...filters, ratedStatus: opt.key })}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filters.ratedStatus === opt.key
                    ? 'bg-[#d95d4e] text-[#f3efe6]'
                    : 'text-[#9ca3af] hover:text-[#f3efe6]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChange({ ...filters, hideSecondary: !filters.hideSecondary })}
            aria-pressed={filters.hideSecondary}
            className={`h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
              filters.hideSecondary
                ? 'bg-[#e09f5a]/20 text-[#e09f5a] border-[#e09f5a]/50'
                : 'bg-[#0b0c10] text-[#9ca3af] border-white/10 hover:text-[#f3efe6]'
            }`}
            title="Приховати Sped Up, Slowed Down, Live, Ремікси та Демо версії"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Приховати альт-версії / Live / Ремікси</span>
          </button>

          <select
            aria-label="Тип релізу"
            value={filters.releaseTypes[0] || ''}
            onChange={(e) =>
              onChange({
                ...filters,
                releaseTypes: e.target.value ? [e.target.value as ReleaseType] : [],
              })
            }
            className="h-8 px-2.5 rounded-lg bg-[#0b0c10] border border-white/10 text-xs text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
          >
            <option value="">Усі типи релізів</option>
            {(meta?.releaseTypes || []).map((rt) => (
              <option key={rt.release_type} value={rt.release_type}>
                {RELEASE_TYPE_LABELS[rt.release_type] || rt.release_type} ({rt.count})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
            <span>Оцінка:</span>
            <input
              type="number"
              min={0}
              max={100}
              aria-label="Мінімальна оцінка"
              value={filters.minRating}
              onChange={(e) => {
                const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                onChange({ ...filters, minRating: v });
              }}
              className="no-spinner font-mono-num w-12 h-8 px-1.5 text-center rounded-lg bg-[#0b0c10] border border-white/10 text-[#f3efe6]"
            />
            <span>–</span>
            <input
              type="number"
              min={0}
              max={100}
              aria-label="Максимальна оцінка"
              value={filters.maxRating}
              onChange={(e) => {
                const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                onChange({ ...filters, maxRating: v });
              }}
              className="no-spinner font-mono-num w-12 h-8 px-1.5 text-center rounded-lg bg-[#0b0c10] border border-white/10 text-[#f3efe6]"
            />
          </div>
        </div>

        <div className="text-xs text-[#9ca3af]">
          Знайдено:{' '}
          <span className="font-mono-num font-semibold text-[#f3efe6]">
            {totalResults}
          </span>
        </div>
      </div>
    </section>
  );
}
