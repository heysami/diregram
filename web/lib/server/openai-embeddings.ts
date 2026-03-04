type OpenAIEmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

function resolveTimeoutMs(): number {
  const raw = Number(process.env.OPENAI_EMBEDDINGS_TIMEOUT_MS || 60_000);
  if (!Number.isFinite(raw)) return 60_000;
  return Math.max(5_000, Math.min(300_000, Math.floor(raw)));
}

export async function embedTextsOpenAI(
  texts: string[],
  opts?: { model?: string; apiKey?: string },
): Promise<number[][]> {
  const apiKey = opts?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const model = opts?.model || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  // Embedding models have a per-input token limit. We don't have a tokenizer here,
  // so we use a conservative character cap to avoid hard failures.
  const maxChars = Number(process.env.OPENAI_EMBEDDING_MAX_CHARS || 8000);
  const safeMaxChars = Number.isFinite(maxChars) ? Math.max(1000, Math.min(20000, Math.floor(maxChars))) : 8000;
  const safeTexts = texts.map((t) => String(t || '').slice(0, safeMaxChars));
  const timeoutMs = resolveTimeoutMs();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: safeTexts,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`OpenAI embeddings timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings failed (${res.status}): ${msg || res.statusText}`);
  }
  const json = (await res.json()) as OpenAIEmbeddingResponse;
  const out = json?.data?.map((d) => d.embedding) || [];
  if (out.length !== safeTexts.length) throw new Error('OpenAI embeddings: unexpected response shape');
  return out;
}
