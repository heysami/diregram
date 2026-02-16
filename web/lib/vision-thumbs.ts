export type NormalizedCropRect = { x: number; y: number; w: number; h: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeCropRect(r: NormalizedCropRect | null | undefined): NormalizedCropRect {
  const min = 0.02;
  const x = clamp01(Number(r?.x ?? 0));
  const y = clamp01(Number(r?.y ?? 0));
  const w0 = clamp01(Number(r?.w ?? 1));
  const h0 = clamp01(Number(r?.h ?? 1));
  const w = Math.max(min, Math.min(1 - x, w0 || 1));
  const h = Math.max(min, Math.min(1 - y, h0 || 1));
  return { x, y, w, h };
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const url = String(dataUrl || '').trim();
  if (!url) throw new Error('Missing image data URL');
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

/**
 * Crop a PNG/JPEG data URL using normalized coordinates and return a PNG data URL of size outPx × outPx.
 * Used for both the 24×24 grid thumb and larger mirrored preview tiles.
 */
export async function cropAndScaleDataUrl(opts: {
  dataUrl: string;
  crop: NormalizedCropRect | null | undefined;
  outPx: number;
  /** How to fit a non-square crop into square output. */
  fit?: 'cover' | 'contain';
}): Promise<string | null> {
  const outPx = Math.max(1, Math.min(2048, Math.round(Number(opts.outPx || 24))));
  const crop = normalizeCropRect(opts.crop);
  const img = await loadImage(opts.dataUrl);

  const iw = Math.max(1, img.naturalWidth || img.width || 1);
  const ih = Math.max(1, img.naturalHeight || img.height || 1);

  const sx = Math.floor(crop.x * iw);
  const sy = Math.floor(crop.y * ih);
  const sw = Math.max(1, Math.floor(crop.w * iw));
  const sh = Math.max(1, Math.floor(crop.h * ih));

  const canvas = document.createElement('canvas');
  canvas.width = outPx;
  canvas.height = outPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, outPx, outPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw the cropped source into a square output.
  const srcAspect = sw / sh;
  const dstAspect = 1;
  let drawW = outPx;
  let drawH = outPx;
  let dx = 0;
  let dy = 0;
  const fit = opts.fit === 'contain' ? 'contain' : 'cover';
  if (fit === 'cover') {
    // Cover: fill the square and crop overflow.
    if (srcAspect > dstAspect) {
      // Wider: fit height, crop sides.
      drawH = outPx;
      drawW = Math.round(outPx * srcAspect);
      dx = Math.round((outPx - drawW) / 2);
    } else if (srcAspect < dstAspect) {
      // Taller: fit width, crop top/bottom.
      drawW = outPx;
      drawH = Math.round(outPx / srcAspect);
      dy = Math.round((outPx - drawH) / 2);
    }
  } else {
    // Contain: show full crop with letterboxing.
    if (srcAspect > dstAspect) {
      // Wider: fit width, letterbox top/bottom.
      drawW = outPx;
      drawH = Math.round(outPx / srcAspect);
      dy = Math.round((outPx - drawH) / 2);
    } else if (srcAspect < dstAspect) {
      // Taller: fit height, letterbox sides.
      drawH = outPx;
      drawW = Math.round(outPx * srcAspect);
      dx = Math.round((outPx - drawW) / 2);
    }
  }

  try {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, drawW, drawH);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

