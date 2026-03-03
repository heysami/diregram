export type VisionRatioScope = 'ui' | 'icons' | 'images' | 'all';

export type VisionSemanticPaletteV1 = {
  success: string;
  warning: string;
  error: string;
  info: string;
};

export type VisionPalettePairingsV1 = {
  primaryPrimitive?: string;
  accentPrimitives?: string[];
  neutralPrimitives?: string[];
  semanticPrimitives?: Partial<Record<keyof VisionSemanticPaletteV1, string>>;
  primitiveOverrides?: Record<string, string>;
};

export type VisionPrimitiveRatioEntryV1 = {
  id: string;
  primitiveId: string;
  pct: number;
  usage?: 'surface' | 'item' | 'all';
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
  primitiveBreakdown?: VisionPrimitiveRatioEntryV1[];
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
  contrast: number;
};

export type VisionFontVarianceMode = 'single' | 'singleDecorative' | 'splitHeading' | 'splitHeadingDecorative';
export type VisionPillTargetV1 = 'buttons' | 'inputs' | 'chips' | 'tabs' | 'navItems' | 'tableTags';

export type VisionSpacingControlsV1 = {
  pattern: number;
  density: number;
  aroundVsInside: number;
};

export type VisionDarkModeControlsV1 = {
  showPreview: boolean;
  useOverrides: boolean;
  canvasBg: string;
  surfaceBg: string;
  panelBg: string;
  separator: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  accent: string;
  buttonBg: string;
};

export type VisionDesignSystemControlsV1 = {
  typography: VisionTypographyControlsV1;
  fontVariance: VisionFontVarianceMode;
  pillTargets: VisionPillTargetV1[];
  spacing: VisionSpacingControlsV1;
  flatness: number;
  zoning: number;
  softness: number;
  surfaceSaturation: number;
  itemSaturation: number;
  colorVariance: number;
  colorBleed: number;
  colorBleedTone: 'primary' | 'accent' | 'warm' | 'cool' | 'custom';
  colorBleedCustom: string;
  colorBleedText: number;
  wireframeFeeling: number;
  visualRange: number;
  skeuomorphism: number;
  skeuomorphismStyle: 'subtle' | 'neomorphic' | 'glass' | 'glow' | 'embossed';
  negativeZoneStyle: number;
  boldness: number;
  boldTypographyStyle: 'none' | 'gradient' | 'glow' | 'gradientGlow';
  boldGradientSource: 'auto' | 'custom';
  boldGradientFrom: string;
  boldGradientMid: string;
  boldGradientTo: string;
  darkMode: VisionDarkModeControlsV1;
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
    headingFontFamily: string;
    decorativeFontFamily: string;
    varianceMode: VisionFontVarianceMode;
    scale: number;
    contrast: number;
    captionOpacity: number;
    labelOpacity: number;
    bodyOpacity: number;
    subduedOpacity: number;
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
    itemColors: string[];
    itemTextColors: string[];
    neutrals: string[];
    semantic: VisionSemanticPaletteV1;
    textOnPrimary: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    canvasBg: string;
    surfaceBg: string;
    panelBg: string;
    separator: string;
    tintAmount: number;
  };
  dark: {
    color: {
      primary: string;
      accent: string;
      itemColors: string[];
      itemTextColors: string[];
      canvasBg: string;
      surfaceBg: string;
      panelBg: string;
      separator: string;
      textPrimary: string;
      textSecondary: string;
      textMuted: string;
    };
    preview: {
      topNavBg: string;
      topNavText: string;
      topNavActionBg: string;
      topNavActionText: string;
      topNavActionBorder: string;
      leftNavBg: string;
      leftNavText: string;
      leftNavActionBg: string;
      leftNavActionText: string;
      leftNavActionBorder: string;
      contentBg: string;
      cardBg: string;
      cardBorder: string;
      buttonBg: string;
      buttonText: string;
      focusColor: string;
      shadow: string;
      shadowColor: string;
      shadowAccent: string;
      shadowHighlight: string;
      gradientFrom: string;
      gradientMid: string;
      gradientTo: string;
    };
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
    topNavActionBg: string;
    topNavActionText: string;
    topNavActionBorder: string;
    leftNavBg: string;
    leftNavText: string;
    leftNavActionBg: string;
    leftNavActionText: string;
    leftNavActionBorder: string;
    contentBg: string;
    cardBg: string;
    cardBorder: string;
    buttonBg: string;
    buttonText: string;
    focusColor: string;
    shadow: string;
    shadowColor: string;
    shadowAccent: string;
    shadowHighlight: string;
    gradientFrom: string;
    gradientMid: string;
    gradientTo: string;
  };
};

