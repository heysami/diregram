'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { MessageSquare, Settings2 } from 'lucide-react';
import type { GridDoc, GridSheetV1 } from '@/lib/gridjson';
import type { NexusDataObject, NexusDataObjectStore } from '@/lib/data-object-storage';
import { SheetListPanel } from '@/components/grid/SheetListPanel';
import { SpreadsheetView } from '@/components/grid/SpreadsheetView';
import { DatabaseView } from '@/components/grid/DatabaseView';
import { MarkdownDocModal } from '@/components/grid/MarkdownDocModal';
import { buildMarkdownDocViews } from '@/components/grid/markdown/markdownDocViews';
import { CommentsPanel } from '@/components/CommentsPanel';
import { EditorMenubar, type MenubarItem } from '@/components/EditorMenubar';
import { useGridCommentTargetKeysForSheet } from '@/hooks/use-grid-comment-target-keys';
import { getGridSheetIdFromCommentTargetKey } from '@/lib/grid-comments';
import type { WorkspaceFileLite as TemplateWorkspaceFileLite } from '@/components/templates/InsertFromTemplateModal';
import { upsertTemplateHeader, type NexusTemplateHeader } from '@/lib/nexus-template';
import { InsertFromTemplateModal } from '@/components/templates/InsertFromTemplateModal';
import { SaveTemplateModal } from '@/components/templates/SaveTemplateModal';

