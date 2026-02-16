export type Rgb = { r: number; g: number; b: number; a: number };

export function parseColor(input: unknown): Rgb | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // #rgb / #rrggbb
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if ([r, g, b].some((x) => Number.isNaN(x))) return null;
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some((x) => Number.isNaN(x))) return null;
      return { r, g, b, a: 1 };
    }
    return null;
  }

  // rgb(...) / rgba(...)
  const m = s.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+)\s*)?\)$/);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (![r, g, b, a].every((x) => Number.isFinite(x))) return null;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(a) };
  }

  return null;
}

export function quantizeColor(c: Rgb, step = 16): string {
  const q = (x: number) => Math.round(x / step) * step;
  const r = clamp255(q(c.r));
  const g = clamp255(q(c.g));
  const b = clamp255(q(c.b));
  return `rgb(${r},${g},${b})`;
}

export function rgbToHue(c: Rgb): number {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d) % 6;
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    case b:
      h = (r - g) / d + 4;
      break;
  }
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function clamp255(x: number) {
  return Math.max(0, Math.min(255, Math.round(x)));
}

