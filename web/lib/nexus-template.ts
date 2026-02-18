import type { DocKind } from '@/lib/doc-kinds';

export type TemplateTargetKind = Exclude<DocKind, 'template'> | 'test';
export type NexusTemplateMode = 'createFile' | 'appendFragment';

export type NexusTemplateVarV1 = {
  name: string;
  label?: string;
  default?: string;
  required?: boolean;
};

export type NexusProcessNodeType = 'step' | 'time' | 'loop' | 'action' | 'validation' | 'branch' | 'end' | 'goto';

export type NexusTemplateFlowNodeEntryV1 = {
  runningNumber: number;
  content: string;
  parentPath: string[];
  lineIndex: number;
};

export type NexusTemplateFlowMetaV1 = {
  version: 1;
  flowNodes?: {
    nextRunningNumber: number;
    entries: NexusTemplateFlowNodeEntryV1[];
  };
  processNodeTypes?: Record<string, NexusProcessNodeType>;
  /**
   * Stable connector labels captured from a subtree, keyed by lineIndex offsets:
   * `${fromOffset}__${toOffset}` -> { label, color }.
   *
   * This avoids relying on `node-<lineIndex>` ids from the source document.
   */
  connectorLabelsByOffset?: Record<string, { label: string; color: string }>;
};

export type NexusTemplateHeaderV1 = {
  version: 1;
  name: string;
  description?: string;
  targetKind: TemplateTargetKind;
  mode: NexusTemplateMode;
  fragmentKind?: string;
  vars?: NexusTemplateVarV1[];
  tags?: string[];
  flowMeta?: NexusTemplateFlowMetaV1;
};

export type NexusTemplateHeader = NexusTemplateHeaderV1;

export type ReadNexusTemplateHeaderResult = {
  header?: NexusTemplateHeader;
  rest: string;
};

function normalizeNewlines(s: string): string {
  return (s ?? '').replace(/\r\n?/g, '\n');
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isTargetKind(x: unknown): x is TemplateTargetKind {
  return x === 'diagram' || x === 'note' || x === 'grid' || x === 'vision' || x === 'test';
}

function coerceVar(x: unknown): NexusTemplateVarV1 | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;
  // Variable names are user-facing and appear in template bodies.
  // Be permissive: allow spaces and punctuation (e.g. "Project name", "project-name"),
  // but keep them single-line and reasonably bounded.
  if (name.length > 80) return null;
  if (/[\r\n]/.test(name)) return null;
  if (name.includes('}}') || name.includes('{{')) return null;
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : undefined;
  const def = typeof r.default === 'string' ? String(r.default) : undefined;
  const required = r.required === true ? true : undefined;
  return { name, ...(label ? { label } : {}), ...(def !== undefined ? { default: def } : {}), ...(required ? { required } : {}) };
}

function isProcessNodeType(x: unknown): x is NexusProcessNodeType {
  return x === 'step' || x === 'time' || x === 'loop' || x === 'action' || x === 'validation' || x === 'branch' || x === 'end' || x === 'goto';
}

