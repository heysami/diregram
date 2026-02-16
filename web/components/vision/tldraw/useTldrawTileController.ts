'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createTLStore,
  defaultShapeUtils,
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLEditorSnapshot,
  type TLComponents,
  type TLUiOverrides,
} from 'tldraw';
import { Box } from '@tldraw/editor';
import { DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle } from '@tldraw/editor';
import { NXPathShapeUtil } from '@/components/vision/tldraw/shapes/NXPathShapeUtil';
import { NxRectShapeUtil } from '@/components/vision/tldraw/shapes/NxRectShapeUtil';
import { NxTextShapeUtil } from '@/components/vision/tldraw/shapes/NxTextShapeUtil';
import { NxFxShapeUtil } from '@/components/vision/tldraw/fx/NxFxShapeUtil';
import { installVisionFxProxy } from '@/components/vision/tldraw/fx/installVisionFxProxy';
import { installBooleanEditOnSelect } from '@/components/vision/tldraw/boolean/installBooleanEditOnSelect';
import { installAutoConvertVisionShapes } from '@/components/vision/tldraw/installAutoConvertVisionShapes';
import { VisionStylePanel } from '@/components/vision/tldraw/ui/VisionStylePanel';
import { VisionHandles } from '@/components/vision/tldraw/ui/VisionHandles';
import { VisionGradientHandles } from '@/components/vision/tldraw/ui/VisionGradientHandles';
import { filterVisionTools } from '@/components/vision/tldraw/ui/visionToolAllowlist';
import { VisionToolbar } from '@/components/vision/tldraw/ui/VisionToolbar';
import { isFxVisibilityOverrideActive } from '@/components/vision/tldraw/fx/fxVisibilityOverride';
import { cropAndScaleDataUrl } from '@/lib/vision-thumbs';
import { ensureCoreFrames, findCoreFrameId, syncAnnotatorMirror } from './core/visionCoreSections';
import { isBooleanSourceMeta } from '@/components/vision/tldraw/boolean/booleanSourceState';
import { installAutoRecomputeBooleans } from '@/components/vision/tldraw/boolean/useAutoRecomputeBooleans';

function safeJsonParse<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function exportThumb(editor: Editor, outPx: number): Promise<string | null> {
  try {
    const pageIds = editor.getCurrentPageShapeIds();
    const ids = Array.from(pageIds || []);
    if (ids.length === 0) return null;
    // Guard: exporting a thumb for large docs can hang the tab.
    if (ids.length > 450) return null;

    // Prefer the Thumbnail frame bounds if present.
    const thumbFrameId = findCoreFrameId(editor, 'thumb');
    const b: any = thumbFrameId ? (editor as any).getShapePageBounds?.(thumbFrameId as any) : null;
    const bounds = b ? new Box(Number(b.x || 0), Number(b.y || 0), Number(b.w || b.width || 0), Number(b.h || b.height || 0)) : null;

    const img = await editor.toImage(ids, {
      format: 'png',
      background: true,
      padding: 0,
      pixelRatio: 2,
      scale: 1,
      ...(bounds && (Number(bounds.w) > 0 && Number(bounds.h) > 0) ? { bounds } : null),
    } as any);
    const blob = img?.blob;
    if (!blob) return null;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('Failed to read blob'));
      fr.readAsDataURL(blob);
    });

    const px = Number.isFinite(outPx) ? Math.max(16, Math.min(1024, Math.floor(outPx))) : 256;
    const out = await cropAndScaleDataUrl({ dataUrl, crop: { x: 0, y: 0, w: 1, h: 1 }, outPx: px, fit: 'cover' });
    return out || null;
  } catch {
    return null;
  }
}

export type UseTldrawTileControllerOpts = {
  initialSnapshot: Partial<TLEditorSnapshot> | null;
  sessionStorageKey: string;
  /** Output size for thumbnail PNG (square). */
  thumbOutPx?: number;
  onChange: (next: { snapshot: Partial<TLEditorSnapshot>; thumbPngDataUrl: string | null }) => void;
  onMountEditor?: (editor: Editor) => void;
};

