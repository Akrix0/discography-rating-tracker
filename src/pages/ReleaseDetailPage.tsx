import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Disc3,
  ExternalLink,
  Info,
  ListMusic,
  Radio,
} from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import { CATEGORY_META, RELEASE_TYPE_LABELS, type ReleaseDetail } from '../types';
import { RatingControl } from '../components/RatingControl';
import { SongRow } from '../components/SongRow';

export function ReleaseDetailPage() {
  const { idOrSlug } = useParams();
  const { refreshArtists, setSelectedArtistId } = useArtist();
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAlbumPlayer, setShowAlbumPlayer] = useState(false);

  const loadRelease = useCallback(async () => {
    if (!idOrSlug) return;
    setLoading(true);
    try {
      const data = await api.getReleaseDetail(idOrSlug);
      setRelease(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося завантажити реліз');
    } finally {
      setLoading(false);
    }
  }, [idOrSlug]);

  useEffect(() => {
    void loadRelease();
  }, [loadRelease]);

  if (loading) {
    return <div className="h-72 rounded-3xl bg-[#13151c] animate-pulse" />;
  }

  if (error || !release) {
    return (
      <div className="rounded-2xl bg-[#13151c] border border-[#d95d4e]/40 p-8 text-center space-y-3">
        <p className="text-[#e87c6f] font-medium">{error || 'Реліз не знайдено'}</p>
        <Link to="/releases" className="text-sm text-[#e09f5a] hover:underline inline-block">
          ← Повернутися до списку релізів
        </Link>
      </div>
    );
  }

  const catMeta = CATEGORY_META[release.category] || CATEGORY_META.Other;

  const handleSongUpdated = (
    songId: number,
    patch: { rating?: number | null; note?: string }
  ) => {
    setRelease((prev) => {
      if (!prev) return prev;
      const tracks = prev.tracks.map((t) =>
        t.id === songId
          ? {
              ...t,
              ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
              ...(patch.note !== undefined ? { note: patch.note } : {}),
            }
          : t
      );
      const rated = tracks.filter((t) => t.rating !== null);
      const avg =
        rated.length > 0
          ? Math.round((rated.reduce((sum, t) => sum + (t.rating || 0), 0) / rated.length) * 10) / 10
          : null;
      return {
        ...prev,
        tracks,
        rated_track_count: rated.length,
        average_track_rating: avg,
      };
    });
    void refreshArtists();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/releases"
          className="inline-flex items-center gap-1.5 text-sm text-[#9ca3af] hover:text-[#f3efe6] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Усі релізи</span>
        </Link>
        <Link
          to="/"
          onClick={() => setSelectedArtistId(release.artist_id)}
          className="text-xs font-semibold text-[#e09f5a] hover:underline"
        >
          Виконавець: {release.artist_name} →
        </Link>
      </div>

      <section className="rounded-3xl bg-[#13151c] border border-white/[0.08] p-5 sm:p-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-start">
          <div className="md:col-span-4 lg:col-span-3">
            <div className="aspect-square rounded-2xl overflow-hidden bg-[#1a1d27] border border-white/10 shadow-2xl shadow-black/60 flex items-center justify-center">
              {release.cover_url ? (
                <img
                  src={release.cover_url}
                  alt={release.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc3 className="w-20 h-20 text-[#374151]" />
              )}
            </div>
          </div>

          <div className="md:col-span-8 lg:col-span-9 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e09f5a]/15 text-[#e09f5a] border border-[#e09f5a]/30">
                  {release.artist_name}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${catMeta.badgeBg}`}>
                  {release.category}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-white/[0.06] text-[#d1d5db] border border-white/10">
                  {RELEASE_TYPE_LABELS[release.release_type] || release.release_type}
                </span>
              </div>

              <h1 className="font-display text-2xl sm:text-4xl font-bold text-[#f3efe6]">
                {release.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-[#9ca3af]">
                <span className="inline-flex items-center gap-1.5 font-mono-num">
                  <Calendar className="w-4 h-4 text-[#6b7280]" />
                  {release.release_date || release.release_year || 'Дата невідома'}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono-num">
                  <ListMusic className="w-4 h-4 text-[#6b7280]" />
                  {release.track_count} композицій ({release.rated_track_count} оцінено)
                </span>
                {release.average_track_rating !== null && (
                  <span className="font-mono-num text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                    Середній бал треків: <strong className="text-[#f3efe6]">{release.average_track_rating}</strong>
                  </span>
                )}
              </div>

              {release.verification_note && (
                <div className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af] pt-1">
                  <Info className="w-3.5 h-3.5 text-[#e09f5a] shrink-0" />
                  <span>{release.verification_note}</span>
                </div>
              )}

              <div className="pt-1 flex flex-wrap items-center gap-3">
                {release.spotify_url && (
                  <a
                    href={release.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-[#1DB954]/15 hover:bg-[#1DB954]/25 border border-[#1DB954]/40 text-xs sm:text-sm font-semibold text-[#1DB954] inline-flex items-center gap-2 transition-colors"
                  >
                    <span>Відкрити реліз у Spotify</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {release.spotify_id && (
                  <button
                    type="button"
                    onClick={() => setShowAlbumPlayer((v) => !v)}
                    className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs sm:text-sm font-medium text-[#f3efe6] inline-flex items-center gap-2 transition-colors"
                  >
                    <Radio className="w-4 h-4 text-[#e09f5a]" />
                    <span>{showAlbumPlayer ? 'Сховати плеєр альбому' : 'Spotify-плеєр альбому'}</span>
                  </button>
                )}
              </div>
            </div>

            {showAlbumPlayer && release.spotify_id && (
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0b0c10]">
                <iframe
                  title={`Spotify альбом: ${release.title}`}
                  src={`https://open.spotify.com/embed/album/${release.spotify_id}?utm_source=generator&theme=0`}
                  width="100%"
                  height="352"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                />
              </div>
            )}

            <div className="rounded-2xl bg-[#0b0c10]/70 border border-white/[0.08] p-4 sm:p-5 space-y-3">
              <div>
                <h2 className="text-sm font-bold text-[#f3efe6]">Суб’єктивна оцінка релізу</h2>
                <p className="text-[11px] text-[#9ca3af]">
                  Не залежить від середньої оцінки окремих композицій — оцініть реліз як цілісний проєкт.
                </p>
              </div>

              <RatingControl
                rating={release.rating}
                note={release.note}
                onSaveRating={(r) => api.saveReleaseRating(release.id, r)}
                onSaveNote={(n) => api.saveReleaseNote(release.id, n)}
                onUpdated={(patch) => {
                  setRelease((prev) =>
                    prev
                      ? {
                          ...prev,
                          ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
                          ...(patch.note !== undefined ? { note: patch.note } : {}),
                        }
                      : prev
                  );
                  void refreshArtists();
                }}
                notePlaceholder="Загальні враження від альбому або релізу..."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-[#f3efe6]">
          Список композицій ({release.tracks.length})
        </h2>
        <div className="space-y-3">
          {release.tracks.map((track) => (
            <SongRow
              key={`${track.id}-${track.disc_number}-${track.track_number}`}
              song={track}
              trackNumber={track.track_number}
              onSongUpdated={handleSongUpdated}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
