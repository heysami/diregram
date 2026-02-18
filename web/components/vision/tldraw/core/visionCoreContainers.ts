'use client';

import type { Editor } from 'tldraw';
import { createShapeId } from '@tldraw/tlschema';
import { makeDefaultFillLayer, serializeFillLayers, serializeStrokeLayers } from '@/components/vision/tldraw/paint/nxPaintLayers';
import { coerceId, getAllPageShapeIds, getAllShapeIdsDeep, getCurrentPageId, getShape } from '@/components/vision/tldraw/core/visionTldrawTraversal';

export type VisionCoreSection = 'asset' | 'thumb' | 'annotator';

export const NX_CORE_SECTION_META_KEY = 'nxCoreSection' as const;

const CORE_DEFAULT_FILL: Record<VisionCoreSection, string> = {
  thumb: '#f4f4f4',
  asset: '#ffffff',
  annotator: '#ffffff',
};

function coreDefaultProps(section: VisionCoreSection) {
  const fill6 = CORE_DEFAULT_FILL[section] || '#ffffff';
  const fill8 = `${fill6}ff`;
  return {
    // Vision paint stacks (preferred)
    fills: serializeFillLayers([makeDefaultFillLayer({ mode: 'solid', solid: fill8 })]),
    strokes: serializeStrokeLayers([]), // no outline
    // Legacy / fallback props (kept in sync)
    fillMode: 'solid',
    fill: fill8,
    strokeMode: 'solid',
    stroke: 'transparent',
    strokeWidth: 0,
  };
}

function createCoreContainerNxLayout(opts: {
  editor: Editor;
  pageId: any;
  section: VisionCoreSection;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}): string {
  const { editor, pageId, section, x, y, w, h, name } = opts;
  const id = createShapeId();
  try {
    const d = coreDefaultProps(section);
    (editor as any).createShape?.({
      id,
      type: 'nxlayout',
      parentId: pageId,
      x,
      y,
      props: { w, h, ...(d as any) },
      meta: { [NX_CORE_SECTION_META_KEY]: section, nxName: name },
    } as any);
  } catch {
    // ignore
  }
  return coerceId(id);
}

function migrateLegacyCoreFrameToNxLayout(editor: Editor, idRaw: string | null, pageId: any): string | null {
  const id = coerceId(idRaw);
  if (!id) return null;
  const s: any = getShape(editor, id);
  if (!s) return null;
  if (String(s.type || '') !== 'frame') return id;
  const role = s?.meta?.[NX_CORE_SECTION_META_KEY];
  if (role !== 'asset' && role !== 'thumb' && role !== 'annotator') return id;

  const nextId = createShapeId();
  const w = Number(s?.props?.w ?? s?.props?.width ?? 720) || 720;
  const h = Number(s?.props?.h ?? s?.props?.height ?? 720) || 720;
  const nxName =
    typeof s?.meta?.nxName === 'string' && s.meta.nxName.trim()
      ? s.meta.nxName.trim()
      : String(s?.props?.name || '');

  try {
    const d = coreDefaultProps(role);
    (editor as any).createShape?.({
      id: nextId,
      type: 'nxlayout',
      parentId: s.parentId || pageId,
      x: Number(s.x || 0),
      y: Number(s.y || 0),
      props: { w, h, ...(d as any) },
      meta: { ...(s.meta || {}), [NX_CORE_SECTION_META_KEY]: role, nxName: nxName || String(role) },
    } as any);
  } catch {
    return id;
  }

  // Move children over.
  try {
    const childIds = ((editor as any).getSortedChildIdsForParent?.(id as any) || []).filter(Boolean);
    if (childIds.length) (editor as any).reparentShapes?.(childIds as any, nextId as any);
  } catch {
    // ignore
  }

  // Delete old frame (best effort).
  try {
    (editor as any).deleteShapes?.([id as any]);
  } catch {
    // ignore
  }

  return coerceId(nextId);
}

export function findCoreFrameId(editor: Editor, section: VisionCoreSection): string | null {
  const ids = getAllPageShapeIds(editor);
  for (const id of ids) {
    const s = getShape(editor, id);
    if (!s) continue;
    const role = s?.meta?.[NX_CORE_SECTION_META_KEY];
    if (role === section) return coerceId(s.id);
  }
  return null;
}

export function ensureCoreFrames(editor: Editor): { assetId: string; thumbId: string; annotatorId: string } {
  const pageId = getCurrentPageId(editor);

  // Cleanup: delete any previously-created core background overlays (they can cover content).
  try {
    // Deep scan (bg overlays can be nested inside core containers).
    const ids = getAllShapeIdsDeep(editor);
    const toDelete: string[] = [];
    for (const id of ids) {
      const s: any = getShape(editor, id);
      const k = String(s?.meta?.nxCoreBgFor || '');
      if (k === 'asset' || k === 'thumb' || k === 'annotator') toDelete.push(coerceId(s.id));
    }
    if (toDelete.length) (editor as any).deleteShapes?.(toDelete as any);
  } catch {
    // ignore
  }

  const existing = {
    assetId: findCoreFrameId(editor, 'asset'),
    thumbId: findCoreFrameId(editor, 'thumb'),
    annotatorId: findCoreFrameId(editor, 'annotator'),
  };

  // Migration: older docs used tldraw `frame` shapes for core sections.
  existing.thumbId = migrateLegacyCoreFrameToNxLayout(editor, existing.thumbId, pageId);
  existing.assetId = migrateLegacyCoreFrameToNxLayout(editor, existing.assetId, pageId);
  existing.annotatorId = migrateLegacyCoreFrameToNxLayout(editor, existing.annotatorId, pageId);

  const created: Partial<typeof existing> = {};

  // Default layout: thumb surrounds asset; annotator sits to the right.
  const thumbId =
    existing.thumbId || (created.thumbId = createCoreContainerNxLayout({ editor, pageId, section: 'thumb', x: -80, y: -80, w: 880, h: 880, name: 'Thumbnail' }));
  const assetId =
    existing.assetId || (created.assetId = createCoreContainerNxLayout({ editor, pageId, section: 'asset', x: 0, y: 0, w: 720, h: 720, name: 'Asset' }));
  const annotatorId =
    existing.annotatorId ||
    (created.annotatorId = createCoreContainerNxLayout({ editor, pageId, section: 'annotator', x: 920, y: 0, w: 720, h: 720, name: 'Annotator' }));

  // Backfill names for older docs (they used frame props.name only).
  try {
    const want: Array<{ id: string | null; name: string }> = [
      { id: thumbId, name: 'Thumbnail' },
      { id: assetId, name: 'Asset' },
      { id: annotatorId, name: 'Annotator' },
    ];
    const updates: any[] = [];
    for (const w of want) {
      const id = coerceId(w.id);
      if (!id) continue;
      const s: any = getShape(editor, id);
      if (!s) continue;
      const m: any = { ...(s.meta || {}) };
      if (typeof m.nxName === 'string' && m.nxName.trim()) continue;
      m.nxName = w.name;
      updates.push({ id: s.id, type: s.type, meta: m });
    }
    if (updates.length) (editor as any).updateShapes?.(updates as any);
  } catch {
    // ignore
  }

  // If we just created the asset, best-effort nest it into the thumb container so users can
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

