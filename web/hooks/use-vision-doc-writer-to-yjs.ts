'use client';

import { useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { saveVisionDoc, type VisionDoc } from '@/lib/visionjson';

export function useVisionDocWriterToYjs(yDoc: Y.Doc | null): {
  scheduleWriteVisionDoc: (doc: VisionDoc) => void;
  flushWriteVisionDoc: () => void;
} {
  const writeTimerRef = useRef<number | null>(null);
  const writeIdleRef = useRef<number | null>(null);
  const lastDocRef = useRef<VisionDoc | null>(null);

  const writeVisionToDoc = useCallback(
    (nextDoc: VisionDoc) => {
      if (!yDoc) return;
      const yText = yDoc.getText('nexus');
      const current = yText.toString();
      const next = saveVisionDoc(current, nextDoc);
      if (next === current) return;
      yDoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, next);
      });
    },
    [yDoc],
  );

  const scheduleWriteVisionDoc = useCallback(
    (next: VisionDoc) => {
      lastDocRef.current = next;
      if (writeTimerRef.current) window.clearTimeout(writeTimerRef.current);
      try {
        if (writeIdleRef.current && typeof (window as any).cancelIdleCallback === 'function') (window as any).cancelIdleCallback(writeIdleRef.current);
      } catch {
        // ignore
      }
      writeIdleRef.current = null;
      writeTimerRef.current = window.setTimeout(() => {
        writeTimerRef.current = null;
        const run = () => writeVisionToDoc(next);
        try {
          if (typeof (window as any).requestIdleCallback === 'function') {
            writeIdleRef.current = (window as any).requestIdleCallback(run, { timeout: 1200 });
            return;
          }
        } catch {
          // ignore
        }
        run();
      }, 900);
    },
    [writeVisionToDoc],
  );

  const flushWriteVisionDoc = useCallback(() => {
    const d = lastDocRef.current;
    if (!d) return;
    try {
      writeVisionToDoc(d);
    } catch {
      // ignore
    }
  }, [writeVisionToDoc]);

  useEffect(() => {
    return () => {
      try {
        const d = lastDocRef.current;
        if (d) writeVisionToDoc(d);
      } catch {
        // ignore
      }
      if (writeTimerRef.current) window.clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
      try {
        if (writeIdleRef.current && typeof (window as any).cancelIdleCallback === 'function') (window as any).cancelIdleCallback(writeIdleRef.current);
      } catch {
        // ignore
      }
      writeIdleRef.current = null;
    };
  }, [writeVisionToDoc]);

  return { scheduleWriteVisionDoc, flushWriteVisionDoc };
}

