'use client';

import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { getAllThreads, observeComments, type CommentThread } from '@/lib/node-comments';

export function useYDocThreads(doc: Y.Doc): Record<string, CommentThread> {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return observeComments(doc, () => setTick((t) => t + 1));
  }, [doc]);

  return useMemo(() => {
    void tick;
    return getAllThreads(doc);
  }, [doc, tick]);
}

