'use client';

import type { Editor } from 'tldraw';
import { createShapeId, toRichText } from '@tldraw/tlschema';
import { getVisionAnnotMode, setVisionAnnotMode, type VisionAnnotMode } from '@/components/vision/tldraw/annotations/visionAnnotationTools';

function isTluiTarget(t: EventTarget | null): boolean {
  try {
    const el = t as any;
    return !!(el && typeof el.closest === 'function' && el.closest('.tlui'));
  } catch {
    return false;
  }
}

function startEditingIfPossible(editor: Editor, shapeId: unknown) {
  try {
    (editor as unknown as { setEditingShape?: (id: unknown) => void }).setEditingShape?.(shapeId);
  } catch {
    // ignore
  }
  try {
    (editor as unknown as { startEditingShape?: (id: unknown) => void }).startEditingShape?.(shapeId);
  } catch {
    // ignore
  }
}

export function installVisionAnnotationToolInteractions(editor: Editor): () => void {
  let pending: { baseId: string; kind: Exclude<VisionAnnotMode, null> } | null = null;

  const unlisten = (editor as any)?.store?.listen?.(
    (entry: any) => {
      const mode = getVisionAnnotMode(editor);
      if (mode !== 'line' && mode !== 'rect') return;

      const added = entry?.changes?.added || {};
      const ids = Object.keys(added);
      if (!ids.length) return;

      // Base shapes are created at pointer-down in tldraw. We capture the first one and finalize on pointer-up.
      if (pending) return;

      for (const rid of ids) {
        const rec: any = (added as any)[rid] || null;
        const sid = String(rec?.id || rid || '');
        if (!sid || !sid.startsWith('shape:')) continue;
        const s: any = (editor as any).getShape?.(sid as any) || null;
        if (!s) continue;
        const t = String(s.type || '');
        const ok = mode === 'line' ? t === 'line' : t === 'geo';
        if (!ok) continue;
        pending = { baseId: String(s.id), kind: mode };
        break;
      }
    },
    { scope: 'document' as any },
  );

  const onPointerUp = (e: PointerEvent) => {
    if (!pending) return;
    if (isTluiTarget(e.target)) return;

    const { baseId, kind } = pending;
    pending = null;

    const modeNow = getVisionAnnotMode(editor);
    if (modeNow !== kind) {
      // Mode changed mid-gesture; bail.
      return;
    }

    const base: any = (editor as any).getShape?.(baseId as any) || null;
    if (!base) {
      setVisionAnnotMode(editor, null);
      return;
    }

    let err: any = null;
    let textId: any = null;
    let groupId: any = null;
    try {
      // Tag base shape semantics.
      const nextMeta = {
        ...(base.meta || {}),
        nxNoAutoConvert: true,
        nxSkipAutoParenting: true,
        nxAnnotationKind: kind,
        nxSemanticRole: 'annotation',
      };

      const basePatch: any = { id: base.id, type: base.type, meta: nextMeta };

      // Ensure rect annotations are rectangles even if geo style changes.
      if (kind === 'rect' && String(base.type || '') === 'geo') {
        basePatch.props = { ...(base.props || {}), geo: 'rectangle' };
      }

      (editor as any).updateShapes?.([basePatch]);

      // Create linked text label near the base bounds.
      const pageBounds: any = (editor as any).getShapePageBounds?.(base.id as any) || null;
      const px = Number(pageBounds?.x ?? pageBounds?.minX ?? base.x ?? 0) + 12;
      const py = Number(pageBounds?.y ?? pageBounds?.minY ?? base.y ?? 0) + 12;

      let localX = px;
      let localY = py;
      try {
        const p = (editor as any).getPointInParentSpace?.(base.id as any, { x: px, y: py });
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          localX = Number(p.x);
          localY = Number(p.y);
        }
      } catch {
        // ignore
      }

      textId = createShapeId();
      (editor as any).createShape?.({
        id: textId as any,
        type: 'text',
        parentId: base.parentId,
        x: localX,
        y: localY,
        props: { richText: toRichText('') as any },
        meta: {
          nxNoAutoConvert: true,
          nxSkipAutoParenting: true,
          nxAnnotationTextFor: String(base.id),
          nxSemanticRole: 'annotationText',
        },
      });

      // Group base + label together so they move as one.
      try {
        groupId = createShapeId();
        (editor as any).createShape?.({
          id: groupId as any,
          type: 'group',
          parentId: base.parentId,
          x: Number(base.x || 0),
          y: Number(base.y || 0),
          meta: {
            nxNoAutoConvert: true,
            nxSkipAutoParenting: true,
            nxAnnotationGroupFor: String(base.id),
            nxSemanticRole: 'annotationGroup',
          },
        } as any);
        // Reparent keeps page positions stable (tldraw handles coord transforms).
        (editor as any).reparentShapes?.([base.id as any, textId as any], groupId as any);
      } catch {
        // ignore (grouping is best-effort)
      }

      try {
        (editor as any).setSelectedShapes?.([textId as any]);
      } catch {
        // ignore
      }
      startEditingIfPossible(editor, textId);
    } catch (e2) {
      err = e2;
    } finally {
      // Exit mode after creating one annotation so it behaves like a “draw then label” action.
      setVisionAnnotMode(editor, null);
      try {
        (editor as any).setCurrentTool?.('select');
      } catch {
        // ignore
      }
    }
  };

  window.addEventListener('pointerup', onPointerUp, { capture: true });
  window.addEventListener('pointercancel', onPointerUp, { capture: true });

  return () => {
    try {
      unlisten?.();
    } catch {
      // ignore
    }
    window.removeEventListener('pointerup', onPointerUp, { capture: true } as any);
    window.removeEventListener('pointercancel', onPointerUp, { capture: true } as any);
  };
}

