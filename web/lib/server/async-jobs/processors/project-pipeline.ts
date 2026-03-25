import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AI_PROMPT } from '@/lib/ai-guides/diagram-full-prompt';
import { makeStarterDiagramMarkdown } from '@/lib/diagram-starter';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import type { ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';
import {
  POST_GEN_CHECKLIST_COMPLETENESS,
  POST_GEN_CHECKLIST_CONDITIONAL,
  POST_GEN_CHECKLIST_DATA_OBJECTS,
  POST_GEN_CHECKLIST_EXPANDED_NODES,
  POST_GEN_CHECKLIST_IA,
  POST_GEN_CHECKLIST_PROCESS_FLOWS,
  POST_GEN_CHECKLIST_SINGLE_SCREEN_STEPS,
  POST_GEN_CHECKLIST_SWIMLANE,
  POST_GEN_CHECKLIST_SYSTEM_FLOW,
  POST_GEN_CHECKLIST_TAGS,
} from '@/lib/ai-checklists/post-generation-index';
import { loadGridDoc, saveGridDoc, type GridDoc, type GridSheetV1 } from '@/lib/gridjson';
import { upsertHeader } from '@/lib/nexus-doc-header';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { extractRunningNumbersFromMarkdown } from '@/lib/node-running-numbers';
import { buildParentPath, extractExpandedIdsFromMarkdown } from '@/lib/expanded-state-storage';
import {
  coerceVisionDesignSystem,
  defaultVisionDesignSystem,
  normalizeVisionDesignSystem,
  VISION_TAILWIND_PRIMITIVE_COLORS,
  VISION_GOOGLE_FONT_OPTIONS,
  VISION_DECORATIVE_FONT_OPTIONS,
  type VisionDesignSystemV1,
} from '@/lib/vision-design-system';
import { loadVisionDoc, saveVisionDoc } from '@/lib/visionjson';
import {
  validateNexusMarkdownImport,
  type ImportValidationIssue,
  type ImportValidationResult,
} from '@/lib/markdown-import-validator';
import { buildFlowNodeParentPath } from '@/lib/flow-node-storage';
import { runClaudeMessagesText } from '@/lib/server/anthropic-messages';
import { embedTextsOpenAI } from '@/lib/server/openai-embeddings';
import { queryProjectKbContext, runOpenAIResponsesText } from '@/lib/server/openai-responses';
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
type PipelineGenerationProvider = 'claude' | 'openai';
type PipelineGenerationMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type PipelineGenerationConfig = {
  provider: PipelineGenerationProvider;
  openaiApiKey: string;
  claudeApiKey?: string;
  claudeModel?: string;
};

function normalizeGenerationProvider(input: unknown): PipelineGenerationProvider {
  return String(input || '').trim().toLowerCase() === 'openai' ? 'openai' : 'claude';
}

async function runPipelineGenerationText(input: {
  generation: PipelineGenerationConfig;
  messages: PipelineGenerationMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  if (input.generation.provider === 'openai') {
    const requestInput = [
      ...(input.system ? ([{ role: 'system', content: input.system }] as const) : []),
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];
    return runOpenAIResponsesText(requestInput, {
      apiKey: input.generation.openaiApiKey,
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
    });
  }
  if (!input.generation.claudeApiKey) {
    throw new Error('Missing Claude API key');
  }
  return runClaudeMessagesText({
    apiKey: input.generation.claudeApiKey,
    model: input.generation.claudeModel,
    messages: input.messages,
    system: input.system,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  });
}

const MAX_UPLOADS = 50;
const MAX_UPLOAD_TEXT = 50_000;
const MAX_DIAGRAM_REPAIR_ATTEMPTS = 16;
const MAX_SWARM_RECOMMENDATIONS = 24;
const MAX_SWARM_REVISION_ROUNDS = 3;
const MAX_DIAGRAM_FIX_TARGETS = 8;
const MAX_DIAGRAM_FIX_ISSUES = 12;
const MAX_DIAGRAM_FIX_CONTEXT_CHARS = 6000;
const MAX_DIAGRAM_FIX_REPLACEMENT_CHARS = 20_000;
const MAX_PROGRESSIVE_SOURCE_CHARS = 14_000;
const MAX_POST_SUCCESS_AUDIT_SOURCE_CHARS = 20_000;
const MAX_POST_SUCCESS_AUDIT_REPAIR_ATTEMPTS = 4;
const MAX_PROGRESSIVE_TREE_CHARS = 16_000;
const MAX_PROGRESSIVE_SCREEN_BATCH_SIZE = 3;
const MAX_PROGRESSIVE_SCREEN_SUBTREE_CHARS = 10_000;
const MAX_PROGRESSIVE_DATA_OBJECT_IDS = 24;
const MAX_DIAGRAM_INPUT_IMAGES = 6;
const MAX_DIAGRAM_PAGE_IMAGES = 2;
const MIN_DIAGRAM_IMAGE_BYTES = 24_000;
const MAX_VISION_IMAGE_CANDIDATES = 8;
const MAX_VISION_INPUT_IMAGES = 4;
const MAX_VISION_PAGE_IMAGES = 3;
const DOCLING_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;
const ASYNC_JOB_UPDATE_TIMEOUT_MS = 20_000;
const STORAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const STORAGE_TEXT_READ_TIMEOUT_MS = 30_000;
const STORAGE_REMOVE_TIMEOUT_MS = 15_000;
const DOCLING_REQUEST_TIMEOUT_MS = 180_000;

const RN_RE = /<!--\s*rn:(\d+)\s*-->/;
const PIPELINE_DIAGRAM_CONTENT_CHECKLIST = [
  'Run the repository content verification sequence below in order. This is the build checklist for diagram quality and completeness, not the validator:',
  '',
  '1. Data Relationship',
  POST_GEN_CHECKLIST_DATA_OBJECTS,
  '',
  '2. IA + Expanded Nodes',
  POST_GEN_CHECKLIST_IA,
  '',
  POST_GEN_CHECKLIST_EXPANDED_NODES,
  '',
  '3. Swimlane',
  POST_GEN_CHECKLIST_SWIMLANE,
  '',
  '4. Tech Flow',
  POST_GEN_CHECKLIST_SYSTEM_FLOW,
  '',
  '5. Tags + Process Flow + Conditional',
  POST_GEN_CHECKLIST_TAGS,
  '',
  POST_GEN_CHECKLIST_PROCESS_FLOWS,
  '',
  POST_GEN_CHECKLIST_SINGLE_SCREEN_STEPS,
  '',
  POST_GEN_CHECKLIST_CONDITIONAL,
  '',
  '6. Completeness Gate',
  POST_GEN_CHECKLIST_COMPLETENESS,
].join('\n');
const PIPELINE_DIAGRAM_BUILD_CHECKLIST = [
  'Use the repository diagram generation guidance below as the build contract.',
  AI_PROMPT,
  'Use the repository content checklist below as the source of truth for scope, correctness, and completeness. Build missing detail instead of deleting scope.',
  PIPELINE_DIAGRAM_CONTENT_CHECKLIST,
  'Treat validator issues as a separate technical import gate. If validator issues appear, repair structure/linkage/metadata while preserving and extending the content required by the build checklist.',
].join('\n\n');

type PipelineUploadInput = {
  objectPath: string;
  name: string;
  size: number;
  mimeType: string;
};

type UploadExtractionSourceKind = 'text' | 'docling';
type PipelineImageAssetKind = 'page' | 'picture' | 'table' | 'manual';

type DoclingImageAsset = {
  kind: PipelineImageAssetKind;
  objectPath: string;
  pageNo: number | null;
  index: number;
  width: number | null;
  height: number | null;
  bytes: number;
  label: string;
};

type CollectedUploadImageAsset = DoclingImageAsset & {
  sourceName: string;
  sourceObjectPath: string;
};

type SignedCollectedUploadImageAsset = CollectedUploadImageAsset & {
  signedUrl: string;
};

type ClassifiedVisionUiImage = SignedCollectedUploadImageAsset & {
  uiScore: number;
  rationale: string;
};

type UploadExtractionAnalysis = {
  charCount: number;
  lineCount: number;
  wordCount: number;
  alphaRatio: number;
  preview: string;
  warnings: string[];
  lowSignal: boolean;
};

type CollectedUploadText = {
  name: string;
  objectPath: string;
  text: string;
  sourceKind: UploadExtractionSourceKind;
  mimeType: string;
  size: number;
  analysis: UploadExtractionAnalysis;
  images: CollectedUploadImageAsset[];
  imageManifestObjectPath: string;
};

type AgentOutputRecord = {
  agent: SwarmAgentName;
  recommendations: Array<{
    id: string;
    title: string;
    detail: string;
    diagramRefs: DiagramLinkRef[];
  }>;
  monitor?: {
    usedFallback: boolean;
    outputPreview: string;
    kbContextPreview: string;
  };
};

type PipelineEpicDraft = PipelineEpic & {
  diagramRefs: DiagramLinkRef[];
};

type PipelineSynthesis = {
  epics: PipelineEpic[];
  stories: PipelineStory[];
  designSystemBrief: string;
  componentGaps: PipelineComponentGap[];
  monitor?: {
    outputPreview: string;
    usedEpicFallback: boolean;
    usedStoryFallback: boolean;
    designSystemBriefPreview: string;
  };
};

type VisionDesignSystemBuildResult = {
  designSystem: VisionDesignSystemV1;
  monitor: {
    mode: 'multimodal' | 'text' | 'default_fallback';
    outputPreview: string;
    artifactImageCount: number;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function pipelineLog(jobId: string, message: string, extra?: Record<string, unknown>) {
  if (extra && Object.keys(extra).length) {
    console.log(`[project_pipeline ${jobId}] ${message}`, extra);
    return;
  }
  console.log(`[project_pipeline ${jobId}] ${message}`);
}

function noRetryError(message: string): Error {
  return new Error(`[no-retry] ${message}`);
}

function sanitizeUnicodeText(input: unknown): string {
  const raw = String(input || '');
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < raw.length ? raw.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += raw[i] + raw[i + 1];
        i += 1;
      } else {
        out += '\uFFFD';
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      out += '\uFFFD';
      continue;
    }

    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      out += ' ';
      continue;
    }

    out += raw[i];
  }
  return out;
}

function normalizeText(input: unknown): string {
  return sanitizeUnicodeText(input).trim();
}

function clipText(input: unknown, maxChars: number): string {
  const t = normalizeText(input);
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars);
}

async function withTimeout<T>(label: string, ms: number, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.max(1, Math.floor(ms / 1000))}s`)), ms);
  });
  try {
    return await Promise.race([work(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

function parseDoclingImageAssets(input: unknown): DoclingImageAsset[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => (row && typeof row === 'object' ? (row as JsonRecord) : null))
    .filter((row): row is JsonRecord => row !== null)
    .map((row, idx) => {
      const kindRaw = normalizeText(row.kind).toLowerCase();
      const kind: PipelineImageAssetKind = kindRaw === 'picture' || kindRaw === 'table' ? (kindRaw as PipelineImageAssetKind) : 'page';
      const width = Number(row.width || 0);
      const height = Number(row.height || 0);
      const pageNo = Number(row.pageNo || 0);
      return {
        kind,
        objectPath: normalizeText(row.objectPath),
        pageNo: Number.isFinite(pageNo) && pageNo > 0 ? Math.floor(pageNo) : null,
        index: Math.max(1, Math.floor(Number(row.index || idx + 1) || idx + 1)),
        width: Number.isFinite(width) && width > 0 ? Math.floor(width) : null,
        height: Number.isFinite(height) && height > 0 ? Math.floor(height) : null,
        bytes: Math.max(0, Math.floor(Number(row.bytes || 0))),
        label: normalizeText(row.label) || `${kind} ${idx + 1}`,
      } satisfies DoclingImageAsset;
    })
    .filter((row) => Boolean(row.objectPath))
    .slice(0, 120);
}

function isStructuredTextMime(mime: string): boolean {
  if (!mime) return false;
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/json' || /\+json$/i.test(mime)) return true;
  if (mime === 'application/xml' || mime === 'text/xml' || /\+xml$/i.test(mime)) return true;
  if (mime === 'application/yaml' || mime === 'text/yaml' || mime === 'application/x-yaml' || mime === 'text/x-yaml') return true;
  return false;
}

function isLikelyTextFile(name: string, mimeType: string): boolean {
  const mime = normalizeText(mimeType).toLowerCase();
  const file = normalizeText(name).toLowerCase();
  if (/\.(doc|docx|ppt|pptx|xls|xlsx|pdf|rtf|odt|ods|odp|pages|numbers|key)$/i.test(file)) return false;
  if (/\.(md|txt|json|csv|tsv|xml|yaml|yml|html|htm|ts|tsx|js|jsx|css|scss|sql)$/i.test(file)) return true;
  if (
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/rtf' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.oasis.opendocument.text' ||
    mime === 'application/vnd.oasis.opendocument.spreadsheet' ||
    mime === 'application/vnd.oasis.opendocument.presentation'
  ) {
    return false;
  }
  if (isStructuredTextMime(mime)) return true;
  return false;
}

function safeFileName(name: string) {
  const raw = normalizeText(name) || 'file';
  return raw
    .replace(/\0/g, '')
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

function analyzeExtractedText(input: {
  name: string;
  text: string;
  sourceKind: UploadExtractionSourceKind;
  mimeType: string;
  size: number;
}): UploadExtractionAnalysis {
  const normalized = normalizeNewlines(input.text);
  const collapsed = normalized.replace(/\s+/g, ' ').trim();
  const lines = normalized.split('\n');
  const lineCount = lines.filter((line) => line.trim()).length;
  const charCount = collapsed.length;
  const wordCount = (collapsed.match(/[A-Za-z0-9][A-Za-z0-9/_-]*/g) || []).length;
  const alphaCount = (collapsed.match(/[A-Za-z]/g) || []).length;
  const alphaRatio = charCount > 0 ? alphaCount / charCount : 0;
  const replacementCharCount = (collapsed.match(/\uFFFD/g) || []).length;
  const preview = lines.slice(0, 40).join('\n').slice(0, 1800);
  const warnings: string[] = [];

  if (!collapsed) {
    warnings.push('No extractable text returned.');
  }

  if (input.sourceKind === 'docling') {
    if (input.size > 8 * 1024 && (charCount < 180 || wordCount < 35)) {
      warnings.push('Very little readable text was extracted for the uploaded file size.');
    }
    if (charCount >= 220 && alphaRatio < 0.28) {
      warnings.push('Extracted text has unusually low readable-prose density.');
    }
    if (replacementCharCount >= 5) {
      warnings.push('Extracted text contains replacement characters, suggesting OCR or encoding issues.');
    }
    if (charCount >= 1 && charCount < 600) {
      warnings.push('Converted output is short; verify the extracted text before trusting generation.');
    }
  }

  const lowSignal =
    input.sourceKind === 'docling' &&
    (!collapsed ||
      (input.size > 8 * 1024 && (charCount < 180 || wordCount < 35)) ||
      (charCount >= 220 && alphaRatio < 0.28) ||
      replacementCharCount >= 12);

  return {
    charCount,
    lineCount,
    wordCount,
    alphaRatio,
    preview,
    warnings,
    lowSignal,
  };
}

function summarizeIssues(messages: string[], maxItems = 14): string {
  const unique = Array.from(new Set(messages.map((m) => normalizeText(m)).filter(Boolean))).slice(0, maxItems);
  return unique.map((m, i) => `${i + 1}. ${m}`).join('\n');
}

function normalizeNewlines(input: unknown): string {
  return sanitizeUnicodeText(input).replace(/\r\n?/g, '\n');
}

function hashMarkdown(text: string): string {
  return createHash('sha256').update(normalizeNewlines(text), 'utf8').digest('hex').slice(0, 20);
}

function getIndent(line: string): number {
  const m = String(line || '').match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function findSeparatorIndexOutsideFences(lines: string[]): number {
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() || '';
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && trimmed === '---') return i;
  }
  return -1;
}

function findSubtreeRange(lines: string[], lineIndex: number): { start: number; end: number; baseIndent: number } | null {
  if (lineIndex < 0 || lineIndex >= lines.length) return null;
  const startLine = String(lines[lineIndex] || '');
  if (!startLine.trim()) return null;
  const separator = findSeparatorIndexOutsideFences(lines);
  const sectionEnd = separator === -1 ? lines.length : separator;
  if (lineIndex >= sectionEnd) return null;

  const baseIndent = getIndent(startLine);
  let end = lineIndex;
  for (let i = lineIndex + 1; i < sectionEnd; i += 1) {
    const line = String(lines[i] || '');
    if (!line.trim()) {
      end = i;
      continue;
    }
    if (getIndent(line) <= baseIndent) break;
    end = i;
  }
  return { start: lineIndex, end, baseIndent };
}

function extractIssueLineNumber(message: string): number | null {
  const normalized = normalizeText(message);
  const patterns = [/starting at line\s+(\d+)/i, /\bline\s+(\d+)\b/i];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (!m?.[1]) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function scanFenceRanges(lines: string[]): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let openStart: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^```/.test(String(lines[i] || '').trim())) continue;
    if (openStart === null) {
      openStart = i;
      continue;
    }
    out.push({ start: openStart, end: i });
    openStart = null;
  }
  if (openStart !== null) out.push({ start: openStart, end: Math.max(openStart, lines.length - 1) });
  return out;
}

function findFenceRangeContainingLine(
  ranges: Array<{ start: number; end: number }>,
  lineIndex: number,
): { start: number; end: number } | null {
  for (const r of ranges) {
    if (lineIndex >= r.start && lineIndex <= r.end) return r;
  }
  return null;
}

function fixInstructionForValidationIssue(issue: ImportValidationIssue): string {
  switch (issue.code) {
    case 'UNCLOSED_CODE_BLOCK':
      return 'Remove stray fence lines and ensure every opened triple-backtick fence is closed; do not delete valid node lines to silence this error.';
    case 'PARSE_FAILED':
      return 'Keep valid hierarchical node structure with stable 2-space indentation and valid parent-child nesting; repair by adding/realigning lines, not by dropping branches.';
    case 'NO_NODES':
      return 'Ensure at least one non-empty node line exists before the metadata separator.';
    case 'INVALID_JSON':
      return 'Output strict JSON only inside metadata blocks: double quotes, no comments, no trailing commas. Keep node content intact.';
    case 'DUPLICATE_BLOCK':
      return 'Keep only one metadata fenced block per block type while preserving node coverage.';
    case 'DOATTRS_WITHOUT_DO':
      return 'If doattrs is present, ensure matching data-object id exists or remove only the orphan doattrs reference. Do not remove related nodes.';
    case 'MISSING_TAG_STORE':
      return 'Add or repair the missing tag-store metadata block if tag ids are referenced. Do not delete tagged nodes.';
    case 'MISSING_EXPANDED_STATES_BLOCK':
      return 'Add or repair the missing expanded-states metadata block. Preserve existing expanded nodes.';
    case 'MISSING_SEPARATOR':
      return "Add the metadata separator line '---' between the node tree and fenced metadata blocks so metadata does not mix into node lines.";
    case 'MISSING_DATA_OBJECTS_BLOCK':
      return 'If do: links are referenced, add or repair the data-objects block with those ids. Do not delete linked nodes to suppress this warning.';
    case 'CROSS_TIMEFRAME_SIGNAL':
      return 'Clarify async or cross-timeframe transitions explicitly with separate states/steps so the flow stays readable without collapsing the process.';
    default:
      return 'Resolve this validator issue exactly while preserving unrelated content and existing node scope; prefer additive completion over removal.';
  }
}

type MarkdownFixTarget = {
  id: string;
  startLine: number;
  endLine: number;
  targetKind: 'tree' | 'metadata';
  reason: string;
  issueCodes: string[];
  contextMarkdown: string;
  originalMarkdown: string;
};

type TargetedMarkdownPatch = {
  targetId: string;
  replacementMarkdown: string;
};

function describeTargetPatchFormat(target: MarkdownFixTarget): string {
  return target.targetKind === 'metadata'
    ? 'Return one or more complete fenced metadata blocks only, with opening and closing ``` lines and no extra prose.'
    : 'Return plain diagram tree lines only for this subtree. Do not include fenced blocks, JSON objects, headings, or explanations.';
}

function targetReasonForIssue(issue: ImportValidationIssue): string {
  switch (issue.code) {
    case 'UNCLOSED_CODE_BLOCK':
      return 'Repair an unclosed fenced code block in this local section.';
    case 'MISSING_TAG_STORE':
      return 'Add or repair the missing tag-store metadata block in metadata section.';
    case 'MISSING_EXPANDED_STATES_BLOCK':
      return 'Add or repair the missing expanded-states metadata block.';
    default:
      return `Repair validator issue: ${issue.code}`;
  }
}

function clampLineRange(range: { startLine: number; endLine: number }, totalLines: number): { startLine: number; endLine: number } {
  const maxStart = totalLines + 1;
  const start = Math.max(1, Math.min(maxStart, Math.floor(range.startLine)));
  const end = Math.max(0, Math.min(totalLines, Math.floor(range.endLine)));
  if (start <= end || start === end + 1) return { startLine: start, endLine: end };
  return { startLine: start, endLine: Math.max(0, start - 1) };
}

function extractOriginalMarkdownForRange(lines: string[], startLine: number, endLine: number): string {
  if (startLine === endLine + 1) return '';
  const startIdx = Math.max(0, startLine - 1);
  const endIdx = Math.max(startIdx, endLine - 1);
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

function extractContextMarkdownForRange(lines: string[], startLine: number, endLine: number): string {
  if (!lines.length) return '';
  const contextStart = Math.max(1, startLine - 2);
  const contextEnd = Math.min(lines.length, Math.max(endLine, startLine) + 2);
  return lines.slice(contextStart - 1, contextEnd).join('\n').slice(0, MAX_DIAGRAM_FIX_CONTEXT_CHARS);
}

function buildMarkdownFixTargets(markdown: string, issues: ImportValidationIssue[]): MarkdownFixTarget[] {
  const lines = normalizeNewlines(markdown).split('\n');
  const separatorIndex = findSeparatorIndexOutsideFences(lines);
  const nodeSectionEnd = separatorIndex === -1 ? lines.length : separatorIndex;
  const metadataInsertStartLine = separatorIndex === -1 ? lines.length + 1 : separatorIndex + 2;
  const metadataInsertEndLine = metadataInsertStartLine - 1;
  const fenceRanges = scanFenceRanges(lines);

  type TargetRange = {
    startLine: number;
    endLine: number;
    targetKind: 'tree' | 'metadata';
    reason: string;
    issueCodes: Set<string>;
  };

  const ranges: TargetRange[] = [];

  const addRange = (
    range: { startLine: number; endLine: number },
    issue: ImportValidationIssue,
    targetKind: 'tree' | 'metadata',
  ) => {
    const clamped = clampLineRange(range, lines.length);
    ranges.push({
      startLine: clamped.startLine,
      endLine: clamped.endLine,
      targetKind,
      reason: targetReasonForIssue(issue),
      issueCodes: new Set([issue.code]),
    });
  };

  for (const issue of issues.slice(0, MAX_DIAGRAM_FIX_TARGETS)) {
    const line = extractIssueLineNumber(issue.message || '');
    if (!line) {
      addRange(
        {
          startLine: metadataInsertStartLine,
          endLine: metadataInsertEndLine,
        },
        issue,
        'metadata',
      );
      continue;
    }

    const lineIndex = Math.max(0, line - 1);
    if (issue.code === 'UNCLOSED_CODE_BLOCK') {
      const endLine = Math.min(lines.length, line + 120);
      addRange({ startLine: line, endLine }, issue, lineIndex < nodeSectionEnd ? 'tree' : 'metadata');
      continue;
    }

    if (lineIndex < nodeSectionEnd) {
      const subtree = findSubtreeRange(lines, lineIndex);
      if (subtree) {
        addRange({ startLine: subtree.start + 1, endLine: subtree.end + 1 }, issue, 'tree');
        continue;
      }
      addRange({ startLine: Math.max(1, line - 2), endLine: Math.min(lines.length, line + 2) }, issue, 'tree');
      continue;
    }

    const fenceRange = findFenceRangeContainingLine(fenceRanges, lineIndex);
    if (fenceRange) {
      addRange({ startLine: fenceRange.start + 1, endLine: fenceRange.end + 1 }, issue, 'metadata');
      continue;
    }
    addRange({ startLine: Math.max(1, line - 2), endLine: Math.min(lines.length, line + 2) }, issue, 'metadata');
  }

  const integrityIssues = Array.from(
    new Set(
      assessDiagramIntegrity(markdown)
        .map((issue) => normalizeText(issue))
        .filter(Boolean),
    ),
  );
  if (integrityIssues.length) {
    ranges.push({
      startLine: 1,
      endLine: Math.max(1, nodeSectionEnd),
      targetKind: 'tree',
      reason: clipText(`Repair node-tree integrity: ${integrityIssues.join(' | ')}`, 280),
      issueCodes: new Set(['INTEGRITY_TREE']),
    });
    ranges.push({
      startLine: metadataInsertStartLine,
      endLine: metadataInsertEndLine,
      targetKind: 'metadata',
      reason: 'Resync metadata blocks that depend on the repaired tree, including flow registries and process metadata.',
      issueCodes: new Set(['INTEGRITY_METADATA']),
    });
  }

  const merged = ranges
    .sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine)
    .reduce<TargetRange[]>((acc, cur) => {
      const prev = acc[acc.length - 1];
      if (!prev) {
        acc.push(cur);
        return acc;
      }
      const overlaps = cur.startLine <= prev.endLine + 1;
      if (!overlaps) {
        acc.push(cur);
        return acc;
      }
      prev.endLine = Math.max(prev.endLine, cur.endLine);
      if (prev.targetKind !== cur.targetKind) prev.targetKind = 'metadata';
      prev.reason = `${prev.reason}; ${cur.reason}`.slice(0, 260);
      cur.issueCodes.forEach((code) => prev.issueCodes.add(code));
      return acc;
    }, []);

  return merged.slice(0, MAX_DIAGRAM_FIX_TARGETS).map((target, idx) => ({
    id: `target-${idx + 1}`,
    startLine: target.startLine,
    endLine: target.endLine,
    targetKind: target.targetKind,
    reason: target.reason.slice(0, 280),
    issueCodes: Array.from(target.issueCodes).slice(0, 8),
    contextMarkdown: extractContextMarkdownForRange(lines, target.startLine, target.endLine),
    originalMarkdown: extractOriginalMarkdownForRange(lines, target.startLine, target.endLine),
  }));
}

