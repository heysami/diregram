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
import { upsertTemplateHeader, type NexusTemplateHeader } from '@/lib/nexus-template';
import { InsertFromTemplateModal, type WorkspaceFileLite as TemplateWorkspaceFileLite } from '@/components/templates/InsertFromTemplateModal';
import { createShapeId } from '@tldraw/tlschema';

export function VisionEditor({
  fileId,
  folderId,
  title,
  statusLabel,
  yDoc,
  doc,
  onChange,
  onBack,
  rawMarkdownPreview,
  rawMarkdownChars,
  supabaseMode,
  supabase,
  userId,
  templateScope,
  onTemplateScopeChange,
  templateFiles,
  loadTemplateMarkdown,
  onSaveTemplateFile,
  templateSourceLabel,
  globalTemplatesEnabled,
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
  templateScope?: 'project' | 'account' | 'global';
  onTemplateScopeChange?: (next: 'project' | 'account' | 'global') => void;
  templateFiles?: TemplateWorkspaceFileLite[];
  loadTemplateMarkdown?: (fileId: string) => Promise<string>;
  onSaveTemplateFile?: (res: { name: string; content: string; scope?: 'project' | 'account' }) => Promise<void> | void;
  templateSourceLabel?: string;
  globalTemplatesEnabled?: boolean;
}) {
  useHtmlThemeOverride('vision');

  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const [markdownOpen, setMarkdownOpen] = useState(false);
  const [insertCardTemplateOpen, setInsertCardTemplateOpen] = useState(false);
  useCardCount(doc); // keep memoized for future use (e.g. status line); doesn't render now.

  const [activeTool, setActiveTool] = useState<'select' | 'comment'>('select');
  const [commentPanel, setCommentPanel] = useState<{
    targetKey: string | null;
    targetLabel?: string;
    scrollToThreadId?: string;
  }>({ targetKey: null });

  type VisionCardTemplateV1 = {
    version: 1;
    props: { w: number; h: number; title?: string; thumb?: string; tileSnapshot?: string };
  };

  const parseVisionCardTemplate = (rendered: string): VisionCardTemplateV1 => {
    const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
    const m = src.match(/```nexus-vision-card[ \t]*\n([\s\S]*?)\n```/);
    const body = (m ? m[1] : src).trim();
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid vision card template payload.');
    const r = parsed as Record<string, unknown>;
    if (r.version !== 1) throw new Error('Unsupported vision card template version.');
    const props = (r.props as any) || {};
    const w = Number(props.w);
    const h = Number(props.h);
    if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error('Invalid card size.');
    return {
      version: 1,
      props: {
        w: Math.max(80, Math.min(1600, w)),
        h: Math.max(80, Math.min(1200, h)),
        title: typeof props.title === 'string' ? props.title : undefined,
        thumb: typeof props.thumb === 'string' ? props.thumb : undefined,
        tileSnapshot: typeof props.tileSnapshot === 'string' ? props.tileSnapshot : undefined,
      },
    };
  };

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
            className="h-8 px-2 border bg-white text-sm"
            disabled={!templateFiles || !loadTemplateMarkdown || (templateFiles || []).length === 0 || !canvasEditor}
            title={!canvasEditor ? 'Canvas not ready yet' : (templateFiles || []).length === 0 ? 'No templates yet.' : 'Create a new card from a template'}
            onClick={() => setInsertCardTemplateOpen(true)}
          >
            Card template…
          </button>
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

      <InsertFromTemplateModal
        open={insertCardTemplateOpen}
        title="New card from template"
        files={templateFiles || []}
        loadMarkdown={loadTemplateMarkdown || (async () => '')}
        accept={{ targetKind: 'vision', mode: 'appendFragment', fragmentKind: 'visionCard' }}
        scope={
          templateScope && onTemplateScopeChange
            ? {
                value: templateScope,
                options: [
                  { id: 'project', label: 'This project' },
                  { id: 'account', label: 'Account' },
                  ...(globalTemplatesEnabled ? [{ id: 'global', label: 'Global' }] : []),
                ],
                onChange: (next) => onTemplateScopeChange(next as any),
              }
            : undefined
        }
        onClose={() => setInsertCardTemplateOpen(false)}
        onInsert={async ({ content }) => {
          if (!canvasEditor) throw new Error('Canvas not ready.');
          const tpl = parseVisionCardTemplate(content);
          let x = 0;
          let y = 0;
          try {
            const b = canvasEditor.getViewportPageBounds();
            x = b.x + b.w / 2 - tpl.props.w / 2;
            y = b.y + b.h / 2 - tpl.props.h / 2;
          } catch {
            // ignore
          }
          const id = createShapeId();
          canvasEditor.createShape({
            id: id as any,
            type: 'nxcard' as any,
            x,
            y,
            props: { ...tpl.props },
          } as any);
          canvasEditor.setSelectedShapes([id as any]);
        }}
      />

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
            onSaveTemplateFile={onSaveTemplateFile}
            templateSourceLabel={templateSourceLabel}
            globalTemplatesEnabled={globalTemplatesEnabled}
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