function coerceFlowMeta(x: unknown): NexusTemplateFlowMetaV1 | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (r.version !== 1) return null;

  let flowNodes: NexusTemplateFlowMetaV1['flowNodes'] | undefined;
  if (r.flowNodes && typeof r.flowNodes === 'object') {
    const fn = r.flowNodes as Record<string, unknown>;
    const nextRunningNumber = typeof fn.nextRunningNumber === 'number' && Number.isFinite(fn.nextRunningNumber) ? fn.nextRunningNumber : null;
    const entriesRaw = Array.isArray(fn.entries) ? fn.entries : null;
    if (nextRunningNumber !== null && entriesRaw) {
      const entries: NexusTemplateFlowNodeEntryV1[] = [];
      for (const e of entriesRaw) {
        if (!e || typeof e !== 'object') continue;
        const ee = e as Record<string, unknown>;
        const runningNumber = typeof ee.runningNumber === 'number' && Number.isFinite(ee.runningNumber) ? ee.runningNumber : null;
        const content = typeof ee.content === 'string' ? ee.content : null;
        const parentPathRaw = Array.isArray(ee.parentPath) ? ee.parentPath : null;
        const parentPath = parentPathRaw ? parentPathRaw.map((p) => (typeof p === 'string' ? p : '')).filter(Boolean) : null;
        const lineIndex = typeof ee.lineIndex === 'number' && Number.isFinite(ee.lineIndex) ? ee.lineIndex : null;
        if (runningNumber === null || content === null || !parentPath || lineIndex === null) continue;
        entries.push({ runningNumber, content, parentPath, lineIndex });
      }
      flowNodes = { nextRunningNumber, entries };
    }
  }

  let processNodeTypes: NexusTemplateFlowMetaV1['processNodeTypes'] | undefined;
  if (r.processNodeTypes && typeof r.processNodeTypes === 'object') {
    const out: Record<string, NexusProcessNodeType> = {};
    const raw = r.processNodeTypes as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k || '').trim();
      if (!key) continue;
      if (!/^\d+$/.test(key)) continue;
      if (!isProcessNodeType(v)) continue;
      out[key] = v;
    }
    if (Object.keys(out).length) processNodeTypes = out;
  }

  let connectorLabelsByOffset: NexusTemplateFlowMetaV1['connectorLabelsByOffset'] | undefined;
  if (r.connectorLabelsByOffset && typeof r.connectorLabelsByOffset === 'object') {
    const raw = r.connectorLabelsByOffset as Record<string, unknown>;
    const out: Record<string, { label: string; color: string }> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k || '').trim();
      if (!/^\d+__\d+$/.test(key)) continue;
      if (!v || typeof v !== 'object') continue;
      const vv = v as Record<string, unknown>;
      const label = typeof vv.label === 'string' ? vv.label : '';
      const color = typeof vv.color === 'string' ? vv.color : '';
      if (!label.trim()) continue;
      out[key] = { label, color: color || '#000000' };
    }
    if (Object.keys(out).length) connectorLabelsByOffset = out;
  }

  if (!flowNodes && !processNodeTypes && !connectorLabelsByOffset) return null;
  return {
    version: 1,
    ...(flowNodes ? { flowNodes } : {}),
    ...(processNodeTypes ? { processNodeTypes } : {}),
    ...(connectorLabelsByOffset ? { connectorLabelsByOffset } : {}),
  };
}

function coerceHeader(x: unknown): NexusTemplateHeader | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (r.version !== 1) return null;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;
  const targetKind = r.targetKind;
  if (!isTargetKind(targetKind)) return null;
  const mode = r.mode === 'appendFragment' ? 'appendFragment' : r.mode === 'createFile' ? 'createFile' : null;
  if (!mode) return null;
  const fragmentKind = typeof r.fragmentKind === 'string' && r.fragmentKind.trim() ? r.fragmentKind.trim() : undefined;
  if (mode === 'createFile' && fragmentKind) return null;
  if (mode === 'appendFragment' && !fragmentKind) return null;
  const description = typeof r.description === 'string' && r.description.trim() ? r.description.trim() : undefined;
  const varsRaw = Array.isArray(r.vars) ? r.vars : [];
  const vars = varsRaw.map(coerceVar).filter((v): v is NexusTemplateVarV1 => v !== null);
  const tags =
    Array.isArray(r.tags) ? r.tags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean) : undefined;
  const flowMeta = coerceFlowMeta(r.flowMeta);
  return {
    version: 1,
    name,
    ...(description ? { description } : {}),
    targetKind,
    mode,
    ...(fragmentKind ? { fragmentKind } : {}),
    ...(vars.length ? { vars } : {}),
    ...(tags && tags.length ? { tags } : {}),
    ...(flowMeta ? { flowMeta } : {}),
  };
}

