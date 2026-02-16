'use client';

import type { Editor, TLShapeId } from 'tldraw';

type BooleanOp = 'union' | 'subtract' | 'intersect';

let paperPromise: Promise<any> | null = null;
async function getPaper(): Promise<any> {
  if (!paperPromise) paperPromise = import('paper').then((m: any) => m?.default ?? m);
  return paperPromise;
}

function collectPathItems(scope: any, item: any, out: any[]) {
  if (!item) return;
  const cls = String(item.className || '');
  if (cls === 'Path' || cls === 'CompoundPath') out.push(item);
  const kids: any[] = Array.isArray(item.children) ? item.children : [];
  for (const k of kids) collectPathItems(scope, k, out);
}

function itemToSinglePath(scope: any, item: any): any | null {
  const paths: any[] = [];
  collectPathItems(scope, item, paths);
  if (!paths.length) return null;

  // Ensure deterministic fill for boolean operations.
  for (const p of paths) {
    try {
      p.fillColor = new scope.Color('black');
      p.strokeColor = null;
    } catch {
      // ignore
    }
  }

  if (paths.length === 1) return paths[0];
  let acc = paths[0].clone();
  for (let i = 1; i < paths.length; i++) {
    try {
      const next = acc.unite(paths[i]);
      acc.remove();
      acc = next;
    } catch {
      // ignore
    }
  }
  return acc;
}

function extractPathD(svgFragment: string): string {
  try {
    const doc = new DOMParser().parseFromString(svgFragment, 'image/svg+xml');
    const paths = Array.from(doc.querySelectorAll('path'));
    const ds = paths
      .map((p) => p.getAttribute('d') || '')
      .map((s) => s.trim())
      .filter(Boolean);
    return ds.join(' ');
  } catch {
    return '';
  }
}