export type VisionDesignSystemV1 = {
  version: 1;
  activeScenarioId: string;
  scenarios: VisionColorScenarioV1[];
  foundations: {
    fontFamily: string;
    headingFontFamily?: string;
    decorativeFontFamily?: string;
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
  { id: 'plus-jakarta-sans', label: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans, system-ui, sans-serif' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope, system-ui, sans-serif' },
  { id: 'dm-sans', label: 'DM Sans', family: 'DM Sans, system-ui, sans-serif' },
  { id: 'lexend', label: 'Lexend', family: 'Lexend, system-ui, sans-serif' },
  { id: 'space-grotesk', label: 'Space Grotesk', family: 'Space Grotesk, system-ui, sans-serif' },
  { id: 'sora', label: 'Sora', family: 'Sora, system-ui, sans-serif' },
  { id: 'outfit', label: 'Outfit', family: 'Outfit, system-ui, sans-serif' },
  { id: 'poppins', label: 'Poppins', family: 'Poppins, system-ui, sans-serif' },
  { id: 'urbanist', label: 'Urbanist', family: 'Urbanist, system-ui, sans-serif' },
];

export const VISION_DECORATIVE_FONT_OPTIONS: VisionGoogleFontOption[] = [
  { id: 'bricolage-grotesque', label: 'Bricolage Grotesque', family: 'Bricolage Grotesque, system-ui, sans-serif' },
  { id: 'caveat', label: 'Caveat', family: 'Caveat, cursive' },
];

function normalizeFontKey(family: string): string {
  return String(family || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasFontToken(family: string, token: string): boolean {
  const key = normalizeFontKey(family);
  const query = normalizeFontKey(token);
  return key.includes(query);
}

function pickHeadingCompanion(base: string): string {
  if (hasFontToken(base, 'space grotesk') || hasFontToken(base, 'sora') || hasFontToken(base, 'lexend')) {
    return 'Plus Jakarta Sans, system-ui, sans-serif';
  }
  if (hasFontToken(base, 'poppins') || hasFontToken(base, 'outfit')) {
    return 'Space Grotesk, system-ui, sans-serif';
  }
  if (hasFontToken(base, 'dm sans') || hasFontToken(base, 'inter') || hasFontToken(base, 'manrope')) {
    return 'Sora, system-ui, sans-serif';
  }
  return 'Space Grotesk, system-ui, sans-serif';
}

function pickDecorativeCompanion(base: string, mode: VisionFontVarianceMode): string {
  if (mode === 'splitHeadingDecorative') return 'Caveat, cursive';
  if (hasFontToken(base, 'space grotesk') || hasFontToken(base, 'sora')) return 'Bricolage Grotesque, system-ui, sans-serif';
  return 'Bricolage Grotesque, system-ui, sans-serif';
}

function primitiveById(id: string): VisionPrimitiveColorOption | null {
  const key = String(id || '').trim();
  if (!key) return null;
  return VISION_TAILWIND_PRIMITIVE_COLORS.find((it) => it.id === key) || null;
}

function parsePrimitiveId(id: string): { family: string; shade: number } | null {
  const m = String(id || '').trim().toLowerCase().match(/^([a-z]+)-(\d{2,3})$/);
  if (!m) return null;
  const shade = Number(m[2]);
  if (!Number.isFinite(shade)) return null;
  return { family: m[1], shade };
}

function toneLightnessForShade(shade: number): number {
  const anchors: Array<[number, number]> = [
    [50, 0.97],
    [100, 0.94],
    [200, 0.88],
    [300, 0.78],
    [400, 0.67],
    [500, 0.56],
    [600, 0.47],
    [700, 0.39],
    [800, 0.31],
    [900, 0.22],
  ];
  const target = clamp(Math.round(shade), 50, 900);
  for (let i = 0; i < anchors.length - 1; i++) {
    const [fromShade, fromL] = anchors[i]!;
    const [toShade, toL] = anchors[i + 1]!;
    if (target >= fromShade && target <= toShade) {
      const t = (target - fromShade) / Math.max(1, toShade - fromShade);
      return lerp(fromL, toL, t);
    }
  }
  return target <= 50 ? 0.97 : 0.22;
}

function toneFromOverride(base: string, shade: number): string {
  const normalizedBase = normalizeHex(base, '#2563eb');
  const rgb = toRgb(normalizedBase);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const targetL = toneLightnessForShade(shade);
  const satBoost = shade <= 200 ? 0.88 : shade >= 800 ? 0.92 : 1;
  const toned = hslToRgb(hsl.h, clamp01(hsl.s * satBoost), targetL);
  return rgbToHex(toned.r, toned.g, toned.b);
}

function resolvePrimitiveHex(id: string, pairings?: VisionPalettePairingsV1): string | null {
  const key = String(id || '').trim();
  if (!key || key === 'primary') return null;
  const primitive = primitiveById(key);
  if (!primitive) return null;
  const parsed = parsePrimitiveId(key);
  const family = parsed?.family || primitive.family;
  const shade = parsed?.shade || primitive.shade;
  const override = pairings?.primitiveOverrides?.[family];
  if (!override) return primitive.hex;
  return toneFromOverride(normalizeHex(override, primitive.hex), shade);
}

function ratioBreakdownFromLegacy(row: VisionColorRatioV1): VisionPrimitiveRatioEntryV1[] {
  const out: VisionPrimitiveRatioEntryV1[] = [];
  if (row.neutralPct > 0) out.push({ id: 'neutral', primitiveId: 'slate-100', pct: row.neutralPct, usage: 'surface' });
  if (row.primaryPct > 0) out.push({ id: 'primary', primitiveId: 'primary', pct: row.primaryPct, usage: 'item' });
  if (row.accentPct > 0) out.push({ id: 'accent', primitiveId: 'violet-600', pct: row.accentPct, usage: 'item' });
  if (row.semanticPct > 0) out.push({ id: 'semantic', primitiveId: 'green-600', pct: row.semanticPct, usage: 'item' });
  return out.length ? out : [{ id: 'neutral', primitiveId: 'slate-100', pct: 100, usage: 'surface' }];
}

function normalizeRatioBreakdown(value: unknown): VisionPrimitiveRatioEntryV1[] {
  const rows = Array.isArray(value) ? value : [];
  const out: VisionPrimitiveRatioEntryV1[] = [];
  for (const it of rows) {
    const r = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
    const primitiveId = String(r.primitiveId || '').trim();
    if (!primitiveId) continue;
    const usageRaw = String(r.usage || '').trim();
    const usage = usageRaw === 'surface' || usageRaw === 'item' || usageRaw === 'all' ? usageRaw : 'item';
    out.push({
      id: String(r.id || primitiveId || `ratio-${out.length + 1}`),
      primitiveId,
      pct: clampPercent(r.pct),
      usage: usage as VisionPrimitiveRatioEntryV1['usage'],
    });
  }
  return out;
}

function summarizeBreakdown(row: VisionColorRatioV1): Pick<VisionColorRatioV1, 'neutralPct' | 'primaryPct' | 'accentPct' | 'semanticPct'> {
  const entries = row.primitiveBreakdown || [];
  let neutralPct = 0;
  let primaryPct = 0;
  let accentPct = 0;
  const semanticPct = 0;
  for (const item of entries) {
    const pct = clampPercent(item.pct);
    if (item.primitiveId === 'primary') {
      primaryPct += pct;
      continue;
    }
    const primitive = primitiveById(item.primitiveId);
    if (!primitive) {
      accentPct += pct;
      continue;
    }
    if (primitive.kind === 'neutral') neutralPct += pct;
    else accentPct += pct;
  }
  return {
    neutralPct: clamp(neutralPct, 0, 100),
    primaryPct: clamp(primaryPct, 0, 100),
    accentPct: clamp(accentPct, 0, 100),
    semanticPct: clamp(semanticPct, 0, 100),
  };
}

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
      primaryPrimitive: 'blue-600',
      accentPrimitives: ['violet-600', 'orange-500', 'teal-500'],
      neutralPrimitives: ['slate-50', 'slate-200', 'slate-600', 'slate-900'],
      semanticPrimitives: {
        success: 'green-600',
        warning: 'amber-600',
        error: 'red-600',
        info: 'blue-600',
      },
      primitiveOverrides: {},
    },
  },
  ratios: [
    {
      scope: 'ui',
      neutralPct: 74,
      primaryPct: 16,
      accentPct: 6,
      semanticPct: 4,
      primitiveBreakdown: [
        { id: 'neutral-base', primitiveId: 'slate-100', pct: 52, usage: 'surface' },
        { id: 'neutral-strong', primitiveId: 'slate-700', pct: 22, usage: 'surface' },
        { id: 'primary', primitiveId: 'primary', pct: 16, usage: 'item' },
        { id: 'accent-1', primitiveId: 'violet-600', pct: 6, usage: 'item' },
        { id: 'accent-2', primitiveId: 'orange-500', pct: 4, usage: 'item' },
      ],
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
    contrast: 46,
  },
  fontVariance: 'single',
  pillTargets: [],
  spacing: {
    pattern: 32,
    density: 48,
    aroundVsInside: 56,
  },
  flatness: 44,
  zoning: 46,
  softness: 36,
  surfaceSaturation: 18,
  itemSaturation: 52,
  colorVariance: 34,
  colorBleed: 20,
  colorBleedTone: 'primary',
  colorBleedCustom: '#2563eb',
  colorBleedText: 12,
  wireframeFeeling: 16,
  visualRange: 24,
  skeuomorphism: 18,
  skeuomorphismStyle: 'subtle',
  negativeZoneStyle: 16,
  boldness: 22,
  boldTypographyStyle: 'none',
  boldGradientSource: 'auto',
  boldGradientFrom: '#1d4ed8',
  boldGradientMid: '#7c3aed',
  boldGradientTo: '#14b8a6',
  darkMode: {
    showPreview: true,
    useOverrides: false,
    canvasBg: '#0b1020',
    surfaceBg: '#121a2d',
    panelBg: '#1b2740',
    separator: '#334155',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    primary: '#60a5fa',
    accent: '#a78bfa',
    buttonBg: '#3b82f6',
  },
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

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = clamp(r, 0, 255) / 255;
  const gg = clamp(g, 0, 255) / 255;
  const bb = clamp(b, 0, 255) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return { h: h / 6, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 1) + 1) % 1;
  const ss = clamp01(s);
  const ll = clamp01(l);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return {
    r: Math.round(hueToRgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hh) * 255),
    b: Math.round(hueToRgb(p, q, hh - 1 / 3) * 255),
  };
}

function shiftHue(hex: string, degrees: number, satMult = 1, lightnessDelta = 0): string {
  const base = toRgb(normalizeHex(hex, '#2563eb'));
  const hsl = rgbToHsl(base.r, base.g, base.b);
  const hh = ((hsl.h * 360 + degrees) % 360 + 360) % 360;
  const shifted = hslToRgb(hh / 360, clamp01(hsl.s * satMult), clamp01(hsl.l + lightnessDelta));
  return rgbToHex(shifted.r, shifted.g, shifted.b);
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

function apcaLuminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const rr = channelToLinear(r);
  const gg = channelToLinear(g);
  const bb = channelToLinear(b);
  return 0.2126729 * rr + 0.7151522 * gg + 0.072175 * bb;
}

function apcaContrast(textHex: string, bgHex: string): number {
  // APCA-inspired lightness contrast estimate (Lc). Positive => dark text on light bg.
  let txtY = apcaLuminance(textHex);
  let bgY = apcaLuminance(bgHex);
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  if (txtY < blkThrs) txtY += Math.pow(blkThrs - txtY, blkClmp);
  if (bgY < blkThrs) bgY += Math.pow(blkThrs - bgY, blkClmp);
  if (Math.abs(bgY - txtY) < 0.0005) return 0;

  const normBG = 0.56;
  const normTXT = 0.57;
  const revTXT = 0.62;
  const revBG = 0.65;
  const scaleBoW = 1.14;
  const scaleWoB = 1.14;
  const loClip = 0.1;
  const loBoWoffset = 0.027;
  const loWoBoffset = 0.027;

  if (bgY > txtY) {
    const sapc = (Math.pow(bgY, normBG) - Math.pow(txtY, normTXT)) * scaleBoW;
    if (sapc < loClip) return 0;
    return (sapc - loBoWoffset) * 100;
  }
  const sapc = (Math.pow(bgY, revBG) - Math.pow(txtY, revTXT)) * scaleWoB;
  if (sapc > -loClip) return 0;
  return (sapc + loWoBoffset) * 100;
}

function apcaTargetLc(minContrast: number): number {
  if (minContrast >= 7) return 75;
  if (minContrast >= 4.5) return 60;
  return 45;
}

function pickTextColor(bg: string): string {
  const black = '#0f172a';
  const white = '#ffffff';
  const apcaBlack = Math.abs(apcaContrast(black, bg));
  const apcaWhite = Math.abs(apcaContrast(white, bg));
  if (Math.abs(apcaBlack - apcaWhite) > 2) return apcaBlack >= apcaWhite ? black : white;
  const cBlack = contrastRatio(bg, black);
  const cWhite = contrastRatio(bg, white);
  return cBlack >= cWhite ? black : white;
}

