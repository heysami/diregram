import { defaultVisionDoc, parseVisionJsonPayload } from './visionjson';

type InMsg = { seq: number; payload: string | null };
type OutMsg = { seq: number; doc: ReturnType<typeof defaultVisionDoc>; ok: boolean };

// Web Worker entry. Parses/validates visionjson off the main thread.
self.onmessage = (ev: MessageEvent<InMsg>) => {
  const { seq, payload } = ev.data || ({} as InMsg);
  try {
    if (!payload) {
      (self as any).postMessage({ seq, doc: defaultVisionDoc(), ok: true } satisfies OutMsg);
      return;
    }
    const doc = parseVisionJsonPayload(payload) || defaultVisionDoc();
    (self as any).postMessage({ seq, doc, ok: true } satisfies OutMsg);
  } catch {
    (self as any).postMessage({ seq, doc: defaultVisionDoc(), ok: false } satisfies OutMsg);
  }
};

