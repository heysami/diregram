'use client';

import { useMemo } from 'react';
import type { VisionDoc } from '@/lib/visionjson';

export function useCardCount(doc: VisionDoc): number {
  return useMemo(() => {
    try {
      const snap: any = (doc as any)?.tldraw || null;
      const store = snap?.document?.store;
      if (!store || typeof store !== 'object') return 0;
      let n = 0;
      for (const rec of Object.values<any>(store)) {
        if (!rec) continue;
        if (rec.typeName === 'shape' && String(rec.type || '') === 'nxcard') n++;
      }
      return n;
    } catch {
      return 0;
    }
  }, [doc]);
}

