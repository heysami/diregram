'use client';

import { useSyncExternalStore } from 'react';

export type VisionGradientPaintTarget = 'fill' | 'stroke';

export type VisionGradientUiState = {
  /** The shape that the user is actively editing gradient direction for. */
  shapeId: string | null;
  /** Which paint is being edited (fill vs outline). */
  paint: VisionGradientPaintTarget | null;
};

let state: VisionGradientUiState = { shapeId: null, paint: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

export function setVisionGradientUiState(next: VisionGradientUiState) {
  state = { shapeId: next.shapeId || null, paint: next.paint || null };
  emit();
}

export function clearVisionGradientUiState() {
  state = { shapeId: null, paint: null };
  emit();
}

export function getVisionGradientUiState(): VisionGradientUiState {
  return state;
}

export function useVisionGradientUiState(): VisionGradientUiState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

