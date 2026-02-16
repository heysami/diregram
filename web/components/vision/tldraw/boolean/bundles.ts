'use client';

import type { Editor, TLShapeId } from 'tldraw';
import { createShapeId } from '@tldraw/tlschema';
import { computeBooleanForShapes } from '@/components/vision/tldraw/boolean/computeBoolean';
import { setBooleanSourcesHidden } from '@/components/vision/tldraw/boolean/booleanSourceState';

export type BooleanOp = 'union' | 'subtract' | 'intersect';

function isBooleanOp(op: any): op is BooleanOp {
  return op === 'union' || op === 'subtract' || op === 'intersect';
}

export type FlattenInfo = {
  resultId: TLShapeId;
  hiddenGroupId: TLShapeId | null;
  bundleGroupId: TLShapeId | null;
};

export async function createBooleanFromSelection(editor: Editor, op: BooleanOp): Promise<TLShapeId | null> {
  const ids = editor.getSelectedShapeIds();
  if (ids.length < 2) return null;

  const result = await computeBooleanForShapes(editor, ids as any, op);
  if (!result) return null;

  // Always keep sources in our UX (non-destructive).
  let hiddenGroupId: TLShapeId | null = null;
  try {
    editor.groupShapes(ids);
    const sel = editor.getSelectedShapeIds();
    hiddenGroupId = (sel?.[0] as TLShapeId) || null;
    if (hiddenGroupId) {
      const g = editor.getShape(hiddenGroupId);
      if (g) {
        editor.updateShapes([
          {
            id: hiddenGroupId,
            type: g.type,
            meta: { ...(g.meta as any), hidden: true, nxName: 'Boolean sources' },
          } as any,
        ]);
      }
      // IMPORTANT: hide the full subtree (tldraw renders group children independently) and tag it as boolean sources.
      setBooleanSourcesHidden(editor, [hiddenGroupId], true);
    }
  } catch {
    hiddenGroupId = null;
  }

  // If grouping failed for any reason, still hide the sources directly so the result doesn't
  // look like a "union" just because the original filled shapes are still visible.
  if (!hiddenGroupId) {
    try {
      setBooleanSourcesHidden(editor, ids as any, true);
    } catch {
      // ignore
    }
  }

  const resultId = createShapeId();
  editor.createShape({
    id: resultId as any,
    type: 'nxpath',
    x: result.x,
    y: result.y,
    props: {
      w: result.w,
      h: result.h,
      d: result.d,
      fill: '#111111',
      stroke: 'transparent',
      strokeWidth: 1,
    },
    meta: {
      nxName: `Boolean(${op})`,
      nxBoolean: { op, sources: ids, hiddenGroupId },
    },
  } as any);

  // Wrap (result + hidden sources group) into a single bundle group.
  if (hiddenGroupId) {
    try {
      editor.groupShapes([hiddenGroupId as any, resultId as any]);
      const sel = editor.getSelectedShapeIds();
      const bundleId = (sel?.[0] as TLShapeId) || null;
      if (bundleId) {
        const bundle = editor.getShape(bundleId);
        if (bundle) {
          editor.updateShapes([
            {
              id: bundleId,
              type: bundle.type,
              meta: {
                ...(bundle.meta as any),
                nxName: `Boolean(${op})`,
                nxBooleanBundle: { resultId, sourcesGroupId: hiddenGroupId },
              },
            } as any,
          ]);
        }

        // Attach bundle id to the result for flattening from either selection target.
        const res = editor.getShape(resultId as any) as any;
        if (res) {
          const meta = { ...(res.meta || {}) };
          if (meta?.nxBoolean && typeof meta.nxBoolean === 'object') meta.nxBoolean = { ...(meta.nxBoolean as any), bundleGroupId: bundleId };
          editor.updateShapes([{ id: resultId as any, type: res.type, meta } as any]);
        }

        try {
          editor.bringToFront([bundleId as any]);
          editor.setSelectedShapes([bundleId as any]);
        } catch {
          // ignore
        }
        return bundleId;
      }
    } catch {
      // ignore
    }
  }

  try {
    editor.bringToFront([resultId as any]);
    editor.setSelectedShapes([resultId as any]);
  } catch {
    // ignore
  }
  return resultId;
}

