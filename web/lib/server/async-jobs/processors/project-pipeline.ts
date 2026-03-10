import { randomBytes, randomUUID } from 'node:crypto';
import { makeStarterDiagramMarkdown } from '@/lib/diagram-starter';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import { loadGridDoc, saveGridDoc, type GridDoc, type GridSheetV1 } from '@/lib/gridjson';
import { upsertHeader } from '@/lib/nexus-doc-header';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { extractRunningNumbersFromMarkdown } from '@/lib/node-running-numbers';
import { extractExpandedIdsFromMarkdown } from '@/lib/expanded-state-storage';
import {
  defaultVisionDesignSystem,
  normalizeVisionDesignSystem,
  VISION_TAILWIND_PRIMITIVE_COLORS,
  type VisionDesignSystemV1,
} from '@/lib/vision-design-system';
import { loadVisionDoc, saveVisionDoc } from '@/lib/visionjson';
import { validateNexusMarkdownImport } from '@/lib/markdown-import-validator';
import { runClaudeMessagesText } from '@/lib/server/anthropic-messages';
import { embedTextsOpenAI } from '@/lib/server/openai-embeddings';
import { queryProjectKbContext } from '@/lib/server/openai-responses';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { decryptSecretPayload } from '@/lib/server/async-jobs/crypto';
import { isAsyncJobCancelRequested, updateAsyncJob } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import { runRagIngestJob } from '@/lib/server/async-jobs/processors/rag';
import type {
  DiagramLinkRef,
  PipelineArtifactManifest,
  PipelineComponentGap,
  PipelineEpic,
  PipelineStory,
  SwarmAgentName,
} from '@/lib/project-pipeline-types';

type JsonRecord = Record<string, unknown>;

const MAX_UPLOADS = 50;
const MAX_UPLOAD_TEXT = 50_000;
const MAX_DIAGRAM_REPAIR_ATTEMPTS = 8;
const MAX_SWARM_RECOMMENDATIONS = 24;

const FLOW_MARKER_RE = /#flow#|#flowtab#|#systemflow#/;
const RN_RE = /<!--\s*rn:(\d+)\s*-->/;
const EXPID_RE = /<!--\s*expid:(\d+)\s*-->/;

type PipelineUploadInput = {
  objectPath: string;
  name: string;
  size: number;
  mimeType: string;
};

type AgentOutputRecord = {
  agent: SwarmAgentName;
  recommendations: Array<{
    id: string;
    title: string;
    detail: string;
    diagramRefs: DiagramLinkRef[];
  }>;
};

type PipelineSynthesis = {
  epics: PipelineEpic[];
  stories: PipelineStory[];
  designSystemBrief: string;
  componentGaps: PipelineComponentGap[];
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(input: unknown): string {
  return String(input || '').trim();
}

function clipText(input: unknown, maxChars: number): string {
  const t = normalizeText(input);
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars);
}

function parseJsonObject(text: string): JsonRecord | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : null;
  } catch {
    // pass
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function isLikelyTextFile(name: string, mimeType: string): boolean {
  const mime = normalizeText(mimeType).toLowerCase();
  const file = normalizeText(name).toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (mime.includes('json') || mime.includes('xml') || mime.includes('yaml')) return true;
  return /\.(md|txt|json|csv|tsv|xml|yaml|yml|html|htm|ts|tsx|js|jsx|css|scss|sql)$/i.test(file);
}

function safeFileName(name: string) {
  const raw = normalizeText(name) || 'file';
  return raw
    .replace(/\0/g, '')
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

function summarizeIssues(messages: string[], maxItems = 14): string {
  const unique = Array.from(new Set(messages.map((m) => normalizeText(m)).filter(Boolean))).slice(0, maxItems);
  return unique.map((m, i) => `${i + 1}. ${m}`).join('\n');
}

function ensureNodeLinkMarkers(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const separator = lines.findIndex((line) => line.trim() === '---');
  const nodeSectionEnd = separator === -1 ? lines.length : separator;

  const existingRn = extractRunningNumbersFromMarkdown(lines.join('\n'));
  const existingExp = extractExpandedIdsFromMarkdown(lines.join('\n'));
  let nextRn = 1;
  let nextExp = 1;
  existingRn.forEach((v) => {
    if (v >= nextRn) nextRn = v + 1;
  });
  existingExp.forEach((v) => {
    if (v >= nextExp) nextExp = v + 1;
  });

  let inFence = false;
  for (let i = 0; i < nodeSectionEnd; i += 1) {
    const line = lines[i] || '';
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed) continue;

    let nextLine = line.trimEnd();
    const hasRn = RN_RE.test(nextLine);
    const hasExp = EXPID_RE.test(nextLine);

    if (!hasRn) {
      nextLine = `${nextLine} <!-- rn:${nextRn} -->`;
      nextRn += 1;
    }

    if (!hasExp && FLOW_MARKER_RE.test(nextLine)) {
      nextLine = `${nextLine} <!-- expid:${nextExp} -->`;
      nextExp += 1;
    }

    lines[i] = nextLine;
  }

  return lines.join('\n').trimEnd() + '\n';
}

type FencedMarkdownBlock = {
  lang: string;
  body: string;
  closed: boolean;
};

function scanFencedMarkdownBlocks(text: string): FencedMarkdownBlock[] {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out: FencedMarkdownBlock[] = [];
  let openLang = '';
  let body: string[] | null = null;

  for (const line of lines) {
    const fence = line.match(/^\s*```([^\s`]*)\s*$/);
    if (!fence) {
      if (body) body.push(line);
      continue;
    }

    if (!body) {
      openLang = normalizeText(fence[1]).toLowerCase();
      body = [];
      continue;
    }

    out.push({
      lang: openLang,
      body: body.join('\n').trim(),
      closed: true,
    });
    openLang = '';
    body = null;
  }

  if (body) {
    out.push({
      lang: openLang,
      body: body.join('\n').trim(),
      closed: false,
    });
  }

  return out;
}

function preferredFencedBody(text: string): string {
  const blocks = scanFencedMarkdownBlocks(text).filter((b) => Boolean(normalizeText(b.body)));
  if (!blocks.length) return '';
  const score = (lang: string) => {
    if (lang === 'diregram') return 0;
    if (lang.includes('diregram')) return 1;
    if (lang === 'markdown' || lang === 'md') return 2;
    if (!lang) return 3;
    return 4;
  };
  const sorted = [...blocks].sort((a, b) => {
    const sa = score(a.lang);
    const sb = score(b.lang);
    if (sa !== sb) return sa - sb;
    if (a.closed !== b.closed) return a.closed ? -1 : 1;
    return b.body.length - a.body.length;
  });
  return normalizeText(sorted[0]?.body);
}

