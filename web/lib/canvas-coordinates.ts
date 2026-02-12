export type Point = { x: number; y: number };

export function clientToWorldPoint(opts: {
  containerEl: HTMLElement | null;
  viewportEl?: HTMLElement | null;
  clientX: number;
  clientY: number;
  // Fallback mapping if DOMMatrix inversion fails:
  offset: { x: number; y: number };
  scale: number;
}): Point | null {
  const { containerEl, viewportEl, clientX, clientY, offset, scale } = opts;
  if (!containerEl) return null;
  const rect = containerEl.getBoundingClientRect();

  // Prefer using the DOM's actual transform matrix so selection stays aligned even if
  // transform order changes or CSS transitions are mid-flight.
  const el = viewportEl || null;
  if (el) {
    // Compute the point in *viewport screen space* by subtracting the viewport's rendered
    // top-left (this implicitly accounts for any translation, regardless of how the browser
    // serializes the transform matrix).
    const vRect = el.getBoundingClientRect();
    const vx = clientX - vRect.left;
    const vy = clientY - vRect.top;

    // Then divide by the viewport's rendered scale.
    // We still prefer reading the scale from computed style, but fall back to the passed-in `scale`.
    const tStr = window.getComputedStyle(el).transform;
    if (tStr && tStr !== 'none') {
      try {
        const m = new DOMMatrixReadOnly(tStr);
        const ax = m.a || 0;
        const dy = m.d || 0;
        if (Math.abs(ax) > 1e-9 && Math.abs(dy) > 1e-9) {
          return { x: vx / ax, y: vy / dy };
        }
      } catch {
        // Fall back below.
      }
    }

    if (Math.abs(scale) > 1e-9) {
      return { x: vx / scale, y: vy / scale };
    }
  }

  // Fallback: assume screen = world * scale + offset
  // Here "screen" means container-local coordinates (relative to the container's rendered top-left).
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return { x: (sx - offset.x) / scale, y: (sy - offset.y) / scale };
}

