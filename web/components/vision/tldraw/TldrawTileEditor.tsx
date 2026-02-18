'use client';

import { useCallback, useMemo, useState } from 'react';
import { Tldraw } from 'tldraw';
import {
  type Editor,
  type TLEditorSnapshot,
} from 'tldraw';
import { useTldrawTileController } from '@/components/vision/tldraw/useTldrawTileController';
import { TldrawLayersPanel } from '@/components/vision/tldraw/TldrawLayersPanel';
import { VisionColorCompositionPanel } from '@/components/vision/tldraw/VisionColorCompositionPanel';

export type TldrawTileEditorValue = {
  snapshot: Partial<TLEditorSnapshot>;
  thumbPngDataUrl: string | null;
};

export function TldrawTileEditor({
  initialSnapshot,
  sessionStorageKey,
  thumbOutPx,
  onChange,
  onMountEditor,
}: {
  initialSnapshot: Partial<TLEditorSnapshot> | null;
  /** Where we keep per-user session state (camera/selection). */
  sessionStorageKey: string;
  /** Output size for thumbnail PNG (square). */
  thumbOutPx?: number;
  onChange: (next: TldrawTileEditorValue) => void;
  onMountEditor?: (editor: Editor) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [leftTab, setLeftTab] = useState<'layers' | 'composition'>('layers');

  const handleMountEditor = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      onMountEditor?.(ed);
    },
    [onMountEditor],
  );

  const { store, shapeUtils, uiOverrides, components, getShapeVisibility, onMount } = useTldrawTileController({
    initialSnapshot,
    sessionStorageKey,
    thumbOutPx,
    onChange,
    onMountEditor: handleMountEditor,
  });

  const leftPanel = useMemo(() => {
    return (
      <div className="absolute left-4 top-4 z-40 pointer-events-none">
        <div className="pointer-events-auto w-[260px] max-h-[70vh] overflow-auto rounded-xl border border-black/10 bg-white text-black backdrop-blur-md shadow-lg">
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-black/5">
              <button
                type="button"
                className={[
                  'flex-1 text-xs font-semibold rounded-md px-2 py-1 transition',
                  leftTab === 'layers' ? 'bg-white shadow-sm text-black' : 'text-black/70 hover:text-black',
                ].join(' ')}
                onClick={() => setLeftTab('layers')}
              >
                Layers
              </button>
              <button
                type="button"
                className={[
                  'flex-1 text-xs font-semibold rounded-md px-2 py-1 transition',
                  leftTab === 'composition' ? 'bg-white shadow-sm text-black' : 'text-black/70 hover:text-black',
                ].join(' ')}
                onClick={() => setLeftTab('composition')}
              >
                Color composition
              </button>
            </div>
          </div>
          <div className="px-3 pb-3">
            {leftTab === 'layers' ? <TldrawLayersPanel editor={editor} embedded /> : <VisionColorCompositionPanel editor={editor} />}
          </div>
        </div>
      </div>
    );
  }, [editor, leftTab]);

  return (
    <div className="w-full h-full relative">
      <Tldraw
        className="w-full h-full"
        store={store}
        shapeUtils={shapeUtils}
        onMount={onMount}
        overrides={uiOverrides}
        components={components}
        getShapeVisibility={getShapeVisibility as any}
        options={{ maxPages: 1 } as any}
      />
      {leftPanel}
    </div>
  );
}

