export type VisionRatioScope = 'ui' | 'icons' | 'images' | 'all';

export type VisionSemanticPaletteV1 = {
  success: string;
  warning: string;
  error: string;
  info: string;
};

export type VisionPalettePairingsV1 = {
  accentPrimitives?: string[];
  neutralPrimitives?: string[];
  semanticPrimitives?: Partial<Record<keyof VisionSemanticPaletteV1, string>>;
};

export type VisionPaletteV1 = {
  primary: string;
  accent: string[];
  neutral: string[];
  semantic: VisionSemanticPaletteV1;
  pairings?: VisionPalettePairingsV1;
};

export type VisionColorRatioV1 = {
  scope: VisionRatioScope;
  neutralPct: number;
  primaryPct: number;
  accentPct: number;
  semanticPct: number;
};

export type VisionColorScenarioV1 = {
  id: string;
  name: string;
  palette: VisionPaletteV1;
  ratios: VisionColorRatioV1[];
};

export type VisionImageProfileV1 = {
  id: string;
  name: string;
  style: string;
  lighting: string;
  lineWeight: string;
  notes: string;
  placeholder: string;
};

export type VisionTypographyControlsV1 = {
  baseSizePx: number;
  baseWeight: number;
  sizeGrowth: number;
  weightGrowth: number;
};

export type VisionSpacingControlsV1 = {
  pattern: number;
  density: number;
  aroundVsInside: number;
};

export type VisionDesignSystemControlsV1 = {
  typography: VisionTypographyControlsV1;
  spacing: VisionSpacingControlsV1;
  flatness: number;
  zoning: number;
  softness: number;
  saturation: number;
  colorVariance: number;
  colorBleed: number;
  colorBleedTone: 'primary' | 'accent' | 'warm' | 'cool' | 'custom';
  colorBleedCustom: string;
  wireframeFeeling: number;
  visualRange: number;
  skeuomorphism: number;
  negativeZoneStyle: number;
  boldness: number;
};

export type VisionTypographyTokenV1 = {
  token: 'caption' | 'label' | 'body' | 'h6' | 'h5' | 'h4' | 'h3' | 'h2' | 'h1';
  sizePx: number;
  weight: number;
  lineHeight: number;
};

export type VisionDesignSystemDerivedV1 = {
  typography: {
    fontFamily: string;
    scale: number;
    tokens: VisionTypographyTokenV1[];
  };
  spacing: {
    scale: number[];
    microPx: number;
    compactPx: number;
    stackPx: number;
    aroundPx: number;
    insidePx: number;
    gapPx: number;
  };
  shape: {
    radiusXs: number;
    radiusSm: number;
    radiusMd: number;
    radiusLg: number;
    radiusXl: number;
    cardRadius: number;
    buttonRadius: number;
    inputRadius: number;
    pillRadius: number;
  };
  composition: {
    cardUsage: number;
    separatorUsage: number;
    zoneLevels: number;
    zoneContrast: number;
    saturationPolicy: 'semanticOnly' | 'focused' | 'broad';
    varianceLevel: 'low' | 'medium' | 'high';
    boldZoneCoverage: number;
    boldZonePolicy: 'neutral' | 'brandTint' | 'brandSolid' | 'mediaBacked';
  };
  color: {
    primary: string;
    accents: string[];
    neutrals: string[];
    semantic: VisionSemanticPaletteV1;
    textOnPrimary: string;
    canvasBg: string;
    surfaceBg: string;
    panelBg: string;
    separator: string;
    tintAmount: number;
  };
  effects: {
    wireframeMix: number;
    visualRangeMix: number;
    wireframeLineOpacity: number;
    wireframeFillOpacity: number;
    borderStyle: 'solid' | 'dashed';
    borderWidth: number;
    gradientStrength: number;
    materialBudget: number;
    bevelStrength: number;
    glossStrength: number;
    innerShadowStrength: number;
    shadowStrength: number;
    highlightStrength: number;
  };
  negativeZone: {
    mode: 'flat' | 'subtle-gradient' | 'texture' | 'image';
    background: string;
    textureOpacity: number;
  };
  preview: {
    topNavBg: string;
    topNavText: string;
    leftNavBg: string;
    leftNavText: string;
    contentBg: string;
    cardBg: string;
    cardBorder: string;
    buttonBg: string;
    buttonText: string;
    focusColor: string;
    shadow: string;
  };
};

export type VisionDesignSystemV1 = {
  version: 1;
  activeScenarioId: string;
  scenarios: VisionColorScenarioV1[];
  foundations: {
    fontFamily: string;
    imageProfiles: VisionImageProfileV1[];
  };
  controls: VisionDesignSystemControlsV1;
  derived?: VisionDesignSystemDerivedV1;
  updatedAt: string;
};

export type VisionPrimitiveColorOption = {
  id: string;
  name: string;
  family: string;
  shade: number;
  hex: string;
  kind: 'neutral' | 'accent';
};

