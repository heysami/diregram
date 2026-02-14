/**
 * Quote-aware TSV (tab-separated) codec compatible with spreadsheet clipboards:
 * - Fields containing tabs, newlines, or quotes are wrapped in double quotes.
 * - Inside quoted fields, "" becomes a literal ".
 * - Newlines inside quoted fields are preserved.
 */

export function encodeTsvGrid(grid: string[][]): string {
  const esc = (s: string) => {
    const v = String(s ?? '');
    if (!/[\"\t\n\r]/.test(v)) return v;
    return `"${v.replace(/"/g, '""')}"`;
  };
  return grid.map((row) => row.map(esc).join('\t')).join('\n');
}

export function parseTsv(text: string): string[][] {
  const s = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
    if (ch === '\t') {
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

