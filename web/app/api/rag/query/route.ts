import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { hasValidRagApiKey } from '@/lib/server/rag-auth';
import { embedTextsOpenAI } from '@/lib/server/openai-embeddings';
import { chatAnswerOpenAI } from '@/lib/server/openai-chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MatchRow = {
  owner_id: string;
  id: string;
  file_id: string | null;
  file_kind: string | null;
  anchor: string | null;
  text: string;
  similarity: number;
};

export async function POST(request: Request) {
  const isApiKey = hasValidRagApiKey(request);
  const origin = request.headers.get('origin');
  const hostOrigin = new URL(request.url).origin;
  if (!isApiKey && origin && origin !== hostOrigin) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | null
    | {
        query?: string;
        projectFolderId?: string | null;
        ownerId?: string | null;
        topK?: number;
        generateAnswer?: boolean;
        openaiApiKey?: string;
        embeddingModel?: string;
        chatModel?: string;
      };

  const query = String(body?.query || '').trim();
  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  const projectFolderId = body?.projectFolderId ? String(body.projectFolderId).trim() : null;
  const ownerId = body?.ownerId ? String(body.ownerId).trim() : null;
  const topK = Math.max(1, Math.min(50, Number(body?.topK ?? 12)));
  const generateAnswer = body?.generateAnswer !== false;
  const openaiApiKey = String(request.headers.get('x-openai-api-key') || body?.openaiApiKey || '').trim() || null;
  const embeddingModel = String(body?.embeddingModel || '').trim() || undefined;
  const chatModel = String(body?.chatModel || '').trim() || undefined;

  const embedding = (await embedTextsOpenAI([query], { apiKey: openaiApiKey || undefined, model: embeddingModel }))[0];

  if (isApiKey) {
    const admin = getAdminSupabaseClient();
    const { data, error } = await admin.rpc('match_rag_chunks', {
      query_embedding: embedding as any,
      match_count: topK,
      owner: ownerId || null,
      project: projectFolderId || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const matches = (data || []) as MatchRow[];
    const answer = generateAnswer
      ? await chatAnswerOpenAI([
          { role: 'system', content: 'Answer the user using the provided context. If context is insufficient, say what is missing.' },
          {
            role: 'user',
            content:
              `User question:\n${query}\n\nContext:\n` +
              matches
                .map((m, i) => `[#${i + 1} file=${m.file_id || 'unknown'} anchor=${m.anchor || ''}]\n${m.text}`)
                .join('\n\n'),
          },
        ], { apiKey: openaiApiKey || undefined, model: chatModel }).catch(() => '')
      : '';

    return NextResponse.json({ ok: true, matches, answer });
  }

  const { supabase, user } = await getUserSupabaseClient();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('match_rag_chunks', {
    query_embedding: embedding as any,
    match_count: topK,
    owner: null,
    project: projectFolderId || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const matches = (data || []) as MatchRow[];

  const answer = generateAnswer
    ? await chatAnswerOpenAI([
        { role: 'system', content: 'Answer the user using the provided context. If context is insufficient, say what is missing.' },
        {
          role: 'user',
          content:
            `User question:\n${query}\n\nContext:\n` +
            matches
              .map((m, i) => `[#${i + 1} file=${m.file_id || 'unknown'} anchor=${m.anchor || ''}]\n${m.text}`)
              .join('\n\n'),
        },
      ], { apiKey: openaiApiKey || undefined, model: chatModel }).catch(() => '')
    : '';

  return NextResponse.json({ ok: true, userId: user.id, matches, answer });
}

