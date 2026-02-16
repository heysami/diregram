'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, useValue } from 'tldraw';
import { clamp01 } from '@/components/vision/tldraw/ui/gradient-handles/math';
import { useVisionGradientUiState } from '@/components/vision/tldraw/ui/gradient-handles/visionGradientUiStore';

function isVisionGradientShape(shape: any) {
  if (!shape) return false;
  if (shape.type !== 'nxtext' && shape.type !== 'nxrect' && shape.type !== 'nxpath') return false;
  return true;
}

export function VisionGradientHandles() {
  const editor = useEditor();
  const dragRef = useRef<{ shapeId: string; which: 'g0' | 'g1' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const gradientUi = useVisionGradientUiState();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const active = useValue(
    'visionGradientActive',
    () => {
      const shape: any = editor.getOnlySelectedShape();
      if (!isVisionGradientShape(shape)) return null;

      // Only show handles when user activated gradient editing in the style panel.
      if (!gradientUi?.shapeId || !gradientUi?.paint) return null;
      if (String(shape.id) !== String(gradientUi.shapeId)) return null;

      const paint = gradientUi.paint;
      const mode = String(paint === 'fill' ? shape.props?.fillMode : shape.props?.strokeMode) || 'solid';
      if (mode !== 'linear') return null;

      // Important: tldraw "screen" coordinates are relative to the editor container.
      // We'll render the overlay in window coordinates (portal to body), so we need
      // to offset by the container's client rect.
      const container: any = (editor as any).getContainer?.() || null;
      const rect = container?.getBoundingClientRect?.();
      if (!rect) return null;

      const w = Math.max(1, Number(shape.props?.w || 1));
      const h = Math.max(1, Number(shape.props?.h || 1));

      const prefix = paint === 'fill' ? 'fillG' : 'strokeG';
      const legacy = { gx0: shape.props?.gx0, gy0: shape.props?.gy0, gx1: shape.props?.gx1, gy1: shape.props?.gy1 };
      const gx0 = clamp01(Number(shape.props?.[`${prefix}x0`] ?? legacy.gx0 ?? 0));
      const gy0 = clamp01(Number(shape.props?.[`${prefix}y0`] ?? legacy.gy0 ?? 0));
      const gx1 = clamp01(Number(shape.props?.[`${prefix}x1`] ?? legacy.gx1 ?? 1));
      const gy1 = clamp01(Number(shape.props?.[`${prefix}y1`] ?? legacy.gy1 ?? 0));

      const t = editor.getShapePageTransform(shape.id);
      const s0 = editor.pageToScreen(t.applyToPoint({ x: gx0 * w, y: gy0 * h }));
      const s1 = editor.pageToScreen(t.applyToPoint({ x: gx1 * w, y: gy1 * h }));
      // Convert to window coordinates for a fixed overlay.
      const p0 = { x: rect.left + Number(s0.x || 0), y: rect.top + Number(s0.y || 0) };
      const p1 = { x: rect.left + Number(s1.x || 0), y: rect.top + Number(s1.y || 0) };
      return { shape, w, h, p0, p1, rect: { left: rect.left, top: rect.top }, paint };
    },
    [editor, gradientUi?.shapeId, gradientUi?.paint],
  );

  const begin = useCallback(
    (which: 'g0' | 'g1', e: React.PointerEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.currentTarget as any).setPointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
      editor.markHistoryStoppingPoint('vision_gradient_handle');
      dragRef.current = { shapeId: String(active.shape.id), which };
      setIsDragging(true);
    },
    [active, editor],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const { shapeId, which } = dragRef.current;
      const shape: any = editor.getShape(shapeId as any);
      if (!shape) return;
      const paint = (active as any)?.paint as 'fill' | 'stroke' | undefined;
      if (!paint) return;
      const w = Math.max(1, Number(shape.props?.w || 1));
      const h = Math.max(1, Number(shape.props?.h || 1));

      // `screenToPage` expects editor-container-relative screen coords.
      const rectLeft = Number((active as any)?.rect?.left ?? 0);
      const rectTop = Number((active as any)?.rect?.top ?? 0);
      const screenPoint = { x: e.clientX - rectLeft, y: e.clientY - rectTop };
      const pagePoint = editor.screenToPage(screenPoint);
      const local = editor.getPointInShapeSpace(shapeId as any, pagePoint);
      const gx = clamp01(Number(local.x || 0) / w);
      const gy = clamp01(Number(local.y || 0) / h);

      const keyX = (paint === 'fill' ? 'fillG' : 'strokeG') + (which === 'g0' ? 'x0' : 'x1');
      const keyY = (paint === 'fill' ? 'fillG' : 'strokeG') + (which === 'g0' ? 'y0' : 'y1');
      const patch = { [keyX]: gx, [keyY]: gy } as any;
      try {
        editor.updateShapes([{ id: shape.id, type: shape.type, props: patch } as any]);
      } catch {
        // ignore
      }
    },
    [editor, active],
  );

  const onUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const ui = useMemo(() => {
    if (!active) return null;
    const x0 = Number(active.p0.x || 0);
    const y0 = Number(active.p0.y || 0);
    const x1 = Number(active.p1.x || 0);
    const y1 = Number(active.p1.y || 0);
    return { x0, y0, x1, y1 };
  }, [active]);

  if (!isMounted || !active || !ui) return null;

  return createPortal(
    <div className="nx-gh" style={{ pointerEvents: 'none' }}>
      <svg className="nx-ghSvg" aria-hidden="true">
        <line x1={ui.x0} y1={ui.y0} x2={ui.x1} y2={ui.y1} className="nx-ghLine" />
      </svg>

      <button
        type="button"
        className={isDragging ? 'nx-ghDot is-dragging' : 'nx-ghDot'}
        style={{ left: ui.x0, top: ui.y0 }}
        onPointerDown={(e) => begin('g0', e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
      />
      <button
        type="button"
        className={isDragging ? 'nx-ghDot is-dragging' : 'nx-ghDot'}
        style={{ left: ui.x1, top: ui.y1 }}
        onPointerDown={(e) => begin('g1', e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
      />
    </div>,
    document.body,
  );
}

