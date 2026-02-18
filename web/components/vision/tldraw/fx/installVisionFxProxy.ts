'use client';

import type { Editor, TLShapeId } from 'tldraw';
import { createShapeId } from '@tldraw/tlschema';
import { readNxFxFromMeta, isNxFxEmpty } from '@/components/vision/tldraw/fx/nxfxTypes';
import { getNxFxRaster, setNxFxRaster, clearAllNxFxRasters } from '@/components/vision/tldraw/fx/nxFxRasterCache';
import { renderNodeToPngUrl } from '@/components/vision/tldraw/fx/raster/renderNode';
import { withFxVisibilityOverride } from '@/components/vision/tldraw/fx/fxVisibilityOverride';
import { computeExpandedBoundsForFx, getParentSpacePoint, getShapePageBounds } from '@/components/vision/tldraw/fx/proxy/proxyBounds';
import { computeRenderSignature } from '@/components/vision/tldraw/fx/proxy/proxySignature';
import { collectAllDescendants, debounce, getAllPageShapeIds, getProxySourceId, isEditMode, isGroupLike, isProxy } from '@/components/vision/tldraw/fx/proxy/proxyUtil';
import { setHiddenForSubtree, setProxyReadyFlag } from '@/components/vision/tldraw/fx/proxy/proxyVisibility';
import { setFxInteractionActive } from '@/components/vision/tldraw/fx/fxInteractionStore';
import { withTimeout } from '@/components/vision/tldraw/fx/proxy/fxProxyTimeout';
import { requiresFxProxy } from '@/components/vision/tldraw/fx/proxy/fxProxyEligibility';
import { computeFxRasterParams } from '@/components/vision/tldraw/fx/proxy/fxProxyRasterParams';
import { startFxInteractionMonitor } from '@/components/vision/tldraw/fx/proxy/fxProxyInteractionMonitor';

function setEditMode(editor: Editor, sourceId: TLShapeId, enabled: boolean): void {
  const s: any = editor.getShape(sourceId as any);
  if (!s) return;
  const meta = { ...(s.meta || {}) };
  // IMPORTANT: tldraw merges meta patches; omitting/deleting keys does not reliably clear them.
  // Use explicit boolean so toggling edit mode is always reversible.
  meta.nxFxEditMode = enabled ? true : false;
  editor.updateShapes([{ id: sourceId as any, type: s.type, meta } as any]);
}

