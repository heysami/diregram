import { randomUUID } from 'node:crypto';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { loadGridDoc, saveGridDoc, type GridDoc, type GridSheetV1 } from '@/lib/gridjson';
import { normalizeLayoutDirection } from '@/lib/layout-direction';
import { upsertHeader } from '@/lib/nexus-doc-header';
import {
  coerceVisionDesignSystem,
  defaultVisionDesignSystem,
  normalizeVisionDesignSystem,
  VISION_TAILWIND_PRIMITIVE_COLORS,
  type VisionColorRatioV1,
  type VisionDesignSystemV1,
} from '@/lib/vision-design-system';
import { loadVisionDoc, saveVisionDoc } from '@/lib/visionjson';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import { decryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';
import { isAsyncJobCancelRequested, updateAsyncJob } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import { queryProjectKbContext, runOpenAIResponsesText } from '@/lib/server/openai-responses';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';

type FileGenerationTask = {
  outputKind: 'note' | 'user_story_grid' | 'vision';
  fileName: string;
  prompt: string;
  artifactUrls: string[];
  artifactFiles: string[];
  artifactImages: Array<{ name: string; dataUrl: string }>;
};

function coerceOutputKind(input: unknown): FileGenerationTask['outputKind'] {
  if (input === 'vision') return 'vision';
  return input === 'user_story_grid' ? 'user_story_grid' : 'note';
}

type StoryRow = {
  title?: string;
  description?: string;
  actor?: string;
  goal?: string;
  benefit?: string;
  priority?: string;
  acceptanceCriteria?: string[] | string;
  tags?: string[] | string;
  estimate?: string;
  status?: string;
};

function parseJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    // fall through to bracket extraction
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const sliced = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(sliced);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeText(input: unknown): string {
  return String(input || '').trim();
}

function normalizeList(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((x) => normalizeText(x)).filter(Boolean);
  const one = normalizeText(input);
  if (!one) return [];
  return [one];
}

function coerceStringList(input: unknown, opts: { maxItems: number; maxCharsPerItem: number }): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => normalizeText(x).slice(0, opts.maxCharsPerItem))
    .filter(Boolean)
    .slice(0, opts.maxItems);
}

function coerceImageList(input: unknown, opts: { maxItems: number; maxCharsPerItem: number }): Array<{ name: string; dataUrl: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x, idx) => ({
      name: normalizeText(x.name).slice(0, 120) || `image-${idx + 1}`,
      dataUrl: normalizeText(x.dataUrl).slice(0, opts.maxCharsPerItem),
    }))
    .filter((x) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(x.dataUrl))
    .slice(0, opts.maxItems);
}

