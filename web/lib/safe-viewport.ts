/**
 * Panel-aware "safe viewport" calculation.
 *
 * DO NOT REGRESS.
 *
 * Problem:
 * - Canvases live under floating panels (left markdown, right inspector, etc).
 * - Centering nodes/graphs to the *full* container often places content under panels.
 *
 * Solution:
 * - Panels that should block centering declare:
 *   - data-safe-panel="left" | "right"
 *   - data-safe-panel-view="main" | "flows" | "systemFlow" | "dataObjects" | "*" | "main,flows"
 * - We compute a safe viewport inside the canvas container that excludes overlapping panels.
 */

export type SafePanelSide = 'left' | 'right';

export type SafeViewport = {
  /** Container rect (screen coordinates). */
  rect: DOMRect;
  /** Safe width/height (px), excluding left/right blocking panels. */
  width: number;
  height: number;
  /**
   * Center in *container-local* pixels:
   * - screenX = rect.left + centerX
   * - screenY = rect.top + centerY
   */
  centerX: number;
  centerY: number;
};

function parseViewList(attr: string | null | undefined): string[] {
  if (!attr) return [];
  return attr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function panelMatchesView(panelEl: HTMLElement, view: string): boolean {
  const attr = panelEl.getAttribute('data-safe-panel-view');
  if (!attr || attr.trim() === '' || attr.trim() === '*') return true;
  return parseViewList(attr).includes(view);
}

function isVisible(panelEl: HTMLElement): boolean {
  if (!panelEl.isConnected) return false;
  const cs = window.getComputedStyle(panelEl);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  const r = panelEl.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function overlapsY(a: DOMRect, b: DOMRect): boolean {
  return Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
}

export function computeSafeViewport(opts: {
  containerEl: HTMLElement | null;
  view: string;
  /** Minimum safe width (px) before we fall back to full width. */
  minWidthPx?: number;
}): SafeViewport | null {
  const { containerEl, view, minWidthPx = 80 } = opts;
  if (!containerEl) return null;
  const rect = containerEl.getBoundingClientRect();

  let safeLeft = rect.left;
  let safeRight = rect.right;
  const safeTop = rect.top;
  const safeBottom = rect.bottom;

  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-safe-panel]')).filter(
    (p) => panelMatchesView(p, view) && isVisible(p),
  );

  panels.forEach((p) => {
    const side = (p.getAttribute('data-safe-panel') || '').toLowerCase() as SafePanelSide | string;
    const pr = p.getBoundingClientRect();
    if (!overlapsY(rect, pr)) return;
    if (side === 'left') safeLeft = Math.max(safeLeft, pr.right);
    if (side === 'right') safeRight = Math.min(safeRight, pr.left);
  });

  // Fallback if panels collapse the safe area.
  if (safeRight - safeLeft < minWidthPx) {
    safeLeft = rect.left;
    safeRight = rect.right;
  }

  const width = Math.max(1, safeRight - safeLeft);
  const height = Math.max(1, safeBottom - safeTop);
  const centerX = (safeLeft + safeRight) / 2 - rect.left;
  const centerY = (safeTop + safeBottom) / 2 - rect.top;

  return { rect, width, height, centerX, centerY };
}