function stripFenceOnlyLines(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*```[^\n]*$/.test(line))
    .join('\n')
    .trim();
}

function sanitizeDiagramMarkdown(raw: string): string {
  let text = String(raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return makeStarterDiagramMarkdown();
  const fencedBody = preferredFencedBody(text);
  if (fencedBody) {
    text = fencedBody;
  }
  const unfenced = stripFenceOnlyLines(text);
  if (!unfenced) return makeStarterDiagramMarkdown();
  return ensureNodeLinkMarkers(unfenced);
}

function flattenNodes(roots: ReturnType<typeof parseNexusMarkdown>) {
  const out: ReturnType<typeof parseNexusMarkdown>[number][] = [];
  const visit = (node: ReturnType<typeof parseNexusMarkdown>[number]) => {
    out.push(node);
    if (node.isHub && node.variants) {
      node.variants.forEach((variant) => {
        out.push(variant);
        variant.children.forEach(visit);
      });
      return;
    }
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return out;
}

function buildDiagramLinkIndex(input: { diagramFileId: string; markdown: string }): DiagramLinkRef[] {
  const markdown = String(input.markdown || '');
  const nodes = flattenNodes(parseNexusMarkdown(markdown));
  const rnByLine = extractRunningNumbersFromMarkdown(markdown);
  const expByLine = extractExpandedIdsFromMarkdown(markdown);
  const seen = new Set<string>();

  return nodes
    .map((node) => {
      const rn = rnByLine.get(node.lineIndex);
      const expid = expByLine.get(node.lineIndex);
      const anchorKey = typeof rn === 'number' ? `rn:${rn}` : `line:${node.lineIndex}`;
      return {
        diagramFileId: input.diagramFileId,
        lineIndex: node.lineIndex,
        nodeId: node.id,
        runningNumber: typeof rn === 'number' ? rn : null,
        expid: typeof expid === 'number' ? expid : null,
        label: normalizeText(node.content) || normalizeText(node.rawContent) || node.id,
        anchorKey,
      } satisfies DiagramLinkRef;
    })
    .filter((ref) => {
      const key = `${ref.nodeId}|${ref.lineIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.lineIndex - b.lineIndex);
}

function toAnchorMap(linkIndex: DiagramLinkRef[]): Map<string, DiagramLinkRef> {
  const map = new Map<string, DiagramLinkRef>();
  linkIndex.forEach((ref) => {
    map.set(ref.anchorKey, ref);
    map.set(`line:${ref.lineIndex}`, ref);
    if (typeof ref.runningNumber === 'number') map.set(`rn:${ref.runningNumber}`, ref);
  });
  return map;
}

function normalizeRefs(refs: DiagramLinkRef[]): DiagramLinkRef[] {
  const seen = new Set<string>();
  const out: DiagramLinkRef[] = [];
  refs.forEach((ref) => {
    const key = `${ref.nodeId}|${ref.lineIndex}|${ref.anchorKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ref);
  });
  return out;
}

function chunkTextForEmbedding(text: string, maxChars = 2200, minTail = 650): string[] {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/g).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  lines.forEach((line) => {
    const next = cur ? `${cur}\n\n${line}` : line;
    if (next.length <= maxChars) {
      cur = next;
      return;
    }
    if (cur) out.push(cur);
    if (line.length <= maxChars) {
      cur = line;
      return;
    }
    let rest = line;
    while (rest.length > maxChars) {
      out.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars).trim();
    }
    cur = rest;
  });
  if (cur) out.push(cur);

  if (out.length >= 2 && out[out.length - 1]!.length < minTail) {
    const tail = out.pop()!;
    out[out.length - 1] = `${out[out.length - 1]}\n\n${tail}`.trim();
  }
  return out.filter(Boolean);
}

async function convertViaDocling(input: {
  userId: string;
  objectPath: string;
  originalFilename: string;
  admin: ReturnType<typeof getAdminSupabaseClient>;
}): Promise<string> {
  const base = String(process.env.DOCLING_SERVICE_URL || 'http://127.0.0.1:8686').replace(/\/+$/, '');
  const url = `${base}/convert`;
  const jobId = randomUUID();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      bucketId: 'docling-files',
      objectPath: input.objectPath,
      originalFilename: input.originalFilename,
      jobId,
      outputFormat: 'markdown',
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.detail || json.error || `Docling failed (${res.status})`));
  }
  const outputObjectPath = normalizeText(json.outputObjectPath);
  if (!outputObjectPath) throw new Error('Docling returned no output path');

  const { data: blob, error } = await input.admin.storage.from('docling-files').download(outputObjectPath);
  if (error) throw new Error(error.message);
  const markdown = await blob.text();

  try {
    await input.admin.storage.from('docling-files').remove([outputObjectPath]);
  } catch {
    // ignore cleanup failures
  }
  return clipText(markdown, MAX_UPLOAD_TEXT);
}

async function collectUploadTexts(input: {
  uploads: PipelineUploadInput[];
  requesterUserId: string;
  admin: ReturnType<typeof getAdminSupabaseClient>;
}): Promise<Array<{ name: string; objectPath: string; text: string }>> {
  const out: Array<{ name: string; objectPath: string; text: string }> = [];

  for (const upload of input.uploads.slice(0, MAX_UPLOADS)) {
    const { data: blob, error } = await input.admin.storage.from('docling-files').download(upload.objectPath);
    if (error) throw new Error(error.message);

    let text = '';
    if (isLikelyTextFile(upload.name, upload.mimeType)) {
      text = clipText(await blob.text(), MAX_UPLOAD_TEXT);
    } else {
      text = await convertViaDocling({
        userId: input.requesterUserId,
        objectPath: upload.objectPath,
        originalFilename: upload.name,
        admin: input.admin,
      });
    }

    out.push({
      name: safeFileName(upload.name),
      objectPath: upload.objectPath,
      text: clipText(text, MAX_UPLOAD_TEXT),
    });
  }

  return out;
}

async function generateSingleDiagram(input: {
  claudeApiKey: string;
  claudeModel?: string;
  uploadTexts: Array<{ name: string; text: string }>;
}): Promise<string> {
  const sourceText = input.uploadTexts
    .map((item, idx) => `## Source ${idx + 1}: ${item.name}\n${clipText(item.text, 40_000)}`)
    .join('\n\n');

  const system = [
    'You generate ONE Diregram diagram markdown file.',
    'Output only markdown (no prose, no code fences).',
    'Use 2-space indentation for hierarchy.',
    'Include one coherent comprehensive diagram so all downstream artifacts can link to it.',
    'Use #flow# where process nodes are needed.',
    'Do not output per-epic separate diagrams.',
  ].join('\n');

  let markdown = makeStarterDiagramMarkdown();
  const first = await runClaudeMessagesText({
    apiKey: input.claudeApiKey,
    model: input.claudeModel,
    system,
    maxTokens: 7200,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [
          'Create one comprehensive diagram from these uploaded sources.',
          'Ensure line-level linking anchors are possible.',
          '',
          sourceText || '(no upload text found)',
        ].join('\n'),
      },
    ],
  });
  markdown = sanitizeDiagramMarkdown(first);

  for (let attempt = 0; attempt < MAX_DIAGRAM_REPAIR_ATTEMPTS; attempt += 1) {
    const validation = validateNexusMarkdownImport(markdown);
    if (!validation.errors.length) return markdown;

    const localRepair = sanitizeDiagramMarkdown(markdown);
    if (localRepair !== markdown) {
      const localValidation = validateNexusMarkdownImport(localRepair);
      markdown = localRepair;
      if (!localValidation.errors.length) return markdown;
    }

    const errorSummary = summarizeIssues(validation.errors.map((x) => `${x.code}: ${x.message}`));
    const repaired = await runClaudeMessagesText({
      apiKey: input.claudeApiKey,
      model: input.claudeModel,
      maxTokens: 7200,
      temperature: 0.1,
      system: [
        'Repair the provided Diregram diagram markdown so it is import-valid.',
        'Do not remove major content unless required to fix parser/validator errors.',
        'Return ONLY corrected markdown. No code fences.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: [
            'Fix these validator issues:',
            errorSummary,
            '',
            'Markdown to repair:',
            markdown,
          ].join('\n'),
        },
      ],
    });
    markdown = sanitizeDiagramMarkdown(repaired);
  }

  const finalValidation = validateNexusMarkdownImport(markdown);
  if (finalValidation.errors.length) {
    throw new Error(
      `Diagram validation failed after repairs: ${summarizeIssues(finalValidation.errors.map((x) => `${x.code}: ${x.message}`))}`,
    );
  }
  return markdown;
}

