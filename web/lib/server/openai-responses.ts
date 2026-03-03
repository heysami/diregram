import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { embedTextsOpenAI } from '@/lib/server/openai-embeddings';

type OpenAIResponsesInputItem = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenAIResponsesOutput = {
  output_text?: string;
};

type RagMatchRow = {
  owner_id: string;
  id: string;
  file_id: string | null;
  file_kind: string | null;
  anchor: string | null;
  text: string;
  similarity: number;
};

function resolveApiKey(apiKey?: string) {
  const key = String(apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('Missing OpenAI API key');
  return key;
}

function resolveModel(model?: string) {
  return String(model || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini').trim();
}

export async function runOpenAIResponsesText(
  input: OpenAIResponsesInputItem[],
  opts?: { apiKey?: string; model?: string; withWebSearch?: boolean },
): Promise<string> {
  const apiKey = resolveApiKey(opts?.apiKey);
  const model = resolveModel(opts?.model);
  const withWebSearch = Boolean(opts?.withWebSearch);

  const body: Record<string, unknown> = {
    model,
    input,
    temperature: 0.2,
  };
  if (withWebSearch) {
    body.tools = [{ type: 'web_search_preview' }];
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`OpenAI responses failed (${res.status}): ${msg || res.statusText}`);
  }
  const json = (await res.json()) as OpenAIResponsesOutput;
  return String(json.output_text || '').trim();
}

export async function queryProjectKbContext(input: {
  ownerId: string;
  projectFolderId: string;
  query: string;
  topK?: number;
  apiKey?: string;
  embeddingModel?: string;
  admin?: SupabaseClient;
}): Promise<{ matches: RagMatchRow[]; contextText: string }> {
  const ownerId = String(input.ownerId || '').trim();
  const projectFolderId = String(input.projectFolderId || '').trim();
  const query = String(input.query || '').trim();
  if (!ownerId) throw new Error('Missing ownerId');
  if (!projectFolderId) throw new Error('Missing projectFolderId');
  if (!query) return { matches: [], contextText: '' };

  const topK = Math.max(1, Math.min(30, Number(input.topK ?? 8)));
  const embedding = (await embedTextsOpenAI([query], { apiKey: input.apiKey, model: input.embeddingModel }))[0];
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    return { matches: [], contextText: '' };
  }
  const admin = input.admin || getAdminSupabaseClient();
  const { data, error } = await admin.rpc('match_rag_chunks', {
    query_embedding: embedding as number[],
    match_count: topK,
    owner: ownerId,
    project: projectFolderId,
  });
  if (error) throw new Error(error.message);
  const matches = ((data || []) as RagMatchRow[]).slice(0, topK);
  const contextText = matches
    .map((m, i) => `[#${i + 1} file=${m.file_id || 'unknown'} anchor=${m.anchor || ''}]\n${String(m.text || '')}`)
    .join('\n\n');
  return { matches, contextText };
}
