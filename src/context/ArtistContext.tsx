import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { ArtistSummary } from '../types';

interface ArtistContextValue {
  artists: ArtistSummary[];
  loadingArtists: boolean;
  selectedArtistId: number | null;
  selectedArtist: ArtistSummary | null;
  setSelectedArtistId: (id: number | null) => void;
  refreshArtists: () => Promise<ArtistSummary[]>;
  isAddModalOpen: boolean;
  openAddModal: () => void;
  closeAddModal: () => void;
}

const ArtistContext = createContext<ArtistContextValue | null>(null);
const STORAGE_KEY = 'discography_tracker_active_artist_id';

export function ArtistProvider({ children }: { children: ReactNode }) {
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [selectedArtistId, setSelectedArtistIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'all') return null;
    const num = saved ? Number(saved) : NaN;
    return Number.isInteger(num) && num > 0 ? num : null;
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const setSelectedArtistId = useCallback((id: number | null) => {
    setSelectedArtistIdState(id);
    localStorage.setItem(STORAGE_KEY, id === null ? 'all' : String(id));
  }, []);

  const refreshArtists = useCallback(async () => {
    try {
      const data = await api.getArtists();
      setArtists(data.artists);
      setSelectedArtistIdState((prev) => {
        if (prev !== null && data.artists.some((a) => a.id === prev)) return prev;
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'all') return null;
        return data.artists[0]?.id ?? null;
      });
      return data.artists;
    } finally {
      setLoadingArtists(false);
    }
  }, []);

  useEffect(() => {
    void refreshArtists();
  }, [refreshArtists]);

  const openAddModal = useCallback(() => setIsAddModalOpen(true), []);
  const closeAddModal = useCallback(() => setIsAddModalOpen(false), []);

  const selectedArtist =
    selectedArtistId !== null ? artists.find((a) => a.id === selectedArtistId) ?? null : null;

  return (
    <ArtistContext.Provider
      value={{
        artists,
        loadingArtists,
        selectedArtistId,
        selectedArtist,
        setSelectedArtistId,
        refreshArtists,
        isAddModalOpen,
        openAddModal,
        closeAddModal,
      }}
    >
      {children}
    </ArtistContext.Provider>
  );
}

export function useArtist() {
  const ctx = useContext(ArtistContext);
  if (!ctx) throw new Error('useArtist must be used inside ArtistProvider');
  return ctx;
}
