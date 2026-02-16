import { isFxVisibilityOverrideActive } from '@/components/vision/tldraw/fx/fxVisibilityOverride';
import { isNxFxEmpty, readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';

/**
 * Whether the vector source shape should render its SVG component.
 * We suppress only after the proxy is ready, to avoid blanks while raster is computing.
 */
export function shouldSuppressVectorSourceRender(meta: any): boolean {
  // During rasterization exports, we must render the vector source even if fx is active.
  if (isFxVisibilityOverrideActive()) return false;
  const fx = readNxFxFromMeta(meta);
  const hasFx = fx && !isNxFxEmpty(fx);
  if (!hasFx) return false;
  const editMode = Boolean(meta?.nxFxEditMode);
  if (editMode) return false;
  const proxyReady = Boolean(meta?.nxFxProxyReady);
  return proxyReady;
}

