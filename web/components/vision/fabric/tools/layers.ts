// Fabric layer operations (visibility/lock/reorder/nesting).
// Kept loosely typed to tolerate Fabric major version changes.
// Note: keep local types un-exported to avoid barrel export name collisions.

type FabricCanvasLike = any;
type FabricObjectLike = any;
type FabricLike = any;

function eachObjectDeep(obj: FabricObjectLike, fn: (o: FabricObjectLike) => void) {
  if (!obj) return;
  fn(obj);
  const kids = Array.isArray(obj._objects) ? obj._objects : [];
  kids.forEach((k: any) => eachObjectDeep(k, fn));
}

export function toggleVisible(canvas: FabricCanvasLike, obj: FabricObjectLike, next?: boolean) {
  if (!canvas || !obj) return;
  const v = typeof next === 'boolean' ? next : !(obj.visible !== false);
  try {
    obj.visible = v;
  } catch {
    // ignore
  }
  canvas.requestRenderAll?.();
}

export function setLocked(canvas: FabricCanvasLike, obj: FabricObjectLike, locked: boolean) {
  if (!canvas || !obj) return;
  eachObjectDeep(obj, (o) => {
    try {
      o.selectable = !locked;
      o.evented = !locked;
      o.lockMovementX = locked;
      o.lockMovementY = locked;
      o.lockRotation = locked;
      o.lockScalingX = locked;
      o.lockScalingY = locked;
    } catch {
      // ignore
    }
  });
  try {
    if (locked) canvas.discardActiveObject?.();
  } catch {
    // ignore
  }
  canvas.requestRenderAll?.();
}

export function renameLayer(canvas: FabricCanvasLike, obj: FabricObjectLike, name: string) {
  if (!canvas || !obj) return;
  try {
    obj.name = String(name || '').trim();
  } catch {
    // ignore
  }
  canvas.requestRenderAll?.();
}

export function moveLayer(canvas: FabricCanvasLike, obj: FabricObjectLike, direction: 'up' | 'down') {
  if (!canvas || !obj) return;
  // If nested inside a group, reorder within the group.
  const parent = obj.group || null;
  if (parent && Array.isArray(parent._objects)) {
    const arr = parent._objects as any[];
    const idx = arr.indexOf(obj);
    if (idx < 0) return;
    const nextIdx = direction === 'up' ? Math.min(arr.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (nextIdx === idx) return;
    arr.splice(idx, 1);
    arr.splice(nextIdx, 0, obj);
    try {
      parent.dirty = true;
      parent._calcBounds?.();
      parent._updateObjectsCoords?.();
    } catch {
      // ignore
    }
    canvas.requestRenderAll?.();
    return;
  }

  // Top-level reorder.
  try {
    const objs = canvas.getObjects?.() || [];
    const idx = objs.indexOf(obj);
    if (idx < 0) return;
    const nextIdx = direction === 'up' ? Math.min(objs.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (nextIdx === idx) return;
    canvas.moveTo?.(obj, nextIdx);
    canvas.requestRenderAll?.();
  } catch {
    // ignore
  }
}

export function moveLayerTo(canvas: FabricCanvasLike, obj: FabricObjectLike, nextIndex: number) {
  if (!canvas || !obj) return;
  const parent = obj.group || null;
  if (parent && Array.isArray(parent._objects)) {
    const arr = parent._objects as any[];
    const idx = arr.indexOf(obj);
    if (idx < 0) return;
    const clamped = Math.max(0, Math.min(arr.length - 1, Math.floor(nextIndex)));
    if (clamped === idx) return;
    arr.splice(idx, 1);
    arr.splice(clamped, 0, obj);
    try {
      parent.dirty = true;
      parent._calcBounds?.();
      parent._updateObjectsCoords?.();
    } catch {
      // ignore
    }
    canvas.requestRenderAll?.();
    return;
  }

  try {
    const objs = canvas.getObjects?.() || [];
    const idx = objs.indexOf(obj);
    if (idx < 0) return;
    const clamped = Math.max(0, Math.min(objs.length - 1, Math.floor(nextIndex)));
    if (clamped === idx) return;
    canvas.moveTo?.(obj, clamped);
    canvas.requestRenderAll?.();
  } catch {
    // ignore
  }
}

export function nestIntoGroup(canvas: FabricCanvasLike, fabric: FabricLike, obj: FabricObjectLike, targetGroup: FabricObjectLike) {
  if (!canvas || !obj || !targetGroup) return;
  if (targetGroup.type !== 'group') return;
  if (obj === targetGroup) return;

  // Preserve absolute center.
  let center: any = null;
  try {
    center = obj.getCenterPoint?.();
  } catch {
    center = null;
  }

  // Remove from current parent.
  try {
    if (obj.group && typeof obj.group.removeWithUpdate === 'function') obj.group.removeWithUpdate(obj);
    else canvas.remove?.(obj);
  } catch {
    // ignore
  }

  // Add into group.
  try {
    if (typeof targetGroup.addWithUpdate === 'function') targetGroup.addWithUpdate(obj);
    else if (typeof targetGroup.add === 'function') targetGroup.add(obj);
    else if (Array.isArray(targetGroup._objects)) targetGroup._objects.push(obj);
  } catch {
    // ignore
  }

  // Restore position inside group coordinates.
  try {
    if (center && typeof targetGroup.toLocalPoint === 'function' && typeof obj.setPositionByOrigin === 'function') {
      const local = targetGroup.toLocalPoint(center, 'center', 'center');
      obj.setPositionByOrigin(local, 'center', 'center');
    } else if (center && fabric?.util?.transformPoint && typeof targetGroup.calcTransformMatrix === 'function') {
      const m = targetGroup.calcTransformMatrix();
      const inv = fabric.util.invertTransform?.(m);
      const local = inv ? fabric.util.transformPoint(center, inv) : null;
      if (local && typeof obj.setPositionByOrigin === 'function') obj.setPositionByOrigin(local, 'center', 'center');
    }
  } catch {
    // ignore
  }

  try {
    targetGroup.setCoords?.();
  } catch {
    // ignore
  }
  canvas.requestRenderAll?.();
}

export function unnestFromGroup(canvas: FabricCanvasLike, fabric: FabricLike, obj: FabricObjectLike) {
  if (!canvas || !obj) return;
  const parent = obj.group;
  if (!parent) return;

  let center: any = null;
  try {
    center = obj.getCenterPoint?.();
  } catch {
    center = null;
  }

  try {
    if (typeof parent.removeWithUpdate === 'function') parent.removeWithUpdate(obj);
    else if (Array.isArray(parent._objects)) parent._objects = parent._objects.filter((x: any) => x !== obj);
  } catch {
    // ignore
  }

  try {
    canvas.add?.(obj);
  } catch {
    // ignore
  }

  try {
    if (center && typeof obj.setPositionByOrigin === 'function') obj.setPositionByOrigin(center, 'center', 'center');
  } catch {
    // ignore
  }

  try {
    obj.setCoords?.();
    parent.setCoords?.();
  } catch {
    // ignore
  }
  canvas.requestRenderAll?.();
}