export function installVisionFxProxy(editor: Editor): () => void {
  let disposed = false;
  let syncing = false;
  const inFlight = new Map<string, number>(); // sourceId -> token
  let proxiesBySourceCache = new Map<string, string>();
  const lastRenderedSig = new Map<string, string>(); // sourceId -> signature
  const lastEditMode = new Map<string, boolean>(); // sourceId -> wasEditMode
  let redirectingSelection = false;
  let interactionActive = false;
  let interactionCleanup: null | (() => void) = null;

  const scheduleSync = debounce(() => {
    if (disposed) return;
    if (syncing) return;
    syncNow().catch(() => {});
  }, 250);

  const scheduleRender = debounce(() => {
    if (disposed) return;
    renderDirty().catch(() => {});
  }, 350);

  let dirtySources = new Set<string>();

  async function renderForSource(sourceId: string, proxyId: string): Promise<boolean> {
    const token = (inFlight.get(sourceId) || 0) + 1;
    inFlight.set(sourceId, token);
    const { maxDim, pixelRatio } = computeFxRasterParams(editor, sourceId);
    const sigAtStart = (() => {
      try {
        const s: any = editor.getShape(sourceId as any);
        return s ? computeRenderSignature(editor, s) : '';
      } catch {
        return '';
      }
    })();
    // IMPORTANT: FX rasterization temporarily makes hidden shapes visible for SVG export.
    // If export/decode ever hangs, the override would "stick" and hidden shapes (including boolean sources)
    // would remain visible. Guard with a timeout.
    const res = await withFxVisibilityOverride(() =>
      withTimeout(renderNodeToPngUrl(editor, sourceId, { pixelRatio, maxDim }), 8000),
    );
    if (!res) {
      return false;
    }
    if (disposed) return false;
    if (inFlight.get(sourceId) !== token) return false; // superseded

    setNxFxRaster(proxyId, { url: res.url, pixelWidth: res.pixelWidth, pixelHeight: res.pixelHeight, updatedAt: Date.now() });

    // Bump proxy rev so it re-renders and picks up cache.
    try {
      const p: any = editor.getShape(proxyId as any);
      if (p) {
        editor.updateShapes([
          {
            id: p.id,
            type: p.type,
            props: { ...(p.props || {}), rev: (Number(p.props?.rev || 0) + 1) % 1_000_000_000 },
          } as any,
        ]);
      }
    } catch {
      // ignore
    }
    // Mark what we rendered; if it changed during render, keep it dirty.
    try {
      const sNow: any = editor.getShape(sourceId as any);
      const sigNow = sNow ? computeRenderSignature(editor, sNow) : '';
      if (sigAtStart && sigNow && sigAtStart === sigNow) lastRenderedSig.set(String(sourceId), sigAtStart);
      else dirtySources.add(String(sourceId));
    } catch {
      // ignore
    }
    // Swap visibility now that we have a raster.
    try {
      scheduleSync();
    } catch {
      // ignore
    }
    return true;
  }

  async function renderDirty() {
    // While interacting (drag/resize/rotate), keep showing the vector source "ghost"
    // and wait until interaction ends to do the expensive raster render.
    if (interactionActive) {
      if (dirtySources.size) scheduleRender();
      return;
    }
    const batch = Array.from(dirtySources);
    const nextDirty = new Set<string>();
    for (const sourceId of batch) {
      if (disposed) return;
      const source: any = editor.getShape(sourceId as any);
      if (!source) continue;
      const fx = readNxFxFromMeta(source.meta);
      if (isNxFxEmpty(fx)) continue;
      if (!requiresFxProxy(editor, source)) continue;
      if (isEditMode(source)) continue;

      // Find proxy for source (cached from last sync).
      const proxyId: string | null = proxiesBySourceCache.get(String(sourceId)) || null;
      if (!proxyId) {
        // Proxy may not be created yet; keep dirty so we retry.
        nextDirty.add(String(sourceId));
        continue;
      }
      try {
        const ok = await renderForSource(sourceId, proxyId);
        if (!ok) nextDirty.add(String(sourceId));
      } catch {
        // Keep dirty so we retry later.
        nextDirty.add(String(sourceId));
      }
    }
    dirtySources = nextDirty;
    // Keep retrying while something is still dirty (e.g. transient export/decode issues).
    if (dirtySources.size) scheduleRender();
  }

  async function syncNow() {
    if (disposed) return;
    if (syncing) return;
    syncing = true;
    try {

    // Build maps.
    const topIds = getAllPageShapeIds(editor);
    const allIds = collectAllDescendants(editor, topIds);

    const proxiesBySource = new Map<string, string>();
    for (const id of allIds) {
      const s: any = editor.getShape(id as any);
      if (!s || !isProxy(s)) continue;
      const sid = getProxySourceId(s);
      if (sid) proxiesBySource.set(sid, String(s.id));
    }

    // Cleanup: delete proxies whose source no longer exists.
    for (const [sid, pid] of Array.from(proxiesBySource.entries())) {
      const src: any = editor.getShape(sid as any);
      if (src) continue;
      try {
        editor.deleteShapes([pid as any]);
      } catch {
        // ignore
      }
      try {
        setNxFxRaster(pid, null);
      } catch {
        // ignore
      }
      proxiesBySource.delete(sid);
    }

    // If a group has fx (and is not in edit mode) we replace its entire subtree with a single proxy.
    // In that case, nested child proxies must stay hidden to avoid double-drawing.
    const coveredByAncestorFx = new Set<string>();
    for (const id of allIds) {
      const s: any = editor.getShape(id as any);
      if (!s || isProxy(s)) continue;
      const fx = readNxFxFromMeta(s.meta);
      const needsProxy = requiresFxProxy(editor, s);
      if (!needsProxy) continue;
      if (isEditMode(s)) continue;
      // Mark descendants as covered.
      let kids: string[] = [];
      try {
        kids = ((editor as any).getShapeAndDescendantIds?.(s.id as any) || []).map(String);
      } catch {
        kids = [];
      }
      for (const k of kids) {
        if (String(k) === String(s.id)) continue;
        coveredByAncestorFx.add(String(k));
      }
    }

    // Hide proxies whose sources are covered by an ancestor-fx group (avoid double-drawing / confusing layers).
    for (const [sid, pid] of Array.from(proxiesBySource.entries())) {
      if (!coveredByAncestorFx.has(String(sid))) continue;
      try {
        const p: any = editor.getShape(pid as any);
        if (!p) continue;
        if (p?.meta?.hidden === true) continue;
        editor.updateShapes([{ id: p.id, type: p.type, meta: { ...(p.meta || {}), hidden: true } } as any]);
      } catch {
        // ignore
      }
    }

    // Find sources needing proxies.
    let fxSourceCount = 0;
    let createdProxyCount = 0;
    let mirrorFxSourceCount = 0;
    let mirrorFxSourceLockedParentCount = 0;
    let proxyCreateFailedCount = 0;
    for (const id of allIds) {
      const s: any = editor.getShape(id as any);
      if (!s || isProxy(s)) continue;
      if (coveredByAncestorFx.has(String(s.id))) continue;

      const fx = readNxFxFromMeta(s.meta);
      const needsProxy = requiresFxProxy(editor, s);
      if (needsProxy) fxSourceCount++;
      if (needsProxy && typeof s?.meta?.nxMirrorSourceId === 'string' && s.meta.nxMirrorSourceId) {
        mirrorFxSourceCount++;
        try {
          const parent: any = s.parentId ? editor.getShape(s.parentId as any) : null;
          if (parent?.isLocked === true) mirrorFxSourceLockedParentCount++;
        } catch {
          // ignore
        }
      }
      const proxyId = proxiesBySource.get(String(s.id)) || null;
      const wasEdit = lastEditMode.get(String(s.id)) || false;
      const nowEdit = isEditMode(s);
      lastEditMode.set(String(s.id), nowEdit);

      if (!needsProxy) {
        // Remove proxy if it exists (vector mask path does not use proxies).
        if (proxyId) {
          try {
            editor.deleteShapes([proxyId as any]);
          } catch {
            // ignore
          }
          setNxFxRaster(proxyId, null);
          proxiesBySource.delete(String(s.id));
        }
        // Ensure visible.
        try {
          setHiddenForSubtree(editor, s.id, false);
        } catch {
          // ignore
        }
        lastRenderedSig.delete(String(s.id));
        // Ensure proxyReady flag is cleared so vector source render isn't suppressed.
        try {
          setProxyReadyFlag(editor, s, false);
        } catch {
          // ignore
        }
        continue;
      }

      // Ensure proxy exists.
      let pid = proxyId;
      if (!pid) {
        const newId = createShapeId();
        pid = String(newId);
        const b = getShapePageBounds(editor, s.id);
        if (!b) continue;
        const expanded = computeExpandedBoundsForFx(editor, s, b, 2);
        const parentId = (s.parentId as any) || editor.getCurrentPageId?.();
        const parentPoint = getParentSpacePoint(editor, s.id, { x: expanded.x, y: expanded.y });
        try {
          editor.createShape({
            id: newId as any,
            type: 'nxfx',
            x: parentPoint.x,
            y: parentPoint.y,
            parentId,
            props: { w: expanded.w, h: expanded.h, sourceId: String(s.id), rev: 0 },
            // Start hidden until a raster is ready, otherwise users see "Rendering effects…"
            // briefly (or "stuck" if updates are delayed).
            meta: { nxFxProxy: { sourceId: String(s.id) }, hidden: true },
          } as any);
          createdProxyCount++;
          proxiesBySource.set(String(s.id), pid);
          // Put the proxy above the source to replace visuals.
          try {
            editor.bringToFront([newId as any]);
          } catch {
            // ignore
          }
        } catch {
          // ignore
          proxyCreateFailedCount++;
          pid = null;
        }
      } else {
        // Keep proxy bounds synced.
        const p: any = editor.getShape(pid as any);
        // If we have a legacy locked proxy, it can block our programmatic updates (rev/hidden),
        // which leaves the UI stuck on "Rendering effects…". Recreate it unlocked.
        if (p?.isLocked === true) {
          try {
            editor.deleteShapes([pid as any]);
          } catch {
            // ignore
          }
          try {
            setNxFxRaster(pid, null);
          } catch {
            // ignore
          }
          proxiesBySource.delete(String(s.id));
          pid = null;
        }
        const b = getShapePageBounds(editor, s.id);
        if (p && b) {
          const expanded = computeExpandedBoundsForFx(editor, s, b, 2);
          const parentPoint = getParentSpacePoint(editor, s.id, { x: expanded.x, y: expanded.y });
          try {
            editor.updateShapes([
              {
                id: p.id,
                type: p.type,
                x: parentPoint.x,
                y: parentPoint.y,
                props: { ...(p.props || {}), w: expanded.w, h: expanded.h, sourceId: String(s.id) },
                meta: { ...(p.meta || {}), nxFxProxy: { sourceId: String(s.id) } },
              } as any,
            ]);
          } catch {
            // ignore
          }
        }
      }

      if (!pid) continue;

      const sig = computeRenderSignature(editor, s);
      const sigChanged = sig && lastRenderedSig.get(String(s.id)) !== sig;
      if (sigChanged) dirtySources.add(String(s.id));

      const isDirty = dirtySources.has(String(s.id));

      // Hide/show based on edit mode or active user interaction.
      if (isEditMode(s) || interactionActive || isDirty) {
        // Editing contents: hide proxy, show source subtree.
        try {
          const p: any = editor.getShape(pid as any);
          if (p) {
            editor.updateShapes([{ id: p.id, type: p.type, meta: { ...(p.meta || {}), hidden: true } } as any]);
          }
        } catch {
          // ignore
        }
        setProxyReadyFlag(editor, s, false);
        setHiddenForSubtree(editor, s.id, false);
        // Keep dirty so we rerender as soon as interaction ends.
        if (!isEditMode(s)) dirtySources.add(String(s.id));
      } else {
        // Normal: only show proxy once a raster is ready. Until then, keep the source visible
        // so the user doesn’t get stuck seeing the placeholder.
        const rasterReady = Boolean(getNxFxRaster(String(pid))?.url);
        // If we just left edit mode, force a re-render.
        if (wasEdit && !nowEdit) dirtySources.add(String(s.id));
        if (rasterReady) {
          try {
            const p: any = editor.getShape(pid as any);
            if (p) {
              const meta: any = { ...(p.meta || {}) };
              meta.hidden = false;
              editor.updateShapes([{ id: p.id, type: p.type, meta } as any]);
            }
          } catch {
            // ignore
          }
          setProxyReadyFlag(editor, s, true);
          // Hide descendants for group fx (so the flattened raster is the only visible thing).
          if (isGroupLike(s)) setHiddenForSubtree(editor, s.id, true, { includeRoot: false });
          else setHiddenForSubtree(editor, s.id, false);
        } else {
          // Hide proxy; show source subtree.
          try {
            const p: any = editor.getShape(pid as any);
            if (p) {
              editor.updateShapes([{ id: p.id, type: p.type, meta: { ...(p.meta || {}), hidden: true } } as any]);
            }
          } catch {
            // ignore
          }
          setProxyReadyFlag(editor, s, false);
          setHiddenForSubtree(editor, s.id, false);
          dirtySources.add(String(s.id));
        }
      }
    }

      // Publish cache for render loop.
      proxiesBySourceCache = proxiesBySource;

      // Render after sync.
      scheduleRender();
    } finally {
      syncing = false;
    }
  }

  // Initial sync.
  scheduleSync();

  // UX: if user selects a proxy, redirect selection to the source shape.
  const unlistenSelection = editor.store.listen(
    () => {
      if (disposed) return;
      if (syncing) return;
      if (redirectingSelection) return;
      try {
        const selected = (editor.getSelectedShapes?.() || []) as any[];
        const proxySel = selected.filter(isProxy);
        if (!proxySel.length) return;
        const sourceIds = Array.from(new Set(proxySel.map((p) => getProxySourceId(p)).filter(Boolean).map(String)));
        if (!sourceIds.length) return;
        redirectingSelection = true;
        editor.setSelectedShapes(sourceIds as any);
        redirectingSelection = false;
      } catch {
        redirectingSelection = false;
      }
    },
    { scope: 'session' as any },
  );

  interactionCleanup = startFxInteractionMonitor(editor, (active) => {
    if (disposed) return;
    interactionActive = active;
    try {
      setFxInteractionActive(interactionActive);
    } catch {
      // ignore
    }
    // On release, ensure we rerender anything that's dirty.
    if (!interactionActive && dirtySources.size) {
      try {
        scheduleRender();
      } catch {
        // ignore
      }
    }
    // Sync visibility (proxy hidden vs shown) immediately.
    try {
      scheduleSync();
    } catch {
      // ignore
    }
  });

  const unlisten = editor.store.listen(
    () => {
      if (!syncing) scheduleSync();
    },
    { scope: 'document' as any },
  );

  return () => {
    disposed = true;
    try {
      setFxInteractionActive(false);
    } catch {
      // ignore
    }
    try {
      unlisten?.();
    } catch {
      // ignore
    }
    try {
      unlistenSelection?.();
    } catch {
      // ignore
    }
    try {
      interactionCleanup?.();
    } catch {
      // ignore
    }
    interactionCleanup = null;
    try {
      scheduleSync.cancel();
      scheduleRender.cancel();
    } catch {
      // ignore
    }
    clearAllNxFxRasters();
  };
}

// Exported helper for UI (style panel) to toggle edit mode.
export function toggleNxFxEditMode(editor: Editor, sourceId: TLShapeId): void {
  const s: any = editor.getShape(sourceId as any);
  if (!s) return;
  setEditMode(editor, sourceId, !isEditMode(s));
}