function randomPublicId() {
  return `rag_${randomBytes(10).toString('base64url')}`;
}

async function ingestDiagramOnlyToRag(input: {
  ownerId: string;
  projectFolderId: string;
  diagramFileId: string;
  diagramMarkdown: string;
  openaiApiKey: string;
  embeddingModel?: string;
  admin: ReturnType<typeof getAdminSupabaseClient>;
}): Promise<{ chunks: number; publicProjectId: string }> {
  await input.admin.from('rag_chunks').delete().eq('owner_id', input.ownerId).eq('project_folder_id', input.projectFolderId);
  await input.admin.from('kg_entities').delete().eq('owner_id', input.ownerId).eq('project_folder_id', input.projectFolderId);
  await input.admin.from('kg_edges').delete().eq('owner_id', input.ownerId).eq('project_folder_id', input.projectFolderId);

  const chunks = chunkTextForEmbedding(input.diagramMarkdown);
  const embeddings = chunks.length
    ? await embedTextsOpenAI(chunks, {
        apiKey: input.openaiApiKey,
        model: input.embeddingModel,
      })
    : [];

  const rows = chunks.map((chunk, i) => ({
    owner_id: input.ownerId,
    id: `chunk:${input.diagramFileId}:seed:${i + 1}`,
    project_folder_id: input.projectFolderId,
    file_id: input.diagramFileId,
    resource_id: null,
    file_kind: 'diagram',
    anchor: `seed:${i + 1}`,
    text: chunk,
    embedding: embeddings[i],
    metadata: {
      fileId: input.diagramFileId,
      fileKind: 'diagram',
      anchor: `seed:${i + 1}`,
      projectFolderId: input.projectFolderId,
      source: 'project_pipeline_seed_diagram',
    },
  }));

  if (rows.length) {
    const { error } = await input.admin.from('rag_chunks').upsert(rows, { onConflict: 'owner_id,id' });
    if (error) throw new Error(error.message);
  }

  const existing = await input.admin
    .from('rag_projects')
    .select('public_id')
    .eq('owner_id', input.ownerId)
    .eq('project_folder_id', input.projectFolderId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const existingPublicId = normalizeText((existing.data as { public_id?: unknown } | null)?.public_id);
  const publicProjectId = existingPublicId || randomPublicId();
  const { error: upsertErr } = await input.admin.from('rag_projects').upsert(
    {
      owner_id: input.ownerId,
      project_folder_id: input.projectFolderId,
      public_id: publicProjectId,
      updated_at: nowIso(),
    } as never,
    { onConflict: 'owner_id,project_folder_id' },
  );
  if (upsertErr) throw new Error(upsertErr.message);

  return {
    chunks: rows.length,
    publicProjectId,
  };
}

function primitiveAllowlistText(): string {
  return VISION_TAILWIND_PRIMITIVE_COLORS.map((p) => p.id).join(', ');
}

function parseAnchorKeys(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((x) => normalizeText(x)).filter(Boolean).slice(0, 8);
  }
  const one = normalizeText(input);
  if (!one) return [];
  return [one];
}

function parseRecommendationRefs(input: unknown, anchors: Map<string, DiagramLinkRef>, fallback: DiagramLinkRef): DiagramLinkRef[] {
  const keys = Array.isArray(input)
    ? input
        .map((row) => {
          if (row && typeof row === 'object') {
            const obj = row as Record<string, unknown>;
            return normalizeText(obj.anchorKey || obj.anchor || obj.id);
          }
          return normalizeText(row);
        })
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const refs = keys
    .map((key) => anchors.get(key) || null)
    .filter((x): x is DiagramLinkRef => x !== null);
  if (refs.length) return normalizeRefs(refs);
  return [fallback];
}

