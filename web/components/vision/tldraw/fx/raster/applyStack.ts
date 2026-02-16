import type { AnyCanvas } from '@/components/vision/tldraw/fx/raster/canvasUtil';
import { canvasToBlob, createCanvas, get2d, blobToBitmap } from '@/components/vision/tldraw/fx/raster/canvasUtil';
import type { NxFxDistortion, NxFxEffect, NxFxStack } from '@/components/vision/tldraw/fx/nxfxTypes';
import { evalRampAtT, rampTForPixel } from '@/components/vision/tldraw/fx/raster/evalRamp';

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function parseRgba(color: string, opacityMul: number): { r: number; g: number; b: number; a: number } {
  // Very small parser; we mostly expect rgba(...) strings from UI.
  const s = String(color || '').trim();
  const mul = clamp01(opacityMul);
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((x) => Number(String(x).trim()));
    const r = clamp(parts[0] ?? 0, 0, 255);
    const g = clamp(parts[1] ?? 0, 0, 255);
    const b = clamp(parts[2] ?? 0, 0, 255);
    const a = clamp01((parts[3] ?? 1) * mul);
    return { r, g, b, a };
  }
  // Hex fallback
  const hex = s.replace('#', '');
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    const a0 = hex.length === 8 ? (parseInt(hex.slice(6, 8), 16) || 255) / 255 : 1;
    return { r, g, b, a: clamp01(a0 * mul) };
  }
  return { r: 0, g: 0, b: 0, a: clamp01(1 * mul) };
}

async function copyCanvas(src: AnyCanvas): Promise<AnyCanvas> {
  const w = (src as any).width || 1;
  const h = (src as any).height || 1;
  const out = createCanvas(w, h);
  const ctx = get2d(out);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src as any, 0, 0);
  return out;
}

function effectDropShadow(base: AnyCanvas, e: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const out = createCanvas(w, h);
  const ctx = get2d(out);

  const offsetX = Number(e.offsetX || 0);
  const offsetY = Number(e.offsetY || 0);
  const blur = Math.max(0, Number(e.blur || 0));
  const { r, g, b, a } = parseRgba(String(e.color || 'rgba(0,0,0,1)'), Number(e.opacity ?? 1));

  // Build tinted silhouette.
  const sil = createCanvas(w, h);
  const sctx = get2d(sil);
  sctx.clearRect(0, 0, w, h);
  sctx.drawImage(base as any, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = `rgba(${r},${g},${b},${a})`;
  sctx.fillRect(0, 0, w, h);

  ctx.clearRect(0, 0, w, h);
  ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
  ctx.drawImage(sil as any, offsetX, offsetY);
  ctx.filter = 'none';
  ctx.drawImage(base as any, 0, 0);
  return out;
}

function effectInnerShadow(base: AnyCanvas, e: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const out = createCanvas(w, h);
  const ctx = get2d(out);

  const offsetX = Number(e.offsetX || 0);
  const offsetY = Number(e.offsetY || 0);
  const blur = Math.max(0, Number(e.blur || 0));
  const { r, g, b, a } = parseRgba(String(e.color || 'rgba(0,0,0,1)'), Number(e.opacity ?? 1));

  // Mask = alpha of base.
  const mask = createCanvas(w, h);
  const mctx = get2d(mask);
  mctx.clearRect(0, 0, w, h);
  mctx.drawImage(base as any, 0, 0);
  mctx.globalCompositeOperation = 'source-in';
  mctx.fillStyle = 'rgba(0,0,0,1)';
  mctx.fillRect(0, 0, w, h);

  // Shadow = tinted silhouette blurred+offset, clipped to mask.
  const sh = createCanvas(w, h);
  const sctx = get2d(sh);
  sctx.clearRect(0, 0, w, h);
  sctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
  sctx.drawImage(mask as any, offsetX, offsetY);
  sctx.filter = 'none';
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = `rgba(${r},${g},${b},${a})`;
  sctx.fillRect(0, 0, w, h);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(mask as any, 0, 0);

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(base as any, 0, 0);
  ctx.drawImage(sh as any, 0, 0);
  return out;
}

function distortBlur(base: AnyCanvas, d: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const radius = Math.max(0, Number(d.radius || 0));
  if (radius <= 0.01) return base;

  const blurred = createCanvas(w, h);
  const bctx = get2d(blurred);
  bctx.clearRect(0, 0, w, h);
  bctx.filter = `blur(${radius}px)`;
  bctx.drawImage(base as any, 0, 0);
  bctx.filter = 'none';

  const ramp = d.ramp;
  if (!ramp) return blurred;

  const out = createCanvas(w, h);
  const octx = get2d(out);
  const a = get2d(base).getImageData(0, 0, w, h);
  const b = bctx.getImageData(0, 0, w, h);
  const o = octx.createImageData(w, h);
  const ad = a.data;
  const bd = b.data;
  const od = o.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = rampTForPixel(Number(ramp.angleDeg || 0), x, y, w, h);
      const m = clamp01(evalRampAtT(ramp, t));
      const inv = 1 - m;
      od[i + 0] = Math.round(ad[i + 0] * inv + bd[i + 0] * m);
      od[i + 1] = Math.round(ad[i + 1] * inv + bd[i + 1] * m);
      od[i + 2] = Math.round(ad[i + 2] * inv + bd[i + 2] * m);
      od[i + 3] = Math.round(ad[i + 3] * inv + bd[i + 3] * m);
    }
  }
  octx.putImageData(o, 0, 0);
  return out;
}

