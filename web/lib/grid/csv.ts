/**
 * Quote-aware CSV (comma-separated) parser:
 * - Fields containing commas, newlines, or quotes are wrapped in double quotes.
 * - Inside quoted fields, "" becomes a literal ".
 * - Newlines inside quoted fields are preserved.
 */
export function parseCsv(text: string): string[][] {
  // Normalize newlines and strip UTF-8 BOM if present.
  const s = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        const next = s[i + 1];
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      pushCell();
      continue;
    }
    if (ch === '\n') {
      pushCell();
      pushRow();
      continue;
    }
    cell += ch;
  }

  pushCell();
  rows.push(row);

  // If the input ended with a newline, we'll have an extra empty last row; strip it.
  if (s.endsWith('\n')) {
    const last = rows[rows.length - 1] || [];
    if (last.length === 1 && last[0] === '') rows.pop();
  }

  // Ensure at least one row.
  return rows.length ? rows : [[]];
}

