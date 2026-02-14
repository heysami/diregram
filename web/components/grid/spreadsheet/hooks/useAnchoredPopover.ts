import { useEffect, useState } from 'react';

export type AnchorRect = { left: number; top: number; width: number; height: number };

export function useAnchoredPopover<T extends { anchor: AnchorRect }>(opts?: { popoverSelector?: string }) {
  const popoverSelector = opts?.popoverSelector || '[data-popover="1"]';
  const [state, setState] = useState<T | null>(null);

  useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      const el = document.querySelector(popoverSelector);
      if (el && el.contains(t)) return;
      setState(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [state, popoverSelector]);

  return {
    state,
    setState,
    close: () => setState(null),
    open: (next: T) => setState(next),
  };
}

