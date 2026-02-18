import type { Editor } from 'tldraw';
import type { TLShapeId } from '@tldraw/tlschema';
import { createShapeId } from '@tldraw/tlschema';
import { getParentSpacePoint } from '@/components/vision/tldraw/fx/proxy/proxyBounds';
import { NX_LAYOUT_CHILD_META_KEY, NX_LAYOUT_CONSTRAINTS_META_KEY } from './nxLayoutMeta';

type Bounds = { x: number; y: number; w: number; h: number };

function asBounds(b: any): Bounds | null {
  if (!b) return null;
  const x = Number(b.x ?? b.minX ?? 0);
  const y = Number(b.y ?? b.minY ?? 0);
  const w = Number(b.w ?? b.width ?? 0);
  const h = Number(b.h ?? b.height ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/**
 * Create an auto-layout `nxlayout` container around a selection and reparent the selection into it.
 * Returns the new container id, or null.
 */
export function createAutoLayoutGroupFromSelection(editor: Editor, ids: TLShapeId[]): TLShapeId | null {
  if (!editor) return null;
  const cleanIds = (ids || []).filter(Boolean) as TLShapeId[];
  if (!cleanIds.length) return null;

  const selectionBounds =
    asBounds((editor as any).getShapesPageBounds?.(cleanIds as any)) || asBounds((editor as any).getSelectionPageBounds?.()) || null;
  if (!selectionBounds) return null;

  const selectedShapes = cleanIds.map((id) => (editor as any).getShape?.(id as any)).filter(Boolean) as any[];
  const parentIds = Array.from(new Set(selectedShapes.map((s) => String(s?.parentId || '')).filter(Boolean)));
  const parentId = parentIds.length === 1 ? (selectedShapes[0] as any).parentId : ((editor as any).getCurrentPageId?.() as any);

  const parentShape: any = (() => {
    try {
      return (editor as any).getShape?.(parentId as any) || null;
    } catch {
      return null;
    }
  })();
  const parentIsNxLayout = Boolean(parentShape && String(parentShape.type || '') === 'nxlayout');

  const pad = 16;
  const layoutId = createShapeId() as any;
  const containerSizeX = parentIsNxLayout ? 'fixed' : 'hug';
  const containerSizeY = 'hug';

  // `x/y` must be in parent-space when nested.
  const topLeftPage = { x: selectionBounds.x - pad, y: selectionBounds.y - pad };
  const topLeftInParent =
    parentShape && parentShape.id ? getParentSpacePoint(editor, parentShape.id as any, topLeftPage) : topLeftPage;

  try {
    (editor as any).createShape?.({
      id: layoutId,
      type: 'nxlayout',
      parentId: parentId as any,
      x: topLeftInParent.x,
      y: topLeftInParent.y,
      props: {
        w: selectionBounds.w + pad * 2,
        h: selectionBounds.h + pad * 2,
        layoutMode: 'auto',
        direction: 'vertical',
        gap: 12,
        paddingTop: pad,
        paddingRight: pad,
        paddingBottom: pad,
        paddingLeft: pad,
        alignCross: 'start',
        // Default sizing:
        // - Top-level auto layout groups: hug both axes.
        // - Nested inside another auto layout group: don't hug width (parent may want to control it via "fill").
        sizeX: containerSizeX,
        sizeY: containerSizeY,
      } as any,
      meta: {
        nxName: 'Auto layout',
        ...(parentIsNxLayout
          ? {
              // If this nxlayout is itself inside another nxlayout, default its in-parent sizing.
              // Requirement: width fill, height hug.
              [NX_LAYOUT_CHILD_META_KEY]: { sizeX: 'fill', sizeY: 'hug' },
            }
          : null),
      } as any,
    });
  } catch {
    return null;
  }

  try {
    (editor as any).reparentShapes?.(cleanIds as any, layoutId as any);
  } catch {
    // ignore
  }

  // Initialize child defaults (fixed sizing + top/left constraints for manual mode).
  try {
    const childShapes = cleanIds.map((id) => (editor as any).getShape?.(id as any)).filter(Boolean) as any[];
    if (childShapes.length) {
      (editor as any).updateShapes?.(
        childShapes.map((s) => ({
          id: s.id,
          type: s.type,
          meta: {
            ...(s.meta || {}),
            [NX_LAYOUT_CHILD_META_KEY]: { sizeX: 'fixed', sizeY: 'fixed' },
            [NX_LAYOUT_CONSTRAINTS_META_KEY]: { h: 'left', v: 'top' },
          },
        })) as any,
      );
    }
  } catch {
    // ignore
  }

  try {
    (editor as any).setSelectedShapes?.([layoutId as any]);
  } catch {
    // ignore
  }

  return layoutId as any;
}

