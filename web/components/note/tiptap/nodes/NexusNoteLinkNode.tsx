'use client';

import type * as Y from 'yjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ExternalLink } from 'lucide-react';
import { useWorkspaceFiles } from '@/components/note/embed-config/useWorkspaceFiles';
import { NoteLinkModal } from '@/components/note/embed-config/NoteLinkModal';

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

export const NexusNoteLinkNode = Node.create({
  name: 'nexusNoteLink',
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
    return [{ tag: 'div[data-nexus-note-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nexus-note-link': '1' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(({ editor, node, getPos }) => {
      const raw = String((node.attrs as any)?.raw || '');
      const parsed = safeJsonParse(raw) as any;
      const spec = parsed && typeof parsed === 'object' ? (parsed as any) : null;

      const { files, loading } = useWorkspaceFiles({ kinds: ['note'] });
      const [showLinkModal, setShowLinkModal] = useState(false);
      const [showRaw, setShowRaw] = useState(false);
      const [rawDraft, setRawDraft] = useState(raw);

      const fileId = useMemo(() => {
        const fid = spec?.fileId;
        return typeof fid === 'string' && fid.trim().length ? fid.trim() : null;
      }, [spec?.fileId]);
      const blockId = useMemo(() => {
        const bid = spec?.blockId;
        return typeof bid === 'string' && bid.trim().length ? bid.trim() : null;
      }, [spec?.blockId]);
      const label = useMemo(() => {
        const t = spec?.label;
        return typeof t === 'string' && t.trim().length ? t.trim() : null;
      }, [spec?.label]);

      const fileLabel = useMemo(() => {
        if (!fileId) return 'Unlinked';
        const f = files.find((x) => x.id === fileId) || null;
        return f ? `${f.name}` : fileId;
      }, [fileId, files]);

      const href = useMemo(() => {
        if (!fileId) return '';
        return `note:${fileId}${blockId ? `#${blockId}` : ''}`;
      }, [fileId, blockId]);

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

      const unlink = () => {
        const next = { ...(spec || {}) };
        delete next.fileId;
        delete next.blockId;
        delete next.label;
        setRawAttr(safeJsonPretty(next));
      };

      // Auto-open picker when inserted via slash.
      const didAutoOpenRef = useRef(false);
      useEffect(() => {
        if (didAutoOpenRef.current) return;
        if (!fileId) {
          didAutoOpenRef.current = true;
          setShowLinkModal(true);
        }
      }, [fileId]);

      return (
        <NodeViewWrapper as="div" contentEditable={false} className="my-2">
          <div className="rounded border border-slate-200 bg-white">
            <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-600 truncate">
                  Note link · <span className="font-semibold">{fileLabel}</span>
                  {blockId ? <span className="font-mono opacity-70">#{blockId}</span> : null}
                </div>
                {label ? <div className="text-xs font-semibold truncate">{label}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="mac-btn h-7" onClick={() => setShowLinkModal(true)} title="Choose note…">
                  Link…
                </button>
                {fileId ? (
                  <a
                    className="mac-btn h-7 inline-flex items-center gap-1"
                    href={href}
                    title="Open linked note"
                    onMouseDown={(e) => {
                      // Prevent ProseMirror selection changes stealing focus before click handler runs.
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <ExternalLink size={14} />
                    Open
                  </a>
                ) : null}
                {fileId ? (
                  <button type="button" className="mac-btn h-7" onClick={unlink}>
                    Unlink
                  </button>
                ) : null}
                <button
                  type="button"
                  className="mac-btn h-7"
                  onClick={() => {
                    setRawDraft(raw);
                    setShowRaw((v) => !v);
                  }}
                  title="Edit raw JSON"
                >
                  JSON
                </button>
              </div>
            </div>

            {showRaw ? (
              <div className="p-3">
                <textarea className="w-full h-[140px] font-mono text-[12px] outline-none" value={rawDraft} onChange={(e) => setRawDraft(e.target.value)} />
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
            ) : (
              <div className="px-3 py-2 text-xs text-slate-600">
                {fileId ? (
                  <span className="font-mono">{href}</span>
                ) : (
                  <span className="opacity-70">Choose a note file to create a deep link.</span>
                )}
              </div>
            )}
          </div>

          <NoteLinkModal
            open={showLinkModal}
            files={files}
            loadingFiles={loading}
            initialFileId={fileId}
            initialBlockId={blockId}
            onClose={() => setShowLinkModal(false)}
            onApply={(res) => {
              const base = { ...(spec || {}) };
              if (!base.id) base.id = `noteLink-${crypto.randomUUID()}`;
              base.fileId = res.fileId;
              if (typeof res.blockId === 'string' && res.blockId.trim()) base.blockId = res.blockId.trim();
              else delete base.blockId;
              setRawAttr(safeJsonPretty(base));
              setShowLinkModal(false);
            }}
          />
        </NodeViewWrapper>
      );
    });
  },
});

