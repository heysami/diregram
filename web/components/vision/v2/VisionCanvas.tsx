'use client';

import { useMemo, useState } from 'react';
import { Tldraw, TldrawUiButton, useValue, type Editor, type TLEditorSnapshot } from 'tldraw';
import { useTldrawVisionCanvasController } from '@/components/vision/v2/tldraw/useTldrawVisionCanvasController';
import { VisionCardEditorModal } from '@/components/vision/v2/VisionCardEditorModal';

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
}: {
  fileId: string;
  initialSnapshot: Partial<TLEditorSnapshot> | null;
  onChangeSnapshot: (snapshot: Partial<TLEditorSnapshot>) => void;
  sessionStorageKey: string;
  onReadyEditor?: (editor: Editor | null) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const { store, shapeUtils, uiOverrides, components, onMount } = useTldrawVisionCanvasController({
    initialSnapshot,
    sessionStorageKey,
    onChange: ({ snapshot }) => onChangeSnapshot(snapshot),
    onMountEditor: (ed) => {
      setEditor(ed);
      onReadyEditor?.(ed);
    },
  });

  const overlay = useMemo(() => {
    return (
      <>
        {editor && !openCardId ? <SelectedCardEditButton editor={editor} onEdit={(id) => setOpenCardId(id)} /> : null}
        {openCardId && editor ? (
          <VisionCardEditorModal fileId={fileId} cardId={openCardId} editor={editor} onClose={() => setOpenCardId(null)} />
        ) : null}
      </>
    );
  }, [openCardId, editor, fileId]);

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