export function GridEditor({
  doc,
  yDoc,
  onChange,
  fileId,
  statusLabel,
  diagramFiles,
  linkedDiagramFileId,
  onLinkedDiagramFileIdChange,
  linkedDiagramStatusLabel,
  linkedDataObjectStore,
  canEditLinkedDiagramFile,
  upsertLinkedDataObject,
  title,
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  rawMarkdown,
  fileMenuItems,
  templateScope,
  onTemplateScopeChange,
  templateFiles,
  loadTemplateMarkdown,
  onSaveTemplateFile,
  templateSourceLabel,
  globalTemplatesEnabled,
}: {
  doc: GridDoc;
  yDoc?: Y.Doc | null;
  onChange: (next: GridDoc) => void;
  /** Current file id; used to prevent internal pastes across different files. */
  fileId: string;
  statusLabel?: string;
  diagramFiles?: Array<{ id: string; name: string; roomName: string; kind: string; canEdit: boolean }>;
  linkedDiagramFileId?: string | null;
  onLinkedDiagramFileIdChange?: (nextFileId: string | null) => void;
  linkedDiagramStatusLabel?: string;
  linkedDataObjectStore?: NexusDataObjectStore | null;
  canEditLinkedDiagramFile?: boolean;
  upsertLinkedDataObject?: (obj: NexusDataObject) => void;
  title?: string;
  onBack?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  rawMarkdown?: string;
  fileMenuItems?: MenubarItem[];
  templateScope?: 'project' | 'account' | 'global';
  onTemplateScopeChange?: (next: 'project' | 'account' | 'global') => void;
  templateFiles?: TemplateWorkspaceFileLite[];
  loadTemplateMarkdown?: (fileId: string) => Promise<string>;
  onSaveTemplateFile?: (res: { name: string; content: string; scope?: 'project' | 'account' }) => Promise<void> | void;
  templateSourceLabel?: string;
  globalTemplatesEnabled?: boolean;
}) {
  const sheets = doc.sheets || [];
  const activeSheet = useMemo<GridSheetV1 | null>(() => sheets.find((s) => s.id === doc.activeSheetId) || sheets[0] || null, [sheets, doc.activeSheetId]);

  const hotkeysScopeRef = useRef<HTMLDivElement | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'comment'>('select');
  const [insertSheetTemplateOpen, setInsertSheetTemplateOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [pendingTemplatePayload, setPendingTemplatePayload] = useState<string | null>(null);
  const [pendingTemplateHeaderBase, setPendingTemplateHeaderBase] = useState<Omit<NexusTemplateHeader, 'name'> | null>(null);
  const [pendingTemplateDefaultName, setPendingTemplateDefaultName] = useState<string>('Template');
  const [commentPanel, setCommentPanel] = useState<{
    targetKey: string | null;
    targetLabel?: string;
    scrollToThreadId?: string | null;
  }>({ targetKey: null });

  const commentTargetKeysForActiveSheet = useGridCommentTargetKeysForSheet(yDoc ?? null, activeSheet?.id);

  useEffect(() => {
    if (!onUndo && !onRedo) return;

    const isInScope = (e: KeyboardEvent): boolean => {
      const scopeEl = hotkeysScopeRef.current;
      if (!scopeEl) return false;
      const active = document.activeElement;
      if (active && scopeEl.contains(active)) return true;
      const target = e.target as Node | null;
      if (target && scopeEl.contains(target)) return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (!isCmd) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        if (!isInScope(e)) return;
        e.preventDefault();
        if (e.shiftKey) onRedo?.();
        else onUndo?.();
      } else if (k === 'y') {
        if (!isInScope(e)) return;
        e.preventDefault();
        onRedo?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onUndo, onRedo]);

  const markdownViews = useMemo(() => {
    return buildMarkdownDocViews({ rawMarkdown, doc, activeSheet });
  }, [rawMarkdown, doc, activeSheet]);

  type GridSheetTemplateV1 = { version: 1; sheet: Omit<GridSheetV1, 'id'> & { id?: string } };

  const nextSheetId = (existing: GridSheetV1[]): string => {
    let max = 0;
    existing.forEach((s) => {
      const m = String(s.id || '').match(/sheet-(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `sheet-${max + 1}`;
  };

  const parseGridSheetTemplate = (rendered: string): GridSheetTemplateV1 => {
    const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
    const m = src.match(/```nexus-grid-sheet[ \t]*\n([\s\S]*?)\n```/);
    const body = (m ? m[1] : src).trim();
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid sheet template payload.');
    const r = parsed as Record<string, unknown>;
    if (r.version !== 1) throw new Error('Unsupported sheet template version.');
    const sheet = r.sheet as unknown;
    if (!sheet || typeof sheet !== 'object') throw new Error('Invalid sheet.');
    return { version: 1, sheet: sheet as any };
  };

  if (!activeSheet) {
    return <div className="flex h-screen items-center justify-center text-xs opacity-80">No sheets.</div>;
  }

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <EditorMenubar
        status={statusLabel || ''}
        activeFileName={title || 'Grid'}
        onWorkspace={onBack || undefined}
        fileMenuItems={fileMenuItems || []}
        rightContent={
          <>
            <button
              type="button"
              className={`mac-btn ${activeTool === 'comment' ? 'mac-btn--primary' : ''}`}
              disabled={!yDoc}
              onClick={() => {
                if (!yDoc) return;
                setActiveTool((prev) => {
                  const next = prev === 'comment' ? 'select' : 'comment';
                  if (next === 'comment') {
                    setCommentPanel((p) => ({ ...p, targetKey: p.targetKey ?? null }));
                  }
                  return next;
                });
              }}
              title={!yDoc ? 'Comments unavailable (doc not ready)' : 'Comment mode'}
            >
              <MessageSquare size={16} />
            </button>
            <button type="button" className="mac-btn" onClick={onUndo} disabled={!canUndo}>
              Undo
            </button>
            <button type="button" className="mac-btn" onClick={onRedo} disabled={!canRedo}>
              Redo
            </button>
            <button
              type="button"
              className="mac-btn"
              onClick={() => setShowMarkdown(true)}
              disabled={!rawMarkdown}
              title={!rawMarkdown ? 'Markdown not available yet' : 'View the raw markdown backing this file'}
            >
              Markdown
            </button>
            <button
              type="button"
              className="mac-btn"
              disabled={!onSaveTemplateFile || !rawMarkdown}
              title={!onSaveTemplateFile ? 'Template saving unavailable' : !rawMarkdown ? 'Markdown not available yet' : 'Save this entire grid file as a template'}
              onClick={async () => {
                if (!onSaveTemplateFile) return;
                if (!rawMarkdown) return;
                const headerBase: Omit<NexusTemplateHeader, 'name'> = {
                  version: 1,
                  ...(templateSourceLabel ? { description: `Saved from ${templateSourceLabel}` } : {}),
                  targetKind: 'grid',
                  mode: 'createFile',
                  tags: ['grid'],
                };
                setPendingTemplatePayload(rawMarkdown);
                setPendingTemplateHeaderBase(headerBase);
                setPendingTemplateDefaultName(title || 'Grid');
                setSaveTemplateOpen(true);
              }}
            >
              Save file template
            </button>
            <button type="button" className="mac-btn" onClick={() => setShowSettings((v) => !v)} title="Grid settings">
              <Settings2 size={16} />
            </button>
          </>
        }
      />

      <MarkdownDocModal
        isOpen={showMarkdown}
        title="Markdown / JSON"
        views={markdownViews}
        initialViewId="sheet"
        onClose={() => setShowMarkdown(false)}
      />

      <SaveTemplateModal
        open={saveTemplateOpen}
        title="Save template"
        defaultName={pendingTemplateDefaultName}
        defaultScope="project"
        onClose={() => setSaveTemplateOpen(false)}
        onSave={async ({ name, scope }) => {
          if (!onSaveTemplateFile) throw new Error('Template saving unavailable.');
          if (!pendingTemplatePayload || !pendingTemplateHeaderBase) throw new Error('No template content to save.');
          const header: NexusTemplateHeader = { ...pendingTemplateHeaderBase, name };
          const content = upsertTemplateHeader(pendingTemplatePayload, header);
          await onSaveTemplateFile({ name, content, scope });
          setPendingTemplatePayload(null);
          setPendingTemplateHeaderBase(null);
        }}
      />

      <div className="flex-1 overflow-hidden flex relative">
        <SheetListPanel
          doc={doc}
          onChange={onChange}
        />

        <div className="flex-1 relative overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b bg-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold truncate">{activeSheet.name}</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`mac-btn h-7 ${activeSheet.mode === 'spreadsheet' ? 'mac-btn--primary' : ''}`}
                  onClick={() => {
                    const nextSheets: GridSheetV1[] = doc.sheets.map((s) =>
                      s.id === activeSheet.id ? ({ ...s, mode: 'spreadsheet' as const } satisfies GridSheetV1) : s,
                    );
                    onChange({ ...doc, sheets: nextSheets });
                  }}
                >
                  Spreadsheet
                </button>
                <button
                  type="button"
                  className={`mac-btn h-7 ${activeSheet.mode === 'database' ? 'mac-btn--primary' : ''}`}
                  onClick={() => {
                    const nextSheets: GridSheetV1[] = doc.sheets.map((s) =>
                      s.id === activeSheet.id ? ({ ...s, mode: 'database' as const } satisfies GridSheetV1) : s,
                    );
                    onChange({ ...doc, sheets: nextSheets });
                  }}
                >
                  Database
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                type="button"
                className="mac-btn h-7"
                disabled={!activeSheet || !onSaveTemplateFile}
                title={!onSaveTemplateFile ? 'Template actions are not available.' : 'Save the current sheet as a template.'}
                onClick={async () => {
                  if (!activeSheet) return;
                  if (!onSaveTemplateFile) return;
                  const payloadObj: GridSheetTemplateV1 = {
                    version: 1,
                    sheet: { ...(activeSheet as any), id: 'sheet-template' },
                  };
                  const payload = ['```nexus-grid-sheet', JSON.stringify(payloadObj, null, 2), '```', ''].join('\n');
                  const headerBase: Omit<NexusTemplateHeader, 'name'> = {
                    version: 1,
                    ...(templateSourceLabel ? { description: `Saved from ${templateSourceLabel}` } : {}),
                    targetKind: 'grid',
                    mode: 'appendFragment',
                    fragmentKind: 'gridSheet',
                    tags: ['grid'],
                  };
                  setPendingTemplatePayload(payload);
                  setPendingTemplateHeaderBase(headerBase);
                  setPendingTemplateDefaultName(activeSheet.name || 'Sheet');
                  setSaveTemplateOpen(true);
                }}
              >
                Save sheet template
              </button>
              <button
                type="button"
                className="mac-btn h-7"
                disabled={!templateFiles || !loadTemplateMarkdown || (templateFiles || []).length === 0}
                title={(templateFiles || []).length === 0 ? 'No templates yet.' : 'Insert a sheet from a template.'}
                onClick={() => setInsertSheetTemplateOpen(true)}
              >
                Insert sheet…
              </button>
              {showSettings ? <div className="text-[11px] opacity-70">Settings coming soon</div> : null}
            </div>
          </div>

          <InsertFromTemplateModal
            open={insertSheetTemplateOpen}
            title="Insert sheet template"
            files={templateFiles || []}
            loadMarkdown={loadTemplateMarkdown || (async () => '')}
            accept={{ targetKind: 'grid', mode: 'appendFragment', fragmentKind: 'gridSheet' }}
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
            onClose={() => setInsertSheetTemplateOpen(false)}
            onInsert={async ({ content }) => {
              const tpl = parseGridSheetTemplate(content);
              const id = nextSheetId(doc.sheets || []);
              const base = tpl.sheet as any;
              const nextSheet: GridSheetV1 = {
                ...(base as GridSheetV1),
                id,
                name: typeof base.name === 'string' && base.name.trim() ? base.name : `Sheet ${String((doc.sheets || []).length + 1)}`,
              };
              onChange({ ...doc, activeSheetId: id, sheets: [...(doc.sheets || []), nextSheet] });
            }}
          />

          {activeSheet.mode === 'database' ? (
            <div ref={hotkeysScopeRef} className="relative flex-1 overflow-hidden">
              <DatabaseView
                sheet={activeSheet}
                onChange={(nextSheet) => {
                  const nextSheets = doc.sheets.map((s) => (s.id === activeSheet.id ? nextSheet : s));
                  onChange({ ...doc, sheets: nextSheets });
                }}
              />
            </div>
          ) : (
            <div ref={hotkeysScopeRef} className="relative flex-1 overflow-hidden">
              <SpreadsheetView
                doc={doc}
                fileId={fileId}
                sheet={activeSheet}
                activeTool={activeTool}
                commentTargetKeys={commentTargetKeysForActiveSheet}
                scrollToCommentTargetKey={commentPanel.targetKey}
                onOpenComments={(info) => {
                  if (!yDoc) return;
                  setActiveTool('comment');
                  setCommentPanel({
                    targetKey: info.targetKey,
                    targetLabel: info.targetLabel,
                    scrollToThreadId: info.scrollToThreadId || null,
                  });
                }}
                onChangeSheet={(nextSheet) => {
                  const nextSheets = doc.sheets.map((s) => (s.id === activeSheet.id ? nextSheet : s));
                  onChange({ ...doc, sheets: nextSheets });
                }}
                onChangeDoc={onChange}
                diagramFiles={diagramFiles || []}
                linkedDiagramFileId={linkedDiagramFileId || null}
                onLinkedDiagramFileIdChange={onLinkedDiagramFileIdChange}
                linkedDiagramStatusLabel={linkedDiagramStatusLabel}
                linkedDataObjectStore={linkedDataObjectStore || null}
                canEditLinkedDiagramFile={Boolean(canEditLinkedDiagramFile)}
                upsertLinkedDataObject={upsertLinkedDataObject}
                templateScope={templateScope}
                onTemplateScopeChange={onTemplateScopeChange}
                templateFiles={templateFiles}
                loadTemplateMarkdown={loadTemplateMarkdown}
                onSaveTemplateFile={onSaveTemplateFile}
                templateSourceLabel={templateSourceLabel}
                globalTemplatesEnabled={globalTemplatesEnabled}
              />
            </div>
          )}
        </div>

        {activeTool === 'comment' && yDoc ? (
          <div className="absolute right-3 top-3 bottom-3 pointer-events-none">
            <div className="h-full pointer-events-auto">
              <CommentsPanel
                key={commentPanel.targetKey || 'comments'}
                doc={yDoc}
                selectedTargetKey={commentPanel.targetKey}
                selectedTargetLabel={commentPanel.targetLabel}
                scrollToThreadId={commentPanel.scrollToThreadId || null}
                onActiveTargetKeyChange={(nextKey) => {
                  if (!nextKey) {
                    setCommentPanel((p) => ({ ...p, targetKey: null, scrollToThreadId: null }));
                    return;
                  }
                  const sheetId = getGridSheetIdFromCommentTargetKey(nextKey);
                  if (sheetId && sheetId !== activeSheet.id && sheets.some((s) => s.id === sheetId)) {
                    onChange({ ...doc, activeSheetId: sheetId });
                  }
                  setCommentPanel((p) => ({ ...p, targetKey: nextKey, scrollToThreadId: null }));
                }}
                onClose={() => {
                  setCommentPanel({ targetKey: null });
                  setActiveTool('select');
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

