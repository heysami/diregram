'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Tldraw, TldrawUiButton, useValue, type Editor, type TLEditorSnapshot } from 'tldraw';
import type * as Y from 'yjs';
import { useTldrawVisionCanvasController } from '@/components/vision/v2/tldraw/useTldrawVisionCanvasController';
import { VisionCardEditorModal } from '@/components/vision/v2/VisionCardEditorModal';
import {
  buildVisionPointCommentTargetKey,
  getAllAnchors,
  getAllThreads,
  getThread,
  observeComments,
  upsertAnchor,
  type CommentAnchor,
  type CommentThread,
} from '@/lib/node-comments';

function SelectedCardEditButton({ editor, onEdit }: { editor: Editor; onEdit: (cardId: string) => void }) {
  const info = useValue(
    'vision.selectedCardEditButton',
    () => {
      const ids = editor.getSelectedShapeIds();
      if (!ids || ids.length !== 1) return null;
      const id = ids[0];
      const shape: any = (editor as any).getShape?.(id as any);
      if (!shape || String(shape.type || '') !== 'nxcard') return null;
      const b: any = (editor as any).getShapePageBounds?.(id as any);
      if (!b) return null;
      const pt: any = editor.pageToScreen({ x: Number(b.x) + Number(b.w), y: Number(b.y) } as any);
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
      return { id: String(id), x: Number(pt.x) + 8, y: Number(pt.y) - 10 };
    },
    [editor],
  );

  if (!info) return null;
  return (
    <div className="fixed z-[9000]" style={{ left: info.x, top: info.y }}>
      <TldrawUiButton
        type="tool"
        onClick={(e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch {
            // ignore
          }
          onEdit(info.id);
        }}
        title="Open vector editor"
      >
        Edit
      </TldrawUiButton>
    </div>
  );
}

