type ClaudeMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ClaudeContentItem = {
  type?: string;
  text?: string;
};

type ClaudeResponse = {
  content?: ClaudeContentItem[];
  error?: unknown;
};

function resolveTimeoutMs(envName: string, fallbackMs: number, minMs: number, maxMs: number): number {
  const raw = Number(process.env[envName] || fallbackMs);
  if (!Number.isFinite(raw)) return fallbackMs;
  return Math.max(minMs, Math.min(maxMs, Math.floor(raw)));
}

function extractClaudeText(json: ClaudeResponse): string {
  const content = Array.isArray(json.content) ? json.content : [];
  return content
    .map((part) => String(part?.text || '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export async function runClaudeMessagesText(input: {
  apiKey: string;
  messages: ClaudeMessage[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) throw new Error('Missing Claude API key');

  const model = String(input.model || process.env.CLAUDE_CHAT_MODEL || 'claude-3-7-sonnet-latest').trim();
  const maxTokens = Math.max(256, Math.min(8192, Math.floor(Number(input.maxTokens || 3000))));
  const temperature = Number.isFinite(Number(input.temperature)) ? Math.max(0, Math.min(1, Number(input.temperature))) : 0.2;
  const timeoutMs = resolveTimeoutMs('CLAUDE_TIMEOUT_MS', 120_000, 5_000, 600_000);

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: input.messages.map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: String(m.content || '') }],
    })),
  };
  const system = String(input.system || '').trim();
  if (system) body.system = system;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Claude request timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude request failed (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as ClaudeResponse;
  const out = extractClaudeText(json);
  if (out) return out;
  const err = json.error ? JSON.stringify(json.error).slice(0, 600) : '';
  throw new Error(`Claude returned empty output${err ? `: ${err}` : ''}`);
}