function clipText(input: string, maxChars: number): string {
  const t = String(input || '').trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1)}…`;
}

function normalizeWhitespace(input: string): string {
  return String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return String(input || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  const withoutScripts = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|header|footer|main|aside|h\d|li|tr|td|th|br)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ');
  const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(decodeHtmlEntities(noTags));
}

function markdownToText(markdown: string): string {
  const src = String(markdown || '');
  const withoutCode = src.replace(/```[\s\S]*?```/g, ' ');
  const withoutInlineCode = withoutCode.replace(/`([^`]+)`/g, '$1');
  const withoutImages = withoutInlineCode.replace(/!\[[^\]]*]\([^)]+\)/g, ' ');
  const withoutLinks = withoutImages.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const withoutMdDecor = withoutLinks.replace(/[*_>#~-]+/g, ' ');
  return normalizeWhitespace(withoutMdDecor);
}

function parseArtifactUrl(raw: string): string | null {
  const value = normalizeText(raw);
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  parsed.hash = '';
  return parsed.toString();
}

async function fetchUrlArtifactText(url: string): Promise<{ text: string; title: string; warning?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'DiregramBot/1.0 (+https://diregram.app)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
      },
    });
    if (!res.ok) {
      return { text: '', title: '', warning: `URL ${url}: fetch failed (${res.status})` };
    }
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const body = await res.text();
    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = normalizeWhitespace(decodeHtmlEntities(titleMatch?.[1] || ''));
    if (contentType.includes('text/html') || /<html[\s>]/i.test(body)) {
      return { text: clipText(htmlToText(body), 7000), title };
    }
    if (contentType.startsWith('text/')) {
      return { text: clipText(normalizeWhitespace(body), 7000), title };
    }
    return { text: '', title, warning: `URL ${url}: unsupported content-type ${contentType || 'unknown'}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Failed');
    return { text: '', title: '', warning: `URL ${url}: ${clipText(msg, 200)}` };
  } finally {
    clearTimeout(timeout);
  }
}

type ArtifactFileMeta = { id: string; name: string; kind: string | null };
type ArtifactResourceMeta = { id: string; name: string; kind: string | null };
type ArtifactCatalog = {
  files: ArtifactFileMeta[];
  resources: ArtifactResourceMeta[];
};

function lowerKey(input: string): string {
  return normalizeText(input).toLowerCase();
}

function matchByRef<T extends { id: string; name: string }>(list: T[], ref: string): T | null {
  const normalized = normalizeText(ref);
  if (!normalized) return null;
  const idMatch = list.find((item) => item.id === normalized);
  if (idMatch) return idMatch;
  const key = lowerKey(normalized);
  const exactMatches = list.filter((item) => lowerKey(item.name) === key);
  if (exactMatches.length === 1) return exactMatches[0]!;
  if (exactMatches.length > 1) return exactMatches[0]!;
  const containsMatches = list.filter((item) => lowerKey(item.name).includes(key));
  if (containsMatches.length === 1) return containsMatches[0]!;
  return null;
}

async function loadArtifactCatalog(input: {
  admin: ReturnType<typeof getAdminSupabaseClient>;
  projectFolderId: string;
}): Promise<ArtifactCatalog> {
  const [filesRes, resourcesRes] = await Promise.all([
    input.admin.from('files').select('id,name,kind').eq('folder_id', input.projectFolderId).limit(1500),
    input.admin.from('project_resources').select('id,name,kind').eq('project_folder_id', input.projectFolderId).limit(1500),
  ]);
  if (filesRes.error) throw new Error(filesRes.error.message);
  if (resourcesRes.error) throw new Error(resourcesRes.error.message);
  const files = ((filesRes.data || []) as Array<{ id?: unknown; name?: unknown; kind?: unknown }>)
    .map((row) => ({
      id: normalizeText(row.id),
      name: normalizeText(row.name),
      kind: normalizeText(row.kind) || null,
    }))
    .filter((row) => row.id && row.name);
  const resources = ((resourcesRes.data || []) as Array<{ id?: unknown; name?: unknown; kind?: unknown }>)
    .map((row) => ({
      id: normalizeText(row.id),
      name: normalizeText(row.name),
      kind: normalizeText(row.kind) || null,
    }))
    .filter((row) => row.id && row.name);
  return { files, resources };
}

async function resolveArtifactFileReferences(input: {
  admin: ReturnType<typeof getAdminSupabaseClient>;
  projectFolderId: string;
  refs: string[];
  catalog: ArtifactCatalog;
}): Promise<{ snippets: Array<{ source: string; text: string }>; warnings: string[] }> {
  const warnings: string[] = [];
  const fileIds = new Set<string>();
  const resourceIds = new Set<string>();
  const uniqueRefs = Array.from(new Set(input.refs.map((r) => normalizeText(r)).filter(Boolean)));
  for (const ref of uniqueRefs) {
    const file = matchByRef(input.catalog.files, ref);
    if (file) {
      fileIds.add(file.id);
      continue;
    }
    const resource = matchByRef(input.catalog.resources, ref);
    if (resource) {
      resourceIds.add(resource.id);
      continue;
    }
    warnings.push(`File reference not found: "${ref}"`);
  }

  const snippets: Array<{ source: string; text: string }> = [];
  if (fileIds.size > 0) {
    const ids = Array.from(fileIds);
    const { data, error } = await input.admin
      .from('files')
      .select('id,name,kind,content')
      .eq('folder_id', input.projectFolderId)
      .in('id', ids);
    if (error) throw new Error(error.message);
    const rows = (data || []) as Array<{ id?: unknown; name?: unknown; kind?: unknown; content?: unknown }>;
    for (const row of rows) {
      const name = normalizeText(row.name) || normalizeText(row.id) || 'Unnamed file';
      const kind = normalizeText(row.kind) || 'file';
      const text = clipText(markdownToText(normalizeText(row.content)), 7000);
      if (!text) continue;
      snippets.push({ source: `Project file (${kind}): ${name}`, text });
    }
  }

  if (resourceIds.size > 0) {
    const ids = Array.from(resourceIds);
    const { data, error } = await input.admin
      .from('project_resources')
      .select('id,name,kind,markdown')
      .eq('project_folder_id', input.projectFolderId)
      .in('id', ids);
    if (error) throw new Error(error.message);
    const rows = (data || []) as Array<{ id?: unknown; name?: unknown; kind?: unknown; markdown?: unknown }>;
    for (const row of rows) {
      const name = normalizeText(row.name) || normalizeText(row.id) || 'Unnamed resource';
      const kind = normalizeText(row.kind) || 'resource';
      const text = clipText(markdownToText(normalizeText(row.markdown)), 7000);
      if (!text) continue;
      snippets.push({ source: `Project resource (${kind}): ${name}`, text });
    }
  }

  return { snippets, warnings };
}

function primitiveIdAllowlistText(): string {
  return VISION_TAILWIND_PRIMITIVE_COLORS.map((p) => p.id).join(', ');
}

function normalizeStyleRatios(ratios: unknown): VisionColorRatioV1[] | null {
  if (!Array.isArray(ratios)) return null;
  const out: VisionColorRatioV1[] = [];
  for (const row of ratios) {
    const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const scopeRaw = normalizeText(r.scope);
    const scope = scopeRaw === 'icons' || scopeRaw === 'images' || scopeRaw === 'all' ? scopeRaw : 'ui';
    out.push({
      scope,
      neutralPct: Math.max(0, Math.min(100, Math.round(Number(r.neutralPct || 0)))),
      primaryPct: Math.max(0, Math.min(100, Math.round(Number(r.primaryPct || 0)))),
      accentPct: Math.max(0, Math.min(100, Math.round(Number(r.accentPct || 0)))),
      semanticPct: Math.max(0, Math.min(100, Math.round(Number(r.semanticPct || 0)))),
    });
  }
  return out.length ? out : null;
}

function mergeControlsWithDefaults(
  base: VisionDesignSystemV1['controls'],
  incoming: unknown,
): VisionDesignSystemV1['controls'] {
  const src = incoming && typeof incoming === 'object' ? (incoming as Record<string, unknown>) : {};
  const typography = src.typography && typeof src.typography === 'object' ? (src.typography as Record<string, unknown>) : {};
  const spacing = src.spacing && typeof src.spacing === 'object' ? (src.spacing as Record<string, unknown>) : {};
  const darkMode = src.darkMode && typeof src.darkMode === 'object' ? (src.darkMode as Record<string, unknown>) : {};
  return {
    ...base,
    ...(src as Partial<VisionDesignSystemV1['controls']>),
    typography: {
      ...base.typography,
      ...(typography as Partial<VisionDesignSystemV1['controls']['typography']>),
    },
    spacing: {
      ...base.spacing,
      ...(spacing as Partial<VisionDesignSystemV1['controls']['spacing']>),
    },
    darkMode: {
      ...base.darkMode,
      ...(darkMode as Partial<VisionDesignSystemV1['controls']['darkMode']>),
    },
  };
}

function mergeFoundationsWithDefaults(
  base: VisionDesignSystemV1['foundations'],
  incoming: unknown,
): VisionDesignSystemV1['foundations'] {
  const src = incoming && typeof incoming === 'object' ? (incoming as Record<string, unknown>) : {};
  const merged = { ...base } as VisionDesignSystemV1['foundations'];
  const fontFamily = normalizeText(src.fontFamily);
  const headingFontFamily = normalizeText(src.headingFontFamily);
  const decorativeFontFamily = normalizeText(src.decorativeFontFamily);
  if (fontFamily) merged.fontFamily = fontFamily;
  if (headingFontFamily) merged.headingFontFamily = headingFontFamily;
  if (decorativeFontFamily) merged.decorativeFontFamily = decorativeFontFamily;
  if (Array.isArray((src as { imageProfiles?: unknown }).imageProfiles)) {
    merged.imageProfiles = (src as { imageProfiles?: VisionDesignSystemV1['foundations']['imageProfiles'] }).imageProfiles || [];
  }
  if (!Array.isArray((src as { imageProfiles?: unknown }).imageProfiles)) {
    merged.imageProfiles = base.imageProfiles;
  }
  return merged;
}

function extractVisionDesignSystemCandidate(parsed: Record<string, unknown> | null): VisionDesignSystemV1 | null {
  if (!parsed) return null;
  const src =
    parsed.designSystem && typeof parsed.designSystem === 'object'
      ? (parsed.designSystem as Record<string, unknown>)
      : parsed;

  const base = defaultVisionDesignSystem();
  const mergedCandidate: Record<string, unknown> = {
    ...src,
    version: 1,
    foundations: mergeFoundationsWithDefaults(base.foundations, src.foundations),
    controls: mergeControlsWithDefaults(base.controls, src.controls),
  };
  if (!Array.isArray(src.scenarios) && src.scenario && typeof src.scenario === 'object') {
    mergedCandidate.scenarios = [src.scenario];
    if (!normalizeText(src.activeScenarioId)) mergedCandidate.activeScenarioId = 'base';
  }
  const direct = coerceVisionDesignSystem(mergedCandidate);
  if (direct) return normalizeVisionDesignSystem(direct);

  const draft = JSON.parse(JSON.stringify(base)) as VisionDesignSystemV1;
  const foundations = src.foundations && typeof src.foundations === 'object' ? (src.foundations as Record<string, unknown>) : {};
  if (foundations.fontFamily) draft.foundations.fontFamily = normalizeText(foundations.fontFamily);
  if (foundations.headingFontFamily) draft.foundations.headingFontFamily = normalizeText(foundations.headingFontFamily);
  if (foundations.decorativeFontFamily) draft.foundations.decorativeFontFamily = normalizeText(foundations.decorativeFontFamily);
  if (Array.isArray(foundations.imageProfiles) && foundations.imageProfiles.length) {
    draft.foundations.imageProfiles = foundations.imageProfiles
      .slice(0, 4)
      .map((row, idx) => {
        const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        return {
          id: normalizeText(r.id) || `image-profile-${idx + 1}`,
          name: normalizeText(r.name) || `Image profile ${idx + 1}`,
          style: normalizeText(r.style),
          lighting: normalizeText(r.lighting),
          lineWeight: normalizeText(r.lineWeight),
          notes: normalizeText(r.notes),
          placeholder: normalizeText(r.placeholder),
        };
      })
      .filter((p) => p.name || p.style || p.lighting || p.lineWeight);
  }

  const scenarioSrc =
    src.scenario && typeof src.scenario === 'object'
      ? (src.scenario as Record<string, unknown>)
      : Array.isArray(src.scenarios) && src.scenarios[0] && typeof src.scenarios[0] === 'object'
        ? (src.scenarios[0] as Record<string, unknown>)
        : null;
  if (scenarioSrc) {
    const scenario = draft.scenarios[0];
    if (scenario) {
      scenario.name = normalizeText(scenarioSrc.name) || scenario.name;
      const pairingsSrc =
        scenarioSrc.palette && typeof scenarioSrc.palette === 'object'
          ? (scenarioSrc.palette as Record<string, unknown>).pairings
          : scenarioSrc.pairings;
      if (pairingsSrc && typeof pairingsSrc === 'object') {
        const p = pairingsSrc as Record<string, unknown>;
        const primaryPrimitive = normalizeText(p.primaryPrimitive);
        const accentPrimitives = coerceStringList(p.accentPrimitives, { maxItems: 4, maxCharsPerItem: 32 });
        const neutralPrimitives = coerceStringList(p.neutralPrimitives, { maxItems: 5, maxCharsPerItem: 32 });
        const semanticPrimitives = p.semanticPrimitives && typeof p.semanticPrimitives === 'object' ? (p.semanticPrimitives as Record<string, unknown>) : {};
        const primitiveOverridesSrc = p.primitiveOverrides && typeof p.primitiveOverrides === 'object' ? (p.primitiveOverrides as Record<string, unknown>) : {};
        const primitiveOverrides: Record<string, string> = {};
        Object.entries(primitiveOverridesSrc).forEach(([k, v]) => {
          const key = lowerKey(k);
          const value = normalizeText(v).toLowerCase();
          if (!key || !/^#[0-9a-f]{6}$/.test(value)) return;
          primitiveOverrides[key] = value;
        });
        scenario.palette.pairings = {
          ...(primaryPrimitive ? { primaryPrimitive } : null),
          accentPrimitives,
          neutralPrimitives,
          semanticPrimitives: {
            ...(normalizeText(semanticPrimitives.success) ? { success: normalizeText(semanticPrimitives.success) } : null),
            ...(normalizeText(semanticPrimitives.warning) ? { warning: normalizeText(semanticPrimitives.warning) } : null),
            ...(normalizeText(semanticPrimitives.error) ? { error: normalizeText(semanticPrimitives.error) } : null),
            ...(normalizeText(semanticPrimitives.info) ? { info: normalizeText(semanticPrimitives.info) } : null),
          },
          ...(Object.keys(primitiveOverrides).length ? { primitiveOverrides } : null),
        };
      }
      const ratios = normalizeStyleRatios(scenarioSrc.ratios);
      if (ratios) scenario.ratios = ratios;
    }
  }

  if (src.controls && typeof src.controls === 'object') {
    draft.controls = mergeControlsWithDefaults(draft.controls, src.controls);
  }

  const merged = coerceVisionDesignSystem({ ...draft, version: 1 });
  return merged ? normalizeVisionDesignSystem(merged) : null;
}

function isBarebonesDesignSystem(spec: VisionDesignSystemV1): boolean {
  const ds = normalizeVisionDesignSystem(spec);
  const c = ds.controls;
  const numericSignals = [
    c.typography.sizeGrowth,
    c.typography.weightGrowth,
    c.typography.contrast,
    c.spacing.pattern,
    c.spacing.density,
    c.spacing.aroundVsInside,
    c.flatness,
    c.zoning,
    c.softness,
    c.surfaceSaturation,
    c.itemSaturation,
    c.colorVariance,
    c.colorBleed,
    c.wireframeFeeling,
    c.visualRange,
    c.skeuomorphism,
    c.negativeZoneStyle,
    c.boldness,
    c.colorBleedText,
  ];
  const zeroCount = numericSignals.filter((v) => Number.isFinite(v) && Math.round(Number(v)) === 0).length;
  const active = ds.scenarios.find((s) => s.id === ds.activeScenarioId) || ds.scenarios[0];
  const pairings = active?.palette?.pairings;
  const hasPairings = Boolean(pairings?.primaryPrimitive || (pairings?.accentPrimitives || []).length || (pairings?.neutralPrimitives || []).length);
  return zeroCount >= 12 || (zeroCount >= 9 && !hasPairings);
}

type VisionStyleAnchors = {
  fontFamily?: string;
  headingFontFamily?: string;
  decorativeFontFamily?: string;
  spacingTone?: 'compact' | 'balanced' | 'spacious';
  roundnessTone?: 'sharp' | 'balanced' | 'rounded' | 'pill';
  spacing?: {
    pattern?: number;
    density?: number;
    aroundVsInside?: number;
  };
  softness?: number;
};

function parseVisionStyleAnchors(parsed: Record<string, unknown> | null): VisionStyleAnchors | null {
  if (!parsed) return null;
  const spacing = parsed.spacing && typeof parsed.spacing === 'object' ? (parsed.spacing as Record<string, unknown>) : {};
  const spacingToneRaw = normalizeText(parsed.spacingTone).toLowerCase();
  const roundnessToneRaw = normalizeText(parsed.roundnessTone).toLowerCase();
  const spacingTone =
    spacingToneRaw === 'compact' || spacingToneRaw === 'spacious' || spacingToneRaw === 'balanced'
      ? (spacingToneRaw as VisionStyleAnchors['spacingTone'])
      : undefined;
  const roundnessTone =
    roundnessToneRaw === 'sharp' || roundnessToneRaw === 'rounded' || roundnessToneRaw === 'pill' || roundnessToneRaw === 'balanced'
      ? (roundnessToneRaw as VisionStyleAnchors['roundnessTone'])
      : undefined;
  const anchors: VisionStyleAnchors = {
    fontFamily: normalizeText(parsed.fontFamily) || undefined,
    headingFontFamily: normalizeText(parsed.headingFontFamily) || undefined,
    decorativeFontFamily: normalizeText(parsed.decorativeFontFamily) || undefined,
    spacingTone,
    roundnessTone,
    spacing: {
      pattern: Number.isFinite(Number(spacing.pattern)) ? Math.max(0, Math.min(100, Math.round(Number(spacing.pattern)))) : undefined,
      density: Number.isFinite(Number(spacing.density)) ? Math.max(0, Math.min(100, Math.round(Number(spacing.density)))) : undefined,
      aroundVsInside: Number.isFinite(Number(spacing.aroundVsInside))
        ? Math.max(0, Math.min(100, Math.round(Number(spacing.aroundVsInside))))
        : undefined,
    },
    softness: Number.isFinite(Number(parsed.softness)) ? Math.max(0, Math.min(100, Math.round(Number(parsed.softness)))) : undefined,
  };
  const hasValue =
    Boolean(anchors.fontFamily) ||
    Boolean(anchors.headingFontFamily) ||
    Boolean(anchors.decorativeFontFamily) ||
    Boolean(anchors.spacingTone) ||
    Boolean(anchors.roundnessTone) ||
    Number.isFinite(anchors.spacing?.pattern) ||
    Number.isFinite(anchors.spacing?.density) ||
    Number.isFinite(anchors.spacing?.aroundVsInside) ||
    Number.isFinite(anchors.softness);
  return hasValue ? anchors : null;
}

function spacingFromTone(tone: VisionStyleAnchors['spacingTone']): { pattern: number; density: number; aroundVsInside: number } | null {
  if (tone === 'compact') return { pattern: 24, density: 72, aroundVsInside: 40 };
  if (tone === 'spacious') return { pattern: 58, density: 28, aroundVsInside: 70 };
  if (tone === 'balanced') return { pattern: 38, density: 46, aroundVsInside: 56 };
  return null;
}

function softnessFromTone(tone: VisionStyleAnchors['roundnessTone']): number | null {
  if (tone === 'sharp') return 12;
  if (tone === 'balanced') return 38;
  if (tone === 'rounded') return 64;
  if (tone === 'pill') return 88;
  return null;
}

function applyVisionStyleAnchors(
  spec: VisionDesignSystemV1,
  anchors: VisionStyleAnchors | null,
): VisionDesignSystemV1 {
  if (!anchors) return normalizeVisionDesignSystem(spec);
  const baseDefault = defaultVisionDesignSystem();
  const draft = JSON.parse(JSON.stringify(normalizeVisionDesignSystem(spec))) as VisionDesignSystemV1;

  if (anchors.fontFamily && (!normalizeText(draft.foundations.fontFamily) || draft.foundations.fontFamily === baseDefault.foundations.fontFamily)) {
    draft.foundations.fontFamily = anchors.fontFamily;
  }
  if (
    anchors.headingFontFamily &&
    (!normalizeText(draft.foundations.headingFontFamily || '') || draft.foundations.headingFontFamily === baseDefault.foundations.headingFontFamily)
  ) {
    draft.foundations.headingFontFamily = anchors.headingFontFamily;
  }
  if (
    anchors.decorativeFontFamily &&
    (!normalizeText(draft.foundations.decorativeFontFamily || '') || draft.foundations.decorativeFontFamily === baseDefault.foundations.decorativeFontFamily)
  ) {
    draft.foundations.decorativeFontFamily = anchors.decorativeFontFamily;
  }

  const spacingToneValues = spacingFromTone(anchors.spacingTone);
  const spacingPattern = Number.isFinite(anchors.spacing?.pattern) ? Number(anchors.spacing?.pattern) : spacingToneValues?.pattern;
  const spacingDensity = Number.isFinite(anchors.spacing?.density) ? Number(anchors.spacing?.density) : spacingToneValues?.density;
  const spacingAroundVsInside = Number.isFinite(anchors.spacing?.aroundVsInside)
    ? Number(anchors.spacing?.aroundVsInside)
    : spacingToneValues?.aroundVsInside;

  const spacingLooksDefault =
    Math.abs(draft.controls.spacing.pattern - baseDefault.controls.spacing.pattern) <= 4 &&
    Math.abs(draft.controls.spacing.density - baseDefault.controls.spacing.density) <= 4 &&
    Math.abs(draft.controls.spacing.aroundVsInside - baseDefault.controls.spacing.aroundVsInside) <= 4;

  if (spacingLooksDefault) {
    if (Number.isFinite(spacingPattern)) draft.controls.spacing.pattern = Math.max(0, Math.min(100, Math.round(spacingPattern || 0)));
    if (Number.isFinite(spacingDensity)) draft.controls.spacing.density = Math.max(0, Math.min(100, Math.round(spacingDensity || 0)));
    if (Number.isFinite(spacingAroundVsInside)) {
      draft.controls.spacing.aroundVsInside = Math.max(0, Math.min(100, Math.round(spacingAroundVsInside || 0)));
    }
  }

  const softFromTone = softnessFromTone(anchors.roundnessTone);
  const softValue = Number.isFinite(anchors.softness) ? Number(anchors.softness) : softFromTone;
  const softnessLooksDefault = Math.abs(draft.controls.softness - baseDefault.controls.softness) <= 4;
  if (softnessLooksDefault && Number.isFinite(softValue)) {
    draft.controls.softness = Math.max(0, Math.min(100, Math.round(softValue || 0)));
  }

  return normalizeVisionDesignSystem(draft);
}

function isDefaultLikeColorSystem(spec: VisionDesignSystemV1): boolean {
  const ds = normalizeVisionDesignSystem(spec);
  const active = ds.scenarios.find((s) => s.id === ds.activeScenarioId) || ds.scenarios[0];
  if (!active) return false;
  const pairings = active.palette.pairings;
  const primaryPrimitive = String(pairings?.primaryPrimitive || '').trim();
  const accentPrimitives = (pairings?.accentPrimitives || []).slice(0, 3).map((x) => String(x || '').trim());
  const uiRatio = active.ratios.find((r) => r.scope === 'ui' || r.scope === 'all') || active.ratios[0];
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  const ratioLooksDefault =
    !!uiRatio &&
    near(Number(uiRatio.neutralPct || 0), 74, 10) &&
    near(Number(uiRatio.primaryPct || 0), 16, 10) &&
    near(Number(uiRatio.accentPct || 0), 6, 8);
  const controlsLooksDefault =
    near(ds.controls.surfaceSaturation, 18, 10) &&
    near(ds.controls.itemSaturation, 52, 10) &&
    near(ds.controls.colorVariance, 34, 10) &&
    near(ds.controls.colorBleed, 20, 10);
  const pairingLooksDefault = primaryPrimitive === 'blue-600' && accentPrimitives.includes('violet-600');
  return pairingLooksDefault && ratioLooksDefault && controlsLooksDefault;
}

function cloneVisionDesignSystem(spec: VisionDesignSystemV1): VisionDesignSystemV1 {
  return JSON.parse(JSON.stringify(normalizeVisionDesignSystem(spec))) as VisionDesignSystemV1;
}

function mergeColorPassDesignSystem(base: VisionDesignSystemV1, incoming: VisionDesignSystemV1): VisionDesignSystemV1 {
  const draft = cloneVisionDesignSystem(base);
  const src = normalizeVisionDesignSystem(incoming);
  draft.activeScenarioId = src.activeScenarioId;
  draft.scenarios = src.scenarios;
  draft.foundations.imageProfiles = src.foundations.imageProfiles;
  draft.controls.surfaceSaturation = src.controls.surfaceSaturation;
  draft.controls.itemSaturation = src.controls.itemSaturation;
  draft.controls.colorVariance = src.controls.colorVariance;
  draft.controls.colorBleed = src.controls.colorBleed;
  draft.controls.colorBleedTone = src.controls.colorBleedTone;
  draft.controls.colorBleedCustom = src.controls.colorBleedCustom;
  draft.controls.colorBleedText = src.controls.colorBleedText;
  draft.controls.boldness = src.controls.boldness;
  draft.controls.boldTypographyStyle = src.controls.boldTypographyStyle;
  draft.controls.boldGradientSource = src.controls.boldGradientSource;
  draft.controls.boldGradientFrom = src.controls.boldGradientFrom;
  draft.controls.boldGradientMid = src.controls.boldGradientMid;
  draft.controls.boldGradientTo = src.controls.boldGradientTo;
  draft.controls.darkMode = { ...src.controls.darkMode };
  return normalizeVisionDesignSystem(draft);
}

function mergeDensityShapePassDesignSystem(base: VisionDesignSystemV1, incoming: VisionDesignSystemV1): VisionDesignSystemV1 {
  const draft = cloneVisionDesignSystem(base);
  const src = normalizeVisionDesignSystem(incoming);
  draft.controls.pillTargets = [...src.controls.pillTargets];
  draft.controls.spacing = { ...src.controls.spacing };
  draft.controls.flatness = src.controls.flatness;
  draft.controls.zoning = src.controls.zoning;
  draft.controls.softness = src.controls.softness;
  draft.controls.wireframeFeeling = src.controls.wireframeFeeling;
  draft.controls.visualRange = src.controls.visualRange;
  draft.controls.skeuomorphism = src.controls.skeuomorphism;
  draft.controls.skeuomorphismStyle = src.controls.skeuomorphismStyle;
  draft.controls.negativeZoneStyle = src.controls.negativeZoneStyle;
  return normalizeVisionDesignSystem(draft);
}

function mergeTypographyPassDesignSystem(base: VisionDesignSystemV1, incoming: VisionDesignSystemV1): VisionDesignSystemV1 {
  const draft = cloneVisionDesignSystem(base);
  const src = normalizeVisionDesignSystem(incoming);
  draft.foundations.fontFamily = src.foundations.fontFamily;
  draft.foundations.headingFontFamily = src.foundations.headingFontFamily;
  draft.foundations.decorativeFontFamily = src.foundations.decorativeFontFamily;
  draft.controls.fontVariance = src.controls.fontVariance;
  draft.controls.typography = { ...src.controls.typography };
  return normalizeVisionDesignSystem(draft);
}

async function extractVisionStyleAnchors(input: {
  prompt: string;
  contextText: string;
  artifactContext: string;
  artifactImages: Array<{ name: string; dataUrl: string }>;
  apiKey: string;
  chatModel?: string;
}): Promise<VisionStyleAnchors | null> {
  const imageNotes = input.artifactImages.map((img, idx) => `${idx + 1}. ${img.name}`).join('\n');
  const userContent: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' }> = [
    {
      type: 'input_text',
      text: [
        `Goal prompt:\n${input.prompt || '(none)'}`,
        `\nProject KB context:\n${clipText(input.contextText || '(none)', 10000)}`,
        `\nArtifacts:\n${clipText(input.artifactContext || '(none)', 18000)}`,
        `\nUploaded images:\n${imageNotes || '(none)'}`,
      ].join('\n'),
    },
    ...input.artifactImages.map((img) => ({
      type: 'input_image' as const,
      image_url: img.dataUrl,
      detail: 'low' as const,
    })),
  ];
  const text = await runOpenAIResponsesText(
    [
      {
        role: 'system',
        content: [
          'Return ONLY JSON, no markdown.',
          'Extract style anchors for typography, spacing rhythm, and roundness.',
          'Format:',
          '{"fontFamily":"...","headingFontFamily":"...","decorativeFontFamily":"...","spacingTone":"compact|balanced|spacious","roundnessTone":"sharp|balanced|rounded|pill","spacing":{"pattern":0-100,"density":0-100,"aroundVsInside":0-100},"softness":0-100}',
          'If uncertain, omit fields instead of guessing aggressively.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    { apiKey: input.apiKey, model: input.chatModel, withWebSearch: false },
  );
  return parseVisionStyleAnchors(parseJsonObject(text));
}

async function generateVisionDesignSystem(input: {
  prompt: string;
  contextText: string;
  artifactContext: string;
  artifactImages: Array<{ name: string; dataUrl: string }>;
  apiKey: string;
  chatModel?: string;
}): Promise<VisionDesignSystemV1> {
  const hasArtifacts = Boolean(normalizeText(input.artifactContext)) || input.artifactImages.length > 0;
  let styleAnchors: VisionStyleAnchors | null = null;
  try {
    styleAnchors = await extractVisionStyleAnchors({
      prompt: input.prompt,
      contextText: input.contextText,
      artifactContext: input.artifactContext,
      artifactImages: input.artifactImages,
      apiKey: input.apiKey,
      chatModel: input.chatModel,
    });
  } catch {
    styleAnchors = null;
  }

  const anchorHintText =
    styleAnchors && hasArtifacts
      ? [
          'STYLE ANCHORS (extracted from artifacts):',
          styleAnchors.fontFamily ? `- fontFamily: ${styleAnchors.fontFamily}` : '',
          styleAnchors.headingFontFamily ? `- headingFontFamily: ${styleAnchors.headingFontFamily}` : '',
          styleAnchors.decorativeFontFamily ? `- decorativeFontFamily: ${styleAnchors.decorativeFontFamily}` : '',
          styleAnchors.spacingTone ? `- spacingTone: ${styleAnchors.spacingTone}` : '',
          styleAnchors.roundnessTone ? `- roundnessTone: ${styleAnchors.roundnessTone}` : '',
          Number.isFinite(styleAnchors.spacing?.pattern) ? `- spacing.pattern: ${styleAnchors.spacing?.pattern}` : '',
          Number.isFinite(styleAnchors.spacing?.density) ? `- spacing.density: ${styleAnchors.spacing?.density}` : '',
          Number.isFinite(styleAnchors.spacing?.aroundVsInside) ? `- spacing.aroundVsInside: ${styleAnchors.spacing?.aroundVsInside}` : '',
          Number.isFinite(styleAnchors.softness) ? `- softness: ${styleAnchors.softness}` : '',
          'Reflect these anchors unless there is clear contradictory evidence in artifacts.',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  const primitiveIds = primitiveIdAllowlistText();
  const imageNotes = input.artifactImages.map((img, idx) => `${idx + 1}. ${img.name}`).join('\n');
  const baseUserContent: Array<
    { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' }
  > = [
    {
      type: 'input_text',
      text: [
        `Style goal prompt:\n${input.prompt || '(none provided)'}`,
        `\nProject KB context:\n${clipText(input.contextText || '(none)', 12000)}`,
        `\nArtifacts (ONLY these sources):\n${clipText(input.artifactContext || '(none)', 20000)}`,
        `\nUploaded artifact images (${input.artifactImages.length}):\n${imageNotes || '(none)'}`,
      ].join('\n'),
    },
    ...input.artifactImages.map((img) => ({
      type: 'input_image' as const,
      image_url: img.dataUrl,
      detail: 'low' as const,
    })),
  ];

  const commonSystemLines = [
    'Return ONLY JSON. No markdown fences.',
    'Task: Generate a Diregram Vision design system object (version:1) that copies style from provided artifacts.',
    'Required top-level shape: {"version":1,"activeScenarioId":"base","scenarios":[...],"foundations":{...},"controls":{...}}',
    'Use palette.pairings to specify primitive mapping and overrides.',
    'Allowed primitive ids:',
    primitiveIds,
    'INTERNAL RENDER CONTRACT (not user-visible):',
    '- Your JSON is inserted into markdown as visionjson.designSystem and mirrored in a vision-design-system block.',
    '- Diregram normalizes your object and derives rendered visuals from scenarios/foundations/controls.',
    '- Choose values for fidelity, not placeholder defaults.',
    'Pass outputs are merged by field ownership:',
    '- Color+visual pass owns scenario palette/ratios and color-related controls.',
    '- Density+shape pass owns spacing/roundness/material controls.',
    '- Typography pass owns fonts and type scale controls.',
  ];

  const runPass = async (opts: {
    passName: 'color_visual' | 'density_shape' | 'typography';
    focusLines: string[];
    currentMerged?: VisionDesignSystemV1 | null;
    previousAttempt?: string;
    extraSystem?: string;
  }): Promise<{ output: string; extracted: VisionDesignSystemV1 | null }> => {
    const passUserContent = [...baseUserContent];
    if (opts.currentMerged) {
      passUserContent.push({
        type: 'input_text',
        text: [
          'Current merged design system context (preserve non-focus fields):',
          clipText(JSON.stringify(normalizeVisionDesignSystem(opts.currentMerged)), 12000),
        ].join('\n'),
      });
    }
    if (opts.previousAttempt) {
      passUserContent.push({
        type: 'input_text',
        text: `Previous ${opts.passName} attempt was weak. Improve fidelity and keep every pass field explicit.\n\nPrevious JSON:\n${clipText(
          opts.previousAttempt,
          9000,
        )}`,
      });
    }

    const messages: Array<{ role: 'system' | 'user'; content: string | typeof baseUserContent }> = [
      { role: 'system', content: [...commonSystemLines, `Pass: ${opts.passName}`, ...opts.focusLines].join('\n') },
      ...(anchorHintText ? [{ role: 'system' as const, content: anchorHintText }] : []),
      ...(opts.extraSystem ? [{ role: 'system' as const, content: opts.extraSystem }] : []),
      { role: 'user', content: passUserContent },
    ];
    const output = await runOpenAIResponsesText(messages, {
      apiKey: input.apiKey,
      model: input.chatModel,
      withWebSearch: false,
    });
    return { output, extracted: extractVisionDesignSystemCandidate(parseJsonObject(output)) };
  };

  const colorFocusLines = [
    'PRIMARY GOAL: Match artifact color system and color-led visual tone.',
    'Keep one coherent base scenario with believable palette pairings and ratios.',
    'Fields that must be explicit in this pass:',
    '- activeScenarioId',
    '- scenarios[0].palette.pairings.{primaryPrimitive,accentPrimitives,neutralPrimitives,semanticPrimitives,primitiveOverrides}',
    '- scenarios[0].ratios[] (coherent neutral/primary/accent/semantic proportions)',
    '- controls.surfaceSaturation, itemSaturation, colorVariance, colorBleed, colorBleedTone, colorBleedCustom, colorBleedText, boldness',
    '- controls.boldTypographyStyle, boldGradientSource, boldGradientFrom, boldGradientMid, boldGradientTo',
    '- controls.darkMode.{showPreview,useOverrides,canvasBg,surfaceBg,panelBg,separator,textPrimary,textSecondary,textMuted,primary,accent,buttonBg}',
    '- foundations.imageProfiles[] to mirror visual language of artifacts',
    'Do not default to blue/violet templates unless artifacts explicitly show that family.',
  ];
  const densityFocusLines = [
    'PRIMARY GOAL: Match spacing rhythm, density, roundness, zoning, and material behavior.',
    'Fields that must be explicit in this pass:',
    '- controls.pillTargets',
    '- controls.spacing.{pattern,density,aroundVsInside}',
    '- controls.flatness, zoning, softness',
    '- controls.wireframeFeeling, visualRange',
    '- controls.skeuomorphism, skeuomorphismStyle',
    '- controls.negativeZoneStyle',
    'Preserve existing color scenario choices from current merged context.',
  ];
  const typographyFocusLines = [
    'PRIMARY GOAL: Match typography family, companion fonts, and scale behavior.',
    'Fields that must be explicit in this pass:',
    '- foundations.fontFamily, foundations.headingFontFamily, foundations.decorativeFontFamily',
    '- controls.fontVariance',
    '- controls.typography.{baseSizePx,baseWeight,sizeGrowth,weightGrowth,contrast}',
    'Use exact family naming where artifacts clearly suggest a font.',
    'Preserve existing scenario and color controls from current merged context.',
  ];

  const colorFirst = await runPass({ passName: 'color_visual', focusLines: colorFocusLines });
  let colorFinal = colorFirst;
  if (hasArtifacts && (!colorFinal.extracted || isDefaultLikeColorSystem(colorFinal.extracted))) {
    colorFinal = await runPass({
      passName: 'color_visual',
      focusLines: colorFocusLines,
      previousAttempt: colorFirst.output,
      extraSystem:
        'REVISION MODE: color mismatch detected. Force artifact palette fidelity first and avoid generic/default pairings.',
    });
  }

  let merged = colorFinal.extracted ? mergeColorPassDesignSystem(defaultVisionDesignSystem(), colorFinal.extracted) : defaultVisionDesignSystem();

  const densityFirst = await runPass({
    passName: 'density_shape',
    focusLines: densityFocusLines,
    currentMerged: merged,
  });
  let densityFinal = densityFirst;
  if (!densityFinal.extracted) {
    densityFinal = await runPass({
      passName: 'density_shape',
      focusLines: densityFocusLines,
      currentMerged: merged,
      previousAttempt: densityFirst.output,
      extraSystem: 'REVISION MODE: density/shape fields were missing or invalid. Return valid explicit control values.',
    });
  }
  if (densityFinal.extracted) {
    merged = mergeDensityShapePassDesignSystem(merged, densityFinal.extracted);
  }

  const typographyFirst = await runPass({
    passName: 'typography',
    focusLines: typographyFocusLines,
    currentMerged: merged,
  });
  let typographyFinal = typographyFirst;
  if (!typographyFinal.extracted) {
    typographyFinal = await runPass({
      passName: 'typography',
      focusLines: typographyFocusLines,
      currentMerged: merged,
      previousAttempt: typographyFirst.output,
      extraSystem: 'REVISION MODE: typography fields were missing or invalid. Return explicit fonts and type controls.',
    });
  }
  if (typographyFinal.extracted) {
    merged = mergeTypographyPassDesignSystem(merged, typographyFinal.extracted);
  }

  merged = applyVisionStyleAnchors(merged, styleAnchors);

  if (hasArtifacts && isDefaultLikeColorSystem(merged)) {
    const recovery = await runPass({
      passName: 'color_visual',
      focusLines: colorFocusLines,
      currentMerged: merged,
      extraSystem:
        'EMERGENCY COLOR RECOVERY: final output still looks default/template. Replace palette/ratios with artifact-faithful values.',
    });
    if (recovery.extracted && !isDefaultLikeColorSystem(recovery.extracted)) {
      merged = mergeColorPassDesignSystem(merged, recovery.extracted);
    }
  }

  const finalized = normalizeVisionDesignSystem(merged);
  if (isBarebonesDesignSystem(finalized)) {
    throw new Error('AI returned a barebones Vision design system after multi-pass generation.');
  }
  return finalized;
}

function storyRowsToGridMarkdown(stories: StoryRow[]): string {
  const HEADER = [
    'Story Title',
    'Description',
    'Actor',
    'Goal',
    'Benefit',
    'Priority',
    'Acceptance Criteria',
    'Tags',
    'Estimate',
    'Status',
  ];

  let markdown = makeStarterGridMarkdown();
  const loaded = loadGridDoc(markdown);
  const doc = loaded.doc as GridDoc;
  const sheet: GridSheetV1 | null = (doc.sheets || [])[0] || null;
  if (!sheet) return markdown;

  const neededRows = Math.max(2, stories.length + 1);
  const neededCols = HEADER.length;
  while ((sheet.grid.rows || []).length < neededRows) {
    const next = (sheet.grid.rows || []).length + 1;
    (sheet.grid.rows || []).push({ id: `r-${next}`, height: 22 });
  }
  while ((sheet.grid.columns || []).length < neededCols) {
    const next = (sheet.grid.columns || []).length + 1;
    (sheet.grid.columns || []).push({ id: `c-${next}`, width: 88 });
  }

  const rows = sheet.grid.rows || [];
  const cols = sheet.grid.columns || [];
  const cells = { ...(sheet.grid.cells || {}) };
  const headerRowId = rows[0]?.id || 'r-1';
  HEADER.forEach((h, i) => {
    const colId = cols[i]?.id;
    if (!colId) return;
    cells[`${headerRowId}:${colId}`] = { value: h };
  });

  stories.forEach((s, idx) => {
    const rowId = rows[idx + 1]?.id;
    if (!rowId) return;
    const values = [
      normalizeText(s.title),
      normalizeText(s.description),
      normalizeText(s.actor),
      normalizeText(s.goal),
      normalizeText(s.benefit),
      normalizeText(s.priority),
      normalizeList(s.acceptanceCriteria).join('\n- '),
      normalizeList(s.tags).join(', '),
      normalizeText(s.estimate),
      normalizeText(s.status),
    ];
    values.forEach((v, colIdx) => {
      const colId = cols[colIdx]?.id;
      if (!colId) return;
      const key = `${rowId}:${colId}`;
      if (!v) {
        delete cells[key];
      } else {
        cells[key] = { value: v };
      }
    });
  });

  sheet.grid.cells = cells;
  sheet.grid.tables = [
    {
      id: 'tbl-1',
      rowIds: rows.slice(0, neededRows).map((r) => r.id),
      colIds: cols.slice(0, neededCols).map((c) => c.id),
      headerRows: 1,
      headerCols: 0,
      footerRows: 0,
    },
  ];

  markdown = saveGridDoc(markdown, doc);
  return upsertHeader(markdown, { kind: 'grid', version: 1 });
}

function normalizeNoteMarkdown(raw: string): string {
  const src = String(raw || '').trim();
  const md = src
    .replace(/^\s*```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  return upsertHeader((md || '# Untitled\n\n').trimEnd() + '\n', { kind: 'note', version: 1 });
}