export const VISION_TAILWIND_PRIMITIVE_COLORS: VisionPrimitiveColorOption[] = [
  { id: 'slate-50', name: 'Slate 50', family: 'slate', shade: 50, hex: '#f8fafc', kind: 'neutral' },
  { id: 'slate-100', name: 'Slate 100', family: 'slate', shade: 100, hex: '#f1f5f9', kind: 'neutral' },
  { id: 'slate-200', name: 'Slate 200', family: 'slate', shade: 200, hex: '#e2e8f0', kind: 'neutral' },
  { id: 'slate-400', name: 'Slate 400', family: 'slate', shade: 400, hex: '#94a3b8', kind: 'neutral' },
  { id: 'slate-600', name: 'Slate 600', family: 'slate', shade: 600, hex: '#475569', kind: 'neutral' },
  { id: 'slate-900', name: 'Slate 900', family: 'slate', shade: 900, hex: '#0f172a', kind: 'neutral' },
  { id: 'zinc-50', name: 'Zinc 50', family: 'zinc', shade: 50, hex: '#fafafa', kind: 'neutral' },
  { id: 'zinc-100', name: 'Zinc 100', family: 'zinc', shade: 100, hex: '#f4f4f5', kind: 'neutral' },
  { id: 'zinc-300', name: 'Zinc 300', family: 'zinc', shade: 300, hex: '#d4d4d8', kind: 'neutral' },
  { id: 'zinc-500', name: 'Zinc 500', family: 'zinc', shade: 500, hex: '#71717a', kind: 'neutral' },
  { id: 'zinc-700', name: 'Zinc 700', family: 'zinc', shade: 700, hex: '#3f3f46', kind: 'neutral' },
  { id: 'zinc-900', name: 'Zinc 900', family: 'zinc', shade: 900, hex: '#18181b', kind: 'neutral' },
  { id: 'blue-500', name: 'Blue 500', family: 'blue', shade: 500, hex: '#3b82f6', kind: 'accent' },
  { id: 'blue-600', name: 'Blue 600', family: 'blue', shade: 600, hex: '#2563eb', kind: 'accent' },
  { id: 'cyan-500', name: 'Cyan 500', family: 'cyan', shade: 500, hex: '#06b6d4', kind: 'accent' },
  { id: 'teal-500', name: 'Teal 500', family: 'teal', shade: 500, hex: '#14b8a6', kind: 'accent' },
  { id: 'emerald-500', name: 'Emerald 500', family: 'emerald', shade: 500, hex: '#10b981', kind: 'accent' },
  { id: 'green-600', name: 'Green 600', family: 'green', shade: 600, hex: '#16a34a', kind: 'accent' },
  { id: 'lime-500', name: 'Lime 500', family: 'lime', shade: 500, hex: '#84cc16', kind: 'accent' },
  { id: 'yellow-500', name: 'Yellow 500', family: 'yellow', shade: 500, hex: '#eab308', kind: 'accent' },
  { id: 'amber-600', name: 'Amber 600', family: 'amber', shade: 600, hex: '#d97706', kind: 'accent' },
  { id: 'orange-500', name: 'Orange 500', family: 'orange', shade: 500, hex: '#f97316', kind: 'accent' },
  { id: 'red-600', name: 'Red 600', family: 'red', shade: 600, hex: '#dc2626', kind: 'accent' },
  { id: 'rose-500', name: 'Rose 500', family: 'rose', shade: 500, hex: '#f43f5e', kind: 'accent' },
  { id: 'pink-500', name: 'Pink 500', family: 'pink', shade: 500, hex: '#ec4899', kind: 'accent' },
  { id: 'fuchsia-500', name: 'Fuchsia 500', family: 'fuchsia', shade: 500, hex: '#d946ef', kind: 'accent' },
  { id: 'purple-500', name: 'Purple 500', family: 'purple', shade: 500, hex: '#a855f7', kind: 'accent' },
  { id: 'violet-600', name: 'Violet 600', family: 'violet', shade: 600, hex: '#7c3aed', kind: 'accent' },
  { id: 'indigo-500', name: 'Indigo 500', family: 'indigo', shade: 500, hex: '#6366f1', kind: 'accent' },
];

export type VisionGoogleFontOption = {
  id: string;
  label: string;
  family: string;
};

export const VISION_GOOGLE_FONT_OPTIONS: VisionGoogleFontOption[] = [
  { id: 'inter', label: 'Inter', family: 'Inter, system-ui, sans-serif' },
  { id: 'lexend', label: 'Lexend', family: 'Lexend, system-ui, sans-serif' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope, system-ui, sans-serif' },
  { id: 'poppins', label: 'Poppins', family: 'Poppins, system-ui, sans-serif' },
  { id: 'nunito-sans', label: 'Nunito Sans', family: 'Nunito Sans, system-ui, sans-serif' },
  { id: 'source-sans-3', label: 'Source Sans 3', family: 'Source Sans 3, system-ui, sans-serif' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', family: 'IBM Plex Sans, system-ui, sans-serif' },
  { id: 'roboto', label: 'Roboto', family: 'Roboto, system-ui, sans-serif' },
  { id: 'work-sans', label: 'Work Sans', family: 'Work Sans, system-ui, sans-serif' },
  { id: 'space-grotesk', label: 'Space Grotesk', family: 'Space Grotesk, system-ui, sans-serif' },
  { id: 'dm-sans', label: 'DM Sans', family: 'DM Sans, system-ui, sans-serif' },
  { id: 'plus-jakarta-sans', label: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans, system-ui, sans-serif' },
];

const DEFAULT_SEMANTIC: VisionSemanticPaletteV1 = {
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#2563eb',
};

const DEFAULT_SCENARIO: VisionColorScenarioV1 = {
  id: 'base',
  name: 'Base',
  palette: {
    primary: '#2563eb',
    accent: ['#7c3aed', '#ea580c', '#0d9488'],
    neutral: ['#f8fafc', '#e2e8f0', '#64748b', '#0f172a'],
    semantic: { ...DEFAULT_SEMANTIC },
    pairings: {
      accentPrimitives: ['violet-600', 'orange-500', 'teal-500'],
      neutralPrimitives: ['slate-50', 'slate-200', 'slate-600', 'slate-900'],
      semanticPrimitives: {
        success: 'green-600',
        warning: 'amber-600',
        error: 'red-600',
        info: 'blue-600',
      },
    },
  },
  ratios: [
    {
      scope: 'ui',
      neutralPct: 74,
      primaryPct: 16,
      accentPct: 6,
      semanticPct: 4,
    },
  ],
};

const DEFAULT_IMAGE_PROFILE: VisionImageProfileV1 = {
  id: 'default',
  name: 'Default illustration',
  style: 'Clean vector illustration',
  lighting: 'Soft front lighting',
  lineWeight: 'Medium stroke (2-3px)',
  notes: 'Use simplified geometric forms and restrained details.',
  placeholder: 'https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1200&q=80',
};

const DEFAULT_CONTROLS: VisionDesignSystemControlsV1 = {
  typography: {
    baseSizePx: 16,
    baseWeight: 400,
    sizeGrowth: 44,
    weightGrowth: 30,
  },
  spacing: {
    pattern: 32,
    density: 48,
    aroundVsInside: 56,
  },
  flatness: 44,
  zoning: 46,
  softness: 36,
  saturation: 30,
  colorVariance: 34,
  colorBleed: 20,
  colorBleedTone: 'primary',
  colorBleedCustom: '#2563eb',
  wireframeFeeling: 16,
  visualRange: 24,
  skeuomorphism: 18,
  negativeZoneStyle: 16,
  boldness: 22,
};

function nowIso() {
  return new Date().toISOString();
}

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function clamp01(v: number) {
  return clamp(v, 0, 1);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t);
}

function norm100(v: number) {
  return clamp(v, 0, 100) / 100;
}

function toEvenPx(v: number) {
  return Math.max(0, Math.round(v / 2) * 2);
}

function normalizeHex(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return fallback;
}

function normalizeHexList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback.slice();
  const out: string[] = [];
  for (const item of value) {
    const c = normalizeHex(item, '');
    if (!c) continue;
    if (out.includes(c)) continue;
    out.push(c);
  }
  return out.length ? out : fallback.slice();
}

function toRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHex(hex, '#000000');
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const rr = clamp(Math.round(r), 0, 255)
    .toString(16)
    .padStart(2, '0');
  const gg = clamp(Math.round(g), 0, 255)
    .toString(16)
    .padStart(2, '0');
  const bb = clamp(Math.round(b), 0, 255)
    .toString(16)
    .padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = toRgb(hexA);
  const b = toRgb(hexB);
  const n = clamp01(t);
  return rgbToHex(lerp(a.r, b.r, n), lerp(a.g, b.g, n), lerp(a.b, b.b, n));
}

