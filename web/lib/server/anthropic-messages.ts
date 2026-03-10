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

type ClaudeModelInfo = {
  id?: string;
  created_at?: string;
};

type ClaudeModelsListResponse = {
  data?: ClaudeModelInfo[];
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

function parseModelNotFound(bodyText: string): boolean {
  if (!bodyText) return false;
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const error = parsed.error && typeof parsed.error === 'object' ? (parsed.error as Record<string, unknown>) : {};
    const type = String(error.type || '').toLowerCase();
    const message = String(error.message || '').toLowerCase();
    return type.includes('not_found') && message.includes('model');
  } catch {
    return /not[_ -]?found/i.test(bodyText) && /model/i.test(bodyText);
  }
}

function parseIsoDateMs(input: string): number {
  const ms = Date.parse(input);
  return Number.isFinite(ms) ? ms : 0;
}

function buildStaticModelCandidates(): string[] {
  return [
    'claude-sonnet-4-20250514',
    'claude-opus-4-1-20250805',
    'claude-opus-4-20250514',
    'claude-sonnet-4-0',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
  ];
}

function prioritizeDiscoveredModels(modelIds: string[]): string[] {
  const sonnet = modelIds.filter((m) => m.includes('sonnet'));
  const haiku = modelIds.filter((m) => m.includes('haiku'));
  const opus = modelIds.filter((m) => m.includes('opus'));
  const picked = new Set([...sonnet, ...haiku, ...opus]);
  const other = modelIds.filter((m) => !picked.has(m));
  return [...sonnet, ...haiku, ...opus, ...other];
}

async function listAvailableModels(input: { apiKey: string; timeoutMs: number }): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5_000, Math.min(20_000, input.timeoutMs)));
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      method: 'GET',
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return [];
  }
  clearTimeout(timer);
  if (!res.ok) return [];

  const json = (await res.json().catch(() => ({}))) as ClaudeModelsListResponse;
  const rows = Array.isArray(json.data) ? json.data : [];
  if (!rows.length) return [];

  const normalized = rows
    .map((row, index) => ({
      id: String(row?.id || '').trim(),
      createdAtMs: parseIsoDateMs(String(row?.created_at || '')),
      index,
    }))
    .filter((row) => row.id.startsWith('claude-'));

  if (!normalized.length) return [];

  normalized.sort((a, b) => {
    if (a.createdAtMs && b.createdAtMs && a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs;
    if (a.createdAtMs && !b.createdAtMs) return -1;
    if (!a.createdAtMs && b.createdAtMs) return 1;
    return a.index - b.index;
  });

  return normalized.map((row) => row.id);
}

async function buildModelCandidates(input: { apiKey: string; timeoutMs: number; inputModel?: string }): Promise<string[]> {
  const requested = String(input.inputModel || process.env.CLAUDE_CHAT_MODEL || '').trim();
  const discoveredRaw = await listAvailableModels({ apiKey: input.apiKey, timeoutMs: input.timeoutMs });
  const discovered = prioritizeDiscoveredModels(discoveredRaw);
  const staticCandidates = buildStaticModelCandidates();
  return Array.from(new Set([requested, ...discovered, ...staticCandidates].filter(Boolean)));
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

  const maxTokens = Math.max(256, Math.min(8192, Math.floor(Number(input.maxTokens || 3000))));
  const temperature = Number.isFinite(Number(input.temperature)) ? Math.max(0, Math.min(1, Number(input.temperature))) : 0.2;
  const timeoutMs = resolveTimeoutMs('CLAUDE_TIMEOUT_MS', 120_000, 5_000, 600_000);
  const models = await buildModelCandidates({ apiKey, timeoutMs, inputModel: input.model });

  const system = String(input.system || '').trim();
  let lastError = '';
  const tried: string[] = [];
  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: [{ type: 'text', text: String(m.content || '') }],
      })),
    };
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
      clearTimeout(timer);
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`Claude request timed out after ${timeoutMs}ms`);
      }
      throw e;
    }
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      lastError = `Claude request failed (${res.status}): ${text || res.statusText}`;
      if ((res.status === 400 || res.status === 404) && parseModelNotFound(text)) {
        tried.push(model);
        continue;
      }
      throw new Error(lastError);
    }

    const json = (await res.json()) as ClaudeResponse;
    const out = extractClaudeText(json);
    if (out) return out;
    const err = json.error ? JSON.stringify(json.error).slice(0, 600) : '';
    throw new Error(`Claude returned empty output${err ? `: ${err}` : ''}`);
  }

  const triedText = tried.length ? ` Tried models: ${tried.join(', ')}.` : '';
  throw new Error(`${lastError || 'Claude request failed.'}${triedText}`);
}
