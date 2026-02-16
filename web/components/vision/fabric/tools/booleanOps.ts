/**
 * Boolean operations (union/subtract/intersect) for Fabric selections.
 *
 * Implementation strategy (Option A):
 * - Convert selected Fabric objects -> SVG fragments via `toSVG()`
 * - Import into Paper.js, perform boolean ops
 * - Export result as SVG, import back into Fabric, replace originals
 *
 * Notes:
 * - This is a v1 implementation intended for common shape/path use cases.
 * - Some Fabric objects (images, text) aren't meaningful for boolean ops.
 */

// Lazy-load Paper.js to avoid blocking the initial editor bundle.
let paperPromise: Promise<any> | null = null;
async function getPaper(): Promise<any> {
  if (!paperPromise) paperPromise = import('paper').then((m: any) => m?.default ?? m);
  return paperPromise;
}

export type BooleanOp = 'union' | 'subtract' | 'intersect';

export type BooleanBundle = {
  id: string;
  op: BooleanOp;
  resultName: string;
  sourceName: string;
};

function eachObjectDeep(obj: any, fn: (o: any) => void) {
  if (!obj) return;
  fn(obj);
  const kids = Array.isArray(obj._objects) ? obj._objects : [];
  kids.forEach((k: any) => eachObjectDeep(k, fn));
}

function tagBooleanSources(bundleId: string, objs: any[]) {
  (Array.isArray(objs) ? objs : []).forEach((o) => {
    eachObjectDeep(o, (x) => {
      try {
        if (!x.data || typeof x.data !== 'object') x.data = {};
        x.data.booleanSourceId = bundleId;
      } catch {
        // ignore
      }
    });
  });
}

function asNum(x: unknown, fallback: number) {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function uid() {
  // short, local-only id (good enough for within-canvas lookups)
  return Math.random().toString(36).slice(2, 10);
}

function ensureSvgWrapper(opts: { frag: string; width: number; height: number }) {
  const w = Math.max(1, Math.round(opts.width));
  const h = Math.max(1, Math.round(opts.height));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    opts.frag,
    `</svg>`,
  ].join('');
}

function toSvgFragment(obj: unknown): string | null {
  const o = obj as { toSVG?: () => string } | null;
  if (!o) return null;
  if (typeof o.toSVG === 'function') {
    try {
      const s = o.toSVG();
      return typeof s === 'string' && s.trim() ? s : null;
    } catch {
      return null;
    }
  }
  return null;
}

function itemToPathItem(scope: any, item: any | null): any | null {
  if (!item) return null;

  // Expand shapes into paths when possible.
  const expanded: any = (item as any)?.expandShapes?.() ?? item;

  // Helper to set a consistent fill so boolean ops behave deterministically.
  const normalize = (it: any) => {
    // Paper boolean ops rely on fill; stroke is irrelevant.
    (it as unknown as { strokeColor?: unknown }).strokeColor = null;
    (it as unknown as { fillColor?: unknown }).fillColor = new scope.Color('black');
  };

  // If it's already a path-like object, great.
  if (String((expanded as any)?.className || '') === 'Path') {
    const p = expanded as any;
    normalize(p);
    return p;
  }
  if (String((expanded as any)?.className || '') === 'CompoundPath') {
    const cp = expanded as any;
    normalize(cp);
    return cp;
  }

  // If it's a group, unify its children into a single compound/path item.
  if (String((expanded as any)?.className || '') === 'Group') {
    const g = expanded as any;
    const kids = g.getItems?.({ recursive: true, class: (scope as any).PathItem }) as any[];
    const usable = Array.isArray(kids) ? kids.filter(Boolean) : [];
    if (usable.length === 0) return null;

    let acc: any | null = null;
    usable.forEach((k) => normalize(k));
    for (const k of usable) {
      if (!acc) {
        acc = k.clone?.() ?? k;
        continue;
      }
      try {
        const next = acc.unite?.(k) ?? null;
        acc.remove?.();
        acc = next;
      } catch {
        // ignore and continue
      }
    }
    return acc;
  }

  // Last resort: try to convert to a path via export/import cycle.
  try {
    normalize(expanded);
  } catch {
    // ignore
  }
  return expanded || null;
}