function channelToLinear(c: number): number {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const rl = channelToLinear(r);
  const gl = channelToLinear(g);
  const bl = channelToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

function pickTextColor(bg: string): string {
  const black = '#0f172a';
  const white = '#ffffff';
  const cBlack = contrastRatio(bg, black);
  const cWhite = contrastRatio(bg, white);
  return cBlack >= cWhite ? black : white;
}

function ensureContrastText(bg: string, preferred?: string, minContrast = 4.5): string {
  const safeBg = normalizeHex(bg, '#ffffff');
  const preferredColor = normalizeHex(preferred, pickTextColor(safeBg));
  if (contrastRatio(safeBg, preferredColor) >= minContrast) return preferredColor;
  return pickTextColor(safeBg);
}

function clampPercent(v: unknown): number {
  return Math.round(clamp(Number(v), 0, 100));
}

function coerceRatioScope(value: unknown): VisionRatioScope {
  const v = String(value || '').trim();
  if (v === 'ui' || v === 'icons' || v === 'images' || v === 'all') return v;
  return 'ui';
}

function normalizePalettePairings(value: unknown): VisionPalettePairingsV1 | undefined {
  const src = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!src) return undefined;

  const accentPrimitives = Array.isArray(src.accentPrimitives)
    ? src.accentPrimitives.map((it) => String(it || '').trim()).filter(Boolean)
    : [];
  const neutralPrimitives = Array.isArray(src.neutralPrimitives)
    ? src.neutralPrimitives.map((it) => String(it || '').trim()).filter(Boolean)
    : [];

  const semanticSrc = src.semanticPrimitives && typeof src.semanticPrimitives === 'object' ? (src.semanticPrimitives as Record<string, unknown>) : {};
  const semanticPrimitives: VisionPalettePairingsV1['semanticPrimitives'] = {};
  for (const key of ['success', 'warning', 'error', 'info'] as const) {
    const v = String(semanticSrc[key] || '').trim();
    if (v) semanticPrimitives[key] = v;
  }

  if (!accentPrimitives.length && !neutralPrimitives.length && Object.keys(semanticPrimitives).length === 0) return undefined;
  return { accentPrimitives, neutralPrimitives, semanticPrimitives };
}

function normalizeScenario(input: unknown, index: number): VisionColorScenarioV1 {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const paletteSrc = src.palette && typeof src.palette === 'object' ? (src.palette as Record<string, unknown>) : {};
  const semanticSrc =
    paletteSrc.semantic && typeof paletteSrc.semantic === 'object' ? (paletteSrc.semantic as Record<string, unknown>) : ({} as Record<string, unknown>);
  const pairings = normalizePalettePairings(paletteSrc.pairings) || DEFAULT_SCENARIO.palette.pairings;

  const ratiosRaw = Array.isArray(src.ratios) ? src.ratios : DEFAULT_SCENARIO.ratios;
  const ratios = ratiosRaw
    .map((it) => {
      const r = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
      return {
        scope: coerceRatioScope(r.scope),
        neutralPct: clampPercent(r.neutralPct),
        primaryPct: clampPercent(r.primaryPct),
        accentPct: clampPercent(r.accentPct),
        semanticPct: clampPercent(r.semanticPct),
      } satisfies VisionColorRatioV1;
    })
    .filter(Boolean);

  return {
    id: String(src.id || '').trim() || (index === 0 ? 'base' : `scenario-${index + 1}`),
    name: String(src.name || '').trim() || (index === 0 ? 'Base' : `Scenario ${index + 1}`),
    palette: {
      primary: normalizeHex(paletteSrc.primary, DEFAULT_SCENARIO.palette.primary),
      accent: normalizeHexList(paletteSrc.accent, DEFAULT_SCENARIO.palette.accent),
      neutral: normalizeHexList(paletteSrc.neutral, DEFAULT_SCENARIO.palette.neutral),
      semantic: {
        success: normalizeHex(semanticSrc.success, DEFAULT_SEMANTIC.success),
        warning: normalizeHex(semanticSrc.warning, DEFAULT_SEMANTIC.warning),
        error: normalizeHex(semanticSrc.error, DEFAULT_SEMANTIC.error),
        info: normalizeHex(semanticSrc.info, DEFAULT_SEMANTIC.info),
      },
      ...(pairings ? { pairings } : null),
    },
    ratios: ratios.length ? ratios : DEFAULT_SCENARIO.ratios,
  };
}

function normalizeImageProfile(input: unknown, index: number): VisionImageProfileV1 {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    id: String(src.id || '').trim() || `image-profile-${index + 1}`,
    name: String(src.name || '').trim() || `Image profile ${index + 1}`,
    style: String(src.style || '').trim() || DEFAULT_IMAGE_PROFILE.style,
    lighting: String(src.lighting || '').trim() || DEFAULT_IMAGE_PROFILE.lighting,
    lineWeight: String(src.lineWeight || '').trim() || DEFAULT_IMAGE_PROFILE.lineWeight,
    notes: String(src.notes || '').trim() || '',
    placeholder: String(src.placeholder || '').trim() || DEFAULT_IMAGE_PROFILE.placeholder,
  };
}

