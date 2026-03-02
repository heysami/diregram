import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, InitializeRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { z } from 'zod';

function sha256Hex(s) {
  return createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function env(name, fallback = '') {
  return String(process.env[name] || fallback);
}

function mask(input, keepStart = 6, keepEnd = 4) {
  const s = String(input || '');
  if (!s) return '';
  if (s.length <= keepStart + keepEnd + 3) return s;
  return `${s.slice(0, keepStart)}...${s.slice(-keepEnd)}`;
}

function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).trim();
    const next = String(argv[i + 1] || '');
    if (!key) continue;
    if (!next || next.startsWith('--')) out[key] = 'true';
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const cli = parseCliArgs(process.argv.slice(2));
if (cli.help === 'true' || cli.h === 'true') {
  console.error(
    [
      'Diregram MCP stdio (SSH-friendly)',
      '',
      'Usage:',
      '  node src/stdio.js --token <nm_mcp_...>',
      '  node src/stdio.js --token-hash <sha256hex>',
      '',
      'Or set env:',
      '  MCP_TOKEN=<nm_mcp_...>',
      '  MCP_TOKEN_HASH=<sha256hex>',
      '',
      'Required env:',
      '  SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)',
      '  SUPABASE_SERVICE_ROLE_KEY',
      '',
      'Optional env:',
      '  OPENAI_API_KEY',
    ].join('\n'),
  );
  process.exit(0);
}

const SUPABASE_URL = env('SUPABASE_URL', env('NEXT_PUBLIC_SUPABASE_URL'));
const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = env('OPENAI_API_KEY', '');
const MCP_TOKEN = String(cli.token || env('MCP_TOKEN', '')).trim();
const MCP_TOKEN_HASH = String(cli['token-hash'] || env('MCP_TOKEN_HASH', '')).trim();

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
if (!MCP_TOKEN && !MCP_TOKEN_HASH) throw new Error('Missing MCP token. Pass --token <nm_mcp_...>, --token-hash <sha256>, or set MCP_TOKEN/MCP_TOKEN_HASH.');

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

async function resolveShareFromTokenOrHash(input) {
  const tokenHash = input.tokenHash ? String(input.tokenHash) : sha256Hex(String(input.token || ''));
  const { data, error } = await supabase
    .from('rag_mcp_tokens')
    .select('owner_id,scope,project_folder_id,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const hint = mask(tokenHash, 10, 6);
    throw new Error(`Invalid token (supabaseUrl=${SUPABASE_URL}, tokenHash=${hint})`);
  }
  if (data.revoked_at) throw new Error('Token revoked');
  const scope = String(data.scope || '');
  if (scope !== 'account' && scope !== 'project') throw new Error('Invalid token scope');
  const projectFolderId = data.project_folder_id ? String(data.project_folder_id) : null;
  if (scope === 'project' && !projectFolderId) throw new Error('Project token missing project');
  return { ownerId: data.owner_id, scope, projectFolderId };
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

const QueryArgs = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).optional(),
  generateAnswer: z.boolean().optional(),
  openaiApiKey: z.string().min(1).optional(),
  embeddingModel: z.string().min(1).optional(),
  chatModel: z.string().min(1).optional(),
});

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
    throw new Error('OpenAI key required: pass openaiApiKey (sk-...) or call diregram_set_openai_key once per session.');
  }

  const embedding = (await embedOpenAI({ apiKey: openaiApiKey, model: embeddingModel, input: [a.query] }))[0];
  const projectId = share.projectFolderId ? share.projectFolderId : String(opts?.projectFolderId || '').trim();
  if (!projectId) throw new Error('Missing project: use diregram_list_projects and diregram_set_project first, or use a project-scoped MCP token.');

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

async function boot() {
  const share = await resolveShareFromTokenOrHash({ token: MCP_TOKEN, tokenHash: MCP_TOKEN_HASH });
  const state = { openaiApiKey: '', activePublicProjectId: '' };

  const server = new Server(
    {
      name: 'diregram-rag-hosted-stdio',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // MCP lifecycle: Cursor will call initialize before listing tools.
  // With SDK v1, handlers should be registered using the request schemas (not string method names).
  server.setRequestHandler(InitializeRequestSchema, async (req) => {
    return {
      protocolVersion: String(req.params?.protocolVersion || '2024-11-05'),
      serverInfo: { name: 'diregram-rag-hosted-stdio', version: '0.1.0' },
      capabilities: { tools: {} },
    };
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'diregram_set_openai_key',
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
          name: 'diregram_list_projects',
          description: 'List projects available to this MCP token (account-scoped tokens only).',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'diregram_set_project',
          description: 'Select which project to query (account-scoped tokens only).',
          inputSchema: {
            type: 'object',
            properties: {
              publicProjectId: { type: 'string', description: 'Project public id (rag_...) from diregram_list_projects' },
            },
            required: ['publicProjectId'],
          },
        },
        {
          name: 'diregram_rag_query',
          description: 'Query the Diregram project knowledge base (scoped by share token).',
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
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const toolName = String(req.params?.name || '');
    const args = req.params?.arguments || {};

    if (toolName === 'diregram_set_openai_key') {
      const key = String(args?.openaiApiKey || '').trim();
      if (!key) throw new Error('Missing openaiApiKey');
      state.openaiApiKey = key;
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }, null, 2) }] };
    }

    if (toolName === 'diregram_list_projects') {
      if (share.scope !== 'account') throw new Error('list_projects requires an account-scoped token');
      const projects = await listProjectsForOwner(share.ownerId);
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, projects }, null, 2) }] };
    }

    if (toolName === 'diregram_set_project') {
      if (share.scope !== 'account') throw new Error('set_project requires an account-scoped token');
      const pid = String(args?.publicProjectId || '').trim();
      if (!pid) throw new Error('Missing publicProjectId');
      const { data, error } = await supabase
        .from('rag_projects')
        .select('project_folder_id')
        .eq('owner_id', share.ownerId)
        .eq('public_id', pid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const folderId = data?.project_folder_id ? String(data.project_folder_id) : '';
      if (!folderId) throw new Error('Unknown project');
      state.activePublicProjectId = pid;
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, publicProjectId: pid }, null, 2) }] };
    }

    if (toolName === 'diregram_rag_query') {
      let projectFolderId = '';
      if (share.scope === 'account') {
        const pid = String(state.activePublicProjectId || '').trim();
        if (pid) {
          const { data, error } = await supabase
            .from('rag_projects')
            .select('project_folder_id')
            .eq('owner_id', share.ownerId)
            .eq('public_id', pid)
            .maybeSingle();
          if (error) throw new Error(error.message);
          projectFolderId = data?.project_folder_id ? String(data.project_folder_id) : '';
        }
      }
      const out = await ragQueryScoped(share, args, { sessionOpenaiApiKey: state.openaiApiKey, projectFolderId });
      const inline = String(args?.openaiApiKey || '').trim();
      if (inline) state.openaiApiKey = inline;
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    }

    throw new Error('Unknown tool');
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

boot().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err || 'Failed to start');
  console.error(`Failed to start stdio MCP server: ${msg}`);
  process.exit(1);
});
