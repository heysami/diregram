'use client';

import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Tldraw } from 'tldraw';
import {
  type Editor,
  type TLEditorSnapshot,
} from 'tldraw';
import { useTldrawTileController } from '@/components/vision/tldraw/useTldrawTileController';
import { TldrawLayersPanel } from '@/components/vision/tldraw/TldrawLayersPanel';
import { VisionColorCompositionPanel } from '@/components/vision/tldraw/VisionColorCompositionPanel';
import { useTopToast } from '@/hooks/use-top-toast';
import { useTldrawSvgPaste } from '@/components/vision/tldraw/hooks/useTldrawSvgPaste';
import { useTldrawCoreContainerSelectionGuard } from '@/components/vision/tldraw/hooks/useTldrawCoreContainerSelectionGuard';

export type TldrawTileEditorValue = {
  snapshot: Partial<TLEditorSnapshot>;
  thumbPngDataUrl: string | null;
};

export function TldrawTileEditor({
  fileId = null,
  initialSnapshot,
  sessionStorageKey,
  thumbOutPx,
  onChange,
  onMountEditor,
}: {
  /** Current file id; used to prevent internal pastes across different files. */
  fileId?: string | null;
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
  const topToast = useTopToast({ durationMs: 2500 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastActiveAtRef = useRef<number>(0);

  const handleMountEditor = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      onMountEditor?.(ed);
    },
    [onMountEditor],
  );

  const isProbablyActive = useCallback((): boolean => {
    const root = rootRef.current;
    if (!root) return false;
    try {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && root.contains(ae)) return true;
    } catch {
      // ignore
    }
    const last = lastActiveAtRef.current || 0;
    return Date.now() - last < 8000;
  }, []);

  useTldrawSvgPaste({ editor, fileId, isProbablyActive, topToast });
  useTldrawCoreContainerSelectionGuard(editor);

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
    <div
      ref={rootRef}
      className="w-full h-full relative"
      tabIndex={0}
      onPointerDownCapture={() => {
        lastActiveAtRef.current = Date.now();
        try {
          rootRef.current?.focus?.();
        } catch {
          // ignore
        }
      }}
    >
      <Tldraw
        className="w-full h-full"
        store={store}
        shapeUtils={shapeUtils}
        onMount={onMount}
        overrides={uiOverrides}
        components={components}
        getShapeVisibility={getShapeVisibility as ComponentProps<typeof Tldraw>['getShapeVisibility']}
        options={{ maxPages: 1 } as ComponentProps<typeof Tldraw>['options']}
      />
      {leftPanel}
      {topToast.message ? (
        <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-[2000]">
          <div className="rounded-md border border-red-200 bg-white/95 px-3 py-2 text-xs font-medium text-red-700 shadow-sm">
            {topToast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}

