'use client';

import { useSyncExternalStore } from 'react';

type FxInteractionState = { active: boolean };

let state: FxInteractionState = { active: false };
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

export function setFxInteractionActive(active: boolean) {
  const next = Boolean(active);
  if (state.active === next) return;
  state = { active: next };
  emit();
}

export function getFxInteractionState(): FxInteractionState {
  return state;
}

export function useFxInteractionState(): FxInteractionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

