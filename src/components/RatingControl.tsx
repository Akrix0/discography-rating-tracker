import { useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle, X, MessageSquare } from 'lucide-react';
import { useAutoSave, type SaveStatus } from '../hooks/useAutoSave';
import { usePreferences } from '../context/PreferencesContext';

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
  const [note, setNote] = useState<string>(initialNote);

  useEffect(() => {
    setRating(initialRating);
    setInputValue(initialRating !== null ? String(initialRating) : '');
  }, [initialRating]);

  useEffect(() => {
    setNote(initialNote);
  }, [initialNote]);

  const ratingSaver = useAutoSave<number | null>(async (val) => {
    await onSaveRating(val);
    onUpdated?.({ rating: val });
  }, 320);

  const noteSaver = useAutoSave<string>(async (val) => {
    await onSaveNote(val);
    onUpdated?.({ note: val });
  }, 450);

  const combinedStatus = combineStatus(ratingSaver.status, noteSaver.status);

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
    noteSaver.scheduleSave(val);
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
                if (noteSaver.status === 'error') noteSaver.retry();
              }}
              className="inline-flex items-center gap-1 text-[#d95d4e] hover:underline"
              title={ratingSaver.errorMessage || noteSaver.errorMessage || t.errorText}
            >
              <AlertCircle className="w-3 h-3" />
              <span>{t.errorText}</span>
            </button>
          )}
          {combinedStatus === 'idle' && (
            <span className="text-[#6b7280]">
              {rating === null ? t.unratedText : t.autoSaveText}
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
            <button
              type="button"
              onClick={handleClearRating}
              title={t.clearRatingTitle}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[#6b7280] hover:text-[#f3efe6] hover:bg-white/10 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex items-start gap-2 min-w-0">
        <MessageSquare className="w-3.5 h-3.5 text-[#6b7280] mt-2 shrink-0" />
        <textarea
          rows={compact ? 1 : 2}
          value={note}
          placeholder={notePlaceholder || t.songNotePlaceholder}
          onChange={(e) => handleNoteChange(e.target.value)}
          onBlur={() => noteSaver.flushSave()}
          className="w-full min-w-0 resize-y min-h-[34px] rounded-lg bg-[#0b0c10]/70 border border-white/[0.08] px-3 py-1.5 text-xs sm:text-sm text-[#e5e0d5] placeholder:text-[#6b7280] focus:outline-none focus:border-[#e09f5a]/50 transition-colors"
        />
      </div>
    </div>
  );
}
