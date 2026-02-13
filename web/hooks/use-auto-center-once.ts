import { useEffect, useRef } from 'react';

/**
 * Auto-center ONCE per key change.
 *
 * DO NOT REGRESS.
 *
 * Problem:
 * - It's easy to write effects that "helpfully" re-center on every render/layout tick.
 * - This fights user panning and feels like the canvas is stuck snapping back.
 *
 * Solution:
 * - Run the provided `center()` exactly once per distinct key value,
 *   unless blocked (e.g. while dragging).
 */
export function useAutoCenterOnce(opts: {
  key: string | null;
  blocked: boolean;
  center: () => void;
}) {
  const { key, blocked, center } = opts;
  const lastCenteredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!key) {
      lastCenteredKeyRef.current = null;
      return;
    }
    if (blocked) return;
    if (lastCenteredKeyRef.current === key) return;

    center();
    lastCenteredKeyRef.current = key;
  }, [key, blocked, center]);
}

