'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, useValue } from 'tldraw';
import { clamp01 } from '@/components/vision/tldraw/ui/gradient-handles/math';
import { useVisionGradientUiState } from '@/components/vision/tldraw/ui/gradient-handles/visionGradientUiStore';
import { parseFillLayers, parseStrokeLayers, serializeFillLayers, serializeStrokeLayers } from '@/components/vision/tldraw/paint/nxPaintLayers';
import { readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { useFxInteractionState } from '@/components/vision/tldraw/fx/fxInteractionStore';

function isVisionGradientShape(shape: any) {
  if (!shape) return false;
  if (shape.type !== 'nxtext' && shape.type !== 'nxrect' && shape.type !== 'nxpath' && shape.type !== 'nxlayout') return false;
  return true;
}

export function VisionGradientHandles() {
  const editor = useEditor();
  const dragRef = useRef<{ shapeId: string; which: 'g0' | 'g1' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const gradientUi = useVisionGradientUiState();
  const fxInteraction = useFxInteractionState();

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
      const layerId = String((gradientUi as any).layerId || '');
      const legacyMode = String(paint === 'fill' ? shape.props?.fillMode : shape.props?.strokeMode) || 'solid';
      const layers =
        paint === 'fill'
          ? parseFillLayers(shape.props?.fills) || null
          : (parseStrokeLayers(shape.props?.strokes) as any) || null;
      const activeLayer = layerId && layers ? (layers as any[]).find((l) => String(l?.id || '') === layerId) : null;
      const mode = String(activeLayer?.mode || legacyMode) || 'solid';
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
      const legacyGx0 = clamp01(Number(shape.props?.[`${prefix}x0`] ?? legacy.gx0 ?? 0));
      const legacyGy0 = clamp01(Number(shape.props?.[`${prefix}y0`] ?? legacy.gy0 ?? 0));
      const legacyGx1 = clamp01(Number(shape.props?.[`${prefix}x1`] ?? legacy.gx1 ?? 1));
      const legacyGy1 = clamp01(Number(shape.props?.[`${prefix}y1`] ?? legacy.gy1 ?? 0));
      const gx0 = clamp01(Number(activeLayer?.gx0 ?? legacyGx0));
      const gy0 = clamp01(Number(activeLayer?.gy0 ?? legacyGy0));
      const gx1 = clamp01(Number(activeLayer?.gx1 ?? legacyGx1));
      const gy1 = clamp01(Number(activeLayer?.gy1 ?? legacyGy1));

      const t = editor.getShapePageTransform(shape.id);
      const s0 = editor.pageToScreen(t.applyToPoint({ x: gx0 * w, y: gy0 * h }));
      const s1 = editor.pageToScreen(t.applyToPoint({ x: gx1 * w, y: gy1 * h }));
      // Convert to window coordinates for a fixed overlay.
      const p0 = { x: rect.left + Number(s0.x || 0), y: rect.top + Number(s0.y || 0) };
      const p1 = { x: rect.left + Number(s1.x || 0), y: rect.top + Number(s1.y || 0) };
      return { shape, w, h, p0, p1, rect: { left: rect.left, top: rect.top }, paint, layerId: layerId || null };
    },
    [editor, gradientUi?.shapeId, gradientUi?.paint, (gradientUi as any)?.layerId],
  );

  const maskIndicator = useValue(
    'visionMaskIndicator',
    () => {
      const only: any = editor.getOnlySelectedShape();
      if (!only) return null;
      const fx = readNxFxFromMeta((only as any).meta) || null;
      const ds = Array.isArray((fx as any)?.distortions) ? (fx as any).distortions : [];
      const m = ds.find((d: any) => d && d.kind === 'mask' && d.enabled !== false) || null;
      const maskId = typeof (m as any)?.sourceId === 'string' ? String((m as any).sourceId) : '';
      if (!maskId) return null;

      // Container rect to convert editor screen coords -> window coords.
      const container: any = (editor as any).getContainer?.() || null;
      const rect = container?.getBoundingClientRect?.();
      if (!rect) return null;

      // Use page bounds as a cheap, stable visual indicator.
      const b: any = (editor as any).getShapePageBounds?.(maskId as any) || null;
      if (!b) return null;
      const x = Number(b.x ?? b.minX ?? 0);
      const y = Number(b.y ?? b.minY ?? 0);
      const w = Number(b.w ?? b.width ?? 0);
      const h = Number(b.h ?? b.height ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
      if (w <= 0 || h <= 0) return null;

      const p0s = editor.pageToScreen({ x, y });
      const p1s = editor.pageToScreen({ x: x + w, y: y + h });
      const left = rect.left + Number(p0s.x || 0);
      const top = rect.top + Number(p0s.y || 0);
      const right = rect.left + Number(p1s.x || 0);
      const bottom = rect.top + Number(p1s.y || 0);
      const sw = Math.max(1, right - left);
      const sh = Math.max(1, bottom - top);
      return { left, top, width: sw, height: sh, maskId };
    },
    [editor],
  );

  const fxGhostIndicator = useValue(
    'visionFxGhostIndicator',
    () => {
      if (!fxInteraction.active) return null;
      const only: any = editor.getOnlySelectedShape();
      if (!only) return null;

      const fx = readNxFxFromMeta((only as any).meta) || null;
      const effects = Array.isArray((fx as any)?.effects) ? (fx as any).effects : [];
      const distortions = Array.isArray((fx as any)?.distortions) ? (fx as any).distortions : [];
      const hasAnyFx = effects.length > 0 || distortions.length > 0;
      if (!hasAnyFx) return null;

      // Only show when this shape actually uses a proxy path (alpha mask or other effects/distortions).
      const requiresProxy =
        effects.length > 0 ||
        distortions.some((d: any) => d && d.kind !== 'mask') ||
        distortions.some((d: any) => d && d.kind === 'mask' && d.enabled !== false && String((d as any).mode || 'alpha') !== 'shape');
      if (!requiresProxy) return null;

      const container: any = (editor as any).getContainer?.() || null;
      const rect = container?.getBoundingClientRect?.();
      if (!rect) return null;

      const b: any = (editor as any).getShapePageBounds?.(only.id as any) || null;
      if (!b) return null;
      const x = Number(b.x ?? b.minX ?? 0);
      const y = Number(b.y ?? b.minY ?? 0);
      const w = Number(b.w ?? b.width ?? 0);
      const h = Number(b.h ?? b.height ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
      if (w <= 0 || h <= 0) return null;

      const p0s = editor.pageToScreen({ x, y });
      const p1s = editor.pageToScreen({ x: x + w, y: y + h });
      const left = rect.left + Number(p0s.x || 0);
      const top = rect.top + Number(p0s.y || 0);
      const right = rect.left + Number(p1s.x || 0);
      const bottom = rect.top + Number(p1s.y || 0);
      const sw = Math.max(1, right - left);
      const sh = Math.max(1, bottom - top);
      return { left, top, width: sw, height: sh };
    },
    [editor, fxInteraction.active],
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
      const layerId = String((active as any)?.layerId || '');
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

      let patch: any = null;
      if (layerId) {
        if (paint === 'fill') {
          const layers = parseFillLayers(shape.props?.fills) || [];
          const idx = layers.findIndex((l) => String((l as any)?.id || '') === layerId);
          if (idx >= 0) {
            const prev = layers[idx] as any;
            layers[idx] = { ...prev, ...(which === 'g0' ? { gx0: gx, gy0: gy } : { gx1: gx, gy1: gy }) };
            patch = { fills: serializeFillLayers(layers) };
          }
        } else {
          const layers = parseStrokeLayers(shape.props?.strokes) || [];
          const idx = layers.findIndex((l) => String((l as any)?.id || '') === layerId);
          if (idx >= 0) {
            const prev = layers[idx] as any;
            layers[idx] = { ...prev, ...(which === 'g0' ? { gx0: gx, gy0: gy } : { gx1: gx, gy1: gy }) };
            patch = { strokes: serializeStrokeLayers(layers as any) };
          }
        }
      } else {
        const keyX = (paint === 'fill' ? 'fillG' : 'strokeG') + (which === 'g0' ? 'x0' : 'x1');
        const keyY = (paint === 'fill' ? 'fillG' : 'strokeG') + (which === 'g0' ? 'y0' : 'y1');
        patch = { [keyX]: gx, [keyY]: gy } as any;
      }
      try {
        if (patch) editor.updateShapes([{ id: shape.id, type: shape.type, props: patch } as any]);
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

  if (!isMounted) return null;

  return createPortal(
    <>
      {fxGhostIndicator ? (
        <>
          <div
            style={{
              position: 'fixed',
              pointerEvents: 'none',
              left: fxGhostIndicator.left,
              top: fxGhostIndicator.top,
              width: fxGhostIndicator.width,
              height: fxGhostIndicator.height,
              border: '2px dashed rgba(0,0,0,0.35)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.65)',
              borderRadius: 8,
              opacity: 0.95,
            }}
            aria-hidden="true"
          />
          <div
            style={{
              position: 'fixed',
              pointerEvents: 'none',
              left: fxGhostIndicator.left + 8,
              top: fxGhostIndicator.top - 18,
              fontSize: 11,
              fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(0,0,0,0.12)',
              padding: '2px 6px',
              borderRadius: 999,
              color: 'rgba(0,0,0,0.7)',
            }}
            aria-hidden="true"
          >
            FX preview (release to render)
          </div>
        </>
      ) : null}

      {maskIndicator ? (
        <div
          style={{
            position: 'fixed',
            pointerEvents: 'none',
            left: maskIndicator.left,
            top: maskIndicator.top,
            width: maskIndicator.width,
            height: maskIndicator.height,
            border: '2px dashed var(--color-selected)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
            borderRadius: 6,
            opacity: 0.9,
          }}
          aria-hidden="true"
        />
      ) : null}

      {active && ui ? (
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
        </div>
      ) : null}
    </>,
    document.body,
  );
}

