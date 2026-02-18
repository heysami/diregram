'use client';

export type SvgViewBox = { x: number; y: number; w: number; h: number };
export type SvgBBox = { x: number; y: number; w: number; h: number };

export function extractPathDFromSvg(svgFragment: string): string {
  try {
    const doc = new DOMParser().parseFromString(String(svgFragment || ''), 'image/svg+xml');
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

export function readSvgViewBox(svg: string): SvgViewBox | null {
  try {
    const doc = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
    const root = doc.querySelector('svg');
    if (!root) return null;
    const vb = String(root.getAttribute('viewBox') || '');
    const m = vb.match(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/);
    if (m) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      const w = Number(m[3]);
      const h = Number(m[4]);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { x, y, w, h };
    }
    const wAttr = Number(root.getAttribute('width') || 0);
    const hAttr = Number(root.getAttribute('height') || 0);
    if (Number.isFinite(wAttr) && Number.isFinite(hAttr) && wAttr > 0 && hAttr > 0) return { x: 0, y: 0, w: wAttr, h: hAttr };
  } catch {
    // ignore
  }
  return null;
}

/**
 * Computes an overall bbox across all `<path>` elements, including their transforms.
 * Uses `getBBox()` which requires a live DOM node.
 */
export function computeSvgPathsBBox(svg: string): SvgBBox | null {
  try {
    const doc = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
    const root = doc.querySelector('svg');
    if (!root) return null;

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '-10000px';
    host.style.width = '10px';
    host.style.height = '10px';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';

    const live = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const vb = root.getAttribute('viewBox');
    if (vb) live.setAttribute('viewBox', vb);
    live.innerHTML = root.innerHTML;
    host.appendChild(live);
    document.body.appendChild(host);

    const paths = Array.from(live.querySelectorAll('path')) as any[];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of paths) {
      if (!p || typeof p.getBBox !== 'function') continue;
      const bb = p.getBBox();
      const x = Number(bb?.x ?? 0);
      const y = Number(bb?.y ?? 0);
      const w = Number(bb?.width ?? 0);
      const h = Number(bb?.height ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) continue;
      if (w <= 0 || h <= 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    try {
      document.body.removeChild(host);
    } catch {
      // ignore
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    const outW = maxX - minX;
    const outH = maxY - minY;
    if (!Number.isFinite(outW) || !Number.isFinite(outH) || outW <= 0 || outH <= 0) return null;
    return { x: minX, y: minY, w: outW, h: outH };
  } catch {
    return null;
  }
}

/**
 * tldraw `draw` exports often encode the stroke as a filled outline path (no `stroke`).
 * In that case we should treat fill as the primary paint and disable stroke.
 */
export function detectSvgFillOnlyPath(svg: string): boolean {
  try {
    const doc = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
    const firstPath = doc.querySelector('path');
    const fillAttr = firstPath?.getAttribute('fill');
    const strokeAttr = firstPath?.getAttribute('stroke');
    return !!fillAttr && (!strokeAttr || strokeAttr === 'none');
  } catch {
    return false;
  }
}

