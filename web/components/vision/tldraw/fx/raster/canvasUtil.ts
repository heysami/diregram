export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function createCanvas(width: number, height: number): AnyCanvas {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(w, h);
    }
  } catch {
    // ignore
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function get2d(canvas: AnyCanvas): CanvasRenderingContext2D {
  const ctx = (canvas as any).getContext?.('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2d context');
  return ctx as CanvasRenderingContext2D;
}

export function clear(canvas: AnyCanvas) {
  const ctx = get2d(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, (canvas as any).width || 1, (canvas as any).height || 1);
}

export async function canvasToBlob(canvas: AnyCanvas, type: string = 'image/png', quality?: number): Promise<Blob> {
  if (typeof (canvas as any).convertToBlob === 'function') {
    return await (canvas as any).convertToBlob({ type, quality });
  }
  const c = canvas as HTMLCanvasElement;
  return await new Promise<Blob>((resolve, reject) => {
    try {
      c.toBlob(
        (b) => {
          if (!b) reject(new Error('toBlob failed'));
          else resolve(b);
        },
        type,
        quality,
      );
    } catch (e) {
      reject(e);
    }
  });
}

export async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  // createImageBitmap is supported in modern browsers; fall back to <img> if needed later.
  return await createImageBitmap(blob);
}

