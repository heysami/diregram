export type NxFxRaster = {
  /** Object URL for a PNG/WebP blob (preferred) or data URL fallback. */
  url: string;
  /** Pixel dimensions of the raster buffer. */
  pixelWidth: number;
  pixelHeight: number;
  /** Used to avoid tearing during updates. */
  updatedAt: number;
};

const cache = new Map<string, NxFxRaster>();
const urlToKey = new Map<string, string>();

function isObjectUrl(url: string): boolean {
  return typeof url === 'string' && url.startsWith('blob:');
}

export function getNxFxRaster(shapeId: string): NxFxRaster | null {
  return cache.get(String(shapeId)) || null;
}

export function setNxFxRaster(shapeId: string, raster: NxFxRaster | null): void {
  const key = String(shapeId);
  const prev = cache.get(key);
  if (prev?.url && isObjectUrl(prev.url)) {
    try {
      URL.revokeObjectURL(prev.url);
    } catch {
      // ignore
    }
  }
  if (!raster) {
    cache.delete(key);
    return;
  }
  cache.set(key, raster);
  urlToKey.set(raster.url, key);
}

export function clearAllNxFxRasters(): void {
  for (const [, r] of cache) {
    if (r?.url && isObjectUrl(r.url)) {
      try {
        URL.revokeObjectURL(r.url);
      } catch {
        // ignore
      }
    }
  }
  cache.clear();
  urlToKey.clear();
}

