import { listRecognizedMacros } from '@/lib/grid-cell-macros';

export type TableFilterItemKind =
  | 'text'
  | 'pills'
  | 'people'
  | 'seg'
  | 'check'
  | 'radio'
  | 'date'
  | 'progress'
  | 'color'
  | 'icon';

export type TableFilterItem = { kind: TableFilterItemKind; label: string };

function parseKv(body: string): Record<string, string> {
  const kv: Record<string, string> = {};
  String(body || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((seg) => {
      const eq = seg.indexOf('=');
      if (eq === -1) return;
      const k = seg.slice(0, eq).trim();
      const v = seg.slice(eq + 1).trim();
      if (k) kv[k] = v;
    });
  return kv;
}

function uniqItems(items: TableFilterItem[]): TableFilterItem[] {
  const seen = new Set<string>();
  const out: TableFilterItem[] = [];
  for (const it of items) {
    const k = `${it.kind}:${it.label}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function encodeFilterItem(it: TableFilterItem): string {
  return `${it.kind}:${it.label}`;
}

export function decodeFilterItem(s: string): TableFilterItem | null {
  const raw = String(s || '');
  const i = raw.indexOf(':');
  if (i === -1) return null;
  const kind = raw.slice(0, i) as TableFilterItemKind;
  const label = raw.slice(i + 1);
  if (!label.trim()) return null;
  return { kind, label };
}

/**
 * Extract "filter items" from a cell value.
 * - Plain text -> one `text:` item.
 * - Pills/people -> individual tags/names.
 * - Seg -> selected value only.
 * - Mixed content -> returns macro items plus a fallback `text:` item of the full string.
 */
export function extractTableFilterItems(input: string): TableFilterItem[] {
  const s = String(input || '');
  const trimmed = s.trim();
  if (!trimmed) return [];

  const macros = listRecognizedMacros(s);
  if (!macros.length) return [{ kind: 'text', label: trimmed }];

  // Compute "rest text" after removing macro tokens.
  const parts: string[] = [];
  let last = 0;
  macros.forEach((m) => {
    parts.push(s.slice(last, m.start));
    last = m.end;
  });
  parts.push(s.slice(last));
  const rest = parts.join('').trim();

  const items: TableFilterItem[] = [];

  for (const m of macros) {
    const inner = String(m.inner || '');
    const colon = inner.indexOf(':');
    if (colon === -1) continue;
    const name = inner.slice(0, colon).trim();
    const body = inner.slice(colon + 1).trim();

    if (name === 'pills') {
      body
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((t) => items.push({ kind: 'pills', label: t }));
      continue;
    }
    if (name === 'people') {
      body
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((p) => items.push({ kind: 'people', label: p.startsWith('@') ? p.slice(1) : p }));
      continue;
    }
    if (name === 'seg') {
      const kv = parseKv(body);
      const v = String(kv.value || '').trim();
      if (v) items.push({ kind: 'seg', label: v });
      continue;
    }
    if (name === 'check') {
      const on = body === '1' || body.toLowerCase() === 'true';
      items.push({ kind: 'check', label: on ? 'Checked' : 'Unchecked' });
      continue;
    }
    if (name === 'radio') {
      const on = body === '1' || body.toLowerCase() === 'true';
      items.push({ kind: 'radio', label: on ? 'Selected' : 'Empty' });
      continue;
    }
    if (name === 'date') {
      const d = body.trim();
      if (d) items.push({ kind: 'date', label: d });
      continue;
    }
    if (name === 'progress') {
      const head = body.split(';')[0]?.trim() || '';
      const n = Math.max(0, Math.min(100, Math.round(Number(head) || 0)));
      items.push({ kind: 'progress', label: `${n}%` });
      continue;
    }
    if (name === 'icon') {
      const t = body.trim();
      if (t) items.push({ kind: 'icon', label: t });
      continue;
    }
    if (name === 'c' || name === 'bg') {
      // body is like "r]text" due to our scanner encoding.
      const br = body.indexOf(']');
      if (br !== -1) {
        const txt = body.slice(br + 1).trim();
        if (txt) items.push({ kind: 'color', label: txt });
      }
      continue;
    }
  }

  const uniq = uniqItems(items);
  // If there is any leftover text, also offer filtering by the full string.
  if (rest) uniq.push({ kind: 'text', label: trimmed });
  return uniq;
}

