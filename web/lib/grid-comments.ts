export type GridCommentTarget =
  | {
      kind: 'cell';
      sheetId: string;
      rowId: string;
      colId: string;
    }
  | {
      kind: 'card';
      sheetId: string;
      cardId: string;
    };

export function buildGridCellCommentTargetKey(sheetId: string, rowId: string, colId: string): string {
  return `g:sheet:${sheetId}:cell:${rowId}:${colId}`;
}

export function buildGridCardCommentTargetKey(sheetId: string, cardId: string): string {
  return `g:sheet:${sheetId}:card:${cardId}`;
}

export function parseGridCommentTargetKey(targetKey: string): GridCommentTarget | null {
  const k = String(targetKey || '').trim();
  if (!k) return null;

  const cellMatch = k.match(/^g:sheet:([^:]+):cell:([^:]+):([^:]+)$/);
  if (cellMatch) {
    const sheetId = cellMatch[1] || '';
    const rowId = cellMatch[2] || '';
    const colId = cellMatch[3] || '';
    if (!sheetId || !rowId || !colId) return null;
    return { kind: 'cell', sheetId, rowId, colId };
  }

  const cardMatch = k.match(/^g:sheet:([^:]+):card:([^:]+)$/);
  if (cardMatch) {
    const sheetId = cardMatch[1] || '';
    const cardId = cardMatch[2] || '';
    if (!sheetId || !cardId) return null;
    return { kind: 'card', sheetId, cardId };
  }

  return null;
}

export function getGridSheetIdFromCommentTargetKey(targetKey: string): string | null {
  const parsed = parseGridCommentTargetKey(targetKey);
  return parsed?.sheetId || null;
}

