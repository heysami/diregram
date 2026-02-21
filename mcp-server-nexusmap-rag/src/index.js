import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from '@modelcontextprotocol/sdk/shared/zod.js';

function env(name, fallback = '') {
  return String(process.env[name] || fallback);
}

const DEFAULT_BASE_URL = env('DIREGRAM_BASE_URL', 'http://localhost:3000');
const DEFAULT_RAG_API_KEY = env('DIREGRAM_RAG_API_KEY', '');

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error ? String(json.error) : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

const server = new Server(
  {
    name: 'diregram-rag',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'diregram_rag_ingest',
        description: 'Build/update Diregram project knowledge base (vectors + KG).',
        inputSchema: z
          .object({
            baseUrl: z.string().optional().describe('Diregram base URL (default: env DIREGRAM_BASE_URL or http://localhost:3000)'),
            projectFolderId: z.string().describe('Supabase folders.id (project root folder UUID)'),
            ragApiKey: z.string().optional().describe('If set, sent as Authorization Bearer to /api/rag/ingest'),
            openaiApiKey: z
              .string()
              .optional()
              .describe('Optional: user-provided OpenAI key (sent as x-openai-api-key; otherwise server env OPENAI_API_KEY is used)'),
          })
          .strict(),
      },
      {
        name: 'diregram_rag_query',
        description: 'Query Diregram RAG and optionally generate an answer.',
        inputSchema: z
          .object({
            baseUrl: z.string().optional().describe('Diregram base URL (default: env DIREGRAM_BASE_URL or http://localhost:3000)'),
            query: z.string().describe('User question'),
            projectFolderId: z.string().optional().describe('Optional: limit search to a project folder UUID'),
            ownerId: z.string().optional().describe('Optional: owner UUID (recommended for server-to-server)'),
            topK: z.number().int().min(1).max(50).optional().describe('Number of chunks to retrieve (default 12)'),
            generateAnswer: z.boolean().optional().describe('Generate an answer using retrieved context (default true)'),
            ragApiKey: z.string().optional().describe('If set, sent as Authorization Bearer to /api/rag/query'),
            openaiApiKey: z
              .string()
              .optional()
              .describe('Optional: user-provided OpenAI key (sent as x-openai-api-key; otherwise server env OPENAI_API_KEY is used)'),
          })
          .strict(),
      },
    ],
  };
});

server.setRequestHandler('tools/call', async (req) => {
  const name = req.params?.name;
  const args = req.params?.arguments || {};

  if (name === 'diregram_rag_ingest') {
    const baseUrl = String(args.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const projectFolderId = String(args.projectFolderId || '').trim();
    const ragApiKey = String(args.ragApiKey || DEFAULT_RAG_API_KEY).trim();
    const openaiApiKey = String(args.openaiApiKey || '').trim();
    if (!projectFolderId) throw new Error('projectFolderId is required');

    const headers = {};
    if (ragApiKey) headers.authorization = `Bearer ${ragApiKey}`;
    if (openaiApiKey) headers['x-openai-api-key'] = openaiApiKey;

    const out = await postJson(`${baseUrl}/api/rag/ingest`, { projectFolderId }, headers);
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }

  if (name === 'diregram_rag_query') {
    const baseUrl = String(args.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const query = String(args.query || '').trim();
    const projectFolderId = args.projectFolderId ? String(args.projectFolderId).trim() : null;
    const ownerId = args.ownerId ? String(args.ownerId).trim() : null;
    const topK = typeof args.topK === 'number' ? args.topK : undefined;
    const generateAnswer = typeof args.generateAnswer === 'boolean' ? args.generateAnswer : undefined;
    const ragApiKey = String(args.ragApiKey || DEFAULT_RAG_API_KEY).trim();
    const openaiApiKey = String(args.openaiApiKey || '').trim();
    if (!query) throw new Error('query is required');

    const headers = {};
    if (ragApiKey) headers.authorization = `Bearer ${ragApiKey}`;
    if (openaiApiKey) headers['x-openai-api-key'] = openaiApiKey;

    const out = await postJson(
      `${baseUrl}/api/rag/query`,
      { query, projectFolderId, ownerId, topK, generateAnswer },
      headers,
    );
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

