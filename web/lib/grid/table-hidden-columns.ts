import type { GridTableV1 } from '@/lib/gridjson';

export type TableHiddenColumnView = {
  /** Dest col id -> source col id (or null if no col occupies that slot) */
  destToSourceColId: Record<string, string | null>;
};

/**
 * Collapses hidden columns inside the table's data columns region (tc >= headerCols).
 * Header columns are not remapped.
 */
export function computeTableHiddenColumnView(t: GridTableV1): TableHiddenColumnView | null {
  const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
  const dataColIds = t.colIds.slice(hc);
  const hidden = new Set((t.hiddenCols || []).map((x) => String(x || '').trim()).filter(Boolean));
  if (!hidden.size) return null;

  const visible = dataColIds.filter((id) => !hidden.has(id));
  const destToSourceColId: Record<string, string | null> = {};
  for (let i = 0; i < dataColIds.length; i++) {
    const dest = dataColIds[i]!;
    destToSourceColId[dest] = visible[i] || null;
  }
  return { destToSourceColId };
}

export function computeAllTableHiddenColumnViews(tables: GridTableV1[]): Map<string, TableHiddenColumnView> {
  const byId = new Map<string, TableHiddenColumnView>();
  for (const t of tables) {
    const view = computeTableHiddenColumnView(t);
    if (view) byId.set(t.id, view);
  }
  return byId;
}