function normalizeControls(input: unknown): VisionDesignSystemControlsV1 {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const typSrc = src.typography && typeof src.typography === 'object' ? (src.typography as Record<string, unknown>) : {};
  const spacingSrc = src.spacing && typeof src.spacing === 'object' ? (src.spacing as Record<string, unknown>) : {};

  return {
    typography: {
      baseSizePx: clamp(Math.round(Number(typSrc.baseSizePx)), 12, 24) || DEFAULT_CONTROLS.typography.baseSizePx,
      baseWeight: clamp(Math.round(Number(typSrc.baseWeight)), 300, 700) || DEFAULT_CONTROLS.typography.baseWeight,
      sizeGrowth: clamp(Math.round(Number(typSrc.sizeGrowth)), 0, 100),
      weightGrowth: clamp(Math.round(Number(typSrc.weightGrowth)), 0, 100),
    },
    spacing: {
      pattern: clamp(Math.round(Number(spacingSrc.pattern)), 0, 100),
      density: clamp(Math.round(Number(spacingSrc.density)), 0, 100),
      aroundVsInside: clamp(Math.round(Number(spacingSrc.aroundVsInside)), 0, 100),
    },
    flatness: clamp(Math.round(Number(src.flatness)), 0, 100),
    zoning: clamp(Math.round(Number(src.zoning)), 0, 100),
    softness: clamp(Math.round(Number(src.softness)), 0, 100),
    saturation: clamp(Math.round(Number(src.saturation)), 0, 100),
    colorVariance: clamp(Math.round(Number(src.colorVariance)), 0, 100),
    colorBleed: clamp(Math.round(Number(src.colorBleed)), 0, 100),
    colorBleedTone:
      String(src.colorBleedTone || '').trim() === 'accent' ||
      String(src.colorBleedTone || '').trim() === 'warm' ||
      String(src.colorBleedTone || '').trim() === 'cool' ||
      String(src.colorBleedTone || '').trim() === 'custom'
        ? (String(src.colorBleedTone || '').trim() as VisionDesignSystemControlsV1['colorBleedTone'])
        : 'primary',
    colorBleedCustom: normalizeHex(src.colorBleedCustom, DEFAULT_CONTROLS.colorBleedCustom),
    wireframeFeeling: clamp(Math.round(Number(src.wireframeFeeling)), 0, 100),
    visualRange: clamp(Math.round(Number(src.visualRange)), 0, 100),
    skeuomorphism: clamp(Math.round(Number(src.skeuomorphism)), 0, 100),
    negativeZoneStyle: clamp(Math.round(Number(src.negativeZoneStyle)), 0, 100),
    boldness: clamp(Math.round(Number(src.boldness)), 0, 100),
  };
}

function withControlDefaults(next: VisionDesignSystemControlsV1): VisionDesignSystemControlsV1 {
  return {
    typography: {
      baseSizePx: next.typography.baseSizePx || DEFAULT_CONTROLS.typography.baseSizePx,
      baseWeight: next.typography.baseWeight || DEFAULT_CONTROLS.typography.baseWeight,
      sizeGrowth: Number.isFinite(next.typography.sizeGrowth) ? next.typography.sizeGrowth : DEFAULT_CONTROLS.typography.sizeGrowth,
      weightGrowth: Number.isFinite(next.typography.weightGrowth) ? next.typography.weightGrowth : DEFAULT_CONTROLS.typography.weightGrowth,
    },
    spacing: {
      pattern: Number.isFinite(next.spacing.pattern) ? next.spacing.pattern : DEFAULT_CONTROLS.spacing.pattern,
      density: Number.isFinite(next.spacing.density) ? next.spacing.density : DEFAULT_CONTROLS.spacing.density,
      aroundVsInside: Number.isFinite(next.spacing.aroundVsInside) ? next.spacing.aroundVsInside : DEFAULT_CONTROLS.spacing.aroundVsInside,
    },
    flatness: Number.isFinite(next.flatness) ? next.flatness : DEFAULT_CONTROLS.flatness,
    zoning: Number.isFinite(next.zoning) ? next.zoning : DEFAULT_CONTROLS.zoning,
    softness: Number.isFinite(next.softness) ? next.softness : DEFAULT_CONTROLS.softness,
    saturation: Number.isFinite(next.saturation) ? next.saturation : DEFAULT_CONTROLS.saturation,
    colorVariance: Number.isFinite(next.colorVariance) ? next.colorVariance : DEFAULT_CONTROLS.colorVariance,
    colorBleed: Number.isFinite(next.colorBleed) ? next.colorBleed : DEFAULT_CONTROLS.colorBleed,
    colorBleedTone: next.colorBleedTone || DEFAULT_CONTROLS.colorBleedTone,
    colorBleedCustom: normalizeHex(next.colorBleedCustom, DEFAULT_CONTROLS.colorBleedCustom),
    wireframeFeeling: Number.isFinite(next.wireframeFeeling) ? next.wireframeFeeling : DEFAULT_CONTROLS.wireframeFeeling,
    visualRange: Number.isFinite(next.visualRange) ? next.visualRange : DEFAULT_CONTROLS.visualRange,
    skeuomorphism: Number.isFinite(next.skeuomorphism) ? next.skeuomorphism : DEFAULT_CONTROLS.skeuomorphism,
    negativeZoneStyle: Number.isFinite(next.negativeZoneStyle) ? next.negativeZoneStyle : DEFAULT_CONTROLS.negativeZoneStyle,
    boldness: Number.isFinite(next.boldness) ? next.boldness : DEFAULT_CONTROLS.boldness,
  };
}

export function defaultVisionDesignSystem(): VisionDesignSystemV1 {
  const base: VisionDesignSystemV1 = {
    version: 1,
    activeScenarioId: DEFAULT_SCENARIO.id,
    scenarios: [DEFAULT_SCENARIO],
    foundations: {
      fontFamily: 'Inter, system-ui, sans-serif',
      imageProfiles: [DEFAULT_IMAGE_PROFILE],
    },
    controls: { ...DEFAULT_CONTROLS, typography: { ...DEFAULT_CONTROLS.typography }, spacing: { ...DEFAULT_CONTROLS.spacing } },
    updatedAt: nowIso(),
  };
  return {
    ...base,
    derived: deriveDesignSystemTokens(base),
  };
}

