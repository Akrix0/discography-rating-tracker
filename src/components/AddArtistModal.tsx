import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Disc3,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
  AlertCircle,
  Link2,
} from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import type { ArtistCandidate, ImportJobStatus, ImportPreferences } from '../types';

export function AddArtistModal() {
  const { isAddModalOpen, closeAddModal, refreshArtists, setSelectedArtistId } = useArtist();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ArtistCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ArtistCandidate | null>(null);
  const [manualSpotifyUrl, setManualSpotifyUrl] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<ImportPreferences>({
    includeCore: true,
    includeDeluxe: true,
    includeLive: false,
    includeRemixes: false,
    includeAlternate: false,
  });

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ImportJobStatus | null>(null);

  useEffect(() => {
    if (!isAddModalOpen) {
      setQuery('');
      setCandidates([]);
      setSelectedCandidate(null);
      setManualSpotifyUrl('');
      setSearchError(null);
      setJobId(null);
      setJobStatus(null);
    }
  }, [isAddModalOpen]);

  // Poll active import job
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const st = await api.getJobStatus(jobId);
        if (!active) return;
        setJobStatus(st);
        if (st.status === 'completed') {
          window.clearInterval(timer);
          await refreshArtists();
          if (st.artistId) {
            setSelectedArtistId(st.artistId);
          }
          window.setTimeout(() => {
            closeAddModal();
            navigate('/');
          }, 750);
        } else if (st.status === 'error') {
          window.clearInterval(timer);
        }
      } catch {
        // retry on next tick
      }
    }, 600);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [jobId, refreshArtists, setSelectedArtistId, closeAddModal, navigate]);

  if (!isAddModalOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSelectedCandidate(null);
    try {
      const res = await api.searchArtists(query.trim());
      setCandidates(res.candidates);
      if (res.candidates.length === 1) {
        setSelectedCandidate(res.candidates[0]);
      } else if (res.candidates.length === 0) {
        setSearchError(
          'Нікого не знайдено. Спробуйте вставити пряме посилання на виконавця у Spotify (open.spotify.com/artist/...).'
        );
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Помилка пошуку');
    } finally {
      setSearching(false);
    }
  };

  const handleStartImport = async () => {
    const targetName = selectedCandidate?.name || query.trim();
    if (!targetName && !manualSpotifyUrl.trim()) return;

    try {
      const res = await api.importArtist({
        name: targetName,
        spotifyUrl: manualSpotifyUrl.trim() || selectedCandidate?.spotifyUrl || undefined,
        spotifyId: selectedCandidate?.spotifyId || undefined,
        mbId: selectedCandidate?.mbId || undefined,
        deezerId: selectedCandidate?.deezerId || undefined,
        itunesId: selectedCandidate?.itunesId || undefined,
        imageUrl: selectedCandidate?.imageUrl || undefined,
        prefs,
      });
      setJobId(res.jobId);
      setJobStatus({
        jobId: res.jobId,
        status: 'running',
        percent: 5,
        stage: 'Запуск збору дискографії…',
        processedReleases: 0,
        totalReleases: 0,
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Не вдалося запустити імпорт');
    }
  };

  const togglePref = (key: keyof ImportPreferences) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl bg-[#13151c] border border-white/15 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#d95d4e]/15 border border-[#d95d4e]/35 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#e09f5a]" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
                Додати нового виконавця
              </h2>
              <p className="text-[11px] text-[#9ca3af]">
                Автоматичний збір дискографії за назвою або посиланням на Spotify
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAddModal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {jobStatus ? (
            /* Step 2: Live Import Progress */
            <div className="py-6 space-y-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[#f3efe6] flex items-center gap-2">
                  {jobStatus.status === 'running' && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#e09f5a]" />
                  )}
                  {jobStatus.status === 'completed' && (
                    <Check className="w-4 h-4 text-[#5fb38e]" />
                  )}
                  {jobStatus.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-[#d95d4e]" />
                  )}
                  <span>{jobStatus.stage}</span>
                </span>
                <span className="font-mono-num font-bold text-[#e09f5a]">
                  {jobStatus.percent}%
                </span>
              </div>

              <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    jobStatus.status === 'error'
                      ? 'bg-[#d95d4e]'
                      : 'bg-gradient-to-r from-[#d95d4e] via-[#e09f5a] to-[#5fb38e]'
                  }`}
                  style={{ width: `${jobStatus.percent}%` }}
                />
              </div>

              {jobStatus.totalReleases > 0 && (
                <div className="text-xs font-mono-num text-[#9ca3af] text-center">
                  Оброблено релізів: {jobStatus.processedReleases} / {jobStatus.totalReleases}
                </div>
              )}

              {jobStatus.status === 'completed' && (
                <div className="rounded-xl bg-[#5fb38e]/15 border border-[#5fb38e]/35 p-4 text-center text-sm text-[#7cc9a7]">
                  Додано <strong>{jobStatus.artistName}</strong>: релізів ({jobStatus.addedReleases}),
                  нових пісень ({jobStatus.addedSongs}). Відкриваємо дашборд…
                </div>
              )}

              {jobStatus.status === 'error' && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[#d95d4e]/15 border border-[#d95d4e]/35 p-4 text-sm text-[#e87c6f]">
                    {jobStatus.error}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setJobId(null);
                      setJobStatus(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-white/10 text-xs font-medium text-[#f3efe6]"
                  >
                    Спробувати ще раз
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Step 1: Search & Import Preferences */
            <>
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Назва гурту (напр. Arctic Monkeys) або https://open.spotify.com/artist/..."
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#0b0c10] border border-white/12 text-sm text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="h-11 px-5 rounded-xl bg-[#e09f5a] hover:bg-[#d18f49] disabled:opacity-40 text-[#0b0c10] font-semibold text-sm inline-flex items-center gap-2 transition-colors shrink-0"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Знайти</span>
                </button>
              </form>

              {searchError && (
                <div className="rounded-xl bg-[#d95d4e]/15 border border-[#d95d4e]/35 px-4 py-3 text-xs text-[#e87c6f]">
                  {searchError}
                </div>
              )}

              {/* Candidate Cards */}
              {candidates.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[#9ca3af]">
                    Оберіть виконавця ({candidates.length}):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {candidates.map((cand, idx) => {
                      const active = selectedCandidate === cand;
                      return (
                        <button
                          key={`${cand.name}-${cand.spotifyId || cand.deezerId || idx}`}
                          type="button"
                          onClick={() => setSelectedCandidate(cand)}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                            active
                              ? 'bg-[#d95d4e]/15 border-[#d95d4e]/50 ring-1 ring-[#d95d4e]/30'
                              : 'bg-[#0b0c10]/70 border-white/[0.08] hover:border-white/20'
                          }`}
                        >
                          <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#1a1d27] shrink-0 flex items-center justify-center">
                            {cand.imageUrl ? (
                              <img
                                src={cand.imageUrl}
                                alt={cand.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Disc3 className="w-5 h-5 text-[#6b7280]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[#f3efe6] truncate">
                              {cand.name}
                            </div>
                            <div className="text-[11px] text-[#9ca3af] truncate">
                              {cand.disambiguation || cand.source}
                            </div>
                            {cand.spotifyId && (
                              <span className="inline-block mt-0.5 text-[10px] text-[#1DB954] font-medium">
                                Spotify ✓
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optional Spotify Artist URL helper when candidate lacks spotifyId */}
              {selectedCandidate && !selectedCandidate.spotifyId && (
                <div className="rounded-xl bg-[#0b0c10]/80 border border-[#e09f5a]/30 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[#e09f5a] font-medium">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>
                      Для цього виконавця Spotify ID не знайдено автоматично — вставте посилання на Spotify (необов’язково, але увімкне плеєри):
                    </span>
                  </div>
                  <input
                    type="text"
                    value={manualSpotifyUrl}
                    onChange={(e) => setManualSpotifyUrl(e.target.value)}
                    placeholder="https://open.spotify.com/artist/..."
                    className="w-full h-9 px-3 rounded-lg bg-[#13151c] border border-white/10 text-xs text-[#f3efe6]"
                  />
                </div>
              )}

              {/* Version Filter Checkboxes */}
              <div className="rounded-2xl bg-[#0b0c10]/70 border border-white/[0.08] p-4 space-y-3">
                <div className="text-xs font-semibold text-[#f3efe6]">
                  Які типи релізів і версій збирати до каталогу:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    {
                      key: 'includeCore' as const,
                      label: 'Основна дискографія',
                      sub: 'Studio Albums, EPs, Singles',
                    },
                    {
                      key: 'includeDeluxe' as const,
                      label: 'Deluxe / Extended видання',
                      sub: 'Бонус-треки до студійних альбомів',
                    },
                    {
                      key: 'includeLive' as const,
                      label: 'Концертні записи (Live)',
                      sub: 'Live Sessions, концертні альбоми',
                    },
                    {
                      key: 'includeRemixes' as const,
                      label: 'Ремікси (Remixes)',
                      sub: 'Офіційні ремікси та мікси',
                    },
                    {
                      key: 'includeAlternate' as const,
                      label: 'Sped Up / Slowed / Acoustic / Демо',
                      sub: 'Альтернативні та прискорені версії',
                    },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#13151c] border border-white/[0.06] cursor-pointer hover:border-white/15"
                    >
                      <input
                        type="checkbox"
                        checked={prefs[item.key]}
                        onChange={() => togglePref(item.key)}
                        className="mt-0.5 accent-[#d95d4e]"
                      />
                      <div>
                        <div className="font-medium text-[#f3efe6]">{item.label}</div>
                        <div className="text-[11px] text-[#6b7280]">{item.sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Start Import CTA */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs sm:text-sm text-[#d1d5db]"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  disabled={!selectedCandidate && !query.trim()}
                  onClick={handleStartImport}
                  className="px-5 py-2.5 rounded-xl bg-[#d95d4e] hover:bg-[#c84d3e] disabled:opacity-40 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-lg shadow-[#d95d4e]/25"
                >
                  <Plus className="w-4 h-4" />
                  <span>Зібрати дискографію</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