async function generateNoteMarkdown(input: {
  prompt: string;
  contextText: string;
  apiKey: string;
  chatModel?: string;
}): Promise<string> {
  const text = await runOpenAIResponsesText(
    [
      {
        role: 'system',
        content:
          'Generate only markdown for a note. Do not wrap with code fences. Keep it concise, structured, and practical.',
      },
      {
        role: 'user',
        content: `Prompt:\n${input.prompt}\n\nProject KB context:\n${input.contextText || '(none)'}`,
      },
    ],
    { apiKey: input.apiKey, model: input.chatModel, withWebSearch: true },
  );
  return normalizeNoteMarkdown(text);
}

async function generateStories(input: {
  prompt: string;
  contextText: string;
  apiKey: string;
  chatModel?: string;
}): Promise<StoryRow[]> {
  const text = await runOpenAIResponsesText(
    [
      {
        role: 'system',
        content:
          'Return ONLY JSON: {"stories":[...]} with each story containing title, description, actor, goal, benefit, priority, acceptanceCriteria[], tags[], estimate, status.',
      },
      {
        role: 'user',
        content: `Prompt:\n${input.prompt}\n\nProject KB context:\n${input.contextText || '(none)'}`,
      },
    ],
    { apiKey: input.apiKey, model: input.chatModel, withWebSearch: true },
  );
  const parsed = parseJsonObject(text);
  const storiesRaw = Array.isArray(parsed?.stories) ? (parsed?.stories as unknown[]) : [];
  const stories = storiesRaw
    .map((s) => (s && typeof s === 'object' ? (s as StoryRow) : null))
    .filter((x): x is StoryRow => x !== null)
    .slice(0, 200);
  if (stories.length > 0) return stories;
  return [{ title: 'Generated story', description: normalizeText(text), status: 'draft' }];
}