function headerAtTopMatch(text: string): { full: string; body: string } | null {
  const t = normalizeNewlines(text);
  // Match only if the first non-empty content is a nexus-template block.
  const re = /^(\uFEFF?(?:[ \t]*\n)*)```nexus-template[ \t]*\n([\s\S]*?)\n```[ \t]*\n?/;
  const m = t.match(re);
  if (!m) return null;
  return { full: m[0], body: m[2] ?? '' };
}

export function buildTemplateHeaderBlock(header: NexusTemplateHeader): string {
  // Keep formatting stable for diffability.
  return ['```nexus-template', JSON.stringify(header, null, 2), '```', ''].join('\n');
}

export function upsertTemplateHeader(markdown: string, header: NexusTemplateHeader): string {
  const t = normalizeNewlines(markdown);
  const match = headerAtTopMatch(t);
  const block = buildTemplateHeaderBlock(header);
  if (match) return block + t.slice(match.full.length);
  const hasBom = t.startsWith('\uFEFF');
  if (hasBom) return '\uFEFF' + block + t.slice(1);
  return block + t;
}

export function readTemplateHeader(markdown: string): ReadNexusTemplateHeaderResult {
  const t = normalizeNewlines(markdown);
  const match = headerAtTopMatch(t);
  if (!match) return { rest: t };
  const parsed = safeJsonParse(match.body.trim());
  const header = coerceHeader(parsed);
  if (!header) return { rest: t };
  const rest = t.slice(match.full.length);
  return { header, rest };
}

export function extractTemplateVarNames(payload: string): string[] {
  const src = String(payload ?? '');
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (name: string) => {
    const n = String(name || '').trim();
    if (!n) return;
    if (seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };

  // Syntax: {{var}} and {{var|transform}}
  //
  // We allow spaces in `var` because users often write `{{project name}}`.
  // Transform names remain identifier-like for determinism.
  const mustacheRe = /\{\{\s*([^}|]+?)(?:\s*\|\s*([A-Za-z_][A-Za-z0-9_]*)\s*)?\}\}/g;
  for (const m of src.matchAll(mustacheRe)) add(m[1] || '');

  // Syntax: --var-[name]
  // Allow spaces/punctuation inside the brackets (single-line).
  const dashRe = /--var-\[([^\]\r\n]+?)\]/g;
  for (const m of src.matchAll(dashRe)) add(m[1] || '');

  return out;
}

export function mergeTemplateVars(headerVars: NexusTemplateVarV1[] | undefined, extractedNames: string[]): NexusTemplateVarV1[] {
  const base = Array.isArray(headerVars) ? headerVars.filter(Boolean) : [];
  const out: NexusTemplateVarV1[] = [];
  const seen = new Set<string>();

  base.forEach((v) => {
    const name = String(v?.name || '').trim();
    if (!name) return;
    if (seen.has(name)) return;
    seen.add(name);
    out.push(v);
  });

  (extractedNames || []).forEach((name) => {
    const n = String(name || '').trim();
    if (!n) return;
    if (seen.has(n)) return;
    seen.add(n);
    out.push({ name: n });
  });

  return out;
}

export function renderTemplatePayload(payload: string, vars: Record<string, string>): string {
  const src = String(payload ?? '');
  // Very small template engine: {{var}} and {{var|transform}}
  //
  // `var` may include spaces; we trim it before lookup.
  // Transform names remain identifier-like.
  const rendered = src.replace(/\{\{\s*([^}|]+?)(?:\s*\|\s*([A-Za-z_][A-Za-z0-9_]*))?\s*\}\}/g, (_, rawName, tr) => {
    const name = String(rawName || '').trim();
    const raw = Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name] ?? '') : '';
    const transform = String(tr || '').trim().toLowerCase();
    if (!transform) return raw;
    if (transform === 'upper') return raw.toUpperCase();
    if (transform === 'lower') return raw.toLowerCase();
    if (transform === 'slug') {
      const s = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return s;
    }
    return raw;
  });

  // Syntax: --var-[name]
  return rendered.replace(/--var-\[([^\]\r\n]+?)\]/g, (_, rawName) => {
    const name = String(rawName || '').trim();
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name] ?? '') : '';
  });
}