export function deriveDesignSystemTokens(spec: VisionDesignSystemV1): VisionDesignSystemDerivedV1 {
  const controls = withControlDefaults(spec.controls);
  const scenarios = spec.scenarios.length ? spec.scenarios : [DEFAULT_SCENARIO];
  const active = scenarios.find((s) => s.id === spec.activeScenarioId) || scenarios[0] || DEFAULT_SCENARIO;

  const tSize = norm100(controls.typography.sizeGrowth);
  const tWeight = norm100(controls.typography.weightGrowth);
  const baseSize = controls.typography.baseSizePx;
  const baseWeight = controls.typography.baseWeight;
  const scale = lerp(1.02, 1.3, tSize);
  const weightSpread = lerp(20, 320, tWeight);
  const typeMeta: Array<{ token: VisionTypographyTokenV1['token']; exponent: number; weightRank: number; lh: number }> = [
    { token: 'caption', exponent: -1.1, weightRank: -0.16, lh: 1.45 },
    { token: 'label', exponent: -0.6, weightRank: -0.08, lh: 1.42 },
    { token: 'body', exponent: 0, weightRank: 0, lh: 1.38 },
    { token: 'h6', exponent: 0.9, weightRank: 0.22, lh: 1.33 },
    { token: 'h5', exponent: 1.6, weightRank: 0.38, lh: 1.28 },
    { token: 'h4', exponent: 2.3, weightRank: 0.55, lh: 1.24 },
    { token: 'h3', exponent: 3.0, weightRank: 0.72, lh: 1.19 },
    { token: 'h2', exponent: 3.7, weightRank: 0.87, lh: 1.14 },
    { token: 'h1', exponent: 4.4, weightRank: 1, lh: 1.08 },
  ];
  const typographyTokens: VisionTypographyTokenV1[] = typeMeta.map((it) => {
    const rawSize = baseSize * Math.pow(scale, it.exponent);
    const sizePx = Math.max(10, Math.round(rawSize));
    const weight = Math.round(clamp(baseWeight + weightSpread * it.weightRank, 280, 900));
    const lineHeight = Math.max(Math.round(sizePx * it.lh), sizePx + 4);
    return { token: it.token, sizePx, weight, lineHeight };
  });

  const spacingPattern = norm100(controls.spacing.pattern);
  const spacingDensity = norm100(controls.spacing.density);
  const aroundVsInside = norm100(controls.spacing.aroundVsInside);
  const spacingTemplates = [
    [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40],
    [0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80],
    [0, 4, 8, 16, 24, 32, 48, 64, 80, 96, 120],
  ];
  const patternPos = spacingPattern * (spacingTemplates.length - 1);
  const patternIdx = Math.floor(patternPos);
  const patternFrac = patternPos - patternIdx;
  const fromTemplate = spacingTemplates[patternIdx] || spacingTemplates[0];
  const toTemplate = spacingTemplates[Math.min(patternIdx + 1, spacingTemplates.length - 1)] || fromTemplate;
  const baseSpacingScale = fromTemplate.map((v, i) => lerp(v, toTemplate[i] || v, patternFrac));
  const densityFactor = lerp(0.72, 1.44, spacingDensity);
  const spacingScale = baseSpacingScale.map((v) => toEvenPx(v * densityFactor));
  const aroundIndex = clamp(Math.round(6 + (aroundVsInside - 0.5) * 2), 2, spacingScale.length - 1);
  const insideIndex = clamp(Math.round(5 - (aroundVsInside - 0.5) * 2), 1, spacingScale.length - 1);
  const aroundPx = spacingScale[aroundIndex] || 24;
  const insidePx = spacingScale[insideIndex] || 16;
  const gapPx = spacingScale[5] || 12;
  const compactPx = spacingScale[3] || 8;
  const microPx = spacingScale[2] || 4;
  const stackPx = spacingScale[6] || 20;

  const flatness = norm100(controls.flatness);
  const zoning = norm100(controls.zoning);
  const softness = norm100(controls.softness);
  const saturation = norm100(controls.saturation);
  const variance = norm100(controls.colorVariance);
  const bleed = norm100(controls.colorBleed);
  const wireframeRaw = norm100(controls.wireframeFeeling);
  const visualRaw = norm100(controls.visualRange);
  const blendSum = wireframeRaw + visualRaw;
  const wireframeMix = blendSum > 1 ? wireframeRaw / blendSum : wireframeRaw;
  const visualRangeMix = blendSum > 1 ? visualRaw / blendSum : visualRaw;
  const skeuo = norm100(controls.skeuomorphism);
  const boldIntent = norm100(controls.boldness);

  const accentPool = (active.palette.accent || []).length ? active.palette.accent : DEFAULT_SCENARIO.palette.accent;
  const accentCount = Math.max(1, Math.min(accentPool.length, 1 + Math.round(variance * 4)));
  const activeAccents = variance < 0.12 ? [] : accentPool.slice(0, accentCount);

  const primary = normalizeHex(active.palette.primary, DEFAULT_SCENARIO.palette.primary);
  const neutralBase = normalizeHex(active.palette.neutral[0], '#f8fafc');
  const neutralPanel = normalizeHex(active.palette.neutral[1], '#e2e8f0');
  const separatorBase = normalizeHex(active.palette.neutral[2], '#64748b');
  const fallbackText = normalizeHex(active.palette.neutral[3], '#0f172a');

  const bleedSource =
    controls.colorBleedTone === 'accent'
      ? normalizeHex(activeAccents[0] || active.palette.accent[0], primary)
      : controls.colorBleedTone === 'warm'
        ? '#f59e0b'
        : controls.colorBleedTone === 'cool'
          ? '#06b6d4'
          : controls.colorBleedTone === 'custom'
            ? normalizeHex(controls.colorBleedCustom, primary)
            : primary;

  const tintAmount = Number((bleed * 0.42).toFixed(3));
  const saturationWhiten = lerp(0.22, 0.01, saturation);
  const saturationTint =
    saturation < 0.33
      ? lerp(0, 0.08, saturation / 0.33)
      : saturation < 0.66
        ? lerp(0.08, 0.2, (saturation - 0.33) / 0.33)
        : lerp(0.2, 0.36, (saturation - 0.66) / 0.34);

  const canvasBase = mix(neutralBase, '#ffffff', saturationWhiten);
  const surfaceBase = mix(neutralBase, neutralPanel, 0.45);
  const panelBase = mix(neutralPanel, neutralBase, 0.3);
  const canvasBg = mix(canvasBase, bleedSource, tintAmount * 0.34 + saturationTint * 0.25);
  const surfaceBg = mix(mix(surfaceBase, '#ffffff', lerp(0.25, 0.02, saturation)), bleedSource, tintAmount * 0.2 + saturationTint * 0.18);
  const panelBg = mix(panelBase, bleedSource, tintAmount * 0.28 + saturationTint * 0.2);
  const separator = mix(separatorBase, bleedSource, tintAmount * 0.6);

  const uiRatio = active.ratios.find((r) => r.scope === 'ui' || r.scope === 'all') || active.ratios[0] || DEFAULT_SCENARIO.ratios[0];
  const colorBudget = clamp01((uiRatio.primaryPct + uiRatio.accentPct + uiRatio.semanticPct) / 100);
  const boldZoneCoverage = Math.min(lerp(0.1, 0.78, boldIntent), colorBudget);
  const boldZonePolicy: VisionDesignSystemDerivedV1['composition']['boldZonePolicy'] =
    boldIntent < 0.22 ? 'neutral' : boldIntent < 0.48 ? 'brandTint' : boldIntent < 0.78 ? 'brandSolid' : 'mediaBacked';

  const topNavBg =
    boldZonePolicy === 'neutral'
      ? mix(panelBg, primary, 0.04 + boldIntent * 0.08)
      : boldZonePolicy === 'brandTint'
        ? mix(panelBg, primary, lerp(0.18, 0.46, boldIntent))
        : boldZonePolicy === 'brandSolid'
          ? mix(primary, activeAccents[0] || primary, variance * 0.16)
          : `linear-gradient(132deg, ${mix(primary, '#0f172a', 0.1)}, ${activeAccents[0] || primary}, ${mix(primary, '#ffffff', 0.2)})`;
  const leftNavBg =
    boldZonePolicy === 'neutral'
      ? mix(surfaceBg, primary, 0.03 + boldIntent * 0.06)
      : boldZonePolicy === 'brandTint'
        ? mix(surfaceBg, primary, lerp(0.14, 0.36, boldIntent))
        : boldZonePolicy === 'brandSolid'
          ? mix(primary, '#0f172a', 0.12)
          : `linear-gradient(180deg, ${mix(primary, '#0f172a', 0.16)}, ${activeAccents[0] || primary})`;

  const topNavText = ensureContrastText(String(topNavBg).startsWith('linear-gradient') ? primary : topNavBg, '#ffffff', 4.5);
  const leftNavText = ensureContrastText(String(leftNavBg).startsWith('linear-gradient') ? mix(primary, '#0f172a', 0.12) : leftNavBg, '#ffffff', 4.5);

  const softnessCurve = Math.pow(softness, 1.12);
  const cardRadius = Math.round(lerp(2, 30, softnessCurve));
  const buttonRadius = softness > 0.88 ? 999 : Math.round(lerp(4, 24, Math.pow(softness, 0.88)));
  const inputRadius = Math.round(lerp(3, 16, Math.pow(softness, 1.04)));

  const zoneLevels = 1 + Math.round(zoning * 3);
  const zoneContrast = Number(lerp(0.02, 0.3, Math.pow(zoning, 0.92)).toFixed(3));
  const saturationPolicy = saturation < 0.34 ? 'semanticOnly' : saturation < 0.66 ? 'focused' : 'broad';
  const varianceLevel = variance < 0.34 ? 'low' : variance < 0.66 ? 'medium' : 'high';

  const materialBudget = clamp01(skeuo * (0.42 + (1 - flatness) * 0.58));
  const borderStyle: 'solid' | 'dashed' = wireframeMix > 0.82 ? 'dashed' : 'solid';
  const borderWidth = Number(lerp(0.35, 2.8, wireframeMix).toFixed(2));
  const wireframeLineOpacity = Number(lerp(0.08, 0.78, wireframeMix).toFixed(3));
  const wireframeFillOpacity = Number(lerp(1, 0.34, wireframeMix).toFixed(3));
  const gradientStrength = Number((visualRangeMix * (1 - wireframeMix * 0.6)).toFixed(3));
  const bevelStrength = Number((materialBudget * (0.45 + gradientStrength * 0.5)).toFixed(3));
  const glossStrength = Number((materialBudget * (0.25 + gradientStrength * 0.7)).toFixed(3));
  const innerShadowStrength = Number((materialBudget * (0.2 + wireframeMix * 0.3)).toFixed(3));
  const shadowStrength = Number(lerp(0.06, 0.4, materialBudget).toFixed(3));
  const highlightStrength = Number(lerp(0.02, 0.28, materialBudget).toFixed(3));
  const shadow = `0 ${Math.round(4 + shadowStrength * 24)}px ${Math.round(10 + shadowStrength * 36)}px rgba(15,23,42,${(0.08 + shadowStrength * 0.24).toFixed(3)})`;

  const buttonBgBase =
    saturation < 0.2 ? mix(primary, '#e2e8f0', 0.45) : saturation < 0.55 ? mix(primary, '#ffffff', 0.25) : mix(primary, activeAccents[0] || primary, 0.1);
  const buttonBg = wireframeMix > 0.75 ? mix(buttonBgBase, surfaceBg, 0.45) : buttonBgBase;
  const buttonText = ensureContrastText(buttonBg, '#ffffff', 4.5);

  const negativeZoneMode: VisionDesignSystemDerivedV1['negativeZone']['mode'] =
    controls.negativeZoneStyle < 30
      ? 'flat'
      : controls.negativeZoneStyle < 60
        ? 'subtle-gradient'
        : controls.negativeZoneStyle < 84
          ? 'texture'
          : 'image';
  const negativeZoneBackground =
    negativeZoneMode === 'flat'
      ? canvasBg
      : negativeZoneMode === 'subtle-gradient'
        ? `linear-gradient(160deg, ${canvasBg}, ${mix(panelBg, bleedSource, gradientStrength * 0.28)})`
        : negativeZoneMode === 'texture'
          ? `radial-gradient(circle at 1px 1px, ${mix(separator, '#ffffff', 0.25)} 1px, transparent 1px), ${canvasBg}`
          : `linear-gradient(140deg, ${mix(primary, '#0f172a', 0.2)}, ${mix(activeAccents[0] || primary, '#ffffff', 0.16)})`;

  return {
    typography: {
      fontFamily: spec.foundations.fontFamily,
      scale: Number(scale.toFixed(3)),
      tokens: typographyTokens,
    },
    spacing: {
      scale: spacingScale,
      microPx,
      compactPx,
      stackPx,
      aroundPx,
      insidePx,
      gapPx,
    },
    shape: {
      radiusXs: Math.max(0, Math.round(lerp(1, 8, Math.pow(softness, 1.1)))),
      radiusSm: Math.max(0, Math.round(lerp(3, 12, Math.pow(softness, 1.02)))),
      radiusMd: Math.max(0, Math.round(lerp(6, 18, Math.pow(softness, 0.94)))),
      radiusLg: Math.max(0, Math.round(lerp(10, 24, Math.pow(softness, 0.9)))),
      radiusXl: Math.max(0, Math.round(lerp(14, 32, Math.pow(softness, 0.85)))),
      cardRadius,
      buttonRadius,
      inputRadius,
      pillRadius: 999,
    },
    composition: {
      cardUsage: Number(flatness.toFixed(3)),
      separatorUsage: Number((1 - flatness).toFixed(3)),
      zoneLevels,
      zoneContrast,
      saturationPolicy,
      varianceLevel,
      boldZoneCoverage: Number(boldZoneCoverage.toFixed(3)),
      boldZonePolicy,
    },
    color: {
      primary,
      accents: activeAccents,
      neutrals: active.palette.neutral,
      semantic: active.palette.semantic,
      textOnPrimary: ensureContrastText(primary, '#ffffff', 4.5),
      canvasBg,
      surfaceBg,
      panelBg,
      separator,
      tintAmount,
    },
    effects: {
      wireframeMix: Number(wireframeMix.toFixed(3)),
      visualRangeMix: Number(visualRangeMix.toFixed(3)),
      wireframeLineOpacity,
      wireframeFillOpacity,
      borderStyle,
      borderWidth,
      gradientStrength,
      materialBudget: Number(materialBudget.toFixed(3)),
      bevelStrength,
      glossStrength,
      innerShadowStrength,
      shadowStrength,
      highlightStrength,
    },
    negativeZone: {
      mode: negativeZoneMode,
      background: negativeZoneBackground,
      textureOpacity: Number(lerp(0.08, 0.28, norm100(controls.negativeZoneStyle)).toFixed(3)),
    },
    preview: {
      topNavBg,
      topNavText,
      leftNavBg,
      leftNavText,
      contentBg: mix(canvasBg, fallbackText, zoneContrast * 0.03),
      cardBg: mix(surfaceBg, panelBg, zoning * 0.22),
      cardBorder: separator,
      buttonBg,
      buttonText,
      focusColor: activeAccents[0] || primary,
      shadow,
    },
  };
}

