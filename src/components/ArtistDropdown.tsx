import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Disc3, Globe2, Plus, Search, Users } from 'lucide-react';
import { useArtist } from '../context/ArtistContext';
import { usePreferences } from '../context/PreferencesContext';

export function ArtistDropdown() {
  const {
    artists,
    selectedArtist,
    selectedArtistId,
    setSelectedArtistId,
    openAddModal,
  } = useArtist();
  const { t } = usePreferences();

  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const filteredArtists = artists.filter((a) =>
    a.name.toLowerCase().includes(filterText.trim().toLowerCase())
  );

  const handleSelectArtist = (artistId: number | null) => {
    setSelectedArtistId(artistId);
    setOpen(false);
    setFilterText('');
    if (artistId === null) {
      navigate('/artists');
    } else if (location.pathname === '/artists' || location.pathname.startsWith('/releases/')) {
      navigate('/');
    }
  };

  const totalAllSongs = artists.reduce((sum, a) => sum + a.totalSongs, 0);
  const ratedAllSongs = artists.reduce((sum, a) => sum + a.ratedSongs, 0);
  const allPct =
    totalAllSongs > 0 ? Math.round((ratedAllSongs / totalAllSongs) * 1000) / 10 : 0;

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 flex-1 sm:flex-initial sm:w-auto sm:max-w-[220px] lg:max-w-[180px] xl:max-w-[220px]"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full max-w-full overflow-hidden flex items-center justify-between gap-1.5 sm:gap-2 pl-1.5 pr-2 sm:pr-2.5 py-1.5 rounded-xl bg-[#13151c] hover:bg-[#1a1d27] border border-white/10 hover:border-white/20 transition-all min-w-0"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedArtist ? (
            <>
              <div className="w-7 h-7 rounded-lg overflow-hidden bg-[#1a1d27] shrink-0 flex items-center justify-center border border-white/10">
                {selectedArtist.image_url ? (
                  <img
                    src={selectedArtist.image_url}
                    alt={selectedArtist.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc3 className="w-4 h-4 text-[#e09f5a]" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-xs sm:text-sm font-semibold text-[#f3efe6] truncate">
                  {selectedArtist.name}
                </div>
                <div className="hidden min-[360px]:block text-[10px] font-mono-num text-[#9ca3af] leading-none truncate">
                  {selectedArtist.ratedSongs}/{selectedArtist.totalSongs} • {selectedArtist.completionPercent}%
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-lg bg-[#e09f5a]/15 border border-[#e09f5a]/30 flex items-center justify-center shrink-0">
                <Globe2 className="w-4 h-4 text-[#e09f5a]" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-xs sm:text-sm font-semibold text-[#f3efe6] truncate">
                  {t.allArtists}
                </div>
                <div className="hidden min-[360px]:block text-[10px] font-mono-num text-[#9ca3af] leading-none truncate">
                  {ratedAllSongs}/{totalAllSongs} • {allPct}%
                </div>
              </div>
            </>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#9ca3af] shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-[min(20rem,calc(100vw-1.5rem))] sm:w-80 rounded-2xl bg-[#13151c] border border-white/15 shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="p-2.5 border-b border-white/[0.08] bg-[#0b0c10]/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6b7280] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder={t.searchInListPlaceholder}
                autoFocus
                className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-[#13151c] border border-white/10 text-xs text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]"
              />
            </div>
          </div>

          <div role="listbox" className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            <button
              type="button"
              onClick={() => handleSelectArtist(null)}
              className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                selectedArtistId === null
                  ? 'bg-[#e09f5a]/15 text-[#f3efe6] border border-[#e09f5a]/30'
                  : 'hover:bg-white/[0.06] text-[#d1d5db] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#e09f5a]/15 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-[#e09f5a]" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{t.allArtistsHub}</div>
                  <div className="text-[10px] text-[#9ca3af]">{t.crossArtistSub}</div>
                </div>
              </div>
              {selectedArtistId === null && <Check className="w-4 h-4 text-[#e09f5a] shrink-0" />}
            </button>

            <div className="my-1 border-t border-white/[0.06]" />

            {filteredArtists.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#6b7280]">{t.noMatches}</div>
            ) : (
              filteredArtists.map((artist) => {
                const isSelected = artist.id === selectedArtistId;
                return (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => handleSelectArtist(artist.id)}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                      isSelected
                        ? 'bg-[#d95d4e]/15 text-[#f3efe6] border border-[#d95d4e]/35'
                        : 'hover:bg-white/[0.06] text-[#d1d5db] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#1a1d27] border border-white/10 shrink-0 flex items-center justify-center">
                        {artist.image_url ? (
                          <img
                            src={artist.image_url}
                            alt={artist.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Disc3 className="w-4 h-4 text-[#6b7280]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{artist.name}</div>
                        <div className="text-[10px] font-mono-num text-[#9ca3af]">
                          {artist.totalReleases} {t.relShort} • {artist.ratedSongs}/{artist.totalSongs}{' '}
                          {t.songsWord}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#e09f5a]">
                        {artist.completionPercent}%
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-[#d95d4e]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="p-2 border-t border-white/[0.08] bg-[#0b0c10]/80">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openAddModal();
              }}
              className="w-full h-9 rounded-xl bg-[#d95d4e] hover:bg-[#c84d3e] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t.addNewArtist}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