function parseTargetedPatchResponse(text: string): { summary: string; patches: TargetedMarkdownPatch[] } | null {
  const obj = parseJsonObject(text);
  if (!obj) return null;
  const summary = clipText(obj.summary, 2000);
  const patchesRaw = Array.isArray(obj.patches) ? obj.patches : [];
  const patches = patchesRaw
    .map((p) => (p && typeof p === 'object' ? (p as JsonRecord) : null))
    .filter((p): p is JsonRecord => p !== null)
    .map((p) => ({
      targetId: normalizeText(p.targetId),
      replacementMarkdown: normalizeNewlines(p.replacementMarkdown).slice(0, MAX_DIAGRAM_FIX_REPLACEMENT_CHARS),
    }))
    .filter((p) => Boolean(p.targetId))
    .slice(0, MAX_DIAGRAM_FIX_TARGETS);
  return { summary, patches };
}

function looksLikeSafeTreePatchReplacement(text: string): boolean {
  const normalized = normalizeNewlines(text).trim();
  if (!normalized) return true;
  const lines = normalized.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^```/.test(trimmed)) return false;
    if (trimmed === '---') return false;
    if (/^#{1,6}\s/.test(trimmed)) return false;
    if (/^[-*]\s/.test(trimmed)) return false;
    if (/^\d+\.\s/.test(trimmed)) return false;
    if (/^[\[{]/.test(trimmed) || /^[\]}]/.test(trimmed) || /^"[^"]+"\s*:/.test(trimmed)) return false;
    if (trimmed.length > 320) return false;
  }
  return true;
}

function looksLikeSafeMetadataPatchReplacement(text: string): boolean {
  const normalized = normalizeNewlines(text).trim();
  if (!normalized) return true;
  const lines = normalized.split('\n');
  let inFence = false;
  let fenceCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      fenceCount += 1;
      continue;
    }
    if (!inFence) return false;
  }

  return fenceCount > 0 && !inFence;
}

function isMetadataOnlyRevisionTarget(target: MarkdownFixTarget): boolean {
  return target.targetKind === 'metadata';
}

type SafePatchDiagnostic = {
  targetId: string;
  accepted: boolean;
  reason: string;
};

function evaluateSafeRevisionPatches(targets: MarkdownFixTarget[], patches: TargetedMarkdownPatch[]): {
  accepted: TargetedMarkdownPatch[];
  diagnostics: SafePatchDiagnostic[];
} {
  const targetById = new Map(targets.map((target) => [target.id, target] as const));
  const diagnostics: SafePatchDiagnostic[] = [];
  const accepted = patches.filter((patch) => {
    const target = targetById.get(patch.targetId);
    if (!target) {
      diagnostics.push({
        targetId: patch.targetId,
        accepted: false,
        reason: 'Unknown targetId.',
      });
      return false;
    }
    const replacement = unwrapOuterDiagramFence(normalizeNewlines(patch.replacementMarkdown)).trim();
    const ok = isMetadataOnlyRevisionTarget(target)
      ? looksLikeSafeMetadataPatchReplacement(replacement)
      : looksLikeSafeTreePatchReplacement(replacement);
    diagnostics.push({
      targetId: patch.targetId,
      accepted: ok,
      reason: ok
        ? 'Accepted.'
        : isMetadataOnlyRevisionTarget(target)
          ? 'Rejected because metadata targets must return complete fenced metadata blocks only.'
          : 'Rejected because tree targets must return plain subtree lines only.',
    });
    return ok;
  });
  return { accepted, diagnostics };
}

function applyTargetedPatches(markdown: string, targets: MarkdownFixTarget[], patches: TargetedMarkdownPatch[]): string {
  if (!patches.length) return markdown;
  const lines = normalizeNewlines(markdown).split('\n');
  const targetById = new Map(targets.map((t) => [t.id, t]));
  const selected = patches
    .map((p) => ({ patch: p, target: targetById.get(p.targetId) || null }))
    .filter((x): x is { patch: TargetedMarkdownPatch; target: MarkdownFixTarget } => x.target !== null)
    .slice(0, MAX_DIAGRAM_FIX_TARGETS);
  if (!selected.length) return markdown;

  const uniqueByTarget = new Map<string, { patch: TargetedMarkdownPatch; target: MarkdownFixTarget }>();
  selected.forEach((entry) => {
    if (!uniqueByTarget.has(entry.target.id)) uniqueByTarget.set(entry.target.id, entry);
  });

  const ordered = Array.from(uniqueByTarget.values()).sort((a, b) => b.target.startLine - a.target.startLine);
  const next = [...lines];
  ordered.forEach(({ patch, target }) => {
    const replacementText = unwrapOuterDiagramFence(normalizeNewlines(patch.replacementMarkdown)).trimEnd();
    const replacementLines = replacementText.length ? replacementText.split('\n') : [];
    const startIdx = Math.max(0, target.startLine - 1);
    const endIdx = Math.max(startIdx - 1, target.endLine - 1);

    if (target.startLine === target.endLine + 1) {
      next.splice(startIdx, 0, ...replacementLines);
      return;
    }
    next.splice(startIdx, endIdx - startIdx + 1, ...replacementLines);
  });
  return next.join('\n');
}

function estimateNodeLineCount(markdown: string): number {
  const lines = normalizeNewlines(markdown).split('\n');
  const separator = findSeparatorIndexOutsideFences(lines);
  const sectionEnd = separator === -1 ? lines.length : separator;
  let inFence = false;
  let count = 0;
  for (let i = 0; i < sectionEnd; i += 1) {
    const trimmed = String(lines[i] || '').trim();
    if (!trimmed) continue;
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || trimmed === '---') continue;
    count += 1;
  }
  return count;
}

function extractNodeSectionLines(markdown: string): string[] {
  const lines = normalizeNewlines(markdown).split('\n');
  const separator = findSeparatorIndexOutsideFences(lines);
  const sectionEnd = separator === -1 ? lines.length : separator;
  let inFence = false;
  const out: string[] = [];

  for (let i = 0; i < sectionEnd; i += 1) {
    const line = String(lines[i] || '');
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || trimmed === '---' || /^\/\//.test(trimmed)) continue;
    out.push(line);
  }

  return out;
}

function stripNodeSyntax(line: string): string {
  return String(line || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+#(?:flow|flowtab|systemflow)#/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isJsonishNodeLine(line: string): boolean {
  const core = stripNodeSyntax(line);
  if (!core) return false;
  if (/^[\[{]/.test(core)) return true;
  if (/^[\]}]/.test(core)) return true;
  if (/^"[^"]+"\s*:/.test(core)) return true;
  if (/^[\]}][,]?$/.test(core)) return true;
  return false;
}

function assessDiagramIntegrity(markdown: string): string[] {
  const nodeLines = extractNodeSectionLines(markdown);
  if (!nodeLines.length) {
    return ['No human-readable node tree exists before the metadata separator.'];
  }

  const jsonishCount = nodeLines.filter(isJsonishNodeLine).length;
  const humanReadableCount = nodeLines.filter((line) => {
    const core = stripNodeSyntax(line);
    if (!core || isJsonishNodeLine(line)) return false;
    const letters = (core.match(/[A-Za-z]/g) || []).length;
    return letters >= 3;
  }).length;
  const humanRootCount = nodeLines.filter((line) => {
    if (/^\s/.test(line)) return false;
    const core = stripNodeSyntax(line);
    if (!core || isJsonishNodeLine(line)) return false;
    const letters = (core.match(/[A-Za-z]/g) || []).length;
    return letters >= 3;
  }).length;

  const issues: string[] = [];
  if (humanReadableCount === 0) {
    issues.push('No human-readable node lines were detected in the tree section.');
  }
  if (humanRootCount === 0) {
    issues.push('No human-readable top-level root nodes were detected.');
  }
  if (nodeLines.length >= 3 && jsonishCount / nodeLines.length >= 0.5) {
    issues.push('The tree section is dominated by JSON-like lines, which indicates metadata was promoted into the node tree.');
  }
  return issues;
}

function toStructureKey(line: string): string {
  return stripNodeSyntax(line)
    .replace(/\s*\{\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractHumanStructureKeys(markdown: string, options?: { rootsOnly?: boolean }): string[] {
  return extractNodeSectionLines(markdown)
    .filter((line) => !(options?.rootsOnly && /^\s/.test(line)))
    .map((line) => ({ raw: line, key: toStructureKey(line) }))
    .filter(({ raw, key }) => {
      if (!key || isJsonishNodeLine(raw)) return false;
      const letters = (key.match(/[a-z]/g) || []).length;
      return letters >= 3;
    })
    .map(({ key }) => key);
}

function countStructureKeyOverlap(currentKeys: string[], candidateKeys: string[]): number {
  const candidateCounts = new Map<string, number>();
  candidateKeys.forEach((key) => {
    candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1);
  });

  let overlap = 0;
  currentKeys.forEach((key) => {
    const remaining = candidateCounts.get(key) || 0;
    if (remaining <= 0) return;
    overlap += 1;
    candidateCounts.set(key, remaining - 1);
  });
  return overlap;
}

function preservesCurrentDiagramStructure(input: {
  currentMarkdown: string;
  candidateMarkdown: string;
}): boolean {
  const currentNodeKeys = extractHumanStructureKeys(input.currentMarkdown);
  if (currentNodeKeys.length < 8) return true;

  const candidateNodeKeys = extractHumanStructureKeys(input.candidateMarkdown);
  const currentRootKeys = extractHumanStructureKeys(input.currentMarkdown, { rootsOnly: true });
  const candidateRootKeys = extractHumanStructureKeys(input.candidateMarkdown, { rootsOnly: true });

  const nodeRetention = countStructureKeyOverlap(currentNodeKeys, candidateNodeKeys) / Math.max(1, currentNodeKeys.length);
  const rootRetention = currentRootKeys.length
    ? countStructureKeyOverlap(currentRootKeys, candidateRootKeys) / Math.max(1, currentRootKeys.length)
    : 1;

  if (currentRootKeys.length >= 2 && rootRetention < 0.75) {
    return false;
  }
  if (nodeRetention < 0.72) {
    return false;
  }
  return true;
}

function isExcessiveNodeRemoval(currentCount: number, candidateCount: number): boolean {
  const removed = currentCount - candidateCount;
  if (removed <= 0) return false;
  const thresholdAbs = Math.max(3, Math.floor(currentCount * 0.08));
  return removed >= thresholdAbs;
}

function shouldAcceptCandidateValidation(input: {
  current: ImportValidationResult;
  candidate: ImportValidationResult;
  currentMarkdown: string;
  candidateMarkdown: string;
}): boolean {
  const currentNodeCount = estimateNodeLineCount(input.currentMarkdown);
  const candidateNodeCount = estimateNodeLineCount(input.candidateMarkdown);
  const excessiveRemoval = isExcessiveNodeRemoval(currentNodeCount, candidateNodeCount);
  const currentIntegrityIssues = assessDiagramIntegrity(input.currentMarkdown);
  const candidateIntegrityIssues = assessDiagramIntegrity(input.candidateMarkdown);

  if (excessiveRemoval) {
    return false;
  }

  if (candidateIntegrityIssues.length > currentIntegrityIssues.length) {
    return false;
  }

  if (
    !preservesCurrentDiagramStructure({
      currentMarkdown: input.currentMarkdown,
      candidateMarkdown: input.candidateMarkdown,
    })
  ) {
    return false;
  }

  if (input.candidate.errors.length < input.current.errors.length) {
    return true;
  }
  if (input.candidate.errors.length > input.current.errors.length) return false;

  if (input.candidate.warnings.length < input.current.warnings.length) {
    return true;
  }
  if (input.candidate.warnings.length > input.current.warnings.length) return false;

  if (candidateIntegrityIssues.length < currentIntegrityIssues.length) {
    return true;
  }

  if (candidateNodeCount < currentNodeCount) return false;
  return true;
}

type DiagramContentAuditMetrics = {
  nodeCount: number;
  expidCount: number;
  expandedMetadataCount: number;
  expandedGridCount: number;
  flowCount: number;
  processNodeTypeCount: number;
  singleScreenCount: number;
  conditionalVariantCount: number;
  flowConnectorLabelCount: number;
  score: number;
};

function countFlowConnectorLabelEntries(markdown: string): number {
  const match = normalizeNewlines(markdown).match(/```flow-connector-labels\n([\s\S]*?)\n```/);
  const parsed = match?.[1] ? parseJsonObject(match[1]) : null;
  return parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
}

function measureDiagramContentAuditMetrics(markdown: string): DiagramContentAuditMetrics {
  const nodes = flattenNodes(parseNexusMarkdown(markdown));
  const flowCount = nodes.filter((node) => /#flow#/.test(node.rawContent) && !/#flowtab#/.test(node.rawContent) && !/#systemflow#/.test(node.rawContent)).length;
  const conditionalVariantCount = nodes.filter((node) => {
    const conditions = (node as { conditions?: Record<string, string> }).conditions;
    return !!conditions && Object.keys(conditions).length > 0;
  }).length;
  const expidCount = Array.from(extractExpandedIdsFromMarkdown(markdown).values()).length;
  const expandedMetadataCount = (normalizeNewlines(markdown).match(/```expanded-metadata-\d+\n/g) || []).length;
  const expandedGridCount = (normalizeNewlines(markdown).match(/```expanded-grid-\d+\n/g) || []).length;
  const processNodeTypeCount = (normalizeNewlines(markdown).match(/```process-node-type-\d+\n/g) || []).length;
  const singleScreenCount = (normalizeNewlines(markdown).match(/```process-single-screen-\d+\n/g) || []).length;
  const flowConnectorLabelCount = countFlowConnectorLabelEntries(markdown);
  const nodeCount = estimateNodeLineCount(markdown);
  const score =
    nodeCount +
    expidCount * 5 +
    expandedMetadataCount * 4 +
    expandedGridCount * 5 +
    flowCount * 3 +
    processNodeTypeCount * 4 +
    singleScreenCount * 5 +
    conditionalVariantCount * 4 +
    flowConnectorLabelCount * 2;

  return {
    nodeCount,
    expidCount,
    expandedMetadataCount,
    expandedGridCount,
    flowCount,
    processNodeTypeCount,
    singleScreenCount,
    conditionalVariantCount,
    flowConnectorLabelCount,
    score,
  };
}

function shouldAcceptContentAuditCandidate(input: {
  currentMarkdown: string;
  candidateMarkdown: string;
}): boolean {
  const currentValidation = validateNexusMarkdownImport(input.currentMarkdown);
  const candidateValidation = validateNexusMarkdownImport(input.candidateMarkdown);
  if (
    !shouldAcceptCandidateValidation({
      current: currentValidation,
      candidate: candidateValidation,
      currentMarkdown: input.currentMarkdown,
      candidateMarkdown: input.candidateMarkdown,
    })
  ) {
    return false;
  }

  const currentMetrics = measureDiagramContentAuditMetrics(input.currentMarkdown);
  const candidateMetrics = measureDiagramContentAuditMetrics(input.candidateMarkdown);
  return candidateMetrics.score >= currentMetrics.score;
}

function ensureNodeLinkMarkers(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const separator = lines.findIndex((line) => line.trim() === '---');
  const nodeSectionEnd = separator === -1 ? lines.length : separator;

  const existingRn = extractRunningNumbersFromMarkdown(lines.join('\n'));
  let nextRn = 1;
  existingRn.forEach((v) => {
    if (v >= nextRn) nextRn = v + 1;
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

    if (!hasRn) {
      nextLine = `${nextLine} <!-- rn:${nextRn} -->`;
      nextRn += 1;
    }

    lines[i] = nextLine;
  }

  return lines.join('\n').trimEnd() + '\n';
}

function stripTrailingUnclosedMetadataFence(markdown: string): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const separator = findSeparatorIndexOutsideFences(lines);
  if (separator === -1) return markdown;

  let inFence = false;
  let openFenceStart = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = String(lines[i] || '').trim();
    if (!/^```/.test(trimmed)) continue;
    if (!inFence) {
      inFence = true;
      openFenceStart = i;
      continue;
    }
    inFence = false;
    openFenceStart = -1;
  }

  if (!inFence || openFenceStart <= separator) return markdown;
  return lines.slice(0, openFenceStart).join('\n').trimEnd();
}

function buildExpandedStatesBlock(markdown: string): string | null {
  const expByLine = extractExpandedIdsFromMarkdown(markdown);
  if (!expByLine.size) return null;

  const roots = parseNexusMarkdown(markdown);
  const allNodes = flattenNodes(roots);
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const nodeByLine = new Map(allNodes.map((node) => [node.lineIndex, node]));

  const buildParentPath = (node: (typeof allNodes)[number]): string[] => {
    const path: string[] = [];
    let current = node;
    while (current.parentId) {
      const parent = nodeById.get(current.parentId);
      if (!parent) break;
      path.unshift(normalizeText(parent.content) || normalizeText(parent.rawContent) || parent.id);
      current = parent;
    }
    return path;
  };

  const entries = Array.from(expByLine.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([lineIndex, runningNumber]) => {
      const node = nodeByLine.get(lineIndex);
      if (!node) return null;
      return {
        runningNumber,
        content: normalizeText(node.content) || normalizeText(node.rawContent) || node.id,
        parentPath: buildParentPath(node),
        lineIndex,
      };
    })
    .filter((entry): entry is { runningNumber: number; content: string; parentPath: string[]; lineIndex: number } => entry !== null);

  if (!entries.length) return null;
  const nextRunningNumber = Math.max(0, ...entries.map((entry) => entry.runningNumber)) + 1;
  return `\`\`\`expanded-states\n${JSON.stringify({ nextRunningNumber, entries }, null, 2)}\n\`\`\``;
}

function syncExpandedStatesBlock(markdown: string): string {
  const block = buildExpandedStatesBlock(markdown);
  if (!block) return markdown;
  const re = /```expanded-states\n[\s\S]*?\n```/;
  const normalized = normalizeNewlines(markdown).trimEnd();
  if (re.test(normalized)) {
    return normalized.replace(re, block).trimEnd() + '\n';
  }
  if (normalized.includes('\n---\n')) {
    return `${normalized}\n\n${block}\n`;
  }
  return `${normalized}\n\n---\n\n${block}\n`;
}

function ensureExpandedStatesBlock(markdown: string): string {
  if (!extractExpandedIdsFromMarkdown(markdown).size) return markdown;
  if (/```expanded-states\n[\s\S]*?\n```/.test(markdown)) return markdown;

  const block = buildExpandedStatesBlock(markdown);
  if (!block) return markdown;

  const normalized = markdown.trimEnd();
  if (normalized.includes('\n---\n')) {
    return `${normalized}\n\n${block}\n`;
  }
  return `${normalized}\n\n---\n\n${block}\n`;
}

function unwrapOuterDiagramFence(text: string): string {
  const normalized = normalizeNewlines(text).trim();
  const m = normalized.match(/^```([^\s`]*)\s*\n([\s\S]*?)\n```\s*$/);
  if (!m) return normalized;
  const lang = normalizeText(m[1]).toLowerCase();
  if (lang && lang !== 'diregram' && !lang.includes('diregram') && lang !== 'markdown' && lang !== 'md') {
    return normalized;
  }
  return String(m[2] || '').trim();
}

function isAssistantChatterLine(line: string): boolean {
  const trimmed = normalizeText(line);
  if (!trimmed) return false;
  return /^(?:sure|absolutely|certainly|of course)[,:-]?\s*/i.test(trimmed)
    || /^(?:here(?:'s| is)|below is|the following)\b/i.test(trimmed)
    || /^i(?:'ve| have)?\s+(?:updated|revised|generated|created|prepared|written|fixed|made|put together|drafted)\b/i.test(trimmed)
    || /^(?:summary|note|explanation|overview)[\s:]/i.test(trimmed)
    || /^let me know\b/i.test(trimmed)
    || /^this (?:markdown|document|note|diagram|file|tsx)\b/i.test(trimmed);
}

function stripAssistantMarkdownChatter(raw: string, options?: { preferredStart?: RegExp | null }): string {
  const preferredStart = options?.preferredStart || null;
  const normalized = normalizeNewlines(raw).trim();
  if (!normalized) return normalized;

  let lines = normalized.split('\n');

  if (preferredStart) {
    const preferredIndex = lines.findIndex((line) => preferredStart.test(line.trim()));
    if (preferredIndex > 0) {
      const prefix = lines.slice(0, preferredIndex).filter((line) => line.trim());
      if (prefix.length && prefix.every((line) => isAssistantChatterLine(line) || /^```(?:md|markdown|diregram)?$/i.test(line.trim()))) {
        lines = lines.slice(preferredIndex);
      }
    }
  }

  while (lines.length) {
    const line = lines[0] || '';
    if (!line.trim() || isAssistantChatterLine(line)) {
      lines.shift();
      continue;
    }
    break;
  }

  while (lines.length) {
    const line = lines[lines.length - 1] || '';
    if (!line.trim() || isAssistantChatterLine(line)) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join('\n').trim();
}

function sanitizeDiagramMarkdown(raw: string): string {
  let text = normalizeNewlines(raw).trim();
  if (!text) return makeStarterDiagramMarkdown();
  text = unwrapOuterDiagramFence(text);
  text = stripAssistantMarkdownChatter(text);
  if (!text) return makeStarterDiagramMarkdown();
  text = stripTrailingUnclosedMetadataFence(text);
  text = ensureExpandedStatesBlock(text);
  return ensureNodeLinkMarkers(text);
}

function ensureMetadataSeparator(markdown: string): string {
  const normalized = normalizeNewlines(markdown).trimEnd();
  if (!normalized) return markdown;
  const lines = normalized.split('\n');
  if (findSeparatorIndexOutsideFences(lines) !== -1) return normalized + '\n';
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = String(lines[i] || '').trim();
    if (!/^```/.test(trimmed)) continue;
    const before = lines.slice(0, i).join('\n').trimEnd();
    const after = lines.slice(i).join('\n').trimStart();
    if (!before || !after) return normalized + '\n';
    return `${before}\n\n---\n\n${after}\n`;
  }
  return normalized + '\n';
}

function escapeRegExp(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTreeMarkdown(markdown: string): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const separator = findSeparatorIndexOutsideFences(lines);
  return lines.slice(0, separator === -1 ? lines.length : separator).join('\n').trim();
}

function upsertFencedBlock(markdown: string, type: string, bodyText: string): string {
  const block = `\`\`\`${type}\n${normalizeNewlines(bodyText).trim()}\n\`\`\``;
  const re = new RegExp(String.raw`\`\`\`${escapeRegExp(type)}\n[\s\S]*?\n\`\`\``);
  const normalized = normalizeNewlines(markdown).trimEnd();
  if (re.test(normalized)) {
    return normalized.replace(re, block).trimEnd() + '\n';
  }
  if (normalized.includes('\n---\n')) {
    return `${normalized}\n\n${block}\n`;
  }
  return `${normalized}\n\n---\n\n${block}\n`;
}

function upsertFencedJsonBlock(markdown: string, type: string, payload: unknown): string {
  return upsertFencedBlock(markdown, type, JSON.stringify(payload, null, 2));
}

function buildUploadPromptExcerpt(
  uploadTexts: Array<{ name: string; text: string }>,
  opts: { maxTotalChars: number; perFileChars?: number },
): string {
  let remaining = Math.max(0, opts.maxTotalChars);
  const perFileChars = Math.max(500, Math.min(opts.perFileChars || opts.maxTotalChars, opts.maxTotalChars));
  const out: string[] = [];
  for (const item of uploadTexts) {
    if (remaining <= 0) break;
    const piece = clipText(item.text, Math.min(perFileChars, remaining));
    if (!piece) continue;
    out.push(`## ${safeFileName(item.name)}\n${piece}`);
    remaining -= piece.length;
  }
  return out.join('\n\n');
}

function extractNodeTagsFromLine(line: string): string[] {
  const m = String(line || '').match(/<!--\s*tags:([^>]*)\s*-->/);
  if (!m?.[1]) return [];
  return m[1]
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function extractDataObjectIdFromLine(line: string): string | null {
  const m = String(line || '').match(/<!--\s*do:([^>]+)\s*-->/);
  const value = normalizeText(m?.[1]);
  return value || null;
}

function buildDerivedTagStore(markdown: string): JsonRecord {
  const defaultGroups = [
    { id: 'tg-ungrouped', name: 'ungrouped', order: 0 },
    { id: 'tg-actors', name: 'actors', order: 1 },
    { id: 'tg-uiSurface', name: 'ui surface', order: 2 },
    { id: 'tg-uiType', name: 'ui type', order: 3 },
    { id: 'tg-systems', name: 'system', order: 4 },
  ];

  const classifyTag = (id: string) => {
    if (id.startsWith('actor-')) return 'tg-actors';
    if (id.startsWith('ui-surface-')) return 'tg-uiSurface';
    if (id.startsWith('tag-ui-')) return 'tg-uiType';
    if (id.startsWith('system-') || id.startsWith('tag-system-')) return 'tg-systems';
    return 'tg-ungrouped';
  };

  const humanizeTag = (id: string) =>
    id
      .replace(/^actor-/, '')
      .replace(/^ui-surface-/, '')
      .replace(/^tag-ui-/, '')
      .replace(/^tag-system-/, '')
      .replace(/^tag-/, '')
      .replace(/[-_]+/g, ' ')
      .trim();

  const tagIds = new Set<string>();
  extractNodeSectionLines(markdown).forEach((line) => {
    extractNodeTagsFromLine(line).forEach((id) => tagIds.add(id));
  });

  const tags = Array.from(tagIds)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      groupId: classifyTag(id),
      name: humanizeTag(id) || id,
    }));

  const usedGroupIds = new Set(tags.map((tag) => tag.groupId));
  const groups = defaultGroups.filter((group) => usedGroupIds.has(group.id) || group.id === 'tg-ungrouped');

  return {
    nextGroupId: groups.length + 1,
    nextTagId: tags.length + 1,
    groups,
    tags,
  };
}

