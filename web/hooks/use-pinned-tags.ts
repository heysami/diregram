import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { loadPinnedTags, type PinnedTagsData } from '@/lib/pinned-tags';

export function usePinnedTags(doc: Y.Doc | null | undefined): PinnedTagsData {
  const [data, setData] = useState<PinnedTagsData>(() => (doc ? loadPinnedTags(doc) : { tagIds: [] }));

  useEffect(() => {
    if (!doc) {
      setData({ tagIds: [] });
      return;
    }
    const yText = doc.getText('nexus');
    const update = () => setData(loadPinnedTags(doc));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  return data;
}

