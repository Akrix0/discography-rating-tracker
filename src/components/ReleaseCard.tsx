import { Link } from 'react-router-dom';
import {
  Calendar,
  Check,
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  ListMusic,
  Loader2,
  Trophy,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { CATEGORY_LABELS } from '../i18n/translations';
import { CATEGORY_META, type Release } from '../types';
import { Tooltip } from './Tooltip';
import { btnGhost } from './ui/buttonStyles';

interface ReleaseCardProps {
  release: Release;
  showArtist?: boolean;
  onToggleHidden?: (release: Release) => void;
  hideBusy?: boolean;
  bulkMode?: boolean;
  bulkScenario?: 'keep_selected' | 'hide_selected';
  selected?: boolean;
  onToggleSelect?: (releaseId: number) => void;
}

export function ReleaseCard({
  release,
  showArtist = false,
  onToggleHidden,
  hideBusy = false,
  bulkMode = false,
  bulkScenario = 'keep_selected',
  selected = false,
  onToggleSelect,
}: ReleaseCardProps) {
  const { lang, t } = usePreferences();
  const catMeta = CATEGORY_META[release.category] || CATEGORY_META.Other;
  const hasRating = release.rating !== null;

  if (bulkMode) {
    const willBeHidden = bulkScenario === 'keep_selected' ? !selected : selected;

    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(release.id)}
        aria-pressed={selected}
        className={`group text-left rounded-2xl border overflow-hidden flex flex-col transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e09f5a]/70 ${
          selected
            ? bulkScenario === 'keep_selected'
              ? 'bg-[#13151c] border-[#5fb38e] ring-2 ring-[#5fb38e]/45 shadow-lg shadow-[#5fb38e]/10'
              : 'bg-[#13151c] border-[#d95d4e] ring-2 ring-[#d95d4e]/45 shadow-lg shadow-[#d95d4e]/10'
            : 'bg-[#13151c] border-white/[0.08] hover:border-white/25'
        } ${willBeHidden ? 'opacity-60 hover:opacity-85' : 'opacity-100'}`}
      >
        <div className="relative aspect-square bg-[#1a1d27] overflow-hidden w-full">
          {release.cover_url ? (
            <img
              src={release.cover_url}
              alt={release.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Disc3 className="w-10 h-10 text-[#374151]" />
            </div>
          )}

          <div
            className={`absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center transition-all shadow ${
              selected
                ? bulkScenario === 'keep_selected'
                  ? 'bg-[#5fb38e] border-[#5fb38e] text-[#0b0c10]'
                  : 'bg-[#d95d4e] border-[#d95d4e] text-white'
                : 'bg-[#0b0c10]/75 border-white/30 text-transparent group-hover:border-white/60'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>

          {release.is_hidden && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#0b0c10]/85 border border-white/15 text-[10px] font-medium text-[#9ca3af]">
              {t.hiddenBadge}
            </div>
          )}

          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border backdrop-blur-md truncate max-w-[75%] ${catMeta.badgeBg}`}
            >
              {CATEGORY_LABELS[lang][release.category] || release.category}
            </span>
            {hasRating && (
              <span className="font-mono-num px-1.5 py-0.5 rounded bg-[#0b0c10]/85 text-[10px] font-bold text-[#5fb38e] border border-[#5fb38e]/35 shrink-0">
                {release.rating}
              </span>
            )}
          </div>
        </div>

        <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
          <div>
            {showArtist && release.artist_name && (
              <div className="text-[10px] font-semibold text-[#e09f5a] truncate">
                {release.artist_name}
              </div>
            )}
            <div className="font-semibold text-xs sm:text-sm text-[#f3efe6] line-clamp-2 leading-snug">
              {release.title}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#9ca3af] font-mono-num pt-1">
            <span>{release.release_year || '—'}</span>
            <span>
              {release.track_count} {t.tracksShort}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`group rounded-2xl bg-[#13151c] border border-white/[0.07] hover:border-white/[0.18] overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20 ${
        release.is_hidden ? 'opacity-75' : ''
      }`}
    >
      <Link
        to={`/releases/${release.slug}`}
        className="relative aspect-square bg-[#1a1d27] overflow-hidden block"
      >
        {release.cover_url ? (
          <img
            src={release.cover_url}
            alt={release.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 className="w-16 h-16 text-[#374151]" />
          </div>
        )}

        {release.is_hidden && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[#0b0c10]/85 backdrop-blur-md text-[#e09f5a] border border-[#e09f5a]/40 inline-flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            <span>{t.hiddenBadge}</span>
          </div>
        )}

        <div className="absolute top-3 right-3">
          {hasRating ? (
            <span className="font-mono-num px-2.5 py-1 rounded-lg text-xs font-bold bg-[#0b0c10]/85 backdrop-blur-md text-[#5fb38e] border border-[#5fb38e]/40 shadow-lg">
              {release.rating}/100
            </span>
          ) : (
            <span className="px-2 py-1 rounded-lg text-[11px] bg-[#0b0c10]/75 backdrop-blur-md text-[#9ca3af] border border-white/10">
              {t.unratedBadge}
            </span>
          )}
        </div>

        <div className="absolute bottom-3 left-3">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur-md ${catMeta.badgeBg}`}
          >
            {CATEGORY_LABELS[lang][release.category] || release.category}
          </span>
        </div>
      </Link>

      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          {showArtist && release.artist_name && (
            <div className="text-[11px] font-semibold text-[#e09f5a] mb-0.5 truncate">
              {release.artist_name}
            </div>
          )}
          <Link
            to={`/releases/${release.slug}`}
            className="font-semibold text-[#f3efe6] hover:text-[#e09f5a] transition-colors line-clamp-2 text-base leading-snug"
          >
            {release.title}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9ca3af]">
            <span className="inline-flex items-center gap-1 font-mono-num">
              <Calendar className="w-3.5 h-3.5 text-[#6b7280]" />
              {release.release_date || release.release_year || t.dateUnknown}
            </span>
            <span className="inline-flex items-center gap-1 font-mono-num">
              <ListMusic className="w-3.5 h-3.5 text-[#6b7280]" />
              {release.rated_track_count}/{release.track_count} {t.tracksShort}
            </span>
          </div>
          {release.best_song_title && (
            <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e09f5a]/15 border border-[#e09f5a]/30 text-[11px] font-medium text-[#f3c969] max-w-full">
              <Trophy className="w-3 h-3 shrink-0" />
              <span className="truncate">{release.best_song_title}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <Link
            to={`/releases/${release.slug}`}
            className="text-xs font-medium text-[#e09f5a] hover:underline truncate"
          >
            {t.openRelease}
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleHidden && (
              <Tooltip
                content={release.is_hidden ? t.restoreReleaseTooltip : t.hideReleaseTooltip}
                align="end"
              >
                <button
                  type="button"
                  disabled={hideBusy}
                  onClick={() => onToggleHidden(release)}
                  aria-label={release.is_hidden ? t.restoreReleaseBtn : t.hideReleaseBtn}
                  className={
                    release.is_hidden
                      ? 'inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold bg-[#5fb38e]/15 hover:bg-[#5fb38e]/25 text-[#5fb38e] border border-[#5fb38e]/35 transition-colors cursor-pointer'
                      : `${btnGhost} h-7 px-2 text-[11px]`
                  }
                >
                  {hideBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : release.is_hidden ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>{t.restoreReleaseBtn}</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t.hideReleaseBtn}</span>
                    </>
                  )}
                </button>
              </Tooltip>
            )}

            {release.spotify_url && (
              <Tooltip content={t.openInSpotify} align="end">
                <a
                  href={release.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.openInSpotify}
                  className="w-7 h-7 rounded-lg text-[#1DB954] hover:bg-[#1DB954]/15 inline-flex items-center justify-center transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
