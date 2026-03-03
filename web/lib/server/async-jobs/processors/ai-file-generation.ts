import { randomUUID } from 'node:crypto';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { loadGridDoc, saveGridDoc, type GridDoc, type GridSheetV1 } from '@/lib/gridjson';
import { normalizeLayoutDirection } from '@/lib/layout-direction';
import { upsertHeader } from '@/lib/nexus-doc-header';
import { decryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';
import { isAsyncJobCancelRequested, updateAsyncJob } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import { queryProjectKbContext, runOpenAIResponsesText } from '@/lib/server/openai-responses';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';

type FileGenerationTask = {
  outputKind: 'note' | 'user_story_grid';
  fileName: string;
  prompt: string;
};

function coerceOutputKind(input: unknown): FileGenerationTask['outputKind'] {
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
    }))
    .filter((t) => Boolean(t.prompt))
    .slice(0, 20);
  if (!tasks.length) throw new Error('No valid tasks found');

  const { data: profile, error: profileErr } = await admin.from('profiles').select('default_layout_direction').eq('id', ownerId).maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  const defaultLayout = normalizeLayoutDirection((profile as { default_layout_direction?: unknown } | null)?.default_layout_direction);

  const createdFiles: Array<{ id: string; name: string; kind: 'note' | 'grid' }> = [];
  const errors: Array<{ index: number; task: string; message: string }> = [];

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

      let kind: 'note' | 'grid' = 'note';
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
        kind: row.kind === 'grid' ? 'grid' : 'note',
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
