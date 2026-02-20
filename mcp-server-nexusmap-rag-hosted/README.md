## Hosted NexusMap RAG MCP Server

This package is for **you to deploy once** (online). After that, users can add it in Cursor using an **SSE URL** — they do **not** run anything locally.

### What it does

- Implements a minimal **MCP-over-SSE** server.
- Scopes access using a **share token** stored in Supabase (`public.rag_mcp_shares`).
- Exposes one tool:
  - `nexusmap_rag_query` (requires the caller to provide their own `openaiApiKey`)

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
    "nexusmap-rag": {
      "url": "https://mcp.yourdomain.com/sse?token=nm_mcp_...",
      "headers": {
        "x-openai-api-key": "sk-..."
      }
    }
  }
}
```

This key stays on the user's machine (Cursor config) and is sent to the MCP server on each request.

### How you generate the token (admin workflow)

In the NexusMap web app:
- open any project
- **Project → Copy MCP URL (account)**

This creates an **account-scoped** token. Users add it once, then choose projects via MCP tools.

### Deploy notes

This server uses a long-lived SSE connection, so deploy it somewhere that supports:
- long-running HTTP connections
- Node.js

Examples: Fly.io, Render, Railway, a VM, or any container host.

