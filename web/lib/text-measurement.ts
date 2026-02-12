/**
 * Text Measurement Utilities
 * 
 * Calculates the actual height needed for text content when wrapped to a fixed width.
 */

const NODE_WIDTH = 150;
const NODE_PADDING_X = 12; // px-3 = 12px on each side
const NODE_PADDING_Y = 8; // py-2 = 8px on each side
const LINE_HEIGHT = 1.5; // text-sm with line-height
const FONT_SIZE = 14; // text-sm = 14px

// In mac3 theme, the node label rendering adds extra horizontal insets that
// affect wrapping in view mode:
// - `.mac-double-outline` adds a 1px border on each side (2px total)
// - `.mac-label-plate` adds 4px horizontal padding on each side (8px total)
// If our measurement doesn't account for these, we can underestimate line wraps
// and compute a height that's too small, causing clipped text.
const MAC3_NODE_LABEL_EXTRA_INSET_X_PX = 2 + 8;

function getNodeLabelExtraInsetXPx(): number {
  if (typeof document === 'undefined') return 0;
  const theme = document.documentElement?.getAttribute('data-theme');
  return theme === 'mac3' ? MAC3_NODE_LABEL_EXTRA_INSET_X_PX : 0;
}

// Cache for text measurements to avoid repeated calculations
const measurementCache = new Map<string, number>();

type TextHeightOpts = {
  text: string;
  boxWidth: number;
  paddingX: number;
  paddingY: number;
  fontSizePx: number;
  fontWeight: number;
  lineHeight: number;
};

export function calculateTextHeightCustom(opts: TextHeightOpts): number {
  const { text, boxWidth, paddingX, paddingY, fontSizePx, fontWeight, lineHeight } = opts;

  const normalizedText = text || '';
  // Check cache
  const cacheKey = `custom|${normalizedText}|${boxWidth}|${paddingX}|${paddingY}|${fontSizePx}|${fontWeight}|${lineHeight}`;
  if (measurementCache.has(cacheKey)) return measurementCache.get(cacheKey)!;

  const minHeight = paddingY * 2 + fontSizePx * lineHeight;
  if (!normalizedText.trim()) {
    measurementCache.set(cacheKey, minHeight);
    return minHeight;
  }

  const availableWidth = boxWidth - paddingX * 2;

  // Use canvas for accurate text measurement if available
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = `${fontWeight} ${fontSizePx}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      const textLines = normalizedText.split('\n');
      const wrapped: string[] = [];
      textLines.forEach((line) => {
        if (!line.trim()) {
          wrapped.push('');
          return;
        }
        const words = line.split(' ');
        let currentLine = '';
        words.forEach((word) => {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const metrics = context.measureText(testLine);
          if (metrics.width > availableWidth && currentLine) {
            wrapped.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        });
        if (currentLine) wrapped.push(currentLine);
      });

      const linesCount = Math.max(1, wrapped.length);
      const calculatedHeight = paddingY * 2 + linesCount * fontSizePx * lineHeight;
      const height = Math.max(minHeight, calculatedHeight);

      if (measurementCache.size > 1000) {
        const firstKey = measurementCache.keys().next().value;
        if (typeof firstKey === 'string') measurementCache.delete(firstKey);
      }
      measurementCache.set(cacheKey, height);
      return height;
    }
  }

  // Fallback: estimate based on character count (for SSR or when canvas unavailable)
  const avgCharWidth = fontSizePx * 0.6;
  const charsPerLine = Math.max(1, Math.floor(availableWidth / avgCharWidth));
  const lines = Math.max(1, Math.ceil(normalizedText.length / charsPerLine));
  const height = paddingY * 2 + lines * fontSizePx * lineHeight;
  measurementCache.set(cacheKey, Math.max(minHeight, height));
  return Math.max(minHeight, height);
}

/**
 * Calculates the height needed for text content when wrapped to the node width.
 * Takes into account padding, line height, and font size.
 */
export function calculateTextHeight(text: string, nodeWidth: number = NODE_WIDTH): number {
  // Reduce effective measurement width to match rendered label's usable width.
  const extraInsetX = getNodeLabelExtraInsetXPx();
  const effectiveBoxWidth = Math.max(1, nodeWidth - extraInsetX);
  return calculateTextHeightCustom({
    text,
    boxWidth: effectiveBoxWidth,
    paddingX: NODE_PADDING_X,
    paddingY: NODE_PADDING_Y,
    fontSizePx: FONT_SIZE,
    fontWeight: 500,
    lineHeight: LINE_HEIGHT,
  });
}

/**
 * Clears the measurement cache (useful for testing or when font changes)
 */
export function clearMeasurementCache(): void {
  measurementCache.clear();
}
