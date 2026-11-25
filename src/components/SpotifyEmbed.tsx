import { memo, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Music, Play } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';

export type EmbedLoadMode = 'auto' | 'click';
const EMBED_MODE_KEY = 'discography_embed_mode';
const EMBED_MODE_EVENT = 'discography-embed-mode-change';

export function getEmbedLoadMode(): EmbedLoadMode {
  try {
    return localStorage.getItem(EMBED_MODE_KEY) === 'click' ? 'click' : 'auto';
  } catch {
    return 'auto';
  }
}

export function setEmbedLoadMode(mode: EmbedLoadMode): void {
  try {
    localStorage.setItem(EMBED_MODE_KEY, mode);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(EMBED_MODE_EVENT, { detail: mode }));
}

const MAX_CONCURRENT = 2;
let activeCount = 0;
type QueueEntry = { run: (releaseSlot: () => void) => void; cancelled: boolean };
const waitQueue: QueueEntry[] = [];

function pumpQueue() {
  while (activeCount < MAX_CONCURRENT && waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    if (next.cancelled) continue;
    activeCount++;
    let released = false;
    const releaseSlot = () => {
      if (released) return;
      released = true;
      activeCount = Math.max(0, activeCount - 1);
      pumpQueue();
    };
    window.setTimeout(releaseSlot, 2800);
    next.run(releaseSlot);
  }
}

function enqueueEmbedLoad(run: (releaseSlot: () => void) => void): () => void {
  const entry: QueueEntry = { run, cancelled: false };
  waitQueue.push(entry);
  pumpQueue();
  return () => {
    entry.cancelled = true;
  };
}

interface SpotifyEmbedProps {
  spotifyId: string | null;
  spotifyUrl: string | null;
  type?: 'track' | 'album';
  title: string;
  verificationNote?: string | null;
  height?: number;
}

function SpotifyEmbedInner({
  spotifyId,
  spotifyUrl,
  type = 'track',
  title,
  verificationNote,
  height = 80,
}: SpotifyEmbedProps) {
  const { t, theme } = usePreferences();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const releaseSlotRef = useRef<(() => void) | null>(null);
  const [embedMode, setEmbedModeState] = useState<EmbedLoadMode>(getEmbedLoadMode);
  const [shouldMountIframe, setShouldMountIframe] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    const onModeChange = (e: Event) => {
      const custom = e as CustomEvent<EmbedLoadMode>;
      setEmbedModeState(custom.detail || getEmbedLoadMode());
    };
    window.addEventListener(EMBED_MODE_EVENT, onModeChange);
    return () => window.removeEventListener(EMBED_MODE_EVENT, onModeChange);
  }, []);

  useEffect(() => {
    setShouldMountIframe(false);
    setIframeLoaded(false);
    setQueued(false);
    releaseSlotRef.current?.();
    releaseSlotRef.current = null;
  }, [spotifyId]);

  useEffect(() => {
    if (!spotifyId || shouldMountIframe || embedMode === 'click') return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldMountIframe(true);
      return;
    }

    let dwellTimer: number | null = null;
    let cancelQueue: (() => void) | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (isVisible) {
          if (dwellTimer === null && !cancelQueue) {
            dwellTimer = window.setTimeout(() => {
              dwellTimer = null;
              setQueued(true);
              cancelQueue = enqueueEmbedLoad((releaseSlot) => {
                releaseSlotRef.current = releaseSlot;
                setShouldMountIframe(true);
                observer.disconnect();
              });
            }, 180);
          }
        } else {
          if (dwellTimer !== null) {
            window.clearTimeout(dwellTimer);
            dwellTimer = null;
          }
          if (cancelQueue) {
            cancelQueue();
            cancelQueue = null;
            setQueued(false);
          }
        }
      },
      { rootMargin: '180px 0px' }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (dwellTimer !== null) window.clearTimeout(dwellTimer);
      if (cancelQueue) cancelQueue();
    };
  }, [spotifyId, shouldMountIframe, embedMode]);

  useEffect(() => {
    return () => {
      releaseSlotRef.current?.();
      releaseSlotRef.current = null;
    };
  }, []);

  if (!spotifyId) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0b0c10]/80 border border-white/[0.07] px-3.5 py-2.5 min-h-[60px]">
        <div className="flex items-center gap-2.5 text-xs text-[#9ca3af]">
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <Music className="w-4 h-4 text-[#6b7280]" />
          </div>
          <div>
            <div className="text-[#d1d5db] font-medium">{t.playerUnavailable}</div>
            {verificationNote && (
              <div className="text-[11px] text-[#6b7280] line-clamp-1" title={verificationNote}>
                {verificationNote}
              </div>
            )}
          </div>
        </div>
        {spotifyUrl && (
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#5fb38e] hover:underline shrink-0"
          >
            <span>{t.linkText}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  }

  const embedSrc =
    theme === 'dark'
      ? `https://open.spotify.com/embed/${type}/${spotifyId}?utm_source=generator&theme=0`
      : `https://open.spotify.com/embed/${type}/${spotifyId}?utm_source=generator`;
  const externalLink = spotifyUrl || `https://open.spotify.com/${type}/${spotifyId}`;

  const handleInstantLoad = () => {
    if (!shouldMountIframe) {
      setShouldMountIframe(true);
    }
  };

  return (
    <div ref={containerRef} className="flex items-center gap-2 w-full">
      <div
        className="relative flex-1 min-w-0 rounded-xl overflow-hidden bg-[#0f1117] border border-white/[0.07]"
        style={{ height }}
      >
        {shouldMountIframe && (
          <iframe
            title={`Spotify: ${title}`}
            src={embedSrc}
            width="100%"
            height={height}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            style={{ colorScheme: theme }}
            onLoad={() => {
              setIframeLoaded(true);
              releaseSlotRef.current?.();
              releaseSlotRef.current = null;
            }}
            className={`block w-full transition-opacity duration-300 ${
              iframeLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {!iframeLoaded && (
          <button
            type="button"
            onClick={handleInstantLoad}
            className="absolute inset-0 w-full h-full flex items-center justify-between px-3.5 bg-[#0f1117] hover:bg-[#1a1d27] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/35 flex items-center justify-center shrink-0">
                {shouldMountIframe || queued ? (
                  <Loader2 className="w-4 h-4 text-[#1DB954] animate-spin" />
                ) : (
                  <Play className="w-4 h-4 text-[#1DB954] fill-current ml-0.5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#e5e0d5] truncate">{title}</div>
                <div className="text-[11px] text-[#6b7280] truncate">
                  {shouldMountIframe
                    ? t.preparingPlayer
                    : embedMode === 'click'
                    ? t.clickToOpenPlayer
                    : t.queuedOrClick}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono-num text-[#1DB954] px-2 py-0.5 rounded bg-[#1DB954]/10 shrink-0 ml-2">
              Spotify
            </span>
          </button>
        )}
      </div>

      <a
        href={externalLink}
        target="_blank"
        rel="noopener noreferrer"
        title={t.openInSpotify}
        className="h-10 px-2.5 rounded-lg bg-[#1a1d27] border border-white/10 text-xs font-medium text-[#1DB954] hover:bg-[#1DB954]/15 hover:border-[#1DB954]/40 inline-flex items-center gap-1.5 transition-colors shrink-0"
      >
        <span className="hidden sm:inline">Spotify</span>
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

export const SpotifyEmbed = memo(
  SpotifyEmbedInner,
  (prev, next) =>
    prev.spotifyId === next.spotifyId &&
    prev.spotifyUrl === next.spotifyUrl &&
    prev.type === next.type &&
    prev.height === next.height
);