async function runSwarmAgent(input: {
  agent: SwarmAgentName;
  claudeApiKey: string;
  claudeModel?: string;
  ownerId: string;
  projectFolderId: string;
  openaiApiKey: string;
  embeddingModel?: string;
  diagramLinkIndex: DiagramLinkRef[];
  diagramMarkdown: string;
}): Promise<AgentOutputRecord> {
  const fallbackRef = input.diagramLinkIndex[0];
  if (!fallbackRef) {
    throw new Error('Missing diagram references for swarm run.');
  }
  const anchors = toAnchorMap(input.diagramLinkIndex);
  const allowedAnchors = input.diagramLinkIndex
    .slice(0, 220)
    .map((ref) => `- ${ref.anchorKey} => line ${ref.lineIndex} | ${ref.label}`)
    .join('\n');

  const roleGuide: Record<SwarmAgentName, string> = {
    technical: 'Focus on architecture, integration, data/edge cases, technical feasibility and risks.',
    user_journey: 'Focus on end-to-end journey quality, actor transitions, friction and missing flow steps.',
    interaction: 'Focus on screen-by-screen interaction steps, transitions, states, and validation handling.',
    content: 'Focus on copy/content clarity, information hierarchy, and content dependencies.',
    ui_presentation: 'Focus on UI element choice, visual presentation fit, and component suitability.',
  };

  const kb = await queryProjectKbContext({
    ownerId: input.ownerId,
    projectFolderId: input.projectFolderId,
    query: `${input.agent} recommendations for single linked diagram`,
    topK: 12,
    apiKey: input.openaiApiKey,
    embeddingModel: input.embeddingModel,
  });

  const output = await runClaudeMessagesText({
    apiKey: input.claudeApiKey,
    model: input.claudeModel,
    temperature: 0.2,
    maxTokens: 3600,
    system: [
      'Return ONLY JSON.',
      'Schema:',
      '{"recommendations":[{"id":"...","title":"...","detail":"...","diagramRefs":[{"anchorKey":"rn:12"}]}]}',
      'Every recommendation MUST include at least one anchorKey in diagramRefs.',
      'Do not use anchors outside the provided allowlist.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `Agent role: ${input.agent}`,
          roleGuide[input.agent],
          '',
          'Allowed diagram anchors:',
          allowedAnchors || '(none)',
          '',
          'Diagram markdown excerpt:',
          clipText(input.diagramMarkdown, 18_000),
          '',
          'RAG context:',
          clipText(kb.contextText, 16_000) || '(none)',
          '',
          `Return up to ${MAX_SWARM_RECOMMENDATIONS} recommendations.`,
        ].join('\n'),
      },
    ],
  });

  const parsed = parseJsonObject(output);
  const rows = Array.isArray(parsed?.recommendations) ? (parsed?.recommendations as unknown[]) : [];
  const recommendations = rows
    .map((row, idx) => {
      const rec = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
      const id = normalizeText(rec.id) || `${input.agent}-${idx + 1}`;
      const title = clipText(rec.title, 200) || `Recommendation ${idx + 1}`;
      const detail = clipText(rec.detail, 2000) || 'Recommendation detail not provided.';
      const diagramRefs = parseRecommendationRefs(rec.diagramRefs, anchors, fallbackRef);
      return {
        id,
        title,
        detail,
        diagramRefs,
      };
    })
    .slice(0, MAX_SWARM_RECOMMENDATIONS);

  if (!recommendations.length) {
    return {
      agent: input.agent,
      recommendations: [
        {
          id: `${input.agent}-fallback-1`,
          title: `${input.agent} fallback recommendation`,
          detail: 'Model returned no valid recommendations; using fallback.',
          diagramRefs: [fallbackRef],
        },
      ],
    };
  }

  return { agent: input.agent, recommendations };
}