export function coerceVisionDesignSystem(input: unknown): VisionDesignSystemV1 | null {
  if (!input || typeof input !== 'object') return null;
  const src = input as Record<string, unknown>;
  if (Number(src.version) !== 1) return null;

  const scenariosRaw = Array.isArray(src.scenarios) ? src.scenarios : [];
  const scenarios = scenariosRaw.map((s, idx) => normalizeScenario(s, idx));
  const resolvedScenarios = scenarios.length ? scenarios : [DEFAULT_SCENARIO];

  const foundationsSrc = src.foundations && typeof src.foundations === 'object' ? (src.foundations as Record<string, unknown>) : {};
  const imageProfilesRaw = Array.isArray(foundationsSrc.imageProfiles) ? foundationsSrc.imageProfiles : [DEFAULT_IMAGE_PROFILE];
  const imageProfiles = imageProfilesRaw.map((p, idx) => normalizeImageProfile(p, idx));

  const controls = withControlDefaults(normalizeControls(src.controls));
  const activeScenarioIdRaw = String(src.activeScenarioId || '').trim();
  const activeScenarioId =
    activeScenarioIdRaw && resolvedScenarios.some((s) => s.id === activeScenarioIdRaw) ? activeScenarioIdRaw : resolvedScenarios[0]!.id;

  const result: VisionDesignSystemV1 = {
    version: 1,
    activeScenarioId,
    scenarios: resolvedScenarios,
    foundations: {
      fontFamily: String(foundationsSrc.fontFamily || '').trim() || 'Inter, system-ui, sans-serif',
      imageProfiles: imageProfiles.length ? imageProfiles : [DEFAULT_IMAGE_PROFILE],
    },
    controls,
    updatedAt: String(src.updatedAt || '').trim() || nowIso(),
  };

  return {
    ...result,
    derived: deriveDesignSystemTokens(result),
  };
}

