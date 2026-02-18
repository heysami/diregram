import type { Editor } from 'tldraw';

export type NxAxis = 'x' | 'y';

/**
 * Hug + Fill is a conflict. When a child wants `fill` on an axis, ensure the parent
 * container is not `hug` on that axis (switch to `fixed`).
 */
export function ensureParentAxisFixedForFill(editor: Editor, parent: any, axis: NxAxis): void {
  if (!editor || !parent) return;
  if (String(parent.type || '') !== 'nxlayout') return;
  if (String(parent.props?.layoutMode || 'manual') !== 'auto') return;

  const key = axis === 'x' ? 'sizeX' : 'sizeY';
  const cur = String(parent.props?.[key] || 'fixed');
  if (cur !== 'hug') return;

  try {
    editor.updateShapes([
      {
        id: parent.id,
        type: parent.type,
        props: { ...(parent.props || {}), [key]: 'fixed' },
      } as any,
    ]);
  } catch {
    // ignore
  }
}

