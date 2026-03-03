import { loadGridDoc, saveGridDoc } from '@/lib/gridjson';
import { decryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';
import { isAsyncJobCancelRequested, updateAsyncJob } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import { queryProjectKbContext, runOpenAIResponsesText } from '@/lib/server/openai-responses';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';

type GridRuleInput = {
  id: string;
  name: string;
  tableId: string;
  mode: 'derive' | 'research';
  prompt: string;
  sourceColumnIds: string[];
  targetColumnId: string;
};

type GridRuleRowInput = {
  rowId: string;
  sourceValues: Record<string, string>;
};

type GridRuleUpdateResult = {
  rowId: string;
  colId: string;
  value: string;
  ok: boolean;
  error?: string;
};

function normalizeText(input: unknown): string {
  return String(input || '').trim();
}

function applyGridUpdatesToMarkdown(markdown: string, sheetId: string, updates: GridRuleUpdateResult[]): string {
  const loaded = loadGridDoc(markdown);
  const doc = loaded.doc;
  const sheet = (doc.sheets || []).find((s) => s.id === sheetId) || null;
  if (!sheet) throw new Error('Sheet not found');
  const nextCells = { ...(sheet.grid.cells || {}) };
  for (const u of updates) {
    if (!u.ok) continue;
    const key = `${u.rowId}:${u.colId}`;
    const value = normalizeText(u.value);
    if (!value) {
      delete nextCells[key];
    } else {
      nextCells[key] = { value };
    }
  }
  sheet.grid.cells = nextCells;
  return saveGridDoc(markdown, doc);
}

async function persistGridUpdatesWithRetry(input: {
  fileId: string;
  sheetId: string;
  updates: GridRuleUpdateResult[];
}): Promise<boolean> {
  const admin = getAdminSupabaseClient();
  const candidates = input.updates.filter((u) => u.ok);
  if (!candidates.length) return false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error } = await admin
      .from('files')
      .select('id,content,updated_at,kind')
      .eq('id', input.fileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = (row || null) as { id?: unknown; content?: unknown; updated_at?: unknown; kind?: unknown } | null;
    if (!r) throw new Error('Grid file not found');
    if (String(r.kind || '') !== 'grid') throw new Error('Target file is not a grid');
    const previousUpdatedAt = normalizeText(r.updated_at);
    if (!previousUpdatedAt) throw new Error('Missing file updated_at');
    const content = String(r.content || '');
    const nextContent = applyGridUpdatesToMarkdown(content, input.sheetId, candidates);
    const { data: updated, error: updateErr } = await admin
      .from('files')
      .update({
        content: nextContent,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', input.fileId)
      .eq('updated_at', previousUpdatedAt)
      .select('id')
      .maybeSingle();
    if (updateErr) throw new Error(updateErr.message);
    if (updated && typeof updated === 'object' && (updated as { id?: unknown }).id) return true;
  }
  return false;
}

async function generateTargetValue(input: {
  rule: GridRuleInput;
  row: GridRuleRowInput;
  ownerId: string;
  projectFolderId: string;
  apiKey: string;
  chatModel?: string;
  embeddingModel?: string;
}): Promise<string> {
  const srcText = (input.rule.sourceColumnIds || [])
    .map((colId) => `${colId}: ${normalizeText(input.row.sourceValues?.[colId]) || '(empty)'}`)
    .join('\n');
  const mode = input.rule.mode === 'research' ? 'research' : 'derive';

  let contextText = '';
  if (mode === 'research') {
    const kb = await queryProjectKbContext({
      ownerId: input.ownerId,
      projectFolderId: input.projectFolderId,
      query: `${input.rule.prompt}\n${srcText}`,
      topK: 8,
      apiKey: input.apiKey,
      embeddingModel: input.embeddingModel,
    });
    contextText = kb.contextText;
  }

  const text = await runOpenAIResponsesText(
    [
      {
        role: 'system',
        content: 'Return only the final value for one spreadsheet cell. No markdown. No explanation.',
      },
      {
        role: 'user',
        content: [
          `Rule: ${input.rule.prompt}`,
          `Mode: ${mode}`,
          `Source fields:\n${srcText || '(none)'}`,
          contextText ? `Project KB context:\n${contextText}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    {
      apiKey: input.apiKey,
      model: input.chatModel,
      withWebSearch: mode === 'research',
    },
  );
  return normalizeText(text);
}

export async function runAiGridRuleJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  const input = (job.input || {}) as Record<string, unknown>;
  const ownerId = normalizeText(input.ownerId || job.owner_id);
  const projectFolderId = normalizeText(input.projectFolderId || job.project_folder_id);
  const fileId = normalizeText(input.fileId);
  const sheetId = normalizeText(input.sheetId);
  const ruleRaw = (input.rule && typeof input.rule === 'object' ? (input.rule as Record<string, unknown>) : {}) as Record<string, unknown>;
  const rowsRaw = Array.isArray(input.rows) ? (input.rows as unknown[]) : [];
  const chatModel = normalizeText(input.chatModel) || undefined;
  const embeddingModel = normalizeText(input.embeddingModel) || undefined;

  if (!ownerId) throw new Error('Missing ownerId');
  if (!projectFolderId) throw new Error('Missing projectFolderId');
  if (!fileId) throw new Error('Missing fileId');
  if (!sheetId) throw new Error('Missing sheetId');
  if (!rowsRaw.length) throw new Error('No rows were provided');

  const rule: GridRuleInput = {
    id: normalizeText(ruleRaw.id),
    name: normalizeText(ruleRaw.name) || 'AI rule',
    tableId: normalizeText(ruleRaw.tableId),
    mode: ruleRaw.mode === 'research' ? 'research' : 'derive',
    prompt: normalizeText(ruleRaw.prompt),
    sourceColumnIds: Array.isArray(ruleRaw.sourceColumnIds) ? (ruleRaw.sourceColumnIds as unknown[]).map((x) => normalizeText(x)).filter(Boolean) : [],
    targetColumnId: normalizeText(ruleRaw.targetColumnId),
  };
  if (!rule.id || !rule.tableId || !rule.prompt || !rule.targetColumnId) throw new Error('Invalid rule payload');

  const rows: GridRuleRowInput[] = rowsRaw
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((r) => ({
      rowId: normalizeText(r.rowId),
      sourceValues:
        r.sourceValues && typeof r.sourceValues === 'object'
          ? Object.fromEntries(Object.entries(r.sourceValues as Record<string, unknown>).map(([k, v]) => [String(k), normalizeText(v)]))
          : {},
    }))
    .filter((r) => Boolean(r.rowId))
    .slice(0, 200);

  const openaiApiKey = decryptOpenAiApiKey(job.secret_payload) || String(process.env.OPENAI_API_KEY || '').trim();
  if (!openaiApiKey) throw new Error('Missing OpenAI API key');

  const updates: GridRuleUpdateResult[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (await isAsyncJobCancelRequested(job.id)) throw new Error('Job cancelled');
    const row = rows[i]!;
    const pct = Math.max(1, Math.floor((i / rows.length) * 90));
    await updateAsyncJob(job.id, {
      step: 'generating_row_values',
      progress_pct: pct,
      state: {
        ...(job.state || {}),
        totalRows: rows.length,
        currentRowIndex: i,
      },
    });

    try {
      const value = await generateTargetValue({
        rule,
        row,
        ownerId,
        projectFolderId,
        apiKey: openaiApiKey,
        chatModel,
        embeddingModel,
      });
      updates.push({
        rowId: row.rowId,
        colId: rule.targetColumnId,
        value,
        ok: true,
      });
    } catch (e) {
      updates.push({
        rowId: row.rowId,
        colId: rule.targetColumnId,
        value: '',
        ok: false,
        error: (e instanceof Error ? e.message : String(e || 'Failed')).slice(0, 400),
      });
    }
  }

  if (await isAsyncJobCancelRequested(job.id)) throw new Error('Job cancelled');
  await updateAsyncJob(job.id, {
    step: 'applying_updates',
    progress_pct: 94,
    state: {
      ...(job.state || {}),
      totalRows: rows.length,
      generatedRows: updates.length,
    },
  });

  const appliedToFile = await persistGridUpdatesWithRetry({
    fileId,
    sheetId,
    updates,
  });

  const updatedCount = updates.filter((u) => u.ok).length;
  const failedCount = updates.length - updatedCount;
  return {
    ok: true,
    fileId,
    sheetId,
    ruleId: rule.id,
    updates,
    appliedToFile,
    stats: {
      totalRows: updates.length,
      updated: updatedCount,
      failed: failedCount,
    },
  };
}
