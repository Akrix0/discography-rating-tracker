import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock, Disc3, GripVertical, Loader2, Trophy } from 'lucide-react';
import { api, formatDuration } from '../api';
import { usePreferences } from '../context/PreferencesContext';
import { CATEGORY_LABELS } from '../i18n/translations';
import { CATEGORY_META, type Song } from '../types';
import { RatingControl } from './RatingControl';
import { SpotifyEmbed } from './SpotifyEmbed';

interface SongRowProps {
  song: Song;
  trackNumber?: number;
  showArtist?: boolean;
  onSongUpdated?: (songId: number, patch: { rating?: number | null; note?: string }) => void;
  currentReleaseId?: number;
  isBestTrackOnCurrentRelease?: boolean;
  bestTrackBusy?: boolean;
  onToggleBestTrack?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStartRow?: (e: React.DragEvent) => void;
  onDragOverRow?: (e: React.DragEvent) => void;
  onDropRow?: (e: React.DragEvent) => void;
  onDragEndRow?: () => void;
}

export function SongRow({
  song,
  trackNumber,
  showArtist = false,
  onSongUpdated,
  currentReleaseId,
  isBestTrackOnCurrentRelease = false,
  bestTrackBusy = false,
  onToggleBestTrack,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  isDragging = false,
  isDragOver = false,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow,
}: SongRowProps) {
  const { lang, t } = usePreferences();
  const catMeta = CATEGORY_META[song.category] || CATEGORY_META.Other;
  const showReorderControls = Boolean(canMoveUp || canMoveDown);
  const otherBestBadges = (song.best_of_releases || []).filter(
    (b) => currentReleaseId === undefined || b.id !== currentReleaseId
  );

  return (
    <article
      draggable={showReorderControls}
      onDragStart={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, button, a, iframe')) {
          e.preventDefault();
          return;
        }
        onDragStartRow?.(e);
      }}
      onDragOver={onDragOverRow}
      onDrop={onDropRow}
      onDragEnd={onDragEndRow}
      className={`group rounded-2xl border p-3 sm:p-4 transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-black/15 ${
        isBestTrackOnCurrentRelease
          ? 'bg-gradient-to-r from-[#e09f5a]/[0.08] via-[#13151c] to-[#13151c] border-[#e09f5a]/45'
          : 'bg-[#13151c] border-white/[0.07] hover:border-white/[0.15]'
      } ${isDragOver ? 'ring-2 ring-[#e09f5a]/70' : ''} ${isDragging ? 'opacity-55' : ''}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-center">
        <div className="lg:col-span-4 flex items-start gap-2.5 sm:gap-3.5 min-w-0">
          {showReorderControls && (
            <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                title={t.moveUpTitle}
                aria-label={t.moveUpTitle}
                className="w-6 h-5 rounded bg-white/[0.04] hover:bg-[#e09f5a]/20 text-[#9ca3af] hover:text-[#e09f5a] disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center border border-white/[0.08] transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <span
                title={t.reorderSameScoreHint}
                className="text-[#6b7280] cursor-grab active:cursor-grabbing py-0.5"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                title={t.moveDownTitle}
                aria-label={t.moveDownTitle}
                className="w-6 h-5 rounded bg-white/[0.04] hover:bg-[#e09f5a]/20 text-[#9ca3af] hover:text-[#e09f5a] disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center border border-white/[0.08] transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {trackNumber !== undefined && (
            <span className="font-mono-num text-xs text-[#6b7280] w-5 pt-2 text-right shrink-0">
              {trackNumber}.
            </span>
          )}
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-[#1a1d27] border border-white/10 shrink-0 flex items-center justify-center">
            {song.cover_url ? (
              <img
                src={song.cover_url}
                alt={song.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <Disc3 className="w-6 h-6 sm:w-7 sm:h-7 text-[#4b5563]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {showArtist && song.artist_name && (
              <div className="text-[11px] font-semibold text-[#e09f5a] mb-0.5 truncate">
                {song.artist_name}
              </div>
            )}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className="font-semibold text-[#f3efe6] text-sm sm:text-base leading-snug break-words line-clamp-2 sm:truncate max-w-full">
                {song.title}
              </h3>
              {song.version_tag && (
                <span className="px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-[#e09f5a]/15 text-[#e09f5a] border border-[#e09f5a]/30">
                  {song.version_tag}
                </span>
              )}
              {song.is_explicit && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-num bg-white/10 text-[#9ca3af]">
                  E
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-[#9ca3af]">
              <span className={`px-2 py-0.5 rounded-full border text-[10px] sm:text-[11px] ${catMeta.badgeBg}`}>
                {CATEGORY_LABELS[lang][song.category] || song.category}
              </span>
              {song.duration_ms && (
                <span className="inline-flex items-center gap-1 font-mono-num text-[11px] text-[#9ca3af]">
                  <Clock className="w-3 h-3" />
                  {formatDuration(song.duration_ms)}
                </span>
              )}
              {song.primary_release_year && (
                <span className="font-mono-num text-[11px] text-[#6b7280]">
                  {song.primary_release_year}
                </span>
              )}
            </div>

            {(onToggleBestTrack || otherBestBadges.length > 0) && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {onToggleBestTrack && (
                  <button
                    type="button"
                    disabled={bestTrackBusy}
                    onClick={onToggleBestTrack}
                    title={
                      isBestTrackOnCurrentRelease
                        ? t.removeBestTrackTooltip
                        : t.bestTrackTooltip
                    }
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1 transition-colors ${
                      isBestTrackOnCurrentRelease
                        ? 'bg-[#e09f5a]/25 text-[#f3c969] border-[#e09f5a]/60 shadow-sm'
                        : 'bg-white/[0.04] hover:bg-[#e09f5a]/15 text-[#9ca3af] hover:text-[#e09f5a] border-white/10 hover:border-[#e09f5a]/40'
                    }`}
                  >
                    {bestTrackBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trophy className="w-3 h-3 shrink-0" />
                    )}
                    <span>
                      {isBestTrackOnCurrentRelease
                        ? t.bestTrackInReleaseBadge
                        : t.pickBestTrackBtn}
                    </span>
                  </button>
                )}

                {otherBestBadges.map((b) => (
                  <Link
                    key={b.id}
                    to={`/releases/${b.slug}`}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#e09f5a]/15 text-[#f3c969] border border-[#e09f5a]/35 hover:bg-[#e09f5a]/25 inline-flex items-center gap-1 max-w-[200px] transition-colors"
                    title={b.title}
                  >
                    <Trophy className="w-3 h-3 shrink-0" />
                    <span className="truncate">{t.bestOnReleaseBadge(b.title)}</span>
                  </Link>
                ))}
              </div>
            )}

            {song.releases.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {song.releases.slice(0, 3).map((rel) => (
                  <Link
                    key={`${rel.id}-${rel.track_number}`}
                    to={`/releases/${rel.slug}`}
                    className="text-[11px] text-[#9ca3af] hover:text-[#f3efe6] bg-white/[0.04] hover:bg-white/[0.09] px-2 py-0.5 rounded-md border border-white/[0.06] truncate max-w-[140px] sm:max-w-[200px] transition-colors"
                    title={`${rel.title} (${rel.category})`}
                  >
                    {rel.title}
                  </Link>
                ))}
                {song.releases.length > 3 && (
                  <span className="text-[11px] text-[#6b7280]">
                    {t.moreReleases(song.releases.length - 3)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 min-w-0">
          <SpotifyEmbed
            spotifyId={song.spotify_id}
            spotifyUrl={song.spotify_url}
            type="track"
            title={song.title}
            verificationNote={song.verification_note}
            height={80}
          />
        </div>

        <div className="lg:col-span-4 min-w-0">
          <RatingControl
            compact
            rating={song.rating}
            note={song.note}
            onSaveRating={(r) => api.saveSongRating(song.id, r)}
            onSaveNote={(n) => api.saveSongNote(song.id, n)}
            onUpdated={(patch) => onSongUpdated?.(song.id, patch)}
            notePlaceholder={t.songNotePlaceholder}
          />
        </div>
      </div>
    </article>
  );
}
