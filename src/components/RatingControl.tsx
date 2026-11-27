import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Loader2, AlertCircle, X, MessageSquare, Save } from 'lucide-react';
import { useAutoSave, type SaveStatus } from '../hooks/useAutoSave';
import { usePreferences } from '../context/PreferencesContext';
import { Tooltip } from './Tooltip';

interface RatingControlProps {
  rating: number | null;
  note: string;
  onSaveRating: (rating: number | null) => Promise<unknown>;
  onSaveNote: (note: string) => Promise<unknown>;
  onUpdated?: (next: { rating?: number | null; note?: string }) => void;
  compact?: boolean;
  notePlaceholder?: string;
}

function combineStatus(a: SaveStatus, b: SaveStatus): SaveStatus {
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'saving' || b === 'saving') return 'saving';
  if (a === 'saved' || b === 'saved') return 'saved';
  return 'idle';
}

function ratingColor(val: number | null): string {
  if (val === null) return '#4b5563';
  if (val >= 85) return '#5fb38e';
  if (val >= 65) return '#e09f5a';
  if (val >= 40) return '#d97757';
  return '#d95d4e';
}

export function RatingControl({
  rating: initialRating,
  note: initialNote,
  onSaveRating,
  onSaveNote,
  onUpdated,
  compact = false,
  notePlaceholder,
}: RatingControlProps) {
  const { t, theme } = usePreferences();
  const [rating, setRating] = useState<number | null>(initialRating);
  const [inputValue, setInputValue] = useState<string>(
    initialRating !== null ? String(initialRating) : ''
  );

  // Smart note state (never overwritten mid-typing)
  const [note, setNote] = useState<string>(initialNote);
  const [noteStatus, setNoteStatus] = useState<SaveStatus>('idle');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSavedNoteRef = useRef<string>(initialNote);
  const latestNoteRef = useRef<string>(initialNote);
  const isFocusedRef = useRef<boolean>(false);
  const hasTypedSinceFocusRef = useRef<boolean>(false);
  const lastKeystrokeAtRef = useRef<number>(0);
  const mouseAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const savingNoteInFlightRef = useRef<boolean>(false);
  const noteFadeTimerRef = useRef<number | null>(null);
  const onSaveNoteRef = useRef(onSaveNote);
  onSaveNoteRef.current = onSaveNote;
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    setRating(initialRating);
    setInputValue(initialRating !== null ? String(initialRating) : '');
  }, [initialRating]);

  useEffect(() => {
    if (!isFocusedRef.current && latestNoteRef.current === lastSavedNoteRef.current) {
      setNote(initialNote);
      lastSavedNoteRef.current = initialNote;
      latestNoteRef.current = initialNote;
    }
  }, [initialNote]);

  useEffect(() => {
    return () => {
      if (noteFadeTimerRef.current !== null) {
        window.clearTimeout(noteFadeTimerRef.current);
      }
    };
  }, []);

  // Auto-resize textarea cleanly to full content height and keep it permanently
  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const minH = compact ? 48 : 74;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minH, el.scrollHeight + 2)}px`;
  }, [compact]);

  useLayoutEffect(() => {
    syncTextareaHeight();
  }, [note, syncTextareaHeight]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      syncTextareaHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncTextareaHeight]);

  const ratingSaver = useAutoSave<number | null>(async (val) => {
    await onSaveRating(val);
    onUpdatedRef.current?.({ rating: val });
  }, 320);

  const commitNoteSave = useCallback(async () => {
    const valToSave = latestNoteRef.current;
    if (savingNoteInFlightRef.current) return;
    if (valToSave === lastSavedNoteRef.current) {
      hasTypedSinceFocusRef.current = false;
      return;
    }

    savingNoteInFlightRef.current = true;
    hasTypedSinceFocusRef.current = false;
    mouseAnchorRef.current = null;
    setNoteStatus('saving');
    setNoteError(null);

    try {
      await onSaveNoteRef.current(valToSave);
      lastSavedNoteRef.current = valToSave;
      onUpdatedRef.current?.({ note: valToSave });
      setNoteStatus('saved');
      if (noteFadeTimerRef.current !== null) window.clearTimeout(noteFadeTimerRef.current);
      noteFadeTimerRef.current = window.setTimeout(() => {
        setNoteStatus((prev) => (prev === 'saved' ? 'idle' : prev));
      }, 2400);
    } catch (err) {
      setNoteStatus('error');
      setNoteError(err instanceof Error ? err.message : t.errorText);
    } finally {
      savingNoteInFlightRef.current = false;
    }
  }, [t.errorText]);

  // Save on pointer movement after user stops typing on laptop/desktop
  useEffect(() => {
    if (!isNoteFocused) {
      mouseAnchorRef.current = null;
      return;
    }

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!hasTypedSinceFocusRef.current) return;
      if (latestNoteRef.current === lastSavedNoteRef.current) return;
      if (Date.now() - lastKeystrokeAtRef.current < 350) {
        mouseAnchorRef.current = null;
        return;
      }
      if (!mouseAnchorRef.current) {
        mouseAnchorRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const dist = Math.hypot(
        e.clientX - mouseAnchorRef.current.x,
        e.clientY - mouseAnchorRef.current.y
      );
      if (dist >= 8) {
        mouseAnchorRef.current = null;
        void commitNoteSave();
      }
    };

    window.addEventListener('mousemove', onWindowMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
    };
  }, [isNoteFocused, commitNoteSave]);

  const combinedStatus = combineStatus(ratingSaver.status, noteStatus);
  const isNoteDirty = note !== lastSavedNoteRef.current;

  const handleSliderChange = (rawVal: string) => {
    const num = Math.max(0, Math.min(100, Math.round(Number(rawVal))));
    setRating(num);
    setInputValue(String(num));
    ratingSaver.scheduleSave(num);
  };

  const handleNumberChange = (rawVal: string) => {
    setInputValue(rawVal);
    const trimmed = rawVal.trim();
    if (trimmed === '') {
      setRating(null);
      ratingSaver.scheduleSave(null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
    setRating(clamped);
    if (String(clamped) !== trimmed) {
      setInputValue(String(clamped));
    }
    ratingSaver.scheduleSave(clamped);
  };

  const handleClearRating = () => {
    setRating(null);
    setInputValue('');
    ratingSaver.flushSave(null);
  };

  const handleNoteChange = (val: string) => {
    setNote(val);
    latestNoteRef.current = val;
    hasTypedSinceFocusRef.current = true;
    lastKeystrokeAtRef.current = Date.now();
    mouseAnchorRef.current = null;
    if (noteStatus === 'saved' || noteStatus === 'error') {
      setNoteStatus('idle');
    }
  };

  const fillPercent = rating !== null ? rating : 0;
  const activeColor = ratingColor(rating);
  const neutralTrack = theme === 'light' ? 'rgba(24,24,27,0.14)' : 'rgba(255,255,255,0.12)';

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      <div className="flex items-center justify-between gap-2 text-[11px] leading-none min-w-0">
        <span className="text-[#9ca3af] font-medium truncate">{t.ratingLabel}</span>
        <div className="flex items-center justify-end shrink-0">
          {combinedStatus === 'saving' && (
            <span className="inline-flex items-center gap-1 text-[#e09f5a]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{t.savingText}</span>
            </span>
          )}
          {combinedStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-[#5fb38e]">
              <Check className="w-3 h-3" />
              <span>{t.savedText}</span>
            </span>
          )}
          {combinedStatus === 'error' && (
            <button
              type="button"
              onClick={() => {
                if (ratingSaver.status === 'error') ratingSaver.retry();
                if (noteStatus === 'error') void commitNoteSave();
              }}
              className="inline-flex items-center gap-1 text-[#d95d4e] hover:underline"
              title={ratingSaver.errorMessage || noteError || t.errorText}
            >
              <AlertCircle className="w-3 h-3" />
              <span>{t.errorText}</span>
            </button>
          )}
          {combinedStatus === 'idle' && (
            <span className={isNoteDirty ? 'text-[#e09f5a]' : 'text-[#6b7280]'}>
              {isNoteDirty
                ? t.unsavedNoteText
                : rating === null
                ? t.unratedText
                : t.autoSaveText}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5 w-full min-w-0">
        <div className="flex-1 min-w-[80px] flex items-center">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            aria-label="Rating 0-100"
            value={rating !== null ? rating : 50}
            onChange={(e) => handleSliderChange(e.target.value)}
            onMouseUp={() => ratingSaver.flushSave()}
            onTouchEnd={() => ratingSaver.flushSave()}
            className="rating-slider w-full"
            style={{
              background:
                rating !== null
                  ? `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${fillPercent}%, ${neutralTrack} ${fillPercent}%, ${neutralTrack} 100%)`
                  : neutralTrack,
            }}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="relative flex items-center">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              aria-label="Numeric rating"
              placeholder="—"
              value={inputValue}
              onChange={(e) => handleNumberChange(e.target.value)}
              onBlur={() => ratingSaver.flushSave()}
              className="no-spinner font-mono-num w-12 sm:w-16 h-8 sm:h-9 px-1.5 sm:px-2 text-center text-xs sm:text-sm font-semibold rounded-lg bg-[#0b0c10] border border-white/15 text-[#f3efe6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a] transition-colors"
              style={
                rating !== null
                  ? { borderColor: `${activeColor}66`, color: activeColor }
                  : undefined
              }
            />
            <span className="ml-1 text-[11px] font-mono-num text-[#6b7280]">/100</span>
          </div>

          {rating !== null && (
            <Tooltip content={t.clearRatingTitle} align="end">
              <button
                type="button"
                onClick={handleClearRating}
                aria-label={t.clearRatingTitle}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[#6b7280] hover:text-[#f3efe6] hover:bg-white/10 transition-all active:scale-[0.96] shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="space-y-1.5 min-w-0">
        <div className="relative flex items-start gap-2 min-w-0">
          <MessageSquare className="w-3.5 h-3.5 text-[#6b7280] mt-2.5 shrink-0" />
          <textarea
            ref={textareaRef}
            rows={1}
            value={note}
            placeholder={notePlaceholder || t.songNotePlaceholder}
            onFocus={() => {
              isFocusedRef.current = true;
              setIsNoteFocused(true);
              mouseAnchorRef.current = null;
            }}
            onChange={(e) => handleNoteChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void commitNoteSave();
              }
            }}
            onBlur={() => {
              isFocusedRef.current = false;
              setIsNoteFocused(false);
              mouseAnchorRef.current = null;
              void commitNoteSave();
            }}
            className="w-full min-w-0 resize-y overflow-hidden rounded-lg bg-[#0b0c10]/70 border border-white/[0.08] px-3 py-2 text-xs sm:text-sm leading-relaxed text-[#e5e0d5] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]/50 transition-colors"
          />
        </div>

        {(isNoteDirty || isNoteFocused || noteStatus === 'saving' || noteStatus === 'error') && (
          <div className="flex items-center justify-end pl-5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void commitNoteSave()}
              disabled={!isNoteDirty || noteStatus === 'saving'}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                isNoteDirty
                  ? 'bg-[#e09f5a]/20 hover:bg-[#e09f5a]/30 text-[#e09f5a] border-[#e09f5a]/45'
                  : 'bg-white/[0.03] text-[#6b7280] border-white/[0.08] opacity-60 cursor-default'
              }`}
            >
              {noteStatus === 'saving' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              <span>{t.saveNoteBtn}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