function distortMotionBlur(base: AnyCanvas, d: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const distance = Math.max(0, Number(d.distance || 0));
  const samples = Math.max(2, Math.min(64, Math.round(Number(d.samples || 8))));
  if (distance <= 0.01) return base;

  const ang = ((Number(d.angleDeg || 0) * Math.PI) / 180) || 0;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);

  const out = createCanvas(w, h);
  const ctx = get2d(out);
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1 / samples;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const ox = (t - 0.5) * distance * dx;
    const oy = (t - 0.5) * distance * dy;
    ctx.drawImage(base as any, ox, oy);
  }
  ctx.globalAlpha = 1;
  return out;
}

function distortBloom(base: AnyCanvas, d: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const threshold = clamp01(Number(d.threshold ?? 0.75));
  const radius = Math.max(0, Number(d.radius || 0));
  const intensity = clamp(Number(d.intensity ?? 1.2), 0, 5);
  if (radius <= 0.01 || intensity <= 0.001) return base;

  const src = get2d(base).getImageData(0, 0, w, h);
  const mask = createCanvas(w, h);
  const mctx = get2d(mask);
  const m = mctx.createImageData(w, h);
  const sd = src.data;
  const md = m.data;
  for (let i = 0; i < sd.length; i += 4) {
    const a = sd[i + 3] / 255;
    const r = sd[i + 0] / 255;
    const g = sd[i + 1] / 255;
    const b = sd[i + 2] / 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
    const k = lum >= threshold ? 1 : 0;
    md[i + 0] = Math.round(sd[i + 0] * k);
    md[i + 1] = Math.round(sd[i + 1] * k);
    md[i + 2] = Math.round(sd[i + 2] * k);
    md[i + 3] = Math.round(sd[i + 3] * k);
  }
  mctx.putImageData(m, 0, 0);

  const blurred = createCanvas(w, h);
  const bctx = get2d(blurred);
  bctx.clearRect(0, 0, w, h);
  bctx.filter = `blur(${radius}px)`;
  bctx.drawImage(mask as any, 0, 0);
  bctx.filter = 'none';

  const out = createCanvas(w, h);
  const octx = get2d(out);
  octx.clearRect(0, 0, w, h);
  octx.drawImage(base as any, 0, 0);
  octx.globalCompositeOperation = 'lighter';
  octx.globalAlpha = intensity;
  octx.drawImage(blurred as any, 0, 0);
  octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';
  return out;
}

function xorshift32(seed: number): () => number {
  let x = (seed | 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // 0..1
    return ((x >>> 0) / 4294967295) || 0;
  };
}

