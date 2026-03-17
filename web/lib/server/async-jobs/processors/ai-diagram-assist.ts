import crypto from 'node:crypto';
import { decryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';
import { isAsyncJobCancelRequested, updateAsyncJob } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import {
  queryProjectKbContext,
  runOpenAIResponsesText,
} from '@/lib/server/openai-responses';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { validateNexusMarkdownImport } from '@/lib/markdown-import-validator';
import type { ImportValidationIssue } from '@/lib/markdown-import-validator';
import type {
  DiagramAssistAction,
  DiagramAssistAttributeSuggestion,
  DiagramAssistConnectorLabelOp,
  DiagramAssistDataObjectAttributesProposal,
  DiagramAssistDataObjectAttributesSelection,
  DiagramAssistMarkdownErrorsFixProposal,
  DiagramAssistMarkdownErrorsFixSelection,
  DiagramAssistMarkdownSectionPatch,
  DiagramAssistNodeTypeOp,
  DiagramAssistNodeStructureProposal,
  DiagramAssistNodeStructureSelection,
  DiagramAssistProposal,
  DiagramAssistSelection,
  DiagramAssistSingleScreenOp,
  DiagramAssistStatusDescriptionsProposal,
  DiagramAssistStatusDescriptionsSelection,
} from '@/lib/diagram-ai-assist-types';

const MAX_INPUT_SUBTREE_CHARS = 14_000;
const MAX_RECOMMENDATIONS = 14;
const MAX_ATTRIBUTES = 30;
const MAX_STATUS_VALUES = 24;
const MAX_TRANSITIONS = 120;
const MAX_TABLE_ROWS = 140;
const MAX_FLOW_LINES = 180;
const MAX_MARKDOWN_FIX_ISSUES = 80;
const MAX_MARKDOWN_FIX_TARGETS = 40;
const MAX_MARKDOWN_FIX_PATCHES = 40;
const DEFAULT_MARKDOWN_FIX_PATCHES = 24;
const MAX_MARKDOWN_FIX_REPAIR_ATTEMPTS = 4;
const MAX_MARKDOWN_FIX_REPLACEMENT_CHARS = 8000;
const MAX_MODEL_REPAIR_ATTEMPTS = 6;
const MAX_REPAIR_FEEDBACK_ERRORS = 8;
const MAX_PREVIOUS_RESPONSE_CHARS = 5000;
const FLOW_NODE_TYPES = [
  'step',
  'time',
  'loop',
  'action',
  'validation',
  'branch',
  'end',
  'goto',
  'single_screen_steps',
] as const;
type FlowNodeTypeValue = (typeof FLOW_NODE_TYPES)[number];
const NON_RETRYABLE_PREFIX = 'NON_RETRYABLE:';
const MAX_ERROR_SUMMARY_ITEMS = 12;

function coerceFlowNodeType(input: unknown): FlowNodeTypeValue | null {
  const v = normalizeText(input);
  return (FLOW_NODE_TYPES as readonly string[]).includes(v) ? (v as FlowNodeTypeValue) : null;
}

function normalizeText(input: unknown): string {
  return String(input || '').trim();
}

function normalizeNewlines(input: unknown): string {
  return String(input || '').replace(/\r\n?/g, '\n');
}

function sanitizeNodeStructureSubtreeReplacement(input: {
  subtreeReplacementMarkdown: unknown;
  fallbackSubtreeMarkdown: string;
}): { subtreeReplacementMarkdown: string; repairNotes: string[] } {
  let text = normalizeNewlines(input.subtreeReplacementMarkdown || '').slice(0, MAX_INPUT_SUBTREE_CHARS);
  const fallback = normalizeNewlines(input.fallbackSubtreeMarkdown || '').slice(0, MAX_INPUT_SUBTREE_CHARS);
  const repairNotes: string[] = [];

  if (!text.trim()) text = fallback;

  let unwrappedCount = 0;
  while (unwrappedCount < 2) {
    const m = text.match(/^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/);
    if (!m?.[1]) break;
    text = normalizeNewlines(m[1]);
    unwrappedCount += 1;
  }
  if (unwrappedCount > 0) {
    repairNotes.push(
      `Removed ${unwrappedCount} outer fenced wrapper${unwrappedCount === 1 ? '' : 's'} from subtree replacement.`,
    );
  }

  const lines = text.split('\n');
  const filtered = lines.filter((line) => !line.trimStart().startsWith('```'));
  const removedFenceLines = lines.length - filtered.length;
  if (removedFenceLines > 0) {
    repairNotes.push(
      `Removed ${removedFenceLines} standalone fence marker line${removedFenceLines === 1 ? '' : 's'} from subtree replacement.`,
    );
  }
  text = filtered.join('\n').trimEnd();

  if (!text.trim()) {
    text = fallback;
    repairNotes.push('Sanitized subtree became empty; reverted to original subtree.');
  }

  return {
    subtreeReplacementMarkdown: text.slice(0, MAX_INPUT_SUBTREE_CHARS),
    repairNotes: repairNotes.slice(0, 8),
  };
}

function hashMarkdown(text: string): string {
  return crypto.createHash('sha256').update(normalizeNewlines(text), 'utf8').digest('hex');
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

function extractUnclosedFenceStartLine(message: string): number | null {
  const m = normalizeText(message).match(/starting at line\s+(\d+)/i);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function isIssueInsideLineRange(issue: ImportValidationIssue, lineRange: { start: number; end: number } | null): boolean {
  if (!lineRange) return false;
  const line = extractIssueLineNumber(issue.message || '');
  if (!line) return false;
  const zeroBased = line - 1;
  return zeroBased >= lineRange.start && zeroBased <= lineRange.end;
}

function canonicalIssueSignature(issue: ImportValidationIssue): string {
  const normalizedMessage = normalizeText(issue.message)
    .toLowerCase()
    .replace(/starting at line\s+\d+/gi, 'starting at line <n>')
    .replace(/\bline\s+\d+\b/gi, 'line <n>')
    .replace(/\brn=\d+\b/gi, 'rn=<n>')
    .replace(/\brunningnumber\s+\d+\b/gi, 'runningnumber <n>')
    .replace(/\b\d+\b/g, '<n>');
  return `${issue.code}::${normalizedMessage}`;
}

function buildIssueSignatureCountMap(issues: ImportValidationIssue[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const key = canonicalIssueSignature(issue);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function diffAddedIssues(current: ImportValidationIssue[], baseline: ImportValidationIssue[]): ImportValidationIssue[] {
  const baselineCounts = buildIssueSignatureCountMap(baseline);
  const seen = new Map<string, number>();
  const added: ImportValidationIssue[] = [];
  for (const issue of current) {
    const key = canonicalIssueSignature(issue);
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > (baselineCounts.get(key) || 0)) {
      added.push(issue);
    }
  }
  return added;
}

function diffRemainingBaselineIssues(current: ImportValidationIssue[], baseline: ImportValidationIssue[]): ImportValidationIssue[] {
  const currentCounts = buildIssueSignatureCountMap(current);
  const seen = new Map<string, number>();
  const remaining: ImportValidationIssue[] = [];
  for (const issue of baseline) {
    const key = canonicalIssueSignature(issue);
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n <= (currentCounts.get(key) || 0)) {
      remaining.push(issue);
    }
  }
  return remaining;
}

function dedupeIssues(issues: ImportValidationIssue[]): ImportValidationIssue[] {
  const out: ImportValidationIssue[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const key = `${issue.code}|${normalizeText(issue.message)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function findBlockingNodeStructureErrors(input: {
  baselineErrors: ImportValidationIssue[];
  proposalErrors: ImportValidationIssue[];
  nextSubtreeRange: { start: number; end: number } | null;
}): ImportValidationIssue[] {
  const localErrors = input.proposalErrors.filter((err) => isIssueInsideLineRange(err, input.nextSubtreeRange));
  const newlyIntroducedErrors = diffAddedIssues(input.proposalErrors, input.baselineErrors);
  return dedupeIssues(localErrors.concat(newlyIntroducedErrors)).slice(0, 80);
}

function humanizeValidationIssue(issue: ImportValidationIssue): string {
  const message = normalizeText(issue.message);
  switch (issue.code) {
    case 'UNCLOSED_CODE_BLOCK': {
      const line = extractUnclosedFenceStartLine(message);
      return line
        ? `A code block starts on line ${line} but is never closed. Add a matching closing triple backtick (\`\`\`).`
        : 'A code block starts but is never closed. Add a matching closing triple backtick (``` ).';
    }
    case 'PARSE_FAILED':
      return 'The diagram node structure could not be parsed. Check indentation and node hierarchy formatting.';
    case 'NO_NODES':
      return 'No diagram nodes were found. Add at least one node line before the metadata separator.';
    case 'INVALID_JSON':
      return 'One of the metadata JSON blocks is invalid. Fix JSON syntax (quotes, commas, brackets).';
    case 'DUPLICATE_BLOCK':
      return 'A metadata fenced block appears more than once. Keep only one block for that type.';
    case 'DOATTRS_WITHOUT_DO':
      return 'A line or metadata entry sets data object attributes without a matching data object id.';
    case 'MISSING_TAG_STORE':
      return 'Tags are referenced but the `tag-store` block is missing.';
    default:
      return `${issue.code.replace(/_/g, ' ').toLowerCase()}: ${message}`;
  }
}

function formatValidationIssuesHuman(issues: ImportValidationIssue[], maxItems = MAX_ERROR_SUMMARY_ITEMS): string {
  if (!issues.length) return 'No validator errors were captured.';
  const limited = issues.slice(0, maxItems);
  const lines = limited.map((issue, idx) => `${idx + 1}. ${humanizeValidationIssue(issue)}`);
  if (issues.length > limited.length) lines.push(`...and ${issues.length - limited.length} more issue(s).`);
  return lines.join('\n');
}

function formatValidationIssuesTechnical(issues: ImportValidationIssue[], maxItems = MAX_ERROR_SUMMARY_ITEMS): string {
  if (!issues.length) return '';
  const limited = issues.slice(0, maxItems);
  const lines = limited.map((issue, idx) => `${idx + 1}. ${issue.code}: ${normalizeText(issue.message)}`);
  if (issues.length > limited.length) lines.push(`...and ${issues.length - limited.length} more issue(s).`);
  return lines.join('\n');
}

function fixInstructionForValidationIssue(issue: ImportValidationIssue): string {
  switch (issue.code) {
    case 'UNCLOSED_CODE_BLOCK':
      return 'Do not output any triple-backtick fence lines in subtreeReplacementMarkdown. Keep only plain node lines and ensure any opened fence is closed.';
    case 'PARSE_FAILED':
      return 'Keep valid hierarchical diagram lines with consistent indentation (2 spaces per level). Avoid malformed node syntax.';
    case 'NO_NODES':
      return 'Ensure subtreeReplacementMarkdown contains at least one valid non-empty node line.';
    case 'INVALID_JSON':
      return 'Output strict JSON only: use double quotes, no comments, and no trailing commas.';
    case 'DUPLICATE_BLOCK':
      return 'Do not create duplicate fenced metadata blocks. Keep only one block per metadata type.';
    case 'DOATTRS_WITHOUT_DO':
      return 'If a line has doattrs metadata, ensure it also has a matching do metadata on the same line or remove doattrs.';
    case 'MISSING_TAG_STORE':
      return 'Do not introduce tag references unless a tag-store block exists and contains those tag ids.';
    case 'FLOW_NODE_BAD_LINE':
    case 'DIM_DESC_BAD_LINE':
    case 'HUB_NOTE_BAD_LINE':
      return 'Line-index metadata must reference valid existing node lines. Update references to current line positions.';
    default:
      return 'Resolve this issue exactly while keeping edits limited to the selected target scope and required metadata operations only.';
  }
}

function normalizeReplacementLines(subtreeMarkdown: string, baseIndent: number): string[] {
  const lines = normalizeNewlines(subtreeMarkdown).split('\n');
  while (lines.length > 0 && !lines[0]?.trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) lines.pop();

  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const minIndent = nonEmpty.length
    ? nonEmpty.reduce((acc, l) => Math.min(acc, getIndent(l)), Number.POSITIVE_INFINITY)
    : 0;

  return lines.map((line) => {
    if (!line.trim()) return '';
    const strip = Math.max(0, Math.min(getIndent(line), Number.isFinite(minIndent) ? minIndent : 0));
    const dedented = line.slice(strip);
    return `${' '.repeat(Math.max(0, baseIndent))}${dedented}`;
  });
}

function replaceSubtreeAtLine(input: {
  markdown: string;
  lineIndex: number;
  subtreeReplacementMarkdown: string;
}): { nextMarkdown: string; originalSubtreeMarkdown: string; nextSubtreeRange: { start: number; end: number } } {
  const lines = normalizeNewlines(input.markdown).split('\n');
  const range = findSubtreeRange(lines, input.lineIndex);
  if (!range) throw new Error('Selected subtree anchor is no longer valid.');

  const replacement = normalizeReplacementLines(input.subtreeReplacementMarkdown, range.baseIndent);
  if (!replacement.length || !replacement.some((l) => l.trim())) {
    throw new Error('Proposal returned an empty subtree replacement.');
  }

  const original = lines.slice(range.start, range.end + 1).join('\n').trimEnd();
  const nextLines = lines.slice(0, range.start).concat(replacement, lines.slice(range.end + 1));
  return {
    nextMarkdown: nextLines.join('\n'),
    originalSubtreeMarkdown: original,
    nextSubtreeRange: {
      start: range.start,
      end: Math.max(range.start, range.start + replacement.length - 1),
    },
  };
}

type MarkdownFixTarget = {
  id: string;
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive; insertion when startLine === endLine + 1
  reason: string;
  issueCodes: string[];
  contextMarkdown: string;
  originalMarkdown: string;
};

function issueKeyFromIssue(issue: ImportValidationIssue): string {
  return `${normalizeText(issue.code)}|${normalizeText(issue.message)}`;
}

function selectMarkdownFixIssues(input: {
  baselineErrors: ImportValidationIssue[];
  selection: DiagramAssistMarkdownErrorsFixSelection;
}): ImportValidationIssue[] {
  const baseline = input.baselineErrors.slice(0, MAX_MARKDOWN_FIX_ISSUES);
  const selectedKeys = new Set((input.selection.issueKeys || []).map((x) => normalizeText(x)).filter(Boolean));
  if (!selectedKeys.size) return baseline;
  const matched = baseline.filter((issue) => selectedKeys.has(issueKeyFromIssue(issue)));
  return (matched.length ? matched : baseline).slice(0, MAX_MARKDOWN_FIX_ISSUES);
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
  const contextStart = Math.max(1, (startLine === endLine + 1 ? startLine : startLine - 2));
  const contextEnd = Math.min(lines.length, Math.max(endLine, startLine) + 2);
  return lines.slice(contextStart - 1, contextEnd).join('\n').slice(0, 6000);
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

function buildMarkdownFixTargets(markdown: string, issues: ImportValidationIssue[]): MarkdownFixTarget[] {
  const lines = normalizeNewlines(markdown).split('\n');
  const separatorIndex = findSeparatorIndexOutsideFences(lines);
  const nodeSectionEnd = separatorIndex === -1 ? lines.length : separatorIndex;
  const metadataInsertStartLine = separatorIndex === -1 ? lines.length + 1 : separatorIndex + 2;
  const metadataInsertEndLine = metadataInsertStartLine - 1;
  const fenceRanges = scanFenceRanges(lines);

  const byRangeKey = new Map<
    string,
    {
      startLine: number;
      endLine: number;
      reason: string;
      issueCodes: Set<string>;
    }
  >();

  const addTarget = (range: { startLine: number; endLine: number }, issue: ImportValidationIssue) => {
    const clamped = clampLineRange(range, lines.length);
    const key = `${clamped.startLine}:${clamped.endLine}`;
    const existing = byRangeKey.get(key);
    if (existing) {
      existing.issueCodes.add(issue.code);
      if (existing.reason.length < 180) existing.reason = `${existing.reason}; ${targetReasonForIssue(issue)}`.slice(0, 240);
      return;
    }
    byRangeKey.set(key, {
      ...clamped,
      reason: targetReasonForIssue(issue),
      issueCodes: new Set([issue.code]),
    });
  };

  for (const issue of issues.slice(0, MAX_MARKDOWN_FIX_TARGETS)) {
    const line = extractIssueLineNumber(issue.message || '');
    if (!line) {
      addTarget(
        {
          startLine: metadataInsertStartLine,
          endLine: metadataInsertEndLine,
        },
        issue,
      );
      continue;
    }

    const lineIndex = Math.max(0, line - 1);
    if (issue.code === 'UNCLOSED_CODE_BLOCK') {
      const endLine = Math.min(lines.length, line + 120);
      addTarget({ startLine: line, endLine }, issue);
      continue;
    }

    if (lineIndex < nodeSectionEnd) {
      const subtree = findSubtreeRange(lines, lineIndex);
      if (subtree) {
        addTarget({ startLine: subtree.start + 1, endLine: subtree.end + 1 }, issue);
        continue;
      }
      addTarget({ startLine: Math.max(1, line - 2), endLine: Math.min(lines.length, line + 2) }, issue);
      continue;
    }

    const fenceRange = findFenceRangeContainingLine(fenceRanges, lineIndex);
    if (fenceRange) {
      addTarget({ startLine: fenceRange.start + 1, endLine: fenceRange.end + 1 }, issue);
      continue;
    }
    addTarget({ startLine: Math.max(1, line - 2), endLine: Math.min(lines.length, line + 2) }, issue);
  }

  const targets = Array.from(byRangeKey.entries())
    .map(([, v], idx) => {
      const id = `target-${idx + 1}`;
      return {
        id,
        startLine: v.startLine,
        endLine: v.endLine,
        reason: v.reason.slice(0, 280),
        issueCodes: Array.from(v.issueCodes).slice(0, 8),
        contextMarkdown: extractContextMarkdownForRange(lines, v.startLine, v.endLine),
        originalMarkdown: extractOriginalMarkdownForRange(lines, v.startLine, v.endLine),
      } satisfies MarkdownFixTarget;
    })
    .slice(0, MAX_MARKDOWN_FIX_TARGETS);

  return targets;
}

type NormalizedLineRangePatch = {
  targetId: string;
  startLine: number;
  endLine: number;
  replacementLines: string[];
};

function normalizeLineRangePatchForApply(
  patch: DiagramAssistMarkdownSectionPatch,
  totalLines: number,
): NormalizedLineRangePatch {
  const targetId = normalizeText(patch.targetId);
  const startLine = Math.max(1, Math.floor(Number(patch.startLine || 0)));
  const endLine = Math.max(0, Math.floor(Number(patch.endLine || 0)));
  if (!targetId) throw new Error('Patch target id is missing.');
  if (startLine > totalLines + 1) throw new Error(`Patch "${targetId}" start line is out of bounds.`);
  if (endLine > totalLines) throw new Error(`Patch "${targetId}" end line is out of bounds.`);
  if (!(startLine <= endLine || startLine === endLine + 1)) {
    throw new Error(`Patch "${targetId}" has invalid line range.`);
  }

  return {
    targetId,
    startLine,
    endLine,
    replacementLines: (() => {
      const raw = normalizeNewlines(patch.replacementMarkdown || '');
      return raw.length ? raw.split('\n') : [];
    })(),
  };
}

function assertNoOverlappingNormalizedPatches(patches: NormalizedLineRangePatch[]) {
  if (patches.length <= 1) return;
  const sorted = [...patches].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevInsert = prev.startLine === prev.endLine + 1;
    const curInsert = cur.startLine === cur.endLine + 1;
    if (prevInsert || curInsert) {
      if (prev.startLine === cur.startLine) {
        throw new Error(`Patches "${prev.targetId}" and "${cur.targetId}" overlap at insertion line ${cur.startLine}.`);
      }
      continue;
    }
    if (cur.startLine <= prev.endLine) {
      throw new Error(`Patches "${prev.targetId}" and "${cur.targetId}" overlap.`);
    }
  }
}

function applyLineRangePatchesToMarkdown(markdown: string, patches: DiagramAssistMarkdownSectionPatch[]): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const normalized = patches.map((patch) => normalizeLineRangePatchForApply(patch, lines.length));
  assertNoOverlappingNormalizedPatches(normalized);

  const sortedDesc = [...normalized].sort((a, b) => b.startLine - a.startLine || b.endLine - a.endLine);
  const next = [...lines];
  sortedDesc.forEach((patch) => {
    const startIdx = patch.startLine - 1;
    const endIdx = patch.endLine - 1;
    if (patch.startLine === patch.endLine + 1) {
      next.splice(startIdx, 0, ...patch.replacementLines);
      return;
    }
    next.splice(startIdx, endIdx - startIdx + 1, ...patch.replacementLines);
  });
  return next.join('\n');
}

function extractJsonObject(text: string): Record<string, unknown> {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Empty model response');

  const tryParse = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct) return direct;

  const fenced = raw.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1]);
    if (parsed) return parsed;
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = raw.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(sliced);
    if (parsed) return parsed;
  }

  throw new Error('Model did not return valid JSON');
}