type ProgressiveDataObjectTarget = {
  doId: string;
  lineIndex: number;
  label: string;
  parentPath: string[];
};

type ProgressiveExpandedTarget = {
  runningNumber: number;
  lineIndex: number;
  label: string;
  parentPath: string[];
  dataObjectId: string | null;
  subtreeMarkdown: string;
};

type ProgressiveEnrichmentScope = {
  dataObjectIds?: string[];
  expandedRunningNumbers?: number[];
  syncTagStore?: boolean;
};

function extractParentPathForNode(
  node: ReturnType<typeof parseNexusMarkdown>[number],
  nodeById: Map<string, ReturnType<typeof parseNexusMarkdown>[number]>,
): string[] {
  const path: string[] = [];
  let current = node;
  while (current.parentId) {
    const parent = nodeById.get(current.parentId);
    if (!parent) break;
    path.unshift(normalizeText(parent.content) || normalizeText(parent.rawContent) || parent.id);
    current = parent;
  }
  return path;
}

function getSubtreeMarkdownByLine(markdown: string, lineIndex: number): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const range = findSubtreeRange(lines, lineIndex);
  if (!range) return '';
  return lines.slice(range.start, range.end + 1).join('\n').slice(0, MAX_PROGRESSIVE_SCREEN_SUBTREE_CHARS);
}

function extractProgressiveTargets(markdown: string, scope?: ProgressiveEnrichmentScope): {
  dataObjects: ProgressiveDataObjectTarget[];
  expanded: ProgressiveExpandedTarget[];
} {
  const roots = flattenNodes(parseNexusMarkdown(markdown));
  const nodeById = new Map(roots.map((node) => [node.id, node]));
  const nodeByLine = new Map(roots.map((node) => [node.lineIndex, node]));
  const expByLine = extractExpandedIdsFromMarkdown(markdown);
  const lines = normalizeNewlines(markdown).split('\n');
  const separator = findSeparatorIndexOutsideFences(lines);
  const sectionEnd = separator === -1 ? lines.length : separator;
  const allowedDataObjectIds = scope?.dataObjectIds?.length ? new Set(scope.dataObjectIds.map((id) => normalizeText(id)).filter(Boolean)) : null;
  const allowedExpandedRunningNumbers = scope?.expandedRunningNumbers?.length
    ? new Set(scope.expandedRunningNumbers.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n > 0))
    : null;

  const dataObjects: ProgressiveDataObjectTarget[] = [];
  let inFence = false;
  for (let lineIndex = 0; lineIndex < sectionEnd; lineIndex += 1) {
    const rawLine = String(lines[lineIndex] || '');
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const doId = extractDataObjectIdFromLine(rawLine);
    if (!doId) continue;
    if (allowedDataObjectIds && !allowedDataObjectIds.has(doId)) continue;
    const node = nodeByLine.get(lineIndex);
    if (!node) continue;
    if (dataObjects.some((item) => item.doId === doId)) continue;
    dataObjects.push({
      doId,
      lineIndex,
      label: normalizeText(node.content) || normalizeText(node.rawContent) || node.id,
      parentPath: extractParentPathForNode(node, nodeById),
    });
    if (dataObjects.length >= MAX_PROGRESSIVE_DATA_OBJECT_IDS) break;
  }

  const expanded = Array.from(expByLine.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([lineIndex, runningNumber]) => {
      if (allowedExpandedRunningNumbers && !allowedExpandedRunningNumbers.has(runningNumber)) return null;
      const node = nodeByLine.get(lineIndex);
      if (!node) return null;
      const rawLine = lines[lineIndex] || '';
      return {
        runningNumber,
        lineIndex,
        label: normalizeText(node.content) || normalizeText(node.rawContent) || node.id,
        parentPath: extractParentPathForNode(node, nodeById),
        dataObjectId: extractDataObjectIdFromLine(rawLine),
        subtreeMarkdown: getSubtreeMarkdownByLine(markdown, lineIndex),
      } satisfies ProgressiveExpandedTarget;
    })
    .filter((value): value is ProgressiveExpandedTarget => value !== null);

  return { dataObjects, expanded };
}

function extractDataObjectIdsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const lines = normalizeNewlines(text).split('\n');
  lines.forEach((line) => {
    const doId = extractDataObjectIdFromLine(line);
    if (!doId || seen.has(doId)) return;
    seen.add(doId);
    out.push(doId);
  });
  return out;
}

function extractExpandedRunningNumbersFromText(text: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const re = /<!--\s*expid:(\d+)\s*-->/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(normalizeNewlines(text)))) {
    const value = Number.parseInt(String(match[1] || ''), 10);
    if (!Number.isFinite(value) || value <= 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function buildProgressiveScopeFromTargets(input: {
  targets: MarkdownFixTarget[];
  patches?: TargetedMarkdownPatch[];
}): ProgressiveEnrichmentScope {
  const targetById = new Map(input.targets.map((target) => [target.id, target] as const));
  const selectedTargets = input.patches?.length
    ? input.patches
        .map((patch) => targetById.get(patch.targetId) || null)
        .filter((target): target is MarkdownFixTarget => target !== null)
    : input.targets;

  const dataObjectIds = new Set<string>();
  const expandedRunningNumbers = new Set<number>();

  const collectSignals = (text: string) => {
    extractDataObjectIdsFromText(text).forEach((doId) => dataObjectIds.add(doId));
    extractExpandedRunningNumbersFromText(text).forEach((runningNumber) => expandedRunningNumbers.add(runningNumber));
  };

  selectedTargets.forEach((target) => {
    collectSignals(target.originalMarkdown);
    collectSignals(target.contextMarkdown);
  });
  (input.patches || []).forEach((patch) => collectSignals(patch.replacementMarkdown));

  return {
    syncTagStore: true,
    dataObjectIds: Array.from(dataObjectIds).sort((a, b) => a.localeCompare(b)),
    expandedRunningNumbers: Array.from(expandedRunningNumbers).sort((a, b) => a - b),
  };
}

type FencedBlockRange = {
  type: string;
  startLine: number;
  endLine: number;
};

function collectFencedBlockRanges(markdown: string): FencedBlockRange[] {
  const lines = normalizeNewlines(markdown).split('\n');
  const out: FencedBlockRange[] = [];
  let openType: string | null = null;
  let openStart = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = String(lines[i] || '').trim();
    const match = trimmed.match(/^```([^\s`]+)\s*$/);
    if (!match?.[1]) continue;
    if (openType === null) {
      openType = normalizeText(match[1]);
      openStart = i;
      continue;
    }
    out.push({
      type: openType,
      startLine: openStart + 1,
      endLine: i + 1,
    });
    openType = null;
    openStart = -1;
  }

  return out;
}

function buildPostSuccessContentAuditTargets(markdown: string): MarkdownFixTarget[] {
  const lines = normalizeNewlines(markdown).split('\n');
  const separatorIndex = findSeparatorIndexOutsideFences(lines);
  const metadataInsertStartLine = separatorIndex === -1 ? lines.length + 1 : separatorIndex + 2;
  const metadataInsertEndLine = metadataInsertStartLine - 1;
  const blocks = collectFencedBlockRanges(markdown);
  const blockByType = new Map(blocks.map((block) => [block.type, block] as const));
  const roots = parseNexusMarkdown(markdown);
  const nodes = flattenNodes(roots);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const expandedTargets = extractProgressiveTargets(markdown).expanded;

  const out: MarkdownFixTarget[] = [];
  const usedRanges: Array<{ startLine: number; endLine: number }> = [];

  const overlapsExisting = (startLine: number, endLine: number) =>
    usedRanges.some((range) => !(endLine < range.startLine || startLine > range.endLine));

  const addTarget = (
    range: { startLine: number; endLine: number },
    targetKind: 'tree' | 'metadata',
    reason: string,
    issueCode: string,
  ) => {
    if (out.length >= MAX_DIAGRAM_FIX_TARGETS) return;
    const clamped = clampLineRange(range, lines.length);
    const overlapEnd = Math.max(clamped.endLine, clamped.startLine - 1);
    if (overlapsExisting(clamped.startLine, overlapEnd)) return;
    usedRanges.push({ startLine: clamped.startLine, endLine: overlapEnd });
    out.push({
      id: `content-audit-${out.length + 1}`,
      startLine: clamped.startLine,
      endLine: clamped.endLine,
      targetKind,
      reason: clipText(reason, 280),
      issueCodes: [issueCode],
      contextMarkdown: extractContextMarkdownForRange(lines, clamped.startLine, clamped.endLine),
      originalMarkdown: extractOriginalMarkdownForRange(lines, clamped.startLine, clamped.endLine),
    });
  };

  const flowCandidates = nodes
    .filter((node) => /#flow#/.test(node.rawContent) && !/#flowtab#/.test(node.rawContent) && !/#systemflow#/.test(node.rawContent))
    .sort((a, b) => (b.children.length - a.children.length) || (a.lineIndex - b.lineIndex));

  for (const node of flowCandidates) {
    const subtree = findSubtreeRange(lines, node.lineIndex);
    if (!subtree) continue;
    const parentPath = extractParentPathForNode(node, nodeById);
    const label = normalizeText(node.content) || normalizeText(node.rawContent) || node.id;
    addTarget(
      { startLine: subtree.start + 1, endLine: subtree.end + 1 },
      'tree',
      [
        'Audit this #flow# subtree for concrete step structure, branching-vs-conditional correctness, and same-screen grouping.',
        `Root: ${label}.`,
        `Parent path: ${parentPath.join(' > ') || '(root)'}.`,
        `Direct children: ${node.children.length}.`,
      ].join(' '),
      'CONTENT_PROCESS_FLOWS',
    );
    if (out.length >= MAX_DIAGRAM_FIX_TARGETS - 1) break;
  }

  for (const screen of expandedTargets) {
    const metadataBlock = blockByType.get(`expanded-metadata-${screen.runningNumber}`);
    if (metadataBlock) {
      addTarget(
        { startLine: metadataBlock.startLine, endLine: metadataBlock.endLine },
        'metadata',
        `Audit expanded metadata for screen "${screen.label}" (expid:${screen.runningNumber}) so its primary object and layout metadata match the actual screen intent.`,
        'CONTENT_EXPANDED_METADATA',
      );
    }
    const gridBlock = blockByType.get(`expanded-grid-${screen.runningNumber}`);
    if (gridBlock) {
      addTarget(
        { startLine: gridBlock.startLine, endLine: gridBlock.endLine },
        'metadata',
        `Audit expanded grid for screen "${screen.label}" (expid:${screen.runningNumber}). Fix vague or wrong UI content by adding structured sections/components, not by removing the screen.`,
        'CONTENT_EXPANDED_GRID',
      );
    }
    if (out.length >= MAX_DIAGRAM_FIX_TARGETS - 1) break;
  }

  for (const root of roots) {
    const subtree = findSubtreeRange(lines, root.lineIndex);
    if (!subtree) continue;
    const label = normalizeText(root.content) || normalizeText(root.rawContent) || root.id;
    addTarget(
      { startLine: subtree.start + 1, endLine: subtree.end + 1 },
      'tree',
      `Audit IA/root structure for "${label}". Group related screens/functions correctly and keep process/component detail out of plain IA nodes.`,
      'CONTENT_IA',
    );
    if (out.length >= MAX_DIAGRAM_FIX_TARGETS - 1) break;
  }

  addTarget(
    { startLine: metadataInsertStartLine, endLine: metadataInsertEndLine },
    'metadata',
    'Add or update metadata blocks required by the content audit, including flow-nodes, process-node-type-N, process-single-screen-N, flow-connector-labels, expanded-metadata-N, or expanded-grid-N when the current tree requires them.',
    'CONTENT_METADATA',
  );

  return out;
}

function normalizeGeneratedGridNodes(input: unknown[], runningNumber: number): ExpandedGridNodeRuntime[] {
  const out: ExpandedGridNodeRuntime[] = [];
  input.forEach((node, index) => {
    if (!node || typeof node !== 'object') return;
    const rec = node as JsonRecord;
    const key = normalizeText(rec.key) || `grid-${runningNumber}-${index + 1}`;
    const content = normalizeText(rec.content) || `Section ${index + 1}`;
    const gridX = Number.isFinite(Number(rec.gridX)) ? Number(rec.gridX) : 0;
    const gridY = Number.isFinite(Number(rec.gridY)) ? Number(rec.gridY) : index * 2;
    const gridWidth = Number.isFinite(Number(rec.gridWidth)) ? Number(rec.gridWidth) : 4;
    const gridHeight = Number.isFinite(Number(rec.gridHeight)) ? Number(rec.gridHeight) : 2;
    out.push({
      ...(rec as unknown as ExpandedGridNodeRuntime),
      key,
      id: key,
      content,
      gridX,
      gridY,
      gridWidth,
      gridHeight,
    });
  });
  return out;
}

function upsertExpandedMetadataBlock(markdown: string, runningNumber: number, metadata: unknown): string {
  return upsertFencedJsonBlock(markdown, `expanded-metadata-${runningNumber}`, metadata);
}

function upsertExpandedGridBlock(markdown: string, runningNumber: number, nodes: ExpandedGridNodeRuntime[]): string {
  const persisted = nodes.map((node) => {
    const { id, ...rest } = node;
    void id;
    return rest;
  });
  return upsertFencedJsonBlock(markdown, `expanded-grid-${runningNumber}`, persisted);
}

function summarizeCurrentDataObjects(markdown: string): string {
  const match = normalizeNewlines(markdown).match(/```data-objects\n([\s\S]*?)\n```/);
  if (!match?.[1]) return '(none)';
  const obj = parseJsonObject(match[1]);
  const rows = Array.isArray(obj?.objects) ? (obj!.objects as unknown[]) : [];
  return rows
    .map((item) => (item && typeof item === 'object' ? (item as JsonRecord) : null))
    .filter((item): item is JsonRecord => item !== null)
    .map((item) => `${normalizeText(item.id)}:${normalizeText(item.name)}`)
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000);
}

type FlowRegistryEntry = {
  runningNumber: number;
  content: string;
  parentPath: string[];
  lineIndex: number;
};

function parseFlowRegistryBlock(markdown: string): { nextRunningNumber: number; entries: FlowRegistryEntry[] } {
  const match = normalizeNewlines(markdown).match(/```flow-nodes\n([\s\S]*?)\n```/);
  const parsed = match?.[1] ? parseJsonObject(match[1]) : null;
  const entries = Array.isArray(parsed?.entries)
    ? parsed.entries
        .map((row) => (row && typeof row === 'object' ? (row as JsonRecord) : null))
        .filter((row): row is JsonRecord => row !== null)
        .map((row) => ({
          runningNumber: Math.floor(Number(row.runningNumber || 0)),
          content: normalizeText(row.content),
          parentPath: Array.isArray(row.parentPath) ? row.parentPath.map((item) => normalizeText(item)).filter(Boolean) : [],
          lineIndex: Math.floor(Number(row.lineIndex || -1)),
        }))
        .filter((entry) => Number.isFinite(entry.runningNumber) && entry.runningNumber > 0 && entry.lineIndex >= 0)
    : [];
  const maxRn = Math.max(0, ...entries.map((entry) => entry.runningNumber));
  const nextRunningNumberRaw = Math.floor(Number(parsed?.nextRunningNumber || 0));
  return {
    nextRunningNumber: Math.max(1, nextRunningNumberRaw, maxRn + 1),
    entries,
  };
}

function parseProcessNodeTypeBlocks(markdown: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /```process-node-type-(\d+)\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(normalizeNewlines(markdown)))) {
    const runningNumber = Number.parseInt(String(match[1] || ''), 10);
    const parsed = parseJsonObject(String(match[2] || ''));
    const type = normalizeText(parsed?.type);
    if (!Number.isFinite(runningNumber) || runningNumber <= 0 || !type) continue;
    out.set(runningNumber, type);
  }
  return out;
}

function parseProcessSingleScreenBlocks(markdown: string): Map<number, number> {
  const out = new Map<number, number>();
  const re = /```process-single-screen-(\d+)\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(normalizeNewlines(markdown)))) {
    const startRunningNumber = Number.parseInt(String(match[1] || ''), 10);
    const parsed = parseJsonObject(String(match[2] || ''));
    const lastStepRunningNumber = Math.floor(Number(parsed?.lastStepRunningNumber || 0));
    if (!Number.isFinite(startRunningNumber) || startRunningNumber <= 0) continue;
    if (!Number.isFinite(lastStepRunningNumber) || lastStepRunningNumber <= 0) continue;
    out.set(startRunningNumber, lastStepRunningNumber);
  }
  return out;
}

function parseProcessTargetBlocks(markdown: string, kind: 'process-goto' | 'process-loop'): Map<number, string> {
  const out = new Map<number, string>();
  const re = new RegExp(`^\\\`\\\`\\\`(${escapeRegExp(kind)})-(\\d+)\\n([\\s\\S]*?)\\n\\\`\\\`\\\`$`, 'gm');
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(normalizeNewlines(markdown)))) {
    const runningNumber = Number.parseInt(String(match[2] || ''), 10);
    const parsed = parseJsonObject(String(match[3] || ''));
    const targetId = normalizeText(parsed?.targetId);
    if (!Number.isFinite(runningNumber) || runningNumber <= 0 || !targetId) continue;
    out.set(runningNumber, targetId);
  }
  return out;
}

function parseConnectorLabelBlocks(markdown: string): Record<string, { label: string; color: string }> {
  const match = normalizeNewlines(markdown).match(/```flow-connector-labels\n([\s\S]*?)\n```/);
  const parsed = match?.[1] ? parseJsonObject(match[1]) : null;
  const out: Record<string, { label: string; color: string }> = {};
  if (!parsed) return out;
  Object.entries(parsed).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    const row = value as JsonRecord;
    const label = String(row.label || '').trim();
    if (!label) return;
    const color = String(row.color || '#000000').trim() || '#000000';
    out[key] = { label, color };
  });
  return out;
}

function removeMatchingFencedBlocks(markdown: string, predicate: (type: string) => boolean): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const blocks = collectFencedBlockRanges(markdown)
    .filter((block) => predicate(block.type))
    .sort((a, b) => b.startLine - a.startLine);
  if (!blocks.length) return normalizeNewlines(markdown).trimEnd() + '\n';
  const next = [...lines];
  blocks.forEach((block) => {
    next.splice(block.startLine - 1, block.endLine - block.startLine + 1);
  });
  return next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function deriveFlowNodeParentPath(
  node: ReturnType<typeof parseNexusMarkdown>[number],
  nodeMap: Map<string, ReturnType<typeof parseNexusMarkdown>[number]>,
  roots: ReturnType<typeof parseNexusMarkdown>,
): string[] {
  return node.isCommon ? buildParentPath(node, nodeMap) : buildFlowNodeParentPath(node, nodeMap, roots);
}

function buildCurrentFlowRegistry(markdown: string): {
  nodes: ReturnType<typeof parseNexusMarkdown>[number][];
  entries: FlowRegistryEntry[];
  runningNumberToNodeId: Map<number, string>;
  nextRunningNumber: number;
} {
  const roots = parseNexusMarkdown(markdown);
  const nodes = flattenNodes(roots);
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const flowNodes = nodes.filter((node) => node.isFlowNode).sort((a, b) => a.lineIndex - b.lineIndex);
  const existingRegistry = parseFlowRegistryBlock(markdown);
  const usedEntryIndexes = new Set<number>();
  const entries: FlowRegistryEntry[] = [];
  const runningNumberToNodeId = new Map<number, string>();
  let nextRunningNumber = Math.max(
    1,
    existingRegistry.nextRunningNumber,
    ...existingRegistry.entries.map((entry) => entry.runningNumber + 1),
  );

  const findEntryIndex = (node: ReturnType<typeof parseNexusMarkdown>[number], parentPath: string[]) => {
    const exactIndex = existingRegistry.entries.findIndex((entry, index) => {
      if (usedEntryIndexes.has(index)) return false;
      return (
        entry.content === normalizeText(node.content) &&
        entry.parentPath.length === parentPath.length &&
        entry.parentPath.every((segment, idx) => segment === parentPath[idx])
      );
    });
    if (exactIndex !== -1) return exactIndex;
    return existingRegistry.entries.findIndex((entry, index) => {
      if (usedEntryIndexes.has(index)) return false;
      return entry.lineIndex === node.lineIndex && entry.content === normalizeText(node.content);
    });
  };

  flowNodes.forEach((node) => {
    const parentPath = deriveFlowNodeParentPath(node, nodeById, roots);
    const entryIndex = findEntryIndex(node, parentPath);
    let runningNumber = 0;
    if (entryIndex !== -1) {
      usedEntryIndexes.add(entryIndex);
      runningNumber = existingRegistry.entries[entryIndex]!.runningNumber;
    } else {
      runningNumber = nextRunningNumber;
      nextRunningNumber += 1;
    }
    entries.push({
      runningNumber,
      content: normalizeText(node.content) || normalizeText(node.rawContent) || node.id,
      parentPath,
      lineIndex: node.lineIndex,
    });
    runningNumberToNodeId.set(runningNumber, node.id);
  });

  entries.sort((a, b) => a.runningNumber - b.runningNumber);
  return {
    nodes,
    entries,
    runningNumberToNodeId,
    nextRunningNumber: Math.max(nextRunningNumber, ...entries.map((entry) => entry.runningNumber + 1), 1),
  };
}

function remapLegacyNodeIdToCurrentNodeId(input: {
  legacyNodeId: string;
  oldLineIndexToRunningNumber: Map<number, number>;
  currentRunningNumberToNodeId: Map<number, string>;
  currentNodeIds: Set<string>;
}): string | null {
  const legacyNodeId = normalizeText(input.legacyNodeId);
  if (!legacyNodeId) return null;
  if (input.currentNodeIds.has(legacyNodeId)) return legacyNodeId;
  const match = legacyNodeId.match(/^node-(\d+)$/);
  if (!match?.[1]) return null;
  const lineIndex = Number.parseInt(match[1], 10);
  if (!Number.isFinite(lineIndex) || lineIndex < 0) return null;
  const runningNumber = input.oldLineIndexToRunningNumber.get(lineIndex);
  if (typeof runningNumber !== 'number') return null;
  return input.currentRunningNumberToNodeId.get(runningNumber) || null;
}

