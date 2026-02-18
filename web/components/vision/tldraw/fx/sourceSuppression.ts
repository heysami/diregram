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
  const requiresProxy = (() => {
    if (!fx || isNxFxEmpty(fx)) return false;
    // Effects always require proxy.
    if (((fx as any).effects?.length || 0) > 0) return true;
    const ds = Array.isArray((fx as any).distortions) ? (fx as any).distortions : [];
    // Any non-mask distortion requires proxy.
    if (ds.some((d: any) => d && d.kind !== 'mask')) return true;
    // Alpha-mode mask requires proxy (needs rendered alpha).
    if (ds.some((d: any) => d && d.kind === 'mask' && d.enabled !== false && String(d.mode || 'alpha') !== 'shape')) return true;
    // Shape-mode masks can be applied in vector render; no proxy needed.
    return false;
  })();
  if (!requiresProxy) return false;
  const editMode = Boolean(meta?.nxFxEditMode);
  if (editMode) return false;
  const proxyReady = Boolean(meta?.nxFxProxyReady);
  return proxyReady;
}

