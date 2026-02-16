'use client';

import { Tldraw } from 'tldraw';
import {
  type Editor,
  type TLEditorSnapshot,
} from 'tldraw';
import { useTldrawTileController } from '@/components/vision/tldraw/useTldrawTileController';

export type TldrawTileEditorValue = {
  snapshot: Partial<TLEditorSnapshot>;
  thumbPngDataUrl: string | null;
};

export function TldrawTileEditor({
  initialSnapshot,
  sessionStorageKey,
  onChange,
  onMountEditor,
}: {
  initialSnapshot: Partial<TLEditorSnapshot> | null;
  /** Where we keep per-user session state (camera/selection). */
  sessionStorageKey: string;
  onChange: (next: TldrawTileEditorValue) => void;
  onMountEditor?: (editor: Editor) => void;
}) {
  const { store, shapeUtils, uiOverrides, components, getShapeVisibility, onMount } = useTldrawTileController({
    initialSnapshot,
    sessionStorageKey,
    onChange,
    onMountEditor,
  });

  return (
    <div className="w-full h-full">
      <Tldraw
        store={store}
        shapeUtils={shapeUtils}
        onMount={onMount}
        overrides={uiOverrides}
        components={components}
        getShapeVisibility={getShapeVisibility as any}
      />
    </div>
  );
}