export function normalizeVisionDesignSystem(input: VisionDesignSystemV1): VisionDesignSystemV1 {
  return coerceVisionDesignSystem(input) || defaultVisionDesignSystem();
}

function normalizeMarkdown(src: string): string {
  return String(src || '').replace(/\r\n?/g, '\n');
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countFencedBlocks(markdown: string, fence: string): number {
  const text = normalizeMarkdown(markdown);
  const safe = escapeRegex(fence);
  const re = new RegExp('^[ \\t]*```' + safe + '[ \\t]*$', 'gm');
  let count = 0;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    count += 1;
  }
  return count;
}

export function extractFencedBlock(markdown: string, fence: string): string | null {
  const text = normalizeMarkdown(markdown);
  const safe = escapeRegex(fence);
  const re = new RegExp('^[ \\t]*```' + safe + '[ \\t]*\\n([\\s\\S]*?)\\n[ \\t]*```[ \\t]*$', 'm');
  const m = text.match(re);
  if (!m) return null;
  const payload = String(m[1] || '').trim();
  return payload || null;
}

export function upsertFencedBlock(markdown: string, fence: string, body: string): string {
  const text = normalizeMarkdown(markdown);
  const block = ['```' + fence, String(body || '').trim(), '```'].join('\n');
  const safe = escapeRegex(fence);
  const full = new RegExp('^[ \\t]*```' + safe + '[ \\t]*\\n[\\s\\S]*?\\n[ \\t]*```[ \\t]*\\n?', 'm');
  if (full.test(text)) return text.replace(full, block + '\n');
  const needsLeadingNewline = text.length > 0 && !text.endsWith('\n');
  const sep = text.trim().length === 0 ? '' : '\n\n';
  return text + (needsLeadingNewline ? '\n' : '') + sep + block + '\n';
}