function clampArray(input: unknown, opts: { maxItems: number; maxChars?: number }): string[] {
  if (!Array.isArray(input)) return [];
  const maxChars = Number.isFinite(opts.maxChars) ? Number(opts.maxChars) : 1000;
  return (input as unknown[])
    .map((x) => normalizeText(x).slice(0, maxChars))
    .filter(Boolean)
    .slice(0, opts.maxItems);
}

function safeNumber(input: unknown, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function cleanFlowLabel(input: string): string {
  const noHeading = normalizeText(input).replace(/^#{1,6}\s+/, '');
  const noBullet = noHeading.replace(/^[-*+]\s+/, '').replace(/^\d+[\.\)]\s+/, '');
  return normalizeText(noBullet.replace(/\s+#flow#\s*$/i, ''));
}

function lineIndent(line: string): number {
  const m = String(line || '').match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function toFlowLine(label: string, indent: number): string {
  const cleaned = cleanFlowLabel(label);
  if (!cleaned) return '';
  const safeIndent = Math.max(0, Math.min(30, Math.floor(indent / 2) * 2));
  return `${' '.repeat(safeIndent)}${cleaned} #flow#`;
}

function flowRootLabelForTarget(selection: DiagramAssistStatusDescriptionsSelection): string {
  if (selection.target.kind === 'data_object_status') {
    return `${selection.target.doName} – ${selection.target.attrName} Lifecycle`;
  }
  return `${selection.target.hubLabel} – ${selection.target.dimensionKey} Lifecycle`;
}

function normalizeFlowLinesFromProvided(raw: string[]): Array<{ indent: number; label: string }> {
  const out: Array<{ indent: number; label: string }> = [];
  raw.forEach((entry) => {
    normalizeNewlines(entry)
      .split('\n')
      .forEach((line) => {
        if (!normalizeText(line)) return;
        const indent = lineIndent(line);
        const label = cleanFlowLabel(String(line || '').trimStart());
        if (!label) return;
        out.push({ indent, label });
      });
  });
  return out;
}

function hasDeepHierarchy(lines: Array<{ indent: number; label: string }>): boolean {
  if (!lines.length) return false;
  const maxIndent = lines.reduce((acc, x) => Math.max(acc, x.indent), 0);
  return maxIndent >= 4;
}

function buildStatusFlowLines(input: {
  selection: DiagramAssistStatusDescriptionsSelection;
  providedRawLines: string[];
  states: string[];
  transitions: Array<{ from: string; to: string; guard?: string }>;
}): string[] {
  const rootLine = toFlowLine(flowRootLabelForTarget(input.selection), 0) || 'Status Lifecycle #flow#';
  const provided = normalizeFlowLinesFromProvided(input.providedRawLines);

  if (provided.length && hasDeepHierarchy(provided)) {
    const out: string[] = [];
    provided.slice(0, MAX_FLOW_LINES).forEach((p) => {
      const line = toFlowLine(p.label, p.indent);
      if (!line) return;
      out.push(line);
    });
    return out.length ? out : [rootLine];
  }

  // Convert flat/numbered advice into explicit parent->child->grandchild chain.
  if (provided.length) {
    const out: string[] = [rootLine];
    let depth = 1;
    const rootLabelKey = cleanFlowLabel(flowRootLabelForTarget(input.selection)).toLowerCase();
    provided.forEach((p) => {
      const key = p.label.toLowerCase();
      if (!key || key === rootLabelKey) return;
      const line = toFlowLine(p.label, depth * 2);
      if (!line) return;
      out.push(line);
      depth = Math.min(12, depth + 1);
    });
    if (out.length > 1) return out.slice(0, MAX_FLOW_LINES);
  }

  const transitions = input.transitions.slice(0, MAX_TRANSITIONS);
  const states = (input.states || []).map((s) => normalizeText(s)).filter(Boolean);
  const out: string[] = [rootLine];
  const pushLine = (label: string, indent: number) => {
    if (out.length >= MAX_FLOW_LINES) return;
    const line = toFlowLine(label, indent);
    if (!line) return;
    out.push(line);
  };

  if (!transitions.length) {
    const fallbackStates = states.length ? states : ['Start', 'In Progress', 'Done'];
    let depth = 1;
    fallbackStates.forEach((s) => {
      pushLine(s, depth * 2);
      depth = Math.min(12, depth + 1);
    });
    return out.slice(0, MAX_FLOW_LINES);
  }

  const outgoing = new Map<string, Array<{ to: string; guard?: string }>>();
  const toSet = new Set<string>();
  transitions.forEach((t) => {
    const from = normalizeText(t.from);
    const to = normalizeText(t.to);
    if (!from || !to) return;
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from)!.push({ to, guard: normalizeText(t.guard) || undefined });
    toSet.add(to);
  });

  const startCandidates = Array.from(outgoing.keys()).filter((k) => !toSet.has(k));
  const fallbackStart = normalizeText(transitions[0]?.from || '') || states[0] || 'Start';
  const startStates = startCandidates.length ? startCandidates : [fallbackStart];

  const visitedEdges = new Set<string>();
  const walk = (state: string, indent: number, depth: number, path: Set<string>) => {
    if (depth > 8 || out.length >= MAX_FLOW_LINES) return;
    const outs = outgoing.get(state) || [];
    outs.slice(0, 10).forEach((edge) => {
      if (out.length >= MAX_FLOW_LINES) return;
      const key = `${state}=>${edge.to}::${edge.guard || ''}`;
      if (visitedEdges.has(key)) return;
      visitedEdges.add(key);
      const label = edge.guard ? `${edge.guard}: ${edge.to}` : edge.to;
      pushLine(label, indent);
      if (!path.has(edge.to)) {
        const nextPath = new Set(path);
        nextPath.add(edge.to);
        walk(edge.to, Math.min(28, indent + 2), depth + 1, nextPath);
      }
    });
  };

  startStates.slice(0, 5).forEach((start) => {
    pushLine(start, 2);
    walk(start, 4, 0, new Set([start]));
  });

  return out.slice(0, MAX_FLOW_LINES);
}

function parseDataObjectsFromMarkdown(markdown: string): Array<{ id: string; name: string; attributes: Array<{ name: string; type: 'text' | 'status' }> }> {
  const m = normalizeNewlines(markdown).match(/```data-objects\n([\s\S]*?)\n```/);
  if (!m?.[1]) return [];
  try {
    const parsed = JSON.parse(m[1]);
    const rawObjects = Array.isArray(parsed?.objects) ? (parsed.objects as unknown[]) : [];
    return rawObjects
      .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : null))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map((o) => {
        const id = normalizeText(o.id).slice(0, 120);
        const name = normalizeText(o.name).slice(0, 200);
        const attrsRaw = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>).attributes : null;
        const attributes = Array.isArray(attrsRaw)
          ? (attrsRaw as unknown[])
              .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : null))
              .filter((x): x is Record<string, unknown> => x !== null)
              .map((a) => {
                const type: 'status' | 'text' = a.type === 'status' ? 'status' : 'text';
                return {
                  name: normalizeText(a.name).slice(0, 120),
                  type,
                };
              })
              .filter((a) => Boolean(a.name))
          : [];
        return { id, name: name || id, attributes };
      })
      .filter((o) => Boolean(o.id));
  } catch {
    return [];
  }
}