function syncDerivedFlowMetadata(markdown: string): string {
  const normalized = sanitizeDiagramMarkdown(markdown);
  const currentRegistry = buildCurrentFlowRegistry(normalized);
  const validRunningNumbers = new Set(currentRegistry.entries.map((entry) => entry.runningNumber));
  const explicitTypesByRunningNumber = parseProcessNodeTypeBlocks(normalized);
  const singleScreenByRunningNumber = parseProcessSingleScreenBlocks(normalized);
  const gotoTargetsByRunningNumber = parseProcessTargetBlocks(normalized, 'process-goto');
  const loopTargetsByRunningNumber = parseProcessTargetBlocks(normalized, 'process-loop');
  const connectorLabels = parseConnectorLabelBlocks(normalized);
  const previousRegistry = parseFlowRegistryBlock(normalized);
  const oldLineIndexToRunningNumber = new Map(
    previousRegistry.entries.map((entry) => [entry.lineIndex, entry.runningNumber] as const),
  );
  const currentNodeIds = new Set(currentRegistry.nodes.map((node) => node.id));
  const currentNodeById = new Map(currentRegistry.nodes.map((node) => [node.id, node] as const));

  let next = removeMatchingFencedBlocks(normalized, (type) => {
    if (type === 'flow-nodes' || type === 'flow-connector-labels') return true;
    if (/^process-node-type-\d+$/.test(type)) return true;
    if (/^process-single-screen-\d+$/.test(type)) return true;
    if (/^process-goto-\d+$/.test(type)) return true;
    if (/^process-loop-\d+$/.test(type)) return true;
    const flowNodeMatch = type.match(/^flow-node-(\d+)$/);
    if (!flowNodeMatch?.[1]) return false;
    const runningNumber = Number.parseInt(flowNodeMatch[1], 10);
    return !validRunningNumbers.has(runningNumber);
  });

  if (!currentRegistry.entries.length) {
    return next;
  }

  next = upsertFencedJsonBlock(next, 'flow-nodes', {
    nextRunningNumber: currentRegistry.nextRunningNumber,
    entries: currentRegistry.entries,
  });

  Array.from(explicitTypesByRunningNumber.entries())
    .filter(([runningNumber]) => validRunningNumbers.has(runningNumber))
    .sort((a, b) => a[0] - b[0])
    .forEach(([runningNumber, type]) => {
      next = upsertFencedJsonBlock(next, `process-node-type-${runningNumber}`, {
        type,
        nodeId: currentRegistry.runningNumberToNodeId.get(runningNumber) || '',
      });
    });

  Array.from(singleScreenByRunningNumber.entries())
    .filter(
      ([startRunningNumber, lastStepRunningNumber]) =>
        validRunningNumbers.has(startRunningNumber) &&
        validRunningNumbers.has(lastStepRunningNumber) &&
        explicitTypesByRunningNumber.get(startRunningNumber) === 'single_screen_steps',
    )
    .sort((a, b) => a[0] - b[0])
    .forEach(([startRunningNumber, lastStepRunningNumber]) => {
      next = upsertFencedJsonBlock(next, `process-single-screen-${startRunningNumber}`, {
        lastStepRunningNumber,
      });
    });

  Array.from(gotoTargetsByRunningNumber.entries())
    .filter(([runningNumber]) => validRunningNumbers.has(runningNumber) && explicitTypesByRunningNumber.get(runningNumber) === 'goto')
    .sort((a, b) => a[0] - b[0])
    .forEach(([runningNumber, targetId]) => {
      const remappedTargetId = remapLegacyNodeIdToCurrentNodeId({
        legacyNodeId: targetId,
        oldLineIndexToRunningNumber,
        currentRunningNumberToNodeId: currentRegistry.runningNumberToNodeId,
        currentNodeIds,
      });
      if (!remappedTargetId) return;
      next = upsertFencedJsonBlock(next, `process-goto-${runningNumber}`, {
        targetId: remappedTargetId,
      });
    });

  Array.from(loopTargetsByRunningNumber.entries())
    .filter(([runningNumber]) => validRunningNumbers.has(runningNumber) && explicitTypesByRunningNumber.get(runningNumber) === 'loop')
    .sort((a, b) => a[0] - b[0])
    .forEach(([runningNumber, targetId]) => {
      const remappedTargetId = remapLegacyNodeIdToCurrentNodeId({
        legacyNodeId: targetId,
        oldLineIndexToRunningNumber,
        currentRunningNumberToNodeId: currentRegistry.runningNumberToNodeId,
        currentNodeIds,
      });
      if (!remappedTargetId) return;
      next = upsertFencedJsonBlock(next, `process-loop-${runningNumber}`, {
        targetId: remappedTargetId,
      });
    });

  const remappedConnectorLabels = Object.entries(connectorLabels).reduce<Record<string, { label: string; color: string }>>((acc, [key, value]) => {
    const [legacyFromId, legacyToId] = key.split('__');
    if (!legacyFromId || !legacyToId) return acc;
    const fromId = remapLegacyNodeIdToCurrentNodeId({
      legacyNodeId: legacyFromId,
      oldLineIndexToRunningNumber,
      currentRunningNumberToNodeId: currentRegistry.runningNumberToNodeId,
      currentNodeIds,
    });
    const toId = remapLegacyNodeIdToCurrentNodeId({
      legacyNodeId: legacyToId,
      oldLineIndexToRunningNumber,
      currentRunningNumberToNodeId: currentRegistry.runningNumberToNodeId,
      currentNodeIds,
    });
    if (!fromId || !toId) return acc;
    const parent = currentNodeById.get(fromId);
    if (!parent?.children.some((child) => child.id === toId)) return acc;
    acc[`${fromId}__${toId}`] = {
      label: String(value.label || '').trim(),
      color: String(value.color || '#000000').trim() || '#000000',
    };
    return acc;
  }, {});

  if (Object.keys(remappedConnectorLabels).length) {
    next = upsertFencedJsonBlock(next, 'flow-connector-labels', remappedConnectorLabels);
  }

  return sanitizeDiagramMarkdown(next);
}

function extractDataObjectAttributeIdsFromLine(line: string): string[] {
  const m = String(line || '').match(/<!--\s*doattrs:([^>]+)\s*-->/);
  if (!m?.[1]) return [];
  return m[1]
    .split(',')
    .map((x) => normalizeText(x))
    .filter(Boolean)
    .slice(0, 24);
}

function humanizeIdentifier(input: string): string {
  const raw = normalizeText(input)
    .replace(/^do-/, '')
    .replace(/^attr-/, '')
    .replace(/^__+|__+$/g, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!raw) return 'Value';
  return raw.replace(/\b\w/g, (m) => m.toUpperCase());
}

function buildDerivedDataObjectsStore(markdown: string): JsonRecord | null {
  const existingMatch = normalizeNewlines(markdown).match(/```data-objects\n([\s\S]*?)\n```/);
  const existingStore = existingMatch ? parseJsonObject(existingMatch[1]) : null;
  const existingObjectsRaw = Array.isArray(existingStore?.objects) ? (existingStore.objects as unknown[]) : [];
  const existingById = new Map(
    existingObjectsRaw
      .map((row) => (row && typeof row === 'object' ? (row as JsonRecord) : null))
      .filter((row): row is JsonRecord => row !== null)
      .map((row) => [normalizeText(row.id), row] as const)
      .filter(([id]) => Boolean(id)),
  );

  const roots = flattenNodes(parseNexusMarkdown(markdown));
  const nodeByLine = new Map(roots.map((node) => [node.lineIndex, node]));
  const lines = normalizeNewlines(markdown).split('\n');
  const separator = findSeparatorIndexOutsideFences(lines);
  const sectionEnd = separator === -1 ? lines.length : separator;
  const refs = new Map<string, { name: string; attrIds: Set<string> }>();

  let inFence = false;
  for (let lineIndex = 0; lineIndex < sectionEnd; lineIndex += 1) {
    const rawLine = String(lines[lineIndex] || '');
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const doId = extractDataObjectIdFromLine(rawLine);
    if (!doId) continue;
    const node = nodeByLine.get(lineIndex);
    const label = normalizeText(node?.content) || normalizeText(node?.rawContent) || humanizeIdentifier(doId);
    if (!refs.has(doId)) {
      refs.set(doId, { name: label, attrIds: new Set<string>() });
    }
    extractDataObjectAttributeIdsFromLine(rawLine).forEach((attrId) => refs.get(doId)?.attrIds.add(attrId));
  }

  if (!refs.size && !existingById.size) return null;

  let nextId = Number(existingStore?.nextId || 1);
  refs.forEach((_value, doId) => {
    const m = doId.match(/^do-(\d+)$/);
    const n = m?.[1] ? Number.parseInt(m[1], 10) : NaN;
    if (Number.isFinite(n)) nextId = Math.max(nextId, n + 1);
  });

  const orderedIds = Array.from(new Set<string>([...existingById.keys(), ...refs.keys()])).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const objects = orderedIds.map((doId) => {
    const existing = existingById.get(doId);
    const ref = refs.get(doId);
    const existingData = existing && typeof existing.data === 'object' && existing.data ? ({ ...(existing.data as JsonRecord) } as JsonRecord) : {};
    const existingAttrs = Array.isArray(existingData.attributes)
      ? (existingData.attributes as unknown[])
          .map((row) => (row && typeof row === 'object' ? ({ ...(row as JsonRecord) } as JsonRecord) : null))
          .filter((row): row is JsonRecord => row !== null)
      : [];
    const attrById = new Map(
      existingAttrs
        .map((attr) => [normalizeText(attr.id), attr] as const)
        .filter(([id]) => Boolean(id)),
    );
    for (const attrId of ref?.attrIds || []) {
      if (attrById.has(attrId)) continue;
      attrById.set(attrId, {
        id: attrId,
        name: humanizeIdentifier(attrId),
        type: /status|state/i.test(attrId) ? 'status' : 'text',
        ...( /status|state/i.test(attrId) ? { values: ['draft', 'active', 'archived'] } : {} ),
      });
    }
    const nextData: JsonRecord = { ...existingData };
    if (attrById.size) nextData.attributes = Array.from(attrById.values());
    return {
      id: doId,
      name: normalizeText(existing?.name) || ref?.name || humanizeIdentifier(doId),
      annotation:
        normalizeText(existing?.annotation) || (ref?.name ? `Auto-synthesized from diagram reference "${ref.name}".` : undefined),
      data: nextData,
    };
  });

  return {
    nextId,
    objects,
  };
}

function autoFixDeterministicValidationIssues(markdown: string, validation: ImportValidationResult): string {
  const issueCodes = new Set([...validation.errors, ...validation.warnings].map((issue) => issue.code));
  let next = normalizeNewlines(markdown).trimEnd() + '\n';

  if (issueCodes.has('MISSING_SEPARATOR')) {
    next = ensureMetadataSeparator(next);
  }

  if (
    issueCodes.has('MISSING_TAG_STORE') ||
    issueCodes.has('UNKNOWN_TAG_GROUP') ||
    issueCodes.has('MISSING_REQUIRED_TAG_GROUP')
  ) {
    next = upsertFencedJsonBlock(next, 'tag-store', buildDerivedTagStore(next));
  }

  if (
    issueCodes.has('MISSING_DATA_OBJECTS_BLOCK') ||
    issueCodes.has('UNKNOWN_DATA_OBJECT_ID') ||
    issueCodes.has('UNKNOWN_DATA_OBJECT_ATTRIBUTE_ID')
  ) {
    const store = buildDerivedDataObjectsStore(next);
    if (store) {
      next = upsertFencedJsonBlock(next, 'data-objects', store);
    }
  }

  if (
    issueCodes.has('MISSING_EXPANDED_STATES_BLOCK') ||
    issueCodes.has('EXPANDED_MISSING_EXPID') ||
    issueCodes.has('EXPID_MISSING_ENTRY') ||
    issueCodes.has('EXPANDED_ENTRY_CONTENT_MISMATCH') ||
    issueCodes.has('EXPANDED_ENTRY_NO_NODE') ||
    issueCodes.has('BAD_EXPANDED_ENTRY')
  ) {
    next = syncExpandedStatesBlock(next);
  }

  next = syncDerivedFlowMetadata(next);
  return sanitizeDiagramMarkdown(next);
}

async function progressivelyEnrichDiagramMarkdown(input: {
  generation: PipelineGenerationConfig;
  markdown: string;
  uploadTexts: Array<{ name: string; text: string }>;
  attempt?: number;
  modePrefix?: string;
  scope?: ProgressiveEnrichmentScope;
  onMonitorUpdate?: (event: {
    attempt: number;
    mode: string;
    markdown: string;
    validation: ImportValidationResult;
  }) => Promise<void> | void;
}): Promise<string> {
  const emit = async (mode: string, markdown: string) => {
    if (!input.onMonitorUpdate) return;
    await input.onMonitorUpdate({
      attempt: Math.max(0, Math.floor(Number(input.attempt || 0))),
      mode: input.modePrefix ? `${input.modePrefix}_${mode}` : mode,
      markdown,
      validation: validateNexusMarkdownImport(markdown),
    });
  };

  let markdown = sanitizeDiagramMarkdown(input.markdown);
  const sourceExcerpt = buildUploadPromptExcerpt(input.uploadTexts, {
    maxTotalChars: MAX_PROGRESSIVE_SOURCE_CHARS,
    perFileChars: 7000,
  });

  if (input.scope?.syncTagStore !== false) {
    markdown = upsertFencedJsonBlock(markdown, 'tag-store', buildDerivedTagStore(markdown));
    await emit('progressive_tag_store', markdown);
  }

  const targets = extractProgressiveTargets(markdown, input.scope);
  if (targets.dataObjects.length) {
    const doPrompt = [
      'Return JSON only for the body of a ```data-objects``` block.',
      'Do not return markdown fences.',
      'Define every referenced do-* id exactly once. Avoid creating unreferenced extra objects.',
      'Keep the payload compact but practical for the linked flows/screens.',
      'Prefer data.attributes with stable attr ids and optional relations.',
      '',
      'Referenced data object ids:',
      JSON.stringify(targets.dataObjects, null, 2),
      '',
      'Current tree:',
      clipText(getTreeMarkdown(markdown), MAX_PROGRESSIVE_TREE_CHARS),
      '',
      'Source excerpt:',
      sourceExcerpt || '(none)',
    ].join('\n');

    const out = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 3200,
      temperature: 0.1,
      system: [
        'You are editing one existing Diregram markdown file progressively.',
        'Generate only the data-objects block body as strict JSON.',
        'This is a partial-file update, not a full-document rewrite.',
      ].join('\n'),
      messages: [{ role: 'user', content: doPrompt }],
    });

    const dataObjectsJson = parseJsonObject(out);
    if (dataObjectsJson) {
      markdown = upsertFencedJsonBlock(markdown, 'data-objects', dataObjectsJson);
      await emit('progressive_data_objects', markdown);
    }
  }

  const batches: ProgressiveExpandedTarget[][] = [];
  for (let i = 0; i < targets.expanded.length; i += MAX_PROGRESSIVE_SCREEN_BATCH_SIZE) {
    batches.push(targets.expanded.slice(i, i + MAX_PROGRESSIVE_SCREEN_BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    if (!batch.length) continue;
    const batchPrompt = [
      'Return JSON only using this schema:',
      '{ "screens": [ { "runningNumber": 1, "metadata": { ... }, "grid": [ ... ] } ] }',
      'Do not return markdown fences.',
      'Only include the requested running numbers.',
      'This is a partial-file update. You are filling expanded screen blocks only for the provided screens.',
      'Use compact but concrete UI structure.',
      '',
      'Known data objects:',
      summarizeCurrentDataObjects(markdown),
      '',
      'Target screens:',
      JSON.stringify(
        batch.map((screen) => ({
          runningNumber: screen.runningNumber,
          lineIndex: screen.lineIndex,
          label: screen.label,
          parentPath: screen.parentPath,
          dataObjectId: screen.dataObjectId,
          subtreeMarkdown: screen.subtreeMarkdown,
        })),
        null,
        2,
      ),
      '',
      'Tree excerpt:',
      clipText(getTreeMarkdown(markdown), MAX_PROGRESSIVE_TREE_CHARS),
      '',
      'Source excerpt:',
      sourceExcerpt || '(none)',
    ].join('\n');

    const out = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 3200,
      temperature: 0.1,
      system: [
        'You are editing one existing Diregram markdown file progressively.',
        'Generate only expanded-metadata-N and expanded-grid-N payloads for the requested screens.',
        'Return strict JSON matching the requested schema.',
      ].join('\n'),
      messages: [{ role: 'user', content: batchPrompt }],
    });

    const parsed = parseJsonObject(out);
    const screens = Array.isArray(parsed?.screens) ? (parsed!.screens as unknown[]) : [];
    screens.forEach((screen) => {
      if (!screen || typeof screen !== 'object') return;
      const rec = screen as JsonRecord;
      const runningNumber = Number.parseInt(String(rec.runningNumber || ''), 10);
      if (!Number.isFinite(runningNumber) || runningNumber <= 0) return;
      const metadata = rec.metadata && typeof rec.metadata === 'object' ? (rec.metadata as JsonRecord) : {};
      const gridRaw = Array.isArray(rec.grid) ? (rec.grid as unknown[]) : [];
      markdown = upsertExpandedMetadataBlock(markdown, runningNumber, metadata);
      markdown = upsertExpandedGridBlock(markdown, runningNumber, normalizeGeneratedGridNodes(gridRaw, runningNumber));
    });

    markdown = sanitizeDiagramMarkdown(markdown);
    await emit(`progressive_expanded_batch_${i + 1}`, markdown);
  }

  markdown = syncDerivedFlowMetadata(markdown);
  await emit('progressive_flow_metadata', markdown);
  return markdown;
}

