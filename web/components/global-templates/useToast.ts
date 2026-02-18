'use client';

import { useEffect, useState } from 'react';

export function useToast(opts?: { durationMs?: number }) {
  const [toast, setToast] = useState<string | null>(null);
  const durationMs = Math.max(300, Number(opts?.durationMs ?? 1600));

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), durationMs);
    return () => window.clearTimeout(t);
  }, [durationMs, toast]);

  return { toast, setToast };
}