function buildNodeStructurePrompt(input: {
  selection: DiagramAssistNodeStructureSelection;
  markdown: string;
  dataObjects: Array<{ id: string; name: string; attributes: Array<{ name: string; type: 'text' | 'status' }> }>;
  kbContext: string;
}): { system: string; user: string } {
  const lines = normalizeNewlines(input.markdown).split('\n').slice(0, 220);
  const fileHead = lines.join('\n').slice(0, 7000);
  const objectsSummary = input.dataObjects
    .slice(0, 20)
    .map((o) => `- ${o.id} (${o.name}) attrs: ${o.attributes.slice(0, 8).map((a) => `${a.name}:${a.type}`).join(', ')}`)
    .join('\n');

  const system = [
    'You are a diagram structure analyst.',
    'Return strictly valid JSON only (no markdown).',
    'For subtreeReplacementMarkdown: output plain diagram subtree lines only; never include fenced code blocks or triple backticks.',
    'Primary goals:',
    '1) Evaluate whether selected subtree should be process flow, conditional hub, branch split, or grouped single-screen process segment.',
    '   Treat same-screen grouping as REQUIRED boundary analysis: if adjacent next/previous steps stay within one UI screen context, recommend "single_screen_steps" plus a matching lastPath.',
    '2) Keep edits partial-scope: ONLY selected subtree and necessary process metadata operations.',
    '3) State-machine / flow coherence first; avoid broad file rewrites.',
    'JSON contract:',
    '{',
    '  "diagnosis": "string",',
    '  "recommendations": ["string"],',
    '  "subtreeReplacementMarkdown": "string",',
    '  "metadataOps": {',
    '    "processNodeTypes": [{"nodePath": ["Root","Child"], "type": "step|time|loop|action|validation|branch|end|goto|single_screen_steps", "reason": "string"}],',
    '    "singleScreenLastSteps": [{"startPath": ["..."], "lastPath": ["..."], "reason": "string"}],',
    '    "connectorLabels": [{"fromPath": ["..."], "toPath": ["..."], "label": "string", "color": "#000000"}]',
    '  },',
    '  "validationNotes": ["string"]',
    '}',
  ].join('\n');

  const user = [
    `Selected node id: ${input.selection.nodeId}`,
    `Selected line index: ${input.selection.lineIndex}`,
    `Parent path fingerprint: ${input.selection.parentPathFingerprint.join(' > ') || '(root)'}`,
    `Selected node content: ${input.selection.selectedNodeContent || '(unknown)'}`,
    '',
    'Selected subtree markdown:',
    input.selection.subtreeMarkdown.slice(0, MAX_INPUT_SUBTREE_CHARS),
    '',
    'File head snapshot (partial):',
    fileHead,
    '',
    'Data object summary:',
    objectsSummary || '(none)',
    '',
    'Project RAG context:',
    input.kbContext || '(none)',
    '',
    'Use the project context and web best practices. Prioritize precise, minimal subtree revision.',
  ].join('\n');

  return { system, user };
}

