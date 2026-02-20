type OpenAIEmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

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

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: safeTexts,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings failed (${res.status}): ${msg || res.statusText}`);
  }
  const json = (await res.json()) as OpenAIEmbeddingResponse;
  const out = json?.data?.map((d) => d.embedding) || [];
  if (out.length !== safeTexts.length) throw new Error('OpenAI embeddings: unexpected response shape');
  return out;
}

