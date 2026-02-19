## NexusMap (web)

This is the Next.js frontend.

### What is “saving” right now?

Today the app is effectively **local-first**:

- **Files/folders list**: stored in your browser `localStorage` via `web/lib/local-file-store.ts`.
- **Document content**: snapshot-saved to your browser `localStorage` via `web/lib/local-doc-snapshots.ts`.
- **Realtime multiplayer indicator**: uses Yjs + Hocuspocus over websockets (`web/hooks/use-yjs.ts`).
- **Auth button**: Supabase auth UI is present, but **auth is not enforced** by the app yet.

This is why you can “do stuff” while signed out: nothing blocks edits, and the data you’re changing is primarily in your own browser storage.

### Running locally (two processes)

1) Start the collaboration websocket server:

```bash
cd ../collab-server
npm install
npm run dev
```

2) Start the Next.js web app:

```bash
cd ../web
npm install
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

See `web/env.example` for the keys you can set (create `.env.local` manually).

- **`NEXT_PUBLIC_COLLAB_SERVER_URL`**: websocket URL for the collab server (e.g. `ws://localhost:1234` locally; `wss://...` in prod)
- **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`**: enables the login/account UI via Supabase

### RAG / Knowledge Base (Supabase + pgvector)

This repo already exports a **semantic KG + “chunks to embed”** from a project. To turn that into a queryable RAG knowledge base:

- **1) Run the database migration**: in your Supabase project SQL editor, run `web/rag_migration.sql`.
- **2) Set server env vars** (see `web/env.example`):
  - `SUPABASE_SERVICE_ROLE_KEY`
- **3) Add an OpenAI key**:
  - Recommended: in the app, go to **Account** and paste your OpenAI API key (stored only in your browser).
  - Optional fallback: set `OPENAI_API_KEY` in env so the server can run without per-user keys.
- **3) In the app**: open a project → **Project → Build knowledge base (RAG)**.
- **4) Query API**:
  - `POST /api/rag/query` with JSON `{ "query": "..." , "projectFolderId": "<uuid>" }`

### Hosted MCP (so users don’t run anything locally)

If you deploy the hosted MCP server (`mcp-server-nexusmap-rag-hosted/`), you can give users a single URL they can add in Cursor.

Setup:

- Deploy the MCP server and set `NEXT_PUBLIC_MCP_SERVER_URL` in the `web` app (e.g. `https://mcp.yourdomain.com`).
- In the app: open a project → **Project → Copy MCP server URL**
- Give that copied URL to users (it includes an opaque token).

Users will still need an embeddings credential to run RAG queries. If you don't want a server-side OpenAI key,
have users set their own OpenAI key in their MCP client (e.g. Cursor) as a header `x-openai-api-key: sk-...`.

### Making it “real” (recommended next steps)

- **Deploy `web`**: easiest is Vercel (Next.js native), or any Node hosting that can run `next start`.
- **Deploy `collab-server`**: host it somewhere that supports websockets (Render/Fly/Railway/etc.). Set `NEXT_PUBLIC_COLLAB_SERVER_URL` in the `web` deployment.
- **Add persistence**: the collab server currently does not persist Yjs docs. For “real” documents you’ll want durable storage (e.g. Postgres/Redis/S3) and load/save hooks.
- **Enforce access**: once Supabase is configured, gate `/editor` and enforce per-file permissions server-side (Supabase RLS policies in `web/schema.sql` are a starting point).

