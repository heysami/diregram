import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { getAllThreads, observeComments } from '@/lib/node-comments';

/**
 * Returns the set of comment target keys for a specific grid sheet.
 * This keeps UI logic modular: views can just check `set.has(targetKey)`.
 */
export function useGridCommentTargetKeysForSheet(yDoc: Y.Doc | null | undefined, sheetId: string | null | undefined): Set<string> {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!yDoc) return;
    return observeComments(yDoc, () => setTick((t) => t + 1));
  }, [yDoc]);

  return useMemo(() => {
    void tick;
    const out = new Set<string>();
    if (!yDoc) return out;
    const sid = String(sheetId || '').trim();
    if (!sid) return out;
    const prefix = `g:sheet:${sid}:`;
    const all = getAllThreads(yDoc);
    Object.keys(all).forEach((k) => {
      if (k.startsWith(prefix)) out.add(k);
    });
    return out;
  }, [yDoc, sheetId, tick]);
}

