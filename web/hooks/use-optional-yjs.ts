'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

/**
 * Like `useYjs`, but safe to use when the room name is optional.
 * - When `roomName` is falsy, it returns `{ doc: null, provider: null }` and does not connect.
 * - When `roomName` is set, it opens a Yjs doc + Hocuspocus provider and cleans up on change/unmount.
 */
export function useOptionalYjs(roomName: string | null) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Memoize a normalized room name to avoid reconnect loops on whitespace changes.
  const normalizedRoomName = useMemo(() => {
    const v = String(roomName || '').trim();
    return v.length ? v : null;
  }, [roomName]);

  // Keep a stable ref so we don't call setState after cleanup.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!normalizedRoomName) {
      // Reset to empty state; caller can still render UI.
      setStatus('disconnected');
      setProvider(null);
      setDoc(null);
      return;
    }

    const yDoc = new Y.Doc();
    const wsUrl = process.env.NEXT_PUBLIC_COLLAB_SERVER_URL || 'ws://localhost:1234';

    // Ensure the main text type exists for stable sync semantics.
    const yText = yDoc.getText('nexus');
    void yText;

    const hpProvider = new HocuspocusProvider({
      url: wsUrl,
      name: normalizedRoomName,
      document: yDoc,
      onStatus: (data) => {
        if (!aliveRef.current) return;
        setStatus(data.status);
      },
    });

    setDoc(yDoc);
    setProvider(hpProvider);

    return () => {
      try {
        hpProvider.destroy();
      } catch {
        // ignore
      }
      try {
        yDoc.destroy();
      } catch {
        // ignore
      }
    };
  }, [normalizedRoomName]);

  return { doc, provider, status };
}