export function removeFencedBlocks(markdown: string, fence: string): string {
  const text = normalizeMarkdown(markdown);
  const safe = escapeRegex(fence);
  const re = new RegExp('(^|\\n)[ \\t]*```' + safe + '[ \\t]*\\n[\\s\\S]*?\\n[ \\t]*```[ \\t]*(?=\\n|$)', 'gm');
  return text.replace(re, '\n').replace(/\n{3,}/g, '\n\n');
}

export function extractVisionDesignSystemPayload(markdown: string): string | null {
  return extractFencedBlock(markdown, 'vision-design-system');
}

export function extractVisionDesignSystemReadout(markdown: string): string | null {
  return extractFencedBlock(markdown, 'vision-design-system-readout');
}

export function parseVisionDesignSystemPayload(payload: string): VisionDesignSystemV1 | null {
  const raw = String(payload || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return coerceVisionDesignSystem(parsed);
  } catch {
    return null;
  }
}

export function countVisionDesignSystemBlocks(markdown: string): number {
  return countFencedBlocks(markdown, 'vision-design-system');
}

export function countVisionDesignSystemReadoutBlocks(markdown: string): number {
  return countFencedBlocks(markdown, 'vision-design-system-readout');
}

function controlBand(value: number): 'low' | 'mid' | 'high' {
  if (value <= 25) return 'low';
  if (value >= 75) return 'high';
  return 'mid';
}

export function buildVisionDesignSystemReadout(spec: VisionDesignSystemV1): string {
  const ds = normalizeVisionDesignSystem(spec);
  const active = ds.scenarios.find((s) => s.id === ds.activeScenarioId) || ds.scenarios[0];
  const derived = ds.derived || deriveDesignSystemTokens(ds);
  const uiRatio = active?.ratios.find((r) => r.scope === 'ui' || r.scope === 'all') || active?.ratios[0];

  const lines: string[] = [];
  lines.push('Vision Design System Readout');
  lines.push('');
  lines.push(`Scenario: ${active?.name || 'Base'} (${active?.id || 'base'})`);
  lines.push(`Font family: ${ds.foundations.fontFamily}`);
  lines.push(`Typography scale: ${derived.typography.scale.toFixed(3)} (base ${ds.controls.typography.baseSizePx}px / ${ds.controls.typography.baseWeight})`);
  lines.push(
    `Type tokens: ${derived.typography.tokens
      .map((t) => `${t.token} ${t.sizePx}px/${t.weight}`)
      .join(', ')}`,
  );
  lines.push(`Spacing scale: ${derived.spacing.scale.join(', ')}`);
  lines.push(
    `Spacing around/inside/gap: ${derived.spacing.aroundPx}px / ${derived.spacing.insidePx}px / ${derived.spacing.gapPx}px (compact ${derived.spacing.compactPx}px)`,
  );
  lines.push(`Card usage: ${(derived.composition.cardUsage * 100).toFixed(0)}%`);
  lines.push(`Zone levels: ${derived.composition.zoneLevels}`);
  lines.push(`Saturation policy: ${derived.composition.saturationPolicy}`);
  lines.push(`Color variance level: ${derived.composition.varianceLevel}`);
  lines.push(`Color bleed: ${ds.controls.colorBleedTone} (${Math.round(ds.controls.colorBleed)}%)`);
  lines.push(`Negative zone mode: ${derived.negativeZone.mode}`);
  lines.push(`Bold zone policy: ${derived.composition.boldZonePolicy} (${(derived.composition.boldZoneCoverage * 100).toFixed(0)}% coverage)`);
  if (uiRatio) {
    lines.push(
      `UI ratio: neutral ${uiRatio.neutralPct}% · primary ${uiRatio.primaryPct}% · accent ${uiRatio.accentPct}% · semantic ${uiRatio.semanticPct}%`,
    );
  }
  lines.push('');
  lines.push('Control bands:');
  lines.push(`- typography size growth: ${controlBand(ds.controls.typography.sizeGrowth)}`);
  lines.push(`- typography weight growth: ${controlBand(ds.controls.typography.weightGrowth)}`);
  lines.push(`- spacing pattern: ${controlBand(ds.controls.spacing.pattern)}`);
  lines.push(`- spacing density: ${controlBand(ds.controls.spacing.density)}`);
  lines.push(`- flatness: ${controlBand(ds.controls.flatness)}`);
  lines.push(`- zoning: ${controlBand(ds.controls.zoning)}`);
  lines.push(`- softness: ${controlBand(ds.controls.softness)}`);
  lines.push(`- saturation: ${controlBand(ds.controls.saturation)}`);
  lines.push(`- color variance: ${controlBand(ds.controls.colorVariance)}`);
  lines.push(`- color bleed: ${controlBand(ds.controls.colorBleed)}`);
  lines.push(`- color bleed tone: ${ds.controls.colorBleedTone}`);
  lines.push(`- wireframe feeling: ${controlBand(ds.controls.wireframeFeeling)}`);
  lines.push(`- visual range: ${controlBand(ds.controls.visualRange)}`);
  lines.push(`- skeuomorphism: ${controlBand(ds.controls.skeuomorphism)}`);
  lines.push(`- negative zone style: ${controlBand(ds.controls.negativeZoneStyle)}`);
  lines.push(`- boldness: ${controlBand(ds.controls.boldness)}`);
  lines.push('');
  lines.push('Image profiles:');
  for (const profile of ds.foundations.imageProfiles) {
    lines.push(`- ${profile.name}: ${profile.style}; lighting=${profile.lighting}; lineWeight=${profile.lineWeight}`);
  }
  return lines.join('\n').trim();
}

export function upsertVisionDesignSystemBlocks(markdown: string, spec: VisionDesignSystemV1 | null): string {
  let text = normalizeMarkdown(markdown);
  if (!spec) {
    text = removeFencedBlocks(text, 'vision-design-system');
    text = removeFencedBlocks(text, 'vision-design-system-readout');
    return text;
  }
  const normalized = normalizeVisionDesignSystem(spec);
  const compact = JSON.stringify(normalized);
  const readout = buildVisionDesignSystemReadout(normalized);
  text = upsertFencedBlock(text, 'vision-design-system', compact);
  text = upsertFencedBlock(text, 'vision-design-system-readout', readout);
  return text;
}
