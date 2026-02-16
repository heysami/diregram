// Lightweight action helpers over a Fabric.js canvas.
// We keep types intentionally loose so Fabric major version changes don't cascade.

export type FabricCanvasLike = any;
export type FabricLike = any;

function getActiveObject(canvas: FabricCanvasLike) {
  return canvas?.getActiveObject?.() || null;
}

export function setSelectMode(canvas: FabricCanvasLike) {
  if (!canvas) return;
  canvas.isDrawingMode = false;
  canvas.selection = true;
}

export function setPenMode(canvas: FabricCanvasLike, fabric: FabricLike, opts: { color: string; width: number }) {
  if (!canvas || !fabric) return;
  canvas.isDrawingMode = true;
  canvas.selection = false;
  const brush = new fabric.PencilBrush(canvas);
  brush.color = opts.color;
  brush.width = opts.width;
  canvas.freeDrawingBrush = brush;
}

export function addRect(canvas: FabricCanvasLike, fabric: FabricLike, opts: { fill: string; stroke: string; strokeWidth: number }) {
  if (!canvas || !fabric) return;
  const rect = new fabric.Rect({
    left: canvas.getWidth() * 0.2,
    top: canvas.getHeight() * 0.2,
    width: canvas.getWidth() * 0.35,
    height: canvas.getHeight() * 0.25,
    fill: opts.fill,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
  });
  canvas.add(rect);
  canvas.setActiveObject(rect);
  canvas.requestRenderAll();
}

export function addEllipse(canvas: FabricCanvasLike, fabric: FabricLike, opts: { fill: string; stroke: string; strokeWidth: number }) {
  if (!canvas || !fabric) return;
  const ellipse = new fabric.Ellipse({
    left: canvas.getWidth() * 0.25,
    top: canvas.getHeight() * 0.25,
    rx: canvas.getWidth() * 0.15,
    ry: canvas.getHeight() * 0.1,
    fill: opts.fill,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
  });
  canvas.add(ellipse);
  canvas.setActiveObject(ellipse);
  canvas.requestRenderAll();
}

export function addLine(canvas: FabricCanvasLike, fabric: FabricLike, opts: { stroke: string; strokeWidth: number }) {
  if (!canvas || !fabric) return;
  const w = canvas.getWidth();
  const h = canvas.getHeight();
  const line = new fabric.Line([w * 0.2, h * 0.2, w * 0.7, h * 0.7], {
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
  });
  canvas.add(line);
  canvas.setActiveObject(line);
  canvas.requestRenderAll();
}

export function addText(canvas: FabricCanvasLike, fabric: FabricLike, opts: { fill: string; fontFamily: string; fontSize: number }) {
  if (!canvas || !fabric) return;
  const text = new fabric.IText('Text', {
    left: canvas.getWidth() * 0.25,
    top: canvas.getHeight() * 0.25,
    fill: opts.fill,
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.requestRenderAll();
}

export function groupSelection(canvas: FabricCanvasLike) {
  if (!canvas) return;
  const obj = getActiveObject(canvas);
  if (!obj) return;
  // Fabric v5/v6: ActiveSelection can be converted to Group.
  if (obj.type === 'activeSelection' && typeof obj.toGroup === 'function') {
    const group = obj.toGroup();
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
  }
}

export function ungroup(canvas: FabricCanvasLike) {
  if (!canvas) return;
  const obj = getActiveObject(canvas);
  if (!obj) return;
  // Special-case: "Ungroup" on a boolean result should delete the result and
  // restore its source objects (ungrouped).
  try {
    const b = obj?.data?.boolean;
    const bundleId = typeof b?.id === 'string' ? String(b.id) : null;
    if (bundleId) {
      const resultName = `boolean-result:${bundleId}`;
      const sourceName = `boolean-src:${bundleId}`;

      const getObjects = () => (canvas?.getObjects?.() || []) as any[];
      const findByName = (name: string) => getObjects().find((o) => o?.name === name) || null;
      const removeAllByName = (name: string) => {
        for (const o of getObjects()) {
          if (o?.name !== name) continue;
          try {
            canvas.remove(o);
          } catch {
            // ignore
          }
        }
      };
      const eachObjectDeep = (root: any, fn: (o: any) => void) => {
        if (!root) return;
        fn(root);
        const kids = Array.isArray(root._objects) ? root._objects : [];
        for (const k of kids) eachObjectDeep(k, fn);
      };
      const clearBooleanSourceTag = (roots: any[]) => {
        for (const r of Array.isArray(roots) ? roots : []) {
          eachObjectDeep(r, (x) => {
            try {
              if (x?.data && typeof x.data === 'object') delete x.data.booleanSourceId;
            } catch {
              // ignore
            }
          });
        }
      };

      // Delete the boolean result object(s).
      removeAllByName(resultName);

      // Restore sources from the hidden sources group if present; otherwise use already-un-grouped tagged sources.
      const srcGroup: any = findByName(sourceName);
      if (srcGroup && Array.isArray(srcGroup._objects) && srcGroup._objects.length) {
        // Restore child coords from group space to canvas space before removing the group.
        try {
          srcGroup._restoreObjectsState?.();
        } catch {
          // ignore
        }
        const kids: any[] = srcGroup._objects.slice();
        try {
          canvas.remove(srcGroup);
        } catch {
          // ignore
        }

        clearBooleanSourceTag(kids);
        for (const o of kids) {
          try {
            o.group = null;
          } catch {
            // ignore
          }
          try {
            o.visible = true;
            o.selectable = true;
            o.evented = true;
          } catch {
            // ignore
          }
          try {
            canvas.add(o);
          } catch {
            // ignore
          }
        }
        try {
          if (kids[0]) canvas.setActiveObject?.(kids[0]);
        } catch {
          // ignore
        }
      } else {
        // Sources already ungrouped (e.g. while editing boolean).
        const sources = getObjects().filter((o) => o?.data?.booleanSourceId === bundleId);
        clearBooleanSourceTag(sources);
        for (const o of sources) {
          try {
            o.visible = true;
            o.selectable = true;
            o.evented = true;
          } catch {
            // ignore
          }
        }
        try {
          if (sources[0]) canvas.setActiveObject?.(sources[0]);
        } catch {
          // ignore
        }
      }

      try {
        canvas.requestRenderAll?.();
      } catch {
        // ignore
      }
      return;
    }
  } catch {
    // fall through to normal ungroup
  }
  if (obj.type === 'group' && typeof obj.toActiveSelection === 'function') {
    const sel = obj.toActiveSelection();
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
  }
}

export function bringForward(canvas: FabricCanvasLike) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  canvas.bringForward(obj);
  canvas.requestRenderAll();
}

export function sendBackward(canvas: FabricCanvasLike) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  canvas.sendBackwards(obj);
  canvas.requestRenderAll();
}

