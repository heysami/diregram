import type { DocKind, NexusDocHeader } from '@/lib/doc-kinds';

export type ReadNexusDocHeaderResult = {
  header?: NexusDocHeader;
  /** The full input with the header removed (if a header existed at the top). */
  rest: string;
};

function normalizeNewlines(s: string): string {
  // Keep this local to avoid import cycles; this is only for header matching stability.
  return (s ?? '').replace(/\r\n?/g, '\n');
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isDocKind(x: unknown): x is DocKind {
  return x === 'diagram' || x === 'note' || x === 'grid' || x === 'vision';
}

function coerceHeader(x: unknown): NexusDocHeader | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const kind = r.kind;
  const version = r.version;
  if (!isDocKind(kind)) return null;
  if (version !== 1) return null;
  return { kind, version: 1 };
}

function buildHeaderBlock(header: NexusDocHeader): string {
  // Canonical formatting; keep it tiny + stable for diffs.
  return ['```nexus-doc', JSON.stringify(header, null, 2), '```', ''].join('\n');
}

function headerAtTopMatch(text: string): { full: string; body: string } | null {
  // Match only if the *first non-empty content* is a nexus-doc block.
  // Allows leading BOM + blank lines.
  const t = normalizeNewlines(text);
  const re = /^(\uFEFF?(?:[ \t]*\n)*)```nexus-doc[ \t]*\n([\s\S]*?)\n```[ \t]*\n?/;
  const m = t.match(re);
  if (!m) return null;
  return { full: m[0], body: m[2] ?? '' };
}

export function readHeader(markdown: string): ReadNexusDocHeaderResult {
  const t = normalizeNewlines(markdown);
  const match = headerAtTopMatch(t);
  if (!match) return { rest: t };

  const parsed = safeJsonParse(match.body.trim());
  const header = coerceHeader(parsed);
  // Only treat it as a header if it parses + validates. Otherwise leave content untouched.
  if (!header) return { rest: t };

  const rest = t.slice(match.full.length);
  return { header, rest };
}

export function upsertHeader(markdown: string, header: NexusDocHeader): string {
  const t = normalizeNewlines(markdown);
  const match = headerAtTopMatch(t);
  const block = buildHeaderBlock(header);

  if (match) {
    // Replace existing top header (even if it differs in formatting).
    return block + t.slice(match.full.length);
  }

  // Insert at top (after any BOM; keep it first for portability).
  const hasBom = t.startsWith('\uFEFF');
  if (hasBom) return '\uFEFF' + block + t.slice(1);
  return block + t;
}