function ensureContrastText(bg: string, preferred?: string, minContrast = 4.5): string {
  const safeBg = normalizeHex(bg, '#ffffff');
  const preferredColor = normalizeHex(preferred, pickTextColor(safeBg));
  const targetLc = apcaTargetLc(minContrast);
  const candidates = new Set<string>();
  const pushCandidate = (hex: string) => {
    const normalized = normalizeHex(hex, '');
    if (normalized) candidates.add(normalized);
  };
  pushCandidate(preferredColor);
  pushCandidate(pickTextColor(safeBg));
  pushCandidate('#ffffff');
  pushCandidate('#0f172a');
  pushCandidate('#111827');
  pushCandidate('#000000');
  for (let i = 1; i <= 6; i++) {
    const t = i / 7;
    pushCandidate(mix(preferredColor, '#ffffff', t));
    pushCandidate(mix(preferredColor, '#000000', t));
  }

  let best: string = pickTextColor(safeBg);
  let bestScore = -Infinity;
  let bestPassing: string | null = null;
  let bestPassingScore = -Infinity;

  for (const candidate of candidates) {
    const ratio = contrastRatio(safeBg, candidate);
    const lc = Math.abs(apcaContrast(candidate, safeBg));
    const ratioScore = Math.min(2, ratio / Math.max(minContrast, 0.1));
    const lcScore = Math.min(2, lc / Math.max(targetLc, 1));
    const preference = candidate === preferredColor ? 0.08 : 0;
    const score = ratioScore * 0.55 + lcScore * 0.45 + preference;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
    if (ratio >= minContrast && lc >= targetLc && score > bestPassingScore) {
      bestPassing = candidate;
      bestPassingScore = score;
    }
  }

  return bestPassing || best;
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
  const primaryPrimitive = String(src.primaryPrimitive || '').trim();

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

  const overridesSrc = src.primitiveOverrides && typeof src.primitiveOverrides === 'object' ? (src.primitiveOverrides as Record<string, unknown>) : {};
  const primitiveOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(overridesSrc)) {
    const key = String(k || '').trim().toLowerCase();
    if (!key) continue;
    primitiveOverrides[key] = normalizeHex(v, '');
  }

  if (!primaryPrimitive && !accentPrimitives.length && !neutralPrimitives.length && Object.keys(semanticPrimitives).length === 0 && !Object.keys(primitiveOverrides).length) {
    return undefined;
  }
  return {
    ...(primaryPrimitive ? { primaryPrimitive } : null),
    accentPrimitives,
    neutralPrimitives,
    semanticPrimitives,
    ...(Object.keys(primitiveOverrides).length ? { primitiveOverrides } : null),
  };
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
      const legacyRow: VisionColorRatioV1 = {
        scope: coerceRatioScope(r.scope),
        neutralPct: clampPercent(r.neutralPct),
        primaryPct: clampPercent(r.primaryPct),
        accentPct: clampPercent(r.accentPct),
        semanticPct: clampPercent(r.semanticPct),
        primitiveBreakdown: normalizeRatioBreakdown(r.primitiveBreakdown),
      };
      if (!legacyRow.primitiveBreakdown || legacyRow.primitiveBreakdown.length === 0) {
        legacyRow.primitiveBreakdown = ratioBreakdownFromLegacy(legacyRow);
      }
      const summary = summarizeBreakdown(legacyRow);
      return {
        ...legacyRow,
        neutralPct: summary.neutralPct,
        primaryPct: summary.primaryPct,
        accentPct: summary.accentPct,
        semanticPct: summary.semanticPct,
      } satisfies VisionColorRatioV1;
    })
    .filter(Boolean);

  const pairingsPrimary = pairings?.primaryPrimitive ? resolvePrimitiveHex(pairings.primaryPrimitive, pairings) : null;
  const primaryColor = normalizeHex(pairingsPrimary || paletteSrc.primary, DEFAULT_SCENARIO.palette.primary);

  const accentFromPairings = (pairings?.accentPrimitives || [])
    .map((id) => resolvePrimitiveHex(id, pairings))
    .filter((c): c is string => !!c);
  const neutralFromPairings = (pairings?.neutralPrimitives || [])
    .map((id) => resolvePrimitiveHex(id, pairings))
    .filter((c): c is string => !!c);
  const semanticFromPairings = {
    success: pairings?.semanticPrimitives?.success ? resolvePrimitiveHex(pairings.semanticPrimitives.success, pairings) : null,
    warning: pairings?.semanticPrimitives?.warning ? resolvePrimitiveHex(pairings.semanticPrimitives.warning, pairings) : null,
    error: pairings?.semanticPrimitives?.error ? resolvePrimitiveHex(pairings.semanticPrimitives.error, pairings) : null,
    info: pairings?.semanticPrimitives?.info ? resolvePrimitiveHex(pairings.semanticPrimitives.info, pairings) : null,
  };

  return {
    id: String(src.id || '').trim() || (index === 0 ? 'base' : `scenario-${index + 1}`),
    name: String(src.name || '').trim() || (index === 0 ? 'Base' : `Scenario ${index + 1}`),
    palette: {
      primary: primaryColor,
      accent: accentFromPairings.length
        ? normalizeHexList(accentFromPairings, DEFAULT_SCENARIO.palette.accent)
        : normalizeHexList(paletteSrc.accent, DEFAULT_SCENARIO.palette.accent),
      neutral: neutralFromPairings.length
        ? normalizeHexList(neutralFromPairings, DEFAULT_SCENARIO.palette.neutral)
        : normalizeHexList(paletteSrc.neutral, DEFAULT_SCENARIO.palette.neutral),
      semantic: {
        success: normalizeHex(semanticFromPairings.success || semanticSrc.success, DEFAULT_SEMANTIC.success),
        warning: normalizeHex(semanticFromPairings.warning || semanticSrc.warning, DEFAULT_SEMANTIC.warning),
        error: normalizeHex(semanticFromPairings.error || semanticSrc.error, DEFAULT_SEMANTIC.error),
        info: normalizeHex(semanticFromPairings.info || semanticSrc.info, DEFAULT_SEMANTIC.info),
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

function normalizePillTargets(input: unknown): VisionPillTargetV1[] {
  if (!Array.isArray(input)) return [];
  const out: VisionPillTargetV1[] = [];
  for (const raw of input) {
    const id = String(raw || '').trim();
    if (id !== 'buttons' && id !== 'inputs' && id !== 'chips' && id !== 'tabs' && id !== 'navItems' && id !== 'tableTags') continue;
    const normalized = id as VisionPillTargetV1;
    if (out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

function normalizeControls(input: unknown): VisionDesignSystemControlsV1 {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const typSrc = src.typography && typeof src.typography === 'object' ? (src.typography as Record<string, unknown>) : {};
  const spacingSrc = src.spacing && typeof src.spacing === 'object' ? (src.spacing as Record<string, unknown>) : {};
  const darkSrc = src.darkMode && typeof src.darkMode === 'object' ? (src.darkMode as Record<string, unknown>) : {};

  return {
    typography: {
      baseSizePx: clamp(Math.round(Number(typSrc.baseSizePx)), 12, 24) || DEFAULT_CONTROLS.typography.baseSizePx,
      baseWeight: clamp(Math.round(Number(typSrc.baseWeight)), 300, 700) || DEFAULT_CONTROLS.typography.baseWeight,
      sizeGrowth: clamp(Math.round(Number(typSrc.sizeGrowth)), 0, 100),
      weightGrowth: clamp(Math.round(Number(typSrc.weightGrowth)), 0, 100),
      contrast: clamp(Math.round(Number(typSrc.contrast)), 0, 100),
    },
    fontVariance:
      String(src.fontVariance || '').trim() === 'singleDecorative' ||
      String(src.fontVariance || '').trim() === 'splitHeading' ||
      String(src.fontVariance || '').trim() === 'splitHeadingDecorative'
        ? (String(src.fontVariance || '').trim() as VisionFontVarianceMode)
        : 'single',
    pillTargets: normalizePillTargets(src.pillTargets),
    spacing: {
      pattern: clamp(Math.round(Number(spacingSrc.pattern)), 0, 100),
      density: clamp(Math.round(Number(spacingSrc.density)), 0, 100),
      aroundVsInside: clamp(Math.round(Number(spacingSrc.aroundVsInside)), 0, 100),
    },
    flatness: clamp(Math.round(Number(src.flatness)), 0, 100),
    zoning: clamp(Math.round(Number(src.zoning)), 0, 100),
    softness: clamp(Math.round(Number(src.softness)), 0, 100),
    surfaceSaturation: clamp(Math.round(Number(src.surfaceSaturation ?? src.saturation)), 0, 100),
    itemSaturation: clamp(Math.round(Number(src.itemSaturation ?? src.saturation)), 0, 100),
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
    colorBleedText: clamp(Math.round(Number(src.colorBleedText)), 0, 100),
    wireframeFeeling: clamp(Math.round(Number(src.wireframeFeeling)), 0, 100),
    visualRange: clamp(Math.round(Number(src.visualRange)), 0, 100),
    skeuomorphism: clamp(Math.round(Number(src.skeuomorphism)), 0, 100),
    skeuomorphismStyle:
      String(src.skeuomorphismStyle || '').trim() === 'neomorphic' ||
      String(src.skeuomorphismStyle || '').trim() === 'glass' ||
      String(src.skeuomorphismStyle || '').trim() === 'glow' ||
      String(src.skeuomorphismStyle || '').trim() === 'embossed'
        ? (String(src.skeuomorphismStyle || '').trim() as VisionDesignSystemControlsV1['skeuomorphismStyle'])
        : 'subtle',
    negativeZoneStyle: clamp(Math.round(Number(src.negativeZoneStyle)), 0, 100),
    boldness: clamp(Math.round(Number(src.boldness)), 0, 100),
    boldTypographyStyle:
      String(src.boldTypographyStyle || '').trim() === 'gradient' ||
      String(src.boldTypographyStyle || '').trim() === 'glow' ||
      String(src.boldTypographyStyle || '').trim() === 'gradientGlow'
        ? (String(src.boldTypographyStyle || '').trim() as VisionDesignSystemControlsV1['boldTypographyStyle'])
        : 'none',
    boldGradientSource: String(src.boldGradientSource || '').trim() === 'custom' ? 'custom' : 'auto',
    boldGradientFrom: normalizeHex(src.boldGradientFrom, DEFAULT_CONTROLS.boldGradientFrom),
    boldGradientMid: normalizeHex(src.boldGradientMid, DEFAULT_CONTROLS.boldGradientMid),
    boldGradientTo: normalizeHex(src.boldGradientTo, DEFAULT_CONTROLS.boldGradientTo),
    darkMode: {
      showPreview: darkSrc.showPreview === undefined ? DEFAULT_CONTROLS.darkMode.showPreview : Boolean(darkSrc.showPreview),
      useOverrides: darkSrc.useOverrides === undefined ? DEFAULT_CONTROLS.darkMode.useOverrides : Boolean(darkSrc.useOverrides),
      canvasBg: normalizeHex(darkSrc.canvasBg, DEFAULT_CONTROLS.darkMode.canvasBg),
      surfaceBg: normalizeHex(darkSrc.surfaceBg, DEFAULT_CONTROLS.darkMode.surfaceBg),
      panelBg: normalizeHex(darkSrc.panelBg, DEFAULT_CONTROLS.darkMode.panelBg),
      separator: normalizeHex(darkSrc.separator, DEFAULT_CONTROLS.darkMode.separator),
      textPrimary: normalizeHex(darkSrc.textPrimary, DEFAULT_CONTROLS.darkMode.textPrimary),
      textSecondary: normalizeHex(darkSrc.textSecondary, DEFAULT_CONTROLS.darkMode.textSecondary),
      textMuted: normalizeHex(darkSrc.textMuted, DEFAULT_CONTROLS.darkMode.textMuted),
      primary: normalizeHex(darkSrc.primary, DEFAULT_CONTROLS.darkMode.primary),
      accent: normalizeHex(darkSrc.accent, DEFAULT_CONTROLS.darkMode.accent),
      buttonBg: normalizeHex(darkSrc.buttonBg, DEFAULT_CONTROLS.darkMode.buttonBg),
    },
  };
}

function withControlDefaults(next: VisionDesignSystemControlsV1): VisionDesignSystemControlsV1 {
  return {
    typography: {
      baseSizePx: next.typography.baseSizePx || DEFAULT_CONTROLS.typography.baseSizePx,
      baseWeight: next.typography.baseWeight || DEFAULT_CONTROLS.typography.baseWeight,
      sizeGrowth: Number.isFinite(next.typography.sizeGrowth) ? next.typography.sizeGrowth : DEFAULT_CONTROLS.typography.sizeGrowth,
      weightGrowth: Number.isFinite(next.typography.weightGrowth) ? next.typography.weightGrowth : DEFAULT_CONTROLS.typography.weightGrowth,
      contrast: Number.isFinite(next.typography.contrast) ? next.typography.contrast : DEFAULT_CONTROLS.typography.contrast,
    },
    fontVariance: next.fontVariance || DEFAULT_CONTROLS.fontVariance,
    pillTargets: normalizePillTargets(next.pillTargets),
    spacing: {
      pattern: Number.isFinite(next.spacing.pattern) ? next.spacing.pattern : DEFAULT_CONTROLS.spacing.pattern,
      density: Number.isFinite(next.spacing.density) ? next.spacing.density : DEFAULT_CONTROLS.spacing.density,
      aroundVsInside: Number.isFinite(next.spacing.aroundVsInside) ? next.spacing.aroundVsInside : DEFAULT_CONTROLS.spacing.aroundVsInside,
    },
    flatness: Number.isFinite(next.flatness) ? next.flatness : DEFAULT_CONTROLS.flatness,
    zoning: Number.isFinite(next.zoning) ? next.zoning : DEFAULT_CONTROLS.zoning,
    softness: Number.isFinite(next.softness) ? next.softness : DEFAULT_CONTROLS.softness,
    surfaceSaturation: Number.isFinite(next.surfaceSaturation) ? next.surfaceSaturation : DEFAULT_CONTROLS.surfaceSaturation,
    itemSaturation: Number.isFinite(next.itemSaturation) ? next.itemSaturation : DEFAULT_CONTROLS.itemSaturation,
    colorVariance: Number.isFinite(next.colorVariance) ? next.colorVariance : DEFAULT_CONTROLS.colorVariance,
    colorBleed: Number.isFinite(next.colorBleed) ? next.colorBleed : DEFAULT_CONTROLS.colorBleed,
    colorBleedTone: next.colorBleedTone || DEFAULT_CONTROLS.colorBleedTone,
    colorBleedCustom: normalizeHex(next.colorBleedCustom, DEFAULT_CONTROLS.colorBleedCustom),
    colorBleedText: Number.isFinite(next.colorBleedText) ? next.colorBleedText : DEFAULT_CONTROLS.colorBleedText,
    wireframeFeeling: Number.isFinite(next.wireframeFeeling) ? next.wireframeFeeling : DEFAULT_CONTROLS.wireframeFeeling,
    visualRange: Number.isFinite(next.visualRange) ? next.visualRange : DEFAULT_CONTROLS.visualRange,
    skeuomorphism: Number.isFinite(next.skeuomorphism) ? next.skeuomorphism : DEFAULT_CONTROLS.skeuomorphism,
    skeuomorphismStyle: next.skeuomorphismStyle || DEFAULT_CONTROLS.skeuomorphismStyle,
    negativeZoneStyle: Number.isFinite(next.negativeZoneStyle) ? next.negativeZoneStyle : DEFAULT_CONTROLS.negativeZoneStyle,
    boldness: Number.isFinite(next.boldness) ? next.boldness : DEFAULT_CONTROLS.boldness,
    boldTypographyStyle: next.boldTypographyStyle || DEFAULT_CONTROLS.boldTypographyStyle,
    boldGradientSource: next.boldGradientSource || DEFAULT_CONTROLS.boldGradientSource,
    boldGradientFrom: normalizeHex(next.boldGradientFrom, DEFAULT_CONTROLS.boldGradientFrom),
    boldGradientMid: normalizeHex(next.boldGradientMid, DEFAULT_CONTROLS.boldGradientMid),
    boldGradientTo: normalizeHex(next.boldGradientTo, DEFAULT_CONTROLS.boldGradientTo),
    darkMode: {
      showPreview: next.darkMode?.showPreview ?? DEFAULT_CONTROLS.darkMode.showPreview,
      useOverrides: next.darkMode?.useOverrides ?? DEFAULT_CONTROLS.darkMode.useOverrides,
      canvasBg: normalizeHex(next.darkMode?.canvasBg, DEFAULT_CONTROLS.darkMode.canvasBg),
      surfaceBg: normalizeHex(next.darkMode?.surfaceBg, DEFAULT_CONTROLS.darkMode.surfaceBg),
      panelBg: normalizeHex(next.darkMode?.panelBg, DEFAULT_CONTROLS.darkMode.panelBg),
      separator: normalizeHex(next.darkMode?.separator, DEFAULT_CONTROLS.darkMode.separator),
      textPrimary: normalizeHex(next.darkMode?.textPrimary, DEFAULT_CONTROLS.darkMode.textPrimary),
      textSecondary: normalizeHex(next.darkMode?.textSecondary, DEFAULT_CONTROLS.darkMode.textSecondary),
      textMuted: normalizeHex(next.darkMode?.textMuted, DEFAULT_CONTROLS.darkMode.textMuted),
      primary: normalizeHex(next.darkMode?.primary, DEFAULT_CONTROLS.darkMode.primary),
      accent: normalizeHex(next.darkMode?.accent, DEFAULT_CONTROLS.darkMode.accent),
      buttonBg: normalizeHex(next.darkMode?.buttonBg, DEFAULT_CONTROLS.darkMode.buttonBg),
    },
  };
}

export function defaultVisionDesignSystem(): VisionDesignSystemV1 {
  const base: VisionDesignSystemV1 = {
    version: 1,
    activeScenarioId: DEFAULT_SCENARIO.id,
    scenarios: [DEFAULT_SCENARIO],
    foundations: {
      fontFamily: 'Inter, system-ui, sans-serif',
      headingFontFamily: 'Sora, system-ui, sans-serif',
      decorativeFontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
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
  const baseFontFamily = String(spec.foundations.fontFamily || '').trim() || 'Inter, system-ui, sans-serif';
  const headingSelected = String(spec.foundations.headingFontFamily || '').trim();
  const decorativeSelected = String(spec.foundations.decorativeFontFamily || '').trim();
  const headingCompanion = headingSelected || pickHeadingCompanion(baseFontFamily);
  const decorativeCompanion = decorativeSelected || pickDecorativeCompanion(baseFontFamily, controls.fontVariance);
  const headingFontFamily =
    controls.fontVariance === 'splitHeading' || controls.fontVariance === 'splitHeadingDecorative' ? headingCompanion : baseFontFamily;
  const decorativeFontFamily =
    controls.fontVariance === 'singleDecorative' || controls.fontVariance === 'splitHeadingDecorative' ? decorativeCompanion : baseFontFamily;

  const tSize = norm100(controls.typography.sizeGrowth);
  const tWeight = norm100(controls.typography.weightGrowth);
  const baseSize = controls.typography.baseSizePx;
  const baseWeight = controls.typography.baseWeight;
  const scale = lerp(1.03, 1.28, tSize);
  const weightSpread = lerp(16, 360, tWeight);
  const typeMeta: Array<{ token: VisionTypographyTokenV1['token']; exponent: number; weightRank: number; lh: number }> = [
    { token: 'caption', exponent: -1.35, weightRank: -0.18, lh: 1.48 },
    { token: 'label', exponent: -0.75, weightRank: -0.08, lh: 1.45 },
    { token: 'body', exponent: 0, weightRank: 0, lh: 1.38 },
    { token: 'h6', exponent: 0.78, weightRank: 0.2, lh: 1.33 },
    { token: 'h5', exponent: 1.45, weightRank: 0.36, lh: 1.28 },
    { token: 'h4', exponent: 2.12, weightRank: 0.53, lh: 1.24 },
    { token: 'h3', exponent: 2.82, weightRank: 0.7, lh: 1.19 },
    { token: 'h2', exponent: 3.5, weightRank: 0.86, lh: 1.14 },
    { token: 'h1', exponent: 4.18, weightRank: 1, lh: 1.08 },
  ];
  const typographyTokens: VisionTypographyTokenV1[] = typeMeta.map((it) => {
    const rawSize = baseSize * Math.pow(scale, it.exponent);
    const sizePx = Math.max(9, Math.round(rawSize));
    const weight = Math.round(clamp(baseWeight + weightSpread * it.weightRank, 280, 900));
    const lineHeight = Math.max(Math.round(sizePx * it.lh), sizePx + 4);
    return { token: it.token, sizePx, weight, lineHeight };
  });

  const spacingPattern = norm100(controls.spacing.pattern);
  const spacingDensity = norm100(controls.spacing.density);
  const aroundVsInside = norm100(controls.spacing.aroundVsInside);
  const spacingTemplates = [
    [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32],
    [0, 2, 4, 8, 12, 16, 20, 24, 28, 32, 40],
    [0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80],
    [0, 4, 8, 16, 24, 32, 48, 64, 80, 96, 120],
  ];
  const patternPos = spacingPattern * (spacingTemplates.length - 1);
  const patternIdx = Math.floor(patternPos);
  const patternFrac = patternPos - patternIdx;
  const fromTemplate = spacingTemplates[patternIdx] || spacingTemplates[0];
  const toTemplate = spacingTemplates[Math.min(patternIdx + 1, spacingTemplates.length - 1)] || fromTemplate;
  const baseSpacingScale = fromTemplate.map((v, i) => lerp(v, toTemplate[i] || v, patternFrac));
  const densityFactor = lerp(0.62, 1.56, spacingDensity);
  const spacingScale = baseSpacingScale.map((v) => toEvenPx(v * densityFactor));
  const aroundInsideBias = lerp(-2.2, 2.2, aroundVsInside);
  const aroundIndex = clamp(Math.round(6 + aroundInsideBias), 2, spacingScale.length - 1);
  const insideIndex = clamp(Math.round(5 - aroundInsideBias), 1, spacingScale.length - 1);
  const aroundPx = spacingScale[aroundIndex] || 24;
  const insidePx = spacingScale[insideIndex] || 16;
  const gapPx = Math.max(6, spacingScale[5] || 12);
  const compactPx = Math.max(4, spacingScale[3] || 8);
  const microPx = Math.max(2, spacingScale[2] || 4);
  const stackPx = Math.max(gapPx, spacingScale[6] || 20);

  const flatness = norm100(controls.flatness);
  const zoning = norm100(controls.zoning);
  const softness = norm100(controls.softness);
  const pillTargets = normalizePillTargets(controls.pillTargets);
  const pillTargetSet = new Set<VisionPillTargetV1>(pillTargets);
  const surfaceSaturation = norm100(controls.surfaceSaturation);
  const itemSaturation = norm100(controls.itemSaturation);
  const variance = norm100(controls.colorVariance);
  const bleed = norm100(controls.colorBleed);
  const bleedText = norm100(controls.colorBleedText);
  const wireframeRaw = norm100(controls.wireframeFeeling);
  const visualRaw = norm100(controls.visualRange);
  const blendSum = wireframeRaw + visualRaw;
  const wireframeMix = blendSum > 1 ? wireframeRaw / blendSum : wireframeRaw;
  const visualRangeMix = blendSum > 1 ? visualRaw / blendSum : visualRaw;
  const skeuo = norm100(controls.skeuomorphism);
  const boldIntent = norm100(controls.boldness);
  const typeContrast = norm100(controls.typography.contrast);

  const primary = normalizeHex(active.palette.primary, DEFAULT_SCENARIO.palette.primary);
  const neutralBase = normalizeHex(active.palette.neutral[0], '#f8fafc');
  const neutralPanel = normalizeHex(active.palette.neutral[1], '#e2e8f0');
  const separatorBase = normalizeHex(active.palette.neutral[2], '#64748b');
  const fallbackText = normalizeHex(active.palette.neutral[3], '#0f172a');

  const uniqueColors = (list: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const c = normalizeHex(raw, '');
      if (!c || seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  };

  const uiRatio = active.ratios.find((r) => r.scope === 'ui' || r.scope === 'all') || active.ratios[0] || DEFAULT_SCENARIO.ratios[0];
  const rawBreakdown = uiRatio.primitiveBreakdown && uiRatio.primitiveBreakdown.length ? uiRatio.primitiveBreakdown : ratioBreakdownFromLegacy(uiRatio);
  const uiBreakdown = rawBreakdown
    .map((it, idx) => ({
      ...it,
      id: it.id || `entry-${idx + 1}`,
      primitiveId: String(it.primitiveId || 'primary'),
      pct: clampPercent(it.pct),
      usage: it.usage || 'all',
    }))
    .sort((a, b) => b.pct - a.pct);

  const resolveEntryColor = (entry: { primitiveId: string }) => {
    if (entry.primitiveId === 'primary') return primary;
    const resolved = resolvePrimitiveHex(entry.primitiveId, active.palette.pairings);
    if (resolved) return resolved;
    const primitive = primitiveById(entry.primitiveId);
    if (primitive) return primitive.hex;
    return primary;
  };

  const itemEntries = uiBreakdown.filter((it) => it.usage !== 'surface');
  const surfaceEntries = uiBreakdown.filter((it) => it.usage !== 'item');
  const normalizedItemEntries = itemEntries.length ? itemEntries : [{ id: 'primary', primitiveId: 'primary', pct: 100, usage: 'item' as const }];
  const normalizedSurfaceEntries = surfaceEntries.length ? surfaceEntries : [{ id: 'neutral', primitiveId: 'slate-100', pct: 100, usage: 'surface' as const }];
  const itemColorCandidates = uniqueColors(normalizedItemEntries.map((it) => resolveEntryColor(it)));
  const surfaceColorCandidates = uniqueColors(normalizedSurfaceEntries.map((it) => resolveEntryColor(it)));

  const fallbackItemColors = uniqueColors([primary, ...(active.palette.accent || DEFAULT_SCENARIO.palette.accent)]);
  const itemBasePalette = itemColorCandidates.length ? itemColorCandidates : fallbackItemColors;
  const ratioColorBudget = clamp01(normalizedItemEntries.reduce((acc, it) => acc + it.pct, 0) / 100);
  const variationCap = Math.max(1, Math.min(8, itemBasePalette.length));
  const varianceGain = clamp01(Math.pow(variance, 0.88) * (0.45 + ratioColorBudget * 0.9));
  const targetItemColors = Math.max(1, Math.min(variationCap, 1 + Math.round((variationCap - 1) * varianceGain)));
  const varianceScopedPalette = itemBasePalette.slice(0, targetItemColors);
  const accentPool = uniqueColors(
    varianceScopedPalette.filter((c) => normalizeHex(c, primary) !== normalizeHex(primary, primary)).concat(active.palette.accent || []),
  );
  const activeAccents = variance < 0.08 ? [] : accentPool.slice(0, Math.max(1, Math.min(6, targetItemColors - 1 || 1)));

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

  const tintAmount = Number((bleed * 0.46).toFixed(3));
  const neutralWhiten = surfaceSaturation < 0.35 ? lerp(0.52, 0.24, surfaceSaturation / 0.35) : surfaceSaturation < 0.68 ? lerp(0.24, 0.08, (surfaceSaturation - 0.35) / 0.33) : 0.08;
  const canvasNeutral = mix(neutralBase, '#ffffff', neutralWhiten);
  const surfaceNeutral = mix(neutralPanel, '#ffffff', lerp(0.34, 0.1, surfaceSaturation));
  const panelNeutral = mix(neutralPanel, neutralBase, lerp(0.16, 0.58, surfaceSaturation));
  const neutralBleed = bleed <= 0.001 ? 0 : tintAmount;
  const canvasBg = mix(canvasNeutral, bleedSource, neutralBleed * 0.26);
  const surfaceBg = mix(surfaceNeutral, bleedSource, neutralBleed * 0.34);
  const panelBg = mix(panelNeutral, bleedSource, neutralBleed * 0.46);
  const separator = mix(separatorBase, bleedSource, neutralBleed * 0.58);
  const surfaceTintSource = surfaceColorCandidates[0] || primary;
  const wellTintMix =
    surfaceSaturation < 0.28
      ? 0
      : surfaceSaturation < 0.58
        ? lerp(0.06, 0.24, (surfaceSaturation - 0.28) / 0.3)
        : lerp(0.24, 0.64, (surfaceSaturation - 0.58) / 0.42);
  const wellSurface = mix(surfaceBg, surfaceTintSource, wellTintMix);

  const colorBudget = clamp01(
    normalizedItemEntries
      .filter((it) => {
        if (it.primitiveId === 'primary') return true;
        const primitive = primitiveById(it.primitiveId);
        return primitive ? primitive.kind === 'accent' : true;
      })
      .reduce((acc, it) => acc + it.pct, 0) / 100,
  );
  const boldZoneCoverage = clamp01(lerp(0.02, 1, boldIntent) * (0.3 + colorBudget * 0.7));
  const boldZonePolicy: VisionDesignSystemDerivedV1['composition']['boldZonePolicy'] =
    boldIntent < 0.22 ? 'neutral' : boldIntent < 0.48 ? 'brandTint' : boldIntent < 0.78 ? 'brandSolid' : 'mediaBacked';
  const autoBoldGradientFrom = mix(primary, '#0f172a', 0.14);
  const autoBoldGradientMid = activeAccents[0] || primary;
  const autoBoldGradientTo = mix(primary, '#ffffff', 0.2);
  const boldGradientFrom =
    controls.boldGradientSource === 'custom' ? normalizeHex(controls.boldGradientFrom, autoBoldGradientFrom) : autoBoldGradientFrom;
  const boldGradientMid =
    controls.boldGradientSource === 'custom' ? normalizeHex(controls.boldGradientMid, autoBoldGradientMid) : autoBoldGradientMid;
  const boldGradientTo =
    controls.boldGradientSource === 'custom' ? normalizeHex(controls.boldGradientTo, autoBoldGradientTo) : autoBoldGradientTo;
  const topMediaGradient = `linear-gradient(132deg, ${boldGradientFrom}, ${boldGradientMid}, ${boldGradientTo})`;
  const leftMediaGradient = `linear-gradient(180deg, ${mix(boldGradientFrom, '#0f172a', 0.2)}, ${boldGradientMid})`;

  const topNavBg =
    boldZonePolicy === 'neutral'
      ? mix(panelBg, primary, 0.02 + boldZoneCoverage * 0.08)
      : boldZonePolicy === 'brandTint'
        ? mix(panelBg, primary, lerp(0.14, 0.56, boldZoneCoverage))
        : boldZonePolicy === 'brandSolid'
          ? mix(primary, activeAccents[0] || primary, 0.08 + variance * 0.24)
          : topMediaGradient;
  const leftNavBg =
    boldZonePolicy === 'neutral'
      ? mix(surfaceBg, primary, 0.02 + boldZoneCoverage * 0.06)
      : boldZonePolicy === 'brandTint'
        ? mix(surfaceBg, primary, lerp(0.12, 0.42, boldZoneCoverage))
        : boldZonePolicy === 'brandSolid'
          ? mix(primary, '#0f172a', 0.16)
          : leftMediaGradient;

  const topGradientRef = mix(mix(boldGradientFrom, boldGradientMid, 0.5), boldGradientTo, 0.5);
  const leftGradientRef = mix(mix(boldGradientFrom, '#0f172a', 0.2), boldGradientMid, 0.55);
  const topNavText = ensureContrastText(String(topNavBg).startsWith('linear-gradient') ? topGradientRef : topNavBg, '#ffffff', 4.5);
  const leftNavText = ensureContrastText(String(leftNavBg).startsWith('linear-gradient') ? leftGradientRef : leftNavBg, '#ffffff', 4.5);
  const textTintMix = bleed <= 0.001 ? 0 : bleedText * (0.08 + bleed * 0.44);
  const textPrimary = ensureContrastText(canvasBg, mix(fallbackText, bleedSource, textTintMix), 5.2);
  const textSecondary = ensureContrastText(canvasBg, mix(textPrimary, bleedSource, textTintMix * 0.52), 4.5);
  const textMuted = ensureContrastText(canvasBg, mix(textSecondary, bleedSource, textTintMix * 0.4), 3.8);

  const softnessCurve = Math.pow(softness, 1.34);
  const cardRadius = Math.round(lerp(0, 40, softnessCurve));
  const buttonRadiusBase =
    softness > 0.82
      ? Math.round(lerp(14, 999, Math.pow((softness - 0.82) / 0.18, 1.2)))
      : Math.round(lerp(0, 14, Math.pow(softness / 0.82, 0.9)));
  const inputRadiusBase =
    softness > 0.86
      ? Math.round(lerp(24, 999, Math.pow((softness - 0.86) / 0.14, 1.08)))
      : Math.round(lerp(0, 24, Math.pow(softness / 0.86, 0.96)));
  const buttonRadius = pillTargetSet.has('buttons') ? 999 : buttonRadiusBase;
  const inputRadius = pillTargetSet.has('inputs') ? 999 : inputRadiusBase;

  const zoneLevels = 1 + Math.round(zoning * 4);
  const zoneContrast = Number(lerp(0.01, 0.46, Math.pow(zoning, 0.82)).toFixed(3));
  const saturationPolicy = itemSaturation < 0.34 ? 'semanticOnly' : itemSaturation < 0.66 ? 'focused' : 'broad';
  const varianceLevel = variance < 0.34 ? 'low' : variance < 0.66 ? 'medium' : 'high';

  const materialBudget = clamp01(skeuo * (0.32 + (1 - flatness) * 0.68));
  const borderStyle: 'solid' | 'dashed' = 'solid';
  const borderWidth = Number(lerp(0, 0.92, Math.pow(wireframeMix, 0.88)).toFixed(2));
  const wireframeLineOpacity = Number(lerp(0, 0.3, Math.pow(wireframeMix, 0.84)).toFixed(3));
  const wireframeFillOpacity = Number(lerp(1, 0.62, Math.pow(wireframeMix, 0.8)).toFixed(3));
  const gradientStrength = Number((visualRangeMix * (0.45 + materialBudget * 0.22) * (1 - wireframeMix * 0.62)).toFixed(3));
  const styleBevelMult =
    controls.skeuomorphismStyle === 'neomorphic'
      ? 1.26
      : controls.skeuomorphismStyle === 'glass'
        ? 0.72
        : controls.skeuomorphismStyle === 'glow'
          ? 0.66
          : controls.skeuomorphismStyle === 'embossed'
            ? 1.42
            : 1;
  const styleGlossMult =
    controls.skeuomorphismStyle === 'glass'
      ? 1.62
      : controls.skeuomorphismStyle === 'glow'
        ? 1.34
        : controls.skeuomorphismStyle === 'embossed'
          ? 0.58
          : 1;
  const styleShadowMult =
    controls.skeuomorphismStyle === 'neomorphic'
      ? 1.18
      : controls.skeuomorphismStyle === 'glass'
        ? 0.74
        : controls.skeuomorphismStyle === 'glow'
          ? 1.44
          : controls.skeuomorphismStyle === 'embossed'
            ? 1.08
            : 0.9;
  const bevelStrength = Number((materialBudget * (0.34 + gradientStrength * 0.52) * styleBevelMult).toFixed(3));
  const glossStrength = Number((materialBudget * (0.2 + gradientStrength * 0.64) * styleGlossMult).toFixed(3));
  const innerShadowStrength = Number((materialBudget * (0.16 + wireframeMix * 0.24) * (controls.skeuomorphismStyle === 'glass' ? 0.48 : 1.08)).toFixed(3));
  const shadowStrength = Number(lerp(0.01, controls.skeuomorphismStyle === 'glow' ? 0.24 : 0.11, materialBudget * styleShadowMult).toFixed(3));
  const highlightStrength = Number(lerp(0.02, 0.26, materialBudget * (controls.skeuomorphismStyle === 'glow' ? 1.24 : 0.96)).toFixed(3));
  const gradientBase = activeAccents[0] || primary;
  const gradientNeighborA = shiftHue(gradientBase, 24, 1.06, 0.02);
  const gradientNeighborB = shiftHue(gradientBase, -26, 1.02, -0.02);
  const gradientFrom = mix(gradientNeighborA, primary, 0.26 + visualRangeMix * 0.28);
  const gradientMid = mix(primary, activeAccents[1] || gradientNeighborB, 0.32 + variance * 0.28);
  const gradientTo = mix(gradientNeighborB, activeAccents[0] || primary, 0.36 + visualRangeMix * 0.34);

  const shadowColor =
    controls.skeuomorphismStyle === 'glow'
      ? mix('#111827', shiftHue(bleedSource, 16, 1.02, -0.06), 0.12 + visualRangeMix * 0.24)
      : mix('#0f172a', shiftHue(bleedSource, 12, 0.95, -0.1), 0.12 + visualRangeMix * 0.22);
  const shadowAccent =
    controls.skeuomorphismStyle === 'glow'
      ? mix('#facc15', shiftHue(gradientBase, 38, 1.18, 0.12), 0.56)
      : mix(shiftHue(gradientBase, 18, 1.02, -0.08), '#0f172a', 0.58 - visualRangeMix * 0.1);
  const shadowHighlight = mix('#ffffff', shiftHue(gradientBase, -22, 0.26, 0.26), 0.22 + glossStrength * 0.42);
  const shadowRgb = toRgb(shadowColor);
  const shadowAccentRgb = toRgb(shadowAccent);
  const shadowTopRgb = toRgb(shadowHighlight);
  const shadowX = Math.round(lerp(0, controls.skeuomorphismStyle === 'neomorphic' ? 4 : 2, materialBudget));
  const shadowY = Math.round(1 + shadowStrength * 10);
  const shadowBlur = Math.round(4 + shadowStrength * 14);
  const accentY = Math.round(shadowY * lerp(0.75, 1.25, visualRangeMix));
  const accentBlur = Math.round(shadowBlur * lerp(0.78, 1.18, visualRangeMix));
  const topYOffset = -Math.round(1 + glossStrength * 7);
  const topBlur = Math.round(2 + glossStrength * 14);
  const shadow = [
    `0 ${shadowY}px ${shadowBlur}px rgba(${shadowRgb.r},${shadowRgb.g},${shadowRgb.b},${(0.035 + shadowStrength * 0.12).toFixed(3)})`,
    `${shadowX}px ${accentY}px ${accentBlur}px rgba(${shadowAccentRgb.r},${shadowAccentRgb.g},${shadowAccentRgb.b},${(
      0.02 + shadowStrength * (controls.skeuomorphismStyle === 'glow' ? 0.34 : 0.11)
    ).toFixed(3)})`,
    `0 ${topYOffset}px ${topBlur}px rgba(${shadowTopRgb.r},${shadowTopRgb.g},${shadowTopRgb.b},${(0.04 + glossStrength * 0.24).toFixed(3)})`,
  ].join(', ');

  const neutralItemAnchor = mix(separatorBase, '#94a3b8', 0.56);
  const applyItemSaturation = (color: string, index: number): string => {
    const safeColor = normalizeHex(color, primary);
    if (itemSaturation < 0.2) {
      return mix(safeColor, neutralItemAnchor, lerp(0.9, 0.62, itemSaturation / 0.2));
    }
    if (itemSaturation < 0.55) {
      const t = (itemSaturation - 0.2) / 0.35;
      return mix(safeColor, '#ffffff', lerp(0.38, 0.14, t + index * 0.03));
    }
    const t = (itemSaturation - 0.55) / 0.45;
    return mix(safeColor, '#111827', lerp(0.02, 0.18, t));
  };
  const itemPalette = varianceScopedPalette.length ? varianceScopedPalette : [primary];
  const saturatedItems = uniqueColors(itemPalette.map((color, idx) => applyItemSaturation(color, idx)));
  const primaryItemColor = saturatedItems[0] || applyItemSaturation(primary, 0);
  const accentItemColors = saturatedItems.slice(1);
  const itemColors = [primaryItemColor, ...accentItemColors].slice(0, 6);
  const itemTextColors = itemColors.map((color) => ensureContrastText(color, '#ffffff', 4.5));

  const accentButtonCandidate = accentItemColors[0] || activeAccents[0] || primaryItemColor;
  const buttonBgBase = variance >= 0.6 ? accentButtonCandidate : primaryItemColor;
  const buttonBg = wireframeMix > 0.75 ? mix(buttonBgBase, surfaceBg, 0.45) : buttonBgBase;
  const buttonText = ensureContrastText(buttonBg, '#ffffff', 4.5);
  const deriveActionOnSurfaces = (
    surfacesHex: string[],
    desiredBgHex: string,
    opts?: {
      tonalOnBold?: boolean;
    },
  ) => {
    const surfaces = surfacesHex.length
      ? surfacesHex.map((surfaceHex) => normalizeHex(surfaceHex, '#0f172a'))
      : ['#0f172a'];
    const desired = normalizeHex(desiredBgHex, '#3b82f6');
    const surfaceAvg = surfaces.reduce((acc, s) => mix(acc, s, 0.5), surfaces[0] || '#0f172a');
    if (opts?.tonalOnBold) {
      let bg = mix(surfaceAvg, '#0f172a', 0.2);
      let separation = Math.min(...surfaces.map((surface) => contrastRatio(bg, surface)));
      if (separation < 1.05) {
        bg = mix(surfaceAvg, '#0f172a', 0.3);
        separation = Math.min(...surfaces.map((surface) => contrastRatio(bg, surface)));
      }
      if (separation < 1.05) {
        bg = mix(surfaceAvg, '#ffffff', 0.12);
      }
      return {
        bg,
        text: ensureContrastText(bg, '#ffffff', 4.5),
        border: 'transparent',
      };
    }
    const desiredText = ensureContrastText(desired, '#ffffff', 4.5);
    const desiredSurfaceContrast = Math.min(...surfaces.map((surface) => contrastRatio(desired, surface)));
    let bg = desired;
    let text = desiredText;
    let surfaceContrast = desiredSurfaceContrast;
    if (surfaceContrast < 1.02) {
      const lighter = mix(desired, '#ffffff', 0.24);
      const darker = mix(desired, '#0f172a', 0.22);
      const lighterContrast = Math.min(...surfaces.map((surface) => contrastRatio(lighter, surface)));
      const darkerContrast = Math.min(...surfaces.map((surface) => contrastRatio(darker, surface)));
      bg = lighterContrast >= darkerContrast ? lighter : darker;
      text = ensureContrastText(bg, '#ffffff', 4.5);
      surfaceContrast = Math.max(lighterContrast, darkerContrast);
    }
    const borderEdge = ensureContrastText(surfaceAvg, bg, surfaceContrast < 1.2 ? 2.6 : 1.8);
    return {
      bg,
      text,
      border: mix(bg, borderEdge, surfaceContrast < 1.2 ? 0.52 : 0.3),
    };
  };
  const topSurfaceRef = String(topNavBg).startsWith('linear-gradient') ? topGradientRef : normalizeHex(topNavBg, panelBg);
  const leftSurfaceRef = String(leftNavBg).startsWith('linear-gradient') ? leftGradientRef : normalizeHex(leftNavBg, surfaceBg);
  const useTonalNavActions = boldIntent >= 0.5 && boldZonePolicy !== 'neutral';
  const unifiedNavAction = deriveActionOnSurfaces([topSurfaceRef, leftSurfaceRef], buttonBg, { tonalOnBold: useTonalNavActions });

  const darkCfg = controls.darkMode;
  const darkPrimaryAuto = mix(primary, '#93c5fd', 0.26);
  const darkAccentAuto = activeAccents[0] ? mix(activeAccents[0], '#c4b5fd', 0.24) : shiftHue(darkPrimaryAuto, 28, 1.02, 0.06);
  const darkPrimary = darkCfg.useOverrides ? normalizeHex(darkCfg.primary, darkPrimaryAuto) : darkPrimaryAuto;
  const darkAccent = darkCfg.useOverrides ? normalizeHex(darkCfg.accent, darkAccentAuto) : darkAccentAuto;
  const darkCanvasAuto = mix('#020617', darkPrimary, 0.08 + bleed * 0.16);
  const darkSurfaceAuto = mix('#0b1220', darkPrimary, 0.12 + bleed * 0.12);
  const darkPanelAuto = mix(darkSurfaceAuto, darkAccent, 0.16 + zoning * 0.2);
  const darkSeparatorAuto = mix('#334155', darkPrimary, 0.12 + bleed * 0.12);
  const darkCanvasBg = darkCfg.useOverrides ? normalizeHex(darkCfg.canvasBg, darkCanvasAuto) : darkCanvasAuto;
  const darkSurfaceBg = darkCfg.useOverrides ? normalizeHex(darkCfg.surfaceBg, darkSurfaceAuto) : darkSurfaceAuto;
  const darkPanelBg = darkCfg.useOverrides ? normalizeHex(darkCfg.panelBg, darkPanelAuto) : darkPanelAuto;
  const darkSeparator = darkCfg.useOverrides ? normalizeHex(darkCfg.separator, darkSeparatorAuto) : darkSeparatorAuto;
  const darkTextPrimary = ensureContrastText(
    darkCanvasBg,
    darkCfg.useOverrides ? normalizeHex(darkCfg.textPrimary, '#f8fafc') : '#f8fafc',
    7,
  );
  const darkTextSecondary = ensureContrastText(
    darkCanvasBg,
    darkCfg.useOverrides ? normalizeHex(darkCfg.textSecondary, '#cbd5e1') : '#cbd5e1',
    4.5,
  );
  const darkTextMuted = ensureContrastText(
    darkCanvasBg,
    darkCfg.useOverrides ? normalizeHex(darkCfg.textMuted, '#94a3b8') : '#94a3b8',
    3.2,
  );
  const darkTopNavBgAuto =
    boldZonePolicy === 'mediaBacked'
      ? `linear-gradient(132deg, ${mix(darkPrimary, '#020617', 0.35)}, ${darkAccent}, ${mix(darkPrimary, '#ffffff', 0.06)})`
      : mix('#0b1225', darkPrimary, 0.24 + boldZoneCoverage * 0.24);
  const darkLeftNavBgAuto =
    boldZonePolicy === 'mediaBacked'
      ? `linear-gradient(180deg, ${mix(darkPrimary, '#020617', 0.42)}, ${mix(darkAccent, '#0f172a', 0.22)})`
      : mix('#0f172a', darkPrimary, 0.2 + boldZoneCoverage * 0.2);
  const darkTopNavBg =
    darkCfg.useOverrides && !String(darkTopNavBgAuto).startsWith('linear-gradient')
      ? normalizeHex(darkCfg.panelBg, darkTopNavBgAuto)
      : darkTopNavBgAuto;
  const darkLeftNavBg =
    darkCfg.useOverrides && !String(darkLeftNavBgAuto).startsWith('linear-gradient')
      ? normalizeHex(darkCfg.surfaceBg, darkLeftNavBgAuto)
      : darkLeftNavBgAuto;
  const darkTopNavText = ensureContrastText(
    String(darkTopNavBg).startsWith('linear-gradient') ? mix(darkPrimary, darkAccent, 0.5) : darkTopNavBg,
    '#f8fafc',
    4.5,
  );
  const darkLeftNavText = ensureContrastText(
    String(darkLeftNavBg).startsWith('linear-gradient') ? mix(darkPrimary, '#0f172a', 0.36) : darkLeftNavBg,
    '#f8fafc',
    4.5,
  );
  const darkContentBg = mix(darkCanvasBg, darkPanelBg, clamp01(0.22 + zoneContrast * 0.5));
  const darkCardBg = mix(darkSurfaceBg, darkPanelBg, clamp01(0.26 + zoning * 0.42));
  const darkButtonAuto = variance >= 0.6 ? mix(darkAccent, darkPrimary, 0.36) : mix(darkPrimary, darkAccent, 0.16);
  const darkButtonBg = darkCfg.useOverrides ? normalizeHex(darkCfg.buttonBg, darkButtonAuto) : darkButtonAuto;
  const darkButtonText = ensureContrastText(darkButtonBg, '#ffffff', 4.5);
  const darkTopSurfaceRef = String(darkTopNavBg).startsWith('linear-gradient') ? mix(darkPrimary, darkAccent, 0.5) : normalizeHex(darkTopNavBg, darkPanelBg);
  const darkLeftSurfaceRef =
    String(darkLeftNavBg).startsWith('linear-gradient') ? mix(darkPrimary, '#0f172a', 0.36) : normalizeHex(darkLeftNavBg, darkSurfaceBg);
  const darkUnifiedNavAction = deriveActionOnSurfaces([darkTopSurfaceRef, darkLeftSurfaceRef], darkButtonBg, {
    tonalOnBold: useTonalNavActions,
  });
  const darkItemColors = itemColors
    .map((color, idx) => {
      const anchor = idx === 0 ? darkPrimary : darkAccent;
      return mix(color, anchor, 0.28);
    })
    .slice(0, 6);
  const darkItemTextColors = darkItemColors.map((color) => ensureContrastText(color, '#ffffff', 4.5));
  const darkGradientFrom = mix(gradientFrom, darkPrimary, 0.46);
  const darkGradientMid = mix(gradientMid, darkAccent, 0.52);
  const darkGradientTo = mix(gradientTo, darkPrimary, 0.44);
  const darkShadowColor = mix(shadowColor, '#020617', 0.66);
  const darkShadowAccent = mix(shadowAccent, darkAccent, 0.42);
  const darkShadowHighlight = mix(shadowHighlight, '#94a3b8', 0.24);
  const darkShadowRgb = toRgb(darkShadowColor);
  const darkShadowAccentRgb = toRgb(darkShadowAccent);
  const darkTopShadowRgb = toRgb(darkShadowHighlight);
  const darkShadow = [
    `0 ${Math.max(1, shadowY - 1)}px ${Math.max(3, shadowBlur - 2)}px rgba(${darkShadowRgb.r},${darkShadowRgb.g},${darkShadowRgb.b},${(0.05 + shadowStrength * 0.14).toFixed(3)})`,
    `${Math.max(0, shadowX)}px ${Math.max(1, accentY - 1)}px ${Math.max(3, accentBlur - 2)}px rgba(${darkShadowAccentRgb.r},${darkShadowAccentRgb.g},${darkShadowAccentRgb.b},${(
      0.03 + shadowStrength * 0.22
    ).toFixed(3)})`,
    `0 ${Math.min(-1, topYOffset)}px ${Math.max(2, topBlur - 2)}px rgba(${darkTopShadowRgb.r},${darkTopShadowRgb.g},${darkTopShadowRgb.b},${(0.04 + glossStrength * 0.18).toFixed(3)})`,
  ].join(', ');

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
        ? `linear-gradient(160deg, ${mix(canvasBg, gradientFrom, gradientStrength * 0.28)}, ${mix(panelBg, gradientTo, gradientStrength * 0.4)})`
        : negativeZoneMode === 'texture'
          ? `radial-gradient(circle at 1px 1px, ${mix(separator, '#ffffff', 0.25)} 1px, transparent 1px), ${canvasBg}`
          : `linear-gradient(140deg, ${mix(gradientFrom, '#0f172a', 0.22)}, ${mix(gradientTo, '#ffffff', 0.14)})`;
  const contentBg = mix(canvasBg, panelBg, clamp01(0.03 + zoneContrast * 0.66));
  const cardBg = mix(wellSurface, panelBg, clamp01(0.12 + zoning * 0.54 + (zoneLevels - 1) * 0.035));

  const captionOpacity = Number(lerp(0.4, 0.88, typeContrast).toFixed(3));
  const labelOpacity = Number(lerp(0.56, 0.94, typeContrast).toFixed(3));
  const bodyOpacity = Number(lerp(0.76, 1, typeContrast).toFixed(3));
  const subduedOpacity = Number(lerp(0.34, 0.74, typeContrast).toFixed(3));

  return {
    typography: {
      fontFamily: baseFontFamily,
      headingFontFamily,
      decorativeFontFamily,
      varianceMode: controls.fontVariance,
      scale: Number(scale.toFixed(3)),
      contrast: Number(typeContrast.toFixed(3)),
      captionOpacity,
      labelOpacity,
      bodyOpacity,
      subduedOpacity,
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
      radiusXs: Math.max(0, Math.round(lerp(0, 4, Math.pow(softness, 1.62)))),
      radiusSm: Math.max(0, Math.round(lerp(0, 8, Math.pow(softness, 1.28)))),
      radiusMd: Math.max(0, Math.round(lerp(1, 14, Math.pow(softness, 1.04)))),
      radiusLg: Math.max(0, Math.round(lerp(3, 24, Math.pow(softness, 0.9)))),
      radiusXl: Math.max(0, Math.round(lerp(6, 36, Math.pow(softness, 0.8)))),
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
      itemColors,
      itemTextColors,
      neutrals: active.palette.neutral,
      semantic: active.palette.semantic,
      textOnPrimary: ensureContrastText(primary, '#ffffff', 4.5),
      textPrimary,
      textSecondary,
      textMuted,
      canvasBg,
      surfaceBg,
      panelBg: wellSurface,
      separator,
      tintAmount,
    },
    dark: {
      color: {
        primary: darkPrimary,
        accent: darkAccent,
        itemColors: darkItemColors,
        itemTextColors: darkItemTextColors,
        canvasBg: darkCanvasBg,
        surfaceBg: darkSurfaceBg,
        panelBg: darkPanelBg,
        separator: darkSeparator,
        textPrimary: darkTextPrimary,
        textSecondary: darkTextSecondary,
        textMuted: darkTextMuted,
      },
      preview: {
        topNavBg: darkTopNavBg,
        topNavText: darkTopNavText,
        topNavActionBg: darkUnifiedNavAction.bg,
        topNavActionText: darkUnifiedNavAction.text,
        topNavActionBorder: darkUnifiedNavAction.border,
        leftNavBg: darkLeftNavBg,
        leftNavText: darkLeftNavText,
        leftNavActionBg: darkUnifiedNavAction.bg,
        leftNavActionText: darkUnifiedNavAction.text,
        leftNavActionBorder: darkUnifiedNavAction.border,
        contentBg: darkContentBg,
        cardBg: darkCardBg,
        cardBorder: darkSeparator,
        buttonBg: darkButtonBg,
        buttonText: darkButtonText,
        focusColor: darkItemColors[1] || darkAccent || darkPrimary,
        shadow: darkShadow,
        shadowColor: darkShadowColor,
        shadowAccent: darkShadowAccent,
        shadowHighlight: darkShadowHighlight,
        gradientFrom: darkGradientFrom,
        gradientMid: darkGradientMid,
        gradientTo: darkGradientTo,
      },
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
      topNavActionBg: unifiedNavAction.bg,
      topNavActionText: unifiedNavAction.text,
      topNavActionBorder: unifiedNavAction.border,
      leftNavBg,
      leftNavText,
      leftNavActionBg: unifiedNavAction.bg,
      leftNavActionText: unifiedNavAction.text,
      leftNavActionBorder: unifiedNavAction.border,
      contentBg,
      cardBg,
      cardBorder: separator,
      buttonBg,
      buttonText,
      focusColor: itemColors[1] || activeAccents[0] || primary,
      shadow,
      shadowColor,
      shadowAccent,
      shadowHighlight,
      gradientFrom,
      gradientMid,
      gradientTo,
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
      headingFontFamily: String(foundationsSrc.headingFontFamily || '').trim() || undefined,
      decorativeFontFamily: String(foundationsSrc.decorativeFontFamily || '').trim() || undefined,
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
  lines.push(`Font variance mode: ${ds.controls.fontVariance}`);
  lines.push(`Forced pill targets: ${ds.controls.pillTargets.length ? ds.controls.pillTargets.join(', ') : 'none'}`);
  lines.push(`Heading font: ${derived.typography.headingFontFamily}`);
  lines.push(`Decorative font: ${derived.typography.decorativeFontFamily}`);
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
  lines.push(`Bold typography style: ${ds.controls.boldTypographyStyle}`);
  lines.push(`Bold gradient source: ${ds.controls.boldGradientSource}`);
  if (ds.controls.boldGradientSource === 'custom') {
    lines.push(`Bold gradient stops: ${ds.controls.boldGradientFrom} -> ${ds.controls.boldGradientMid} -> ${ds.controls.boldGradientTo}`);
  }
  lines.push(`Dark preview: ${ds.controls.darkMode.showPreview ? 'enabled' : 'disabled'}`);
  lines.push(`Dark overrides: ${ds.controls.darkMode.useOverrides ? 'custom' : 'auto'}`);
  if (uiRatio) {
    const breakdown = uiRatio.primitiveBreakdown || ratioBreakdownFromLegacy(uiRatio);
    lines.push(`UI ratio summary: neutral ${uiRatio.neutralPct}% · primary ${uiRatio.primaryPct}% · accent ${uiRatio.accentPct}%`);
    lines.push(`UI primitive breakdown: ${breakdown.map((b) => `${b.primitiveId}:${b.pct}%`).join(' · ')}`);
  }
  lines.push('');
  lines.push('Control bands:');
  lines.push(`- typography size growth: ${controlBand(ds.controls.typography.sizeGrowth)}`);
  lines.push(`- typography weight growth: ${controlBand(ds.controls.typography.weightGrowth)}`);
  lines.push(`- typography contrast: ${controlBand(ds.controls.typography.contrast)}`);
  lines.push(`- font variance: ${ds.controls.fontVariance}`);
  lines.push(`- pill targets: ${ds.controls.pillTargets.length ? ds.controls.pillTargets.join(', ') : 'none'}`);
  lines.push(`- spacing pattern: ${controlBand(ds.controls.spacing.pattern)}`);
  lines.push(`- spacing density: ${controlBand(ds.controls.spacing.density)}`);
  lines.push(`- flatness: ${controlBand(ds.controls.flatness)}`);
  lines.push(`- zoning: ${controlBand(ds.controls.zoning)}`);
  lines.push(`- softness: ${controlBand(ds.controls.softness)}`);
  lines.push(`- surface saturation: ${controlBand(ds.controls.surfaceSaturation)}`);
  lines.push(`- item saturation: ${controlBand(ds.controls.itemSaturation)}`);
  lines.push(`- color variance: ${controlBand(ds.controls.colorVariance)}`);
  lines.push(`- color bleed: ${controlBand(ds.controls.colorBleed)}`);
  lines.push(`- color bleed tone: ${ds.controls.colorBleedTone}`);
  lines.push(`- color bleed text: ${controlBand(ds.controls.colorBleedText)}`);
  lines.push(`- wireframe feeling: ${controlBand(ds.controls.wireframeFeeling)}`);
  lines.push(`- visual range: ${controlBand(ds.controls.visualRange)}`);
  lines.push(`- skeuomorphism: ${controlBand(ds.controls.skeuomorphism)}`);
  lines.push(`- skeuomorphism style: ${ds.controls.skeuomorphismStyle}`);
  lines.push(`- negative zone style: ${controlBand(ds.controls.negativeZoneStyle)}`);
  lines.push(`- boldness: ${controlBand(ds.controls.boldness)}`);
  lines.push(`- bold typography style: ${ds.controls.boldTypographyStyle}`);
  lines.push(`- bold gradient source: ${ds.controls.boldGradientSource}`);
  lines.push(`- dark preview: ${ds.controls.darkMode.showPreview ? 'enabled' : 'disabled'}`);
  lines.push(`- dark overrides: ${ds.controls.darkMode.useOverrides ? 'custom' : 'auto'}`);
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
