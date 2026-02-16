'use client';

import type { Editor } from 'tldraw';
import { setBooleanSourcesHidden } from '@/components/vision/tldraw/boolean/booleanSourceState';

/**
 * Installs the boolean *bundle* UX:
 * - Selecting a non-destructive boolean result selects its bundle group (so it moves as one set)
 * - Keeps boolean source shapes hidden (even if older docs only hid the wrapper group)
 *
 * Returns a cleanup function.
 */
export function installBooleanEditOnSelect(editor: Editor): () => void {
  const lastKeyRef = { current: '' };
  const redirectingRef = { current: false };
  const normalizedRef = { current: false };

  const normalizeExistingBooleans = () => {
    if (normalizedRef.current) return;
    normalizedRef.current = true;

    try {
      const top = Array.from((editor as any).getCurrentPageShapeIds?.() || []).map(String);
      const all = new Set<string>();
      for (const id of top) {
        try {
          const ids = ((editor as any).getShapeAndDescendantIds?.(id as any) || []).map(String);
          ids.forEach((x: string) => all.add(x));
        } catch {
          all.add(id);
        }
      }

      for (const id of Array.from(all)) {
        const s: any = (editor as any).getShape?.(id);
        const nx = s?.meta?.nxBoolean;
        if (!nx) continue;
        const opOk = nx?.op === 'union' || nx?.op === 'subtract' || nx?.op === 'intersect';
        const sources = Array.isArray(nx?.sources) ? nx.sources.map(String).filter(Boolean) : [];
        if (!opOk || sources.length < 2) continue;

        const hiddenGroupId = typeof nx?.hiddenGroupId === 'string' ? String(nx.hiddenGroupId) : null;
        if (hiddenGroupId) {
          // Old docs hid only the group wrapper; ensure the full subtree is hidden.
          setBooleanSourcesHidden(editor, [hiddenGroupId as any], true);
        } else {
          // Grouping failed; hide/tag the sources directly.
          setBooleanSourcesHidden(editor, sources as any, true);
        }
      }
    } catch {
      // If anything goes wrong, allow retry later.
      normalizedRef.current = false;
    }
  };

  const onSelectionMaybeRedirect = () => {
    if (redirectingRef.current) return;

    const ids = (editor as any).getSelectedShapeIds?.() || [];
    const key = Array.isArray(ids) ? ids.join(',') : String(ids || '');
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    // If selection includes a boolean result, redirect to its bundle group (so it moves together).
    const first = Array.isArray(ids) ? (ids[0] ? String(ids[0]) : '') : '';
    if (!first) return;
    const s: any = (editor as any).getShape?.(first);
    const nx = s?.meta?.nxBoolean;
    const opOk = nx?.op === 'union' || nx?.op === 'subtract' || nx?.op === 'intersect';
    const isNonDestructive = opOk && Array.isArray(nx?.sources) && nx.sources.length >= 2;
    if (!isNonDestructive) return;

    // Ensure sources stay hidden (older docs only hid the wrapper).
    const hiddenGroupId = typeof nx?.hiddenGroupId === 'string' ? String(nx.hiddenGroupId) : null;
    if (hiddenGroupId) {
      setBooleanSourcesHidden(editor, [hiddenGroupId as any], true);
    } else {
      const sources = Array.isArray(nx?.sources) ? nx.sources.map(String).filter(Boolean) : [];
      setBooleanSourcesHidden(editor, sources as any, true);
    }

    const bundleGroupId = typeof nx?.bundleGroupId === 'string' ? String(nx.bundleGroupId) : null;
    if (!bundleGroupId) return;
    const bundle: any = (editor as any).getShape?.(bundleGroupId);
    if (!bundle) return;

    try {
      redirectingRef.current = true;
      (editor as any).setSelectedShapes?.([bundleGroupId]);
    } finally {
      window.setTimeout(() => {
        redirectingRef.current = false;
      }, 0);
    }
  };

  // Initialize + listen for selection changes. Selection lives in session scope, so use `all`.
  // Also normalize any legacy boolean bundles on first run (hide children + tag boolean sources).
  try {
    window.setTimeout(() => normalizeExistingBooleans(), 0);
  } catch {
    // ignore
  }
  onSelectionMaybeRedirect();
  const cleanupSel = (editor as any).store?.listen?.(() => onSelectionMaybeRedirect(), { scope: 'all' as any });

  return () => {
    try {
      cleanupSel?.();
    } catch {
      // ignore
    }
  };
}