export function VisionCanvas({
  fileId,
  initialSnapshot,
  onChangeSnapshot,
  sessionStorageKey,
  onReadyEditor,
  yDoc,
  activeTool,
  activeCommentTargetKey,
  onOpenComments,
  onSaveTemplateFile,
  templateSourceLabel,
  globalTemplatesEnabled,
}: {
  fileId: string;
  initialSnapshot: Partial<TLEditorSnapshot> | null;
  onChangeSnapshot: (snapshot: Partial<TLEditorSnapshot>) => void;
  sessionStorageKey: string;
  onReadyEditor?: (editor: Editor | null) => void;
  yDoc: Y.Doc;
  activeTool: 'select' | 'comment';
  activeCommentTargetKey: string | null;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;
  onSaveTemplateFile?: (res: { name: string; content: string; scope?: 'project' | 'account' }) => Promise<void> | void;
  templateSourceLabel?: string;
  globalTemplatesEnabled?: boolean;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [commentsTick, setCommentsTick] = useState(0);

  // Deep-link focus: /editor?file=<visionFileId>#<cardId>
  const lastHashRef = useRef<string>('');
  useEffect(() => {
    if (!editor) return;
    const rawHash = typeof window !== 'undefined' ? String(window.location.hash || '') : '';
    let cardId = rawHash.replace(/^#/, '').trim();
    try {
      cardId = decodeURIComponent(cardId);
    } catch {
      // ignore
    }
    if (!cardId) return;
    if (cardId === lastHashRef.current) return;
    lastHashRef.current = cardId;
    try {
      const shape: any = (editor as any).getShape?.(cardId as any) || null;
      if (!shape || String(shape.type || '') !== 'nxcard') return;
      (editor as any).setSelectedShapes?.([cardId as any]);
      (editor as any).zoomToSelection?.();
    } catch {
      // ignore
    }
  }, [editor, fileId]);

  const { store, shapeUtils, uiOverrides, components, onMount } = useTldrawVisionCanvasController({
    initialSnapshot,
    sessionStorageKey,
    onChange: ({ snapshot }) => onChangeSnapshot(snapshot),
    onMountEditor: (ed) => {
      setEditor(ed);
      onReadyEditor?.(ed);
    },
  });

  useEffect(() => {
    return observeComments(yDoc, () => setCommentsTick((t) => t + 1));
  }, [yDoc]);

  // In comment mode, clicking the canvas creates a "point target" at the clicked page coords.
  useEffect(() => {
    if (!editor) return;
    const container: any = (editor as any).getContainer?.() || null;
    const el: HTMLElement | null = container && container instanceof HTMLElement ? container : null;
    if (!el) return;
    if (activeTool !== 'comment') return;

    const onPointerDown = (e: PointerEvent) => {
      try {
        if (e.button !== 0) return;
        if (openCardId) return;
        const t = e.target as HTMLElement | null;
        if (t && typeof (t as any).closest === 'function') {
          // Ignore clicks on tldraw UI chrome (toolbar, style panel, etc.)
          if (t.closest('.tlui')) return;
          // Ignore clicks on form controls.
          if (t.closest('button,input,textarea,select,[contenteditable="true"]')) return;
          // Ignore our own pins.
          if (t.closest('[data-vision-comment-pin="1"]')) return;
        }

        // Claim the event before tldraw does.
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();

        const rect = el.getBoundingClientRect();
        const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const pagePoint: any = editor.screenToPage(screenPoint as any);
        const x = Number((pagePoint as any)?.x);
        const y = Number((pagePoint as any)?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        const id =
          typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
            ? (crypto as any).randomUUID()
            : `p-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const targetKey = buildVisionPointCommentTargetKey(id);
        const pageId = String((editor as any).getCurrentPageId?.() || '');
        if (!pageId) return;

        const anchor: CommentAnchor = { kind: 'visionPoint', pageId, x, y };
        upsertAnchor(yDoc, targetKey, anchor);

        const label = `x:${Math.round(x)} y:${Math.round(y)}`;
        onOpenComments?.({ targetKey, targetLabel: label });
      } catch {
        // ignore
      }
    };

    // Capture phase so we can stopPropagation before tldraw handlers.
    el.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
    };
  }, [activeTool, editor, onOpenComments, openCardId, yDoc]);

  const commentPins = useValue(
    'vision.commentPins',
    () => {
      if (!editor) return [];

      // Keep computed value reactive to camera / viewport changes.
      editor.getCamera();

      const anchors = getAllAnchors(yDoc);
      const threads = getAllThreads(yDoc);
      const container: any = (editor as any).getContainer?.() || null;
      const rect = container?.getBoundingClientRect?.();
      if (!rect) return [];
      const currentPageId = String((editor as any).getCurrentPageId?.() || '');
      if (!currentPageId) return [];

      const pins: Array<{
        targetKey: string;
        left: number;
        top: number;
        thread: CommentThread | null;
        count: number;
        show: boolean;
      }> = [];

      Object.entries(anchors).forEach(([targetKey, a]) => {
        if (!a || a.kind !== 'visionPoint') return;
        if (a.pageId !== currentPageId) return;

        const thread = threads[targetKey] || null;
        const isActive = String(activeCommentTargetKey || '') === targetKey;
        const show = !!thread || isActive;
        if (!show) return;

        const sp: any = editor.pageToScreen({ x: a.x, y: a.y } as any);
        const sx = Number(sp?.x);
        const sy = Number(sp?.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
        const left = rect.left + sx;
        const top = rect.top + sy;
        const count = thread ? 1 + (thread.replies?.length || 0) : 0;
        pins.push({ targetKey, left, top, thread, count, show: true });
      });

      // Stable render order.
      pins.sort((a, b) => a.targetKey.localeCompare(b.targetKey));
      return pins;
    },
    [editor, yDoc, commentsTick, activeCommentTargetKey],
  );

  const overlay = useMemo(() => {
    return (
      <>
        {editor && !openCardId ? <SelectedCardEditButton editor={editor} onEdit={(id) => setOpenCardId(id)} /> : null}
        {/* Comment pins (fixed overlay; positions updated via editor camera changes) */}
        {editor
          ? commentPins.map((p) => {
              const hasComment = !!p.thread;
              const count = p.count;
              return (
                <button
                  key={p.targetKey}
                  type="button"
                  data-vision-comment-pin="1"
                  className="fixed h-6 min-w-6 px-1.5 rounded-full bg-slate-900 text-white text-[11px] shadow-sm hover:bg-slate-800 z-[9200]"
                  style={{
                    left: p.left,
                    top: p.top,
                    transform: 'translate(-50%, -50%)',
                  }}
                  title={hasComment ? 'Open comment' : 'Add comment'}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const thread = getThread(yDoc, p.targetKey);
                    onOpenComments?.({
                      targetKey: p.targetKey,
                      targetLabel: thread?.targetLabel || 'Canvas',
                      ...(thread ? { scrollToThreadId: thread.id } : {}),
                    });
                  }}
                >
                  {hasComment ? count : '+'}
                </button>
              );
            })
          : null}
        {openCardId && editor ? (
          <VisionCardEditorModal
            fileId={fileId}
            cardId={openCardId}
            editor={editor}
            onClose={() => setOpenCardId(null)}
            onSaveTemplateFile={onSaveTemplateFile}
            templateSourceLabel={templateSourceLabel}
            globalTemplatesEnabled={globalTemplatesEnabled}
          />
        ) : null}
      </>
    );
  }, [openCardId, editor, fileId, commentPins, yDoc, onOpenComments, onSaveTemplateFile, templateSourceLabel, globalTemplatesEnabled]);

  return (
    <div className="w-full h-full relative">
      <Tldraw
        store={store}
        shapeUtils={shapeUtils}
        onMount={onMount}
        overrides={uiOverrides}
        components={components}
        options={{ maxPages: 1 } as any}
      />
      {overlay}
    </div>
  );
}

