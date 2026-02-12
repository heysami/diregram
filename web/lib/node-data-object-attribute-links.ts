import { OBJECT_NAME_ATTR_ID } from '@/lib/data-object-attribute-ids';

const DOATTRS_RE = /<!--\s*doattrs:([^>]*)\s*-->/;
const DOATTRS_RE_GLOBAL = /\s*<!--\s*doattrs:[\s\S]*?\s*-->\s*/g;

function sanitizeToken(raw: string): string {
  return (raw || '')
    .replace(/\r?\n/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/--/g, '')
    .replace(/<!--/g, '')
    .replace(/-->/g, '')
    .trim();
}

export function parseDoAttrsFromLine(line: string): string[] {
  const m = (line || '').match(DOATTRS_RE);
  if (!m) return [];
  const ids = (m[1] || '')
    .split(',')
    .map((x) => sanitizeToken(x))
    .map((x) => x.slice(0, 64))
    .filter(Boolean);
  // de-dupe preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

export function stripDoAttrsFromLine(line: string): string {
  return (line || '').replace(DOATTRS_RE_GLOBAL, ' ').replace(/\s+$/g, '');
}

export function upsertDoAttrsInLine(line: string, attributeIds: string[]): string {
  const base = stripDoAttrsFromLine(line);
  const cleaned = (attributeIds || [])
    .map((x) => sanitizeToken(String(x)))
    .map((x) => x.slice(0, 64))
    .filter(Boolean);
  const uniq = Array.from(new Set(cleaned));
  const payload = uniq.join(',');
  if (!payload) return base;
  return `${base} <!-- doattrs:${payload} -->`;
}

export function isValidSpecialAttrId(id: string): boolean {
  return id === OBJECT_NAME_ATTR_ID;
}

