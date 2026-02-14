'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useAuth } from '@/hooks/use-auth';
import { loadGridDoc, type GridDoc, type GridSheetV1, type GridTableV1 } from '@/lib/gridjson';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { buildNoteEmbedCommentTargetKey } from '@/lib/note-comments';

export type NexusTableSource =
  | {
      type: 'gridTable';
      fileId: string;
      sheetId: string;
      tableId: string;
    };

export type NexusTableSpec = {
  id: string;
  mode?: 'intersection' | 'union';
  sources: NexusTableSource[];
};

function safeJsonParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function colLabel(idx: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = idx + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out || 'A';
}

function findGridTable(doc: GridDoc, sheetId: string, tableId: string): { sheet: GridSheetV1; table: GridTableV1 } | null {
  const sheet = (doc.sheets || []).find((s) => s.id === sheetId) || null;
  if (!sheet) return null;
  const table = (sheet.grid.tables || []).find((t) => t.id === tableId) || null;
  if (!table) return null;
  return { sheet, table };
}

type NormalizedTable = {
  sourceLabel: string;
  columns: string[]; // display names
  columnsKey: string[]; // normalized keys (same length)
  rows: Array<Record<string, string>>; // keyed by normalized column key
};

function normalizeColKey(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function disambiguate(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base = String(n || '').trim() || 'Column';
    const k = base.toLowerCase();
    const next = (seen.get(k) || 0) + 1;
    seen.set(k, next);
    return next === 1 ? base : `${base} (${next})`;
  });
}

function gridTableToNormalized(markdown: string, src: Extract<NexusTableSource, { type: 'gridTable' }>): NormalizedTable | null {
  const loaded = loadGridDoc(markdown);
  const found = findGridTable(loaded.doc, src.sheetId, src.tableId);
  if (!found) return null;
  const { sheet, table } = found;

  const hr = Math.max(0, Math.round(table.headerRows || 0));
  const fr = Math.max(0, Math.round(table.footerRows || 0));
  const headerRowId = table.rowIds[Math.max(0, Math.min(table.rowIds.length - 1, hr > 0 ? hr - 1 : 0))] || table.rowIds[0] || '';
  const dataRowIds = table.rowIds.slice(hr, Math.max(hr, table.rowIds.length - fr));

  // Column display names come from the header row, falling back to A/B/C…
  const colNamesRaw = table.colIds.map((colId, idx) => {
    const k = `${headerRowId}:${colId}`;
    const v = String(sheet.grid.cells[k]?.value ?? '').trim();
    return v || colLabel(idx);
  });
  const colNames = disambiguate(colNamesRaw);
  const colKeys = colNames.map((n) => normalizeColKey(n));

  const rows: Array<Record<string, string>> = dataRowIds.map((rowId) => {
    const rec: Record<string, string> = {};
    table.colIds.forEach((colId, idx) => {
      const k = `${rowId}:${colId}`;
      const v = String(sheet.grid.cells[k]?.value ?? '');
      rec[colKeys[idx] || `c:${idx}`] = v;
    });
    return rec;
  });

  return {
    sourceLabel: `${src.fileId}:${src.sheetId}:${src.tableId}`,
    columns: colNames,
    columnsKey: colKeys,
    rows,
  };
}

