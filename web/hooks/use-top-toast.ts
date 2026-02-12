import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tiny reusable "top toast" state for transient feedback.
 * Kept intentionally lightweight (no global provider) to avoid coupling.
 */
export function useTopToast(opts?: { durationMs?: number }) {
  const durationMs = opts?.durationMs ?? 2500;
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const show = useCallback(
    (next: string) => {
      setMessage(next);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { message, show };
}