export async function recomputeBooleanResult(editor: Editor, booleanId: TLShapeId): Promise<void> {
  const shape: any = editor.getShape(booleanId as any);
  if (!shape) return;
  const nx = shape?.meta?.nxBoolean as any;
  const op: BooleanOp | null = isBooleanOp(nx?.op) ? (nx.op as BooleanOp) : null;
  const sources: TLShapeId[] = Array.isArray(nx?.sources) ? (nx.sources.filter((x: any) => typeof x === 'string') as any) : [];
  if (!op || sources.length < 2) return;

  const result = await computeBooleanForShapes(editor, sources, op);
  if (!result) return;

  const nextProps = { ...(shape.props || {}), w: result.w, h: result.h, d: result.d };
  // `x/y` are in parent space when nested; convert from page space.
  let px = result.x;
  let py = result.y;
  try {
    const p = (editor as any).getPointInParentSpace?.(booleanId as any, { x: result.x, y: result.y });
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      px = Number(p.x);
      py = Number(p.y);
    }
  } catch {
    // ignore
  }
  editor.updateShapes([{ id: booleanId as any, type: shape.type, x: px, y: py, props: nextProps } as any]);
}

export function getFlattenInfoFromSelection(editor: Editor, selectedIds: string[]): FlattenInfo | null {
  if (selectedIds.length !== 1) return null;
  const id = selectedIds[0] as TLShapeId;
  let s: any = editor.getShape(id as any);
  if (!s) return null;

  // If a child is selected (e.g. a source while editing), walk up to a bundle group if we can.
  if (!s?.meta?.nxBoolean && !s?.meta?.nxBooleanBundle) {
    try {
      const anc = (editor as any).findShapeAncestor?.(id as any, (p: any) => Boolean(p?.meta?.nxBooleanBundle?.resultId));
      if (anc) s = anc;
    } catch {
      // ignore
    }
  }

  // Case A: selected boolean result
  const nx = s?.meta?.nxBoolean as any;
  const opOk = isBooleanOp(nx?.op);
  const sources = Array.isArray(nx?.sources) ? nx.sources : null;
  if (s?.type === 'nxpath' && opOk && Array.isArray(sources) && sources.length >= 2) {
    return {
      resultId: (s.id as TLShapeId) || id,
      hiddenGroupId: typeof nx?.hiddenGroupId === 'string' ? (String(nx.hiddenGroupId) as any) : null,
      bundleGroupId: typeof nx?.bundleGroupId === 'string' ? (String(nx.bundleGroupId) as any) : null,
    };
  }

  // Case B: selected bundle group
  const b = s?.meta?.nxBooleanBundle as any;
  if (b && typeof b?.resultId === 'string') {
    const resultId = String(b.resultId) as any;
    const res: any = editor.getShape(resultId);
    const rnx = res?.meta?.nxBoolean as any;
    const ropOk = isBooleanOp(rnx?.op);
    const rsources = Array.isArray(rnx?.sources) ? rnx.sources : null;
    if (res?.type === 'nxpath' && ropOk && Array.isArray(rsources) && rsources.length >= 2) {
      return {
        resultId,
        hiddenGroupId: typeof b?.sourcesGroupId === 'string' ? (String(b.sourcesGroupId) as any) : typeof rnx?.hiddenGroupId === 'string' ? (String(rnx.hiddenGroupId) as any) : null,
        bundleGroupId: (s.id as TLShapeId) || id,
      };
    }
  }

  return null;
}

