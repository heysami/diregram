'use client';

import { useEffect, useRef, useState } from 'react';

type FabricModule = any;

export type FabricCanvasApi = {
  canvas: any;
  fabric: any;
  exportThumb: (thumbPx: number) => string | null;
  exportPng: () => string | null;
  getJson: () => unknown;
  setBackgroundImageFromUrl: (url: string, opts?: { lock?: boolean }) => Promise<void>;
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureLayerIds(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  try {
    if (!obj.data || typeof obj.data !== 'object') obj.data = {};
    if (typeof obj.data.layerId !== 'string' || !obj.data.layerId) obj.data.layerId = uid('layer');
  } catch {
    // ignore
  }
  const kids = Array.isArray(obj._objects) ? obj._objects : [];
  kids.forEach((k: any) => ensureLayerIds(k));
}

function collectFontsFromCanvas(canvas: any): string[] {
  if (!canvas) return [];
  const objs = canvas.getObjects?.() || [];
  const out = new Set<string>();
  objs.forEach((o: any) => {
    const ff = o?.fontFamily;
    if (typeof ff === 'string' && ff.trim()) out.add(ff.trim());
  });
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

export function FabricCanvas({
  width,
  height,
  initialJson,
  backgroundColor = '#ffffff',
  showBorder = true,
  className = '',
  onReady,
  onChange,
}: {
  width: number;
  height: number;
  initialJson?: unknown;
  /** Canvas background color (use `'transparent'` for overlays). */
  backgroundColor?: string;
  /** Render a border around the canvas host. */
  showBorder?: boolean;
  /** Extra classes for the host element. */
  className?: string;
  onReady?: (api: FabricCanvasApi) => void;
  onChange?: (next: { json: unknown; fonts: string[] }) => void;
}) {
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<FabricCanvasApi | null>(null);
  // Only apply initial JSON on first mount; subsequent edits are driven by Fabric events.
  const initialJsonRef = useRef<unknown>(initialJson);
  const onReadyRef = useRef<typeof onReady>(onReady);
  const onChangeRef = useRef<typeof onChange>(onChange);

  // Debounce change emits (Fabric can fire a lot of events).
  const emitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let disposed = false;
    let canvas: any = null;
    let cleanupExtras: (() => void) | null = null;
    let hostEl: HTMLDivElement | null = null;
    let canvasEl: HTMLCanvasElement | null = null;

    const cleanup = () => {
      if (emitTimerRef.current) window.clearTimeout(emitTimerRef.current);
      emitTimerRef.current = null;
      try {
        canvas?.dispose?.();
      } catch {
        // ignore
      }
      canvas = null;
      setApi(null);
      // IMPORTANT: Fabric mutates DOM (wraps canvas in a container). Clear host so React
      // doesn't reconcile against a mutated subtree (can cause "draws but invisible").
      try {
        if (hostEl) hostEl.innerHTML = '';
      } catch {
        // ignore
      }
      canvasEl = null;
      hostEl = null;
    };

    (async () => {
      hostEl = containerElRef.current;
      if (!hostEl) return;

      // Create the <canvas> imperatively so React never "owns" it.
      // Fabric wraps/moves the canvas element, which can confuse React reconciliation.
      canvasEl = document.createElement('canvas');
      hostEl.appendChild(canvasEl);

      const mod: FabricModule = await import('fabric');
      const fabric: any = (mod as any).fabric || mod;

      if (disposed) return;

      // Prevent touch/pointer gestures from being interpreted as scrolling/zooming.
      // (Harmless on desktop; important for trackpads + touch devices.)
      try {
        (canvasEl.style as any).touchAction = 'none';
      } catch {
        // ignore
      }

      // IMPORTANT:
      // Fabric pointer mapping relies on the canvas element's CSS size matching
      // the internal drawing surface. Do not apply `w-full h-full` styles to the
      // <canvas> element; set dimensions through Fabric instead.
      canvas = new fabric.Canvas(canvasEl, {
        preserveObjectStacking: true,
        backgroundColor: backgroundColor || 'transparent',
        width,
        height,
      });
      // Fabric v7+ uses setDimensions; older versions may still expose setWidth/setHeight.
      // Set both backstore and CSS sizes to match.
      try {
        if (typeof canvas.setDimensions === 'function') {
          canvas.setDimensions({ width, height });
        } else {
          canvas.setWidth?.(width);
          canvas.setHeight?.(height);
        }
      } catch {
        // ignore
      }

      // Offsets can be wrong if layout isn't settled yet (causes "draw then vanish").
      // Recalculate after a tick and on resize/scroll/layout changes.
      const recalc = () => {
        try {
          canvas.calcOffset?.();
        } catch {
          // ignore
        }
      };
      const raf = window.requestAnimationFrame(() => recalc());
      const t1 = window.setTimeout(() => recalc(), 0);
      const t2 = window.setTimeout(() => recalc(), 250);

      const onResize = () => recalc();
      window.addEventListener('resize', onResize);

      // Capture scroll from any scroll container (not just window).
      const onAnyScroll = () => recalc();
      window.addEventListener('scroll', onAnyScroll, true);

      // Also observe container size changes (flex/layout shifts).
      let ro: ResizeObserver | null = null;
      try {
        const containerEl = hostEl;
        if (containerEl && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => recalc());
          ro.observe(containerEl);
        }
      } catch {
        // ignore
      }

      const exportPng = () => {
        try {
          return canvas.toDataURL({ format: 'png' });
        } catch {
          return null;
        }
      };

      const exportThumb = (thumbPx: number) => {
        try {
          const w = canvas.getWidth?.() || width;
          const mult = w > 0 ? thumbPx / w : 0.05;
          return canvas.toDataURL({ format: 'png', multiplier: mult });
        } catch {
          return null;
        }
      };

      const getJson = () => {
        try {
          // Persist lightweight metadata we attach to objects (e.g. boolean ops bundle ids).
          return canvas.toJSON(['name', 'data']);
        } catch {
          return null;
        }
      };

      const setBackgroundImageFromUrl = async (url: string, opts?: { lock?: boolean }) => {
        if (!url) return;
        await new Promise<void>((resolve) => {
          fabric.Image.fromURL(
            url,
            (img: any) => {
              if (!img) return resolve();
              const cw = canvas.getWidth();
              const ch = canvas.getHeight();
              const iw = img.width || 1;
              const ih = img.height || 1;
              const scale = Math.min(cw / iw, ch / ih);
              img.set({
                left: (cw - iw * scale) / 2,
                top: (ch - ih * scale) / 2,
                scaleX: scale,
                scaleY: scale,
              });
              if (opts?.lock) {
                img.set({
                  selectable: false,
                  evented: false,
                  hasControls: false,
                  hasBorders: false,
                  lockMovementX: true,
                  lockMovementY: true,
                  lockRotation: true,
                  lockScalingX: true,
                  lockScalingY: true,
                });
                img.name = 'backgroundImage';
              }
              canvas.add(img);
              if (opts?.lock) canvas.sendToBack(img);
              canvas.requestRenderAll();
              resolve();
            },
            { crossOrigin: 'anonymous' },
          );
        });
      };

      const nextApi: FabricCanvasApi = {
        canvas,
        fabric,
        exportThumb,
        exportPng,
        getJson,
        setBackgroundImageFromUrl,
      };
      setApi(nextApi);
      onReadyRef.current?.(nextApi);

      // Load initial JSON after API is ready.
      if (initialJsonRef.current) {
        try {
          canvas.loadFromJSON(initialJsonRef.current, () => {
            // Ensure stable ids for layer UI and boolean bundles.
            try {
              (canvas.getObjects?.() || []).forEach((o: any) => ensureLayerIds(o));
            } catch {
              // ignore
            }
            canvas.requestRenderAll();
          });
        } catch {
          // ignore
        }
      }

      const scheduleEmit = () => {
        if (!onChangeRef.current) return;
        if (emitTimerRef.current) window.clearTimeout(emitTimerRef.current);
        emitTimerRef.current = window.setTimeout(() => {
          emitTimerRef.current = null;
          onChangeRef.current?.({ json: getJson(), fonts: collectFontsFromCanvas(canvas) });
        }, 180);
      };

      const onAdded = (opt: any) => {
        try {
          const target = opt?.target;
          if (target) ensureLayerIds(target);
        } catch {
          // ignore
        }
        scheduleEmit();
      };

      canvas.on('object:added', onAdded);
      canvas.on('object:modified', scheduleEmit);
      canvas.on('object:removed', scheduleEmit);
      canvas.on('text:changed', scheduleEmit);
      canvas.on('path:created', scheduleEmit);

      // Cleanup resize listeners for this canvas instance.
      cleanupExtras = () => {
        try {
          window.cancelAnimationFrame(raf);
        } catch {
          // ignore
        }
        try {
          window.clearTimeout(t1);
          window.clearTimeout(t2);
        } catch {
          // ignore
        }
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onAnyScroll, true);
        try {
          ro?.disconnect?.();
        } catch {
          // ignore
        }
        ro = null;
        try {
          canvas?.off?.('object:added', onAdded);
        } catch {
          // ignore
        }
      };
    })();

    return () => {
      disposed = true;
      try {
        cleanupExtras?.();
      } catch {
        // ignore
      }
      cleanup();
    };
  }, [width, height, backgroundColor]);

  return (
    <div
      ref={containerElRef}
      className={`shrink-0 ${showBorder ? 'border' : ''} ${className || ''}`}
      style={{ width, height, backgroundColor: backgroundColor || 'transparent' }}
    />
  );
}

