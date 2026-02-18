import type { Editor } from 'tldraw';

const NX_LAYOUT_REFRESH_NONCE_KEY = 'nxLayoutRefreshNonce' as const;

function isResizing(editor: Editor): boolean {
  try {
    return Boolean((editor as any).isInAny?.('select.resizing'));
  } catch {
    return false;
  }
}

/**
 * Force a reflow using the existing `installNxLayout` store listener + scheduler.
 * This intentionally mimics the "nudge padding" behavior by updating a harmless meta field.
 *
 * Returns true if it attempted to refresh.
 */
export function touchNxLayoutAutoRefresh(editor: Editor, layoutShapeId: any): boolean {
  if (!editor || !layoutShapeId) return false;
  if (isResizing(editor)) return false;

  let root: any = null;
  try {
    root = (editor as any).getShape?.(layoutShapeId as any) || null;
  } catch {
    root = null;
  }
  if (!root || String(root.type || '') !== 'nxlayout') return false;
  if (String(root.props?.layoutMode || 'manual') !== 'auto') return false;

  const bump = () => {
    try {
      const now = Date.now();
      const prev = root.meta && typeof root.meta === 'object' ? root.meta : {};
      (editor as any).updateShapes?.([
        {
          id: root.id,
          type: root.type,
          meta: { ...(prev as any), [NX_LAYOUT_REFRESH_NONCE_KEY]: now },
        },
      ]);
    } catch {
      // ignore
    }
  };

  bump();
  // Bump again on next tick to survive batching / ordering edge cases.
  try {
    window.setTimeout(bump, 0);
  } catch {
    // ignore
  }
  return true;
}

