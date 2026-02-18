'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLEditorSnapshot } from 'tldraw';
import type * as Y from 'yjs';
import { useHtmlThemeOverride } from '@/hooks/use-html-theme-override';
import type { VisionDoc } from '@/lib/visionjson';
import { VisionCanvas } from '@/components/vision/v2/VisionCanvas';
import { MarkdownPopup } from '@/components/vision/v2/shell/MarkdownPopup';
import { TldrawHeaderActions } from '@/components/vision/v2/shell/TldrawHeaderActions';
import { useCardCount } from '@/components/vision/v2/hooks/useCardCount';
import { CommentsPanel } from '@/components/CommentsPanel';
import { deleteAnchor, getThread, isVisionPointCommentTargetKey } from '@/lib/node-comments';

export function VisionEditor({
  fileId,
  title,
  statusLabel,
  yDoc,
  doc,
  onChange,
  onBack,
  rawMarkdownPreview,
  rawMarkdownChars,
  supabaseMode,
  userId,
}: {
  fileId: string;
  folderId: string | null;
  title?: string;
  statusLabel?: string;
  yDoc: Y.Doc;
  doc: VisionDoc;
  onChange: (next: VisionDoc) => void;
  onBack?: () => void;
  rawMarkdownPreview?: string;
  rawMarkdownChars?: number;
  supabaseMode: boolean;
  supabase: SupabaseClient | null;
  userId: string | null;
}) {
  useHtmlThemeOverride('vision');

  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const [markdownOpen, setMarkdownOpen] = useState(false);
  useCardCount(doc); // keep memoized for future use (e.g. status line); doesn't render now.

  const [activeTool, setActiveTool] = useState<'select' | 'comment'>('select');
  const [commentPanel, setCommentPanel] = useState<{
    targetKey: string | null;
    targetLabel?: string;
    scrollToThreadId?: string;
  }>({ targetKey: null });

  const cleanupDanglingVisionPoint = useCallback(
    (targetKey: string | null) => {
      const k = String(targetKey || '').trim();
      if (!k) return;
      if (!isVisionPointCommentTargetKey(k)) return;
      const thread = getThread(yDoc, k);
      if (thread) return;
      // If the user clicked to "add comment" but never created a thread, drop the anchor so we don't leave orphan pins.
      deleteAnchor(yDoc, k);
    },
    [yDoc],
  );

  // When entering comment mode, keep tldraw tool stable (avoid accidental shape creation).
  useEffect(() => {
    if (activeTool !== 'comment') return;
    try {
      canvasEditor?.setCurrentTool?.('select' as any);
    } catch {
      // ignore
    }
  }, [activeTool, canvasEditor]);

  return (
    <main className="h-screen w-screen bg-white text-black">
      <div className="h-12 px-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="h-8 px-2 border flex items-center gap-2 bg-white"
            onClick={onBack}
            title="Back to workspace"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Workspace</span>
          </button>
          <TldrawHeaderActions editor={canvasEditor} />
          <div className="font-semibold truncate">{title || 'Vision'}</div>
          <div className="text-xs opacity-70 whitespace-nowrap">{statusLabel || ''}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={[
              'h-8 px-2 border text-sm',
              activeTool === 'comment' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white',
            ].join(' ')}
            onClick={() => {
              setActiveTool((t) => {
                const next = t === 'comment' ? 'select' : 'comment';
                if (next !== 'comment') {
                  cleanupDanglingVisionPoint(commentPanel.targetKey);
                  setCommentPanel({ targetKey: null });
                }
                return next;
              });
            }}
            title={activeTool === 'comment' ? 'Exit comment mode' : 'Add comments'}
          >
            Comment
          </button>
          <button type="button" className="h-8 px-2 border bg-white text-sm" onClick={() => setMarkdownOpen(true)} title="Open markdown preview">
            Markdown
          </button>
        </div>
      </div>

      <div className="absolute inset-0 top-12">
        <div className="h-full w-full overflow-hidden">
          <VisionCanvas
            fileId={fileId}
            sessionStorageKey={`vision:tldraw:canvas:session:${fileId}`}
            initialSnapshot={((doc as any).tldraw as Partial<TLEditorSnapshot>) || null}
            onChangeSnapshot={(snapshot) => {
              onChange({ version: 2, tldraw: snapshot, updatedAt: new Date().toISOString() } as any);
            }}
            onReadyEditor={(ed) => setCanvasEditor(ed)}
            yDoc={yDoc}
            activeTool={activeTool}
            activeCommentTargetKey={commentPanel.targetKey}
            onOpenComments={(info) => {
              setActiveTool('comment');
              setCommentPanel({
                targetKey: info.targetKey,
                targetLabel: info.targetLabel,
                scrollToThreadId: info.scrollToThreadId,
              });
            }}
          />
        </div>
      </div>

      {activeTool === 'comment' ? (
        <div className="fixed right-3 top-14 bottom-3 z-[9500] pointer-events-none">
          <div className="h-full pointer-events-auto">
            <CommentsPanel
              key={commentPanel.targetKey || 'comments'}
              doc={yDoc}
              selectedTargetKey={commentPanel.targetKey}
              selectedTargetLabel={commentPanel.targetLabel}
              scrollToThreadId={commentPanel.scrollToThreadId || null}
              onActiveTargetKeyChange={(nextKey) => {
                cleanupDanglingVisionPoint(commentPanel.targetKey);
                setCommentPanel((p) => ({ ...p, targetKey: nextKey, scrollToThreadId: undefined }));
              }}
              onClose={() => {
                cleanupDanglingVisionPoint(commentPanel.targetKey);
                setCommentPanel({ targetKey: null });
                setActiveTool('select');
              }}
            />
          </div>
        </div>
      ) : null}

      <MarkdownPopup
        isOpen={markdownOpen}
        onClose={() => setMarkdownOpen(false)}
        rawMarkdownPreview={rawMarkdownPreview}
        rawMarkdownChars={rawMarkdownChars}
        supabaseMode={supabaseMode}
        userId={userId}
      />
    </main>
  );
}

