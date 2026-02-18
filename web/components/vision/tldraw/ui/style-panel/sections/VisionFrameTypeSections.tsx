'use client';

import type { Editor } from 'tldraw';
import { nearestTokenForHex } from '@/components/vision/tldraw/ui/style-panel/color-utils';
import { TldrawFrameSection } from '@/components/vision/tldraw/ui/style-panel/sections/TldrawSections';

/**
 * Frame shapes have a small, strict schema in tldraw v4.x:
 * props: { color, name, w, h }.
 *
 * We keep frame-specific style panel logic isolated here so other style panel
 * feature work doesn't accidentally regress the frame tool.
 */
export function VisionFrameTypeSections({
  enabled,
  editor,
  frameShape,
  theme,
  currentColorHex,
  colorMixed,
  colorPlaceholder,
}: {
  enabled: boolean;
  editor: Editor;
  frameShape: any;
  theme: any;
  currentColorHex: string;
  colorMixed: boolean;
  colorPlaceholder: string;
}) {
  if (!enabled) return null;

  const id = String(frameShape?.id || '');
  const name = String(frameShape?.props?.name || '');

  const setName = (next: string) => {
    if (!id) return;
    try {
      editor.updateShapes([{ id: id as any, type: 'frame', props: { ...(frameShape?.props || {}), name: String(next || '') } } as any]);
    } catch {
      // ignore
    }
  };

  const setColorFromHex = (hex: string) => {
    if (!id) return;
    const token = nearestTokenForHex({ theme, hex, variant: 'solid' });
    if (!token) return;
    try {
      editor.updateShapes([{ id: id as any, type: 'frame', props: { ...(frameShape?.props || {}), color: token } } as any]);
    } catch {
      // ignore
    }
  };

  return (
    <TldrawFrameSection
      name={name}
      color={currentColorHex}
      mixedColor={colorMixed}
      placeholder={colorPlaceholder}
      onChangeName={setName}
      onPickColor={setColorFromHex}
      onCommitHex={setColorFromHex}
    />
  );
}

