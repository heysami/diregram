import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { getOrCreateClientIdentity } from '@/lib/client-identity';
import type { PresenceController, PresencePeer, PresenceState, PresenceView } from '@/lib/presence';

export function useYjs(roomName: string) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [connectedRoomName, setConnectedRoomName] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const identity = useMemo(() => getOrCreateClientIdentity(), []);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<PresenceState['cursor']>(null);

  useEffect(() => {
    // IMPORTANT: when switching rooms, immediately clear prior doc/provider.
    // Otherwise callers can momentarily see the *previous* Y.Doc while the UI has
    // already switched to a new file id, causing seeding/persistence to write into
    // the wrong doc and making the new note appear empty.
    setDoc(null);
    setProvider(null);
    setConnectedRoomName(null);
    setSynced(false);
    setPeers([]);
    setCanUndo(false);
    setCanRedo(false);
    setStatus('connecting');

    const yDoc = new Y.Doc();
    const wsUrl = process.env.NEXT_PUBLIC_COLLAB_SERVER_URL || 'ws://localhost:1234';

    // Ensure shared types exist early, so undo/presence scopes are stable.
    const yText = yDoc.getText('nexus');
    void yText;
    const commentsMap = yDoc.getMap('node-comments-v1');
    void commentsMap;
    const noteFragment = yDoc.getXmlFragment('note');
    void noteFragment;
    
    const hpProvider = new HocuspocusProvider({
      url: wsUrl,
      name: roomName,
      document: yDoc,
      onStatus: (data) => {
        setStatus(data.status);
      },
    });

    // Track initial sync. Different provider versions use slightly different events;
    // we listen to both.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = hpProvider as any;
    const onSynced = () => setSynced(true);
    try {
      p.on?.('synced', onSynced);
      p.on?.('sync', onSynced);
      if (p.synced === true) setSynced(true);
    } catch {
      // ignore
    }

    // Per-user undo/redo:
    // - Each client gets its own UndoManager.
    // - We track only local-origin transactions (origin === null by default).
    const um = new Y.UndoManager([yDoc.getText('nexus'), yDoc.getMap('node-comments-v1'), yDoc.getXmlFragment('note')], {
      trackedOrigins: new Set([null]),
      captureTimeout: 450,
    });
    undoManagerRef.current = um;
    const syncUndoState = () => {
      setCanUndo(um.canUndo());
      setCanRedo(um.canRedo());
    };
    syncUndoState();
    um.on('stack-item-added', syncUndoState);
    um.on('stack-item-popped', syncUndoState);
    um.on('stack-item-updated', syncUndoState);
    um.on('stack-cleared', syncUndoState);

    // Multiplayer presence (awareness)
    const awareness = hpProvider.awareness;
    if (!awareness) {
      // Awareness can be null depending on provider state/config; allow collaboration to work without presence.
      setDoc(yDoc);
      setProvider(hpProvider);
      return () => {
        try {
          if (cursorRafRef.current !== null) {
            window.cancelAnimationFrame(cursorRafRef.current);
            cursorRafRef.current = null;
          }
        } catch {
          // ignore
        }
        try {
          um.destroy();
        } catch {
          // ignore
        }
        hpProvider.destroy();
        yDoc.destroy();
      };
    }
    const setLocal = (patch: Partial<PresenceState>) => {
      const prev = awareness.getLocalState() as PresenceState | null;
      const next: PresenceState = {
        user: { id: identity.id, name: identity.name, badgeClass: identity.badgeClass },
        view: (prev?.view || 'main') as PresenceView,
        cursor: prev?.cursor ?? null,
        ts: Date.now(),
        ...(prev || {}),
        ...(patch || {}),
      };
      awareness.setLocalState(next);
    };

    setLocal({ view: 'main', cursor: null });

    const updatePeers = () => {
      const states = Array.from(awareness.getStates().entries());
      const out: PresencePeer[] = states
        .map(([clientId, st]) => ({ clientId, state: st as PresenceState }))
        .filter((p) => p.state?.user?.id && p.state.user.id !== identity.id);
      // Stable ordering + idempotent state updates:
      // Awareness "change" fires even for local cursor moves; we must avoid calling setPeers
      // when the derived peer list is identical, or the entire app will re-render on mousemove
      // (which can restart layout animations in the canvas).
      out.sort((a, b) => a.clientId - b.clientId);
      setPeers((prev) => {
        if (prev.length !== out.length) return out;
        for (let i = 0; i < prev.length; i++) {
          const a = prev[i];
          const b = out[i];
          if (a.clientId !== b.clientId) return out;
          const au = a.state.user;
          const bu = b.state.user;
          if (au.id !== bu.id || au.name !== bu.name || au.badgeClass !== bu.badgeClass) return out;
          if (a.state.view !== b.state.view) return out;
          const ac = a.state.cursor ?? null;
          const bc = b.state.cursor ?? null;
          if (ac === null && bc === null) continue;
          if (ac === null || bc === null) return out;
          if (ac.x !== bc.x || ac.y !== bc.y) return out;
        }
        return prev;
      });
    };

    awareness.on('change', updatePeers);
    updatePeers();

    setDoc(yDoc);
    setProvider(hpProvider);
    setConnectedRoomName(roomName);

    return () => {
      try {
        awareness.off('change', updatePeers);
      } catch {
        // ignore
      }
      try {
        if (cursorRafRef.current !== null) {
          window.cancelAnimationFrame(cursorRafRef.current);
          cursorRafRef.current = null;
        }
      } catch {
        // ignore
      }
      try {
        um.destroy();
      } catch {
        // ignore
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pp: any = hpProvider as any;
        pp.off?.('synced', onSynced);
        pp.off?.('sync', onSynced);
      } catch {
        // ignore
      }
      hpProvider.destroy();
      yDoc.destroy();
    };
  }, [roomName, identity.id, identity.name, identity.badgeClass]);

  const presence: PresenceController | null = useMemo(() => {
    if (!provider) return null;
    const awareness = provider.awareness;
    if (!awareness) return null;
    return {
      self: identity,
      peers,
      setView: (view) => {
        const prev = awareness.getLocalState() as PresenceState | null;
        // Idempotent: avoid triggering awareness updates if nothing changed.
        if (prev?.view === view) return;
        awareness.setLocalState({
          user: { id: identity.id, name: identity.name, badgeClass: identity.badgeClass },
          view,
          cursor: prev?.cursor ?? null,
          ts: Date.now(),
        } satisfies PresenceState);
      },
      setCursor: (cursor) => {
        pendingCursorRef.current = cursor;
        if (cursorRafRef.current !== null) return;
        cursorRafRef.current = window.requestAnimationFrame(() => {
          cursorRafRef.current = null;
          const prev = awareness.getLocalState() as PresenceState | null;
          // Idempotent: avoid emitting awareness updates when cursor hasn't changed.
          const prevCursor = prev?.cursor ?? null;
          const nextCursor = pendingCursorRef.current ?? null;
          if (
            (prevCursor === null && nextCursor === null) ||
            (prevCursor && nextCursor && prevCursor.x === nextCursor.x && prevCursor.y === nextCursor.y)
          ) {
            return;
          }
          awareness.setLocalState({
            user: { id: identity.id, name: identity.name, badgeClass: identity.badgeClass },
            view: (prev?.view || 'main') as PresenceView,
            cursor: nextCursor,
            ts: Date.now(),
          } satisfies PresenceState);
        });
      },
    };
  }, [provider, peers, identity]);

  return {
    doc,
    provider,
    connectedRoomName,
    synced,
    status,
    presence,
    undo: () => undoManagerRef.current?.undo(),
    redo: () => undoManagerRef.current?.redo(),
    canUndo,
    canRedo,
  };
}