function extractFirstPathD(svg: string): { d: string; fillRule: 'nonzero' | 'evenodd' } | null {
  // We accept either <path ... d="..."> or <path d='...'>
  const m = svg.match(/<path\b[^>]*\sd=(["'])([\s\S]*?)\1/i);
  if (!m) return null;
  const d = (m[2] || '').trim();
  if (!d) return null;

  const fr = svg.match(/fill-rule=(["'])(evenodd|nonzero)\1/i);
  const fillRule = (fr?.[2] === 'evenodd' ? 'evenodd' : 'nonzero') as 'nonzero' | 'evenodd';
  return { d, fillRule };
}

async function fabricObjectsFromSvg(opts: { fabric: unknown; svg: string }): Promise<{ objects: unknown[]; options: any } | null> {
  const fabricAny = opts.fabric as any;
  const loader =
    (typeof fabricAny?.loadSVGFromString === 'function' && fabricAny.loadSVGFromString) ||
    (typeof fabricAny?.util?.loadSVGFromString === 'function' && fabricAny.util.loadSVGFromString) ||
    null;
  if (!loader) return null;

  return await new Promise((resolve) => {
    try {
      loader(opts.svg, (objects: unknown[], options: any) => resolve({ objects: objects || [], options }));
    } catch {
      resolve(null);
    }
  });
}

function groupSvgElements(fabric: unknown, objects: unknown[], options: any): unknown {
  const f = fabric as any;
  if (typeof f?.util?.groupSVGElements === 'function') {
    try {
      return f.util.groupSVGElements(objects, options);
    } catch {
      // ignore
    }
  }
  if (typeof f?.Group === 'function') {
    try {
      return new f.Group(objects, options || {});
    } catch {
      // ignore
    }
  }
  return objects[0] || null;
}

function getSelection(canvas: unknown): unknown[] {
  const c = canvas as any;
  const arr = (typeof c?.getActiveObjects === 'function' && c.getActiveObjects()) || [];
  if (Array.isArray(arr) && arr.length) return arr;
  const single = typeof c?.getActiveObject === 'function' ? c.getActiveObject() : null;
  return single ? [single] : [];
}

function getCommonStyle(obj: unknown): { fill?: unknown; stroke?: unknown; strokeWidth?: unknown; opacity?: unknown } {
  const o = obj as any;
  return {
    fill: o?.fill,
    stroke: o?.stroke,
    strokeWidth: o?.strokeWidth,
    opacity: o?.opacity,
  };
}

function objectZIndex(canvas: any, obj: any): number {
  try {
    const objs = canvas.getObjects?.() || [];
    const idx = objs.indexOf(obj);
    return idx >= 0 ? idx : 0;
  } catch {
    return 0;
  }
}

function unionBounds(objs: any[]): { left: number; top: number; right: number; bottom: number } | null {
  if (!Array.isArray(objs) || objs.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let ok = false;
  objs.forEach((o) => {
    try {
      const r = o?.getBoundingRect?.(true, true) || o?.getBoundingRect?.() || null;
      if (!r) return;
      const l = asNum(r.left, NaN);
      const t = asNum(r.top, NaN);
      const w = asNum(r.width, NaN);
      const h = asNum(r.height, NaN);
      if (![l, t, w, h].every((x) => Number.isFinite(x))) return;
      left = Math.min(left, l);
      top = Math.min(top, t);
      right = Math.max(right, l + w);
      bottom = Math.max(bottom, t + h);
      ok = true;
    } catch {
      // ignore
    }
  });
  return ok ? { left, top, right, bottom } : null;
}

function alignToBounds(canvas: any, fabric: any, obj: any, target: { left: number; top: number }) {
  try {
    // Fabric needs object on canvas for accurate bounds/coords.
    obj.setCoords?.();
  } catch {
    // ignore
  }
  try {
    // Best option: use Fabric's position helper (respects origin correctly).
    if (typeof obj?.setPositionByOrigin === 'function') {
      const Point = fabric?.Point;
      const pt = Point ? new Point(target.left, target.top) : { x: target.left, y: target.top };
      obj.setPositionByOrigin(pt, 'left', 'top');
      obj.setCoords?.();
      return;
    }

    const r = obj?.getBoundingRect?.(true, true) || obj?.getBoundingRect?.() || null;
    if (!r) return;
    const dx = target.left - asNum(r.left, 0);
    const dy = target.top - asNum(r.top, 0);
    if (typeof obj.set === 'function') {
      obj.set({ left: asNum(obj.left, 0) + dx, top: asNum(obj.top, 0) + dy });
    } else {
      obj.left = asNum(obj.left, 0) + dx;
      obj.top = asNum(obj.top, 0) + dy;
    }
    obj.setCoords?.();
  } catch {
    // ignore
  }
}

function isBooleanResult(o: any): { id: string; op: BooleanOp } | null {
  const d = o?.data?.boolean;
  const id = typeof d?.id === 'string' ? d.id : null;
  const op = d?.op === 'union' || d?.op === 'subtract' || d?.op === 'intersect' ? (d.op as BooleanOp) : null;
  if (!id || !op) return null;
  return { id, op };
}

function findByName(canvas: any, name: string): any | null {
  try {
    const objs = canvas.getObjects?.() || [];
    return objs.find((o: any) => o?.name === name) || null;
  } catch {
    return null;
  }
}

function removeAllByName(canvas: any, name: string): void {
  try {
    const objs = (canvas.getObjects?.() || []) as any[];
    objs.forEach((o) => {
      if (o?.name !== name) return;
      try {
        canvas.remove(o);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

function getBooleanSources(canvas: any, bundleId: string): any[] {
  const srcGroup = findByName(canvas, `boolean-src:${bundleId}`);
  if (srcGroup && Array.isArray(srcGroup._objects) && srcGroup._objects.length) return srcGroup._objects.slice();
  const top = canvas.getObjects?.() || [];
  return top.filter((o: any) => o?.data?.booleanSourceId === bundleId);
}

async function computeCreatedFromObjects(opts: {
  canvas: any;
  fabric: any;
  op: BooleanOp;
  objects: any[];
  bundleId: string;
}): Promise<{ created: any; bounds: any; zMax: number } | null> {
  const { canvas, fabric, op, objects, bundleId } = opts;
  if (!Array.isArray(objects) || objects.length < 2) return null;

  const byZ = objects
    .slice()
    .map((o) => ({ o, z: objectZIndex(canvas, o) }))
    .sort((a, b) => a.z - b.z);
  const ordered = op === 'subtract' ? [byZ[byZ.length - 1].o, ...byZ.slice(0, -1).map((x) => x.o)] : byZ.map((x) => x.o);
  const bounds = unionBounds(ordered);
  const zMax = Math.max(...byZ.map((x) => x.z));

  const w = asNum(canvas?.getWidth?.(), 0) || 1;
  const h = asNum(canvas?.getHeight?.(), 0) || 1;
  const paper = await getPaper();
  const scope = new (paper as any).PaperScope();
  scope.setup(new scope.Size(w, h));

  const pathItems: any[] = [];
  for (const o of ordered) {
    const frag = toSvgFragment(o);
    if (!frag) continue;
    const svg = ensureSvgWrapper({ frag, width: w, height: h });
    let imported: any | null = null;
    try {
      imported = scope.project.importSVG(svg, { expandShapes: true }) as any;
    } catch {
      imported = null;
    }
    const pi = itemToPathItem(scope, imported);
    if (pi) pathItems.push(pi);
    try {
      imported?.remove();
    } catch {
      // ignore
    }
  }
  if (pathItems.length < 2) {
    try {
      scope.project.clear();
    } catch {
      // ignore
    }
    return null;
  }

  let acc: any = pathItems[0].clone?.() ?? pathItems[0];
  for (let i = 1; i < pathItems.length; i++) {
    const b = pathItems[i];
    try {
      const next =
        op === 'union' ? acc.unite(b) : op === 'subtract' ? acc.subtract(b) : acc.intersect(b);
      acc.remove?.();
      acc = next;
    } catch {
      // ignore
    }
  }

  let outFrag = '';
  try {
    outFrag = String(acc.exportSVG({ asString: true }) || '');
  } catch {
    outFrag = '';
  }
  const outSvg = ensureSvgWrapper({ frag: outFrag, width: w, height: h });

  const baseStyle = getCommonStyle(objects[0]);
  const loaded = await fabricObjectsFromSvg({ fabric, svg: outSvg });
  let created: any = null;
  if (loaded && loaded.objects.length) {
    created = loaded.objects.length === 1 ? loaded.objects[0] : groupSvgElements(fabric, loaded.objects, loaded.options);
  } else {
    const meta = extractFirstPathD(outSvg);
    if (meta?.d && typeof fabric?.Path === 'function') created = new fabric.Path(meta.d, { fillRule: meta.fillRule });
  }
  if (!created) return null;

  try {
    created.name = `boolean-result:${bundleId}`;
    created.data = { ...(created.data || {}), boolean: { id: bundleId, op } };
    created.set?.({
      fill: baseStyle.fill ?? created.fill,
      stroke: baseStyle.stroke ?? null,
      strokeWidth: baseStyle.strokeWidth ?? created.strokeWidth,
      opacity: 0.35,
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
    });
  } catch {
    // ignore
  }

  try {
    acc.remove();
  } catch {
    // ignore
  }
  try {
    scope.project.clear();
  } catch {
    // ignore
  }

  return { created, bounds, zMax };
}

export async function booleanOpSelection(
  canvas: unknown,
  fabric: unknown,
  op: BooleanOp,
  opts?: { keepSources?: boolean },
): Promise<BooleanBundle | null> {
  const c = canvas as any;
  const f = fabric as any;
  const selection = getSelection(canvas).filter(Boolean);
  if (selection.length < 2) return null;

  // Disallow obvious non-geometry objects for v1.
  const usable = selection.filter((o) => {
    const t = String((o as any)?.type || '');
    return t !== 'image';
  });
  if (usable.length < 2) return null;

  // Stabilize subtract order: use z-order (topmost as A, subtract the rest).
  const byZ = usable
    .slice()
    .map((o) => ({ o, z: objectZIndex(c, o) }))
    .sort((a, b) => a.z - b.z);
  const ordered =
    op === 'subtract'
      ? [byZ[byZ.length - 1].o, ...byZ.slice(0, -1).map((x) => x.o)] // A then Bs
      : byZ.map((x) => x.o);

  const bounds = unionBounds(ordered);
  const zMin = Math.min(...byZ.map((x) => x.z));
  const zMax = Math.max(...byZ.map((x) => x.z));

  const w = asNum(c?.getWidth?.(), 0) || 1;
  const h = asNum(c?.getHeight?.(), 0) || 1;

  const paper = await getPaper();
  const scope = new (paper as any).PaperScope();
  scope.setup(new scope.Size(w, h));

  const pathItems: any[] = [];
  for (const o of ordered) {
    const frag = toSvgFragment(o);
    if (!frag) continue;
    const svg = ensureSvgWrapper({ frag, width: w, height: h });
    let imported: any | null = null;
    try {
      imported = scope.project.importSVG(svg, { expandShapes: true }) as any;
    } catch {
      imported = null;
    }
    const pi = itemToPathItem(scope, imported);
    if (pi) pathItems.push(pi);
    try {
      imported?.remove();
    } catch {
      // ignore
    }
  }
  if (pathItems.length < 2) {
    try {
      scope.project.clear();
    } catch {
      // ignore
    }
    return null;
  }

  let acc: any = pathItems[0].clone?.() ?? pathItems[0];
  for (let i = 1; i < pathItems.length; i++) {
    const b = pathItems[i];
    try {
      const next =
        op === 'union' ? acc.unite(b) : op === 'subtract' ? acc.subtract(b) : acc.intersect(b);
      acc.remove?.();
      acc = next;
    } catch {
      // ignore op failure, keep current acc
    }
  }

  // Export result to SVG.
  let outFrag = '';
  try {
    outFrag = String(acc.exportSVG({ asString: true }) || '');
  } catch {
    outFrag = '';
  }
  const outSvg = ensureSvgWrapper({ frag: outFrag, width: w, height: h });

  // Replace selection with result in Fabric.
  const baseStyle = getCommonStyle(ordered[0]);

  const loaded = await fabricObjectsFromSvg({ fabric, svg: outSvg });
  let created: any = null;
  if (loaded && loaded.objects.length) {
    const node = loaded.objects.length === 1 ? loaded.objects[0] : groupSvgElements(fabric, loaded.objects, loaded.options);
    created = node;
  } else {
    // Fallback: parse first path d and create a Fabric.Path manually.
    const meta = extractFirstPathD(outSvg);
    const f = fabric as any;
    if (meta?.d && typeof f?.Path === 'function') {
      created = new f.Path(meta.d, { fillRule: meta.fillRule });
    }
  }

  if (!created) return null;

  const id = uid();
  const resultName = `boolean-result:${id}`;
  const sourceName = `boolean-src:${id}`;

  // Tag sources so we can find/edit/recompute this boolean later.
  tagBooleanSources(id, ordered);

  try {
    if (typeof created.set === 'function') {
      created.set({
        fill: baseStyle.fill ?? created.fill,
        stroke: baseStyle.stroke ?? null,
        strokeWidth: baseStyle.strokeWidth ?? created.strokeWidth,
        opacity: baseStyle.opacity ?? created.opacity,
      });
      // Stabilize anchoring for post-import placement.
      created.set({ originX: 'left', originY: 'top' });
    } else {
      // best-effort
      created.fill = baseStyle.fill ?? created.fill;
      created.stroke = baseStyle.stroke ?? null;
      created.strokeWidth = baseStyle.strokeWidth ?? created.strokeWidth;
      created.opacity = baseStyle.opacity ?? created.opacity;
    }
  } catch {
    // ignore
  }

  // Attach bundle metadata so we can "edit boolean" later.
  try {
    created.name = resultName;
    created.data = { ...(created.data || {}), boolean: { id, op } };
  } catch {
    // ignore
  }

  // Keep original sources (hidden) so the boolean can be edited later.
  const keepSources = opts?.keepSources !== false;
  let srcGroup: any = null;
  if (keepSources) {
    try {
      // Remove sources from canvas and group them at the same stacking position.
      ordered.forEach((o: any) => c.remove(o));
      srcGroup = typeof f?.Group === 'function' ? new f.Group(ordered, {}) : null;
      if (srcGroup) {
        srcGroup.name = sourceName;
        srcGroup.data = { ...(srcGroup.data || {}), boolean: { id, op } };
        srcGroup.set?.({ visible: false, selectable: false, evented: false });
        try {
          srcGroup.subTargetCheck = false;
        } catch {
          // ignore
        }
        c.add(srcGroup);
        if (typeof c.moveTo === 'function') c.moveTo(srcGroup, zMin);
      }
    } catch {
      srcGroup = null;
      // If grouping fails, fall back to destructive behavior.
      try {
        ordered.forEach((o: any) => c.remove(o));
      } catch {
        // ignore
      }
    }
  } else {
    try {
      ordered.forEach((o: any) => c.remove(o));
    } catch {
      // ignore
    }
  }

  // Add result, preserve z-order, and align to original bounds (prevents "jump").
  try {
    c.discardActiveObject?.();
  } catch {
    // ignore
  }
  try {
    c.add(created);
    if (typeof c.moveTo === 'function') c.moveTo(created, zMax);
    if (bounds) {
      // 2-pass alignment helps when Fabric recomputes path offsets after first move.
      alignToBounds(c, f, created, { left: bounds.left, top: bounds.top });
      alignToBounds(c, f, created, { left: bounds.left, top: bounds.top });
    }
    c.setActiveObject?.(created);
  } catch {
    // ignore
  }
  try {
    c.requestRenderAll?.();
  } catch {
    // ignore
  }

  // Cleanup paper scope.
  try {
    acc.remove();
  } catch {
    // ignore
  }
  try {
    scope.project.clear();
  } catch {
    // ignore
  }
  return { id, op, resultName, sourceName };
}

export function enterBooleanEdit(canvas: unknown, bundleId: string): void {
  const c = canvas as any;
  const src = findByName(c, `boolean-src:${bundleId}`);
  const res = findByName(c, `boolean-result:${bundleId}`);
  if (!res) return;

  // Preview the result while editing (non-interactive).
  try {
    if (!res.data || typeof res.data !== 'object') res.data = {};
    if (typeof res.data.booleanPrevOpacity !== 'number') res.data.booleanPrevOpacity = res.opacity ?? 1;
    res.set?.({ visible: true, selectable: false, evented: false, opacity: 0.35 });
  } catch {
    // ignore
  }

  // If sources are grouped, explode them into editable top-level objects (Penpot-style edit).
  try {
    if (src) {
      // Back-compat: ensure sources are tagged before we ungroup them.
      try {
        if (Array.isArray(src._objects) && src._objects.length) tagBooleanSources(bundleId, src._objects);
      } catch {
        // ignore
      }

      // Restore child coords from group space to canvas space before removing the group.
      try {
        src._restoreObjectsState?.();
      } catch {
        // ignore
      }
      const kids: any[] = Array.isArray(src._objects) ? src._objects.slice() : [];
      try {
        c.remove(src);
      } catch {
        // ignore
      }
      kids.forEach((o: any) => {
        try {
          o.group = null;
        } catch {
          // ignore
        }
        try {
          o.visible = true;
          o.selectable = true;
          o.evented = true;
          o.lockMovementX = false;
          o.lockMovementY = false;
          o.lockRotation = false;
          o.lockScalingX = false;
          o.lockScalingY = false;
        } catch {
          // ignore
        }
        try {
          c.add(o);
        } catch {
          // ignore
        }
      });
      try {
        if (kids[0]) c.setActiveObject?.(kids[0]);
      } catch {
        // ignore
      }
    } else {
      // Sources already ungrouped.
      const sources = getBooleanSources(c, bundleId);
      sources.forEach((o: any) => {
        try {
          o.visible = true;
          o.selectable = true;
          o.evented = true;
        } catch {
          // ignore
        }
      });
      if (sources.length && typeof c.setActiveObject === 'function') c.setActiveObject(sources[0]);
    }
  } catch {
    // ignore
  }

  try {
    c.requestRenderAll?.();
  } catch {
    // ignore
  }
}

export async function recomputeBooleanFromSelection(canvas: unknown, fabric: unknown, bundleId: string): Promise<BooleanBundle | null> {
  const c = canvas as any;
  const res = findByName(c, `boolean-result:${bundleId}`);
  const meta = isBooleanResult(res);
  if (!meta) return null;
  const op = meta.op;

  // Deterministic: recompute from boolean-tagged sources (not arbitrary selection).
  const sources = getBooleanSources(c, bundleId).filter(Boolean);
  if (sources.length < 2) return null;

  const fabricAny = fabric as any;
  const computed = await computeCreatedFromObjects({ canvas: c, fabric: fabricAny, op, objects: sources, bundleId });
  if (!computed) return null;

  // Replace existing result.
  removeAllByName(c, `boolean-result:${bundleId}`);
  try {
    c.add(computed.created);
    if (typeof c.moveTo === 'function') c.moveTo(computed.created, computed.zMax);
    if (computed.bounds) {
      alignToBounds(c, fabricAny, computed.created, { left: computed.bounds.left, top: computed.bounds.top });
      alignToBounds(c, fabricAny, computed.created, { left: computed.bounds.left, top: computed.bounds.top });
    }
  } catch {
    // ignore
  }
  try {
    c.requestRenderAll?.();
  } catch {
    // ignore
  }

  return { id: bundleId, op, resultName: `boolean-result:${bundleId}`, sourceName: `boolean-src:${bundleId}` };
}

async function booleanOpFromObjects(
  canvas: any,
  fabric: unknown,
  op: BooleanOp,
  objects: any[],
  opts: { bundleId?: string },
): Promise<BooleanBundle | null> {
  const fabricAny = fabric as any;
  // Temporarily set selection to provided objects by running the core op on them.
  // We reuse booleanOpSelection logic by mimicking selection, but without relying on canvas active selection order.
  // For v1, we run the core logic inline (duplicated minimally).
  const byZ = objects
    .slice()
    .map((o) => ({ o, z: objectZIndex(canvas, o) }))
    .sort((a, b) => a.z - b.z);
  const ordered =
    op === 'subtract' ? [byZ[byZ.length - 1].o, ...byZ.slice(0, -1).map((x) => x.o)] : byZ.map((x) => x.o);
  const bounds = unionBounds(ordered);
  const zMin = Math.min(...byZ.map((x) => x.z));
  const zMax = Math.max(...byZ.map((x) => x.z));

  const w = asNum(canvas?.getWidth?.(), 0) || 1;
  const h = asNum(canvas?.getHeight?.(), 0) || 1;
  const paper = await getPaper();
  const scope = new (paper as any).PaperScope();
  scope.setup(new scope.Size(w, h));

  const pathItems: any[] = [];
  for (const o of ordered) {
    const frag = toSvgFragment(o);
    if (!frag) continue;
    const svg = ensureSvgWrapper({ frag, width: w, height: h });
    let imported: any | null = null;
    try {
      imported = scope.project.importSVG(svg, { expandShapes: true }) as any;
    } catch {
      imported = null;
    }
    const pi = itemToPathItem(scope, imported);
    if (pi) pathItems.push(pi);
    try {
      imported?.remove();
    } catch {
      // ignore
    }
  }
  if (pathItems.length < 2) return null;

  let acc: any = pathItems[0].clone?.() ?? pathItems[0];
  for (let i = 1; i < pathItems.length; i++) {
    const b = pathItems[i];
    try {
      const next =
        op === 'union' ? acc.unite(b) : op === 'subtract' ? acc.subtract(b) : acc.intersect(b);
      acc.remove?.();
      acc = next;
    } catch {
      // ignore
    }
  }
  let outFrag = '';
  try {
    outFrag = String(acc.exportSVG({ asString: true }) || '');
  } catch {
    outFrag = '';
  }
  const outSvg = ensureSvgWrapper({ frag: outFrag, width: w, height: h });

  const baseStyle = getCommonStyle(ordered[0]);
  const loaded = await fabricObjectsFromSvg({ fabric, svg: outSvg });
  let created: any = null;
  if (loaded && loaded.objects.length) {
    created = loaded.objects.length === 1 ? loaded.objects[0] : groupSvgElements(fabric, loaded.objects, loaded.options);
  } else {
    const meta = extractFirstPathD(outSvg);
    if (meta?.d && typeof fabricAny?.Path === 'function') created = new fabricAny.Path(meta.d, { fillRule: meta.fillRule });
  }
  if (!created) return null;

  const id = opts.bundleId || uid();
  const resultName = `boolean-result:${id}`;
  const sourceName = `boolean-src:${id}`;

  // Tag sources for deterministic recompute/edit.
  tagBooleanSources(id, objects);

  try {
    created.name = resultName;
    created.data = { ...(created.data || {}), boolean: { id, op } };
    created.set?.({
      fill: baseStyle.fill ?? created.fill,
      stroke: baseStyle.stroke ?? null,
      strokeWidth: baseStyle.strokeWidth ?? created.strokeWidth,
      opacity: baseStyle.opacity ?? created.opacity,
    });
    created.set?.({ originX: 'left', originY: 'top' });
  } catch {
    // ignore
  }

  // Regroup + hide sources.
  let srcGroup: any = null;
  try {
    objects.forEach((o) => canvas.remove(o));
    srcGroup = typeof fabricAny?.Group === 'function' ? new fabricAny.Group(objects, {}) : null;
    if (srcGroup) {
      srcGroup.name = sourceName;
      srcGroup.data = { ...(srcGroup.data || {}), boolean: { id, op } };
      srcGroup.set?.({ visible: false, selectable: false, evented: false });
      canvas.add(srcGroup);
      if (typeof canvas.moveTo === 'function') canvas.moveTo(srcGroup, zMin);
    }
  } catch {
    // ignore
  }

  try {
    canvas.add(created);
    if (typeof canvas.moveTo === 'function') canvas.moveTo(created, zMax);
    if (bounds) {
      alignToBounds(canvas, fabricAny, created, { left: bounds.left, top: bounds.top });
      alignToBounds(canvas, fabricAny, created, { left: bounds.left, top: bounds.top });
    }
    canvas.setActiveObject?.(created);
    canvas.requestRenderAll?.();
  } catch {
    // ignore
  }

  try {
    acc.remove();
  } catch {
    // ignore
  }
  try {
    scope.project.clear();
  } catch {
    // ignore
  }
  return { id, op, resultName, sourceName };
}

export function finishBooleanEdit(canvas: unknown, fabric: unknown, bundleId: string): void {
  const c = canvas as any;
  const f = fabric as any;
  const res = findByName(c, `boolean-result:${bundleId}`);

  // Remove any old src group (if still present).
  removeAllByName(c, `boolean-src:${bundleId}`);

  // Collect ungrouped sources (edit mode). We intentionally ignore grouped sources here,
  // because `enterBooleanEdit` explodes the group into top-level objects.
  const sources = (c.getObjects?.() || []).filter((o: any) => o?.data?.booleanSourceId === bundleId);

  try {
    // Regroup sources into a hidden group again.
    if (sources.length && typeof f?.Group === 'function') {
      // Remove sources from canvas before grouping.
      sources.forEach((o: any) => {
        try {
          c.remove(o);
        } catch {
          // ignore
        }
      });
      const g = new f.Group(sources, {});
      g.name = `boolean-src:${bundleId}`;
      g.data = { ...(g.data || {}), boolean: { id: bundleId, op: res?.data?.boolean?.op || 'union' } };
      g.set?.({ visible: false, selectable: false, evented: false });
      try {
        g.subTargetCheck = false;
      } catch {
        // ignore
      }
      c.add(g);
      // Keep sources behind the result.
      try {
        const objs = c.getObjects?.() || [];
        const idxRes = res ? objs.indexOf(res) : -1;
        if (typeof c.moveTo === 'function' && idxRes >= 0) c.moveTo(g, Math.max(0, idxRes - 1));
        else c.sendToBack?.(g);
      } catch {
        // ignore
      }
    } else {
      // Fallback: just hide sources.
      sources.forEach((o: any) => {
        try {
          o.visible = false;
          o.selectable = false;
          o.evented = false;
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }

  try {
    c.discardActiveObject?.();
    if (res) {
      const prev = typeof res?.data?.booleanPrevOpacity === 'number' ? res.data.booleanPrevOpacity : res.opacity ?? 1;
      res.set?.({ visible: true, selectable: true, evented: true, opacity: prev });
      c.setActiveObject?.(res);
    }
    c.requestRenderAll?.();
  } catch {
    // ignore
  }
}

