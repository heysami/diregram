type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Legacy exports (v1 grid). Kept to avoid churn across the codebase while
// Vision moves to v2 (canvas). Not used by the v2 parser/coercer.
// ---------------------------------------------------------------------------

export type VisionCellKind = 'vector' | 'ui' | 'image';

export type VisionCropRectV1 = {
  /** Normalized [0..1] */
  x: number;
  /** Normalized [0..1] */
  y: number;
  /** Normalized (0..1] */
  w: number;
  /** Normalized (0..1] */
  h: number;
};

export type VisionAnnotatorV1 = {
  /** Fabric JSON for annotation overlays (rendered above a mirrored base preview). */
  overlayFabric?: unknown;
};

export type VisionExtraV1 = {
  id: string;
  kind: 'note' | 'link' | 'image';
  title?: string;
  content: string;
};

export type VisionImageInfoV1 = {
  objectPath?: string | null;
  dataUrl?: string | null;
  width?: number;
  height?: number;
};

export type VisionCellV1 = {
  kind: VisionCellKind;
  updatedAt: string;
  fabric?: unknown;
  tldraw?: unknown;
  image?: VisionImageInfoV1;
  thumb?: string;
  thumbCrop?: VisionCropRectV1;
  annotator?: VisionAnnotatorV1;
  extras?: VisionExtraV1[];
  fonts?: string[];
};

export type VisionDocV1 = {
  version: 1;
  gridSize: 24;
  cells: Record<string, VisionCellV1>;
};

/**
 * Vision document schema.
 *
 * v2: a single tldraw canvas snapshot embedded in markdown under ```visionjson.
 * Cards (and their nested vector editor state) live inside the tldraw document.
 */
export type VisionDocV2 = {
  version: 2;
  /** tldraw snapshot (typically document-only). */
  tldraw?: unknown;
  /** Best-effort updated timestamp (not required for correctness). */
  updatedAt?: string;
};

export type VisionDoc = VisionDocV2 | VisionDocV1;

export type LoadVisionDocResult =
  | { doc: VisionDoc; source: 'visionjson' }
  | { doc: VisionDoc; source: 'default' };

function normalize(markdown: string): string {
  return String(markdown || '').replace(/\r\n/g, '\n');
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coerceDoc(x: unknown): VisionDoc | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as JsonObject;
  if (r.version !== 2) return null;
  const tldraw = (r as any).tldraw;
  const updatedAt = typeof (r as any).updatedAt === 'string' ? String((r as any).updatedAt) : undefined;
  return {
    version: 2,
    ...(tldraw !== undefined ? { tldraw } : null),
    ...(updatedAt ? { updatedAt } : null),
  };
}

export function defaultVisionDoc(): VisionDoc {
  return { version: 2 };
}

function getVisionJsonFullBlockRegex(): RegExp {
  return /```visionjson\s*\n[\s\S]*?\n```/m;
}

export function extractVisionJsonPayload(markdown: string): string | null {
  const text = normalize(markdown);
  const start = text.indexOf('```visionjson');
  if (start < 0) return null;
  // Find the first newline after the opening fence.
  const afterFenceNl = text.indexOf('\n', start);
  if (afterFenceNl < 0) return null;
  // Find the closing fence on its own line.
  const endFence = text.indexOf('\n```', afterFenceNl + 1);
  if (endFence < 0) return null;
  const payload = text.slice(afterFenceNl + 1, endFence).trim();
  return payload || null;
}

export function parseVisionJsonPayload(payload: string): VisionDoc | null {
  if (!payload || !payload.trim()) return null;
  const parsed = safeJsonParse(payload.trim());
  return coerceDoc(parsed);
}

export function loadVisionDoc(markdown: string): LoadVisionDocResult {
  const payload = extractVisionJsonPayload(markdown);
  const coerced = payload ? parseVisionJsonPayload(payload) : null;
  if (coerced) return { doc: coerced, source: 'visionjson' };
  return { doc: defaultVisionDoc(), source: 'default' };
}

export function saveVisionDoc(markdown: string, doc: VisionDoc): string {
  const text = normalize(markdown);
  // IMPORTANT: keep this compact.
  // Vision docs can get large quickly (tldraw snapshots, thumbs). Pretty-printing balloons
  // file size and can freeze the browser during save/parse cycles.
  const payload = JSON.stringify(doc);
  const block = ['```visionjson', payload, '```'].join('\n');
  if (getVisionJsonFullBlockRegex().test(text)) {
    return text.replace(getVisionJsonFullBlockRegex(), block);
  }
  const needsLeadingNewline = text.length > 0 && !text.endsWith('\n');
  const sep = text.trim().length === 0 ? '' : '\n\n';
  return text + (needsLeadingNewline ? '\n' : '') + sep + block + '\n';
}

