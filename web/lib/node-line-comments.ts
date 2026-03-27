/**
 * Shared helpers for preserving node-line metadata comments when rewriting markdown lines.
 *
 * These comments are persistence anchors for multiple subsystems:
 * - expanded state:   <!-- expanded:N --> (current) and <!-- expid:N --> (history/stable id)
 * - running numbers:  <!-- rn:N -->
 * - descriptions:     <!-- desc:... -->
 * - node icons:       <!-- icon:... -->
 * - node tags:        <!-- tags:... -->
 */

const LOOSE_KNOWN_NODE_LINE_COMMENT_RE = /<!--\s*([A-Za-z][A-Za-z0-9_-]*)\s*:([\s\S]*?)\s*-->/g;

const VALID_KNOWN_NODE_LINE_COMMENT_RE =
  /<!--\s*(?:expanded:\d+|expid:\d+|rn:\d+|desc:[^>]*|ann:[^>]*|icon:[\s\S]*?|do:[^>]*?|doattrs:[^>]*?|dostatus:[^>]*?|tags:[^>]*|uiType:[^>]*|fid:[^>]*|sfid:[^>]*|hubnote:\d+)\s*-->/g;

const KNOWN_COMMENT_KINDS = new Set([
  'expanded',
  'expid',
  'rn',
  'desc',
  'ann',
  'icon',
  'do',
  'doattrs',
  'dostatus',
  'tags',
  'uiType',
  'fid',
  'sfid',
  'hubnote',
]);

function normalizeKnownCommentKind(kind: string): string | null {
  const normalized = String(kind || '').trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === 'uitype') return 'uiType';
  return KNOWN_COMMENT_KINDS.has(lower) ? lower : null;
}

function normalizeKnownCommentValue(kind: string, value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (kind === 'expanded' || kind === 'expid' || kind === 'rn' || kind === 'hubnote') {
    const m = raw.match(/(\d+)/);
    if (!m?.[1]) return null;
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return String(n);
  }
  return raw;
}

function canonicalizeKnownNodeLineComment(kind: string, value: string): string | null {
  const normalizedKind = normalizeKnownCommentKind(kind);
  if (!normalizedKind) return null;
  const normalizedValue = normalizeKnownCommentValue(normalizedKind, value);
  if (!normalizedValue) return null;
  return `<!-- ${normalizedKind}:${normalizedValue} -->`;
}

export function stripKnownNodeLineComments(line: string): string {
  const text = String(line || '');
  const leading = text.match(/^\s*/)?.[0] || '';
  const body = text.slice(leading.length);
  const strippedBody = body
    .replace(LOOSE_KNOWN_NODE_LINE_COMMENT_RE, (match, rawKind: string) => (normalizeKnownCommentKind(rawKind) ? ' ' : match))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/g, '')
    .trimEnd();
  return `${leading}${strippedBody}`;
}

export function normalizeKnownNodeLineComments(line: string): string {
  const text = String(line || '');
  const leading = text.match(/^\s*/)?.[0] || '';
  const body = text.slice(leading.length);
  const orderedKinds: string[] = [];
  const commentByKind = new Map<string, string>();

  const strippedBody = body.replace(LOOSE_KNOWN_NODE_LINE_COMMENT_RE, (match, rawKind: string, rawValue: string) => {
    const kind = normalizeKnownCommentKind(rawKind);
    if (!kind) return match;
    if (!orderedKinds.includes(kind)) orderedKinds.push(kind);
    const normalizedComment = canonicalizeKnownNodeLineComment(kind, rawValue);
    if (normalizedComment) commentByKind.set(kind, normalizedComment);
    else commentByKind.delete(kind);
    return ' ';
  });

  const normalizedBody = strippedBody
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/g, '')
    .trimEnd();
  const suffix = orderedKinds.map((kind) => commentByKind.get(kind)).filter((value): value is string => Boolean(value)).join(' ');
  return `${leading}${normalizedBody}${suffix ? `${normalizedBody ? ' ' : ''}${suffix}` : ''}`;
}

export function extractKnownNodeLineComments(line: string): string[] {
  return normalizeKnownNodeLineComments(line).match(VALID_KNOWN_NODE_LINE_COMMENT_RE) || [];
}

/**
 * Return a string like " <!-- expid:1 --> <!-- rn:7 -->" that can be appended to a rewritten line.
 * Returns empty string if none exist.
 */
export function buildPreservedNodeLineCommentSuffix(previousLine: string): string {
  const matches = extractKnownNodeLineComments(previousLine);
  if (!matches.length) return '';
  return ' ' + matches.join(' ');
}
