import { useEffect, useRef, useState, type ReactNode } from 'react';

interface TooltipProps {
  content?: string | null;
  position?: 'top' | 'bottom';
  align?: 'center' | 'start' | 'end';
  delayMs?: number;
  className?: string;
  children: ReactNode;
}

export function Tooltip({
  content,
  position = 'top',
  align = 'center',
  delayMs = 180,
  className = '',
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!content) {
    return <>{children}</>;
  }

  const show = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(true), delayMs);
  };

  const hide = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  };

  const posClass =
    position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2';
  const alignClass =
    align === 'start'
      ? 'left-0'
      : align === 'end'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute ${posClass} ${alignClass} z-[70] w-max max-w-[260px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium leading-snug whitespace-normal text-center shadow-xl border border-white/15 bg-[#1a1d27] text-[#f3efe6] transition-opacity duration-150`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