export async function flattenBoolean(editor: Editor, info: FlattenInfo): Promise<void> {
  // Ungroup first to avoid nested coordinate weirdness / deletion misses.
  if (info.bundleGroupId) {
    try {
      editor.ungroupShapes([info.bundleGroupId as any]);
    } catch {
      // ignore
    }
  }

  const res: any = editor.getShape(info.resultId as any);
  if (!res) return;
  const nx = res?.meta?.nxBoolean as any;
  const sources: TLShapeId[] = Array.isArray(nx?.sources) ? nx.sources.map(String).filter(Boolean) : [];
  const hiddenGroupId: TLShapeId | null = info.hiddenGroupId || (typeof nx?.hiddenGroupId === 'string' ? (String(nx.hiddenGroupId) as any) : null);

  // Delete sources (and the sources group itself).
  const del = new Set<string>();
  for (const sid of sources) del.add(String(sid));
  if (hiddenGroupId) {
    try {
      del.add(String(hiddenGroupId));
      const ids = (editor as any).getShapeAndDescendantIds?.(hiddenGroupId as any) || [];
      for (const x of ids) del.add(String(x));
    } catch {
      // ignore
    }
  }
  if (info.bundleGroupId) del.add(String(info.bundleGroupId));
  if (del.size) {
    try {
      editor.deleteShapes(Array.from(del) as any);
    } catch {
      // ignore
    }
  }

  // Strip boolean metadata from the result so it becomes a normal shape.
  try {
    const meta: any = { ...(res.meta || {}) };
    // IMPORTANT: tldraw merges meta patches; deleting a key won't reliably clear it.
    // Set to null so `getFlattenInfoFromSelection` won't consider this a boolean anymore.
    meta.nxBoolean = null;
    meta.nxBooleanBundle = null;
    meta.nxBooleanSource = false;
    editor.updateShapes([{ id: info.resultId as any, type: res.type, meta } as any]);
  } catch {
    // ignore
  }

  try {
    editor.bringToFront([info.resultId as any]);
    editor.setSelectedShapes([info.resultId as any]);
  } catch {
    // ignore
  }
}

/**
 * "Ungroup" behavior for non-destructive booleans:
 * - Delete the boolean result
 * - Restore the original source shapes as independent (ungrouped) shapes
 */
export async function unbundleBooleanToSources(editor: Editor, info: FlattenInfo): Promise<void> {
  // Capture sources up-front (we're going to delete the result).
  let sourceIds: string[] = [];
  try {
    const res: any = editor.getShape(info.resultId as any);
    const nx = res?.meta?.nxBoolean as any;
    sourceIds = Array.isArray(nx?.sources) ? nx.sources.map(String).filter(Boolean) : [];
  } catch {
    sourceIds = [];
  }

  // If the boolean is wrapped in a bundle group, ungroup it first.
  if (info.bundleGroupId) {
    try {
      editor.ungroupShapes([info.bundleGroupId as any]);
    } catch {
      // ignore
    }
  }

  // Ungroup the hidden sources group so the source shapes become top-level again.
  if (info.hiddenGroupId) {
    try {
      // Reveal the full subtree; boolean sources were hidden per-shape (not just the wrapper).
      setBooleanSourcesHidden(editor, [info.hiddenGroupId as any], false);
    } catch {
      // ignore
    }
    try {
      editor.ungroupShapes([info.hiddenGroupId as any]);
    } catch {
      // ignore
    }
  } else {
    // Back-compat / group failure: sources may have been hidden individually.
    try {
      setBooleanSourcesHidden(editor, sourceIds as any, false);
    } catch {
      // ignore
    }
  }

  // Delete the boolean result itself.
  try {
    editor.deleteShapes([info.resultId as any]);
  } catch {
    // ignore
  }

  // Best-effort cleanup: if the hidden group or bundle group still exist (some editor versions
  // can fail to delete groups on ungroup), remove them.
  const del: string[] = [];
  try {
    if (info.hiddenGroupId && editor.getShape(info.hiddenGroupId as any)) del.push(String(info.hiddenGroupId));
    if (info.bundleGroupId && editor.getShape(info.bundleGroupId as any)) del.push(String(info.bundleGroupId));
  } catch {
    // ignore
  }
  if (del.length) {
    try {
      editor.deleteShapes(del as any);
    } catch {
      // ignore
    }
  }

  // Select the original sources if we can.
  try {
    if (sourceIds.length) editor.setSelectedShapes(sourceIds as any);
  } catch {
    // ignore
  }
}

