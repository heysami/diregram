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
import { NXPathShapeUtil } from '@/components/vision/tldraw/shapes/NXPathShapeUtil';
import { NxLayoutShapeUtil } from '@/components/vision/tldraw/shapes/NxLayoutShapeUtil';
import { NxRectShapeUtil } from '@/components/vision/tldraw/shapes/NxRectShapeUtil';
import { NxTextShapeUtil } from '@/components/vision/tldraw/shapes/NxTextShapeUtil';
import { NxCardShapeUtil } from '@/components/vision/v2/tldraw/shapes/NxCardShapeUtil';
import { VisionStylePanel } from '@/components/vision/tldraw/ui/VisionStylePanel';
import { VisionHandles } from '@/components/vision/tldraw/ui/VisionHandles';
import { VisionGradientHandles } from '@/components/vision/tldraw/ui/VisionGradientHandles';
import { VisionCanvasToolbar } from '@/components/vision/v2/tldraw/ui/VisionCanvasToolbar';
import { filterVisionCanvasTools } from '@/components/vision/v2/tldraw/toolAllowlist';
import { addVisionCardTool, visionCardTranslations } from '@/components/vision/v2/tldraw/visionCardTool';
import { installAutoConvertVisionShapes } from '@/components/vision/tldraw/installAutoConvertVisionShapes';
import { installNxLayout } from '@/components/vision/tldraw/layout/installNxLayout';

function safeJsonParse<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export type UseTldrawVisionCanvasControllerOpts = {
  initialSnapshot: Partial<TLEditorSnapshot> | null;
  sessionStorageKey: string;
  onChange: (next: { snapshot: Partial<TLEditorSnapshot> }) => void;
  onMountEditor?: (editor: Editor) => void;
};

/**
 * Vision v2 main canvas controller.
 *
 * Invariants:
 * - Use stock tldraw tools (`draw`, `arrow`, `text`, `rectangle`) for stable pointer behavior.
 * - Avoid global capture listeners; keep pointer behavior stable.
 * - Convert stock tldraw shapes to Vision-native `nx*` shapes after creation.
 * - Persist *document-only* snapshots to avoid per-user session churn in markdown.
 */
export function useTldrawVisionCanvasController(opts: UseTldrawVisionCanvasControllerOpts): {
  store: ReturnType<typeof createTLStore>;
  shapeUtils: any[];
  uiOverrides: TLUiOverrides;
  components: TLComponents;
  onMount: (editor: Editor) => void;
} {
  const { initialSnapshot, sessionStorageKey, onChange, onMountEditor } = opts;

  // Keep these stable; unstable props can cause editor re-inits.
  const shapeUtils = useMemo(
    () => [...defaultShapeUtils, NXPathShapeUtil, NxLayoutShapeUtil, NxRectShapeUtil, NxTextShapeUtil, NxCardShapeUtil],
    [],
  );
  const store = useMemo(() => createTLStore({ shapeUtils }), [shapeUtils]);

  const editorRef = useRef<Editor | null>(null);
  const editorCleanupRef = useRef<null | (() => void)>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');
  const hydratingRef = useRef(true);

  const uiOverrides = useMemo<TLUiOverrides>(
    () => ({
      tools: (editor, tools) => {
        const filtered = filterVisionCanvasTools(tools as any) as any;
        return addVisionCardTool(editor, filtered);
      },
      translations: { en: { ...(visionCardTranslations as any).en } } as any,
    }),
    [],
  );

  const components = useMemo<TLComponents>(
    () => ({
      // Hide default top-left menu zone (main menu / quick actions / page menu).
      MenuPanel: null as any,
      PageMenu: null as any,
      QuickActions: null as any,
      ActionsMenu: null as any,
      NavigationPanel: null as any,
      StylePanel: VisionStylePanel as any,
      Handles: VisionHandles as any,
      InFrontOfTheCanvas: VisionGradientHandles as any,
      Toolbar: VisionCanvasToolbar as any,
    }),
    [],
  );

  // Load initial snapshot (document) + per-user session.
  useEffect(() => {
    let cancelled = false;
    hydratingRef.current = true;

    const run = () => {
      if (cancelled) return;

      if (initialSnapshot) {
        try {
          loadSnapshot(store, initialSnapshot);
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

    // Defer off the mount critical path.
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
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
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

            onChange({ snapshot: docOnly });
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
    };
  }, [store, onChange, sessionStorageKey]);

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

      // Main canvas: keep tools stable but auto-convert created shapes to Vision-native `nx*` ones.
      const cleanups: Array<() => void> = [];
      try {
        cleanups.push(installAutoConvertVisionShapes(editor));
      } catch {
        // ignore
      }
      try {
        cleanups.push(installNxLayout(editor));
      } catch {
        // ignore (layout is best-effort)
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

  return { store, shapeUtils, uiOverrides, components, onMount };
}

