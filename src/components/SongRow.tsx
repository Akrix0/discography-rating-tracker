import { Link } from 'react-router-dom';
import { Clock, Disc3, ExternalLink } from 'lucide-react';
import { api, formatDuration } from '../api';
import { usePreferences } from '../context/PreferencesContext';
import { CATEGORY_META, type Song } from '../types';
import { RatingControl } from './RatingControl';
import { SpotifyEmbed } from './SpotifyEmbed';

interface SongRowProps {
  song: Song;
  trackNumber?: number;
  showArtist?: boolean;
  onSongUpdated?: (songId: number, patch: { rating?: number | null; note?: string }) => void;
}

export function SongRow({ song, trackNumber, showArtist = false, onSongUpdated }: SongRowProps) {
  const { t } = usePreferences();
  const catMeta = CATEGORY_META[song.category] || CATEGORY_META.Other;

  return (
    <article className="group rounded-2xl bg-[#13151c] border border-white/[0.07] hover:border-white/[0.15] p-4 transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-black/15">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-4 flex items-start gap-3.5 min-w-0">
          {trackNumber !== undefined && (
            <span className="font-mono-num text-xs text-[#6b7280] w-5 pt-2 text-right shrink-0">
              {trackNumber}.
            </span>
          )}
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#1a1d27] border border-white/10 shrink-0 flex items-center justify-center">
            {song.cover_url ? (
              <img
                src={song.cover_url}
                alt={song.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <Disc3 className="w-7 h-7 text-[#4b5563]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {showArtist && song.artist_name && (
              <div className="text-[11px] font-semibold text-[#e09f5a] mb-0.5 truncate">
                {song.artist_name}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-[#f3efe6] text-base leading-snug truncate max-w-full">
                {song.title}
              </h3>
              {song.version_tag && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#e09f5a]/15 text-[#e09f5a] border border-[#e09f5a]/30">
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
              <span className={`px-2 py-0.5 rounded-full border text-[11px] ${catMeta.badgeBg}`}>
                {song.category}
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

            {song.releases.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {song.releases.slice(0, 3).map((rel) => (
                  <Link
                    key={`${rel.id}-${rel.track_number}`}
                    to={`/releases/${rel.slug}`}
                    className="text-[11px] text-[#9ca3af] hover:text-[#f3efe6] bg-white/[0.04] hover:bg-white/[0.09] px-2 py-0.5 rounded-md border border-white/[0.06] truncate max-w-[200px] transition-colors"
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
          {song.spotify_url && (
            <div className="mt-1 flex justify-end lg:hidden">
              <a
                href={song.spotify_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#1DB954] inline-flex items-center gap-1 hover:underline"
              >
                {t.openInSpotify} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
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