function normalizeStoryId(input: string, fallback: string): string {
  const cleaned = normalizeText(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function mapAnchorKeysToRefs(input: unknown, anchors: Map<string, DiagramLinkRef>, fallback: DiagramLinkRef): DiagramLinkRef[] {
  const keys = parseAnchorKeys(input);
  const refs = keys.map((k) => anchors.get(k) || null).filter((x): x is DiagramLinkRef => x !== null);
  if (refs.length) return normalizeRefs(refs);
  return [fallback];
}

async function synthesizePipeline(input: {
  claudeApiKey: string;
  claudeModel?: string;
  diagramLinkIndex: DiagramLinkRef[];
  diagramMarkdown: string;
  agentOutputs: AgentOutputRecord[];
}): Promise<PipelineSynthesis> {
  const fallbackRef = input.diagramLinkIndex[0];
  if (!fallbackRef) throw new Error('Missing diagram references for synthesis.');

  const anchors = toAnchorMap(input.diagramLinkIndex);
  const anchorList = input.diagramLinkIndex
    .slice(0, 220)
    .map((ref) => `${ref.anchorKey} | line=${ref.lineIndex} | ${ref.label}`)
    .join('\n');

  const agentsText = input.agentOutputs
    .map((agent) => {
      const rows = agent.recommendations
        .map((rec) => `- ${rec.title}: ${rec.detail}\n  refs=${rec.diagramRefs.map((x) => x.anchorKey).join(', ')}`)
        .join('\n');
      return `## ${agent.agent}\n${rows}`;
    })
    .join('\n\n');

  const out = await runClaudeMessagesText({
    apiKey: input.claudeApiKey,
    model: input.claudeModel,
    temperature: 0.2,
    maxTokens: 5200,
    system: [
      'Return ONLY JSON.',
      'Schema:',
      '{',
      '  "epics":[{"id":"...","title":"...","summary":"..."}],',
      '  "stories":[{"id":"...","epicId":"...","title":"...","description":"...","actor":"...","goal":"...","benefit":"...","priority":"high|medium|low","acceptanceCriteria":["..."],"uiElements":["..."],"diagramRefKeys":["rn:12"]}],',
      '  "designSystemBrief":"...",',
      '  "componentGaps":[{"id":"...","name":"...","purpose":"...","propsContract":["..."],"diagramRefKeys":["rn:12"]}]',
      '}',
      'Every story and every componentGap MUST include at least one diagramRefKey from the allowlist.',
      'Prefer concise but concrete content.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          'Single diagram source (excerpt):',
          clipText(input.diagramMarkdown, 18_000),
          '',
          'Allowed diagram anchors:',
          anchorList,
          '',
          'Swarm outputs:',
          agentsText,
        ].join('\n'),
      },
    ],
  });

  const parsed = parseJsonObject(out);
  const epicsRaw = Array.isArray(parsed?.epics) ? (parsed?.epics as unknown[]) : [];
  const storiesRaw = Array.isArray(parsed?.stories) ? (parsed?.stories as unknown[]) : [];
  const gapsRaw = Array.isArray(parsed?.componentGaps) ? (parsed?.componentGaps as unknown[]) : [];

  const epics: PipelineEpic[] = epicsRaw
    .map((row, idx) => {
      const r = row && typeof row === 'object' ? (row as JsonRecord) : {};
      const id = normalizeStoryId(normalizeText(r.id), `epic-${idx + 1}`);
      return {
        id,
        title: clipText(r.title, 180) || `Epic ${idx + 1}`,
        summary: clipText(r.summary, 1000) || '',
      };
    })
    .filter((x) => Boolean(x.id))
    .slice(0, 24);

  const epicIdFallback = epics[0]?.id || 'epic-1';

  const stories: PipelineStory[] = storiesRaw
    .map((row, idx) => {
      const r = row && typeof row === 'object' ? (row as JsonRecord) : {};
      const id = normalizeStoryId(normalizeText(r.id), `story-${idx + 1}`);
      const epicId = normalizeStoryId(normalizeText(r.epicId), epicIdFallback) || epicIdFallback;
      const acceptanceCriteria = Array.isArray(r.acceptanceCriteria)
        ? (r.acceptanceCriteria as unknown[]).map((x) => clipText(x, 240)).filter(Boolean).slice(0, 20)
        : [];
      const uiElements = Array.isArray(r.uiElements)
        ? (r.uiElements as unknown[]).map((x) => clipText(x, 140)).filter(Boolean).slice(0, 20)
        : [];
      const diagramRefs = mapAnchorKeysToRefs(r.diagramRefKeys, anchors, fallbackRef);
      return {
        id,
        epicId,
        title: clipText(r.title, 220) || `Story ${idx + 1}`,
        description: clipText(r.description, 2000),
        actor: clipText(r.actor, 120),
        goal: clipText(r.goal, 600),
        benefit: clipText(r.benefit, 600),
        priority: clipText(r.priority, 40) || 'medium',
        acceptanceCriteria,
        uiElements,
        diagramRefs,
      };
    })
    .slice(0, 260);

  const componentGaps: PipelineComponentGap[] = gapsRaw
    .map((row, idx) => {
      const r = row && typeof row === 'object' ? (row as JsonRecord) : {};
      const id = normalizeStoryId(normalizeText(r.id), `component-${idx + 1}`);
      const propsContract = Array.isArray(r.propsContract)
        ? (r.propsContract as unknown[]).map((x) => clipText(x, 140)).filter(Boolean).slice(0, 24)
        : [];
      const diagramRefs = mapAnchorKeysToRefs(r.diagramRefKeys, anchors, fallbackRef);
      return {
        id,
        name: clipText(r.name, 160) || `Component ${idx + 1}`,
        purpose: clipText(r.purpose, 1200),
        propsContract,
        diagramRefs,
      };
    })
    .slice(0, 60);

  if (!epics.length) {
    epics.push({ id: 'epic-1', title: 'Generated Epic', summary: 'Auto-generated from swarm recommendations.' });
  }
  if (!stories.length) {
    stories.push({
      id: 'story-1',
      epicId: epics[0]!.id,
      title: 'Generated Story',
      description: 'Pipeline fallback story due to empty synthesis.',
      actor: 'User',
      goal: 'Complete the workflow',
      benefit: 'Achieve expected outcome',
      priority: 'medium',
      acceptanceCriteria: ['Flow can be completed end-to-end.'],
      uiElements: ['Primary action button'],
      diagramRefs: [fallbackRef],
    });
  }

  return {
    epics,
    stories,
    designSystemBrief: clipText(parsed?.designSystemBrief, 3000),
    componentGaps,
  };
}

