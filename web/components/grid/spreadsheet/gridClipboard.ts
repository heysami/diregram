import type { GridSheetV1 } from '@/lib/gridjson';
import { encodeTsvGrid, parseTsv } from '@/lib/grid/tsv';

export function isCopyShortcut(e: KeyboardEvent): boolean {
  const isCmd = e.metaKey || e.ctrlKey;
  return isCmd && e.key.toLowerCase() === 'c';
}

export function isPasteShortcut(e: KeyboardEvent): boolean {
  const isCmd = e.metaKey || e.ctrlKey;
  return isCmd && e.key.toLowerCase() === 'v';
}

export function buildCopyTsv(opts: {
  rect: { r0: number; r1: number; c0: number; c1: number };
  getValue: (r: number, c: number) => string;
}): string {
  const { rect, getValue } = opts;
  const gridOut: string[][] = [];
  for (let r = rect.r0; r <= rect.r1; r++) {
    const rowVals: string[] = [];
    for (let c = rect.c0; c <= rect.c1; c++) rowVals.push(getValue(r, c));
    gridOut.push(rowVals);
  }
  return encodeTsvGrid(gridOut);
}

export function applyPasteTsvToCells(opts: {
  text: string;
  start: { r: number; c: number };
  rowsLen: number;
  colsLen: number;
  getCoordKey: (r: number, c: number) => string;
  baseCells: GridSheetV1['grid']['cells'];
}): GridSheetV1['grid']['cells'] {
  const { text, start, rowsLen, colsLen, getCoordKey, baseCells } = opts;
  const gridIn = parseTsv(text);
  const nextCells = { ...baseCells };
  gridIn.forEach((line, dr) => {
    line.forEach((val, dc) => {
      const rr = start.r + dr;
      const cc = start.c + dc;
      if (rr >= rowsLen || cc >= colsLen) return;
      const k = getCoordKey(rr, cc);
      if (val.trim().length === 0) delete nextCells[k];
      else nextCells[k] = { value: val };
    });
  });
  return nextCells;
}

