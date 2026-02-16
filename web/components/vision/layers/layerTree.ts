export type BooleanMeta = { id: string; op: 'union' | 'subtract' | 'intersect' };

export type LayerTreeNode = {
  /** Stable id persisted in Fabric JSON (`object.data.layerId`). */
  layerId: string;
  /** Display name (usually `object.name` or a derived label). */
  name: string;
  /** Fabric object type (rect/path/group/...) or `virtual`. */
  type: string;
  /** Whether the underlying object can be selected. */
  selectable: boolean;
  /** Whether the underlying object is visible. */
  visible: boolean;
  /** Whether the underlying object is locked from transforms. */
  locked: boolean;
  /** Canvas z-index among siblings. */
  zIndex: number;
  /** Children (for groups or virtual nodes). */
  children: LayerTreeNode[];
  /** Back-pointer to Fabric object (undefined for virtual nodes). */
  obj?: any;
  /** Boolean metadata for results and sources. */
  boolean?: BooleanMeta & { role: 'result' | 'source' };
  /** True if this node is synthetic (not a direct Fabric object). */
  virtual?: boolean;
};

function asString(x: unknown): string {
  return typeof x === 'string' ? x : x == null ? '' : String(x);
}

function getLayerId(obj: any, fallbackPrefix = 'layer'): string {
  const id = obj?.data?.layerId;
  if (typeof id === 'string' && id.trim()) return id.trim();
  // Should normally not happen (FabricCanvas ensures ids), but keep UI resilient.
  return `${fallbackPrefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function isLocked(obj: any): boolean {
  // Heuristic: any of these indicates user intent to lock.
  return !!(
    obj?.lockMovementX ||
    obj?.lockMovementY ||
    obj?.lockRotation ||
    obj?.lockScalingX ||
    obj?.lockScalingY ||
    obj?.selectable === false
  );
}

function booleanFromObject(obj: any): BooleanMeta | null {
  const b = obj?.data?.boolean;
  const id = typeof b?.id === 'string' ? b.id : null;
  const op = b?.op === 'union' || b?.op === 'subtract' || b?.op === 'intersect' ? (b.op as BooleanMeta['op']) : null;
  if (!id || !op) return null;
  return { id, op };
}

function booleanIdFromName(obj: any): string | null {
  const name = asString(obj?.name);
  if (name.startsWith('boolean-result:')) return name.slice('boolean-result:'.length) || null;
  if (name.startsWith('boolean-src:')) return name.slice('boolean-src:'.length) || null;
  return null;
}

function getBooleanResultId(obj: any): BooleanMeta | null {
  return booleanFromObject(obj);
}

function getBooleanSourceId(obj: any): string | null {
  const id = obj?.data?.booleanSourceId;
  if (typeof id === 'string' && id.trim()) return id.trim();
  // Fallback for older bundles that only used naming.
  const fromName = booleanIdFromName(obj);
  return fromName;
}

function nodeFromObject(obj: any, zIndex: number): LayerTreeNode {
  const type = asString(obj?.type || 'object') || 'object';
  const name = asString(obj?.name).trim() || type;
  const selectable = obj?.selectable !== false;
  const visible = obj?.visible !== false;
  const locked = isLocked(obj);
  const kids = Array.isArray(obj?._objects) ? obj._objects : [];
  const children = kids.map((k: any, i: number) => nodeFromObject(k, i));
  const b = getBooleanResultId(obj);
  return {
    layerId: getLayerId(obj),
    name,
    type,
    selectable,
    visible,
    locked,
    zIndex,
    children,
    obj,
    ...(b ? { boolean: { ...b, role: 'result' as const } } : null),
  };
}

export function buildLayerTree(canvas: any): LayerTreeNode[] {
  const top = (canvas?.getObjects?.() || []) as any[];
  const topNodes = top.map((o, i) => nodeFromObject(o, i));

  // Build boolean bundle maps.
  const resultById = new Map<string, LayerTreeNode>();
  const sourceObjectsById = new Map<string, any[]>();
  const srcGroupById = new Map<string, any>();

  // Results are top-level nodes that have boolean meta.
  topNodes.forEach((n) => {
    const b = n.boolean;
    if (b?.role === 'result') resultById.set(b.id, n);
  });

  // Sources can be (a) a hidden group named boolean-src:<id>, or (b) ungrouped objects tagged with booleanSourceId.
  top.forEach((o) => {
    const nm = asString(o?.name);
    if (nm.startsWith('boolean-src:')) {
      const id = nm.slice('boolean-src:'.length);
      if (id) srcGroupById.set(id, o);
    }
    const sid = getBooleanSourceId(o);
    if (sid && !nm.startsWith('boolean-result:')) {
      const arr = sourceObjectsById.get(sid) || [];
      arr.push(o);
      sourceObjectsById.set(sid, arr);
    }
  });

  const out: LayerTreeNode[] = [];

  for (const n of topNodes) {
    // Hide src groups if their result exists (we’ll show them under the result).
    const nm = asString(n.obj?.name);
    if (nm.startsWith('boolean-src:')) {
      const id = nm.slice('boolean-src:'.length);
      if (id && resultById.has(id)) continue;
    }

    // For a boolean result, attach sources as children under a virtual node.
    if (n.boolean?.role === 'result') {
      const id = n.boolean.id;
      const srcGroup = srcGroupById.get(id) || null;
      const tagged = sourceObjectsById.get(id) || [];
      const srcChildren: LayerTreeNode[] = [];

      if (srcGroup && Array.isArray(srcGroup?._objects) && srcGroup._objects.length) {
        srcChildren.push(...(srcGroup._objects as any[]).map((o: any, i: number) => nodeFromObject(o, i)));
      } else if (tagged.length) {
        // If sources are currently ungrouped (edit mode), show them too.
        srcChildren.push(...tagged.map((o: any, i: number) => nodeFromObject(o, i)));
      }

      if (srcChildren.length) {
        const virtualSources: LayerTreeNode = {
          layerId: `${n.layerId}:sources`,
          name: 'Sources',
          type: 'virtual',
          selectable: false,
          visible: true,
          locked: false,
          zIndex: -1,
          children: srcChildren,
          virtual: true,
          boolean: { id, op: n.boolean.op, role: 'source' },
        };
        // Keep existing group children too (if any).
        n.children = [virtualSources, ...(n.children || [])];
      }
    }

    out.push(n);
  }

  return out;
}

export function flattenLayerTree(nodes: LayerTreeNode[]): LayerTreeNode[] {
  const out: LayerTreeNode[] = [];
  const walk = (arr: LayerTreeNode[]) => {
    arr.forEach((n) => {
      out.push(n);
      if (n.children?.length) walk(n.children);
    });
  };
  walk(nodes);
  return out;
}