function distortGlitch(base: AnyCanvas, d: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const strength = clamp01(Number(d.strength ?? 0.35));
  const rgbOffset = Math.max(0, Number(d.rgbOffset || 0));
  const scanlines = clamp01(Number(d.scanlines ?? 0.25));
  const rand = xorshift32(Math.floor(Number(d.seed || 1)));

  const src = get2d(base).getImageData(0, 0, w, h);
  const out = createCanvas(w, h);
  const octx = get2d(out);
  const dst = octx.createImageData(w, h);

  const maxShift = Math.round(strength * 24);
  for (let y = 0; y < h; y++) {
    const lineJitter = (rand() * 2 - 1) * maxShift * (rand() < 0.35 ? 1 : 0.2);
    const sx = Math.round(lineJitter);
    const sl = scanlines > 0 && rand() < scanlines ? 0.85 + rand() * 0.15 : 1;
    for (let x = 0; x < w; x++) {
      const srcX = clamp(x + sx, 0, w - 1);
      const rX = clamp(srcX + rgbOffset, 0, w - 1);
      const bX = clamp(srcX - rgbOffset, 0, w - 1);
      const i = (y * w + x) * 4;
      const ir = (y * w + rX) * 4;
      const ig = (y * w + srcX) * 4;
      const ib = (y * w + bX) * 4;
      dst.data[i + 0] = Math.round(src.data[ir + 0] * sl);
      dst.data[i + 1] = Math.round(src.data[ig + 1] * sl);
      dst.data[i + 2] = Math.round(src.data[ib + 2] * sl);
      dst.data[i + 3] = src.data[ig + 3];
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

function distortMosh(base: AnyCanvas, d: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const strength = clamp01(Number(d.strength ?? 0.35));
  const blockSize = Math.max(1, Math.round(Number(d.blockSize || 16)));
  const rand = xorshift32(Math.floor(Number(d.seed || 1)));
  const ramp = d.ramp;

  const src = get2d(base).getImageData(0, 0, w, h);
  const out = createCanvas(w, h);
  const octx = get2d(out);
  const dst = octx.createImageData(w, h);

  const maxDisp = Math.round(strength * Math.max(4, blockSize));
  for (let by = 0; by < h; by += blockSize) {
    for (let bx = 0; bx < w; bx += blockSize) {
      const jx = Math.round((rand() * 2 - 1) * maxDisp);
      const jy = Math.round((rand() * 2 - 1) * maxDisp);
      for (let y = by; y < Math.min(h, by + blockSize); y++) {
        for (let x = bx; x < Math.min(w, bx + blockSize); x++) {
          const t = ramp ? rampTForPixel(Number(ramp.angleDeg || 0), x, y, w, h) : 0;
          const m = ramp ? clamp01(evalRampAtT(ramp, t)) : 1;
          const dispX = Math.round(jx * m);
          const dispY = Math.round(jy * m);
          const sx = clamp(x + dispX, 0, w - 1);
          const sy = clamp(y + dispY, 0, h - 1);
          const si = (sy * w + sx) * 4;
          const di = (y * w + x) * 4;
          dst.data[di + 0] = src.data[si + 0];
          dst.data[di + 1] = src.data[si + 1];
          dst.data[di + 2] = src.data[si + 2];
          dst.data[di + 3] = src.data[si + 3];
        }
      }
    }
  }

  // Light dither/noise scatter around edges.
  for (let i = 0; i < dst.data.length; i += 4) {
    if (dst.data[i + 3] === 0) continue;
    if (rand() < strength * 0.08) {
      const n = (rand() * 2 - 1) * 12 * strength;
      dst.data[i + 0] = clamp(dst.data[i + 0] + n, 0, 255);
      dst.data[i + 1] = clamp(dst.data[i + 1] + n, 0, 255);
      dst.data[i + 2] = clamp(dst.data[i + 2] + n, 0, 255);
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

function distortGrain(base: AnyCanvas, d: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const strength = clamp01(Number(d.strength ?? 0.22));
  const size = Math.max(0.5, Number(d.size ?? 1.2));
  const rand = xorshift32(Math.floor(Number(d.seed || 1)));
  if (strength <= 0.001) return base;

  const src = get2d(base).getImageData(0, 0, w, h);
  const out = createCanvas(w, h);
  const octx = get2d(out);
  const dst = octx.createImageData(w, h);
  dst.data.set(src.data);

  const step = Math.max(1, Math.round(size));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = (rand() * 2 - 1) * 255 * strength;
      for (let yy = y; yy < Math.min(h, y + step); yy++) {
        for (let xx = x; xx < Math.min(w, x + step); xx++) {
          const i = (yy * w + xx) * 4;
          if (dst.data[i + 3] === 0) continue;
          dst.data[i + 0] = clamp(dst.data[i + 0] + n, 0, 255);
          dst.data[i + 1] = clamp(dst.data[i + 1] + n, 0, 255);
          dst.data[i + 2] = clamp(dst.data[i + 2] + n, 0, 255);
        }
      }
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

function distortDoodle(base: AnyCanvas, d: any): AnyCanvas {
  const w = (base as any).width || 1;
  const h = (base as any).height || 1;
  const strength = clamp01(Number(d.strength ?? 0.45));
  const scale = Math.max(0.5, Number(d.scale ?? 6));
  const rand = xorshift32(Math.floor(Number(d.seed || 1)));
  if (strength <= 0.001) return base;

  const src = get2d(base).getImageData(0, 0, w, h);
  const out = createCanvas(w, h);
  const octx = get2d(out);
  const dst = octx.createImageData(w, h);

  const sd = src.data;
  const dd = dst.data;

  const maxDisp = strength * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = sd[i + 3];
      // Edge-ish pixels: alpha is neither 0 nor 255 (anti-aliased boundary)
      const edge = a > 0 && a < 255;
      if (!edge) {
        dd[i + 0] = sd[i + 0];
        dd[i + 1] = sd[i + 1];
        dd[i + 2] = sd[i + 2];
        dd[i + 3] = sd[i + 3];
        continue;
      }
      const jx = Math.round((rand() * 2 - 1) * maxDisp);
      const jy = Math.round((rand() * 2 - 1) * maxDisp);
      const sx = clamp(x + jx, 0, w - 1);
      const sy = clamp(y + jy, 0, h - 1);
      const si = (sy * w + sx) * 4;
      dd[i + 0] = sd[si + 0];
      dd[i + 1] = sd[si + 1];
      dd[i + 2] = sd[si + 2];
      dd[i + 3] = sd[si + 3];
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

function applyEffect(base: AnyCanvas, e: NxFxEffect): AnyCanvas {
  if (!e.enabled) return base;
  if (e.kind === 'dropShadow') return effectDropShadow(base, e);
  if (e.kind === 'innerShadow') return effectInnerShadow(base, e);
  return base;
}

function applyDistortion(base: AnyCanvas, d: NxFxDistortion): AnyCanvas {
  if (!d.enabled) return base;
  if (d.kind === 'blur') return distortBlur(base, d);
  if (d.kind === 'motionBlur') return distortMotionBlur(base, d);
  if (d.kind === 'bloom') return distortBloom(base, d);
  if (d.kind === 'glitch') return distortGlitch(base, d);
  if (d.kind === 'mosh') return distortMosh(base, d);
  if (d.kind === 'grain') return distortGrain(base, d);
  if (d.kind === 'doodle') return distortDoodle(base, d);
  return base;
}

export async function applyNxFxStack(base: AnyCanvas, fx: NxFxStack | null): Promise<AnyCanvas> {
  if (!fx) return base;
  let cur: AnyCanvas = await copyCanvas(base);
  for (const e of fx.effects || []) cur = applyEffect(cur, e);
  for (const d of fx.distortions || []) cur = applyDistortion(cur, d);
  return cur;
}

export function scaleNxFxForRaster(fx: NxFxStack | null, pixelRatio: number): NxFxStack | null {
  if (!fx) return null;
  const pr = Math.max(0.25, Math.min(4, Number(pixelRatio || 1)));
  // Scale pixel-based parameters so effects/distortions look consistent at higher export DPR.
  const effects = (fx.effects || []).map((e: any) => {
    if (e?.kind === 'dropShadow' || e?.kind === 'innerShadow') {
      return { ...e, offsetX: Number(e.offsetX || 0) * pr, offsetY: Number(e.offsetY || 0) * pr, blur: Number(e.blur || 0) * pr };
    }
    return e;
  });
  const distortions = (fx.distortions || []).map((d: any) => {
    if (d?.kind === 'blur') return { ...d, radius: Number(d.radius || 0) * pr };
    if (d?.kind === 'motionBlur') return { ...d, distance: Number(d.distance || 0) * pr, samples: d.samples };
    if (d?.kind === 'bloom') return { ...d, radius: Number(d.radius || 0) * pr };
    if (d?.kind === 'glitch') return { ...d, rgbOffset: Number(d.rgbOffset || 0) * pr };
    if (d?.kind === 'mosh') return { ...d, blockSize: Math.max(1, Number(d.blockSize || 1) * pr) };
    if (d?.kind === 'grain') return { ...d, size: Math.max(0.5, Number(d.size || 0.5) * pr) };
    if (d?.kind === 'doodle') return { ...d, scale: Math.max(0.5, Number(d.scale || 0.5) * pr) };
    return d;
  });
  return { ...fx, effects, distortions };
}

export async function canvasToPngObjectUrl(canvas: AnyCanvas): Promise<{ url: string; blob: Blob }> {
  const blob = await canvasToBlob(canvas, 'image/png');
  const url = URL.createObjectURL(blob);
  return { url, blob };
}

export async function downscaleIfNeeded(canvas: AnyCanvas, maxDim: number): Promise<AnyCanvas> {
  const w = (canvas as any).width || 1;
  const h = (canvas as any).height || 1;
  const m = Math.max(w, h);
  const cap = Math.max(16, Math.round(Number(maxDim || 0) || 0));
  if (!cap || m <= cap) return canvas;
  const s = cap / m;
  const nw = Math.max(1, Math.round(w * s));
  const nh = Math.max(1, Math.round(h * s));
  const out = createCanvas(nw, nh);
  const ctx = get2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas as any, 0, 0, nw, nh);
  return out;
}

export async function canvasCloneAsBitmap(canvas: AnyCanvas): Promise<ImageBitmap> {
  const blob = await canvasToBlob(canvas, 'image/png');
  return await blobToBitmap(blob);
}

