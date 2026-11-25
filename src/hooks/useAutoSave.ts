import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave<T>(
  saveFn: (value: T) => Promise<unknown>,
  debounceMs = 350
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const latestValueRef = useRef<{ value: T; hasPending: boolean }>({
    value: undefined as T,
    hasPending: false,
  });
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const clearTimers = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  };

  const executeSave = useCallback(async (val: T) => {
    latestValueRef.current.hasPending = false;
    setStatus('saving');
    setErrorMessage(null);
    try {
      await saveFnRef.current(val);
      setStatus('saved');
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        setStatus((prev) => (prev === 'saved' ? 'idle' : prev));
      }, 2400);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Помилка збереження');
    }
  }, []);

  const scheduleSave = useCallback(
    (val: T) => {
      latestValueRef.current = { value: val, hasPending: true };
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setStatus('saving');
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void executeSave(val);
      }, debounceMs);
    },
    [debounceMs, executeSave]
  );

  const flushSave = useCallback(
    (explicitValue?: T) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (explicitValue !== undefined) {
        void executeSave(explicitValue);
      } else if (latestValueRef.current.hasPending) {
        void executeSave(latestValueRef.current.value);
      }
    },
    [executeSave]
  );

  const retry = useCallback(() => {
    void executeSave(latestValueRef.current.value);
  }, [executeSave]);

  useEffect(() => clearTimers, []);

  return { status, errorMessage, scheduleSave, flushSave, retry };
}