function storyRowsToGridMarkdown(stories: PipelineStory[], epicsById: Map<string, PipelineEpic>): string {
  const HEADER = [
    'Epic',
    'Story ID',
    'Story Title',
    'Description',
    'Actor',
    'Goal',
    'Benefit',
    'Priority',
    'Acceptance Criteria',
    'UI Elements',
    'Diagram Refs',
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
    (sheet.grid.columns || []).push({ id: `c-${next}`, width: 116 });
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

  stories.forEach((story, idx) => {
    const rowId = rows[idx + 1]?.id;
    if (!rowId) return;
    const epic = epicsById.get(story.epicId);
    const values = [
      epic?.title || story.epicId,
      story.id,
      story.title,
      story.description,
      story.actor,
      story.goal,
      story.benefit,
      story.priority,
      story.acceptanceCriteria.join('\n- '),
      story.uiElements.join(', '),
      story.diagramRefs.map((r) => r.anchorKey).join(', '),
    ];
    values.forEach((value, colIdx) => {
      const colId = cols[colIdx]?.id;
      if (!colId) return;
      const key = `${rowId}:${colId}`;
      const v = clipText(value, 4000);
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

async function buildVisionDesignSystem(input: {
  claudeApiKey: string;
  claudeModel?: string;
  brief: string;
}): Promise<VisionDesignSystemV1> {
  const base = defaultVisionDesignSystem();
  const prompt = [
    'Return ONLY JSON:',
    '{"fontFamily":"...","headingFontFamily":"...","primaryPrimitive":"...","accentPrimitives":["..."],"tone":"..."}',
    `Allowed primitive ids: ${primitiveAllowlistText()}`,
    'Keep values concise and practical.',
    `Brief:\n${clipText(input.brief, 4000) || '(none)'}`,
  ].join('\n\n');

  try {
    const out = await runClaudeMessagesText({
      apiKey: input.claudeApiKey,
      model: input.claudeModel,
      maxTokens: 1000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const parsed = parseJsonObject(out) || {};

    const primary = normalizeText(parsed.primaryPrimitive);
    const accents = Array.isArray(parsed.accentPrimitives)
      ? (parsed.accentPrimitives as unknown[]).map((x) => normalizeText(x)).filter(Boolean)
      : [];

    const ds = normalizeVisionDesignSystem(base);
    if (normalizeText(parsed.fontFamily)) ds.foundations.fontFamily = clipText(parsed.fontFamily, 120);
    if (normalizeText(parsed.headingFontFamily)) ds.foundations.headingFontFamily = clipText(parsed.headingFontFamily, 120);

    const active = ds.scenarios.find((s) => s.id === ds.activeScenarioId) || ds.scenarios[0];
    if (active) {
      const pairings = active.palette.pairings || {
        accentPrimitives: [],
        neutralPrimitives: [],
        semanticPrimitives: {},
      };
      if (primary) pairings.primaryPrimitive = primary;
      if (accents.length) pairings.accentPrimitives = accents.slice(0, 4);
      active.palette.pairings = pairings;
    }
    return normalizeVisionDesignSystem(ds);
  } catch {
    return normalizeVisionDesignSystem(base);
  }
}

function pascalCase(input: string): string {
  return normalizeText(input)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('') || 'GeneratedComponent';
}

function fallbackTsxStub(input: { componentName: string; purpose: string; propsContract: string[]; runLabel: string }): string {
  const name = pascalCase(input.componentName);
  const propsRows = input.propsContract.slice(0, 12).map((row) => {
    const key = normalizeText(row)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'value';
    return `  ${key}?: string;`;
  });
  return [
    `// Generated by Diregram project pipeline (${input.runLabel})`,
    "import React from 'react';",
    '',
    'type Props = {',
    '  className?: string;',
    ...propsRows,
    '};',
    '',
    `export function ${name}(props: Props) {`,
    '  return (',
    "    <section className={['rounded border p-4', props.className].filter(Boolean).join(' ')}>",
    `      <h3 className=\"text-sm font-semibold\">${name}</h3>`,
    `      <p className=\"mt-2 text-sm text-slate-600\">${clipText(input.purpose, 220) || 'Component purpose not specified.'}</p>`,
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
}

async function generateTsxStubWithClaude(input: {
  claudeApiKey: string;
  claudeModel?: string;
  component: PipelineComponentGap;
  runLabel: string;
}): Promise<string> {
  const prompt = [
    'Generate one React + TypeScript + Tailwind component stub file.',
    'Return TSX code only, no markdown fences.',
    `Component name: ${input.component.name}`,
    `Purpose: ${input.component.purpose || '(none)'}`,
    `Props contract hints: ${(input.component.propsContract || []).join(', ') || '(none)'}`,
    'Keep the file concise and compile-ready.',
  ].join('\n');

  try {
    const out = await runClaudeMessagesText({
      apiKey: input.claudeApiKey,
      model: input.claudeModel,
      maxTokens: 1800,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const cleaned = out.replace(/^\s*```(?:tsx|typescript|ts|jsx|js)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    if (!cleaned) throw new Error('Empty TSX output');
    return cleaned + '\n';
  } catch {
    return fallbackTsxStub({
      componentName: input.component.name,
      purpose: input.component.purpose,
      propsContract: input.component.propsContract,
      runLabel: input.runLabel,
    });
  }
}

function noteForEpic(input: {
  epic: PipelineEpic;
  stories: PipelineStory[];
  diagramFileId: string;
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.epic.title}`);
  lines.push('');
  if (input.epic.summary) {
    lines.push(input.epic.summary);
    lines.push('');
  }
  lines.push(`Primary diagram file: ${input.diagramFileId}`);
  lines.push('');

  input.stories.forEach((story, idx) => {
    lines.push(`## ${idx + 1}. ${story.title}`);
    lines.push('');
    lines.push(`- Story ID: ${story.id}`);
    lines.push(`- Actor: ${story.actor || '-'}`);
    lines.push(`- Goal: ${story.goal || '-'}`);
    lines.push(`- Benefit: ${story.benefit || '-'}`);
    lines.push(`- Priority: ${story.priority || '-'}`);
    lines.push(`- Diagram refs: ${story.diagramRefs.map((x) => x.anchorKey).join(', ')}`);
    lines.push('');
    if (story.description) {
      lines.push(story.description);
      lines.push('');
    }
    if (story.acceptanceCriteria.length) {
      lines.push('### Acceptance Criteria');
      story.acceptanceCriteria.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }
    lines.push('### UI Elements Table');
    lines.push('');
    lines.push('| UI Element | Diagram Ref |');
    lines.push('| --- | --- |');
    if (story.uiElements.length) {
      story.uiElements.forEach((item, rowIdx) => {
        const ref = story.diagramRefs[rowIdx % Math.max(1, story.diagramRefs.length)];
        lines.push(`| ${item} | ${ref?.anchorKey || '-'} |`);
      });
    } else {
      lines.push(`| (none specified) | ${story.diagramRefs[0]?.anchorKey || '-'} |`);
    }
    lines.push('');
  });

  return upsertHeader(lines.join('\n').trimEnd() + '\n', { kind: 'note', version: 1 });
}

function toLinkedArtifact(kind: 'diagram' | 'grid' | 'vision' | 'note' | 'resource', id: string, name: string, refs: DiagramLinkRef[]) {
  return {
    kind,
    id,
    name,
    diagramRefs: normalizeRefs(refs),
  };
}

export async function runProjectPipelineJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  const admin = getAdminSupabaseClient();
  const input = (job.input || {}) as JsonRecord;
  const ownerId = normalizeText(input.ownerId || job.owner_id);
  const projectFolderId = normalizeText(input.projectFolderId || job.project_folder_id);
  const requesterUserId = normalizeText(input.requestedBy || job.requester_user_id || '');
  const uploadsRaw = Array.isArray(input.uploads) ? (input.uploads as unknown[]) : [];
  const embeddingModel = normalizeText(input.embeddingModel) || undefined;
  const claudeModel = normalizeText(input.claudeModel) || undefined;

  if (!ownerId) throw new Error('Missing ownerId');
  if (!projectFolderId) throw new Error('Missing projectFolderId');
  if (!requesterUserId) throw new Error('Missing requesterUserId');

  const uploads: PipelineUploadInput[] = uploadsRaw
    .map((row) => (row && typeof row === 'object' ? (row as JsonRecord) : null))
    .filter((row): row is JsonRecord => row !== null)
    .map((row) => ({
      objectPath: normalizeText(row.objectPath),
      name: normalizeText(row.name),
      size: Number(row.size || 0),
      mimeType: normalizeText(row.mimeType),
    }))
    .filter((row) => Boolean(row.objectPath) && Boolean(row.name))
    .slice(0, MAX_UPLOADS);

  if (!uploads.length) throw new Error('No uploads were provided');

  let secret: JsonRecord = {};
  if (job.secret_payload) {
    try {
      secret = decryptSecretPayload(job.secret_payload);
    } catch {
      secret = {};
    }
  }
  const openaiApiKey = normalizeText(secret.openaiApiKey) || normalizeText(process.env.OPENAI_API_KEY);
  const claudeApiKey = normalizeText(secret.claudeApiKey) || normalizeText(process.env.CLAUDE_API_KEY);
  if (!openaiApiKey) throw new Error('Missing OpenAI API key');
  if (!claudeApiKey) throw new Error('Missing Claude API key');

  const runLabel = `pipeline-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}-${randomUUID().slice(0, 6)}`;
  const linkedArtifacts: PipelineArtifactManifest['linkedArtifacts'] = [];
  const createdFiles: Array<{ id: string; name: string; kind: 'diagram' | 'grid' | 'vision' | 'note' }> = [];
  const createdResources: Array<{ id: string; name: string; kind: string }> = [];
  let stageState: JsonRecord = { ...(job.state || {}), runLabel };

  const setStage = async (step: string, progressPct: number, patch?: JsonRecord) => {
    if (patch) stageState = { ...stageState, ...patch };
    await updateAsyncJob(job.id, {
      step,
      progress_pct: Math.max(1, Math.min(99, Math.floor(progressPct))),
      state: stageState,
    });
  };

  const ensureNotCancelled = async () => {
    if (await isAsyncJobCancelRequested(job.id)) {
      throw new Error('Job cancelled');
    }
  };

  await ensureNotCancelled();
  await setStage('prepare_inputs', 3, { uploadCount: uploads.length });

  const uploadTexts = await collectUploadTexts({
    uploads,
    requesterUserId,
    admin,
  });

  await ensureNotCancelled();
  await setStage('generate_single_diagram', 16, { sourceCount: uploadTexts.length });

  const diagramMarkdown = await generateSingleDiagram({
    claudeApiKey,
    claudeModel,
    uploadTexts: uploadTexts.map((x) => ({ name: x.name, text: x.text })),
  });

  const diagramName = `${runLabel}-single-diagram`;
  const { data: insertedDiagram, error: diagramInsertErr } = await admin
    .from('files')
    .insert({
      name: diagramName,
      owner_id: ownerId,
      folder_id: projectFolderId,
      room_name: `file-${randomUUID()}`,
      last_opened_at: nowIso(),
      kind: 'diagram',
      content: diagramMarkdown,
    } as never)
    .select('id,name')
    .single();
  if (diagramInsertErr) throw new Error(diagramInsertErr.message);

  const singleDiagramFileId = normalizeText((insertedDiagram as { id?: unknown }).id);
  if (!singleDiagramFileId) throw new Error('Failed to create single diagram file');

  createdFiles.push({ id: singleDiagramFileId, name: diagramName, kind: 'diagram' });

  const diagramLinkIndex = buildDiagramLinkIndex({
    diagramFileId: singleDiagramFileId,
    markdown: diagramMarkdown,
  });
  linkedArtifacts.push(toLinkedArtifact('diagram', singleDiagramFileId, diagramName, diagramLinkIndex));

  await ensureNotCancelled();
  await setStage('build_rag_from_diagram', 28, { singleDiagramFileId, diagramRefs: diagramLinkIndex.length });

  const seedRag = await ingestDiagramOnlyToRag({
    ownerId,
    projectFolderId,
    diagramFileId: singleDiagramFileId,
    diagramMarkdown,
    openaiApiKey,
    embeddingModel,
    admin,
  });

  await ensureNotCancelled();
  await setStage('swarm_analysis', 40, { seedChunkCount: seedRag.chunks });

  const agents: SwarmAgentName[] = ['technical', 'user_journey', 'interaction', 'content', 'ui_presentation'];
  const agentOutputs: AgentOutputRecord[] = [];

  for (let i = 0; i < agents.length; i += 1) {
    await ensureNotCancelled();
    const agent = agents[i]!;
    const output = await runSwarmAgent({
      agent,
      claudeApiKey,
      claudeModel,
      ownerId,
      projectFolderId,
      openaiApiKey,
      embeddingModel,
      diagramLinkIndex,
      diagramMarkdown,
    });
    agentOutputs.push(output);

    const { data: resourceData, error: resourceErr } = await admin
      .from('project_resources')
      .insert({
        owner_id: ownerId,
        project_folder_id: projectFolderId,
        name: `${runLabel}-swarm-${agent}.json`,
        kind: 'json',
        markdown: JSON.stringify(output, null, 2),
        source: {
          type: 'project_pipeline_swarm_agent',
          runLabel,
          agent,
          diagramFileId: singleDiagramFileId,
        },
      } as never)
      .select('id,name,kind')
      .single();
    if (!resourceErr && resourceData) {
      const resourceId = normalizeText((resourceData as { id?: unknown }).id);
      const resourceName = normalizeText((resourceData as { name?: unknown }).name);
      if (resourceId) {
        createdResources.push({ id: resourceId, name: resourceName || `${runLabel}-swarm-${agent}.json`, kind: 'json' });
        const refs = normalizeRefs(output.recommendations.flatMap((r) => r.diagramRefs));
        linkedArtifacts.push(toLinkedArtifact('resource', resourceId, resourceName || `${runLabel}-swarm-${agent}.json`, refs));
      }
    }

    await setStage('swarm_analysis', 42 + Math.floor(((i + 1) / agents.length) * 12), {
      swarmAgent: agent,
      swarmCompleted: i + 1,
      swarmTotal: agents.length,
    });
  }

  const synthesis = await synthesizePipeline({
    claudeApiKey,
    claudeModel,
    diagramLinkIndex,
    diagramMarkdown,
    agentOutputs,
  });

  await ensureNotCancelled();
  await setStage('generate_user_story_grid', 58, {
    epicCount: synthesis.epics.length,
    storyCount: synthesis.stories.length,
  });

  const epicsById = new Map(synthesis.epics.map((epic) => [epic.id, epic]));
  const gridMarkdown = storyRowsToGridMarkdown(synthesis.stories, epicsById);
  const gridName = `${runLabel}-user-story-grid`;
  const { data: gridData, error: gridErr } = await admin
    .from('files')
    .insert({
      name: gridName,
      owner_id: ownerId,
      folder_id: projectFolderId,
      room_name: `file-${randomUUID()}`,
      last_opened_at: nowIso(),
      kind: 'grid',
      content: gridMarkdown,
    } as never)
    .select('id,name')
    .single();
  if (gridErr) throw new Error(gridErr.message);
  const gridFileId = normalizeText((gridData as { id?: unknown }).id);
  createdFiles.push({ id: gridFileId, name: gridName, kind: 'grid' });
  linkedArtifacts.push(
    toLinkedArtifact(
      'grid',
      gridFileId,
      gridName,
      normalizeRefs(synthesis.stories.flatMap((story) => story.diagramRefs)),
    ),
  );

  await ensureNotCancelled();
  await setStage('generate_design_system_and_components', 70, { componentGapCount: synthesis.componentGaps.length });

  const designSystem = await buildVisionDesignSystem({
    claudeApiKey,
    claudeModel,
    brief: synthesis.designSystemBrief,
  });
  const visionStarter = makeStarterVisionMarkdown();
  const baseVisionDoc = loadVisionDoc(visionStarter).doc;
  const nextVisionDoc =
    baseVisionDoc.version === 2
      ? { ...baseVisionDoc, designSystem, updatedAt: nowIso() }
      : { version: 2 as const, designSystem, updatedAt: nowIso() };
  const visionMarkdown = saveVisionDoc(visionStarter, nextVisionDoc);
  const visionName = `${runLabel}-design-system`;
  const { data: visionData, error: visionErr } = await admin
    .from('files')
    .insert({
      name: visionName,
      owner_id: ownerId,
      folder_id: projectFolderId,
      room_name: `file-${randomUUID()}`,
      last_opened_at: nowIso(),
      kind: 'vision',
      content: visionMarkdown,
    } as never)
    .select('id,name')
    .single();
  if (visionErr) throw new Error(visionErr.message);
  const visionFileId = normalizeText((visionData as { id?: unknown }).id);
  createdFiles.push({ id: visionFileId, name: visionName, kind: 'vision' });
  linkedArtifacts.push(
    toLinkedArtifact('vision', visionFileId, visionName, normalizeRefs(synthesis.stories.flatMap((story) => story.diagramRefs))),
  );

  for (let i = 0; i < synthesis.componentGaps.length; i += 1) {
    await ensureNotCancelled();
    const component = synthesis.componentGaps[i]!;
    const tsx = await generateTsxStubWithClaude({
      claudeApiKey,
      claudeModel,
      component,
      runLabel,
    });
    const resourceName = `${runLabel}-${normalizeStoryId(component.name, `component-${i + 1}`)}.tsx`;
    const { data: resourceData, error: resourceErr } = await admin
      .from('project_resources')
      .insert({
        owner_id: ownerId,
        project_folder_id: projectFolderId,
        name: resourceName,
        kind: 'tsx',
        markdown: tsx,
        source: {
          type: 'project_pipeline_component_gap',
          runLabel,
          componentId: component.id,
          diagramFileId: singleDiagramFileId,
          diagramRefs: component.diagramRefs,
        },
      } as never)
      .select('id,name,kind')
      .single();
    if (resourceErr) throw new Error(resourceErr.message);

    const resourceId = normalizeText((resourceData as { id?: unknown }).id);
    const resourceLabel = normalizeText((resourceData as { name?: unknown }).name) || resourceName;
    createdResources.push({ id: resourceId, name: resourceLabel, kind: 'tsx' });
    linkedArtifacts.push(toLinkedArtifact('resource', resourceId, resourceLabel, component.diagramRefs));

    await setStage('generate_design_system_and_components', 72 + Math.floor(((i + 1) / Math.max(1, synthesis.componentGaps.length)) * 10), {
      componentGenerated: i + 1,
      componentTotal: synthesis.componentGaps.length,
    });
  }

  await ensureNotCancelled();
  await setStage('generate_epic_notes', 83, { epicCount: synthesis.epics.length });

  for (let i = 0; i < synthesis.epics.length; i += 1) {
    await ensureNotCancelled();
    const epic = synthesis.epics[i]!;
    const stories = synthesis.stories.filter((story) => story.epicId === epic.id);
    const markdown = noteForEpic({
      epic,
      stories,
      diagramFileId: singleDiagramFileId,
    });

    const name = `${runLabel}-epic-${normalizeStoryId(epic.title, epic.id)}`;
    const { data: noteData, error: noteErr } = await admin
      .from('files')
      .insert({
        name,
        owner_id: ownerId,
        folder_id: projectFolderId,
        room_name: `file-${randomUUID()}`,
        last_opened_at: nowIso(),
        kind: 'note',
        content: markdown,
      } as never)
      .select('id,name')
      .single();
    if (noteErr) throw new Error(noteErr.message);

    const noteFileId = normalizeText((noteData as { id?: unknown }).id);
    createdFiles.push({ id: noteFileId, name, kind: 'note' });
    linkedArtifacts.push(
      toLinkedArtifact('note', noteFileId, name, normalizeRefs(stories.flatMap((story) => story.diagramRefs))),
    );

    await setStage('generate_epic_notes', 84 + Math.floor(((i + 1) / Math.max(1, synthesis.epics.length)) * 8), {
      epicGenerated: i + 1,
      epicTotal: synthesis.epics.length,
    });
  }

  await ensureNotCancelled();
  await setStage('final_rag_refresh', 94, { createdFileCount: createdFiles.length, createdResourceCount: createdResources.length });

  await runRagIngestJob({
    ...job,
    kind: 'rag_ingest',
    input: {
      ownerId,
      projectFolderId,
      embeddingModel,
      requestedBy: requesterUserId,
    },
    project_folder_id: projectFolderId,
    owner_id: ownerId,
  });

  const manifest: PipelineArtifactManifest = {
    runLabel,
    primaryDiagramFileId: singleDiagramFileId,
    linkedArtifacts,
  };

  return {
    ok: true,
    runLabel,
    ownerId,
    projectFolderId,
    singleDiagramFileId,
    primaryDiagramFileId: singleDiagramFileId,
    diagramLinkIndex,
    createdFiles,
    createdResources,
    seedRag,
    artifactManifest: manifest,
    manifest,
  };
}