async function progressivelyRestabilizeEditedDiagram(input: {
  generation: PipelineGenerationConfig;
  markdown: string;
  uploadTexts: Array<{ name: string; text: string }>;
  attempt?: number;
  modePrefix: string;
  scope?: ProgressiveEnrichmentScope;
  onMonitorUpdate?: (event: {
    attempt: number;
    mode: string;
    markdown: string;
    validation: ImportValidationResult;
  }) => Promise<void> | void;
}): Promise<string> {
  const candidate = sanitizeDiagramMarkdown(input.markdown);
  return progressivelyEnrichDiagramMarkdown({
    generation: input.generation,
    markdown: candidate,
    uploadTexts: input.uploadTexts,
    attempt: input.attempt,
    modePrefix: input.modePrefix,
    scope: input.scope,
    onMonitorUpdate: input.onMonitorUpdate,
  });
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
  onProgress?: (action: string) => Promise<void> | void;
}): Promise<{ text: string; images: DoclingImageAsset[]; imageManifestObjectPath: string }> {
  const base = String(process.env.DOCLING_SERVICE_URL || 'http://127.0.0.1:8686').replace(/\/+$/, '');
  const url = `${base}/convert`;
  const jobId = randomUUID();
  await input.onProgress?.('convert_docling');
  const res = await withTimeout(`Docling convert for ${input.originalFilename}`, DOCLING_REQUEST_TIMEOUT_MS, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOCLING_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: input.userId,
          bucketId: 'docling-files',
          objectPath: input.objectPath,
          originalFilename: input.originalFilename,
          jobId,
          outputFormat: 'markdown',
          includeImages: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Docling convert for ${input.originalFilename} timed out after ${Math.max(1, Math.floor(DOCLING_REQUEST_TIMEOUT_MS / 1000))}s`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.detail || json.error || `Docling failed (${res.status})`));
  }
  const outputObjectPath = normalizeText(json.outputObjectPath);
  if (!outputObjectPath) throw new Error('Docling returned no output path');
  const imageManifestObjectPath = normalizeText(json.imageManifestObjectPath);
  let images: DoclingImageAsset[] = [];
  if (imageManifestObjectPath) {
    await input.onProgress?.('download_image_manifest');
    const { data: manifestBlob, error: manifestError } = await withTimeout(
      `Download image manifest for ${input.originalFilename}`,
      STORAGE_DOWNLOAD_TIMEOUT_MS,
      () => input.admin.storage.from('docling-files').download(imageManifestObjectPath),
    );
    if (manifestError) throw new Error(manifestError.message);
    const manifestText = await withTimeout(`Read image manifest for ${input.originalFilename}`, STORAGE_TEXT_READ_TIMEOUT_MS, () =>
      manifestBlob.text(),
    );
    const manifestJson = parseJsonObject(manifestText);
    images = parseDoclingImageAssets(manifestJson?.images);
  }

  await input.onProgress?.('download_converted');
  const { data: blob, error } = await withTimeout(
    `Download converted output for ${input.originalFilename}`,
    STORAGE_DOWNLOAD_TIMEOUT_MS,
    () => input.admin.storage.from('docling-files').download(outputObjectPath),
  );
  if (error) throw new Error(error.message);
  const markdown = await withTimeout(`Read converted output for ${input.originalFilename}`, STORAGE_TEXT_READ_TIMEOUT_MS, () => blob.text());

  try {
    await withTimeout(`Cleanup converted output for ${input.originalFilename}`, STORAGE_REMOVE_TIMEOUT_MS, () =>
      input.admin.storage.from('docling-files').remove([outputObjectPath]),
    );
  } catch {
    // ignore cleanup failures
  }
  return {
    text: clipText(markdown, MAX_UPLOAD_TEXT),
    images,
    imageManifestObjectPath,
  };
}

function collectManualUploadImages(uploads: PipelineUploadInput[]): CollectedUploadImageAsset[] {
  return uploads
    .map((upload, index) => ({
      kind: 'manual' as const,
      objectPath: normalizeText(upload.objectPath),
      pageNo: null,
      index: index + 1,
      width: null,
      height: null,
      bytes: Math.max(0, Math.floor(Number(upload.size || 0))),
      label: safeFileName(upload.name),
      sourceName: safeFileName(upload.name),
      sourceObjectPath: normalizeText(upload.objectPath),
    }))
    .filter((asset) => Boolean(asset.objectPath) && Boolean(asset.sourceName));
}

function selectDoclingDiagramImages(assets: CollectedUploadImageAsset[]): CollectedUploadImageAsset[] {
  const eligible = assets.filter((asset) => asset.bytes >= MIN_DIAGRAM_IMAGE_BYTES || asset.kind !== 'page');
  const score = (asset: CollectedUploadImageAsset): number => {
    const base =
      asset.kind === 'picture' || asset.kind === 'manual' ? 100 : asset.kind === 'table' ? 80 : 40;
    const pageBoost = asset.kind === 'page' && asset.pageNo && asset.pageNo <= 2 ? 12 : 0;
    const sizeBoost = Math.min(24, Math.floor(asset.bytes / 40_000));
    const areaBoost = asset.width && asset.height ? Math.min(18, Math.floor((asset.width * asset.height) / 180_000)) : 0;
    return base + pageBoost + sizeBoost + areaBoost;
  };
  const sorted = [...eligible].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff) return diff;
    if ((a.pageNo || 9999) !== (b.pageNo || 9999)) return (a.pageNo || 9999) - (b.pageNo || 9999);
    return a.index - b.index;
  });

  const out: CollectedUploadImageAsset[] = [];
  let pageCount = 0;
  const seen = new Set<string>();
  for (const asset of sorted) {
    if (seen.has(asset.objectPath)) continue;
    if (asset.kind === 'page' && pageCount >= MAX_DIAGRAM_PAGE_IMAGES) continue;
    out.push(asset);
    seen.add(asset.objectPath);
    if (asset.kind === 'page') pageCount += 1;
    if (out.length >= MAX_DIAGRAM_INPUT_IMAGES) break;
  }
  return out;
}

async function createSignedDoclingImageUrls(input: {
  assets: CollectedUploadImageAsset[];
  admin: ReturnType<typeof getAdminSupabaseClient>;
}): Promise<SignedCollectedUploadImageAsset[]> {
  const out: SignedCollectedUploadImageAsset[] = [];
  for (const asset of input.assets) {
    const { data, error } = await withTimeout(`Create signed URL for ${asset.objectPath}`, STORAGE_DOWNLOAD_TIMEOUT_MS, () =>
      input.admin.storage.from('docling-files').createSignedUrl(asset.objectPath, DOCLING_IMAGE_SIGNED_URL_TTL_SECONDS),
    );
    if (error) continue;
    const signedUrl = normalizeText(data?.signedUrl);
    if (!signedUrl) continue;
    out.push({ ...asset, signedUrl });
  }
  return out;
}

function selectDoclingVisionImageCandidates(assets: CollectedUploadImageAsset[]): CollectedUploadImageAsset[] {
  const eligible = assets.filter((asset) => asset.kind !== 'table' && (asset.kind !== 'page' || asset.bytes >= MIN_DIAGRAM_IMAGE_BYTES));
  const score = (asset: CollectedUploadImageAsset): number => {
    const base = asset.kind === 'picture' || asset.kind === 'manual' ? 120 : 72;
    const pageBoost = asset.kind === 'page' && asset.pageNo && asset.pageNo <= 4 ? 18 : 0;
    const sizeBoost = Math.min(24, Math.floor(asset.bytes / 35_000));
    const areaBoost = asset.width && asset.height ? Math.min(20, Math.floor((asset.width * asset.height) / 160_000)) : 0;
    return base + pageBoost + sizeBoost + areaBoost;
  };
  const sorted = [...eligible].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff) return diff;
    if ((a.pageNo || 9999) !== (b.pageNo || 9999)) return (a.pageNo || 9999) - (b.pageNo || 9999);
    return a.index - b.index;
  });

  const out: CollectedUploadImageAsset[] = [];
  let pageCount = 0;
  const seen = new Set<string>();
  for (const asset of sorted) {
    if (seen.has(asset.objectPath)) continue;
    if (asset.kind === 'page' && pageCount >= MAX_VISION_PAGE_IMAGES) continue;
    out.push(asset);
    seen.add(asset.objectPath);
    if (asset.kind === 'page') pageCount += 1;
    if (out.length >= MAX_VISION_IMAGE_CANDIDATES) break;
  }
  return out;
}

function fallbackVisionUiImages(images: SignedCollectedUploadImageAsset[]): ClassifiedVisionUiImage[] {
  return images
    .filter((img) => img.kind === 'picture' || img.kind === 'manual' || (img.kind === 'page' && (img.pageNo || 999) <= 3))
    .slice(0, MAX_VISION_INPUT_IMAGES)
    .map((img) => ({
      ...img,
      uiScore: img.kind === 'picture' || img.kind === 'manual' ? 74 : 58,
      rationale:
        img.kind === 'picture' || img.kind === 'manual'
          ? 'Fallback-picked provided image as likely UI artifact.'
          : 'Fallback-picked early page image as possible UI screen.',
    }));
}

async function classifyVisionUiImages(input: {
  brief: string;
  images: SignedCollectedUploadImageAsset[];
  apiKey: string;
}): Promise<ClassifiedVisionUiImage[]> {
  const images = input.images.slice(0, MAX_VISION_IMAGE_CANDIDATES);
  if (!images.length) return [];

  try {
    const inventory = images
      .map((img, idx) =>
        `${idx + 1}. ${img.sourceName} :: ${img.label} | kind=${img.kind}${img.pageNo ? ` | page=${img.pageNo}` : ''}`,
      )
      .join('\n');
    const out = await runOpenAIResponsesText(
      [
        {
          role: 'system',
          content: [
            'Return ONLY JSON, no markdown.',
            'Classify extracted document images for UI-style grounding.',
            'A UI image is a product screen, app screen, website layout, dashboard, admin panel, form, list view, navigation shell, wireframe, or UI mockup.',
            'Mark false for photos, logos, tables, scanned text pages, charts, signatures, plain document pages, or diagrams that do not visibly show interface layout.',
            'Output format:',
            '{"images":[{"index":1,"isUi":true,"styleRelevance":0,"reason":"..."}]}',
            'styleRelevance is 0-100 and should reflect how useful the image is for visual design-system generation.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                `Design brief:\n${clipText(input.brief, 3000) || '(none)'}`,
                '',
                'Images are in this exact order:',
                inventory,
                '',
                'Be strict. Only keep images that visibly show product UI or wireframe structure.',
              ].join('\n'),
            },
            ...images.map((img) => ({
              type: 'input_image' as const,
              image_url: img.signedUrl,
              detail: 'low' as const,
            })),
          ],
        },
      ],
      {
        apiKey: input.apiKey,
        temperature: 0,
        maxOutputTokens: 1200,
        withWebSearch: false,
      },
    );
    const parsed = parseJsonObject(out);
    const rows = Array.isArray(parsed?.images) ? (parsed.images as unknown[]) : [];
    const selected = rows
      .map((row) => (row && typeof row === 'object' ? (row as JsonRecord) : null))
      .filter((row): row is JsonRecord => row !== null)
      .map((row) => {
        const index = Math.floor(Number(row.index || 0));
        const img = index >= 1 && index <= images.length ? images[index - 1] : null;
        if (!img) return null;
        const styleRelevance = Math.max(0, Math.min(100, Math.floor(Number(row.styleRelevance || 0))));
        const isUi = row.isUi === true || normalizeText(row.isUi).toLowerCase() === 'true';
        return isUi
          ? ({
              ...img,
              uiScore: styleRelevance,
              rationale: clipText(row.reason, 220) || 'Model classified the image as UI-relevant.',
            } satisfies ClassifiedVisionUiImage)
          : null;
      })
      .filter((row): row is ClassifiedVisionUiImage => row !== null)
      .sort((a, b) => b.uiScore - a.uiScore)
      .slice(0, MAX_VISION_INPUT_IMAGES);

    if (selected.length) return selected;
  } catch {
    // fall back to heuristics below
  }

  return fallbackVisionUiImages(images);
}

async function collectUploadTexts(input: {
  uploads: PipelineUploadInput[];
  requesterUserId: string;
  admin: ReturnType<typeof getAdminSupabaseClient>;
  onProgress?: (event: { index: number; total: number; name: string; action: string; sourceKind?: UploadExtractionSourceKind }) => Promise<void> | void;
}): Promise<CollectedUploadText[]> {
  const out: CollectedUploadText[] = [];
  const uploads = input.uploads.slice(0, MAX_UPLOADS);
  const total = uploads.length;

  for (let index = 0; index < uploads.length; index += 1) {
    const upload = uploads[index]!;
    let text = '';
    const isTextFile = isLikelyTextFile(upload.name, upload.mimeType);
    const sourceKind: UploadExtractionSourceKind = isTextFile ? 'text' : 'docling';
    let doclingImages: CollectedUploadImageAsset[] = [];
    let imageManifestObjectPath = '';
    if (isTextFile) {
      await input.onProgress?.({ index: index + 1, total, name: upload.name, action: 'download_input', sourceKind: 'text' });
      const { data: blob, error } = await withTimeout(
        `Download upload ${upload.name}`,
        STORAGE_DOWNLOAD_TIMEOUT_MS,
        () => input.admin.storage.from('docling-files').download(upload.objectPath),
      );
      if (error) throw new Error(error.message);
      await input.onProgress?.({ index: index + 1, total, name: upload.name, action: 'read_text', sourceKind: 'text' });
      text = clipText(await withTimeout(`Read upload ${upload.name}`, STORAGE_TEXT_READ_TIMEOUT_MS, () => blob.text()), MAX_UPLOAD_TEXT);
    } else {
      await input.onProgress?.({ index: index + 1, total, name: upload.name, action: 'convert_docling', sourceKind: 'docling' });
      const converted = await convertViaDocling({
        userId: input.requesterUserId,
        objectPath: upload.objectPath,
        originalFilename: upload.name,
        admin: input.admin,
        onProgress: async (action) => {
          if (action === 'convert_docling') return;
          await input.onProgress?.({ index: index + 1, total, name: upload.name, action, sourceKind: 'docling' });
        },
      });
      text = converted.text;
      imageManifestObjectPath = converted.imageManifestObjectPath;
      doclingImages = converted.images.map((asset) => ({
        ...asset,
        sourceName: safeFileName(upload.name),
        sourceObjectPath: upload.objectPath,
      }));
    }

    await input.onProgress?.({ index: index + 1, total, name: upload.name, action: 'analyze', sourceKind });
    const clippedText = clipText(text, MAX_UPLOAD_TEXT);

    out.push({
      name: safeFileName(upload.name),
      objectPath: upload.objectPath,
      text: clippedText,
      sourceKind,
      mimeType: upload.mimeType,
      size: upload.size,
      analysis: analyzeExtractedText({
        name: upload.name,
        text: clippedText,
        sourceKind,
        mimeType: upload.mimeType,
        size: upload.size,
      }),
      images: doclingImages,
      imageManifestObjectPath,
    });

    await input.onProgress?.({ index: index + 1, total, name: upload.name, action: 'done', sourceKind });
  }

  return out;
}

async function repairDiagramWithTargetedPatches(input: {
  generation: PipelineGenerationConfig;
  markdown: string;
  validation: ImportValidationResult;
  integrityIssues?: string[];
}): Promise<string | null> {
  const issues = [...input.validation.errors, ...input.validation.warnings].slice(0, MAX_DIAGRAM_FIX_ISSUES);
  const integrityIssues = Array.from(new Set((input.integrityIssues || []).map((issue) => normalizeText(issue)).filter(Boolean)));
  if (!issues.length && !integrityIssues.length) return input.markdown;
  const targets = buildMarkdownFixTargets(input.markdown, issues);
  if (!targets.length) return null;

  const issueDetails = issues
    .map((issue, idx) => `${idx + 1}. ${issue.code}: ${normalizeText(issue.message)}\n   Fix hint: ${fixInstructionForValidationIssue(issue)}`)
    .join('\n');
  const integrityDetails = integrityIssues.map((issue, idx) => `${idx + 1}. ${issue}`).join('\n');

  const targetPayload = targets.map((target) => ({
    targetId: target.id,
    startLine: target.startLine,
    endLine: target.endLine,
    targetKind: target.targetKind,
    replacementFormat: describeTargetPatchFormat(target),
    reason: target.reason,
    issueCodes: target.issueCodes,
    originalMarkdown: target.originalMarkdown,
    contextMarkdown: target.contextMarkdown,
  }));

  const prompt = [
    'Repair the markdown using targeted patches only.',
    'Return JSON only, no markdown fences:',
    '{',
    '  "summary": "short note",',
    '  "patches": [',
    '    { "targetId": "target-1", "replacementMarkdown": "..." }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Only patch targetIds listed below.',
    '- Do not add or leave triple-backtick fence lines unless explicitly required for a metadata block.',
    '- Preserve unaffected sections.',
    '- For tree targets, return only replacement subtree lines.',
    '- For metadata targets, return only complete fenced metadata blocks.',
    '- Keep Diregram node indentation valid (2 spaces per level).',
    '- Use the repository content checklist to build missing scope and detail.',
    '- Treat validator issues as technical repair signals only. Do not remove scope to silence errors.',
    '',
    `Current markdown hash: ${hashMarkdown(input.markdown)}`,
    'Repository content checklist context:',
    PIPELINE_DIAGRAM_CONTENT_CHECKLIST,
    '',
    'Technical validator report:',
    input.validation.aiFriendlyReport,
    '',
    'Issues with fix hints:',
    issueDetails || '(none)',
    '',
    'Diagram integrity issues:',
    integrityDetails || '(none)',
    '',
    'Patch targets:',
    JSON.stringify(targetPayload, null, 2),
  ].join('\n');

  const out = await runPipelineGenerationText({
    generation: input.generation,
    maxTokens: 3600,
    temperature: 0.1,
    system: [
      'You are a Diregram markdown repair assistant.',
      'Output JSON only, exactly matching the requested schema.',
      'Do not return markdown fences.',
      'Use the repository content checklist to preserve and build the diagram scope.',
      'Treat validator feedback as a technical repair gate, not as the definition of scope.',
      'Treat diagram integrity issues as first-class repair signals and carry forward partially improved candidates.',
      'Do not shrink scope to pass validation; preserve generated node coverage and prefer additive fixes.',
    ].join('\n'),
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = parseTargetedPatchResponse(out);
  if (!parsed || !parsed.patches.length) return null;
  const next = applyTargetedPatches(input.markdown, targets, parsed.patches);
  return sanitizeDiagramMarkdown(next);
}

async function runPostSuccessContentAudit(input: {
  generation: PipelineGenerationConfig;
  markdown: string;
  uploadTexts: Array<{ name: string; text: string }>;
  onMonitorUpdate?: (event: {
    attempt: number;
    mode: string;
    markdown: string;
    validation: ImportValidationResult;
  }) => Promise<void> | void;
}): Promise<string> {
  const emit = async (mode: string, markdown: string, attempt = 0) => {
    if (!input.onMonitorUpdate) return;
    try {
      await input.onMonitorUpdate({
        attempt,
        mode,
        markdown,
        validation: validateNexusMarkdownImport(markdown),
      });
    } catch {
      // Audit telemetry should never fail the pipeline.
    }
  };

  const baseMarkdown = sanitizeDiagramMarkdown(input.markdown);
  const targets = buildPostSuccessContentAuditTargets(baseMarkdown);
  if (!targets.length) return baseMarkdown;

  try {
    await emit('post_success_audit_start', baseMarkdown);
    const sourceExcerpt = buildUploadPromptExcerpt(input.uploadTexts, {
      maxTotalChars: MAX_POST_SUCCESS_AUDIT_SOURCE_CHARS,
      perFileChars: 12_000,
    });

    const prompt = [
      'Run exactly one post-success content audit pass on this ALREADY import-valid Diregram markdown file.',
      'Return JSON only, no markdown fences:',
      '{',
      '  "summary": "short note",',
      '  "patches": [',
      '    { "targetId": "content-audit-1", "replacementMarkdown": "..." }',
      '  ]',
      '}',
      '',
      'Rules:',
      '- Patch only the listed targetIds.',
      '- Preserve existing scope. Do not delete branches, screens, or processes to make the file look cleaner.',
      '- Prefer additive improvements: regroup, relabel, add missing metadata blocks, add missing structured UI content, and add process metadata when checklist-required.',
      '- The file is already technically clean. Focus on content correctness and structural fit.',
      '- If you change the tree, also patch the metadata target so dependent registries stay aligned.',
      '- Fix wrong expanded-node content by making it screen-accurate and structured, not by removing the expanded node.',
      '- Promote true lifecycle or timeframe variants into conditional hubs when that better matches the content.',
      '- If adjacent #flow# tasks share one screen context, group them using single_screen_steps with matching process-single-screen metadata.',
      '- If a #flow# node branches, ensure metadata includes validation/branch typing and connector labels.',
      '- For tree targets, return only replacement subtree lines.',
      '- For metadata targets, return only complete fenced metadata blocks.',
      '- If no meaningful improvement is needed, return an empty patches array.',
      '',
      `Current markdown hash: ${hashMarkdown(baseMarkdown)}`,
      '',
      'Repository content checklist context:',
      PIPELINE_DIAGRAM_CONTENT_CHECKLIST,
      '',
      'Source excerpt:',
      sourceExcerpt || '(no upload text found)',
      '',
      'Patch targets:',
      JSON.stringify(
        targets.map((target) => ({
          targetId: target.id,
          startLine: target.startLine,
          endLine: target.endLine,
          targetKind: target.targetKind,
          replacementFormat: describeTargetPatchFormat(target),
          reason: target.reason,
          contextMarkdown: target.contextMarkdown,
          originalMarkdown: target.originalMarkdown,
        })),
        null,
        2,
      ),
    ].join('\n');

    const out = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 5200,
      temperature: 0.1,
      system: [
        'You are editing one existing Diregram markdown file after it already passed import validation.',
        'Do not rewrite the entire document.',
        'Return JSON only matching the requested schema.',
        'Respect each target kind exactly: tree targets need plain subtree lines, metadata targets need full fenced blocks.',
        'Focus on improving content fidelity using the repository checklist: IA correctness, expanded-node quality, conditional-hub correctness, process flow typing, and single-screen grouping.',
        'Preserve coverage and prefer additive fixes.',
      ].join('\n'),
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = parseTargetedPatchResponse(out);
    if (!parsed?.patches.length) {
      await emit('post_success_audit_noop', baseMarkdown);
      return baseMarkdown;
    }
    const progressiveScope = buildProgressiveScopeFromTargets({
      targets,
      patches: parsed.patches,
    });

    let candidate = sanitizeDiagramMarkdown(applyTargetedPatches(baseMarkdown, targets, parsed.patches));
    candidate = await progressivelyRestabilizeEditedDiagram({
      generation: input.generation,
      markdown: candidate,
      uploadTexts: input.uploadTexts,
      attempt: 0,
      modePrefix: 'post_success_progressive',
      scope: progressiveScope,
      onMonitorUpdate: input.onMonitorUpdate,
    });
    let candidateValidation = validateNexusMarkdownImport(candidate);
    let candidateIntegrityIssues = assessDiagramIntegrity(candidate);
    await emit('post_success_audit', candidate);

    let stagnantAttempts = 0;
    for (let attempt = 1; attempt <= MAX_POST_SUCCESS_AUDIT_REPAIR_ATTEMPTS; attempt += 1) {
      if (!candidateValidation.errors.length && !candidateValidation.warnings.length && !candidateIntegrityIssues.length) {
        break;
      }

      await emit('post_success_audit_attempt_start', candidate, attempt);
      const attemptStartHash = hashMarkdown(candidate);

      const deterministic = autoFixDeterministicValidationIssues(candidate, candidateValidation);
      if (deterministic !== candidate) {
        candidate = await progressivelyRestabilizeEditedDiagram({
          generation: input.generation,
          markdown: deterministic,
          uploadTexts: input.uploadTexts,
          attempt,
          modePrefix: 'post_success_progressive',
          scope: progressiveScope,
          onMonitorUpdate: input.onMonitorUpdate,
        });
        candidateValidation = validateNexusMarkdownImport(candidate);
        candidateIntegrityIssues = assessDiagramIntegrity(candidate);
        await emit('post_success_audit_structural_fix', candidate, attempt);
        if (!candidateValidation.errors.length && !candidateValidation.warnings.length && !candidateIntegrityIssues.length) {
          break;
        }
      }

      const targeted = await repairDiagramWithTargetedPatches({
        generation: input.generation,
        markdown: candidate,
        validation: candidateValidation,
        integrityIssues: candidateIntegrityIssues,
      });
      if (targeted && targeted !== candidate) {
        const rebuiltTargeted = await progressivelyRestabilizeEditedDiagram({
          generation: input.generation,
          markdown: targeted,
          uploadTexts: input.uploadTexts,
          attempt,
          modePrefix: 'post_success_progressive',
          scope: progressiveScope,
          onMonitorUpdate: input.onMonitorUpdate,
        });
        const targetedValidation = validateNexusMarkdownImport(rebuiltTargeted);
        const targetedIntegrityIssues = assessDiagramIntegrity(rebuiltTargeted);
        await emit('post_success_audit_targeted_repair', rebuiltTargeted, attempt);
        if (!targetedValidation.errors.length && !targetedValidation.warnings.length && !targetedIntegrityIssues.length) {
          candidate = rebuiltTargeted;
          candidateValidation = targetedValidation;
          candidateIntegrityIssues = targetedIntegrityIssues;
          break;
        }
        if (
          shouldAcceptCandidateValidation({
            current: candidateValidation,
            candidate: targetedValidation,
            currentMarkdown: candidate,
            candidateMarkdown: rebuiltTargeted,
          })
        ) {
          candidate = rebuiltTargeted;
          candidateValidation = targetedValidation;
          candidateIntegrityIssues = targetedIntegrityIssues;
        }
      }

      if (hashMarkdown(candidate) === attemptStartHash) {
        stagnantAttempts += 1;
      } else {
        stagnantAttempts = 0;
      }

      if (stagnantAttempts >= 2) {
        break;
      }
    }

    if (
      !candidateValidation.errors.length &&
      !candidateValidation.warnings.length &&
      !candidateIntegrityIssues.length &&
      hashMarkdown(candidate) !== hashMarkdown(baseMarkdown) &&
      shouldAcceptContentAuditCandidate({
        currentMarkdown: baseMarkdown,
        candidateMarkdown: candidate,
      })
    ) {
      return candidate;
    }

    await emit('post_success_audit_rejected', candidate);
    return baseMarkdown;
  } catch {
    await emit('post_success_audit_failed', baseMarkdown);
    return baseMarkdown;
  }
}

async function generateSingleDiagram(input: {
  generation: PipelineGenerationConfig;
  uploadTexts: Array<{ name: string; text: string }>;
  uploadImages?: Array<{
    name: string;
    signedUrl: string;
    sourceName: string;
    kind: PipelineImageAssetKind;
    pageNo: number | null;
  }>;
  onMonitorUpdate?: (event: {
    attempt: number;
    mode: string;
    markdown: string;
    validation: ImportValidationResult;
  }) => Promise<void> | void;
}): Promise<string> {
  const emitMonitor = async (event: {
    attempt: number;
    mode: string;
    markdown: string;
    validation: ImportValidationResult;
  }) => {
    if (!input.onMonitorUpdate) return;
    try {
      await input.onMonitorUpdate(event);
    } catch {
      // Do not fail pipeline generation because monitor updates failed.
    }
  };

  const sourceText = input.uploadTexts
    .map((item, idx) => `## Source ${idx + 1}: ${item.name}\n${clipText(item.text, 40_000)}`)
    .join('\n\n');

  const system = [
    'You generate ONE Diregram diagram markdown file.',
    'Output only markdown (no prose, no code fences).',
    'Use the repository diagram guidance and post-generation checklist below as the source of truth.',
    'Use the repository content checklist as the build contract.',
    'Treat technical validation as a later import gate, not as the definition of what content should exist.',
    'In this first pass, output ONLY the node tree section of the file.',
    'Do not output the --- separator or any fenced JSON metadata blocks in the first pass.',
    'Preserve inline comments and anchors needed for later partial-file edits: tags, do links, expid, fid, sfid.',
    'Build missing structure/metadata when required; do not delete scope to satisfy technical validation.',
    '',
    PIPELINE_DIAGRAM_BUILD_CHECKLIST,
  ].join('\n');

  const finalizeSuccessfulDiagram = async (candidateMarkdown: string) =>
    runPostSuccessContentAudit({
      generation: input.generation,
      markdown: candidateMarkdown,
      uploadTexts: input.uploadTexts,
      onMonitorUpdate: input.onMonitorUpdate,
    });

  let markdown = makeStarterDiagramMarkdown();
  const first = await runPipelineGenerationText({
    generation: input.generation,
    system,
    maxTokens: 7200,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [
          'Create one comprehensive diagram from these uploaded sources.',
          'Ensure line-level linking anchors are possible.',
          'Keep the node tree readable and structurally complete.',
          'Treat uploaded images as a separate later-stage input for filtering/vision only. Do not wait for or depend on image analysis in this stage.',
          '',
          sourceText || '(no upload text found)',
        ].join('\n'),
      },
    ],
  });
  markdown = sanitizeDiagramMarkdown(first);
  markdown = await progressivelyEnrichDiagramMarkdown({
    generation: input.generation,
    markdown,
    uploadTexts: input.uploadTexts,
    onMonitorUpdate: input.onMonitorUpdate,
  });
  await emitMonitor({
    attempt: 0,
    mode: 'initial_generation_progressive',
    markdown,
    validation: validateNexusMarkdownImport(markdown),
  });

  let stagnantAttempts = 0;
  for (let attempt = 0; attempt < MAX_DIAGRAM_REPAIR_ATTEMPTS; attempt += 1) {
    const attemptStartHash = hashMarkdown(markdown);
    let validation = validateNexusMarkdownImport(markdown);
    let integrityIssues = assessDiagramIntegrity(markdown);
    if (!validation.errors.length && !validation.warnings.length && !integrityIssues.length) {
      return finalizeSuccessfulDiagram(markdown);
    }
    await emitMonitor({
      attempt: attempt + 1,
      mode: 'attempt_start',
      markdown,
      validation,
    });

    const localRepair = sanitizeDiagramMarkdown(markdown);
    if (localRepair !== markdown) {
      const localValidation = validateNexusMarkdownImport(localRepair);
      const localIntegrityIssues = assessDiagramIntegrity(localRepair);
      markdown = localRepair;
      await emitMonitor({
        attempt: attempt + 1,
        mode: 'local_sanitize',
        markdown,
        validation: localValidation,
      });
      if (!localValidation.errors.length && !localValidation.warnings.length && !localIntegrityIssues.length) {
        return finalizeSuccessfulDiagram(markdown);
      }
      validation = localValidation;
      integrityIssues = localIntegrityIssues;
    }

    const deterministicFix = autoFixDeterministicValidationIssues(markdown, validation);
    if (deterministicFix !== markdown) {
      const deterministicValidation = validateNexusMarkdownImport(deterministicFix);
      const deterministicIntegrityIssues = assessDiagramIntegrity(deterministicFix);
      markdown = deterministicFix;
      await emitMonitor({
        attempt: attempt + 1,
        mode: 'auto_structural_fix',
        markdown,
        validation: deterministicValidation,
      });
      if (!deterministicValidation.errors.length && !deterministicValidation.warnings.length && !deterministicIntegrityIssues.length) {
        return finalizeSuccessfulDiagram(markdown);
      }
      validation = deterministicValidation;
      integrityIssues = deterministicIntegrityIssues;
    }

    const targeted = await repairDiagramWithTargetedPatches({
      generation: input.generation,
      markdown,
      validation,
      integrityIssues,
    });
    if (targeted && targeted !== markdown) {
      const targetedValidation = validateNexusMarkdownImport(targeted);
      const targetedIntegrityIssues = assessDiagramIntegrity(targeted);
      await emitMonitor({
        attempt: attempt + 1,
        mode: 'targeted_patch',
        markdown: targeted,
        validation: targetedValidation,
      });
      if (!targetedValidation.errors.length && !targetedValidation.warnings.length && !targetedIntegrityIssues.length) {
        return finalizeSuccessfulDiagram(targeted);
      }
      if (
        shouldAcceptCandidateValidation({
          current: validation,
          candidate: targetedValidation,
          currentMarkdown: markdown,
          candidateMarkdown: targeted,
        })
      ) {
        markdown = targeted;
        validation = targetedValidation;
        integrityIssues = targetedIntegrityIssues;
      }
    }

    const errorSummary = summarizeIssues(validation.errors.map((x) => `${x.code}: ${x.message}`));
    const warningSummary = summarizeIssues(validation.warnings.map((x) => `${x.code}: ${x.message}`));
    const integritySummary = summarizeIssues(integrityIssues);
    const detailedHints = [...validation.errors, ...validation.warnings]
      .slice(0, MAX_DIAGRAM_FIX_ISSUES)
      .map((issue, idx) => `${idx + 1}. ${issue.code}: ${normalizeText(issue.message)}\n   Fix hint: ${fixInstructionForValidationIssue(issue)}`)
      .join('\n');
    const repaired = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 7200,
      temperature: 0.1,
      system: [
        'Repair the provided Diregram diagram markdown so it is import-valid.',
        'Use the repository content checklist as the source of truth for content and completeness.',
        'Treat validator feedback as a technical repair gate only.',
        'Do not remove major content unless required to fix parser/validator issues or warnings.',
        'Never "shrink to pass" by deleting generated nodes/branches; prefer additive completion and relinking.',
        'Use validator line hints and keep unaffected content unchanged.',
        'Return ONLY corrected markdown. No code fences.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: [
            `Repair attempt: ${attempt + 1}/${MAX_DIAGRAM_REPAIR_ATTEMPTS}`,
            `Current markdown hash: ${hashMarkdown(markdown)}`,
            '',
            'Fix these validator issues:',
            errorSummary,
            '',
            'Fix these validator warnings too. Warnings are blocking for completion:',
            warningSummary,
            '',
            integrityIssues.length ? 'Fix these diagram integrity issues:' : '',
            integrityIssues.length ? integritySummary : '',
            integrityIssues.length ? '' : '',
            'Validator report:',
            validation.aiFriendlyReport,
            '',
            'Issue-specific repair hints:',
            detailedHints,
            '',
            'Repository content checklist context:',
            PIPELINE_DIAGRAM_CONTENT_CHECKLIST,
            '',
            'Markdown to repair:',
            markdown,
          ].join('\n'),
        },
      ],
    });
    const repairedMarkdown = sanitizeDiagramMarkdown(repaired);
    const repairedValidation = validateNexusMarkdownImport(repairedMarkdown);
    const repairedIntegrityIssues = assessDiagramIntegrity(repairedMarkdown);
    await emitMonitor({
      attempt: attempt + 1,
      mode: 'full_repair',
      markdown: repairedMarkdown,
      validation: repairedValidation,
    });
    if (!repairedValidation.errors.length && !repairedValidation.warnings.length && !repairedIntegrityIssues.length) {
      return finalizeSuccessfulDiagram(repairedMarkdown);
    }
    if (
      shouldAcceptCandidateValidation({
        current: validation,
        candidate: repairedValidation,
        currentMarkdown: markdown,
        candidateMarkdown: repairedMarkdown,
      })
    ) {
      markdown = repairedMarkdown;
    }

    if (hashMarkdown(markdown) === attemptStartHash) {
      stagnantAttempts += 1;
    } else {
      stagnantAttempts = 0;
    }

    if (stagnantAttempts >= 2) {
      const blockingIssues = [
        ...validation.errors.map((x) => `${x.code}: ${x.message}`),
        ...validation.warnings.map((x) => `${x.code}: ${x.message}`),
        ...integrityIssues,
      ];
      throw noRetryError(`Diagram repair stalled after repeated non-progress attempts: ${summarizeIssues(blockingIssues)}`);
    }
  }

  const finalValidation = validateNexusMarkdownImport(markdown);
  const finalIntegrityIssues = assessDiagramIntegrity(markdown);
  if (finalValidation.errors.length) {
    throw noRetryError(
      `Diagram validation failed after repairs: ${summarizeIssues(finalValidation.errors.map((x) => `${x.code}: ${x.message}`))}`,
    );
  }
  if (finalValidation.warnings.length) {
    throw noRetryError(
      `Diagram warnings remain after repairs: ${summarizeIssues(finalValidation.warnings.map((x) => `${x.code}: ${x.message}`))}`,
    );
  }
  if (finalIntegrityIssues.length) {
    throw noRetryError(`Diagram integrity failed after repairs: ${summarizeIssues(finalIntegrityIssues)}`);
  }
  return finalizeSuccessfulDiagram(markdown);
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