function asBox(b: any): { x: number; y: number; w: number; h: number } | null {
  if (!b) return null;
  const x = Number(b.x ?? b.minX ?? 0);
  const y = Number(b.y ?? b.minY ?? 0);
  const w = Number(b.w ?? b.width ?? 0);
  const h = Number(b.h ?? b.height ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function roundedRectPath(w: number, h: number, rtl: number, rtr: number, rbr: number, rbl: number) {
  const tl = clamp(rtl, 0, Math.min(w, h) / 2);
  const tr = clamp(rtr, 0, Math.min(w, h) / 2);
  const br = clamp(rbr, 0, Math.min(w, h) / 2);
  const bl = clamp(rbl, 0, Math.min(w, h) / 2);
  return [
    `M ${tl},0`,
    `H ${w - tr}`,
    tr ? `A ${tr},${tr} 0 0 1 ${w},${tr}` : `L ${w},0`,
    `V ${h - br}`,
    br ? `A ${br},${br} 0 0 1 ${w - br},${h}` : `L ${w},${h}`,
    `H ${bl}`,
    bl ? `A ${bl},${bl} 0 0 1 0,${h - bl}` : `L 0,${h}`,
    `V ${tl}`,
    tl ? `A ${tl},${tl} 0 0 1 ${tl},0` : `L 0,0`,
    'Z',
  ].join(' ');
}

function shapeToBooleanSvg(editor: Editor, id: TLShapeId): string | null {
  const shape: any = (editor as any).getShape?.(id as any);
  if (!shape) return null;

  const w = Math.max(1, Number(shape.props?.w || 1));
  const h = Math.max(1, Number(shape.props?.h || 1));
  const rotRad = Number(shape.rotation || 0);
  const rotDeg = Number.isFinite(rotRad) ? (rotRad * 180) / Math.PI : 0;

  // IMPORTANT: for booleans we intentionally output a *single filled path* only.
  // No strokes, no clipPaths, no defs. PaperJS boolean ops are much more reliable this way.
  if (shape.type === 'nxrect') {
    const radiusUniform = !!shape.props?.radiusUniform;
    const r = clamp(Number(shape.props?.radius ?? 0), 0, Math.min(w, h) / 2);
    const rtl = clamp(Number(shape.props?.radiusTL ?? r), 0, Math.min(w, h) / 2);
    const rtr = clamp(Number(shape.props?.radiusTR ?? r), 0, Math.min(w, h) / 2);
    const rbr = clamp(Number(shape.props?.radiusBR ?? r), 0, Math.min(w, h) / 2);
    const rbl = clamp(Number(shape.props?.radiusBL ?? r), 0, Math.min(w, h) / 2);
    const d = roundedRectPath(
      w,
      h,
      radiusUniform ? r : rtl,
      radiusUniform ? r : rtr,
      radiusUniform ? r : rbr,
      radiusUniform ? r : rbl,
    );
    const tf = rotDeg ? ` transform="rotate(${rotDeg} ${w / 2} ${h / 2})"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="black"${tf}/></svg>`;
  }

  if (shape.type === 'nxpath') {
    const d = String(shape.props?.d || '').trim();
    if (!d) return null;
    const tf = rotDeg ? ` transform="rotate(${rotDeg} ${w / 2} ${h / 2})"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="black"${tf}/></svg>`;
  }

  return null;
}

export async function computeBooleanForShapes(
  editor: Editor,
  ids: TLShapeId[],
  op: BooleanOp,
): Promise<{ x: number; y: number; w: number; h: number; d: string } | null> {
  if (ids.length < 2) return null;

  const bounds =
    asBox((editor as any).getShapesPageBounds?.(ids as any)) ||
    asBox((editor as any).getSelectionPageBounds?.()) ||
    null;
  if (!bounds) return null;

  // Export each shape as its own SVG so we can boolean them deterministically.
  // For Vision shapes we provide a simpler "path-only" SVG to avoid PaperJS import issues
  // with clipPath/defs/patterns.
  const exports = await Promise.all(
    ids.map(async (id) => {
      const visionSvg = shapeToBooleanSvg(editor, id);
      if (visionSvg) return { id: id as TLShapeId, svg: visionSvg };
      try {
        const r = await editor.getSvgString([id], { padding: 0, background: false });
        if (!r?.svg) return null;
        return { id: id as TLShapeId, svg: String(r.svg) };
      } catch {
        return null;
      }
    }),
  );
  const svgs = exports.filter(Boolean) as { id: TLShapeId; svg: string }[];
  if (svgs.length < 2) return null;

  const paper = await getPaper();
  const scope = new (paper as any).PaperScope();
  scope.setup(new scope.Size(bounds.w, bounds.h));

  const items: any[] = [];
  for (const s of svgs) {
    let imported: any = null;
    try {
      imported = scope.project.importSVG(s.svg, { expandShapes: true }) as any;
    } catch {
      imported = null;
    }
    const pi = imported ? itemToSinglePath(scope, imported) : null;
    if (pi) {
      // Align the imported path into bounds-relative page coordinates.
      try {
        const sb = asBox((editor as any).getShapePageBounds?.(s.id as any));
        if (sb) {
          const desiredX = sb.x - bounds.x;
          const desiredY = sb.y - bounds.y;
          const actualX = Number(pi.bounds?.x ?? 0);
          const actualY = Number(pi.bounds?.y ?? 0);
          if (Number.isFinite(desiredX) && Number.isFinite(desiredY) && Number.isFinite(actualX) && Number.isFinite(actualY)) {
            pi.translate(new scope.Point(desiredX - actualX, desiredY - actualY));
          }
        }
      } catch {
        // ignore
      }
      items.push(pi.clone());
    }
    try {
      imported?.remove();
    } catch {
      // ignore
    }
  }

  if (items.length < 2) {
    try {
      scope.project.clear();
    } catch {
      // ignore
    }
    return null;
  }

  let acc: any = items[0].clone();
  for (let i = 1; i < items.length; i++) {
    try {
      const b = items[i];
      const next = op === 'union' ? acc.unite(b) : op === 'subtract' ? acc.subtract(b) : acc.intersect(b);
      acc.remove();
      acc = next;
    } catch {
      // ignore
    }
  }

  const accBounds = acc?.bounds;
  const bw = Number(accBounds?.width || 0);
  const bh = Number(accBounds?.height || 0);
  const bx = Number(accBounds?.x || 0);
  const by = Number(accBounds?.y || 0);
  if (!Number.isFinite(bw) || !Number.isFinite(bh) || bw <= 0 || bh <= 0) {
    try {
      scope.project.clear();
    } catch {
      // ignore
    }
    return null;
  }

  // Normalize to local coordinates (0..w, 0..h).
  try {
    acc.translate(new scope.Point(-bx, -by));
  } catch {
    // ignore
  }

  let frag = '';
  try {
    frag = String(acc.exportSVG({ asString: true }) || '');
  } catch {
    frag = '';
  }
  const d = extractPathD(frag);
  if (!d) return null;

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

  return { x: bounds.x + bx, y: bounds.y + by, w: bw, h: bh, d };
}

