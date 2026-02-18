'use client';

import type * as Y from 'yjs';
import { useMemo, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { MessageSquare } from 'lucide-react';
import { NexusTestBlock } from '@/components/note/embeds/NexusTestBlock';
import { useWorkspaceFiles } from '@/components/note/embed-config/useWorkspaceFiles';
import { TestFileLinkModal } from '@/components/note/embed-config/TestFileLinkModal';
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

export const NexusTestNode = Node.create({
  name: 'nexusTest',
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
    return [{ tag: 'div[data-nexus-test]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nexus-test': '1' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(({ editor, node, getPos }) => {
      const yDoc = this.options.yDoc as Y.Doc | null;
      const raw = String((node.attrs as any)?.raw || '');
      const parsed = safeJsonParse(raw) as any;
      const spec = parsed && typeof parsed === 'object' ? (parsed as any) : null;
      const testFileId = useMemo(() => {
        const fid = spec?.testFileId;
        return typeof fid === 'string' && fid.trim().length ? fid.trim() : null;
      }, [spec?.testFileId]);

      const { files, loading } = useWorkspaceFiles({ kinds: ['test'] });
      const [showTestFileModal, setShowTestFileModal] = useState(false);
      const [showRaw, setShowRaw] = useState(false);
      const [rawDraft, setRawDraft] = useState(raw);

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

      const unlink = () => {
        const next = { ...(spec || {}) };
        delete next.testFileId;
        delete next.fileId;
        delete next.testId;
        setRawAttr(safeJsonPretty(next));
      };

      return (
        <NodeViewWrapper as="div" contentEditable={false} className="my-2" data-note-embed-id={embedId}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-600 truncate">
              Test{' '}
              {testFileId ? (
                <span className="font-mono opacity-70">file:{testFileId.slice(0, 8)}…</span>
              ) : (
                <span className="opacity-70">unset</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasComment ? (
                <button
                  type="button"
                  className="mac-btn h-7"
                  title="Open comments"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatchNoteOpenCommentTarget({ targetKey: commentTargetKey, targetLabel: 'Embed · test' });
                  }}
                >
                  <MessageSquare size={14} />
                </button>
              ) : null}
              <button type="button" className="mac-btn h-7" onClick={() => setShowTestFileModal(true)} title="Link a test file (recommended)">
                Link test…
              </button>
              {testFileId ? (
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
              >
                JSON
              </button>
            </div>
          </div>

          {showRaw ? (
            <div className="mb-2 rounded border border-slate-200 bg-white p-2">
              <textarea className="w-full h-[120px] font-mono text-[12px] outline-none" value={rawDraft} onChange={(e) => setRawDraft(e.target.value)} />
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

          <TestFileLinkModal
            open={showTestFileModal}
            files={files}
            loadingFiles={loading}
            initialTestFileId={testFileId}
            onClose={() => setShowTestFileModal(false)}
            onApply={(res) => {
              const base = { ...(spec || {}) };
              if (!base.id) base.id = `test-${crypto.randomUUID()}`;
              base.testFileId = res.testFileId;
              delete base.testId;
              delete base.fileId;
              setRawAttr(safeJsonPretty(base));
              setShowTestFileModal(false);
            }}
          />

          {yDoc ? <NexusTestBlock hostDoc={yDoc} raw={raw} /> : null}
        </NodeViewWrapper>
      );
    });
  },
});

