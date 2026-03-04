## Hosted Diregram RAG MCP Server

This package supports two transports:

- **SSE** (`src/index.js`) for URL-based MCP clients.
- **stdio** (`src/stdio.js`) for command-based MCP clients (including SSH workflows for Codex/Claude).

### What it does

- Implements a minimal **MCP-over-SSE** server.
- Implements a **stdio MCP server** with the same token/project scoping.
- Scopes access using a **share token** stored in Supabase (`public.rag_mcp_tokens`).
- Exposes one tool:
  - `diregram_rag_query` (requires the caller to provide their own `openaiApiKey`)

### Required environment variables (on the hosted MCP server)

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT` (optional; default 3232)
- Optional: `OPENAI_API_KEY` (if set, users don’t need to supply `openaiApiKey` per tool call)

### How users connect (Cursor)

You give them a URL like:

`https://mcp.yourdomain.com/sse?token=nm_mcp_...`

They add it in Cursor MCP settings as a server URL.

#### BYOK OpenAI key (no server-side OpenAI key)

Users can set their OpenAI key once in Cursor as a header (recommended) instead of pasting it into every tool call:

```json
{
  "mcpServers": {
    "diregram-rag": {
      "url": "https://mcp.yourdomain.com/sse?token=nm_mcp_...",
      "headers": {
        "x-openai-api-key": "sk-..."
      }
    }
  }
}
```

This key stays on the user's machine (Cursor config) and is sent to the MCP server on each request.

### SSH / stdio mode (for Codex, Claude, and other command-based clients)

Use the stdio entrypoint on your server:

```bash
npm run start:stdio -- --token nm_mcp_...
```

Or with token hash (for SSH forced-command setups):

```bash
npm run start:stdio -- --token-hash <sha256hex>
```

You can also pass token by env:

```bash
MCP_TOKEN=nm_mcp_... npm run start:stdio
```

```bash
MCP_TOKEN_HASH=<sha256hex> npm run start:stdio
```

Then configure your MCP client to launch the server over SSH. Generic command pattern:

```bash
ssh user@your-host "cd /path/to/mcp-server-nexusmap-rag-hosted && MCP_TOKEN=nm_mcp_... npm run start:stdio"
```

Required env on the remote host (same as SSE mode):

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `OPENAI_API_KEY`

Notes:
- Keep the token in env/secret storage; avoid putting it directly in shared config files.
- For account-scoped tokens, call `diregram_list_projects` then `diregram_set_project` before `diregram_rag_query`.
- For project-scoped tokens, `diregram_rag_query` works directly.
- `--token-hash` exists so SSH `authorized_keys` can run a forced command without storing raw MCP tokens.

### Host key sync (automated, no per-user manual edits)

Use the web app endpoint `GET /api/rag/mcp-ssh/authorized-keys` to refresh your SSH host’s `authorized_keys`.

This package includes:

```bash
npm run sync:ssh-keys -- https://app.yourdomain.com
```

Required env for the sync command:

- `MCP_SSH_SYNC_SECRET` (must match web app env)
- Optional: `AUTHORIZED_KEYS_FILE` (default `~/.ssh/authorized_keys`)

Recommended `MCP_SSH_FORCED_COMMAND` on the web app:

```bash
/usr/bin/env MCP_TOKEN_HASH=%TOKEN_HASH% node /opt/diregram/mcp-server-nexusmap-rag-hosted/src/stdio.js
```

### How you generate the token (admin workflow)

In the Diregram web app:
- open **Account**
- use **MCP SSH Setup** to generate account-scoped MCP setup (or project-scoped if selected)

By default this creates an **account-scoped** token (or project-scoped when a default project is selected). Users can add it once, then choose projects via MCP tools when account-scoped.

### Deploy notes

This server uses a long-lived SSE connection, so deploy it somewhere that supports:
- long-running HTTP connections
- Node.js

Examples: Fly.io, Render, Railway, a VM, or any container host.
