## Diregram RAG MCP Server

This is an optional MCP server that wraps your running Diregram app’s RAG endpoints:

- `POST /api/rag/ingest`
- `POST /api/rag/query`

### Install

```bash
npm install
```

### Run (local Diregram)

Start Diregram (`web`) on `http://localhost:3000`, then in another terminal (from this folder):

```bash
DIREGRAM_BASE_URL=http://localhost:3000 npm start
```

### Optional auth (server-to-server)

If your Diregram deployment sets `RAG_API_KEY`, set:

- `DIREGRAM_RAG_API_KEY=<same value>`

### Tools exposed

- `diregram_rag_ingest`
- `diregram_rag_query`

Both tools optionally accept `openaiApiKey` so each user can bring their own key.