async function buildVisionArtifactContext(input: {
  admin: ReturnType<typeof getAdminSupabaseClient>;
  projectFolderId: string;
  artifactUrls: string[];
  artifactFiles: string[];
  catalog: ArtifactCatalog;
}): Promise<{ context: string; warnings: string[] }> {
  const warnings: string[] = [];
  const blocks: string[] = [];

  const validUrls = Array.from(new Set(input.artifactUrls.map(parseArtifactUrl).filter((u): u is string => !!u))).slice(0, 8);
  for (const url of validUrls) {
    const out = await fetchUrlArtifactText(url);
    if (out.warning) warnings.push(out.warning);
    if (!out.text) continue;
    const title = out.title ? `title="${out.title}" ` : '';
    blocks.push(`[URL] ${title}${url}\n${out.text}`);
  }

  const fileOut = await resolveArtifactFileReferences({
    admin: input.admin,
    projectFolderId: input.projectFolderId,
    refs: input.artifactFiles.slice(0, 20),
    catalog: input.catalog,
  });
  warnings.push(...fileOut.warnings);
  fileOut.snippets.forEach((snippet) => {
    blocks.push(`[FILE] ${snippet.source}\n${snippet.text}`);
  });

  const context = clipText(blocks.join('\n\n'), 26000);
  return { context, warnings };
}

