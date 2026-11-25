import { Link } from 'react-router-dom';
import { Disc3, ExternalLink, Calendar, ListMusic } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { CATEGORY_META, type Release } from '../types';

interface ReleaseCardProps {
  release: Release;
  showArtist?: boolean;
}

export function ReleaseCard({ release, showArtist = false }: ReleaseCardProps) {
  const { t } = usePreferences();
  const catMeta = CATEGORY_META[release.category] || CATEGORY_META.Other;
  const hasRating = release.rating !== null;

  return (
    <div className="group rounded-2xl bg-[#13151c] border border-white/[0.07] hover:border-white/[0.18] overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20">
      <Link to={`/releases/${release.slug}`} className="relative aspect-square bg-[#1a1d27] overflow-hidden block">
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
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur-md ${catMeta.badgeBg}`}>
            {release.category}
          </span>
        </div>
      </Link>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
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
          <div className="mt-1.5 flex items-center gap-3 text-xs text-[#9ca3af]">
            <span className="inline-flex items-center gap-1 font-mono-num">
              <Calendar className="w-3.5 h-3.5 text-[#6b7280]" />
              {release.release_date || release.release_year || t.dateUnknown}
            </span>
            <span className="inline-flex items-center gap-1 font-mono-num">
              <ListMusic className="w-3.5 h-3.5 text-[#6b7280]" />
              {release.rated_track_count}/{release.track_count} {t.tracksShort}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <Link
            to={`/releases/${release.slug}`}
            className="text-xs font-medium text-[#e09f5a] hover:underline"
          >
            {t.openRelease}
          </Link>
          {release.spotify_url && (
            <a
              href={release.spotify_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#1DB954] hover:underline inline-flex items-center gap-1"
            >
              <span>Spotify</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
