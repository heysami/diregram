import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

function sha256Hex(s) {
  return createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function env(name, fallback = '') {
  return String(process.env[name] || fallback);
}

const SUPABASE_URL = env('SUPABASE_URL', env('NEXT_PUBLIC_SUPABASE_URL'));
const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function embedOpenAI({ apiKey, model, input }) {
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'text-embedding-3-small', input }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI embeddings failed (${res.status})`);
  return (json?.data || []).map((d) => d.embedding);
}

async function chatOpenAI({ apiKey, model, messages }) {
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', temperature: 0.2, messages }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI chat failed (${res.status})`);
  return String(json?.choices?.[0]?.message?.content || '').trim();
}

async function resolveShareFromToken(token) {
  const tokenHash = sha256Hex(token);
  const { data, error } = await supabase
    .from('rag_mcp_shares')
    .select('owner_id,project_folder_id,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Invalid token');
  if (data.revoked_at) throw new Error('Token revoked');
  return { ownerId: data.owner_id, projectFolderId: data.project_folder_id };
}

const QueryArgs = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).optional(),
  generateAnswer: z.boolean().optional(),
  openaiApiKey: z.string().min(1).optional(),
  embeddingModel: z.string().min(1).optional(),
  chatModel: z.string().min(1).optional(),
});

function sseWrite(res, event, dataObj) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
}

function sseWriteText(res, event, text) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${String(text || '')}\n\n`);
}

async function ragQueryScoped(share, args) {
  const parsed = QueryArgs.safeParse(args);
  if (!parsed.success) throw new Error(parsed.error.message);
  const a = parsed.data;
  const topK = typeof a.topK === 'number' ? a.topK : 12;
  const generateAnswer = a.generateAnswer !== false;
  const openaiApiKey = String(a.openaiApiKey || '').trim();
  const embeddingModel = a.embeddingModel;
  const chatModel = a.chatModel;

  const embedding = (await embedOpenAI({ apiKey: openaiApiKey, model: embeddingModel, input: [a.query] }))[0];

  const { data, error } = await supabase.rpc('match_rag_chunks', {
    query_embedding: embedding,
    match_count: topK,
    owner: share.ownerId,
    project: share.projectFolderId,
  });
  if (error) throw new Error(error.message);
  const matches = Array.isArray(data) ? data : [];

  let answer = '';
  if (generateAnswer) {
    answer = await chatOpenAI({
      apiKey: openaiApiKey,
      model: chatModel,
      messages: [
        { role: 'system', content: 'Answer using the provided context. If insufficient, say what is missing.' },
        {
          role: 'user',
          content:
            `User question:\n${a.query}\n\nContext:\n` +
            matches
              .map((m, i) => `[#${i + 1} file=${m.file_id || 'unknown'} anchor=${m.anchor || ''}]\n${m.text}`)
              .join('\n\n'),
        },
      ],
    });
  }

  return { ok: true, answer, matches };
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/', (_req, res) => res.status(200).send('ok'));

// Minimal MCP-over-SSE transport (hosted).
// Cursor can connect via URL: https://host/sse?token=...
const sessions = new Map(); // sessionId -> { share, res }

app.get('/sse', async (req, res, next) => {
  try {
    const tokenFromQuery = String(req.query.token || '').trim();
    const auth = String(req.headers.authorization || '');
    const tokenFromAuth = auth.toLowerCase().startsWith('bearer ') ? auth.slice('bearer '.length).trim() : '';
    const token = tokenFromQuery || tokenFromAuth;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const share = await resolveShareFromToken(token);

    const sessionId = randomUUID();
    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');
    res.flushHeaders?.();

    sessions.set(sessionId, { share, res });

    // Tell client where to POST messages for this session.
    // Per MCP spec, this is sent as an "endpoint" event.
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const endpointUrl = `${baseUrl}/messages?sessionId=${encodeURIComponent(sessionId)}`;
    // Most clients expect the endpoint event's data to be a plain string URL.
    sseWriteText(res, 'endpoint', endpointUrl);

    req.on('close', () => {
      sessions.delete(sessionId);
      try {
        res.end();
      } catch {
        // ignore
      }
    });
    return;
  } catch (e) {
    return res.status(401).json({ error: e instanceof Error ? e.message : 'Unauthorized' });
  }
});

app.post('/messages', async (req, res) => {
  const sessionId = String(req.query.sessionId || req.headers['mcp-session-id'] || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: 'Unknown session' });

  const msg = req.body;
  const id = msg?.id ?? null;
  const method = String(msg?.method || '');
  const params = msg?.params || {};

  const sendResult = (result) => {
    if (id == null) return;
    sseWrite(sess.res, 'message', { jsonrpc: '2.0', id, result });
  };

  const sendError = (err) => {
    if (id == null) return;
    const message = err instanceof Error ? err.message : String(err || 'Error');
    sseWrite(sess.res, 'message', { jsonrpc: '2.0', id, error: { code: -32000, message } });
  };

  try {
    if (method === 'initialize') {
      sendResult({
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'nexusmap-rag-hosted', version: '0.1.0' },
        capabilities: { tools: {} },
      });
      return res.status(202).end();
    }

    if (method === 'tools/list') {
      sendResult({
        tools: [
          {
            name: 'nexusmap_rag_query',
            description: 'Query the NexusMap project knowledge base (scoped by share token).',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                topK: { type: 'integer', minimum: 1, maximum: 50 },
                generateAnswer: { type: 'boolean' },
                openaiApiKey: { type: 'string' },
                embeddingModel: { type: 'string' },
                chatModel: { type: 'string' },
              },
              required: ['query', 'openaiApiKey'],
            },
          },
        ],
      });
      return res.status(202).end();
    }

    if (method === 'tools/call') {
      const toolName = String(params?.name || '');
      const args = params?.arguments || {};
      if (toolName !== 'nexusmap_rag_query') throw new Error('Unknown tool');
      const out = await ragQueryScoped(sess.share, args);
      sendResult({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      return res.status(202).end();
    }

    // Notifications / unknown methods: ignore
    return res.status(202).end();
  } catch (e) {
    sendError(e);
    return res.status(202).end();
  }
});

const port = Number(process.env.PORT || 3232);
app.listen(port, () => {
  console.log(`Hosted MCP server listening on :${port}`);
});