export function useTldrawTileController(opts: UseTldrawTileControllerOpts): {
  store: ReturnType<typeof createTLStore>;
  shapeUtils: any[];
  uiOverrides: TLUiOverrides;
  components: TLComponents;
  getShapeVisibility: (shape: any) => any;
  onMount: (editor: Editor) => void;
} {
  const { initialSnapshot, sessionStorageKey, thumbOutPx = 256, onChange, onMountEditor } = opts;

  // IMPORTANT: keep these stable; unstable props can cause editor re-inits and hangs.
  const shapeUtils = useMemo(() => [...defaultShapeUtils, NXPathShapeUtil, NxRectShapeUtil, NxTextShapeUtil, NxFxShapeUtil], []);
  const store = useMemo(() => createTLStore({ shapeUtils }), [shapeUtils]);

  const editorRef = useRef<Editor | null>(null);
  const editorCleanupRef = useRef<null | (() => void)>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');
  const hydratingRef = useRef(true);
  const lastThumbAtRef = useRef<number>(0);
  const coreMutatingRef = useRef(false);
  const mirrorMutatingRef = useRef(false);
  const mirrorRafRef = useRef<number | null>(null);
  const lastMirrorAtRef = useRef<number>(0);

  const scheduleMirrorSync = useCallback(() => {
    if (hydratingRef.current) return;
    if (mirrorMutatingRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;
    const now = Date.now();
    // Throttle: keep mirroring responsive but cheap.
    if (now - (lastMirrorAtRef.current || 0) < 120) return;
    lastMirrorAtRef.current = now;

    if (mirrorRafRef.current) return;
    mirrorRafRef.current = window.requestAnimationFrame(() => {
      mirrorRafRef.current = null;
      const ed = editorRef.current;
      if (!ed) return;
      mirrorMutatingRef.current = true;
      try {
        const core = ensureCoreFrames(ed);
        syncAnnotatorMirror(ed, { assetId: core.assetId, annotatorId: core.annotatorId });
      } catch {
        // ignore
      } finally {
        // Let any resulting store updates settle before allowing another run.
        window.setTimeout(() => {
          mirrorMutatingRef.current = false;
        }, 0);
      }
    });
  }, []);

  const uiOverrides = useMemo<TLUiOverrides>(
    () => ({
      tools: (_editor, tools) => {
        const filtered = filterVisionTools(tools as any) as any;
        return filtered;
      },
    }),
    [],
  );

  const components = useMemo<TLComponents>(
    () => ({
      // Hide page UI + quick actions. The nested editor should feel like a single-canvas editor.
      MenuPanel: null as any,
      PageMenu: null as any,
      QuickActions: null as any,
      ActionsMenu: null as any,
      NavigationPanel: null as any,
      StylePanel: VisionStylePanel as any,
      Handles: VisionHandles as any,
      InFrontOfTheCanvas: VisionGradientHandles as any,
      Toolbar: VisionToolbar as any,
    }),
    [],
  );

  // Load initial snapshot (document) + per-user session.
  useEffect(() => {
    let cancelled = false;
    hydratingRef.current = true;

    const run = () => {
      if (cancelled) return;

      const snap = initialSnapshot;
      if (snap) {
        try {
          loadSnapshot(store, snap);
        } catch {
          // ignore
        }
      }

      try {
        const fromStorage = localStorage.getItem(sessionStorageKey);
        const session = fromStorage ? safeJsonParse<any>(fromStorage) : null;
        if (session) loadSnapshot(store, { session });
      } catch {
        // ignore
      }

      // Stop treating subsequent store events as "initial hydration".
      window.setTimeout(() => {
        hydratingRef.current = false;
      }, 0);
    };

    // Defer snapshot apply off the mount critical path.
    try {
      if (typeof (window as any).requestIdleCallback === 'function') {
        const id = (window as any).requestIdleCallback(run, { timeout: 450 });
        return () => {
          cancelled = true;
          try {
            if (typeof (window as any).cancelIdleCallback === 'function') (window as any).cancelIdleCallback(id);
          } catch {
            // ignore
          }
        };
      }
    } catch {
      // ignore
    }

    const t = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist doc changes (document-scope only).
  useEffect(() => {
    const cleanup = store.listen(
      () => {
        if (hydratingRef.current) return;
        // Keep the annotator mirror in sync continuously (do not wait for save debounce).
        scheduleMirrorSync();

        if (coreMutatingRef.current) return;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(async () => {
          saveTimerRef.current = null;
          try {
            const snap = getSnapshot(store);
            const docOnly: Partial<TLEditorSnapshot> = { document: snap.document };
            const key = JSON.stringify(docOnly.document || {});
            if (key === lastSavedRef.current) return;
            lastSavedRef.current = key;

            try {
              localStorage.setItem(sessionStorageKey, JSON.stringify(snap.session || {}));
            } catch {
              // ignore
            }

            const editor = editorRef.current;
            // Ensure core frames exist and keep annotator mirror synced.
            if (editor) {
              try {
                coreMutatingRef.current = true;
                const core = ensureCoreFrames(editor);
                syncAnnotatorMirror(editor, { assetId: core.assetId, annotatorId: core.annotatorId });
              } catch {
                // ignore
              } finally {
                window.setTimeout(() => {
                  coreMutatingRef.current = false;
                }, 50);
              }
            }

            const now = Date.now();
            const shouldThumb = now - (lastThumbAtRef.current || 0) > 6000;
            const thumb = editor && shouldThumb ? await exportThumb(editor, thumbOutPx) : null;
            if (thumb) lastThumbAtRef.current = now;
            onChange({ snapshot: docOnly, thumbPngDataUrl: thumb });
          } catch {
            // ignore
          }
        }, 650);
      },
      { scope: 'document' as any },
    );
    return () => {
      try {
        cleanup?.();
      } catch {
        // ignore
      }
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (mirrorRafRef.current) {
        try {
          window.cancelAnimationFrame(mirrorRafRef.current);
        } catch {
          // ignore
        }
      }
      mirrorRafRef.current = null;
      mirrorMutatingRef.current = false;
    };
  }, [store, onChange, sessionStorageKey, scheduleMirrorSync]);

  const getShapeVisibility = useCallback((shape: any) => {
    const meta: any = (shape as any)?.meta || null;

    // Boolean sources should never render while the boolean is active/bundled.
    // We still keep them in the document so the boolean can be recomputed and unbundled later.
    if (isBooleanSourceMeta(meta)) return 'hidden';

    const hidden = meta?.hidden === true;
    if (!hidden) return 'inherit';

    // During effect rasterization we need hidden shapes (non-boolean) to be visible for exports.
    if (isFxVisibilityOverrideActive()) return 'inherit';
    return 'hidden';
  }, []);

  // Cleanup editor-side listeners when unmounting / remounting editor.
  useEffect(() => {
    return () => {
      try {
        editorCleanupRef.current?.();
      } catch {
        // ignore
      }
      editorCleanupRef.current = null;
    };
  }, []);

  const onMount = useCallback(
    (editor: Editor) => {
      // Guard: avoid repeated mount side-effects if onMount fires more than once.
      if (editorRef.current === editor) return;
      editorRef.current = editor;

      // Clean up any listeners attached to a previous editor instance.
      try {
        editorCleanupRef.current?.();
      } catch {
        // ignore
      }
      editorCleanupRef.current = null;

      try {
        editor.setStyleForNextShapes(DefaultDashStyle as any, 'solid' as any);
        editor.setStyleForNextShapes(DefaultFillStyle as any, 'solid' as any);
        editor.setStyleForNextShapes(DefaultSizeStyle as any, 'm' as any);
        editor.setCurrentTool('select');
      } catch {
        // ignore
      }

      // Core sections (3 non-deletable, resizable frames) + mirror sync.
      try {
        coreMutatingRef.current = true;
        const core = ensureCoreFrames(editor);
        syncAnnotatorMirror(editor, { assetId: core.assetId, annotatorId: core.annotatorId });
      } catch {
        // ignore
      } finally {
        window.setTimeout(() => {
          coreMutatingRef.current = false;
        }, 50);
      }

      // Boolean UX: clicking a non-destructive boolean result should "select sources" instead of
      // fighting hit-testing. We do this by (a) revealing sources, (b) selecting sources,
      // (c) moving sources above the result while editing, and (d) restoring when selection leaves.
      const cleanups: Array<() => void> = [];
      try {
        cleanups.push(installAutoConvertVisionShapes(editor));
      } catch {
        // ignore
      }
      try {
        cleanups.push(installBooleanEditOnSelect(editor));
      } catch {
        // ignore (boolean UX is best-effort)
      }
      try {
        // Always-on recompute for non-destructive booleans (must not depend on any panel being mounted).
        cleanups.push(installAutoRecomputeBooleans(editor));
      } catch {
        // ignore
      }
      try {
        cleanups.push(installVisionFxProxy(editor));
      } catch {
        // ignore (fx proxy is best-effort)
      }

      editorCleanupRef.current = () => {
        for (const fn of cleanups) {
          try {
            fn?.();
          } catch {
            // ignore
          }
        }
      };

      try {
        onMountEditor?.(editor);
      } catch {
        // ignore
      }
    },
    [onMountEditor],
  );

  return { store, shapeUtils, uiOverrides, components, getShapeVisibility, onMount };
}

