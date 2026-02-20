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
const OPENAI_API_KEY = env('OPENAI_API_KEY', '');

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
    .from('rag_mcp_tokens')
    .select('owner_id,scope,project_folder_id,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Invalid token');
  if (data.revoked_at) throw new Error('Token revoked');
  const scope = String(data.scope || '');
  if (scope !== 'account' && scope !== 'project') throw new Error('Invalid token scope');
  const projectFolderId = data.project_folder_id ? String(data.project_folder_id) : null;
  if (scope === 'project' && !projectFolderId) throw new Error('Project token missing project');
  return { ownerId: data.owner_id, scope, projectFolderId };
}

const QueryArgs = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).optional(),
  generateAnswer: z.boolean().optional(),
  // Optional if the MCP server itself has OPENAI_API_KEY set.
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

function bearerUnauthorized(res, message) {
  // Hint MCP clients this is bearer-token auth, not OAuth.
  // (Prevents some clients from attempting OAuth dynamic registration.)
  res.setHeader('WWW-Authenticate', 'Bearer realm="nexusmap-mcp", error="invalid_token"');
  return res.status(401).json({ error: message || 'Unauthorized' });
}

async function ragQueryScoped(share, args, opts) {
  const parsed = QueryArgs.safeParse(args);
  if (!parsed.success) throw new Error(parsed.error.message);
  const a = parsed.data;
  const topK = typeof a.topK === 'number' ? a.topK : 12;
  const generateAnswer = a.generateAnswer !== false;
  const sessionKey = String(opts?.sessionOpenaiApiKey || '').trim();
  const openaiApiKey = String(a.openaiApiKey || '').trim() || sessionKey || OPENAI_API_KEY;
  const embeddingModel = a.embeddingModel;
  const chatModel = a.chatModel;

  if (!openaiApiKey) {
    throw new Error('OpenAI key required: pass openaiApiKey (sk-...) or call nexusmap_set_openai_key once per session.');
  }

  const embedding = (await embedOpenAI({ apiKey: openaiApiKey, model: embeddingModel, input: [a.query] }))[0];

  const projectId = share.projectFolderId ? share.projectFolderId : String(opts?.projectFolderId || '').trim();
  if (!projectId) throw new Error('Missing project: use nexusmap_list_projects and nexusmap_set_project first, or use a project-scoped MCP token.');

  const { data, error } = await supabase.rpc('match_rag_chunks', {
    query_embedding: embedding,
    match_count: topK,
    owner: share.ownerId,
    project: projectId,
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

async function listProjectsForOwner(ownerId) {
  const { data, error } = await supabase
    .from('rag_projects')
    .select('public_id,project_folder_id,updated_at,folders(name)')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => ({
    publicId: String(r.public_id || ''),
    name: String(r.folders?.name || ''),
    updatedAt: r.updated_at || null,
  }));
}

const app = express();
// Render/Railway/Fly sit behind proxies. Trust X-Forwarded-* so req.protocol is correct (https).
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/', (_req, res) => res.status(200).send('ok'));

// Minimal MCP-over-SSE transport (hosted).
// Cursor can connect via URL: https://host/sse?token=...
// NOTE: user-provided OpenAI keys are stored in-memory per session only.
const sessions = new Map(); // sessionId -> { share, res, openaiApiKey?: string, activePublicProjectId?: string }

app.get('/sse', async (req, res, next) => {
  try {
    const tokenFromQuery = String(req.query.token || '').trim();
    const auth = String(req.headers.authorization || '');
    const tokenFromAuth = auth.toLowerCase().startsWith('bearer ') ? auth.slice('bearer '.length).trim() : '';
    const token = tokenFromQuery || tokenFromAuth;
    if (!token) return bearerUnauthorized(res, 'Missing token (use /sse?token=... or Authorization: Bearer ...)');

    let share;
    try {
      share = await resolveShareFromToken(token);
    } catch (e) {
      return bearerUnauthorized(res, e instanceof Error ? e.message : 'Unauthorized');
    }

    const sessionId = randomUUID();
    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');
    res.flushHeaders?.();

    sessions.set(sessionId, { share, res, openaiApiKey: '', activePublicProjectId: '' });

    // Tell client where to POST messages for this session.
    // Per MCP spec, this is sent as an "endpoint" event.
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '')
      .split(',')[0]
      .trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = forwardedHost || req.get('host');
    const baseUrl = `${proto}://${host}`;
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
    return bearerUnauthorized(res, e instanceof Error ? e.message : 'Unauthorized');
  }
});

// Some clients optimistically try "streamable HTTP" by POSTing to the configured URL.
// Our MCP server is SSE-based, so return a clear error (Cursor will fall back to SSE).
app.post('/sse', async (_req, res) => {
  return res.status(405).json({ error: 'This MCP server uses SSE. Connect with GET /sse (not POST).' });
});

// Cursor OAuth dynamic client registration (not supported).
// If a client tries OAuth anyway, return JSON (not HTML) with guidance.
app.post('/register', async (_req, res) => {
  return res.status(404).json({
    error: 'OAuth is not supported by this MCP server. Configure it with /sse?token=... or Authorization: Bearer ...',
  });
});

app.post('/messages', async (req, res) => {
  const sessionId = String(req.query.sessionId || req.headers['mcp-session-id'] || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: 'Unknown session' });

  // Allow clients (e.g. Cursor) to attach a per-user OpenAI key as a header,
  // so users don't have to paste it into every tool call.
  const headerOpenAiKey = String(req.headers['x-openai-api-key'] || '').trim();
  if (headerOpenAiKey) sess.openaiApiKey = headerOpenAiKey;

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
            name: 'nexusmap_set_openai_key',
            description: 'Store your OpenAI API key for this MCP session (in-memory only).',
            inputSchema: {
              type: 'object',
              properties: {
                openaiApiKey: { type: 'string', description: 'OpenAI API key (sk-...)' },
              },
              required: ['openaiApiKey'],
            },
          },
          {
            name: 'nexusmap_list_projects',
            description: 'List projects available to this MCP token (account-scoped tokens only).',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'nexusmap_set_project',
            description: 'Select which project to query (account-scoped tokens only).',
            inputSchema: {
              type: 'object',
              properties: {
                publicProjectId: { type: 'string', description: 'Project public id (rag_...) from nexusmap_list_projects' },
              },
              required: ['publicProjectId'],
            },
          },
          {
            name: 'nexusmap_rag_query',
            description: 'Query the NexusMap project knowledge base (scoped by share token).',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                topK: { type: 'integer', minimum: 1, maximum: 50 },
                generateAnswer: { type: 'boolean' },
                openaiApiKey: { type: 'string', description: 'OpenAI API key (sk-...). Optional if the MCP server has OPENAI_API_KEY set.' },
                embeddingModel: { type: 'string' },
                chatModel: { type: 'string' },
              },
              required: ['query'],
            },
          },
        ],
      });
      return res.status(202).end();
    }

    if (method === 'tools/call') {
      const toolName = String(params?.name || '');
      const args = params?.arguments || {};
      if (toolName === 'nexusmap_set_openai_key') {
        const key = String(args?.openaiApiKey || '').trim();
        if (!key) throw new Error('Missing openaiApiKey');
        sess.openaiApiKey = key;
        sendResult({ ok: true });
        return res.status(202).end();
      }

      if (toolName === 'nexusmap_list_projects') {
        if (sess.share.scope !== 'account') throw new Error('list_projects requires an account-scoped token');
        const projects = await listProjectsForOwner(sess.share.ownerId);
        sendResult({ content: [{ type: 'text', text: JSON.stringify({ ok: true, projects }, null, 2) }] });
        return res.status(202).end();
      }

      if (toolName === 'nexusmap_set_project') {
        if (sess.share.scope !== 'account') throw new Error('set_project requires an account-scoped token');
        const pid = String(args?.publicProjectId || '').trim();
        if (!pid) throw new Error('Missing publicProjectId');
        // Resolve to folder id (kept server-side).
        const { data, error } = await supabase
          .from('rag_projects')
          .select('project_folder_id')
          .eq('owner_id', sess.share.ownerId)
          .eq('public_id', pid)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const folderId = data?.project_folder_id ? String(data.project_folder_id) : '';
        if (!folderId) throw new Error('Unknown project');
        sess.activePublicProjectId = pid;
        sendResult({ ok: true });
        return res.status(202).end();
      }

      if (toolName === 'nexusmap_rag_query') {
        let projectFolderId = '';
        if (sess.share.scope === 'account') {
          const pid = String(sess.activePublicProjectId || '').trim();
          if (pid) {
            const { data, error } = await supabase
              .from('rag_projects')
              .select('project_folder_id')
              .eq('owner_id', sess.share.ownerId)
              .eq('public_id', pid)
              .maybeSingle();
            if (error) throw new Error(error.message);
            projectFolderId = data?.project_folder_id ? String(data.project_folder_id) : '';
          }
        }
        const out = await ragQueryScoped(sess.share, args, { sessionOpenaiApiKey: sess.openaiApiKey, projectFolderId });
        const inline = String(args?.openaiApiKey || '').trim();
        if (inline) sess.openaiApiKey = inline;
        sendResult({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
        return res.status(202).end();
      }

      throw new Error('Unknown tool');
    }

    // Notifications / unknown methods: ignore
    return res.status(202).end();
  } catch (e) {
    sendError(e);
    return res.status(202).end();
  }
});

// Make unknown routes return JSON (avoid HTML "Cannot POST /...").
app.use((req, res) => {
  return res.status(404).json({ error: 'Not found' });
});

const port = Number(process.env.PORT || 3232);
app.listen(port, () => {
  console.log(`Hosted MCP server listening on :${port}`);
});

