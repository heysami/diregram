'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLEditorSnapshot } from 'tldraw';
import type * as Y from 'yjs';
import { useHtmlThemeOverride } from '@/hooks/use-html-theme-override';
import type { VisionDoc } from '@/lib/visionjson';
import {
  defaultVisionDesignSystem,
  normalizeVisionDesignSystem,
  type VisionDesignSystemV1,
} from '@/lib/vision-design-system';
import {
  buildVisionDesignSystemComponentsResourceMarkdown,
  buildVisionDesignSystemVarsClassesResourceMarkdown,
  normalizeVisionResourceBaseName,
  upsertVisionDesignSystemResourcesReferenceBlock,
  type VisionDesignSystemPreviewPublishMetadata,
} from '@/lib/vision-design-system-publish';
import { VisionCanvas } from '@/components/vision/v2/VisionCanvas';
import { MarkdownPopup } from '@/components/vision/v2/shell/MarkdownPopup';
import { VisionImportModal } from '@/components/vision/v2/shell/VisionImportModal';
import { TldrawHeaderActions } from '@/components/vision/v2/shell/TldrawHeaderActions';
import { useCardCount } from '@/components/vision/v2/hooks/useCardCount';
import { CommentsPanel } from '@/components/CommentsPanel';
import { DesignSystemWorkbench } from '@/components/vision/v2/design-system/DesignSystemWorkbench';
import { deleteAnchor, getThread, isVisionPointCommentTargetKey } from '@/lib/node-comments';
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
  // Vision editor should match the app's current visual system (diregram-v2).
  useHtmlThemeOverride('diregram-v2');

  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const [markdownOpen, setMarkdownOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [insertCardTemplateOpen, setInsertCardTemplateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'designSystem' | 'customVisualElements'>('designSystem');
  const [publishPreviewMeta, setPublishPreviewMeta] = useState<VisionDesignSystemPreviewPublishMetadata | null>(null);
  const publishPreviewMetaSigRef = useRef<string>('');
  const [publishingDesignSystem, setPublishingDesignSystem] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
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

  const designSystem = useMemo(() => {
    const raw = (doc as any)?.designSystem as VisionDesignSystemV1 | undefined;
    if (!raw) return defaultVisionDesignSystem();
    return normalizeVisionDesignSystem(raw);
  }, [doc]);

  const updateVisionDoc = useCallback(
    (patch: Record<string, unknown>) => {
      const base = doc && (doc as any).version === 2 ? (doc as any) : { version: 2 };
      onChange({ ...base, ...patch, version: 2, updatedAt: new Date().toISOString() } as any);
    },
    [doc, onChange],
  );

  const onPreviewMetadataChange = useCallback((next: VisionDesignSystemPreviewPublishMetadata) => {
    const sig = JSON.stringify({
      previewTheme: next.previewTheme,
      cssVariables: next.cssVariables,
      cssClasses: next.cssClasses,
      dataAttributes: next.dataAttributes,
      components: next.components,
      capturedAtIso: next.capturedAtIso,
    });
    if (publishPreviewMetaSigRef.current === sig) return;
    publishPreviewMetaSigRef.current = sig;
    setPublishPreviewMeta(next);
  }, []);

  const canPublishDesignSystem = activeTab === 'designSystem' && supabaseMode && !!supabase && !!userId && !!folderId && !!publishPreviewMeta;

  const publishDesignSystemResources = useCallback(async () => {
    if (!supabaseMode || !supabase || !folderId || !userId) {
      setPublishStatus({ kind: 'error', text: 'Publish is available only in synced Supabase projects.' });
      return;
    }
    if (!publishPreviewMeta) {
      setPublishStatus({ kind: 'error', text: 'Preview metadata is not ready yet. Wait for preview render, then publish again.' });
      return;
    }
    setPublishingDesignSystem(true);
    setPublishStatus(null);
    try {
      const publishedAtIso = new Date().toISOString();
      const visionName = String(title || 'Vision').trim() || 'Vision';
      const baseName = normalizeVisionResourceBaseName(visionName);
      const componentsResourceName = `${baseName}_components`;
      const varsClassResourceName = `${baseName}_var+class`;

      const componentsMarkdown = buildVisionDesignSystemComponentsResourceMarkdown({
        visionFileId: fileId,
        visionFileName: visionName,
        designSystem,
        previewMeta: publishPreviewMeta,
        publishedAtIso,
      });
      const varsClassMarkdown = buildVisionDesignSystemVarsClassesResourceMarkdown({
        visionFileId: fileId,
        visionFileName: visionName,
        previewMeta: publishPreviewMeta,
        publishedAtIso,
      });

      const sourceBase = {
        type: 'vision_design_system_publish',
        visionFileId: fileId,
        visionFileName: visionName,
        generator: 'vision_design_system_publish_v1',
      };

      const { data: existingRowsRaw, error: existingError } = await supabase
        .from('project_resources')
        .select('id,source')
        .eq('project_folder_id', folderId)
        .contains('source', { type: 'vision_design_system_publish', visionFileId: fileId });
      if (existingError) throw existingError;
      const existingRows = (existingRowsRaw || []) as Array<{ id?: string | null; source?: unknown }>;
      let existingComponentsId = '';
      let existingVarsClassId = '';
      for (const row of existingRows) {
        const id = String(row.id || '').trim();
        if (!id) continue;
        const src = row.source && typeof row.source === 'object' ? (row.source as Record<string, unknown>) : {};
        const kind = String(src.resourceKind || '').trim();
        if (kind === 'components' && !existingComponentsId) existingComponentsId = id;
        if (kind === 'var_class' && !existingVarsClassId) existingVarsClassId = id;
      }

      const upsertResource = async (opts: {
        existingId: string;
        resourceKind: 'components' | 'var_class';
        name: string;
        markdown: string;
      }): Promise<string> => {
        const source = {
          ...sourceBase,
          resourceKind: opts.resourceKind,
          publishedAtIso,
        };
        if (opts.existingId) {
          const { data, error } = await supabase
            .from('project_resources')
            .update({
              name: opts.name,
              kind: 'markdown',
              markdown: opts.markdown,
              source,
              updated_at: publishedAtIso,
            })
            .eq('id', opts.existingId)
            .select('id')
            .single();
          if (error) throw error;
          return String((data as { id?: unknown } | null)?.id || opts.existingId);
        }
        const { data, error } = await supabase
          .from('project_resources')
          .insert({
            owner_id: userId,
            project_folder_id: folderId,
            name: opts.name,
            kind: 'markdown',
            markdown: opts.markdown,
            source,
          } as never)
          .select('id')
          .single();
        if (error) throw error;
        return String((data as { id?: unknown } | null)?.id || '');
      };

      const [componentsId, varsClassId] = await Promise.all([
        upsertResource({
          existingId: existingComponentsId,
          resourceKind: 'components',
          name: componentsResourceName,
          markdown: componentsMarkdown,
        }),
        upsertResource({
          existingId: existingVarsClassId,
          resourceKind: 'var_class',
          name: varsClassResourceName,
          markdown: varsClassMarkdown,
        }),
      ]);
      if (!componentsId || !varsClassId) throw new Error('Failed to save additional resources.');

      const nexus = yDoc.getText('nexus');
      const currentMarkdown = nexus.toString();
      const nextMarkdown = upsertVisionDesignSystemResourcesReferenceBlock(currentMarkdown, {
        visionFileId: fileId,
        visionFileName: visionName,
        publishedAtIso,
        components: { id: componentsId, name: componentsResourceName },
        varsClass: { id: varsClassId, name: varsClassResourceName },
      });
      if (nextMarkdown !== currentMarkdown) {
        yDoc.transact(() => {
          nexus.delete(0, nexus.length);
          nexus.insert(0, nextMarkdown);
        });
      }

      setPublishStatus({ kind: 'ok', text: `Published ${componentsResourceName} and ${varsClassResourceName}.` });
    } catch (error) {
      setPublishStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to publish design system resources.' });
    } finally {
      setPublishingDesignSystem(false);
    }
  }, [designSystem, fileId, folderId, publishPreviewMeta, supabase, supabaseMode, title, userId, yDoc]);

  const activateTab = useCallback(
    (next: 'designSystem' | 'customVisualElements') => {
      if (next !== 'customVisualElements') {
        cleanupDanglingVisionPoint(commentPanel.targetKey);
        setActiveTool('select');
        setCommentPanel({ targetKey: null });
      }
      setActiveTab(next);
    },
    [cleanupDanglingVisionPoint, commentPanel.targetKey],
  );

  return (
    <main className="mac-desktop dg-screen-fade-in h-screen w-screen relative overflow-hidden dg-vision-editor">
      <header className="mac-menubar h-12 px-4 flex items-center justify-between gap-3 shrink-0 z-[100] relative">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" className="mac-btn h-8 flex items-center gap-1.5" onClick={onBack} title="Back to workspace">
            <ArrowLeft size={16} />
            Workspace
          </button>
          <TldrawHeaderActions editor={canvasEditor} />
          <div className="text-[13px] font-bold tracking-tight truncate">{title || 'Vision'}</div>
          <div className="text-[11px] opacity-70 whitespace-nowrap">{statusLabel || ''}</div>
          <div className="ml-2 inline-flex items-center gap-1 rounded-md border border-black/15 bg-white/80 p-1">
            <button
              type="button"
              className={['mac-btn h-8', activeTab === 'designSystem' ? 'mac-btn--primary' : ''].join(' ')}
              onClick={() => activateTab('designSystem')}
              title="Design system controls and adaptive preview"
            >
              Design System
            </button>
            <button
              type="button"
              className={['mac-btn h-8', activeTab === 'customVisualElements' ? 'mac-btn--primary' : ''].join(' ')}
              onClick={() => activateTab('customVisualElements')}
              title="Current custom visual elements canvas"
            >
              Custom Visual Elements
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="mac-btn h-8 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={
              activeTab !== 'customVisualElements' || !templateFiles || !loadTemplateMarkdown || (templateFiles || []).length === 0 || !canvasEditor
            }
            title={!canvasEditor ? 'Canvas not ready yet' : (templateFiles || []).length === 0 ? 'No templates yet.' : 'Create a new card from a template'}
            onClick={() => setInsertCardTemplateOpen(true)}
          >
            Card template…
          </button>
          <button type="button" className="mac-btn h-8" onClick={() => setImportOpen(true)} title="Import/replace Vision markdown">
            Import
          </button>
          <button
            type="button"
            className={['mac-btn h-8', activeTool === 'comment' ? 'mac-btn--dark' : ''].join(' ')}
            disabled={activeTab !== 'customVisualElements'}
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
          <button type="button" className="mac-btn h-8" onClick={() => setMarkdownOpen(true)} title="Open markdown preview">
            Markdown
          </button>
          <button
            type="button"
            className="mac-btn h-8 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => {
              void publishDesignSystemResources();
            }}
            disabled={!canPublishDesignSystem || publishingDesignSystem}
            title={
              !supabaseMode
                ? 'Available only in synced Supabase projects.'
                : !folderId
                  ? 'Project folder is required to save additional resources.'
                  : !publishPreviewMeta
                    ? 'Waiting for design system preview metadata. Render preview first, then publish.'
                  : activeTab !== 'designSystem'
                    ? 'Switch to Design System tab to publish.'
                    : publishingDesignSystem
                      ? 'Publishing design system resources...'
                      : 'Publish design system resources to Additional resources and reference them in markdown.'
            }
          >
            {publishingDesignSystem ? 'Publishing…' : 'Publish Design System'}
          </button>
          {publishStatus ? (
            <div
              className={[
                'mac-window mac-shadow-hard px-2 py-1 text-[11px] bg-white max-w-[360px] truncate',
                publishStatus.kind === 'ok' ? 'text-emerald-800' : 'text-red-800',
              ].join(' ')}
              title={publishStatus.text}
            >
              {publishStatus.text}
            </div>
          ) : null}
        </div>
      </header>

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
        {activeTab === 'customVisualElements' ? (
          <div className="h-full w-full overflow-hidden mac-canvas-bg">
            <VisionCanvas
              fileId={fileId}
              sessionStorageKey={`vision:tldraw:canvas:session:${fileId}`}
              initialSnapshot={((doc as any).tldraw as Partial<TLEditorSnapshot>) || null}
              onChangeSnapshot={(snapshot) => {
                updateVisionDoc({ tldraw: snapshot });
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
        ) : (
          <div className="h-full w-full dg-vision-design-system">
            <DesignSystemWorkbench
              value={designSystem}
              onChange={(next) => {
                updateVisionDoc({ designSystem: next });
              }}
              onPreviewMetadataChange={onPreviewMetadataChange}
            />
          </div>
        )}
      </div>

      {activeTab === 'customVisualElements' && activeTool === 'comment' ? (
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

      <VisionImportModal doc={yDoc} isOpen={importOpen} onClose={() => setImportOpen(false)} />
    </main>
  );
}
