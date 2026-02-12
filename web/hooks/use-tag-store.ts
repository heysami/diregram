import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { loadTagStore, type NexusTagStore } from '@/lib/tag-store';

export function useTagStore(doc: Y.Doc): NexusTagStore {
  const [store, setStore] = useState<NexusTagStore>(() => loadTagStore(doc));

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setStore(loadTagStore(doc));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  return store;
}

