'use client';

import type { RefObject } from 'react';
import { useCallback, useState } from 'react';

export type Point = { x: number; y: number };

type MarqueeDrag = {
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  isAdd: boolean;
};

export type MarqueeOverlay = { x: number; y: number; w: number; h: number } | null;
export type MarqueeOverlayWorld = { x: number; y: number; w: number; h: number } | null;

export function useNodeMarqueeSelection<TNode>(opts: {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  clientToWorld: (clientX: number, clientY: number) => Point | null;
  nodes: TNode[];
  selectedIds: string[];
  // Required to map a node to stable selection id
  getNodeId: (n: TNode) => string;
  // Return the world-space rendered rect for hit-testing (must match what user sees)
  getRenderedRectWorld: (n: TNode) => { x: number; y: number; w: number; h: number } | null;
  // Optional: skip nodes that should not be selectable (e.g. hidden under collapsed flows)
  isNodeSelectable?: (n: TNode) => boolean;
  onSelectNodeIds?: (ids: string[]) => void;
  onSelectPrimaryNode?: (id: string | null) => void;
  // Used to suppress a click that follows mouseup; hook will set it to true when it finishes
  setSuppressNextClick?: (v: boolean) => void;
}): {
  overlay: MarqueeOverlayWorld;
  marqueeActive: boolean;
  start: (clientX: number, clientY: number, isAdd: boolean) => void;
  move: (clientX: number, clientY: number) => void;
  end: () => void;
  cancel: () => void;
} {
  const {
    enabled,
    containerRef,
    clientToWorld,
    nodes,
    selectedIds,
    getNodeId,
    getRenderedRectWorld,
    isNodeSelectable,
    onSelectNodeIds,
    onSelectPrimaryNode,
    setSuppressNextClick,
  } = opts;

  const [drag, setDrag] = useState<MarqueeDrag | null>(null);

  const start = useCallback(
    (clientX: number, clientY: number, isAdd: boolean) => {
      if (!enabled) return;
      setDrag({ startClientX: clientX, startClientY: clientY, clientX, clientY, isAdd });
      setSuppressNextClick?.(true);
    },
    [enabled, containerRef, setSuppressNextClick],
  );

  const move = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return;
      setDrag((d) => {
        if (!d) return d;
        return { ...d, clientX, clientY };
      });
    },
    [enabled],
  );

  const end = useCallback(() => {
    if (!enabled) return;
    if (!drag) return;

    // Use raw client coordinates to avoid drift if the container moves/scrolls during the drag.
    const minClientX = Math.min(drag.startClientX, drag.clientX);
    const minClientY = Math.min(drag.startClientY, drag.clientY);
    const maxClientX = Math.max(drag.startClientX, drag.clientX);
    const maxClientY = Math.max(drag.startClientY, drag.clientY);

    // Prefer DOM-rect hit-testing (client space) so selection always matches what the user sees,
    // even if layout math, clipping (diamonds), or other UI transforms evolve.
    const containerEl = containerRef.current;
    if (containerEl) {
      const selClientRect = {
        left: minClientX,
        top: minClientY,
        right: maxClientX,
        bottom: maxClientY,
      };

      const hit: string[] = [];
      const esc = (s: string) => {
        const cssEscape = (globalThis as any).CSS?.escape;
        return typeof cssEscape === 'function' ? cssEscape(s) : s.replace(/"/g, '\\"');
      };

      nodes.forEach((n) => {
        if (isNodeSelectable && !isNodeSelectable(n)) return;
        const id = getNodeId(n);
        const el = containerEl.querySelector(`[data-nexus-node-id="${esc(id)}"]`) as HTMLElement | null;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const intersects = !(
          r.right < selClientRect.left ||
          r.left > selClientRect.right ||
          r.bottom < selClientRect.top ||
          r.top > selClientRect.bottom
        );
        if (intersects) hit.push(id);
      });

      const next = drag.isAdd ? Array.from(new Set([...selectedIds, ...hit])) : hit;
      onSelectNodeIds?.(next);
      if (next.length === 1) onSelectPrimaryNode?.(next[0]);
      else onSelectPrimaryNode?.(null);

      setDrag(null);
      setSuppressNextClick?.(true);
      return;
    }

    const p1 = clientToWorld(minClientX, minClientY);
    const p2 = clientToWorld(maxClientX, maxClientY);

    if (!p1 || !p2) {
      setDrag(null);
      return;
    }

    const selRect = {
      left: Math.min(p1.x, p2.x),
      top: Math.min(p1.y, p2.y),
      right: Math.max(p1.x, p2.x),
      bottom: Math.max(p1.y, p2.y),
    };

    const hit: string[] = [];
    nodes.forEach((n) => {
      if (isNodeSelectable && !isNodeSelectable(n)) return;
      const r = getRenderedRectWorld(n);
      if (!r) return;
      const intersects = !(r.x + r.w < selRect.left || r.x > selRect.right || r.y + r.h < selRect.top || r.y > selRect.bottom);
      if (intersects) hit.push(getNodeId(n));
    });

    const next = drag.isAdd ? Array.from(new Set([...selectedIds, ...hit])) : hit;
    onSelectNodeIds?.(next);
    if (next.length === 1) onSelectPrimaryNode?.(next[0]);
    else onSelectPrimaryNode?.(null);

    setDrag(null);
    setSuppressNextClick?.(true);
  }, [
    enabled,
    drag,
    clientToWorld,
    nodes,
    isNodeSelectable,
    getRenderedRectWorld,
    getNodeId,
    selectedIds,
    onSelectNodeIds,
    onSelectPrimaryNode,
    setSuppressNextClick,
  ]);

  const cancel = useCallback(() => setDrag(null), []);

  // Draw overlay in world-space (same coordinate system as lines) so it stays perfectly aligned
  // with pan/zoom/transforms. This mirrors the line tool preview logic.
  const overlay: MarqueeOverlayWorld = (() => {
    if (!drag) return null;
    const minClientX = Math.min(drag.startClientX, drag.clientX);
    const minClientY = Math.min(drag.startClientY, drag.clientY);
    const maxClientX = Math.max(drag.startClientX, drag.clientX);
    const maxClientY = Math.max(drag.startClientY, drag.clientY);
    const p1 = clientToWorld(minClientX, minClientY);
    const p2 = clientToWorld(maxClientX, maxClientY);
    if (!p1 || !p2) return null;
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    return { x, y, w, h };
  })();

  return {
    overlay,
    marqueeActive: !!drag,
    start,
    move,
    end,
    cancel,
  };
}

