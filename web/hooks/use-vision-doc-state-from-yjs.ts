'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { extractVisionJsonPayload, loadVisionDoc, type VisionDoc } from '@/lib/visionjson';

export function useVisionDocStateFromYjs(yDoc: Y.Doc | null): {
  visionDoc: VisionDoc | null;
  setVisionDoc: (doc: VisionDoc) => void;
  rawMarkdownPreview: string;
  rawMarkdownChars: number;
} {
  const [visionDoc, setVisionDoc] = useState<VisionDoc | null>(null);
  const [rawMarkdownPreview, setRawMarkdownPreview] = useState('');
  const [rawMarkdownChars, setRawMarkdownChars] = useState(0);

  const parseWorkerRef = useRef<Worker | null>(null);
  const parseSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      try {
        parseWorkerRef.current?.terminate?.();
      } catch {
        // ignore
      }
      parseWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!yDoc) return;
    const yText = yDoc.getText('nexus');
    const RAW_PREVIEW_CHARS = 20_000;
    const SIG_CHARS = 512;
    const PARSE_DEBOUNCE_MS = 90;

    let disposed = false;
    let parseTimer: number | null = null;
    let idleId: number | null = null;
    let lastSig = '';

    // Best-effort: create a worker for parsing big visionjson payloads off-thread.
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && !parseWorkerRef.current) {
      try {
        parseWorkerRef.current = new Worker(new URL('../lib/visionjson.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        parseWorkerRef.current = null;
      }
    }

    const w = parseWorkerRef.current;
    const onWorkerMsg = (ev: MessageEvent<any>) => {
      const msg = ev?.data || null;
      const seq = Number(msg?.seq || 0);
      if (!Number.isFinite(seq) || seq !== parseSeqRef.current) return;
      const doc = msg?.doc || null;
      if (doc && typeof doc === 'object') {
        setVisionDoc(doc as VisionDoc);
      }
    };
    try {
      w?.addEventListener?.('message', onWorkerMsg as any);
    } catch {
      // ignore
    }

    const cancelPending = () => {
      if (parseTimer) window.clearTimeout(parseTimer);
      parseTimer = null;
      try {
        if (idleId && typeof (window as any).cancelIdleCallback === 'function') (window as any).cancelIdleCallback(idleId);
      } catch {
        // ignore
      }
      idleId = null;
    };

    const scheduleParse = (md: string) => {
      cancelPending();
      const mySeq = (parseSeqRef.current = parseSeqRef.current + 1);
      const run = () => {
        if (disposed) return;
        if (mySeq !== parseSeqRef.current) return;

        // Prefer worker for parsing, to keep the UI thread responsive.
        const payload = extractVisionJsonPayload(md);
        const worker = parseWorkerRef.current;
        if (worker && payload) {
          try {
            worker.postMessage({ seq: mySeq, payload });
            return;
          } catch {
            // fall through
          }
        }

        const loaded = loadVisionDoc(md);
        setVisionDoc(loaded.doc);
      };
      parseTimer = window.setTimeout(() => {
        if (disposed) return;
        try {
          if (typeof (window as any).requestIdleCallback === 'function') {
            idleId = (window as any).requestIdleCallback(run, { timeout: 450 });
            return;
          }
        } catch {
          // ignore
        }
        run();
      }, PARSE_DEBOUNCE_MS);
    };

    const update = () => {
      const md = yText.toString();
      const head = md.slice(0, SIG_CHARS);
      const tail = md.slice(-SIG_CHARS);
      const sig = `${md.length}:${head}\n---\n${tail}`;
      if (sig === lastSig) return;
      lastSig = sig;

      setRawMarkdownChars(md.length);
      setRawMarkdownPreview(md.slice(0, RAW_PREVIEW_CHARS));
      scheduleParse(md);
    };

    update();
    yText.observe(update);
    return () => {
      disposed = true;
      cancelPending();
      yText.unobserve(update);
      try {
        w?.removeEventListener?.('message', onWorkerMsg as any);
      } catch {
        // ignore
      }
    };
  }, [yDoc]);

  return { visionDoc, setVisionDoc, rawMarkdownPreview, rawMarkdownChars };
}

