export type NexusInternalClipboardKind = 'diagramSubtree' | 'gridRange' | 'noteRich' | 'visionSvg';

export type NexusInternalClipboardEnvelopeV1 = {
  version: 1;
  kind: NexusInternalClipboardKind;
  /** NexusMap file id (diagram/note/grid/vision file) that produced this copy/cut. */
  fileId: string;
  /** Epoch ms when copied (best-effort). */
  ts: number;
  /**
   * Best-effort plain-text representation of what was copied.
   * Used to avoid applying stale in-memory envelopes if the user copied something else externally.
   */
  plainText?: string;
  payload: unknown;
};

export const NEXUS_INTERNAL_CLIPBOARD_MIME = 'application/x-nexusmap-internal+json';

type AnyClipboardEvent = ClipboardEvent | { clipboardData: DataTransfer | null } | null | undefined;

let lastEnvelope: NexusInternalClipboardEnvelopeV1 | null = null;

function now() {
  return Date.now();
}

function safeJsonParse<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function coerceEnvelope(x: unknown): NexusInternalClipboardEnvelopeV1 | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (r.version !== 1) return null;
  const kind = r.kind;
  if (kind !== 'diagramSubtree' && kind !== 'gridRange' && kind !== 'noteRich' && kind !== 'visionSvg') return null;
  const fileId = typeof r.fileId === 'string' ? r.fileId.trim() : '';
  if (!fileId) return null;
  const ts = typeof r.ts === 'number' && Number.isFinite(r.ts) ? r.ts : now();
  const plainText = typeof r.plainText === 'string' && r.plainText.length ? r.plainText : undefined;
  return { version: 1, kind, fileId, ts, ...(plainText ? { plainText } : {}), payload: r.payload };
}

export function writeInternalClipboardEnvelope(
  evt: AnyClipboardEvent,
  env: Omit<NexusInternalClipboardEnvelopeV1, 'version' | 'ts'> & Partial<Pick<NexusInternalClipboardEnvelopeV1, 'ts'>>,
): NexusInternalClipboardEnvelopeV1 {
  const full: NexusInternalClipboardEnvelopeV1 = {
    version: 1,
    kind: env.kind,
    fileId: env.fileId,
    ts: typeof env.ts === 'number' && Number.isFinite(env.ts) ? env.ts : now(),
    ...(typeof env.plainText === 'string' && env.plainText.length ? { plainText: env.plainText } : {}),
    payload: env.payload,
  };
  lastEnvelope = full;

  try {
    const cd = (evt as any)?.clipboardData as DataTransfer | null | undefined;
    if (cd) cd.setData(NEXUS_INTERNAL_CLIPBOARD_MIME, JSON.stringify(full));
  } catch {
    // ignore
  }
  return full;
}

export function readInternalClipboardEnvelope(evt: AnyClipboardEvent, opts?: { maxAgeMs?: number }): NexusInternalClipboardEnvelopeV1 | null {
  const maxAgeMs = typeof opts?.maxAgeMs === 'number' ? Math.max(1000, opts!.maxAgeMs) : 1000 * 60 * 20;

  try {
    const cd = (evt as any)?.clipboardData as DataTransfer | null | undefined;
    const raw = cd ? cd.getData(NEXUS_INTERNAL_CLIPBOARD_MIME) : '';
    if (raw) {
      const parsed = safeJsonParse(raw);
      const env = coerceEnvelope(parsed);
      if (env) {
        lastEnvelope = env;
        return env;
      }
    }
  } catch {
    // ignore
  }

  const mem = lastEnvelope;
  if (!mem) return null;
  if (now() - mem.ts > maxAgeMs) return null;

  // Only trust the in-memory fallback if the clipboard's current plain text still matches.
  // This prevents stale internal payloads from hijacking paste after the user copied something else.
  const expected = typeof mem.plainText === 'string' && mem.plainText.length ? mem.plainText : null;
  if (!expected) return null;
  try {
    const cd = (evt as any)?.clipboardData as DataTransfer | null | undefined;
    const curPlain = cd ? String(cd.getData('text/plain') || '') : '';
    if (curPlain && curPlain === expected) return mem;
  } catch {
    // ignore
  }
  return null;
}

export function clearInternalClipboardMemory() {
  lastEnvelope = null;
}

export function isBlockedCrossFilePaste(env: NexusInternalClipboardEnvelopeV1, activeFileId: string): boolean {
  return !!env?.fileId && !!activeFileId && env.fileId !== activeFileId;
}