function mergeNormalizedTables(params: {
  tables: NormalizedTable[];
  mode: 'intersection' | 'union';
}): { kind: 'stacked' | 'joined'; columns: Array<{ key: string; name: string }>; rows: Array<Record<string, string>> } {
  const { tables, mode } = params;
  const allKeys = new Set<string>();
  const keyCount = new Map<string, number>();
  const displayNameByKey = new Map<string, string>();
  tables.forEach((t) => {
    t.columnsKey.forEach((k, idx) => {
      allKeys.add(k);
      keyCount.set(k, (keyCount.get(k) || 0) + 1);
      if (!displayNameByKey.has(k)) displayNameByKey.set(k, t.columns[idx] || k);
    });
  });

  const commonKeys = Array.from(allKeys).filter((k) => (keyCount.get(k) || 0) === tables.length);
  const finalKeys = (mode === 'intersection' ? commonKeys : Array.from(allKeys)).filter(Boolean);

  const columns = finalKeys.map((k) => ({ key: k, name: displayNameByKey.get(k) || k }));

  // If no common keys, or common keys are unusable, stack rows with a source column.
  const canJoin = commonKeys.length > 0;
  if (!canJoin) {
    const stackedCols = [{ key: '__source', name: 'source' }, ...columns];
    const rows = tables.flatMap((t) =>
      t.rows.map((r) => {
        const out: Record<string, string> = { __source: t.sourceLabel };
        stackedCols.forEach((c) => {
          if (c.key === '__source') return;
          out[c.key] = String(r[c.key] ?? '');
        });
        return out;
      }),
    );
    return { kind: 'stacked', columns: stackedCols, rows };
  }

  // Build best-effort join keys from common columns.
  const joinKeyFor = (row: Record<string, string>) => {
    const parts = commonKeys.map((k) => String(row[k] ?? '').trim().toLowerCase());
    const key = parts.join('||');
    return key.replace(/\|+/g, '|').replace(/^\|+|\|+$/g, '');
  };

  const allRows = tables.flatMap((t) => t.rows.map((r) => ({ t, r })));
  const keys = allRows.map(({ r }) => joinKeyFor(r));
  const valid = keys.filter((k) => k.trim().length > 0);
  const uniq = new Set(valid).size;
  const total = keys.length;
  const validRatio = total > 0 ? valid.length / total : 0;
  const uniqRatio = valid.length > 0 ? uniq / valid.length : 0;

  // Heuristic: if too many rows have empty join keys, or too many collisions, fall back to stacked.
  if (validRatio < 0.5 || uniqRatio < 0.3) {
    const stackedCols = [{ key: '__source', name: 'source' }, ...columns];
    const rows = tables.flatMap((t) =>
      t.rows.map((r) => {
        const out: Record<string, string> = { __source: t.sourceLabel };
        stackedCols.forEach((c) => {
          if (c.key === '__source') return;
          out[c.key] = String(r[c.key] ?? '');
        });
        return out;
      }),
    );
    return { kind: 'stacked', columns: stackedCols, rows };
  }

  const merged = new Map<string, Record<string, string>>();
  allRows.forEach(({ t, r }) => {
    const k = joinKeyFor(r);
    if (!k.trim()) return;
    const existing = merged.get(k) || {};
    // Preserve one source label for debugging.
    existing.__source = existing.__source || t.sourceLabel;
    finalKeys.forEach((colKey) => {
      const v = String(r[colKey] ?? '').trim();
      if (!v) return;
      if (!existing[colKey]) existing[colKey] = v;
    });
    merged.set(k, existing);
  });

  // Ensure stable row order: by join key.
  const rows = Array.from(merged.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, r]) => r);

  // Include source column only if we had to fallback; for joined mode keep it out of display.
  return { kind: 'joined', columns, rows };
}

