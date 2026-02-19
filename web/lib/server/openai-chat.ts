type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function chatAnswerOpenAI(
  messages: ChatMessage[],
  opts?: { model?: string; apiKey?: string },
): Promise<string> {
  const apiKey = opts?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const model = opts?.model || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`OpenAI chat failed (${res.status}): ${msg || res.statusText}`);
  }
  const json = (await res.json()) as OpenAIChatResponse;
  const text = json?.choices?.[0]?.message?.content;
  return (text ?? '').trim();
}

