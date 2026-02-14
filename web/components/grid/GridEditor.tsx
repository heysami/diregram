'use client';

import { useMemo, useState } from 'react';
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
import { useGridCommentTargetKeysForSheet } from '@/hooks/use-grid-comment-target-keys';
import { getGridSheetIdFromCommentTargetKey } from '@/lib/grid-comments';

export function GridEditor({
  doc,
  yDoc,
  onChange,
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
}: {
  doc: GridDoc;
  yDoc?: Y.Doc | null;
  onChange: (next: GridDoc) => void;
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
}) {
  const sheets = doc.sheets || [];
  const activeSheet = useMemo<GridSheetV1 | null>(() => sheets.find((s) => s.id === doc.activeSheetId) || sheets[0] || null, [sheets, doc.activeSheetId]);

  const [showSettings, setShowSettings] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'comment'>('select');
  const [commentPanel, setCommentPanel] = useState<{
    targetKey: string | null;
    targetLabel?: string;
    scrollToThreadId?: string | null;
  }>({ targetKey: null });

  const commentTargetKeysForActiveSheet = useGridCommentTargetKeysForSheet(yDoc ?? null, activeSheet?.id);

  const markdownViews = useMemo(() => {
    return buildMarkdownDocViews({ rawMarkdown, doc, activeSheet });
  }, [rawMarkdown, doc, activeSheet]);

  if (!activeSheet) {
    return <div className="flex h-screen items-center justify-center text-xs opacity-80">No sheets.</div>;
  }

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button type="button" className="mac-btn" onClick={onBack} title="Back to workspace">
              Workspace
            </button>
          ) : null}
          <div className="text-[12px] font-bold tracking-tight truncate">{title || 'Grid'}</div>
          {statusLabel ? <div className="text-[11px] opacity-70">{statusLabel}</div> : null}
        </div>
        <div className="flex items-center gap-2">
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
          <button type="button" className="mac-btn" onClick={() => setShowSettings((v) => !v)} title="Grid settings">
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      <MarkdownDocModal
        isOpen={showMarkdown}
        title="Markdown / JSON"
        views={markdownViews}
        initialViewId="sheet"
        onClose={() => setShowMarkdown(false)}
      />

      <div className="flex-1 overflow-hidden flex relative">
        <SheetListPanel
          doc={doc}
          onChange={onChange}
        />

        <div className="flex-1 relative overflow-hidden">
          <div className="px-3 py-2 border-b bg-white flex items-center justify-between">
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

            <div className="flex items-center gap-2">
              {showSettings ? <div className="text-[11px] opacity-70">Settings coming soon</div> : null}
            </div>
          </div>

          {activeSheet.mode === 'database' ? (
            <DatabaseView
              sheet={activeSheet}
              onChange={(nextSheet) => {
                const nextSheets = doc.sheets.map((s) => (s.id === activeSheet.id ? nextSheet : s));
                onChange({ ...doc, sheets: nextSheets });
              }}
            />
          ) : (
            <div className="absolute inset-0">
              <SpreadsheetView
                doc={doc}
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

