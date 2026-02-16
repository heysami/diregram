type JsonObject = Record<string, unknown>;

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
  /**
   * Supabase Storage object path (preferred in Supabase mode).
   * Example: "vision/<userId>/<fileId>/<cellKey>/<uuid>.png"
   */
  objectPath?: string | null;
  /**
   * Local-mode fallback: inline data URL.
   * WARNING: can bloat `files.content` — keep images small.
   */
  dataUrl?: string | null;
  width?: number;
  height?: number;
};

export type VisionCellV1 = {
  kind: VisionCellKind;
  updatedAt: string;
  /** Fabric canvas JSON (from `canvas.toJSON(...)`). */
  fabric?: unknown;
  /** tldraw snapshot (document portion or full snapshot). */
  tldraw?: unknown;
  /** Image info for image cells (and optionally for others). */
  image?: VisionImageInfoV1;
  /** Small PNG data URL used for the 24×24 grid thumbnail. */
  thumb?: string;
  /** Normalized crop defining what becomes `thumb`. */
  thumbCrop?: VisionCropRectV1;
  /** Optional annotator overlay data. */
  annotator?: VisionAnnotatorV1;
  /** Optional extra sections (brainstorm/reference only). */
  extras?: VisionExtraV1[];
  /** Google font families used in this cell (best-effort). */
  fonts?: string[];
};

export type VisionDocV1 = {
  version: 1;
  gridSize: 24;
  /** Sparse storage: only non-empty cells are present. */
  cells: Record<string, VisionCellV1>;
};

export type VisionDoc = VisionDocV1;

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

function isCellKind(x: unknown): x is VisionCellKind {
  return x === 'vector' || x === 'ui' || x === 'image';
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((v) => typeof v === 'string').map((s) => s.trim()).filter(Boolean);
}

function coerceCropRect(x: unknown): VisionCropRectV1 | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const r = x as JsonObject;
  const xx = Number(r.x);
  const yy = Number(r.y);
  const ww = Number(r.w);
  const hh = Number(r.h);
  if (![xx, yy, ww, hh].every((n) => Number.isFinite(n))) return undefined;
  // Keep a small minimum size to avoid zero-area thumbs.
  const min = 0.02;
  const cx = Math.max(0, Math.min(1, xx));
  const cy = Math.max(0, Math.min(1, yy));
  const cw = Math.max(min, Math.min(1, ww));
  const ch = Math.max(min, Math.min(1, hh));
  // Clamp to bounds.
  const w2 = Math.min(cw, 1 - cx);
  const h2 = Math.min(ch, 1 - cy);
  return { x: cx, y: cy, w: w2, h: h2 };
}

function coerceAnnotator(x: unknown): VisionAnnotatorV1 | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const r = x as JsonObject;
  const overlayFabric = r.overlayFabric;
  const out: VisionAnnotatorV1 = {};
  if (overlayFabric !== undefined) out.overlayFabric = overlayFabric;
  return Object.keys(out).length ? out : undefined;
}

function isExtraKind(x: unknown): x is VisionExtraV1['kind'] {
  return x === 'note' || x === 'link' || x === 'image';
}

function coerceExtras(x: unknown): VisionExtraV1[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out: VisionExtraV1[] = [];
  for (const it of x) {
    if (!it || typeof it !== 'object') continue;
    const r = it as JsonObject;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const kind = r.kind;
    const content = typeof r.content === 'string' ? r.content : '';
    const title = typeof r.title === 'string' ? r.title : undefined;
    if (!id || !isExtraKind(kind)) continue;
    out.push({ id, kind, ...(title && title.trim() ? { title: title.trim() } : null), content });
  }
  return out.length ? out : undefined;
}

function coerceImageInfo(x: unknown): VisionImageInfoV1 | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const r = x as JsonObject;
  const objectPath = typeof r.objectPath === 'string' ? r.objectPath : r.objectPath === null ? null : undefined;
  const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : r.dataUrl === null ? null : undefined;
  const width = typeof r.width === 'number' ? r.width : undefined;
  const height = typeof r.height === 'number' ? r.height : undefined;
  const out: VisionImageInfoV1 = {};
  if (objectPath !== undefined) out.objectPath = objectPath;
  if (dataUrl !== undefined) out.dataUrl = dataUrl;
  if (width !== undefined) out.width = width;
  if (height !== undefined) out.height = height;
  return Object.keys(out).length ? out : undefined;
}

function coerceCell(x: unknown): VisionCellV1 | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as JsonObject;
  const kind = r.kind;
  if (!isCellKind(kind)) return null;
  const updatedAt = typeof r.updatedAt === 'string' && r.updatedAt.trim() ? r.updatedAt : new Date(0).toISOString();
  const thumb = typeof r.thumb === 'string' ? r.thumb : undefined;
  const thumbCrop = coerceCropRect(r.thumbCrop);
  const fonts = asStringArray(r.fonts);
  const image = coerceImageInfo(r.image);
  const annotator = coerceAnnotator(r.annotator);
  const extras = coerceExtras(r.extras);
  const fabric = r.fabric;
  const tldraw = r.tldraw;
  return {
    kind,
    updatedAt,
    ...(fabric !== undefined ? { fabric } : null),
    ...(tldraw !== undefined ? { tldraw } : null),
    ...(image ? { image } : null),
    ...(thumb ? { thumb } : null),
    ...(thumbCrop ? { thumbCrop } : null),
    ...(annotator ? { annotator } : null),
    ...(extras ? { extras } : null),
    ...(fonts.length ? { fonts } : null),
  } as VisionCellV1;
}

function coerceDoc(x: unknown): VisionDoc | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as JsonObject;
  if (r.version !== 1) return null;
  if (r.gridSize !== 24) return null;
  const cellsRaw = r.cells;
  const cells: Record<string, VisionCellV1> = {};
  if (cellsRaw && typeof cellsRaw === 'object') {
    Object.entries(cellsRaw as Record<string, unknown>).forEach(([k, v]) => {
      const key = String(k || '').trim();
      if (!key) return;
      const cell = coerceCell(v);
      if (!cell) return;
      cells[key] = cell;
    });
  }
  return { version: 1, gridSize: 24, cells };
}

export function defaultVisionDoc(): VisionDoc {
  return { version: 1, gridSize: 24, cells: {} };
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

