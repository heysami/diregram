'use client';

import type * as Y from 'yjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { MessageSquare } from 'lucide-react';
import { NexusEmbedBlock } from '@/components/note/embeds/NexusEmbedBlock';
import { useWorkspaceFiles } from '@/components/note/embed-config/useWorkspaceFiles';
import { EmbedLinkModal } from '@/components/note/embed-config/EmbedLinkModal';
import { VisionCardLinkModal } from '@/components/note/embed-config/VisionCardLinkModal';
import { buildNoteEmbedCommentTargetKey } from '@/lib/note-comments';
import { isVisionCardEmbedKind, normalizeNexusEmbedKind } from '@/lib/nexus-embed-kind';
import { dispatchNoteOpenCommentTarget } from '@/components/note/comments/noteCommentEvents';
import { useHasCommentThread } from '@/components/note/comments/useHasCommentThread';
import { consumeVisionCardPendingConfig, shouldAutoOpenVisionCardConfig } from '@/lib/vision-card-embed-config';

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

export const NexusEmbedNode = Node.create({
  name: 'nexusEmbed',
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
    return [{ tag: 'div[data-nexus-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nexus-embed': '1' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(({ editor, node, getPos }) => {
      const yDoc = this.options.yDoc as Y.Doc | null;
      const raw = String((node.attrs as any)?.raw || '');
      const parsed = safeJsonParse(raw) as any;
      const spec = parsed && typeof parsed === 'object' ? (parsed as any) : null;

      const { files, loading } = useWorkspaceFiles({ kinds: ['diagram', 'vision'] });
      const [showLinkModal, setShowLinkModal] = useState(false);
      const [showVisionCardModal, setShowVisionCardModal] = useState(false);
      const [showRaw, setShowRaw] = useState(false);
      const [rawDraft, setRawDraft] = useState(raw);

      const embedId = useMemo(() => {
        const id = String(spec?.id || '').trim();
        return id || 'unknown';
      }, [spec?.id]);

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

      const fileId = useMemo(() => {
        const fid = spec?.fileId;
        return typeof fid === 'string' && fid.trim().length ? fid.trim() : null;
      }, [spec?.fileId]);
      const cardId = useMemo(() => {
        const cid = spec?.cardId;
        return typeof cid === 'string' && cid.trim().length ? cid.trim() : null;
      }, [spec?.cardId]);

      const embedKind = useMemo(() => normalizeNexusEmbedKind(spec?.kind), [spec?.kind]);
      const isVisionCard = embedKind === 'visionCard';

      // If inserted via slash as a "vision card" embed, auto-open configuration once.
      const didAutoOpenVisionCardRef = useRef(false);
      useEffect(() => {
        const eligibleKind = isVisionCardEmbedKind(spec?.kind);
        if (!eligibleKind) return;
        const shouldOpen = shouldAutoOpenVisionCardConfig({
          spec,
          didAutoOpen: didAutoOpenVisionCardRef.current,
          fileId,
          cardId,
        });
        if (!shouldOpen) return;
        didAutoOpenVisionCardRef.current = true;
        // Clear the "auto-open once" flag immediately so remounts don't re-open the modal.
        try {
          const next = consumeVisionCardPendingConfig(spec);
          if (next) setRawAttr(safeJsonPretty(next));
        } catch {
          // ignore
        }
        setShowVisionCardModal(true);
      }, [spec?.kind, spec?.pendingConfig, fileId, cardId, embedId]);

      const commentTargetKey = useMemo(() => buildNoteEmbedCommentTargetKey(embedId), [embedId]);
      const hasComment = useHasCommentThread(yDoc, commentTargetKey);

      const unlink = () => {
        const next = { ...(spec || {}) };
        delete next.fileId;
        if (isVisionCard) delete next.cardId;
        // Best-effort: keep kind/ref settings, just use local doc.
        setRawAttr(safeJsonPretty(next));
      };

      return (
        <NodeViewWrapper as="div" contentEditable={false} className="my-2" data-note-embed-id={embedId}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-600 truncate">
              Embed {embedKind ? `· ${embedKind}` : ''}{' '}
              {fileId ? (
                <span className="font-mono opacity-70">linked:{fileId.slice(0, 8)}…</span>
              ) : (
                <span className="opacity-70">local</span>
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
                    dispatchNoteOpenCommentTarget({ targetKey: commentTargetKey, targetLabel: `Embed · ${String(spec?.kind || 'embed')}` });
                  }}
                >
                  <MessageSquare size={14} />
                </button>
              ) : null}
              <button
                type="button"
                className="mac-btn h-7"
                onClick={() => (isVisionCard ? setShowVisionCardModal(true) : setShowLinkModal(true))}
                title="Link this embed…"
              >
                Link…
              </button>
              {fileId ? (
                <button type="button" className="mac-btn h-7" onClick={unlink} title="Use the current note doc as the data source">
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
                title="Edit raw embed JSON"
              >
                JSON
              </button>
            </div>
          </div>

          {showRaw ? (
            <div className="mb-2 rounded border border-slate-200 bg-white p-2">
              <textarea
                className="w-full h-[120px] font-mono text-[12px] outline-none"
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
              <div className="mt-2 text-[11px] text-slate-500">
                Tip: set `fileId` to link, and `ref`/`rootFocusId` to control what’s shown.
              </div>
            </div>
          ) : null}

          <EmbedLinkModal
            open={showLinkModal}
            files={files}
            loadingFiles={loading}
            initialFileId={fileId}
            initialKind={(embedKind === 'systemflow' ? 'systemflow' : embedKind === 'dataObjects' ? 'dataObjects' : 'canvas') as any}
            initialRootFocusId={typeof spec?.rootFocusId === 'string' ? spec.rootFocusId : undefined}
            initialSystemFlowRef={typeof spec?.ref === 'string' ? spec.ref : undefined}
            onClose={() => setShowLinkModal(false)}
            onApply={(res) => {
              const base = { ...(spec || {}) };
              if (!base.id) base.id = `embed-${crypto.randomUUID()}`;
              if (res.fileId) base.fileId = res.fileId;
              else delete base.fileId;

              if (res.kind === 'systemflow') {
                base.kind = 'systemflow';
                base.ref = res.ref;
                delete base.rootFocusId;
                delete base.cardId;
              } else if (res.kind === 'dataObjects') {
                base.kind = 'dataObjects';
                delete base.ref;
                delete base.rootFocusId;
                delete base.cardId;
              } else {
                // canvas or flow subtree are both rendered via NexusCanvas
                base.kind = 'canvas';
                delete base.ref;
                delete base.cardId;
                if ((res as any).rootFocusId) base.rootFocusId = (res as any).rootFocusId;
                else delete base.rootFocusId;
              }
              setRawAttr(safeJsonPretty(base));
              setShowLinkModal(false);
            }}
          />

          <VisionCardLinkModal
            open={showVisionCardModal}
            files={files}
            loadingFiles={loading}
            initialFileId={fileId}
            initialCardId={cardId || undefined}
            onClose={() => setShowVisionCardModal(false)}
            onApply={(res) => {
              const base = { ...(spec || {}) };
              if (!base.id) base.id = `embed-${crypto.randomUUID()}`;
              base.kind = 'visionCard';
              base.fileId = res.fileId;
              base.cardId = res.cardId;
              delete base.ref;
              delete base.rootFocusId;
              setRawAttr(safeJsonPretty(base));
              setShowVisionCardModal(false);
            }}
          />

          {yDoc ? <NexusEmbedBlock hostDoc={yDoc} raw={raw} /> : null}
        </NodeViewWrapper>
      );
    });
  },
});

