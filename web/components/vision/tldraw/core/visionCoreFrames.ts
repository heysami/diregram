'use client';

import type { Editor } from 'tldraw';
import { createShapeId } from '@tldraw/tlschema';
import { coerceId, getAllPageShapeIds, getCurrentPageId, getShape } from '@/components/vision/tldraw/core/visionTldrawTraversal';

export type VisionCoreSection = 'asset' | 'thumb' | 'annotator';

export const NX_CORE_SECTION_META_KEY = 'nxCoreSection' as const;

export function findCoreFrameId(editor: Editor, section: VisionCoreSection): string | null {
  const ids = getAllPageShapeIds(editor);
  for (const id of ids) {
    const s = getShape(editor, id);
    if (!s) continue;
    if (s.type !== 'frame') continue;
    const role = s?.meta?.[NX_CORE_SECTION_META_KEY];
    if (role === section) return coerceId(s.id);
  }
  return null;
}

export function ensureCoreFrames(editor: Editor): { assetId: string; thumbId: string; annotatorId: string } {
  const pageId = getCurrentPageId(editor);

  const existing = {
    assetId: findCoreFrameId(editor, 'asset'),
    thumbId: findCoreFrameId(editor, 'thumb'),
    annotatorId: findCoreFrameId(editor, 'annotator'),
  };

  const created: Partial<typeof existing> = {};
  const make = (section: VisionCoreSection, x: number, y: number, w: number, h: number, name: string) => {
    const id = createShapeId();
    try {
      (editor as any).createShape?.({
        id,
        type: 'frame',
        parentId: pageId,
        x,
        y,
        props: { w, h, name },
        meta: { [NX_CORE_SECTION_META_KEY]: section },
      } as any);
    } catch {
      // ignore
    }
    return coerceId(id);
  };

  // Default layout: thumb surrounds asset; annotator sits to the right.
  const thumbId = existing.thumbId || (created.thumbId = make('thumb', -80, -80, 880, 880, 'Thumbnail'));
  const assetId = existing.assetId || (created.assetId = make('asset', 0, 0, 720, 720, 'Asset'));
  const annotatorId = existing.annotatorId || (created.annotatorId = make('annotator', 920, 0, 720, 720, 'Annotator'));

  // If we just created the asset, best-effort nest it into the thumb frame so users can
  // visually "include the asset inside the thumbnail" by default.
  if (!existing.assetId && thumbId && assetId) {
    try {
      (editor as any).reparentShapes?.([assetId as any], thumbId as any);
    } catch {
      // ignore
    }
  }

  return {
    assetId: existing.assetId || created.assetId || assetId,
    thumbId: existing.thumbId || created.thumbId || thumbId,
    annotatorId: existing.annotatorId || created.annotatorId || annotatorId,
  };
}