function buildDataObjectAttributesPrompt(input: {
  selection: DiagramAssistDataObjectAttributesSelection;
  markdown: string;
  dataObjects: Array<{ id: string; name: string; attributes: Array<{ name: string; type: 'text' | 'status' }> }>;
  kbContext: string;
}): { system: string; user: string } {
  const fileHead = normalizeNewlines(input.markdown).split('\n').slice(0, 240).join('\n').slice(0, 7000);
  const objectsSummary = input.dataObjects
    .slice(0, 30)
    .map((o) => `- ${o.id} (${o.name}) attrs: ${o.attributes.slice(0, 10).map((a) => `${a.name}:${a.type}`).join(', ')}`)
    .join('\n');
  const existingSummary = (input.selection.existingAttributes || [])
    .map((a) => `- ${a.name} (${a.type})${a.sample ? ` sample=${a.sample}` : ''}`)
    .join('\n');

  const system = [
    'You are a data-object modeling assistant.',
    'Return strictly valid JSON only.',
    'Emphasize ownership-aware attributes: attribute may belong to another data object.',
    'Never assume ownership equals selected object.',
    'Use project context and web research heuristics for typical scenarios.',
    'JSON contract:',
    '{',
    '  "summary": "string",',
    '  "attributes": [',
    '    {',
    '      "name": "string",',
    '      "type": "text|status",',
    '      "sample": "string",',
    '      "statusValues": ["string"],',
    '      "ownerObjectId": "string",',
    '      "ownerObjectName": "string",',
    '      "ownerConfidence": 0.0,',
    '      "ownerReason": "string",',
    '      "evidenceSnippets": ["string"]',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const user = [
    `Target object: ${input.selection.targetObjectId} (${input.selection.targetObjectName})`,
    `Trigger source: ${input.selection.triggerSource}`,
    `Linked objects: ${(input.selection.linkedObjectIds || []).join(', ') || '(none)'}`,
    '',
    'Current attributes:',
    existingSummary || '(none)',
    '',
    'Project objects snapshot:',
    objectsSummary || '(none)',
    '',
    'File head snapshot (partial):',
    fileHead,
    '',
    'Project RAG context:',
    input.kbContext || '(none)',
    '',
    'Generate practical attributes and include ownership suggestions with confidence and reasoning.',
  ].join('\n');

  return { system, user };
}

function buildStatusPrompt(input: {
  selection: DiagramAssistStatusDescriptionsSelection;
  markdown: string;
  kbContext: string;
}): { system: string; user: string } {
  const fileHead = normalizeNewlines(input.markdown).split('\n').slice(0, 220).join('\n').slice(0, 7000);

  const targetSummary = (() => {
    if (input.selection.target.kind === 'data_object_status') {
      const t = input.selection.target;
      return [
        `Target kind: data_object_status`,
        `Data object: ${t.doId} (${t.doName})`,
        `Attribute: ${t.attrId} (${t.attrName})`,
        `Status values: ${(t.statusValues || []).join(', ') || '(none)'}`,
      ].join('\n');
    }
    const t = input.selection.target;
    return [
      `Target kind: condition_dimension_status`,
      `Hub node: ${t.nodeId} (${t.hubLabel})`,
      `Dimension key: ${t.dimensionKey}`,
      `Status values: ${(t.statusValues || []).join(', ') || '(none)'}`,
    ].join('\n');
  })();

  const system = [
    'You are a state-machine and access-policy modeling assistant.',
    'Return strictly valid JSON only.',
    'Always generate BOTH: flow-oriented state machine and role/field-access table.',
    'Focus on realistic transitions, guards, and permissions by role.',
    'flowMarkdownLines MUST be Diregram process-flow tree lines: 2-space indentation, parent/child nesting, and #flow# on every non-empty line.',
    'Do NOT output numbered or bullet lists (no "1.", "-", "*"). Represent lifecycle as children-of-children flow hierarchy.',
    'JSON contract:',
    '{',
    '  "summary": "string",',
    '  "stateMachine": {',
    '    "states": ["string"],',
    '    "transitions": [{"from":"string","to":"string","guard":"string","actor":"string","notes":"string"}]',
    '  },',
    '  "flowMarkdownLines": ["string"],',
    '  "table": {',
    '    "columns": ["Role","Status","Actions","Field access"],',
    '    "rows": [{"role":"string","status":"string","actions":"string","fieldAccess":"string"}]',
    '  }',
    '}',
  ].join('\n');

  const user = [
    targetSummary,
    '',
    'File head snapshot (partial):',
    fileHead,
    '',
    'Project RAG context:',
    input.kbContext || '(none)',
  ].join('\n');

  return { system, user };
}

function buildMarkdownErrorsFixPrompt(input: {
  selection: DiagramAssistMarkdownErrorsFixSelection;
  markdown: string;
  issues: ImportValidationIssue[];
  targets: MarkdownFixTarget[];
  kbContext: string;
}): { system: string; user: string } {
  const issueLines = input.issues
    .slice(0, MAX_MARKDOWN_FIX_ISSUES)
    .map((issue, idx) => `${idx + 1}. ${issue.code}: ${normalizeText(issue.message)}`)
    .join('\n');
  const targetLines = input.targets
    .slice(0, MAX_MARKDOWN_FIX_TARGETS)
    .map((target) => {
      const rangeLabel =
        target.startLine === target.endLine + 1
          ? `insert at ${target.startLine}`
          : `replace ${target.startLine}-${target.endLine}`;
      return [
        `Target ${target.id} (${rangeLabel})`,
        `Reason: ${target.reason}`,
        `Issue codes: ${target.issueCodes.join(', ') || '(none)'}`,
        'Section context:',
        target.contextMarkdown || '(empty)',
      ].join('\n');
    })
    .join('\n\n---\n\n');
  const fileHead = normalizeNewlines(input.markdown).split('\n').slice(0, 220).join('\n').slice(0, 7000);
  const requestedMaxPatches = Math.min(
    MAX_MARKDOWN_FIX_PATCHES,
    Math.max(1, Math.floor(Number(input.selection.maxPatches || DEFAULT_MARKDOWN_FIX_PATCHES))),
  );
  const requiredPatchBudget = Math.min(
    MAX_MARKDOWN_FIX_PATCHES,
    Math.max(input.targets.length, input.issues.length),
  );
  const maxPatches = Math.max(requestedMaxPatches, requiredPatchBudget);

  const system = [
    'You are a Diregram markdown repair assistant.',
    'Return strictly valid JSON only (no markdown fences).',
    'Do NOT rewrite the whole file.',
    'Only edit listed target ids.',
    `Use at most ${maxPatches} patches.`,
    'JSON contract:',
    '{',
    '  "summary": "string",',
    '  "patches": [',
    '    {',
    '      "targetId": "target-1",',
    '      "replacementMarkdown": "string",',
    '      "reason": "string",',
    '      "issueCodes": ["CODE"]',
    '    }',
    '  ],',
    '  "validationNotes": ["string"]',
    '}',
  ].join('\n');

  const user = [
    `Current validator errors to resolve: ${input.issues.length}`,
    'Errors:',
    issueLines || '(none)',
    '',
    'Allowed editable targets:',
    targetLines || '(none)',
    '',
    'File head snapshot (partial):',
    fileHead,
    '',
    'Project RAG context:',
    input.kbContext || '(none)',
    '',
    'Important constraints:',
    '- Patch only the provided target ids.',
    '- Keep unrelated lines unchanged.',
    '- Preserve valid metadata and diagram syntax.',
  ].join('\n');

  return { system, user };
}

function sanitizeMarkdownFixPatchesFromParsed(input: {
  parsed: Record<string, unknown>;
  targets: MarkdownFixTarget[];
  maxPatches: number;
}): DiagramAssistMarkdownSectionPatch[] {
  const targetById = new Map<string, MarkdownFixTarget>();
  input.targets.forEach((t) => targetById.set(t.id, t));
  const patchesRaw = Array.isArray(input.parsed.patches) ? (input.parsed.patches as unknown[]) : [];
  const usedTargetIds = new Set<string>();
  const patches: DiagramAssistMarkdownSectionPatch[] = [];

  for (const raw of patchesRaw) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const targetId = normalizeText(obj.targetId);
    if (!targetId || usedTargetIds.has(targetId)) continue;
    const target = targetById.get(targetId);
    if (!target) continue;

    const replacementMarkdown = normalizeNewlines(obj.replacementMarkdown || '').slice(0, MAX_MARKDOWN_FIX_REPLACEMENT_CHARS);
    const reason = normalizeText(obj.reason).slice(0, 280) || undefined;
    const issueCodes = clampArray(obj.issueCodes, { maxItems: 8, maxChars: 80 });

    patches.push({
      targetId,
      startLine: target.startLine,
      endLine: target.endLine,
      replacementMarkdown,
      originalMarkdown: target.originalMarkdown,
      ...(reason ? { reason } : {}),
      ...(issueCodes.length ? { issueCodes } : {}),
    });
    usedTargetIds.add(targetId);
    if (patches.length >= input.maxPatches) break;
  }

  return patches;
}

