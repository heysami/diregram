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

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings failed (${res.status}): ${msg || res.statusText}`);
  }
  const json = (await res.json()) as OpenAIEmbeddingResponse;
  const out = json?.data?.map((d) => d.embedding) || [];
  if (out.length !== texts.length) throw new Error('OpenAI embeddings: unexpected response shape');
  return out;
}