export function bringToFront(canvas: FabricCanvasLike) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  canvas.bringToFront(obj);
  canvas.requestRenderAll();
}

export function sendToBack(canvas: FabricCanvasLike) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  canvas.sendToBack(obj);
  canvas.requestRenderAll();
}

export function setFill(canvas: FabricCanvasLike, fill: string) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  if ('set' in obj) obj.set('fill', fill);
  canvas.requestRenderAll();
}

export function setStroke(canvas: FabricCanvasLike, stroke: string, strokeWidth?: number) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  if ('set' in obj) {
    obj.set('stroke', stroke);
    if (typeof strokeWidth === 'number') obj.set('strokeWidth', strokeWidth);
  }
  canvas.requestRenderAll();
}

export function setStrokeWidth(canvas: FabricCanvasLike, strokeWidth: number) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  if ('set' in obj) obj.set('strokeWidth', strokeWidth);
  canvas.requestRenderAll();
}

export function setFontFamily(canvas: FabricCanvasLike, fontFamily: string) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  if (obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') {
    obj.set('fontFamily', fontFamily);
    canvas.requestRenderAll();
  }
}

export function setFontSize(canvas: FabricCanvasLike, fontSize: number) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj) return;
  if (obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') {
    obj.set('fontSize', fontSize);
    canvas.requestRenderAll();
  }
}

export function applyLinearGradientFill(canvas: FabricCanvasLike, fabric: FabricLike, c1: string, c2: string) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj || !fabric) return;
  const grad = new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: { x1: 0, y1: 0, x2: 1, y2: 1 },
    colorStops: [
      { offset: 0, color: c1 },
      { offset: 1, color: c2 },
    ],
  });
  obj.set('fill', grad);
  canvas.requestRenderAll();
}

export async function applyBlur(canvas: FabricCanvasLike, fabric: FabricLike, amount: number) {
  const obj = getActiveObject(canvas);
  if (!canvas || !obj || !fabric) return;
  const a = Math.max(0, Math.min(1, amount));

  // Fabric images support filters; other objects get a shadow-blur fallback.
  if (obj.type === 'image' && fabric.Image?.filters?.Blur) {
    const Blur = fabric.Image.filters.Blur;
    const filters = Array.isArray(obj.filters) ? obj.filters.slice() : [];
    // Replace existing blur filter if present.
    const next = filters.filter((f: any) => !(f && f.type === 'Blur'));
    if (a > 0) next.push(new Blur({ blur: a }));
    obj.filters = next;
    await new Promise<void>((resolve) => obj.applyFilters?.(() => resolve()) ?? resolve());
    canvas.requestRenderAll();
    return;
  }

  // Fallback: shadow blur.
  if (a === 0) {
    obj.set('shadow', null);
  } else {
    obj.set('shadow', {
      color: 'rgba(0,0,0,0.35)',
      blur: Math.round(40 * a),
      offsetX: 0,
      offsetY: 0,
    });
  }
  canvas.requestRenderAll();
}