function sanitizeNodeStructureProposal(input: {
  selection: DiagramAssistNodeStructureSelection;
  parsed: Record<string, unknown>;
  baseFileHash: string;
  originalSubtreeMarkdown: string;
}): DiagramAssistNodeStructureProposal {
  const recommendations = clampArray(input.parsed.recommendations, { maxItems: MAX_RECOMMENDATIONS, maxChars: 240 });
  const subtreeReplacementMarkdown =
    normalizeNewlines(input.parsed.subtreeReplacementMarkdown || '').slice(0, MAX_INPUT_SUBTREE_CHARS) ||
    input.selection.subtreeMarkdown;

  const metadataOpsRaw =
    input.parsed.metadataOps && typeof input.parsed.metadataOps === 'object'
      ? (input.parsed.metadataOps as Record<string, unknown>)
      : {};

  const processNodeTypes: DiagramAssistNodeTypeOp[] = [];
  if (Array.isArray(metadataOpsRaw.processNodeTypes)) {
    for (const raw of metadataOpsRaw.processNodeTypes as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      const nodePath = clampArray(obj.nodePath, { maxItems: 20, maxChars: 160 });
      const type = coerceFlowNodeType(obj.type);
      if (!nodePath.length || !type) continue;
      const reason = normalizeText(obj.reason).slice(0, 240) || undefined;
      processNodeTypes.push({
        nodePath,
        type,
        ...(reason ? { reason } : {}),
      });
      if (processNodeTypes.length >= 120) break;
    }
  }

  const singleScreenLastSteps: DiagramAssistSingleScreenOp[] = [];
  if (Array.isArray(metadataOpsRaw.singleScreenLastSteps)) {
    for (const raw of metadataOpsRaw.singleScreenLastSteps as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      const startPath = clampArray(obj.startPath, { maxItems: 20, maxChars: 160 });
      const lastPath = clampArray(obj.lastPath, { maxItems: 20, maxChars: 160 });
      if (!startPath.length || !lastPath.length) continue;
      const reason = normalizeText(obj.reason).slice(0, 240) || undefined;
      singleScreenLastSteps.push({
        startPath,
        lastPath,
        ...(reason ? { reason } : {}),
      });
      if (singleScreenLastSteps.length >= 100) break;
    }
  }

  const connectorLabels: DiagramAssistConnectorLabelOp[] = [];
  if (Array.isArray(metadataOpsRaw.connectorLabels)) {
    for (const raw of metadataOpsRaw.connectorLabels as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      const fromPath = clampArray(obj.fromPath, { maxItems: 20, maxChars: 160 });
      const toPath = clampArray(obj.toPath, { maxItems: 20, maxChars: 160 });
      const label = normalizeText(obj.label).slice(0, 120);
      if (!fromPath.length || !toPath.length || !label) continue;
      const color = normalizeText(obj.color).slice(0, 20) || undefined;
      connectorLabels.push({
        fromPath,
        toPath,
        label,
        ...(color ? { color } : {}),
      });
      if (connectorLabels.length >= 150) break;
    }
  }

  return {
    action: 'node_structure',
    baseFileHash: input.baseFileHash,
    diagnosis: normalizeText(input.parsed.diagnosis).slice(0, 5000) || 'No diagnosis was returned.',
    recommendations,
    subtreeReplacementMarkdown,
    metadataOps:
      processNodeTypes.length || singleScreenLastSteps.length || connectorLabels.length
        ? {
            ...(processNodeTypes.length ? { processNodeTypes } : {}),
            ...(singleScreenLastSteps.length ? { singleScreenLastSteps } : {}),
            ...(connectorLabels.length ? { connectorLabels } : {}),
          }
        : undefined,
    validationReport: {
      errors: [],
      warnings: clampArray(input.parsed.validationNotes, { maxItems: 30, maxChars: 260 }),
    },
    preview: {
      lineIndex: input.selection.lineIndex,
      originalSubtreeMarkdown: input.originalSubtreeMarkdown,
      proposedSubtreeMarkdown: subtreeReplacementMarkdown,
    },
  };
}

function sanitizeAttributeSuggestion(raw: Record<string, unknown>): DiagramAssistAttributeSuggestion | null {
  const name = normalizeText(raw.name).slice(0, 120);
  if (!name) return null;
  const type = normalizeText(raw.type) === 'status' ? 'status' : 'text';
  return {
    name,
    type,
    sample: normalizeText(raw.sample).slice(0, 300) || undefined,
    statusValues: clampArray(raw.statusValues, { maxItems: MAX_STATUS_VALUES, maxChars: 80 }),
    ownerObjectId: normalizeText(raw.ownerObjectId).slice(0, 120) || undefined,
    ownerObjectName: normalizeText(raw.ownerObjectName).slice(0, 180) || undefined,
    ownerConfidence: Math.max(0, Math.min(1, safeNumber(raw.ownerConfidence, 0))),
    ownerReason: normalizeText(raw.ownerReason).slice(0, 500) || undefined,
    evidenceSnippets: clampArray(raw.evidenceSnippets, { maxItems: 8, maxChars: 220 }),
  };
}

function sanitizeDataObjectAttributesProposal(input: {
  parsed: Record<string, unknown>;
  selection: DiagramAssistDataObjectAttributesSelection;
  baseFileHash: string;
}): DiagramAssistDataObjectAttributesProposal {
  const attrsRaw = Array.isArray(input.parsed.attributes) ? (input.parsed.attributes as unknown[]) : [];
  const attributes = attrsRaw
    .map((x) => (x && typeof x === 'object' ? sanitizeAttributeSuggestion(x as Record<string, unknown>) : null))
    .filter((x): x is DiagramAssistAttributeSuggestion => x !== null)
    .slice(0, MAX_ATTRIBUTES);

  return {
    action: 'data_object_attributes',
    baseFileHash: input.baseFileHash,
    targetObjectId: input.selection.targetObjectId,
    targetObjectName: input.selection.targetObjectName,
    summary: normalizeText(input.parsed.summary).slice(0, 5000) || 'No summary was returned.',
    attributes,
  };
}

function sanitizeStatusDescriptionsProposal(input: {
  parsed: Record<string, unknown>;
  selection: DiagramAssistStatusDescriptionsSelection;
  baseFileHash: string;
}): DiagramAssistStatusDescriptionsProposal {
  const smRaw = input.parsed.stateMachine && typeof input.parsed.stateMachine === 'object'
    ? (input.parsed.stateMachine as Record<string, unknown>)
    : {};

  const states = clampArray(smRaw.states, { maxItems: 80, maxChars: 80 });
  const transitionsRaw = Array.isArray(smRaw.transitions) ? (smRaw.transitions as unknown[]) : [];
  const transitions = transitionsRaw
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x) => ({
      from: normalizeText(x.from).slice(0, 80),
      to: normalizeText(x.to).slice(0, 80),
      guard: normalizeText(x.guard).slice(0, 220) || undefined,
      actor: normalizeText(x.actor).slice(0, 120) || undefined,
      notes: normalizeText(x.notes).slice(0, 260) || undefined,
    }))
    .filter((x) => Boolean(x.from) && Boolean(x.to))
    .slice(0, MAX_TRANSITIONS);

  const flowMarkdownLinesRaw = clampArray(input.parsed.flowMarkdownLines, { maxItems: MAX_FLOW_LINES, maxChars: 400 });
  const flowMarkdownLines = buildStatusFlowLines({
    selection: input.selection,
    providedRawLines: flowMarkdownLinesRaw,
    states: states.length ? states : input.selection.target.statusValues.slice(0, MAX_STATUS_VALUES),
    transitions: transitions.map((t) => ({ from: t.from, to: t.to, guard: t.guard })),
  });

  const tableRaw = input.parsed.table && typeof input.parsed.table === 'object'
    ? (input.parsed.table as Record<string, unknown>)
    : {};
  const columns = clampArray(tableRaw.columns, { maxItems: 10, maxChars: 80 });
  const rowsRaw = Array.isArray(tableRaw.rows) ? (tableRaw.rows as unknown[]) : [];
  const rows = rowsRaw
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x) => ({
      role: normalizeText(x.role).slice(0, 120),
      status: normalizeText(x.status).slice(0, 120),
      actions: normalizeText(x.actions).slice(0, 400),
      fieldAccess: normalizeText(x.fieldAccess).slice(0, 400),
    }))
    .filter((x) => Boolean(x.role) && Boolean(x.status))
    .slice(0, MAX_TABLE_ROWS);

  return {
    action: 'status_descriptions',
    baseFileHash: input.baseFileHash,
    target: input.selection.target,
    summary: normalizeText(input.parsed.summary).slice(0, 5000) || 'No summary was returned.',
    stateMachine: {
      states: states.length ? states : input.selection.target.statusValues.slice(0, MAX_STATUS_VALUES),
      transitions,
    },
    flowMarkdownLines,
    table: {
      columns: columns.length ? columns : ['Role', 'Status', 'Actions', 'Field access'],
      rows,
    },
  };
}

