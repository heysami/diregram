'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useMemo, useState } from 'react';
import { ArrowLeft, Redo2, Undo2 } from 'lucide-react';
import { useHtmlThemeOverride } from '@/hooks/use-html-theme-override';
import type { VisionCellKind, VisionDoc } from '@/lib/visionjson';
import { VisionCellModal } from '@/components/vision/VisionCellModal';
import { VisionGrid } from '@/components/vision/VisionGrid';
import { VisionTileEditor } from '@/components/vision/VisionTileEditor';

export function VisionEditor({
  fileId,
  title,
  statusLabel,
  doc,
  onChange,
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  rawMarkdownPreview,
  rawMarkdownChars,
  supabaseMode,
  supabase,
  userId,
}: {
  fileId: string;
  folderId: string | null;
  title?: string;
  statusLabel?: string;
  doc: VisionDoc;
  onChange: (next: VisionDoc) => void;
  onBack?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  rawMarkdownPreview?: string;
  rawMarkdownChars?: number;
  supabaseMode: boolean;
  supabase: SupabaseClient | null;
  userId: string | null;
}) {
  // Disable Mac3 chrome/patterns for Vision.
  useHtmlThemeOverride('vision');

  const nonEmptyCount = useMemo(() => Object.keys(doc.cells || {}).length, [doc.cells]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedCell = selectedKey ? doc.cells[selectedKey] : null;
  const [showKindModal, setShowKindModal] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);

  const upsertCellKind = (kind: VisionCellKind) => {
    if (!selectedKey) return;
    const prev = doc.cells?.[selectedKey];
    onChange({
      ...doc,
      cells: {
        ...(doc.cells || {}),
        [selectedKey]: {
          ...(prev || {}),
          kind,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  };

  const updateCell = (key: string, nextCell: (typeof doc.cells)[string]) => {
    onChange({
      ...doc,
      cells: {
        ...(doc.cells || {}),
        [key]: nextCell,
      },
    });
  };

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
          <div className="font-semibold truncate">{title || 'Vision'}</div>
          <div className="text-xs opacity-70 whitespace-nowrap">{statusLabel || ''}</div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="h-8 w-8 border flex items-center justify-center bg-white" onClick={onUndo} disabled={!canUndo}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="h-8 w-8 border flex items-center justify-center bg-white" onClick={onRedo} disabled={!canRedo}>
            <Redo2 size={16} />
          </button>
          <div className="text-xs opacity-70 hidden sm:block">
            {nonEmptyCount} tiles
          </div>
        </div>
      </div>

      <div className="absolute inset-0 top-12 flex">
        <div className="flex-1 overflow-auto p-4">
          <VisionGrid
            doc={doc}
            selectedKey={selectedKey}
            showThumbs={showThumbs}
            onSelectKey={(key) => {
              setSelectedKey(key);
              const cell = doc.cells?.[key] || null;
              if (!cell) setShowKindModal(true);
            }}
          />
        </div>

        <div className="w-[320px] border-l p-3 space-y-3 overflow-auto">
          <div className="text-sm font-semibold">Tile</div>
          {!selectedKey ? (
            <div className="text-xs opacity-70">Select a tile.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs opacity-70">{selectedKey}</div>
              <div className="text-xs">
                <span className="opacity-70">Kind:</span> <span className="font-semibold">{selectedCell?.kind || 'empty'}</span>
              </div>
              {selectedCell ? (
                <button type="button" className="h-9 border bg-white text-left px-3" onClick={() => setEditingKey(selectedKey)}>
                  Open editor
                </button>
              ) : null}
              <div className="grid grid-cols-1 gap-2">
                <button type="button" className="h-9 border bg-white text-left px-3" onClick={() => upsertCellKind('vector')}>
                  Vector Illustration
                </button>
                <button type="button" className="h-9 border bg-white text-left px-3" onClick={() => upsertCellKind('ui')}>
                  UI Sample
                </button>
                <button type="button" className="h-9 border bg-white text-left px-3" onClick={() => upsertCellKind('image')}>
                  Image / Photography
                </button>
              </div>
              <button
                type="button"
                className="h-9 border bg-white text-left px-3"
                onClick={() => setShowThumbs((v) => !v)}
                title="Thumbnails can be expensive for large Vision docs."
              >
                {showThumbs ? 'Hide thumbnails' : 'Show thumbnails'}
              </button>
              <div className="text-[11px] opacity-60">
                Full tile editor (Fabric) + monitoring panels next.
              </div>
            </div>
          )}

          {rawMarkdownChars && rawMarkdownChars > 0 ? (
            <div className="pt-2 space-y-2">
              <button
                type="button"
                className="h-8 w-full border bg-white text-left px-2 text-xs"
                onClick={() => setShowRaw((v) => !v)}
                title="Large documents can freeze if fully rendered; this shows a small preview."
              >
                {showRaw ? 'Hide raw markdown preview' : 'Show raw markdown preview'}{' '}
                <span className="opacity-60">({rawMarkdownChars.toLocaleString()} chars)</span>
              </button>
              {showRaw ? (
                <pre className="text-[10px] whitespace-pre-wrap break-words border p-2 bg-white max-h-[260px] overflow-auto">
                  {(rawMarkdownPreview || '') +
                    (rawMarkdownPreview && rawMarkdownChars > rawMarkdownPreview.length ? '\n\n— preview truncated —\n' : '')}
                </pre>
              ) : null}
            </div>
          ) : null}

          {supabaseMode ? (
            <div className="text-[11px] opacity-60">
              Supabase mode enabled. Image assets will use Storage (user: {userId || 'unknown'}).
            </div>
          ) : (
            <div className="text-[11px] opacity-60">
              Local mode enabled. Image assets will be stored inline (data URLs).
            </div>
          )}
        </div>
      </div>

      <VisionCellModal
        isOpen={showKindModal}
        cellKey={selectedKey}
        onClose={() => setShowKindModal(false)}
        onSelectKind={(kind) => {
          upsertCellKind(kind);
          setShowKindModal(false);
          if (selectedKey) setEditingKey(selectedKey);
        }}
      />

      {editingKey && doc.cells?.[editingKey] ? (
        <VisionTileEditor
          fileId={fileId}
          cellKey={editingKey}
          cell={doc.cells[editingKey]}
          onClose={() => setEditingKey(null)}
          onUpdateCell={(nextCell) => updateCell(editingKey, nextCell)}
          supabaseMode={supabaseMode}
          supabase={supabase}
          userId={userId}
        />
      ) : null}
    </main>
  );
}