function visionFontAllowlistText(): string {
  const base = VISION_GOOGLE_FONT_OPTIONS.map((f) => f.family);
  const decorative = VISION_DECORATIVE_FONT_OPTIONS.map((f) => f.family);
  return Array.from(new Set([...base, ...decorative])).join(' | ');
}

function visionRendererControlGuide(): string {
  return [
    'Renderer model:',
    '- The Vision preview is a fixed shell/template renderer driven by design-system tokens and control sliders, not free-form HTML composition.',
    '- To create a strong look, populate controls explicitly. If controls are omitted, normalization falls back toward generic defaults.',
    '',
    'Required design-system structure:',
    '- version: 1',
    '- activeScenarioId',
    '- scenarios[0..n] with palette + ratios',
    '- foundations.fontFamily / headingFontFamily / decorativeFontFamily / imageProfiles[]',
    '- controls with explicit numeric values and enum values',
    '',
    `Allowed primitive ids: ${primitiveAllowlistText()}`,
    `Preferred font families: ${visionFontAllowlistText()}`,
    '',
    'How controls map to the preview renderer:',
    '- controls.typography.baseSizePx: body size baseline',
    '- controls.typography.baseWeight: default text weight',
    '- controls.typography.sizeGrowth: quiet-to-editorial type scale expansion',
    '- controls.typography.weightGrowth: narrow-to-wide heading weight spread',
    '- controls.typography.contrast: subdued-to-high text contrast',
    '- controls.fontVariance: single | singleDecorative | splitHeading | splitHeadingDecorative',
    '- controls.pillTargets: buttons | inputs | chips | tabs | navItems | tableTags',
    '- controls.spacing.pattern: compact modular scale to broad spacious scale',
    '- controls.spacing.density: dense to airy layout',
    '- controls.spacing.aroundVsInside: outer margins versus inner padding bias',
    '- controls.flatness: line/minimal surfaces to heavy carded surfaces',
    '- controls.zoning: single plane to deeply nested zones',
    '- controls.softness: sharp corners to heavily rounded/pill corners',
    '- controls.surfaceSaturation: neutral surfaces to tinted surfaces',
    '- controls.itemSaturation: muted UI items to vivid UI items',
    '- controls.colorVariance: narrow color range to broad accent variation',
    '- controls.colorBleed: neutral canvas to strong brand tint bleed',
    '- controls.colorBleedTone: primary | accent | warm | cool | custom',
    '- controls.colorBleedText: neutral typography to subtly tinted typography',
    '- controls.wireframeFeeling: polished solid surfaces to outline/schematic feeling',
    '- controls.visualRange: restrained fills to richer gradients/visual expression',
    '- controls.skeuomorphism: flat to material depth',
    '- controls.skeuomorphismStyle: subtle | neomorphic | glass | glow | embossed',
    '- controls.negativeZoneStyle: flat canvas to textured/gradient/image-like negative space',
    '- controls.boldness: restrained hero/nav/actions to loud expressive hero/nav/actions',
    '- controls.boldTypographyStyle: none | gradient | glow | gradientGlow',
    '- controls.boldGradientSource: auto | custom',
    '- controls.strictNoDarkMode: boolean',
    '- controls.darkMode: include explicit dark-mode stance and override colors when needed',
    '',
    'Scenario + palette requirements:',
    '- palette.primary / accent / neutral / semantic must be actual hex values',
    '- palette.pairings must use primitive ids from the allowlist',
    '- ratios[].primitiveBreakdown should reflect how much of the UI is neutral vs primary vs accent, not default filler',
    '',
    'Image profile requirements:',
    '- imageProfiles should describe illustration/imagery direction with concrete style, lighting, lineWeight, notes, and placeholder',
    '',
    'Do not return a shallow theme token set.',
    'Return a full renderer-driving design system with concrete controls so the preview meaningfully changes.',
  ].join('\n');
}

async function repairVisionDesignSystemCandidate(input: {
  generation: PipelineGenerationConfig;
  rawOutput: string;
  brief: string;
  swarmInsights?: string;
}): Promise<VisionDesignSystemV1 | null> {
  const prompt = [
    'Repair the candidate into a valid Diregram Vision design system JSON object.',
    'Return ONLY JSON. No markdown fences.',
    'The output must conform to version:1 VisionDesignSystemV1 and must drive the fixed preview renderer meaningfully.',
    '',
    visionRendererControlGuide(),
    '',
    `Design brief:\n${clipText(input.brief, 5000) || '(none)'}`,
    '',
    `Swarm insights:\n${clipText(input.swarmInsights, 3500) || '(none)'}`,
    '',
    'Candidate output to repair:',
    clipText(input.rawOutput, 12_000) || '(empty)',
  ].join('\n');

  try {
    const repaired = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 4200,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });
    const parsed = parseJsonObject(repaired);
    return parsed ? coerceVisionDesignSystem(parsed) : null;
  } catch {
    return null;
  }
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
  generation: PipelineGenerationConfig;
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
    technical: 'Focus on ERD quality, entities, attributes, relationships, data ownership, and end-to-end data flow between screens, processes, and systems.',
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

  const output = await runPipelineGenerationText({
    generation: input.generation,
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
      recommendations: [],
      monitor: {
        usedFallback: false,
        outputPreview: clipText(output, 2000),
        kbContextPreview: clipText(kb.contextText, 1200) || '(none)',
      },
    };
  }

  return {
    agent: input.agent,
    recommendations,
    monitor: {
      usedFallback: false,
      outputPreview: clipText(output, 2000),
      kbContextPreview: clipText(kb.contextText, 1200) || '(none)',
    },
  };
}

function countSwarmRecommendations(agentOutputs: AgentOutputRecord[]): number {
  return agentOutputs.reduce((sum, agent) => sum + agent.recommendations.length, 0);
}

function collectRelevantSwarmRecommendations(input: {
  agentOutputs: AgentOutputRecord[];
  refs: DiagramLinkRef[];
  limit?: number;
}): Array<{ agent: SwarmAgentName; title: string; detail: string; diagramRefs: DiagramLinkRef[] }> {
  const refKeys = new Set(input.refs.map((ref) => ref.anchorKey));
  const out: Array<{ agent: SwarmAgentName; title: string; detail: string; diagramRefs: DiagramLinkRef[] }> = [];

  for (const agent of input.agentOutputs) {
    for (const rec of agent.recommendations) {
      if (!rec.diagramRefs.some((ref) => refKeys.has(ref.anchorKey))) continue;
      out.push({
        agent: agent.agent,
        title: rec.title,
        detail: rec.detail,
        diagramRefs: rec.diagramRefs,
      });
      if (out.length >= (input.limit || 8)) return out;
    }
  }

  return out;
}

function buildStorySwarmInsightText(story: PipelineStory, agentOutputs: AgentOutputRecord[]): string {
  const matches = collectRelevantSwarmRecommendations({
    agentOutputs,
    refs: story.diagramRefs,
    limit: 6,
  });
  return matches.map((rec) => `[${rec.agent}] ${rec.title}: ${clipText(rec.detail, 260)}`).join('\n\n');
}

function buildVisionSwarmInsightBrief(input: {
  agentOutputs: AgentOutputRecord[];
  stories: PipelineStory[];
  designSystemBrief: string;
}): string {
  const preferredAgents = new Set<SwarmAgentName>(['ui_presentation', 'interaction', 'content', 'user_journey']);
  const lines: string[] = [];

  if (input.designSystemBrief) {
    lines.push(`Synthesis brief: ${clipText(input.designSystemBrief, 1800)}`);
  }

  const storyHighlights = input.stories.slice(0, 12).map((story) => {
    const insight = buildStorySwarmInsightText(story, input.agentOutputs);
    if (!insight) return '';
    return `Story ${story.id} (${story.title})\n${clipText(insight, 900)}`;
  }).filter(Boolean);
  if (storyHighlights.length) {
    lines.push('Story-linked swarm insights:');
    lines.push(storyHighlights.join('\n\n'));
  }

  const direct = input.agentOutputs
    .filter((agent) => preferredAgents.has(agent.agent))
    .flatMap((agent) =>
      agent.recommendations.slice(0, 6).map((rec) => `[${agent.agent}] ${rec.title}: ${clipText(rec.detail, 320)}`),
    )
    .slice(0, 20);
  if (direct.length) {
    lines.push('Direct swarm recommendations:');
    lines.push(direct.join('\n'));
  }

  return clipText(lines.join('\n\n'), 5000);
}

function buildSwarmRecommendationTargets(markdown: string, agentOutputs: AgentOutputRecord[]): MarkdownFixTarget[] {
  const lines = normalizeNewlines(markdown).split('\n');
  const blocks = collectFencedBlockRanges(markdown);
  const blockByType = new Map(blocks.map((block) => [block.type, block] as const));
  const separatorIndex = findSeparatorIndexOutsideFences(lines);
  const metadataInsertStartLine = separatorIndex === -1 ? lines.length + 1 : separatorIndex + 2;
  const metadataInsertEndLine = metadataInsertStartLine - 1;
  const out: MarkdownFixTarget[] = [];
  const usedRanges: Array<{ startLine: number; endLine: number }> = [];

  const overlapsExisting = (startLine: number, endLine: number) =>
    usedRanges.some((range) => !(endLine < range.startLine || startLine > range.endLine));

  const addTarget = (
    range: { startLine: number; endLine: number },
    targetKind: 'tree' | 'metadata',
    reason: string,
    issueCode: string,
  ) => {
    if (out.length >= MAX_DIAGRAM_FIX_TARGETS) return;
    const clamped = clampLineRange(range, lines.length);
    const overlapEnd = Math.max(clamped.endLine, clamped.startLine - 1);
    if (overlapsExisting(clamped.startLine, overlapEnd)) return;
    usedRanges.push({ startLine: clamped.startLine, endLine: overlapEnd });
    out.push({
      id: `swarm-revision-${out.length + 1}`,
      startLine: clamped.startLine,
      endLine: clamped.endLine,
      targetKind,
      reason: clipText(reason, 280),
      issueCodes: [issueCode],
      contextMarkdown: extractContextMarkdownForRange(lines, clamped.startLine, clamped.endLine),
      originalMarkdown: extractOriginalMarkdownForRange(lines, clamped.startLine, clamped.endLine),
    });
  };

  const flattened = agentOutputs
    .flatMap((agent) => agent.recommendations.map((rec) => ({ agent: agent.agent, recommendation: rec })))
    .slice(0, 18);

  for (const row of flattened) {
    for (const ref of row.recommendation.diagramRefs.slice(0, 2)) {
      const subtree = findSubtreeRange(lines, ref.lineIndex);
      if (subtree) {
        addTarget(
          { startLine: subtree.start + 1, endLine: subtree.end + 1 },
          'tree',
          `[${row.agent}] ${row.recommendation.title}: ${clipText(row.recommendation.detail, 220)}`,
          'SWARM_REVISION_TREE',
        );
      }
      if (typeof ref.expid === 'number') {
        const metadataBlock = blockByType.get(`expanded-metadata-${ref.expid}`);
        if (metadataBlock) {
          addTarget(
            { startLine: metadataBlock.startLine, endLine: metadataBlock.endLine },
            'metadata',
            `Update expanded metadata for ${ref.label} from swarm recommendation "${row.recommendation.title}".`,
            'SWARM_REVISION_EXPANDED_METADATA',
          );
        }
        const gridBlock = blockByType.get(`expanded-grid-${ref.expid}`);
        if (gridBlock) {
          addTarget(
            { startLine: gridBlock.startLine, endLine: gridBlock.endLine },
            'metadata',
            `Update expanded grid for ${ref.label} from swarm recommendation "${row.recommendation.title}".`,
            'SWARM_REVISION_EXPANDED_GRID',
          );
        }
      }
      if (out.length >= MAX_DIAGRAM_FIX_TARGETS - 1) break;
    }
    if (out.length >= MAX_DIAGRAM_FIX_TARGETS - 1) break;
  }

  addTarget(
    { startLine: metadataInsertStartLine, endLine: metadataInsertEndLine },
    'metadata',
    'Update metadata blocks required by the swarm-driven revision, including flow-nodes, process-node-type-N, process-single-screen-N, flow-connector-labels, expanded-metadata-N, expanded-grid-N, and related registries.',
    'SWARM_REVISION_METADATA',
  );

  return out;
}

async function runSwarmDrivenDiagramRevision(input: {
  generation: PipelineGenerationConfig;
  markdown: string;
  uploadTexts: Array<{ name: string; text: string }>;
  agentOutputs: AgentOutputRecord[];
  onMonitorUpdate?: (event: {
    attempt: number;
    mode: string;
    markdown: string;
    validation: ImportValidationResult;
  }) => Promise<void> | void;
}): Promise<string> {
  const emit = async (mode: string, markdown: string, attempt = 0) => {
    if (!input.onMonitorUpdate) return;
    try {
      await input.onMonitorUpdate({
        attempt,
        mode,
        markdown,
        validation: validateNexusMarkdownImport(markdown),
      });
    } catch {
      // Swarm revision telemetry should not fail the pipeline.
    }
  };

  const baseMarkdown = sanitizeDiagramMarkdown(input.markdown);
  const targets = buildSwarmRecommendationTargets(baseMarkdown, input.agentOutputs);
  if (!targets.length) return baseMarkdown;

  try {
    await emit('swarm_revision_start', baseMarkdown);
    const sourceExcerpt = buildUploadPromptExcerpt(input.uploadTexts, {
      maxTotalChars: 12_000,
      perFileChars: 8_000,
    });
    const swarmSummary = input.agentOutputs
      .flatMap((agent) =>
        agent.recommendations.map(
          (rec) =>
            `[${agent.agent}] ${rec.title}\n${clipText(rec.detail, 420)}\nrefs=${rec.diagramRefs.map((ref) => ref.anchorKey).join(', ')}`,
        ),
      )
      .slice(0, 12)
      .join('\n\n');

    const prompt = [
      'Apply the swarm recommendations back into this already import-valid Diregram markdown file.',
      'Return JSON only, no markdown fences:',
      '{',
      '  "summary": "short note",',
      '  "patches": [',
      '    { "targetId": "swarm-revision-1", "replacementMarkdown": "..." }',
      '  ]',
      '}',
      '',
      'Rules:',
      '- Patch only the listed targetIds.',
      '- Preserve scope. Do not delete branches/screens/flows to silence recommendations.',
      '- Convert recommendations into real diagram changes: tree structure, expanded grids, conditional hubs, process typing, connector labels, and single-screen grouping metadata.',
      '- If a recommendation is already satisfied, leave that target unchanged.',
      '- If the tree changes, also patch the metadata target so dependent registries stay aligned.',
      '- For tree targets, return only replacement subtree lines.',
      '- For metadata targets, return only complete fenced metadata blocks.',
      '- Keep the markdown technically import-valid.',
      '',
      `Current markdown hash: ${hashMarkdown(baseMarkdown)}`,
      '',
      'Repository content checklist context:',
      PIPELINE_DIAGRAM_CONTENT_CHECKLIST,
      '',
      'Source excerpt:',
      sourceExcerpt || '(no upload text found)',
      '',
      'Swarm recommendations to apply:',
      swarmSummary || '(none)',
      '',
      'Patch targets:',
      JSON.stringify(
        targets.map((target) => ({
          targetId: target.id,
          startLine: target.startLine,
          endLine: target.endLine,
          targetKind: target.targetKind,
          replacementFormat: describeTargetPatchFormat(target),
          reason: target.reason,
          contextMarkdown: target.contextMarkdown,
          originalMarkdown: target.originalMarkdown,
        })),
        null,
        2,
      ),
    ].join('\n');

    const out = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 3600,
      temperature: 0.1,
      system: [
        'You are editing an existing Diregram markdown file based on grounded swarm recommendations.',
        'Return JSON only matching the requested schema.',
        'Do not rewrite the entire document.',
        'Respect each target kind exactly: tree targets need plain subtree lines, metadata targets need full fenced blocks.',
        'Convert recommendation text into actual diagram changes while preserving coverage.',
      ].join('\n'),
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = parseTargetedPatchResponse(out);
    const safePatchEval = parsed ? evaluateSafeRevisionPatches(targets, parsed.patches) : { accepted: [], diagnostics: [] };
    const safePatches = safePatchEval.accepted;
    const rejectedPatchDiagnostics = safePatchEval.diagnostics.filter((item) => !item.accepted);
    if (rejectedPatchDiagnostics.length) {
      console.warn(
        '[project-pipeline] swarm revision rejected patch candidates:',
        rejectedPatchDiagnostics.map((item) => `${item.targetId}: ${item.reason}`).join(' | '),
      );
    }
    if (!safePatches.length) {
      await emit('swarm_revision_noop', baseMarkdown);
      return baseMarkdown;
    }
    const progressiveScope = buildProgressiveScopeFromTargets({
      targets,
      patches: safePatches,
    });

    let candidate = sanitizeDiagramMarkdown(applyTargetedPatches(baseMarkdown, targets, safePatches));
    candidate = await progressivelyRestabilizeEditedDiagram({
      generation: input.generation,
      markdown: candidate,
      uploadTexts: input.uploadTexts,
      attempt: 0,
      modePrefix: 'swarm_revision_progressive',
      scope: progressiveScope,
      onMonitorUpdate: input.onMonitorUpdate,
    });
    let candidateValidation = validateNexusMarkdownImport(candidate);
    let candidateIntegrityIssues = assessDiagramIntegrity(candidate);
    await emit('swarm_revision', candidate);

    let stagnantAttempts = 0;
    for (let attempt = 1; attempt <= MAX_POST_SUCCESS_AUDIT_REPAIR_ATTEMPTS; attempt += 1) {
      if (!candidateValidation.errors.length && !candidateValidation.warnings.length && !candidateIntegrityIssues.length) {
        break;
      }

      await emit('swarm_revision_attempt_start', candidate, attempt);
      const attemptStartHash = hashMarkdown(candidate);

      const deterministic = autoFixDeterministicValidationIssues(candidate, candidateValidation);
      if (deterministic !== candidate) {
        candidate = await progressivelyRestabilizeEditedDiagram({
          generation: input.generation,
          markdown: deterministic,
          uploadTexts: input.uploadTexts,
          attempt,
          modePrefix: 'swarm_revision_progressive',
          scope: progressiveScope,
          onMonitorUpdate: input.onMonitorUpdate,
        });
        candidateValidation = validateNexusMarkdownImport(candidate);
        candidateIntegrityIssues = assessDiagramIntegrity(candidate);
        await emit('swarm_revision_structural_fix', candidate, attempt);
        if (!candidateValidation.errors.length && !candidateValidation.warnings.length && !candidateIntegrityIssues.length) {
          break;
        }
      }

      const targeted = await repairDiagramWithTargetedPatches({
        generation: input.generation,
        markdown: candidate,
        validation: candidateValidation,
        integrityIssues: candidateIntegrityIssues,
      });
      if (targeted && targeted !== candidate) {
        const rebuiltTargeted = await progressivelyRestabilizeEditedDiagram({
          generation: input.generation,
          markdown: targeted,
          uploadTexts: input.uploadTexts,
          attempt,
          modePrefix: 'swarm_revision_progressive',
          scope: progressiveScope,
          onMonitorUpdate: input.onMonitorUpdate,
        });
        const targetedValidation = validateNexusMarkdownImport(rebuiltTargeted);
        const targetedIntegrityIssues = assessDiagramIntegrity(rebuiltTargeted);
        await emit('swarm_revision_targeted_repair', rebuiltTargeted, attempt);
        if (!targetedValidation.errors.length && !targetedValidation.warnings.length && !targetedIntegrityIssues.length) {
          candidate = rebuiltTargeted;
          candidateValidation = targetedValidation;
          candidateIntegrityIssues = targetedIntegrityIssues;
          break;
        }
        if (
          shouldAcceptCandidateValidation({
            current: candidateValidation,
            candidate: targetedValidation,
            currentMarkdown: candidate,
            candidateMarkdown: rebuiltTargeted,
          })
        ) {
          candidate = rebuiltTargeted;
          candidateValidation = targetedValidation;
          candidateIntegrityIssues = targetedIntegrityIssues;
        }
      }

      if (hashMarkdown(candidate) === attemptStartHash) {
        stagnantAttempts += 1;
      } else {
        stagnantAttempts = 0;
      }

      if (stagnantAttempts >= 2) break;
    }

    if (
      !candidateValidation.errors.length &&
      !candidateValidation.warnings.length &&
      !candidateIntegrityIssues.length &&
      hashMarkdown(candidate) !== hashMarkdown(baseMarkdown) &&
      shouldAcceptContentAuditCandidate({
        currentMarkdown: baseMarkdown,
        candidateMarkdown: candidate,
      })
    ) {
      return candidate;
    }

    await emit('swarm_revision_rejected', candidate);
    return baseMarkdown;
  } catch {
    await emit('swarm_revision_failed', baseMarkdown);
    return baseMarkdown;
  }
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

function buildFocusedDiagramExcerpt(markdown: string, refs: DiagramLinkRef[], maxChars: number): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const seen = new Set<string>();
  const chunks: string[] = [];

  for (const ref of normalizeRefs(refs).slice(0, 12)) {
    const subtree = findSubtreeRange(lines, ref.lineIndex);
    if (!subtree) continue;
    const key = `${subtree.start}:${subtree.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push(`// ${ref.anchorKey} | ${ref.label}\n${lines.slice(subtree.start, subtree.end + 1).join('\n')}`);
  }

  const combined = chunks.join('\n\n');
  return clipText(combined || markdown, maxChars);
}

function buildSwarmRecommendationSummary(
  agentOutputs: AgentOutputRecord[],
  refs?: DiagramLinkRef[],
  maxRecommendations = 18,
  detailChars = 360,
): string {
  const rows = refs?.length
    ? collectRelevantSwarmRecommendations({
        agentOutputs,
        refs,
        limit: maxRecommendations,
      })
    : agentOutputs
        .flatMap((agent) =>
          agent.recommendations.map((rec) => ({
            agent: agent.agent,
            title: rec.title,
            detail: rec.detail,
            diagramRefs: rec.diagramRefs,
          })),
        )
        .slice(0, maxRecommendations);

  return rows
    .map((rec) => `[${rec.agent}] ${rec.title}: ${clipText(rec.detail, detailChars)} (refs: ${rec.diagramRefs.map((ref) => ref.anchorKey).join(', ')})`)
    .join('\n');
}

async function generateEpicDraftsProgressively(input: {
  generation: PipelineGenerationConfig;
  diagramLinkIndex: DiagramLinkRef[];
  diagramMarkdown: string;
  agentOutputs: AgentOutputRecord[];
}): Promise<{ epics: PipelineEpicDraft[]; outputPreview: string; usedFallback: boolean }> {
  const fallbackRef = input.diagramLinkIndex[0];
  if (!fallbackRef) throw new Error('Missing diagram references for epic generation.');
  const anchors = toAnchorMap(input.diagramLinkIndex);
  const anchorList = input.diagramLinkIndex
    .slice(0, 220)
    .map((ref) => `${ref.anchorKey} | line=${ref.lineIndex} | ${ref.label}`)
    .join('\n');
  const swarmSummary = buildSwarmRecommendationSummary(input.agentOutputs, undefined, 24, 260);

  const out = await runPipelineGenerationText({
    generation: input.generation,
    temperature: 0.2,
    maxTokens: 2600,
    system: [
      'Return ONLY JSON.',
      'Schema:',
      '{"epics":[{"id":"...","title":"...","summary":"...","diagramRefKeys":["rn:12"]}]}',
      'Every epic MUST include one or more diagramRefKeys from the allowlist.',
      'Create substantial epics from the real product structure. Do not use placeholders.',
      'Group related flows/screens into coherent epics while preserving separation between clearly different product areas.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          'Generate the epic list first. This is a progressive synthesis step.',
          '',
          'Diagram source (focused overview):',
          clipText(input.diagramMarkdown, 20_000),
          '',
          'Allowed diagram anchors:',
          anchorList,
          '',
          'Swarm recommendations:',
          swarmSummary || '(none)',
        ].join('\n'),
      },
    ],
  });

  const parsed = parseJsonObject(out);
  const epicsRaw = Array.isArray(parsed?.epics) ? (parsed?.epics as unknown[]) : [];
  const epics = epicsRaw
    .map((row, idx) => {
      const r = row && typeof row === 'object' ? (row as JsonRecord) : {};
      const id = normalizeStoryId(normalizeText(r.id), `epic-${idx + 1}`);
      return {
        id,
        title: clipText(r.title, 180) || `Epic ${idx + 1}`,
        summary: clipText(r.summary, 1000) || '',
        diagramRefs: mapAnchorKeysToRefs(r.diagramRefKeys, anchors, fallbackRef),
      } satisfies PipelineEpicDraft;
    })
    .filter((row) => Boolean(row.id))
    .slice(0, 24);

  if (!epics.length) {
    return {
      epics: [
        {
          id: 'epic-1',
          title: 'Generated Epic',
          summary: 'Auto-generated from the current diagram because epic synthesis returned no output.',
          diagramRefs: [fallbackRef],
        },
      ],
      outputPreview: clipText(out, 1800),
      usedFallback: true,
    };
  }

  return {
    epics,
    outputPreview: clipText(out, 1800),
    usedFallback: false,
  };
}

