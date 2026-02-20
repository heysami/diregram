'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useAuth } from '@/hooks/use-auth';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { buildNoteEmbedCommentTargetKey } from '@/lib/note-comments';
import { parseJsonish } from '@/lib/jsonish';
import {
  mergeNormalizedTables,
  normalizeNexusTableSource,
  type NormalizedTable,
  type NexusTableSource,
  type NexusTableSpec,
} from '@/lib/nexus-table-embed';

const tryParseJsonish = parseJsonish;

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
  const parsed = tryParseJsonish(raw);
  const spec = parsed as NexusTableSpec | null;

  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [markdownByFileId, setMarkdownByFileId] = useState<Record<string, string>>({});
  const fileIds = useMemo(() => {
    const ids = new Set<string>();
    (spec?.sources || []).forEach((s) => {
      if ((s.type === 'gridTable' || s.type === 'gridSheet') && (s as any).fileId) ids.add(String((s as any).fileId));
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
      const md = markdownByFileId[(s as any).fileId] || '';
      if (!md.trim()) continue;
      const src = s as NexusTableSource;
      const t = normalizeNexusTableSource(md, src);
      if (!t) {
        if (src.type === 'gridTable') {
          return {
            status: 'error' as const,
            message: `Grid table not found: ${src.fileId} / ${src.sheetId} / ${src.tableId}`,
          } satisfies MergedState;
        }
        if (src.type === 'gridSheet') {
          return {
            status: 'error' as const,
            message: `Grid sheet not found: ${src.fileId} / ${src.sheetId}`,
          } satisfies MergedState;
        }
        return { status: 'error' as const, message: `Unsupported source type: ${(src as any).type}` } satisfies MergedState;
      }
      normalized.push(t);
    }
    if (normalized.length === 0) return { status: 'loading' as const } satisfies MergedState;
    const out = mergeNormalizedTables({ tables: normalized, mode });
    return { status: 'ready' as const, mergeKind: out.kind, columns: out.columns, rows: out.rows } satisfies MergedState;
  }, [spec, markdownByFileId]);

  if (!spec) {
    return (
      <div className="my-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        Invalid `nexus-table` JSON.
      </div>
    );
  }

  const embedId = typeof (spec as any).id === 'string' && String((spec as any).id).trim() ? String((spec as any).id).trim() : 'table';

  const wrap = (children: any) => {
    if (!commentMode) return children;
    const targetKey = buildNoteEmbedCommentTargetKey(embedId);
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
        Table <span className="font-mono opacity-70">{embedId}</span>
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

