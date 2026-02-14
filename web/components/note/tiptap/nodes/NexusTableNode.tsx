'use client';

import type * as Y from 'yjs';
import { useEffect, useMemo, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { MessageSquare } from 'lucide-react';
import { NexusTableBlock } from '@/components/note/embeds/NexusTableBlock';
import { useWorkspaceFiles } from '@/components/note/embed-config/useWorkspaceFiles';
import { WorkspaceFilePicker } from '@/components/note/embed-config/WorkspaceFilePicker';
import { useAuth } from '@/hooks/use-auth';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { loadGridDoc } from '@/lib/gridjson';
import { buildNoteEmbedCommentTargetKey } from '@/lib/note-comments';
import { dispatchNoteOpenCommentTarget } from '@/components/note/comments/noteCommentEvents';
import { useHasCommentThread } from '@/components/note/comments/useHasCommentThread';

function safeJsonParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeJsonPretty(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return '{}';
  }
}

export const NexusTableNode = Node.create({
  name: 'nexusTable',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      yDoc: null as Y.Doc | null,
    };
  },

  addAttributes() {
    return {
      raw: {
        default: '{}',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-nexus-table]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nexus-table': '1' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(({ editor, node, getPos }) => {
      const yDoc = this.options.yDoc as Y.Doc | null;
      const raw = String((node.attrs as any)?.raw || '');
      const parsed = safeJsonParse(raw) as any;
      const spec = parsed && typeof parsed === 'object' ? (parsed as any) : null;

      const { configured, ready, supabase, user } = useAuth();
      const supabaseMode = configured && !user?.isLocalAdmin;

      const { files: gridFiles, loading: filesLoading } = useWorkspaceFiles({ kinds: ['grid'] });
      const [showPicker, setShowPicker] = useState(false);
      const [showSources, setShowSources] = useState(false);
      const [showRaw, setShowRaw] = useState(false);
      const [rawDraft, setRawDraft] = useState(raw);

      const sources = useMemo(() => (Array.isArray(spec?.sources) ? (spec.sources as any[]) : []), [spec?.sources]);
      const mode = (spec?.mode === 'intersection' ? 'intersection' : 'union') as 'intersection' | 'union';

      const embedId = useMemo(() => {
        const id = String(spec?.id || '').trim();
        return id || 'unknown';
      }, [spec?.id]);
      const commentTargetKey = useMemo(() => buildNoteEmbedCommentTargetKey(embedId), [embedId]);
      const hasComment = useHasCommentThread(yDoc, commentTargetKey);

      const setRawAttr = (nextRaw: string) => {
        try {
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (typeof pos !== 'number') return;
          editor.commands.command(({ tr, dispatch }) => {
            tr.setNodeMarkup(pos, undefined, { ...(node.attrs as any), raw: nextRaw });
            if (dispatch) dispatch(tr);
            return true;
          });
        } catch {
          // ignore
        }
      };

      const setMode = (next: 'intersection' | 'union') => {
        const nextSpec = { ...(spec || {}), mode: next, sources: Array.isArray(spec?.sources) ? spec.sources : [] };
        setRawAttr(safeJsonPretty(nextSpec));
      };

      const removeSourceAt = (idx: number) => {
        const nextSources = sources.filter((_, i) => i !== idx);
        const nextSpec = { ...(spec || {}), sources: nextSources, mode };
        setRawAttr(safeJsonPretty(nextSpec));
      };

      const [addFileId, setAddFileId] = useState<string>('');
      const [addSheetId, setAddSheetId] = useState<string>('');
      const [addTableId, setAddTableId] = useState<string>('');
      const [gridMeta, setGridMeta] = useState<{ sheets: Array<{ id: string; name: string; tables: string[] }> } | null>(null);

      useEffect(() => {
        let cancelled = false;
        const load = async () => {
          setGridMeta(null);
          if (!addFileId) return;
          try {
            let md = '';
            if (!supabaseMode) {
              md = loadFileSnapshot(addFileId) || '';
            } else {
              if (!ready || !supabase) return;
              const { data, error } = await supabase.from('files').select('content').eq('id', addFileId).maybeSingle();
              if (error) throw error;
              md = String((data as any)?.content || '');
            }
            if (!md.trim()) return;
            const loaded = loadGridDoc(md);
            const sheets = (loaded.doc.sheets || []).map((s: any) => ({
              id: String(s.id || ''),
              name: String(s.name || 'Sheet'),
              tables: Array.isArray(s.grid?.tables) ? (s.grid.tables as any[]).map((t) => String(t.id || '')).filter(Boolean) : [],
            }));
            if (!cancelled) setGridMeta({ sheets });
            if (!cancelled) {
              const firstSheet = sheets[0]?.id || '';
              const firstTable = sheets[0]?.tables?.[0] || '';
              setAddSheetId((cur) => cur || firstSheet);
              setAddTableId((cur) => cur || firstTable);
            }
          } catch {
            if (!cancelled) setGridMeta(null);
          }
        };
        void load();
        return () => {
          cancelled = true;
        };
      }, [addFileId, supabaseMode, ready, supabase]);

      const addSource = () => {
        if (!addFileId.trim() || !addSheetId.trim() || !addTableId.trim()) return;
        const nextSources = [
          ...sources,
          { type: 'gridTable', fileId: addFileId.trim(), sheetId: addSheetId.trim(), tableId: addTableId.trim() },
        ];
        const nextSpec = { ...(spec || {}), sources: nextSources, mode };
        setRawAttr(safeJsonPretty(nextSpec));
        setAddFileId('');
        setAddSheetId('');
        setAddTableId('');
        setShowSources(false);
      };

      return (
        <NodeViewWrapper as="div" contentEditable={false} className="my-2" data-note-embed-id={embedId}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-600 truncate">
              Table embed · {sources.length} source{sources.length === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-2">
              {hasComment ? (
                <button
                  type="button"
                  className="mac-btn h-7"
                  title="Open comments"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatchNoteOpenCommentTarget({ targetKey: commentTargetKey, targetLabel: 'Embed · table' });
                  }}
                >
                  <MessageSquare size={14} />
                </button>
              ) : null}
              <button
                type="button"
                className={`mac-btn h-7 ${mode === 'intersection' ? 'mac-btn--primary' : ''}`}
                onClick={() => setMode('intersection')}
                title="Show only columns common to all sources"
              >
                Common
              </button>
              <button
                type="button"
                className={`mac-btn h-7 ${mode === 'union' ? 'mac-btn--primary' : ''}`}
                onClick={() => setMode('union')}
                title="Show common columns plus merged columns"
              >
                Common+Merged
              </button>
              <button type="button" className="mac-btn h-7" onClick={() => setShowSources((v) => !v)} title="Add/remove sources">
                Sources
              </button>
              <button
                type="button"
                className="mac-btn h-7"
                onClick={() => {
                  setRawDraft(raw);
                  setShowRaw((v) => !v);
                }}
                title="Edit raw table JSON"
              >
                JSON
              </button>
            </div>
          </div>

          {showSources ? (
            <div className="mb-2 rounded border border-slate-200 bg-white p-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">Sources</div>
                <button type="button" className="mac-btn h-7" onClick={() => setShowPicker(true)}>
                  Add source…
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {sources.length === 0 ? <div className="text-xs text-slate-500">No sources yet.</div> : null}
                {sources.map((s: any, idx: number) => (
                  <div key={`${idx}:${s?.fileId || ''}:${s?.sheetId || ''}:${s?.tableId || ''}`} className="flex items-center gap-2">
                    <div className="flex-1 text-[11px] font-mono text-slate-700 truncate">
                      {String(s?.fileId || '')} / {String(s?.sheetId || '')} / {String(s?.tableId || '')}
                    </div>
                    <button type="button" className="mac-btn h-7" onClick={() => removeSourceAt(idx)} title="Remove source">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <WorkspaceFilePicker
            open={showPicker}
            title="Add grid table source"
            files={gridFiles}
            loading={filesLoading}
            onPick={(f) => {
              setAddFileId(f.id);
              setShowPicker(false);
              setShowSources(true);
            }}
            onClose={() => setShowPicker(false)}
          />

          {/* Inline add form (appears after picking a file) */}
          {showSources && addFileId ? (
            <div className="mb-2 rounded border border-slate-200 bg-white p-2">
              <div className="text-xs font-semibold mb-2">Add source from file</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="text-[11px]">
                  <div className="opacity-70 mb-1">file</div>
                  <div className="font-mono text-[11px] truncate">{addFileId}</div>
                </div>
                <div>
                  <div className="text-[11px] opacity-70 mb-1">sheet</div>
                  <select
                    className="mac-field h-8 w-full"
                    value={addSheetId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setAddSheetId(next);
                      const sheet = gridMeta?.sheets.find((s) => s.id === next) || null;
                      const first = sheet?.tables?.[0] || '';
                      setAddTableId(first);
                    }}
                    disabled={!gridMeta}
                  >
                    <option value="">{gridMeta ? 'Select…' : 'Loading…'}</option>
                    {(gridMeta?.sheets || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-[11px] opacity-70 mb-1">table</div>
                  <select
                    className="mac-field h-8 w-full"
                    value={addTableId}
                    onChange={(e) => setAddTableId(e.target.value)}
                    disabled={!gridMeta || !addSheetId}
                  >
                    <option value="">{gridMeta ? 'Select…' : 'Loading…'}</option>
                    {(gridMeta?.sheets.find((s) => s.id === addSheetId)?.tables || []).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {gridMeta ? (
                <div className="mt-2 text-[11px] text-slate-600">
                  Detected {gridMeta.sheets.length} sheet(s).
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className="mac-btn mac-btn--primary h-7" onClick={addSource}>
                  Add
                </button>
                <button
                  type="button"
                  className="mac-btn h-7"
                  onClick={() => {
                    setAddFileId('');
                    setAddSheetId('');
                    setAddTableId('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {showRaw ? (
            <div className="mb-2 rounded border border-slate-200 bg-white p-2">
              <textarea
                className="w-full h-[140px] font-mono text-[12px] outline-none"
                value={rawDraft}
                onChange={(e) => setRawDraft(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="mac-btn mac-btn--primary h-7"
                  onClick={() => {
                    const next = safeJsonParse(rawDraft);
                    if (!next) return;
                    setRawAttr(safeJsonPretty(next));
                    setShowRaw(false);
                  }}
                >
                  Apply
                </button>
                <button type="button" className="mac-btn h-7" onClick={() => setShowRaw(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {yDoc ? <NexusTableBlock hostDoc={yDoc} raw={raw} /> : null}
        </NodeViewWrapper>
      );
    });
  },
});