export async function runAiFileGenerationJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  const admin = getAdminSupabaseClient();
  const input = (job.input || {}) as Record<string, unknown>;
  const ownerId = String(input.ownerId || job.owner_id || '').trim();
  const projectFolderId = String(input.projectFolderId || job.project_folder_id || '').trim();
  const tasksRaw = Array.isArray(input.tasks) ? (input.tasks as unknown[]) : [];
  const chatModel = normalizeText(input.chatModel) || undefined;
  const embeddingModel = normalizeText(input.embeddingModel) || undefined;
  const requesterUserId = normalizeText(input.requestedBy || job.requester_user_id || '') || null;

  if (!ownerId) throw new Error('Missing ownerId');
  if (!projectFolderId) throw new Error('Missing projectFolderId');
  if (!tasksRaw.length) throw new Error('No tasks were provided');

  const openaiApiKey = decryptOpenAiApiKey(job.secret_payload) || String(process.env.OPENAI_API_KEY || '').trim();
  if (!openaiApiKey) throw new Error('Missing OpenAI API key');

  const tasks: FileGenerationTask[] = tasksRaw
    .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((t) => ({
      outputKind: coerceOutputKind(t.outputKind),
      fileName: normalizeText(t.fileName) || 'Untitled',
      prompt: normalizeText(t.prompt),
      artifactUrls: coerceStringList(t.artifactUrls, { maxItems: 8, maxCharsPerItem: 1000 }),
      artifactFiles: coerceStringList(t.artifactFiles, { maxItems: 20, maxCharsPerItem: 220 }),
      artifactImages: coerceImageList(t.artifactImages, { maxItems: 4, maxCharsPerItem: 1_000_000 }),
    }))
    .filter((t) => {
      if (t.outputKind === 'vision') {
        return Boolean(t.prompt) || Boolean(t.artifactUrls.length) || Boolean(t.artifactFiles.length) || Boolean(t.artifactImages.length);
      }
      return Boolean(t.prompt);
    })
    .slice(0, 20);
  if (!tasks.length) throw new Error('No valid tasks found');

  const { data: profile, error: profileErr } = await admin.from('profiles').select('default_layout_direction').eq('id', ownerId).maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  const defaultLayout = normalizeLayoutDirection((profile as { default_layout_direction?: unknown } | null)?.default_layout_direction);

  const createdFiles: Array<{ id: string; name: string; kind: 'note' | 'grid' | 'vision' }> = [];
  const errors: Array<{ index: number; task: string; message: string }> = [];
  let artifactCatalogPromise: Promise<ArtifactCatalog> | null = null;
  const getArtifactCatalog = async () => {
    if (!artifactCatalogPromise) {
      artifactCatalogPromise = loadArtifactCatalog({ admin, projectFolderId });
    }
    return await artifactCatalogPromise;
  };

  for (let i = 0; i < tasks.length; i += 1) {
    if (await isAsyncJobCancelRequested(job.id)) throw new Error('Job cancelled');
    const task = tasks[i]!;

    const progressStart = Math.floor((i / tasks.length) * 90);
    await updateAsyncJob(job.id, {
      step: `generating_${task.outputKind}`,
      progress_pct: Math.max(1, progressStart),
      state: { ...(job.state || {}), totalTasks: tasks.length, currentTaskIndex: i },
    });

    try {
      const { contextText } = await queryProjectKbContext({
        ownerId,
        projectFolderId,
        query: `${task.fileName}\n${task.prompt}`,
        topK: 8,
        apiKey: openaiApiKey,
        embeddingModel,
        admin,
      });

      let kind: 'note' | 'grid' | 'vision' = 'note';
      let content = '';
      if (task.outputKind === 'user_story_grid') {
        kind = 'grid';
        const stories = await generateStories({
          prompt: task.prompt,
          contextText,
          apiKey: openaiApiKey,
          chatModel,
        });
        content = storyRowsToGridMarkdown(stories);
      } else if (task.outputKind === 'vision') {
        kind = 'vision';
        const artifactCatalog = await getArtifactCatalog();
        const artifactResult = await buildVisionArtifactContext({
          admin,
          projectFolderId,
          artifactUrls: task.artifactUrls,
          artifactFiles: task.artifactFiles,
          catalog: artifactCatalog,
        });
        const artifactContext = [
          artifactResult.context,
          artifactResult.warnings.length ? `Artifact warnings:\n- ${artifactResult.warnings.join('\n- ')}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        const designSystem = await generateVisionDesignSystem({
          prompt: task.prompt,
          contextText,
          artifactContext,
          artifactImages: task.artifactImages,
          apiKey: openaiApiKey,
          chatModel,
        });
        const starter = makeStarterVisionMarkdown();
        const baseDoc = loadVisionDoc(starter).doc;
        const nextDoc =
          baseDoc.version === 2
            ? { ...baseDoc, designSystem, updatedAt: new Date().toISOString() }
            : { version: 2 as const, designSystem, updatedAt: new Date().toISOString() };
        content = saveVisionDoc(starter, nextDoc);
      } else {
        kind = 'note';
        content = await generateNoteMarkdown({
          prompt: task.prompt,
          contextText,
          apiKey: openaiApiKey,
          chatModel,
        });
      }

      const roomName = `file-${randomUUID()}`;
      const { data, error } = await admin
        .from('files')
        .insert({
          name: task.fileName.slice(0, 160),
          owner_id: ownerId,
          folder_id: projectFolderId,
          room_name: roomName,
          last_opened_at: new Date().toISOString(),
          layout_direction: defaultLayout,
          kind,
          content,
        } as never)
        .select('id,name,kind')
        .single();
      if (error) throw new Error(error.message);
      const row = (data || {}) as { id?: unknown; name?: unknown; kind?: unknown };
      createdFiles.push({
        id: String(row.id || ''),
        name: String(row.name || task.fileName),
        kind: row.kind === 'grid' ? 'grid' : row.kind === 'vision' ? 'vision' : 'note',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e || 'Failed');
      errors.push({ index: i, task: task.fileName, message: message.slice(0, 400) });
    }

    const progressEnd = Math.floor(((i + 1) / tasks.length) * 95);
    await updateAsyncJob(job.id, {
      step: 'generating_files',
      progress_pct: Math.max(1, progressEnd),
      state: {
        ...(job.state || {}),
        totalTasks: tasks.length,
        completedTasks: i + 1,
        requesterUserId,
      },
    });
  }

  if (createdFiles.length === 0) {
    const msg = errors.length ? errors.map((x) => `${x.task}: ${x.message}`).join(' | ').slice(0, 2000) : 'No files were generated';
    throw new Error(msg);
  }

  return {
    ok: true,
    ownerId,
    projectFolderId,
    createdFiles,
    succeededCount: createdFiles.length,
    failedCount: errors.length,
    errors,
  };
}
