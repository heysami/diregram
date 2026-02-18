'use client';

import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';

type PersistOptions = {
  doc: Y.Doc | null;
  provider: unknown | null;
  /** The room the UI wants to be on. */
  activeRoomName: string;
  /** The room that `useYjs()` has actually connected the current doc/provider to. */
  connectedRoomName: string | null;
  /** Provider initial sync completed. */
  synced: boolean;

  fileId: string | null;
  initialContent?: string;
  makeStarterMarkdown: () => string;

  loadSnapshot: (fileId: string) => string | null;
  saveSnapshot: (fileId: string, markdown: string) => void;

  /** Optional: persist to Supabase (or elsewhere). Best-effort; must not throw. */
  persistRemote?: (markdown: string) => void;

  debounceMs?: number;
  /**
   * Prevents the common “switch room → transient empty → overwrite real content with empty”
   * failure mode.
   */
  preventOverwriteNonEmptySnapshotWithEmpty?: boolean;
};

export function useYjsNexusTextPersistence(opts: PersistOptions) {
  const {
    doc,
    provider,
    activeRoomName,
    connectedRoomName,
    synced,
    fileId,
    initialContent,
    makeStarterMarkdown,
    loadSnapshot,
    saveSnapshot,
    persistRemote,
    debounceMs = 250,
    preventOverwriteNonEmptySnapshotWithEmpty = true,
  } = opts;

  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!doc || !provider || !fileId) return;
    // CRITICAL: never seed/save into the wrong doc during room switches.
    if (connectedRoomName !== activeRoomName) return;

    const yText = doc.getText('nexus');

    const seedIfEmpty = () => {
      const current = yText.toString();
      if (current.trim().length > 0) return;
      const snap = initialContent || loadSnapshot(fileId) || makeStarterMarkdown();
      if (!snap || snap.trim().length === 0) return;
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, snap);
      });
    };

    // Seed strategy:
    // - Prefer seeding AFTER initial sync, because remote empty state can overwrite early seeds.
    // - Still seed in offline/disconnected scenarios after a short delay.
    let seeded = false;
    const seedOnce = () => {
      if (seeded) return;
      seedIfEmpty();
      if (yText.toString().trim().length > 0) seeded = true;
    };
    if (synced) seedOnce();
    const seedFallbackTimer = window.setTimeout(() => seedOnce(), 250);

    const saveNow = () => {
      const next = yText.toString();

      if (preventOverwriteNonEmptySnapshotWithEmpty && !next.trim()) {
        const prevSnap = loadSnapshot(fileId) || '';
        if (prevSnap.trim()) return;
      }

      saveSnapshot(fileId, next);
      try {
        persistRemote?.(next);
      } catch {
        // ignore
      }
    };

    const scheduleSave = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        saveNow();
      }, debounceMs);
    };

    // Save initial content too (covers new docs)
    scheduleSave();
    yText.observe(scheduleSave);

    return () => {
      try {
        saveNow();
      } catch {
        // ignore
      }
      try {
        yText.unobserve(scheduleSave);
      } catch {
        // ignore
      }
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      try {
        window.clearTimeout(seedFallbackTimer);
      } catch {
        // ignore
      }
    };
  }, [
    doc,
    provider,
    fileId,
    initialContent,
    activeRoomName,
    connectedRoomName,
    synced,
    makeStarterMarkdown,
    loadSnapshot,
    saveSnapshot,
    persistRemote,
    debounceMs,
    preventOverwriteNonEmptySnapshotWithEmpty,
  ]);
}