async function generateStoriesForEpicProgressively(input: {
  generation: PipelineGenerationConfig;
  epic: PipelineEpicDraft;
  diagramLinkIndex: DiagramLinkRef[];
  diagramMarkdown: string;
  agentOutputs: AgentOutputRecord[];
}): Promise<{ stories: PipelineStory[]; outputPreview: string; usedFallback: boolean }> {
  const fallbackRef = input.epic.diagramRefs[0] || input.diagramLinkIndex[0];
  if (!fallbackRef) throw new Error('Missing diagram references for story generation.');
  const anchors = toAnchorMap(input.diagramLinkIndex);
  const focusAnchorList = normalizeRefs(input.epic.diagramRefs)
    .slice(0, 40)
    .map((ref) => `${ref.anchorKey} | line=${ref.lineIndex} | ${ref.label}`)
    .join('\n');
  const focusedDiagram = buildFocusedDiagramExcerpt(input.diagramMarkdown, input.epic.diagramRefs, 14_000);
  const swarmSummary = buildSwarmRecommendationSummary(input.agentOutputs, input.epic.diagramRefs, 16, 320);

  const out = await runPipelineGenerationText({
    generation: input.generation,
    temperature: 0.2,
    maxTokens: 3400,
    system: [
      'Return ONLY JSON.',
      'Schema:',
      '{"stories":[{"id":"...","title":"...","description":"...","actor":"...","goal":"...","benefit":"...","priority":"high|medium|low","acceptanceCriteria":["..."],"uiElements":["..."],"diagramRefKeys":["rn:12"]}]}',
      'Every story MUST include one or more diagramRefKeys.',
      'Create concrete implementation-ready stories for this single epic only.',
      'Use the diagram and swarm recommendations to make the stories specific, not generic.',
      'Do not invent placeholder stories. If the epic is thin, produce fewer but better stories.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `Generate stories for epic "${input.epic.title}".`,
          `Epic summary: ${input.epic.summary || '(none)'}`,
          '',
          'Epic focus anchors:',
          focusAnchorList || '(none)',
          '',
          'Focused diagram excerpt:',
          focusedDiagram || '(none)',
          '',
          'Relevant swarm recommendations:',
          swarmSummary || '(none)',
        ].join('\n'),
      },
    ],
  });

  const parsed = parseJsonObject(out);
  const storiesRaw = Array.isArray(parsed?.stories) ? (parsed?.stories as unknown[]) : [];
  const stories = storiesRaw
    .map((row, idx) => {
      const r = row && typeof row === 'object' ? (row as JsonRecord) : {};
      const id = normalizeStoryId(normalizeText(r.id), `${input.epic.id}-story-${idx + 1}`);
      const acceptanceCriteria = Array.isArray(r.acceptanceCriteria)
        ? (r.acceptanceCriteria as unknown[]).map((x) => clipText(x, 240)).filter(Boolean).slice(0, 20)
        : [];
      const uiElements = Array.isArray(r.uiElements)
        ? (r.uiElements as unknown[]).map((x) => clipText(x, 140)).filter(Boolean).slice(0, 20)
        : [];
      return {
        id,
        epicId: input.epic.id,
        title: clipText(r.title, 220) || `${input.epic.title} Story ${idx + 1}`,
        description: clipText(r.description, 2200),
        actor: clipText(r.actor, 120),
        goal: clipText(r.goal, 600),
        benefit: clipText(r.benefit, 600),
        priority: clipText(r.priority, 40) || 'medium',
        acceptanceCriteria,
        uiElements,
        diagramRefs: mapAnchorKeysToRefs(r.diagramRefKeys, anchors, fallbackRef),
      } satisfies PipelineStory;
    })
    .slice(0, 40);

  if (!stories.length) {
    return {
      stories: [
        {
          id: `${input.epic.id}-story-1`,
          epicId: input.epic.id,
          title: `${input.epic.title} Story`,
          description: input.epic.summary || 'Progress the epic through its linked diagram flow.',
          actor: 'User',
          goal: 'Complete the workflow',
          benefit: 'Achieve the expected outcome',
          priority: 'medium',
          acceptanceCriteria: ['Flow can be completed end-to-end.'],
          uiElements: ['Primary action button'],
          diagramRefs: [fallbackRef],
        },
      ],
      outputPreview: clipText(out, 1800),
      usedFallback: true,
    };
  }

  return {
    stories,
    outputPreview: clipText(out, 1800),
    usedFallback: false,
  };
}