function sanitizeMarkdownErrorsFixProposal(input: {
  parsed: Record<string, unknown>;
  baseFileHash: string;
  issues: ImportValidationIssue[];
  patches: DiagramAssistMarkdownSectionPatch[];
  unresolvedIssues: ImportValidationIssue[];
  newIssues: ImportValidationIssue[];
  validationWarnings: string[];
}): DiagramAssistMarkdownErrorsFixProposal {
  return {
    action: 'markdown_errors_fix',
    baseFileHash: input.baseFileHash,
    summary: normalizeText(input.parsed.summary).slice(0, 5000) || 'Markdown repair proposal generated.',
    issues: input.issues.slice(0, MAX_MARKDOWN_FIX_ISSUES).map((issue) => ({
      code: issue.code,
      message: normalizeText(issue.message).slice(0, 400),
      line: extractIssueLineNumber(issue.message || '') || undefined,
    })),
    patches: input.patches,
    validationReport: {
      errors: input.unresolvedIssues.concat(input.newIssues).slice(0, 80).map((issue) => `${issue.code}: ${issue.message}`),
      warnings: input.validationWarnings.slice(0, 120),
      fixedIssueCount: Math.max(0, input.issues.length - input.unresolvedIssues.length),
      unresolvedIssueCount: input.unresolvedIssues.length,
      newIssueCount: input.newIssues.length,
    },
  };
}

function coerceSelection(action: DiagramAssistAction, raw: unknown): DiagramAssistSelection {
  if (!raw || typeof raw !== 'object') throw new Error('Missing selection payload');
  const selection = raw as DiagramAssistSelection;
  if (!selection.baseFileHash) throw new Error('Missing baseFileHash');

  if (action === 'node_structure') {
    const s = selection as DiagramAssistNodeStructureSelection;
    if (!s.nodeId) throw new Error('Missing node id');
    if (!s.subtreeMarkdown) throw new Error('Missing subtree markdown');
    return {
      ...s,
      subtreeMarkdown: normalizeNewlines(s.subtreeMarkdown).slice(0, MAX_INPUT_SUBTREE_CHARS),
      parentPathFingerprint: (s.parentPathFingerprint || []).slice(0, 40).map((x) => normalizeText(x).slice(0, 240)).filter(Boolean),
      selectedNodeContent: normalizeText(s.selectedNodeContent).slice(0, 500),
    } satisfies DiagramAssistNodeStructureSelection;
  }

  if (action === 'data_object_attributes') {
    const s = selection as DiagramAssistDataObjectAttributesSelection;
    if (!s.targetObjectId) throw new Error('Missing targetObjectId');
    return {
      ...s,
      targetObjectId: normalizeText(s.targetObjectId).slice(0, 120),
      targetObjectName: normalizeText(s.targetObjectName).slice(0, 180),
      linkedObjectIds: (s.linkedObjectIds || []).slice(0, 60).map((x) => normalizeText(x).slice(0, 120)).filter(Boolean),
      linkedObjectNames: (s.linkedObjectNames || []).slice(0, 60).map((x) => normalizeText(x).slice(0, 180)).filter(Boolean),
      existingAttributes: (s.existingAttributes || []).slice(0, 120).map((a) => ({
        name: normalizeText(a.name).slice(0, 120),
        type: a.type === 'status' ? 'status' : 'text',
        sample: normalizeText(a.sample).slice(0, 200) || undefined,
        values: (a.values || []).slice(0, MAX_STATUS_VALUES).map((v) => normalizeText(v).slice(0, 80)).filter(Boolean),
      })),
      nodeContext: s.nodeContext
        ? {
            nodeId: normalizeText(s.nodeContext.nodeId).slice(0, 120) || undefined,
            nodeLabel: normalizeText(s.nodeContext.nodeLabel).slice(0, 240) || undefined,
          }
        : undefined,
    } satisfies DiagramAssistDataObjectAttributesSelection;
  }

  if (action === 'markdown_errors_fix') {
    const s = selection as DiagramAssistMarkdownErrorsFixSelection;
    return {
      ...s,
      issueKeys: (s.issueKeys || []).slice(0, MAX_MARKDOWN_FIX_ISSUES).map((x) => normalizeText(x).slice(0, 500)).filter(Boolean),
      maxPatches: Math.min(
        MAX_MARKDOWN_FIX_PATCHES,
        Math.max(1, Math.floor(Number(s.maxPatches || DEFAULT_MARKDOWN_FIX_PATCHES))),
      ),
    } satisfies DiagramAssistMarkdownErrorsFixSelection;
  }

  const s = selection as DiagramAssistStatusDescriptionsSelection;
  if (s.target.kind === 'data_object_status') {
    if (!s.target.doId || !s.target.attrId) throw new Error('Missing data-object status target');
    return {
      ...s,
      target: {
        ...s.target,
        doId: normalizeText(s.target.doId).slice(0, 120),
        doName: normalizeText(s.target.doName).slice(0, 180),
        attrId: normalizeText(s.target.attrId).slice(0, 120),
        attrName: normalizeText(s.target.attrName).slice(0, 180),
        statusValues: (s.target.statusValues || []).slice(0, MAX_STATUS_VALUES).map((x) => normalizeText(x).slice(0, 80)).filter(Boolean),
      },
    } satisfies DiagramAssistStatusDescriptionsSelection;
  }

  if (!s.target.nodeId || !s.target.dimensionKey) throw new Error('Missing condition-dimension status target');
  return {
    ...s,
    target: {
      ...s.target,
      nodeId: normalizeText(s.target.nodeId).slice(0, 120),
      nodeLineIndex: Math.max(0, Math.floor(Number(s.target.nodeLineIndex || 0))),
      hubLabel: normalizeText(s.target.hubLabel).slice(0, 240),
      dimensionKey: normalizeText(s.target.dimensionKey).slice(0, 160),
      statusValues: (s.target.statusValues || []).slice(0, MAX_STATUS_VALUES).map((x) => normalizeText(x).slice(0, 80)).filter(Boolean),
    },
  } satisfies DiagramAssistStatusDescriptionsSelection;
}

function buildKbQuery(action: DiagramAssistAction, selection: DiagramAssistSelection): string {
  if (action === 'node_structure') {
    const s = selection as DiagramAssistNodeStructureSelection;
    return [
      'Diagram node structure review',
      `Node: ${s.selectedNodeContent || s.nodeId}`,
      `Subtree:\n${s.subtreeMarkdown.slice(0, 2600)}`,
      'Need recommendations for process flow, conditional hub, branching, and single-screen grouping.',
    ].join('\n\n');
  }

  if (action === 'data_object_attributes') {
    const s = selection as DiagramAssistDataObjectAttributesSelection;
    return [
      'Data object attribute research',
      `Target object: ${s.targetObjectId} (${s.targetObjectName})`,
      `Linked objects: ${(s.linkedObjectNames || s.linkedObjectIds || []).join(', ') || '(none)'}`,
      'Need ownership-aware attribute recommendations and cross-object attribution guidance.',
    ].join('\n\n');
  }

  if (action === 'markdown_errors_fix') {
    const s = selection as DiagramAssistMarkdownErrorsFixSelection;
    return [
      'Diagram markdown validator repair',
      `Issue keys selected: ${(s.issueKeys || []).length}`,
      'Need targeted line-range repair patches that fix validation errors without rewriting unrelated content.',
    ].join('\n\n');
  }

  const s = selection as DiagramAssistStatusDescriptionsSelection;
  if (s.target.kind === 'data_object_status') {
    return [
      'Data object status modeling',
      `Object: ${s.target.doName} (${s.target.doId})`,
      `Attribute: ${s.target.attrName} (${s.target.attrId})`,
      `Statuses: ${(s.target.statusValues || []).join(', ') || '(none)'}`,
      'Need state-machine transitions and role/field access table.',
    ].join('\n\n');
  }
  return [
    'Condition dimension status modeling',
    `Hub: ${s.target.hubLabel} (${s.target.nodeId})`,
    `Dimension: ${s.target.dimensionKey}`,
    `Values: ${(s.target.statusValues || []).join(', ') || '(none)'}`,
    'Need state-machine transitions and role/field access table.',
  ].join('\n\n');
}

async function ensureNotCancelled(jobId: string) {
  if (await isAsyncJobCancelRequested(jobId)) {
    throw new Error('Job cancelled');
  }
}

function buildRepairUserPrompt(input: {
  baseUserPrompt: string;
  action: DiagramAssistAction;
  attempt: number;
  failureReason: string;
  validationErrors?: string[];
  validationIssues?: ImportValidationIssue[];
  previousResponse?: string;
}): string {
  const chunks: string[] = [];
  chunks.push(input.baseUserPrompt);
  chunks.push('');
  chunks.push(`Revision attempt: ${input.attempt}`);
  chunks.push(`Previous attempt failed: ${input.failureReason}`);

  if (input.validationErrors && input.validationErrors.length > 0) {
    chunks.push('');
    chunks.push('Validation errors to fix exactly:');
    input.validationErrors.slice(0, MAX_REPAIR_FEEDBACK_ERRORS).forEach((e, idx) => {
      chunks.push(`${idx + 1}. ${e}`);
    });
  }

  if (input.validationIssues && input.validationIssues.length > 0) {
    chunks.push('');
    chunks.push('Required fixes per validation issue (apply all):');
    input.validationIssues.slice(0, MAX_REPAIR_FEEDBACK_ERRORS).forEach((issue, idx) => {
      chunks.push(`${idx + 1}. [${issue.code}] ${normalizeText(issue.message)}`);
      chunks.push(`   Fix: ${fixInstructionForValidationIssue(issue)}`);
    });
  }

  if (input.previousResponse) {
    chunks.push('');
    chunks.push('Previous model response (for correction):');
    chunks.push(input.previousResponse.slice(0, MAX_PREVIOUS_RESPONSE_CHARS));
  }

  chunks.push('');
  chunks.push('Return STRICT JSON only. Do not include markdown fences. Ensure the output is valid and complete.');
  if (input.action === 'node_structure') {
    chunks.push('For node_structure: subtreeReplacementMarkdown must not include any triple backticks or fenced code blocks.');
    chunks.push('For node_structure: output must produce replacement subtree markdown that passes validation with no errors.');
  } else if (input.action === 'markdown_errors_fix') {
    chunks.push('For markdown_errors_fix: patch only the provided target ids. Do not propose full-file rewrites.');
  }

  return chunks.join('\n');
}