export function NexusTableBlock({
  hostDoc,
  raw,
  commentMode = false,
  onOpenComments,
}: {
  hostDoc: Y.Doc;
  raw: string;
  commentMode?: boolean;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string }) => void;
}) {
  // Host doc reserved for future local/table sources.
  void hostDoc;
  const parsed = safeJsonParse(raw);
  const spec = parsed as NexusTableSpec | null;

  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [markdownByFileId, setMarkdownByFileId] = useState<Record<string, string>>({});
  const fileIds = useMemo(() => {
    const ids = new Set<string>();
    (spec?.sources || []).forEach((s) => {
      if (s.type === 'gridTable' && s.fileId) ids.add(String(s.fileId));
    });
    return Array.from(ids.values());
  }, [spec?.sources]);

  useEffect(() => {
    if (!spec) return;
    if (fileIds.length === 0) return;
    let cancelled = false;

    const load = async () => {
      // Local mode: snapshots only.
      if (!supabaseMode) {
        const next: Record<string, string> = {};
        fileIds.forEach((id) => {
          next[id] = loadFileSnapshot(id) || '';
        });
        if (!cancelled) setMarkdownByFileId(next);
        return;
      }

      // Supabase mode: batch fetch.
      if (!ready) return;
      if (!supabase) return;
      try {
        const { data, error } = await supabase.from('files').select('id,content').in('id', fileIds);
        if (error) throw error;
        const next: Record<string, string> = {};
        (data || []).forEach((r: any) => {
          const id = String(r?.id || '');
          if (!id) return;
          next[id] = String(r?.content || '');
        });
        // Ensure keys exist for all requested ids.
        fileIds.forEach((id) => {
          if (!(id in next)) next[id] = '';
        });
        if (!cancelled) setMarkdownByFileId(next);
      } catch {
        // ignore
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [spec?.id, fileIds.join(','), supabaseMode, ready, supabase]);

  type MergedState =
    | { status: 'loading' }
    | { status: 'empty'; message: string }
    | { status: 'error'; message: string }
    | {
        status: 'ready';
        mergeKind: 'stacked' | 'joined';
        columns: Array<{ key: string; name: string }>;
        rows: Array<Record<string, string>>;
      };

  const merged = useMemo(() => {
    if (!spec) return { status: 'error' as const, message: 'Invalid `nexus-table` JSON.' } satisfies MergedState;
    if (!Array.isArray(spec.sources) || spec.sources.length === 0) {
      return { status: 'empty' as const, message: 'No sources configured.' } satisfies MergedState;
    }
    const mode = spec.mode === 'intersection' ? 'intersection' : 'union';
    const normalized: NormalizedTable[] = [];
    for (const s of spec.sources) {
      if (s.type !== 'gridTable') {
        return { status: 'error' as const, message: `Unsupported source type: ${(s as any).type}` } satisfies MergedState;
      }
      const md = markdownByFileId[s.fileId] || '';
      if (!md.trim()) continue;
      const t = gridTableToNormalized(md, s);
      if (!t) {
        return {
          status: 'error' as const,
          message: `Grid table not found: ${s.fileId} / ${s.sheetId} / ${s.tableId}`,
        } satisfies MergedState;
      }
      normalized.push(t);
    }
    if (normalized.length === 0) return { status: 'loading' as const } satisfies MergedState;
    const out = mergeNormalizedTables({ tables: normalized, mode });
    return { status: 'ready' as const, mergeKind: out.kind, columns: out.columns, rows: out.rows } satisfies MergedState;
  }, [spec, markdownByFileId]);

  if (!spec || typeof (spec as any).id !== 'string') {
    return (
      <div className="my-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        Invalid `nexus-table` JSON.
      </div>
    );
  }

  const wrap = (children: any) => {
    if (!commentMode) return children;
    const targetKey = buildNoteEmbedCommentTargetKey(spec.id);
    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments?.({ targetKey, targetLabel: `Embed · table` });
        }}
        title="Add/view comments for this embed"
      >
        {children}
      </button>
    );
  };

  return wrap(
    <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">
        Table <span className="font-mono opacity-70">{spec.id}</span>
      </div>
      <div className="p-3">
        {merged.status === 'loading' ? <div className="text-xs text-slate-600">Loading table…</div> : null}
        {merged.status === 'empty' ? <div className="text-xs text-slate-600">{merged.message}</div> : null}
        {merged.status === 'error' ? <div className="text-sm text-red-700">{merged.message}</div> : null}
        {merged.status === 'ready' ? (
          <>
            <div className="mb-2 text-[11px] text-slate-500">
              Columns:{' '}
              <span className="font-mono">
                {spec.mode === 'intersection' ? 'common-only' : 'common+merged'}
              </span>{' '}
              · Merge:{' '}
              <span className="font-mono">{merged.mergeKind}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs min-w-[520px]">
                <thead>
                  <tr>
                    {merged.columns.map((c) => (
                      <th key={c.key} className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {merged.rows.map((r, idx) => (
                    <tr key={idx}>
                      {merged.columns.map((c) => (
                        <td key={c.key} className="border border-slate-200 px-2 py-1 align-top">
                          {String(r[c.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>,
  );
}