async function generateComponentGapsForEpicProgressively(input: {
  generation: PipelineGenerationConfig;
  epic: PipelineEpicDraft;
  stories: PipelineStory[];
  diagramLinkIndex: DiagramLinkRef[];
  diagramMarkdown: string;
  agentOutputs: AgentOutputRecord[];
}): Promise<{ componentGaps: PipelineComponentGap[]; outputPreview: string }> {
  const fallbackRef = input.epic.diagramRefs[0] || input.diagramLinkIndex[0];
  if (!fallbackRef) throw new Error('Missing diagram references for component gap generation.');
  const anchors = toAnchorMap(input.diagramLinkIndex);
  const focusedDiagram = buildFocusedDiagramExcerpt(input.diagramMarkdown, input.epic.diagramRefs, 10_000);
  const storySummary = input.stories
    .slice(0, 20)
    .map((story) =>
      [
        `${story.id} | ${story.title}`,
        story.description,
        `ui=${story.uiElements.join(', ') || '(none)'}`,
        `refs=${story.diagramRefs.map((ref) => ref.anchorKey).join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
  const swarmSummary = buildSwarmRecommendationSummary(input.agentOutputs, input.epic.diagramRefs, 12, 260);

  const out = await runPipelineGenerationText({
    generation: input.generation,
    temperature: 0.2,
    maxTokens: 2200,
    system: [
      'Return ONLY JSON.',
      'Schema:',
      '{"componentGaps":[{"id":"...","name":"...","purpose":"...","propsContract":["..."],"diagramRefKeys":["rn:12"]}]}',
      'Return additional React components or system building blocks that are missing from the generated design-system markdown but are needed by the epic.',
      'Every component gap MUST include one or more diagramRefKeys.',
      'Do not output placeholders.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `Generate component gaps for epic "${input.epic.title}".`,
          '',
          'Focused diagram excerpt:',
          focusedDiagram || '(none)',
          '',
          'Epic stories:',
          storySummary || '(none)',
          '',
          'Relevant swarm recommendations:',
          swarmSummary || '(none)',
        ].join('\n'),
      },
    ],
  });

  const parsed = parseJsonObject(out);
  const rows = Array.isArray(parsed?.componentGaps) ? (parsed?.componentGaps as unknown[]) : [];
  const componentGaps = rows
    .map((row, idx) => {
      const r = row && typeof row === 'object' ? (row as JsonRecord) : {};
      const id = normalizeStoryId(normalizeText(r.id), `${input.epic.id}-component-${idx + 1}`);
      const propsContract = Array.isArray(r.propsContract)
        ? (r.propsContract as unknown[]).map((x) => clipText(x, 140)).filter(Boolean).slice(0, 24)
        : [];
      return {
        id,
        name: clipText(r.name, 160) || `Component ${idx + 1}`,
        purpose: clipText(r.purpose, 1200),
        propsContract,
        diagramRefs: mapAnchorKeysToRefs(r.diagramRefKeys, anchors, fallbackRef),
      } satisfies PipelineComponentGap;
    })
    .filter((row) => Boolean(row.name))
    .slice(0, 16);

  return {
    componentGaps,
    outputPreview: clipText(out, 1600),
  };
}

function dedupeComponentGaps(gaps: PipelineComponentGap[]): PipelineComponentGap[] {
  const seen = new Set<string>();
  const out: PipelineComponentGap[] = [];
  for (const gap of gaps) {
    const key = normalizeStoryId(gap.name || gap.id, gap.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(gap);
  }
  return out;
}

async function generateDesignSystemBriefProgressively(input: {
  generation: PipelineGenerationConfig;
  diagramMarkdown: string;
  epics: PipelineEpicDraft[];
  stories: PipelineStory[];
  agentOutputs: AgentOutputRecord[];
}): Promise<{ brief: string; outputPreview: string }> {
  const epicSummary = input.epics
    .slice(0, 18)
    .map((epic) => `- ${epic.title}: ${clipText(epic.summary, 220)} | refs=${epic.diagramRefs.map((ref) => ref.anchorKey).join(', ')}`)
    .join('\n');
  const storySummary = input.stories
    .slice(0, 40)
    .map((story) => `- ${story.title}: actor=${story.actor || '-'} | goal=${clipText(story.goal, 180)} | ui=${story.uiElements.join(', ') || '(none)'} | refs=${story.diagramRefs.map((ref) => ref.anchorKey).join(', ')}`)
    .join('\n');
  const swarmSummary = buildSwarmRecommendationSummary(input.agentOutputs, undefined, 24, 220);

  const out = await runPipelineGenerationText({
    generation: input.generation,
    temperature: 0.2,
    maxTokens: 1800,
    system: [
      'Return plain text only.',
      'Write a concrete design-system brief for later Vision design-system generation.',
      'Include product tone, IA implications, UI patterns, interaction expectations, content behavior, and component priorities.',
      'Ground the brief in the current diagram, stories, and swarm recommendations.',
      'Do not return placeholders or generic filler.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          'Generate the design-system brief.',
          '',
          'Diagram overview:',
          clipText(input.diagramMarkdown, 12_000),
          '',
          'Epics:',
          epicSummary || '(none)',
          '',
          'Stories:',
          storySummary || '(none)',
          '',
          'Swarm recommendations:',
          swarmSummary || '(none)',
        ].join('\n'),
      },
    ],
  });

  return {
    brief: clipText(out, 3000),
    outputPreview: clipText(out, 1600),
  };
}

async function synthesizePipeline(input: {
  generation: PipelineGenerationConfig;
  diagramLinkIndex: DiagramLinkRef[];
  diagramMarkdown: string;
  agentOutputs: AgentOutputRecord[];
}): Promise<PipelineSynthesis> {
  const fallbackRef = input.diagramLinkIndex[0];
  if (!fallbackRef) throw new Error('Missing diagram references for synthesis.');

  const epicResult = await generateEpicDraftsProgressively(input);
  const epicDrafts = epicResult.epics;
  const epics: PipelineEpic[] = epicDrafts.map((epic) => ({
    id: epic.id,
    title: epic.title,
    summary: epic.summary,
  }));

  const storyOutputs: string[] = [];
  const componentOutputs: string[] = [];
  const stories: PipelineStory[] = [];
  const componentGapDrafts: PipelineComponentGap[] = [];
  let usedStoryFallback = false;

  for (const epic of epicDrafts) {
    const storyResult = await generateStoriesForEpicProgressively({
      generation: input.generation,
      epic,
      diagramLinkIndex: input.diagramLinkIndex,
      diagramMarkdown: input.diagramMarkdown,
      agentOutputs: input.agentOutputs,
    });
    storyOutputs.push(`## ${epic.id}\n${storyResult.outputPreview}`);
    if (storyResult.usedFallback) usedStoryFallback = true;
    stories.push(...storyResult.stories);

    const componentResult = await generateComponentGapsForEpicProgressively({
      generation: input.generation,
      epic,
      stories: storyResult.stories,
      diagramLinkIndex: input.diagramLinkIndex,
      diagramMarkdown: input.diagramMarkdown,
      agentOutputs: input.agentOutputs,
    });
    componentOutputs.push(`## ${epic.id}\n${componentResult.outputPreview}`);
    componentGapDrafts.push(...componentResult.componentGaps);
  }

  const componentGaps = dedupeComponentGaps(componentGapDrafts).slice(0, 60);

  if (!stories.length) {
    usedStoryFallback = true;
    stories.push({
      id: 'story-1',
      epicId: epics[0]?.id || 'epic-1',
      title: 'Generated Story',
      description: 'Pipeline fallback story due to empty story generation.',
      actor: 'User',
      goal: 'Complete the workflow',
      benefit: 'Achieve expected outcome',
      priority: 'medium',
      acceptanceCriteria: ['Flow can be completed end-to-end.'],
      uiElements: ['Primary action button'],
      diagramRefs: [fallbackRef],
    });
  }

  const designBriefResult = await generateDesignSystemBriefProgressively({
    generation: input.generation,
    diagramMarkdown: input.diagramMarkdown,
    epics: epicDrafts,
    stories,
    agentOutputs: input.agentOutputs,
  });

  return {
    epics,
    stories,
    designSystemBrief: designBriefResult.brief,
    componentGaps,
    monitor: {
      outputPreview: clipText(
        [
          `Epic synthesis:\n${epicResult.outputPreview}`,
          `Story synthesis:\n${storyOutputs.join('\n\n')}`,
          `Component gap synthesis:\n${componentOutputs.join('\n\n')}`,
          `Design-system brief:\n${designBriefResult.outputPreview}`,
        ].join('\n\n'),
        2400,
      ),
      usedEpicFallback: epicResult.usedFallback,
      usedStoryFallback,
      designSystemBriefPreview: clipText(designBriefResult.brief, 600),
    },
  };
}

function storyRowsToGridMarkdown(
  stories: PipelineStory[],
  epicsById: Map<string, PipelineEpic>,
  agentOutputs: AgentOutputRecord[],
): string {
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
    'Swarm Insights',
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
      buildStorySwarmInsightText(story, agentOutputs),
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
  generation: PipelineGenerationConfig;
  brief: string;
  artifactImages?: ClassifiedVisionUiImage[];
  swarmInsights?: string;
}): Promise<VisionDesignSystemBuildResult> {
  const base = defaultVisionDesignSystem();
  const artifactImages = (input.artifactImages || []).slice(0, MAX_VISION_INPUT_IMAGES);
  const schemaGuide = [
    'Expected JSON shape:',
    '{',
    '  "version": 1,',
    '  "activeScenarioId": "base",',
    '  "scenarios": [',
    '    {',
    '      "id": "base",',
    '      "name": "Base",',
    '      "palette": {',
    '        "primary": "#2563eb",',
    '        "accent": ["#7c3aed"],',
    '        "neutral": ["#f8fafc", "#e2e8f0", "#64748b", "#0f172a"],',
    '        "semantic": { "success": "#16a34a", "warning": "#d97706", "error": "#dc2626", "info": "#2563eb" },',
    '        "pairings": {',
    '          "primaryPrimitive": "blue-600",',
    '          "accentPrimitives": ["violet-600"],',
    '          "neutralPrimitives": ["slate-50", "slate-200", "slate-600", "slate-900"],',
    '          "semanticPrimitives": { "success": "green-600", "warning": "amber-600", "error": "red-600", "info": "blue-600" }',
    '        }',
    '      },',
    '      "ratios": [',
    '        {',
    '          "scope": "ui",',
    '          "neutralPct": 72,',
    '          "primaryPct": 16,',
    '          "accentPct": 8,',
    '          "semanticPct": 4,',
    '          "primitiveBreakdown": [',
    '            { "id": "neutral-base", "primitiveId": "slate-100", "pct": 46, "usage": "surface" },',
    '            { "id": "neutral-strong", "primitiveId": "slate-700", "pct": 26, "usage": "surface" },',
    '            { "id": "primary", "primitiveId": "primary", "pct": 16, "usage": "item" },',
    '            { "id": "accent-1", "primitiveId": "violet-600", "pct": 8, "usage": "item" },',
    '            { "id": "accent-2", "primitiveId": "teal-500", "pct": 4, "usage": "item" }',
    '          ]',
    '        }',
    '      ]',
    '    }',
    '  ],',
    '  "foundations": {',
    '    "fontFamily": "...",',
    '    "headingFontFamily": "...",',
    '    "decorativeFontFamily": "...",',
    '    "imageProfiles": [',
    '      { "id": "default", "name": "...", "style": "...", "lighting": "...", "lineWeight": "...", "notes": "...", "placeholder": "https://..." }',
    '    ]',
    '  },',
    '  "controls": {',
    '    "typography": { "baseSizePx": 16, "baseWeight": 420, "sizeGrowth": 48, "weightGrowth": 42, "contrast": 58 },',
    '    "fontVariance": "splitHeading",',
    '    "pillTargets": ["buttons", "tabs"],',
    '    "spacing": { "pattern": 42, "density": 54, "aroundVsInside": 52 },',
    '    "flatness": 38,',
    '    "zoning": 68,',
    '    "softness": 44,',
    '    "surfaceSaturation": 26,',
    '    "itemSaturation": 62,',
    '    "colorVariance": 58,',
    '    "colorBleed": 24,',
    '    "colorBleedTone": "accent",',
    '    "colorBleedCustom": "#2563eb",',
    '    "colorBleedText": 18,',
    '    "wireframeFeeling": 12,',
    '    "visualRange": 64,',
    '    "skeuomorphism": 22,',
    '    "skeuomorphismStyle": "subtle",',
    '    "negativeZoneStyle": 36,',
    '    "boldness": 58,',
    '    "boldTypographyStyle": "gradient",',
    '    "boldGradientSource": "auto",',
    '    "boldGradientFrom": "#1d4ed8",',
    '    "boldGradientMid": "#7c3aed",',
    '    "boldGradientTo": "#14b8a6",',
    '    "strictNoDarkMode": false,',
    '    "darkMode": {',
    '      "showPreview": true,',
    '      "useOverrides": false,',
    '      "canvasBg": "#0b1020",',
    '      "surfaceBg": "#121a2d",',
    '      "panelBg": "#1b2740",',
    '      "separator": "#334155",',
    '      "textPrimary": "#f8fafc",',
    '      "textSecondary": "#cbd5e1",',
    '      "textMuted": "#94a3b8",',
    '      "primary": "#60a5fa",',
    '      "accent": "#a78bfa",',
    '      "buttonBg": "#3b82f6"',
    '    }',
    '  }',
    '}',
  ].join('\n');
  if (artifactImages.length > 0) {
    try {
      const imageNotes = artifactImages
        .map((img, idx) =>
          `${idx + 1}. ${img.sourceName} :: ${img.label} | kind=${img.kind}${img.pageNo ? ` | page=${img.pageNo}` : ''} | uiScore=${img.uiScore} | note=${img.rationale}`,
        )
        .join('\n');
      const out = await runOpenAIResponsesText(
        [
          {
            role: 'system',
            content: [
              'Return ONLY JSON. No markdown fences.',
              'Task: Generate a Diregram Vision design system object (version:1).',
              'Use uploaded UI images as the primary visual evidence. Use the written brief for product/domain context only.',
              'Ignore non-visual product requirements when they conflict with the actual UI style shown in the images.',
              visionRendererControlGuide(),
              '',
              schemaGuide,
              '',
              'Be explicit about palette pairings, typography, spacing, roundness, saturation, variance, zoning, flatness, boldness, dark-mode stance, and imageProfiles.',
              'Do not return a placeholder/generic template if the images show a stronger style direction.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  `Design brief:\n${clipText(input.brief, 5000) || '(none)'}`,
                  '',
                  `Swarm insights:\n${clipText(input.swarmInsights, 3500) || '(none)'}`,
                  '',
                  `Selected UI images (${artifactImages.length}):`,
                  imageNotes || '(none)',
                ].join('\n'),
              },
              ...artifactImages.map((img) => ({
                type: 'input_image' as const,
                image_url: img.signedUrl,
                detail: 'low' as const,
              })),
            ],
          },
        ],
        {
          apiKey: input.generation.openaiApiKey,
          temperature: 0.2,
          maxOutputTokens: 4000,
          withWebSearch: false,
        },
      );
      const parsed = parseJsonObject(out);
      const direct = coerceVisionDesignSystem(parsed);
      if (direct) {
        return {
          designSystem: normalizeVisionDesignSystem(direct),
          monitor: {
            mode: 'multimodal',
            outputPreview: clipText(out, 2400),
            artifactImageCount: artifactImages.length,
          },
        };
      }
      const repaired = await repairVisionDesignSystemCandidate({
        generation: input.generation,
        rawOutput: out,
        brief: input.brief,
        swarmInsights: input.swarmInsights,
      });
      if (repaired) {
        return {
          designSystem: normalizeVisionDesignSystem(repaired),
          monitor: {
            mode: 'multimodal',
            outputPreview: clipText(out, 2400),
            artifactImageCount: artifactImages.length,
          },
        };
      }
    } catch {
      // fall through to the text-only fallback below
    }
  }

  const prompt = [
    'Return ONLY JSON.',
    'Generate a complete Diregram Vision design system object, not a shallow theme summary.',
    visionRendererControlGuide(),
    '',
    schemaGuide,
    '',
    'Use the brief and swarm insights to pick concrete controls that will visibly change the fixed preview renderer.',
    `Brief:\n${clipText(input.brief, 4000) || '(none)'}`,
    `Swarm insights:\n${clipText(input.swarmInsights, 2500) || '(none)'}`,
  ].join('\n\n');

  try {
    const out = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 4200,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const parsed = parseJsonObject(out);
    const direct = parsed ? coerceVisionDesignSystem(parsed) : null;
    if (!direct) {
      const repaired = await repairVisionDesignSystemCandidate({
        generation: input.generation,
        rawOutput: out,
        brief: input.brief,
        swarmInsights: input.swarmInsights,
      });
      if (!repaired) throw new Error('Invalid Vision design system JSON');
      return {
        designSystem: normalizeVisionDesignSystem(repaired),
        monitor: {
          mode: 'text',
          outputPreview: clipText(out, 1600),
          artifactImageCount: artifactImages.length,
        },
      };
    }
    return {
      designSystem: normalizeVisionDesignSystem(direct),
      monitor: {
        mode: 'text',
        outputPreview: clipText(out, 1600),
        artifactImageCount: artifactImages.length,
      },
    };
  } catch {
    return {
      designSystem: normalizeVisionDesignSystem(base),
      monitor: {
        mode: 'default_fallback',
        outputPreview: 'Used default normalized Vision design system because AI generation failed.',
        artifactImageCount: artifactImages.length,
      },
    };
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

async function generateTsxStubWithModel(input: {
  generation: PipelineGenerationConfig;
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
    const out = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 1800,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const cleaned = stripAssistantMarkdownChatter(
      out.replace(/^\s*```(?:tsx|typescript|ts|jsx|js)?\s*/i, '').replace(/\s*```\s*$/i, '').trim(),
    );
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

function fallbackNoteForEpic(input: {
  epic: PipelineEpic;
  stories: PipelineStory[];
  diagramFileId: string;
  agentOutputs: AgentOutputRecord[];
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
    const swarmInsights = collectRelevantSwarmRecommendations({
      agentOutputs: input.agentOutputs,
      refs: story.diagramRefs,
      limit: 8,
    });
    if (swarmInsights.length) {
      lines.push('### Swarm Analysis');
      swarmInsights.forEach((rec) => {
        lines.push(`- [${rec.agent}] ${rec.title}: ${clipText(rec.detail, 600)}`);
      });
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

async function generateNoteForEpicWithModel(input: {
  generation: PipelineGenerationConfig;
  epic: PipelineEpic;
  stories: PipelineStory[];
  diagramFileId: string;
  agentOutputs: AgentOutputRecord[];
}): Promise<string> {
  const storyPayload = input.stories
    .slice(0, 40)
    .map((story) => ({
      id: story.id,
      title: story.title,
      description: story.description,
      actor: story.actor,
      goal: story.goal,
      benefit: story.benefit,
      priority: story.priority,
      acceptanceCriteria: story.acceptanceCriteria,
      uiElements: story.uiElements,
      diagramRefs: story.diagramRefs.map((ref) => ref.anchorKey),
      swarmInsights: collectRelevantSwarmRecommendations({
        agentOutputs: input.agentOutputs,
        refs: story.diagramRefs,
        limit: 8,
      }).map((rec) => ({
        agent: rec.agent,
        title: rec.title,
        detail: clipText(rec.detail, 400),
        diagramRefs: rec.diagramRefs.map((ref) => ref.anchorKey),
      })),
    }));

  const prompt = [
    'Write one Diregram epic note in markdown.',
    'Return markdown only. No code fences.',
    'Preserve exact grounding from the provided stories and swarm insights.',
    'Required structure:',
    '# Epic title',
    'Primary diagram file line',
    'For each story:',
    '## numbered story heading',
    '- Story metadata bullets',
    '### Acceptance Criteria',
    '### Swarm Analysis',
    '### UI Elements Table',
    'Do not use placeholders or generic filler text.',
    '',
    `Epic title: ${input.epic.title}`,
    `Epic summary: ${input.epic.summary || '(none)'}`,
    `Primary diagram file: ${input.diagramFileId}`,
    '',
    'Story payload:',
    JSON.stringify(storyPayload, null, 2),
  ].join('\n');

  try {
    const out = await runPipelineGenerationText({
      generation: input.generation,
      maxTokens: 3200,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });
    const cleaned = stripAssistantMarkdownChatter(
      out.replace(/^\s*```(?:md|markdown)?\s*/i, '').replace(/\s*```\s*$/i, '').trim(),
      { preferredStart: /^#\s+/ },
    );
    if (!cleaned) throw new Error('Empty note output');
    return upsertHeader(cleaned + '\n', { kind: 'note', version: 1 });
  } catch {
    return fallbackNoteForEpic(input);
  }
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
  const imageUploadsRaw = Array.isArray(input.imageUploads) ? (input.imageUploads as unknown[]) : [];
  const embeddingModel = normalizeText(input.embeddingModel) || undefined;
  const generationProvider = normalizeGenerationProvider(input.generationProvider);
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
  const imageUploads: PipelineUploadInput[] = imageUploadsRaw
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

  pipelineLog(job.id, 'start', {
    uploadCount: uploads.length,
    manualImageUploadCount: imageUploads.length,
    generationProvider,
    ownerId,
    projectFolderId,
  });

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
  if (generationProvider === 'claude' && !claudeApiKey) throw new Error('Missing Claude API key');
  const generation: PipelineGenerationConfig = {
    provider: generationProvider,
    openaiApiKey,
    claudeApiKey,
    claudeModel,
  };

  const runLabel = `pipeline-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}-${randomUUID().slice(0, 6)}`;
  const linkedArtifacts: PipelineArtifactManifest['linkedArtifacts'] = [];
  const createdFiles: Array<{ id: string; name: string; kind: 'diagram' | 'grid' | 'vision' | 'note' }> = [];
  const createdResources: Array<{ id: string; name: string; kind: string }> = [];
  let stageState: JsonRecord = { ...(job.state || {}), runLabel };
  let currentStep = normalizeText(job.step) || 'queued';
  let currentProgressPct = Math.max(0, Math.min(99, Math.floor(Number(job.progress_pct || 0))));

  const appendTimelineEvent = (event: JsonRecord) => {
    const existing = Array.isArray(stageState.timeline)
      ? (stageState.timeline as unknown[]).filter((row) => row && typeof row === 'object').map((row) => ({ ...(row as JsonRecord) }))
      : [];
    const next = existing
      .concat({
        at: nowIso(),
        ...event,
      })
      .slice(-180);
    stageState = { ...stageState, timeline: next };
  };

  const setStage = async (step: string, progressPct: number, patch?: JsonRecord, timelineMeta?: JsonRecord) => {
    currentStep = step;
    currentProgressPct = Math.max(1, Math.min(99, Math.floor(progressPct)));
    if (patch) stageState = { ...stageState, ...patch };
    appendTimelineEvent({
      kind: 'stage',
      step,
      progressPct: currentProgressPct,
      ...(timelineMeta || {}),
    });
    pipelineLog(job.id, 'stage_update', {
      step,
      progressPct: Math.max(1, Math.min(99, Math.floor(progressPct))),
      ...(timelineMeta || {}),
    });
    await withTimeout(`Async job state update (${step})`, ASYNC_JOB_UPDATE_TIMEOUT_MS, () =>
      updateAsyncJob(job.id, {
        step,
        progress_pct: currentProgressPct,
        state: stageState,
      }),
    );
  };

  const recordActivity = async (input: {
    step?: string;
    level?: 'info' | 'warn' | 'error';
    title: string;
    message: string;
    meta?: JsonRecord;
  }) => {
    const step = input.step || currentStep || 'running';
    const event = {
      kind: 'activity',
      step,
      progressPct: currentProgressPct,
      level: input.level || 'info',
      title: clipText(input.title, 160),
      message: clipText(input.message, 2400),
      ...(input.meta || {}),
    } satisfies JsonRecord;
    appendTimelineEvent(event);
    pipelineLog(job.id, 'activity', event);
    await withTimeout(`Async job activity update (${step})`, ASYNC_JOB_UPDATE_TIMEOUT_MS, () =>
      updateAsyncJob(job.id, {
        step,
        progress_pct: currentProgressPct,
        state: stageState,
      }),
    );
  };

  const ensureNotCancelled = async () => {
    if (await isAsyncJobCancelRequested(job.id)) {
      throw new Error('Job cancelled');
    }
  };

  const prepareInputsProgressPct = (index: number, total: number, phase: number) => {
    const safeTotal = Math.max(1, total);
    const safePhase = Math.max(0, Math.min(0.99, phase));
    return 3 + Math.floor((((Math.max(1, index) - 1) + safePhase) / safeTotal) * 7);
  };

  await ensureNotCancelled();
  await setStage('prepare_inputs', 3, { uploadCount: uploads.length, manualImageUploadCount: imageUploads.length, generationProvider });

  const uploadTexts = await collectUploadTexts({
    uploads,
    requesterUserId,
    admin,
    onProgress: async (event) => {
      const phaseMap: Record<string, number> = {
        download_input: 0.08,
        read_text: 0.28,
        convert_docling: 0.45,
        download_converted: 0.72,
        analyze: 0.88,
        done: 0.98,
      };
      const phase = phaseMap[event.action] ?? 0.1;
      pipelineLog(job.id, 'prepare_inputs_progress', {
        fileIndex: event.index,
        fileTotal: event.total,
        fileName: safeFileName(event.name),
        action: event.action,
        sourceKind: event.sourceKind || '',
      });
      await setStage(
        'prepare_inputs',
        prepareInputsProgressPct(event.index, event.total, phase),
        {
          sourceProgress: {
            updatedAt: nowIso(),
            index: event.index,
            total: event.total,
            name: safeFileName(event.name),
            action: event.action,
            sourceKind: event.sourceKind || '',
          },
        },
        {
          kind: 'source_progress',
          fileIndex: event.index,
          fileTotal: event.total,
          fileName: safeFileName(event.name),
          action: event.action,
        },
      );
    },
  });

  const usableUploadTexts = uploadTexts.filter((item) => !item.analysis.lowSignal);
  const blockedUploadTexts = uploadTexts.filter((item) => item.analysis.lowSignal);
  const manualUploadImages = collectManualUploadImages(imageUploads);
  const selectedDiagramImages = selectDoclingDiagramImages(usableUploadTexts.flatMap((item) => item.images).concat(manualUploadImages));
  const signedDiagramImages = await createSignedDoclingImageUrls({
    assets: selectedDiagramImages,
    admin,
  });
  pipelineLog(job.id, 'prepare_inputs_complete', {
    usableCount: usableUploadTexts.length,
    blockedCount: blockedUploadTexts.length,
    manualImageCount: manualUploadImages.length,
    selectedImageCount: signedDiagramImages.length,
    files: uploadTexts.map((item) => ({
      name: item.name,
      sourceKind: item.sourceKind,
      lowSignal: item.analysis.lowSignal,
      charCount: item.analysis.charCount,
      wordCount: item.analysis.wordCount,
      imageCount: item.images.length,
    })),
  });

  await ensureNotCancelled();
  await setStage(
    'prepare_inputs',
    10,
    {
      sourceMonitor: {
        updatedAt: nowIso(),
        usableCount: usableUploadTexts.length,
        blockedCount: blockedUploadTexts.length,
        manualImageCount: manualUploadImages.length,
        sources: uploadTexts.slice(0, 12).map((item) => ({
          name: item.name,
          sourceKind: item.sourceKind,
          mimeType: item.mimeType,
          size: item.size,
          charCount: item.analysis.charCount,
          lineCount: item.analysis.lineCount,
          wordCount: item.analysis.wordCount,
          alphaRatio: item.analysis.alphaRatio,
          lowSignal: item.analysis.lowSignal,
          warnings: item.analysis.warnings.slice(0, 4),
          previewText: item.analysis.preview,
          imageCount: item.images.length,
          imageManifestObjectPath: item.imageManifestObjectPath,
        })),
      },
    },
    {
      kind: 'source_extraction',
      usableCount: usableUploadTexts.length,
      blockedCount: blockedUploadTexts.length,
    },
  );

  if (!usableUploadTexts.length) {
    const detail = uploadTexts
      .map((item) => {
        const reasons = item.analysis.warnings.length ? item.analysis.warnings.join(' ') : 'Converted text quality was too weak.';
        return `${item.name}: ${reasons}`;
      })
      .join(' | ');
    throw new Error(
      `Unable to extract reliable text from the uploaded files. ${detail} Convert DOC/PDF files to DOCX or text-based PDF, or upload markdown/text instead.`,
    );
  }

  await ensureNotCancelled();
  await setStage('generate_single_diagram', 16, {
    sourceCount: usableUploadTexts.length,
    ignoredSourceCount: blockedUploadTexts.length,
    sourceImageCount: signedDiagramImages.length,
  });

  const diagramName = `${runLabel}-single-diagram`;
  let singleDiagramFileId = '';
  let lastPersistedDiagramHash = '';

  const ensurePrimaryDiagramFile = async (initialMarkdown: string) => {
    if (singleDiagramFileId) return singleDiagramFileId;
    const { data: insertedDiagram, error: diagramInsertErr } = await admin
      .from('files')
      .insert({
        name: diagramName,
        owner_id: ownerId,
        folder_id: projectFolderId,
        room_name: `file-${randomUUID()}`,
        last_opened_at: nowIso(),
        kind: 'diagram',
        content: initialMarkdown,
      } as never)
      .select('id,name')
      .single();
    if (diagramInsertErr) throw new Error(diagramInsertErr.message);
    singleDiagramFileId = normalizeText((insertedDiagram as { id?: unknown }).id);
    if (!singleDiagramFileId) throw new Error('Failed to create single diagram file');
    createdFiles.push({ id: singleDiagramFileId, name: diagramName, kind: 'diagram' });
    stageState = {
      ...stageState,
      singleDiagramFileId,
      primaryDiagramFileId: singleDiagramFileId,
    };
    return singleDiagramFileId;
  };

  const persistPrimaryDiagramMarkdown = async (markdown: string) => {
    const safeMarkdown = normalizeNewlines(markdown);
    if (!safeMarkdown.trim()) return;
    const nextHash = hashMarkdown(safeMarkdown);
    if (nextHash === lastPersistedDiagramHash) return;
    const fileId = await ensurePrimaryDiagramFile(safeMarkdown);
    const { error: diagramUpdateErr } = await admin
      .from('files')
      .update({
        content: safeMarkdown,
        last_opened_at: nowIso(),
      } as never)
      .eq('id', fileId);
    if (diagramUpdateErr) throw new Error(diagramUpdateErr.message);
    lastPersistedDiagramHash = nextHash;
  };

  let diagramMarkdown = '';
  try {
    diagramMarkdown = await generateSingleDiagram({
      generation,
      uploadTexts: usableUploadTexts.map((x) => ({
        name: x.sourceKind === 'docling' ? `${x.name} (converted)` : x.name,
        text: x.text,
      })),
      uploadImages: signedDiagramImages.map((img) => ({
        name: `${img.sourceName} :: ${img.label}`,
        signedUrl: img.signedUrl,
        sourceName: img.sourceName,
        kind: img.kind,
        pageNo: img.pageNo,
      })),
      onMonitorUpdate: async (event) => {
        const preview = normalizeNewlines(event.markdown).split('\n').slice(0, 260).join('\n').slice(0, 20_000);
        const errors = event.validation.errors
          .slice(0, 8)
          .map((issue) => `${issue.code}: ${normalizeText(issue.message)}`);
        const warnings = event.validation.warnings
          .slice(0, 6)
          .map((issue) => `${issue.code}: ${normalizeText(issue.message)}`);

        await setStage(
          'generate_single_diagram',
          16,
          {
            diagramMonitor: {
              attempt: event.attempt,
              mode: event.mode,
              markdownHash: hashMarkdown(event.markdown),
              lineCount: normalizeNewlines(event.markdown).split('\n').length,
              previewMarkdown: preview,
              errorCount: event.validation.errors.length,
              warningCount: event.validation.warnings.length,
              errors,
              warnings,
              updatedAt: nowIso(),
            },
          },
          {
            kind: 'diagram_monitor',
            mode: event.mode,
            attempt: event.attempt,
            errorCount: event.validation.errors.length,
            warningCount: event.validation.warnings.length,
          },
        );
        if (event.mode !== 'attempt_start') {
          await persistPrimaryDiagramMarkdown(event.markdown);
        }
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown diagram generation error');
    stageState = {
      ...stageState,
      diagramMonitor: {
        ...(stageState.diagramMonitor && typeof stageState.diagramMonitor === 'object' ? (stageState.diagramMonitor as JsonRecord) : {}),
        failedAt: nowIso(),
        finalFailureReason: clipText(message, 4000),
      },
    };
    await recordActivity({
      step: 'generate_single_diagram',
      level: 'error',
      title: 'Diagram generation failed',
      message,
    });
    throw error;
  }
  await persistPrimaryDiagramMarkdown(diagramMarkdown);
  if (!singleDiagramFileId) throw new Error('Failed to create single diagram file');

  let currentDiagramMarkdown = diagramMarkdown;
  let currentDiagramLinkIndex = buildDiagramLinkIndex({
    diagramFileId: singleDiagramFileId,
    markdown: currentDiagramMarkdown,
  });
  linkedArtifacts.push(toLinkedArtifact('diagram', singleDiagramFileId, diagramName, currentDiagramLinkIndex));

  await ensureNotCancelled();
  await setStage('build_rag_from_diagram', 28, { singleDiagramFileId, diagramRefs: currentDiagramLinkIndex.length });

  let seedRag = await ingestDiagramOnlyToRag({
    ownerId,
    projectFolderId,
    diagramFileId: singleDiagramFileId,
    diagramMarkdown: currentDiagramMarkdown,
    openaiApiKey,
    embeddingModel,
    admin,
  });
  await recordActivity({
    step: 'build_rag_from_diagram',
    title: 'Seed RAG created',
    message: `Seeded project RAG from the primary diagram with ${seedRag.chunks} chunks. Public project id: ${seedRag.publicProjectId}.`,
  });

  await ensureNotCancelled();
  await setStage('swarm_analysis', 40, { seedChunkCount: seedRag.chunks });

  const agents: SwarmAgentName[] = ['technical', 'user_journey', 'interaction', 'content', 'ui_presentation'];
  let agentOutputs: AgentOutputRecord[] = [];
  const revisionUploadTexts = usableUploadTexts.map((x) => ({
    name: x.sourceKind === 'docling' ? `${x.name} (converted)` : x.name,
    text: x.text,
  }));

  for (let round = 1; round <= MAX_SWARM_REVISION_ROUNDS; round += 1) {
    await ensureNotCancelled();
    await recordActivity({
      step: 'swarm_analysis',
      title: `Swarm round ${round} started`,
      message: `Running swarm analysis round ${round} of ${MAX_SWARM_REVISION_ROUNDS} against the current primary diagram.`,
      meta: { swarmRound: round },
    });

    const roundOutputs: AgentOutputRecord[] = [];
    for (let i = 0; i < agents.length; i += 1) {
      await ensureNotCancelled();
      const agent = agents[i]!;
      let output: AgentOutputRecord;
      try {
        output = await runSwarmAgent({
          agent,
          generation,
          ownerId,
          projectFolderId,
          openaiApiKey,
          embeddingModel,
          diagramLinkIndex: currentDiagramLinkIndex,
          diagramMarkdown: currentDiagramMarkdown,
        });
      } catch (error) {
        await recordActivity({
          step: 'swarm_analysis',
          level: 'error',
          title: `Swarm agent failed: ${agent}`,
          message: error instanceof Error ? error.message : String(error || 'Unknown swarm error'),
          meta: { agent, swarmRound: round },
        });
        throw error;
      }
      roundOutputs.push(output);
      await recordActivity({
        step: 'swarm_analysis',
        level: output.monitor?.usedFallback ? 'warn' : 'info',
        title: `Swarm agent completed: ${agent}`,
        message: [
          `Round ${round}. Recommendations: ${output.recommendations.length}.`,
          output.recommendations.length
            ? `Top titles: ${output.recommendations.slice(0, 3).map((rec) => rec.title).join(' | ')}.`
            : 'No recommendations returned.',
          output.monitor?.usedFallback ? 'Fallback recommendation was used.' : '',
          output.monitor?.outputPreview ? `Model output preview: ${output.monitor.outputPreview}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        meta: { agent, recommendationCount: output.recommendations.length, swarmRound: round },
      });

      await setStage('swarm_analysis', 42 + Math.floor(((i + 1) / agents.length) * 12), {
        swarmAgent: agent,
        swarmCompleted: i + 1,
        swarmTotal: agents.length,
        swarmRound: round,
      });
    }

    agentOutputs = roundOutputs;
    const recommendationCount = countSwarmRecommendations(roundOutputs);
    await recordActivity({
      step: 'swarm_analysis',
      title: `Swarm round ${round} summary`,
      message: `Total recommendations in round ${round}: ${recommendationCount}.`,
      meta: { swarmRound: round, recommendationCount },
    });

    if (recommendationCount === 0) {
      await recordActivity({
        step: 'swarm_analysis',
        title: 'Swarm loop converged',
        message: `No further recommendations were returned in round ${round}. Downstream artifacts will use the current diagram.`,
        meta: { swarmRound: round },
      });
      break;
    }

    if (round >= MAX_SWARM_REVISION_ROUNDS) {
      await recordActivity({
        step: 'swarm_analysis',
        level: 'warn',
        title: 'Swarm revision limit reached',
        message: `Stopped after ${MAX_SWARM_REVISION_ROUNDS} swarm rounds with ${recommendationCount} remaining recommendations.`,
        meta: { swarmRound: round, recommendationCount },
      });
      break;
    }

    const revisedDiagram = await runSwarmDrivenDiagramRevision({
      generation,
      markdown: currentDiagramMarkdown,
      uploadTexts: revisionUploadTexts,
      agentOutputs: roundOutputs,
    });
    if (hashMarkdown(revisedDiagram) === hashMarkdown(currentDiagramMarkdown)) {
      await recordActivity({
        step: 'swarm_analysis',
        level: 'warn',
        title: 'Swarm revision was not accepted',
        message: `Round ${round} produced recommendations, but no clean diagram revision was accepted. Downstream artifacts will use the current diagram and current swarm outputs.`,
        meta: { swarmRound: round, recommendationCount },
      });
      break;
    }

    currentDiagramMarkdown = revisedDiagram;
    currentDiagramLinkIndex = buildDiagramLinkIndex({
      diagramFileId: singleDiagramFileId,
      markdown: currentDiagramMarkdown,
    });
    const diagramArtifact = linkedArtifacts.find((artifact) => artifact.kind === 'diagram' && artifact.id === singleDiagramFileId);
    if (diagramArtifact) diagramArtifact.diagramRefs = currentDiagramLinkIndex;

    const { error: diagramUpdateErr } = await admin
      .from('files')
      .update({ content: currentDiagramMarkdown } as never)
      .eq('id', singleDiagramFileId);
    if (diagramUpdateErr) throw new Error(diagramUpdateErr.message);

    seedRag = await ingestDiagramOnlyToRag({
      ownerId,
      projectFolderId,
      diagramFileId: singleDiagramFileId,
      diagramMarkdown: currentDiagramMarkdown,
      openaiApiKey,
      embeddingModel,
      admin,
    });
    await recordActivity({
      step: 'swarm_analysis',
      title: 'Swarm revision applied',
      message: `Applied swarm-driven diagram revision after round ${round} and reseeded diagram RAG with ${seedRag.chunks} chunks.`,
      meta: { swarmRound: round, recommendationCount },
    });
  }

  for (const output of agentOutputs) {
    const agent = output.agent;
    const { data: resourceData, error: resourceErr } = await admin
      .from('project_resources')
      .insert({
        owner_id: ownerId,
        project_folder_id: projectFolderId,
        name: `${runLabel}-swarm-${agent}.json`,
        kind: 'json',
        markdown: JSON.stringify({ agent: output.agent, recommendations: output.recommendations }, null, 2),
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
  }

  let synthesis: PipelineSynthesis;
  try {
    synthesis = await synthesizePipeline({
      generation,
      diagramLinkIndex: currentDiagramLinkIndex,
      diagramMarkdown: currentDiagramMarkdown,
      agentOutputs,
    });
  } catch (error) {
    await recordActivity({
      step: 'swarm_analysis',
      level: 'error',
      title: 'Synthesis failed',
      message: error instanceof Error ? error.message : String(error || 'Unknown synthesis error'),
    });
    throw error;
  }
  await recordActivity({
    step: 'swarm_analysis',
    level: synthesis.monitor?.usedStoryFallback || synthesis.monitor?.usedEpicFallback ? 'warn' : 'info',
    title: 'Swarm synthesis complete',
    message: [
      `Epics: ${synthesis.epics.length}. Stories: ${synthesis.stories.length}. Component gaps: ${synthesis.componentGaps.length}.`,
      synthesis.monitor?.usedEpicFallback ? 'Epic fallback was used.' : '',
      synthesis.monitor?.usedStoryFallback ? 'Story fallback was used.' : '',
      synthesis.monitor?.designSystemBriefPreview ? `Design-system brief: ${synthesis.monitor.designSystemBriefPreview}` : '',
      synthesis.monitor?.outputPreview ? `Synthesis output preview: ${synthesis.monitor.outputPreview}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  });

  await ensureNotCancelled();
  await setStage('generate_user_story_grid', 58, {
    epicCount: synthesis.epics.length,
    storyCount: synthesis.stories.length,
  });

  const epicsById = new Map(synthesis.epics.map((epic) => [epic.id, epic]));
  const gridMarkdown = storyRowsToGridMarkdown(synthesis.stories, epicsById, agentOutputs);
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
  await recordActivity({
    step: 'generate_user_story_grid',
    title: 'User story grid created',
    message: `Generated ${synthesis.stories.length} story rows across ${synthesis.epics.length} epics.`,
  });

  await ensureNotCancelled();
  await setStage('generate_design_system_and_components', 70, { componentGapCount: synthesis.componentGaps.length });

  const selectedVisionImageCandidates = selectDoclingVisionImageCandidates(
    usableUploadTexts.flatMap((item) => item.images).concat(manualUploadImages),
  );
  const signedVisionImageCandidates = await createSignedDoclingImageUrls({
    assets: selectedVisionImageCandidates,
    admin,
  });
  const visionUiImages = await classifyVisionUiImages({
    brief: synthesis.designSystemBrief,
    images: signedVisionImageCandidates,
    apiKey: openaiApiKey,
  });
  pipelineLog(job.id, 'vision_ui_image_selection', {
    candidateCount: signedVisionImageCandidates.length,
    selectedCount: visionUiImages.length,
    selected: visionUiImages.map((img) => ({
      sourceName: img.sourceName,
      label: img.label,
      kind: img.kind,
      pageNo: img.pageNo,
      uiScore: img.uiScore,
    })),
  });
  await setStage('generate_design_system_and_components', 71, {
    componentGapCount: synthesis.componentGaps.length,
    visionImageCandidateCount: signedVisionImageCandidates.length,
    visionUiImageCount: visionUiImages.length,
  });
  await recordActivity({
    step: 'generate_design_system_and_components',
    title: 'Vision image selection complete',
    message: `Selected ${visionUiImages.length} UI images from ${signedVisionImageCandidates.length} candidates for vision generation.`,
  });

  const visionBuild = await buildVisionDesignSystem({
    generation,
    brief: synthesis.designSystemBrief,
    artifactImages: visionUiImages,
    swarmInsights: buildVisionSwarmInsightBrief({
      agentOutputs,
      stories: synthesis.stories,
      designSystemBrief: synthesis.designSystemBrief,
    }),
  });
  await recordActivity({
    step: 'generate_design_system_and_components',
    level: visionBuild.monitor.mode === 'default_fallback' ? 'warn' : 'info',
    title: 'Vision design system generated',
    message: [
      `Mode: ${visionBuild.monitor.mode}.`,
      `Artifact images used: ${visionBuild.monitor.artifactImageCount}.`,
      `Output preview: ${visionBuild.monitor.outputPreview}`,
    ]
      .filter(Boolean)
      .join(' '),
  });
  const designSystem = visionBuild.designSystem;
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
  await recordActivity({
    step: 'generate_design_system_and_components',
    title: 'Vision file saved',
    message: `Saved design system file "${visionName}" with font ${designSystem.foundations.fontFamily || '(default)'}.`,
  });

  for (let i = 0; i < synthesis.componentGaps.length; i += 1) {
    await ensureNotCancelled();
    const component = synthesis.componentGaps[i]!;
    const tsx = await generateTsxStubWithModel({
      generation,
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
    await recordActivity({
      step: 'generate_design_system_and_components',
      title: 'Component stub created',
      message: `Created TSX stub "${resourceLabel}" for ${component.name}.`,
      meta: { componentId: component.id },
    });

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
    const markdown = await generateNoteForEpicWithModel({
      generation,
      epic,
      stories,
      diagramFileId: singleDiagramFileId,
      agentOutputs,
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
    await recordActivity({
      step: 'generate_epic_notes',
      title: 'Epic note created',
      message: `Saved note "${name}" with ${stories.length} stories linked to the primary diagram.`,
      meta: { epicId: epic.id, storyCount: stories.length },
    });

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
  await recordActivity({
    step: 'final_rag_refresh',
    title: 'Final RAG refresh queued',
    message: `Queued final RAG ingest using ${createdFiles.length} files and ${createdResources.length} resources.`,
  });

  const manifest: PipelineArtifactManifest = {
    runLabel,
    primaryDiagramFileId: singleDiagramFileId,
    linkedArtifacts,
  };

  await setStage(
    'done',
    99,
    {
      completedAt: nowIso(),
      finalManifestLinkedArtifacts: linkedArtifacts.length,
    },
    { kind: 'stage_complete' },
  );

  return {
    ok: true,
    runLabel,
    ownerId,
    projectFolderId,
    singleDiagramFileId,
    primaryDiagramFileId: singleDiagramFileId,
    diagramLinkIndex: currentDiagramLinkIndex,
    createdFiles,
    createdResources,
    seedRag,
    artifactManifest: manifest,
    manifest,
  };
}
