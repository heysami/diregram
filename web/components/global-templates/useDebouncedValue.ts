'use client';

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), Math.max(0, delayMs | 0));
    return () => window.clearTimeout(t);
  }, [delayMs, value]);
  return debounced;
}

