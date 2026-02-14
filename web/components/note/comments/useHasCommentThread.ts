'use client';

import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { getThread, observeComments } from '@/lib/node-comments';

export function useHasCommentThread(doc: Y.Doc | null, targetKey: string): boolean {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!doc) return;
    return observeComments(doc, () => setTick((t) => t + 1));
  }, [doc]);

  return useMemo(() => {
    void tick;
    if (!doc) return false;
    const key = String(targetKey || '').trim();
    if (!key) return false;
    return !!getThread(doc, key);
  }, [doc, targetKey, tick]);
}