export async function runAiDiagramAssistJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  const inputRaw = (job.input || {}) as Record<string, unknown>;
  const action = normalizeText(inputRaw.action) as DiagramAssistAction;
  if (
    action !== 'node_structure' &&
    action !== 'data_object_attributes' &&
    action !== 'status_descriptions' &&
    action !== 'markdown_errors_fix'
  ) {
    throw new Error('Invalid diagram assist action');
  }

  const ownerId = normalizeText(inputRaw.ownerId || job.owner_id);
  const projectFolderId = normalizeText(inputRaw.projectFolderId || job.project_folder_id);
  const fileId = normalizeText(inputRaw.fileId);
  const chatModel = normalizeText(inputRaw.chatModel) || undefined;
  const embeddingModel = normalizeText(inputRaw.embeddingModel) || undefined;
  if (!ownerId) throw new Error('Missing ownerId');
  if (!projectFolderId) throw new Error('Missing projectFolderId');
  if (!fileId) throw new Error('Missing fileId');

  const selection = coerceSelection(action, inputRaw.selection);

  const openaiApiKey = decryptOpenAiApiKey(job.secret_payload) || String(process.env.OPENAI_API_KEY || '').trim();
  if (!openaiApiKey) throw new Error('Missing OpenAI API key');

  await ensureNotCancelled(job.id);
  await updateAsyncJob(job.id, {
    step: 'loading_file_snapshot',
    progress_pct: 8,
    state: {
      ...(job.state || {}),
      action,
      fileId,
    },
  });

  const admin = getAdminSupabaseClient();
  const { data: fileRowRaw, error: fileErr } = await admin
    .from('files')
    .select('id,content,updated_at,kind,folder_id')
    .eq('id', fileId)
    .maybeSingle();
  if (fileErr) throw new Error(fileErr.message);
  const fileRow = (fileRowRaw || null) as
    | null
    | {
        id?: unknown;
        content?: unknown;
        updated_at?: unknown;
        kind?: unknown;
        folder_id?: unknown;
      };
  if (!fileRow) throw new Error('Diagram file not found');
  if (normalizeText(fileRow.kind) !== 'diagram') throw new Error('Target file is not a diagram');
  if (normalizeText(fileRow.folder_id) !== projectFolderId) throw new Error('File does not belong to project');

  const fileContent = normalizeNewlines(fileRow.content || '');
  const fileUpdatedAt = normalizeText(fileRow.updated_at) || null;
  const currentHash = hashMarkdown(fileContent);

  if (normalizeText(selection.baseFileHash) !== currentHash) {
    throw new Error('File changed since analysis snapshot. Re-analyze required.');
  }
  if (selection.baseUpdatedAt && fileUpdatedAt && normalizeText(selection.baseUpdatedAt) !== fileUpdatedAt) {
    throw new Error('File updated timestamp changed since analysis snapshot. Re-analyze required.');
  }

  await ensureNotCancelled(job.id);
  await updateAsyncJob(job.id, {
    step: 'gathering_context',
    progress_pct: 28,
    state: {
      ...(job.state || {}),
      action,
      fileId,
      fileUpdatedAt,
      baseHash: currentHash,
    },
  });

  const kb =
    action === 'markdown_errors_fix'
      ? { matches: [], contextText: '' }
      : await queryProjectKbContext({
          ownerId,
          projectFolderId,
          query: buildKbQuery(action, selection),
          topK: 10,
          apiKey: openaiApiKey,
          embeddingModel,
          admin,
        });

  const dataObjects = parseDataObjectsFromMarkdown(fileContent);

  await ensureNotCancelled(job.id);
  await updateAsyncJob(job.id, {
    step: 'generating_proposal',
    progress_pct: 58,
    state: {
      ...(job.state || {}),
      kbMatches: kb.matches.length,
      action,
    },
  });

  let systemPrompt = '';
  let userPrompt = '';
  if (action === 'node_structure') {
    const p = buildNodeStructurePrompt({
      selection: selection as DiagramAssistNodeStructureSelection,
      markdown: fileContent,
      dataObjects,
      kbContext: kb.contextText,
    });
    systemPrompt = p.system;
    userPrompt = p.user;
  } else if (action === 'data_object_attributes') {
    const p = buildDataObjectAttributesPrompt({
      selection: selection as DiagramAssistDataObjectAttributesSelection,
      markdown: fileContent,
      dataObjects,
      kbContext: kb.contextText,
    });
    systemPrompt = p.system;
    userPrompt = p.user;
  } else if (action === 'status_descriptions') {
    const p = buildStatusPrompt({
      selection: selection as DiagramAssistStatusDescriptionsSelection,
      markdown: fileContent,
      kbContext: kb.contextText,
    });
    systemPrompt = p.system;
    userPrompt = p.user;
  } else {
    const baselineValidation = validateNexusMarkdownImport(fileContent);
    const issuesToFix = selectMarkdownFixIssues({
      baselineErrors: baselineValidation.errors,
      selection: selection as DiagramAssistMarkdownErrorsFixSelection,
    });
    const targets = buildMarkdownFixTargets(fileContent, issuesToFix);
    const p = buildMarkdownErrorsFixPrompt({
      selection: selection as DiagramAssistMarkdownErrorsFixSelection,
      markdown: fileContent,
      issues: issuesToFix,
      targets,
      kbContext: kb.contextText,
    });
    systemPrompt = p.system;
    userPrompt = p.user;
  }

  let proposal: DiagramAssistProposal;
  let modelAttemptsUsed = 0;

  if (action === 'node_structure') {
    const selectionNode = selection as DiagramAssistNodeStructureSelection;
    const baselineValidation = validateNexusMarkdownImport(fileContent);
    const baselineErrors = baselineValidation.errors;
    let lastFailureReason = 'No valid response received';
    let lastValidationErrors: string[] = [];
    let lastValidationIssues: ImportValidationIssue[] = [];
    let lastResponseText = '';
    let acceptedParsed: Record<string, unknown> | null = null;
    let acceptedSimulated:
      | { nextMarkdown: string; originalSubtreeMarkdown: string; nextSubtreeRange: { start: number; end: number } }
      | null = null;
    let acceptedValidationWarnings: string[] = [];
    let acceptedSanitizerNotes: string[] = [];

    for (let attempt = 1; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
      await ensureNotCancelled(job.id);
      modelAttemptsUsed = attempt;
      if (attempt > 1) {
        await updateAsyncJob(job.id, {
          step: 'repairing_proposal',
          progress_pct: Math.min(92, 58 + attempt * 6),
          state: {
            ...(job.state || {}),
            action,
            kbMatches: kb.matches.length,
            repairAttempt: attempt,
            previousFailure: lastFailureReason.slice(0, 300),
          },
        });
      }

      const userPromptForAttempt =
        attempt === 1
          ? userPrompt
          : buildRepairUserPrompt({
              baseUserPrompt: userPrompt,
              action,
              attempt,
              failureReason: lastFailureReason,
              validationErrors: lastValidationErrors,
              validationIssues: lastValidationIssues,
              previousResponse: lastResponseText,
            });

      const responseText = await runOpenAIResponsesText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPromptForAttempt },
        ],
        {
          apiKey: openaiApiKey,
          model: chatModel,
          withWebSearch: true,
        },
      );
      lastResponseText = responseText;

      let parsed: Record<string, unknown>;
      try {
        parsed = extractJsonObject(responseText);
      } catch (e) {
        lastFailureReason = `Invalid JSON output: ${e instanceof Error ? e.message : String(e)}`;
        lastValidationErrors = [];
        continue;
      }

      const sanitizedSubtree = sanitizeNodeStructureSubtreeReplacement({
        subtreeReplacementMarkdown: parsed.subtreeReplacementMarkdown,
        fallbackSubtreeMarkdown: selectionNode.subtreeMarkdown,
      });
      parsed.subtreeReplacementMarkdown = sanitizedSubtree.subtreeReplacementMarkdown;

      let simulated: { nextMarkdown: string; originalSubtreeMarkdown: string; nextSubtreeRange: { start: number; end: number } };
      try {
        simulated = replaceSubtreeAtLine({
          markdown: fileContent,
          lineIndex: selectionNode.lineIndex,
          subtreeReplacementMarkdown: sanitizedSubtree.subtreeReplacementMarkdown,
        });
      } catch (e) {
        lastFailureReason = `Invalid subtree replacement: ${e instanceof Error ? e.message : String(e)}`;
        lastValidationErrors = [];
        continue;
      }

      const validation = validateNexusMarkdownImport(simulated.nextMarkdown);
      const blockingValidationIssues = findBlockingNodeStructureErrors({
        baselineErrors,
        proposalErrors: validation.errors,
        nextSubtreeRange: simulated.nextSubtreeRange,
      });
      if (blockingValidationIssues.length > 0) {
        lastValidationIssues = blockingValidationIssues.slice(0, 60);
        lastValidationErrors = lastValidationIssues.map((err) => `${err.code}: ${err.message}`).slice(0, 60);
        lastFailureReason = `Validation failed with ${blockingValidationIssues.length} blocking error(s)`;
        continue;
      }

      acceptedParsed = parsed;
      acceptedSimulated = simulated;
      acceptedValidationWarnings = validation.warnings.map((w) => `${w.code}: ${w.message}`).slice(0, 120);
      acceptedSanitizerNotes = sanitizedSubtree.repairNotes;
      break;
    }

    if (!acceptedParsed || !acceptedSimulated) {
      const human = formatValidationIssuesHuman(lastValidationIssues, 10);
      const technical = formatValidationIssuesTechnical(lastValidationIssues, 10);
      throw new Error(
        `${NON_RETRYABLE_PREFIX} Unable to produce a valid node structure proposal after ${MAX_MODEL_REPAIR_ATTEMPTS} repair attempts. Auto-repair stopped.\nHuman-readable issues:\n${human}${technical ? `\nTechnical issues:\n${technical}` : ''}\nRe-run analysis manually after fixing the issues above.`,
      );
    }

    await ensureNotCancelled(job.id);
    await updateAsyncJob(job.id, {
      step: 'validating_proposal',
      progress_pct: 92,
      state: {
        ...(job.state || {}),
        action,
        kbMatches: kb.matches.length,
        modelAttempts: modelAttemptsUsed,
      },
    });

    const nodeProposal = sanitizeNodeStructureProposal({
      selection: selectionNode,
      parsed: acceptedParsed,
      baseFileHash: currentHash,
      originalSubtreeMarkdown: acceptedSimulated.originalSubtreeMarkdown,
    });

    nodeProposal.validationReport = {
      errors: [],
      warnings: acceptedValidationWarnings,
      notes: acceptedSanitizerNotes
        .concat(clampArray(acceptedParsed.validationNotes, { maxItems: 40, maxChars: 260 }))
        .slice(0, 40),
    };
    proposal = nodeProposal;
  } else if (action === 'markdown_errors_fix') {
    const selectionFix = selection as DiagramAssistMarkdownErrorsFixSelection;
    const baselineValidation = validateNexusMarkdownImport(fileContent);
    const baselineErrors = baselineValidation.errors;
    const issuesToFix = selectMarkdownFixIssues({
      baselineErrors,
      selection: selectionFix,
    });

    if (!issuesToFix.length) {
      proposal = {
        action: 'markdown_errors_fix',
        baseFileHash: currentHash,
        summary: 'No markdown validation errors were found.',
        issues: [],
        patches: [],
        validationReport: {
          errors: [],
          warnings: baselineValidation.warnings.map((w) => `${w.code}: ${w.message}`).slice(0, 120),
          fixedIssueCount: 0,
          unresolvedIssueCount: 0,
          newIssueCount: 0,
        },
      };
    } else {
      const targets = buildMarkdownFixTargets(fileContent, issuesToFix);
      if (!targets.length) {
        throw new Error(
          `${NON_RETRYABLE_PREFIX} Unable to build editable target sections for markdown repair. Re-run analysis manually.`,
        );
      }
      const requestedMaxPatches = Math.min(
        MAX_MARKDOWN_FIX_PATCHES,
        Math.max(1, Math.floor(Number(selectionFix.maxPatches || DEFAULT_MARKDOWN_FIX_PATCHES))),
      );
      const requiredPatchBudget = Math.min(
        MAX_MARKDOWN_FIX_PATCHES,
        Math.max(targets.length, issuesToFix.length),
      );
      const maxPatches = Math.max(requestedMaxPatches, requiredPatchBudget);
      const maxRepairAttempts = MAX_MARKDOWN_FIX_REPAIR_ATTEMPTS;

      let lastFailureReason = 'No valid response received';
      let lastValidationIssues: ImportValidationIssue[] = [];
      let lastValidationErrors: string[] = [];
      let lastResponseText = '';
      let acceptedParsed: Record<string, unknown> | null = null;
      let acceptedPatches: DiagramAssistMarkdownSectionPatch[] = [];
      let acceptedUnresolvedIssues: ImportValidationIssue[] = [];
      let acceptedNewIssues: ImportValidationIssue[] = [];
      let acceptedValidationWarnings: string[] = [];

      for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
        await ensureNotCancelled(job.id);
        modelAttemptsUsed = attempt;
        if (attempt > 1) {
          await updateAsyncJob(job.id, {
            step: 'repairing_proposal',
            progress_pct: Math.min(92, 58 + attempt * 6),
            state: {
              ...(job.state || {}),
              action,
              kbMatches: kb.matches.length,
              repairAttempt: attempt,
              previousFailure: lastFailureReason.slice(0, 300),
            },
          });
        }

        const userPromptForAttempt =
          attempt === 1
            ? userPrompt
            : buildRepairUserPrompt({
                baseUserPrompt: userPrompt,
                action,
                attempt,
                failureReason: lastFailureReason,
                validationErrors: lastValidationErrors,
                validationIssues: lastValidationIssues,
                previousResponse: lastResponseText,
              });

        const responseText = await runOpenAIResponsesText(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPromptForAttempt },
          ],
          {
            apiKey: openaiApiKey,
            model: chatModel,
            withWebSearch: false,
          },
        );
        lastResponseText = responseText;

        let parsed: Record<string, unknown>;
        try {
          parsed = extractJsonObject(responseText);
        } catch (e) {
          lastFailureReason = `Invalid JSON output: ${e instanceof Error ? e.message : String(e)}`;
          lastValidationErrors = [];
          continue;
        }

        const patches = sanitizeMarkdownFixPatchesFromParsed({
          parsed,
          targets,
          maxPatches,
        });
        if (!patches.length) {
          lastFailureReason = 'Model returned no valid section patches.';
          lastValidationErrors = [];
          continue;
        }

        let nextMarkdown = '';
        try {
          nextMarkdown = applyLineRangePatchesToMarkdown(fileContent, patches);
        } catch (e) {
          lastFailureReason = `Invalid patch plan: ${e instanceof Error ? e.message : String(e)}`;
          lastValidationErrors = [];
          continue;
        }

        const validation = validateNexusMarkdownImport(nextMarkdown);
        const unresolvedIssues = diffRemainingBaselineIssues(validation.errors, issuesToFix);
        const newIssues = diffAddedIssues(validation.errors, baselineErrors);
        const blockingIssues = dedupeIssues(unresolvedIssues.concat(newIssues));
        if (blockingIssues.length > 0) {
          lastValidationIssues = blockingIssues.slice(0, 80);
          lastValidationErrors = lastValidationIssues.map((issue) => `${issue.code}: ${issue.message}`).slice(0, 80);
          lastFailureReason = `Validation failed with ${blockingIssues.length} blocking error(s)`;
          continue;
        }

        acceptedParsed = parsed;
        acceptedPatches = patches;
        acceptedUnresolvedIssues = unresolvedIssues;
        acceptedNewIssues = newIssues;
        acceptedValidationWarnings = validation.warnings.map((w) => `${w.code}: ${w.message}`).slice(0, 120);
        break;
      }

      if (!acceptedParsed) {
        const human = formatValidationIssuesHuman(lastValidationIssues, 10);
        const technical = formatValidationIssuesTechnical(lastValidationIssues, 10);
        throw new Error(
          `${NON_RETRYABLE_PREFIX} Unable to produce a valid markdown repair proposal after ${maxRepairAttempts} repair attempts. Auto-repair stopped.\nHuman-readable issues:\n${human}${technical ? `\nTechnical issues:\n${technical}` : ''}\nRe-run analysis manually after fixing the issues above.`,
        );
      }

      await ensureNotCancelled(job.id);
      await updateAsyncJob(job.id, {
        step: 'validating_proposal',
        progress_pct: 92,
        state: {
          ...(job.state || {}),
          action,
          kbMatches: kb.matches.length,
          modelAttempts: modelAttemptsUsed,
        },
      });

      proposal = sanitizeMarkdownErrorsFixProposal({
        parsed: acceptedParsed,
        baseFileHash: currentHash,
        issues: issuesToFix,
        patches: acceptedPatches,
        unresolvedIssues: acceptedUnresolvedIssues,
        newIssues: acceptedNewIssues,
        validationWarnings: acceptedValidationWarnings,
      });
    }
  } else {
    let parsed: Record<string, unknown> | null = null;
    let lastFailureReason = 'No valid response received';
    let lastResponseText = '';

    for (let attempt = 1; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
      await ensureNotCancelled(job.id);
      modelAttemptsUsed = attempt;
      if (attempt > 1) {
        await updateAsyncJob(job.id, {
          step: 'repairing_proposal',
          progress_pct: Math.min(90, 58 + attempt * 6),
          state: {
            ...(job.state || {}),
            action,
            kbMatches: kb.matches.length,
            repairAttempt: attempt,
            previousFailure: lastFailureReason.slice(0, 300),
          },
        });
      }

      const userPromptForAttempt =
        attempt === 1
          ? userPrompt
          : buildRepairUserPrompt({
              baseUserPrompt: userPrompt,
              action,
              attempt,
              failureReason: lastFailureReason,
              previousResponse: lastResponseText,
            });

      const responseText = await runOpenAIResponsesText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPromptForAttempt },
        ],
        {
          apiKey: openaiApiKey,
          model: chatModel,
          withWebSearch: true,
        },
      );
      lastResponseText = responseText;

      try {
        parsed = extractJsonObject(responseText);
        break;
      } catch (e) {
        lastFailureReason = `Invalid JSON output: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (!parsed) {
      throw new Error(
        `${NON_RETRYABLE_PREFIX} Unable to produce a valid AI proposal after ${MAX_MODEL_REPAIR_ATTEMPTS} repair attempts. Auto-repair stopped; re-run analysis manually.`,
      );
    }

    await ensureNotCancelled(job.id);
    await updateAsyncJob(job.id, {
      step: 'validating_proposal',
      progress_pct: 90,
      state: {
        ...(job.state || {}),
        action,
        kbMatches: kb.matches.length,
        modelAttempts: modelAttemptsUsed,
      },
    });

    if (action === 'data_object_attributes') {
      proposal = sanitizeDataObjectAttributesProposal({
        parsed,
        selection: selection as DiagramAssistDataObjectAttributesSelection,
        baseFileHash: currentHash,
      });
    } else {
      proposal = sanitizeStatusDescriptionsProposal({
        parsed,
        selection: selection as DiagramAssistStatusDescriptionsSelection,
        baseFileHash: currentHash,
      });
    }
  }

  return {
    ok: true,
    action,
    fileId,
    projectFolderId,
    proposal,
    snapshot: {
      baseFileHash: currentHash,
      baseUpdatedAt: fileUpdatedAt,
      analyzedAt: new Date().toISOString(),
    },
    context: {
      ragMatches: kb.matches.length,
      withWebSearch: true,
      modelAttempts: modelAttemptsUsed,
    },
  };
}
