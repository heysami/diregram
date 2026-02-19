## NexusMap RAG MCP Server

This is an optional MCP server that wraps your running NexusMap app’s RAG endpoints:

- `POST /api/rag/ingest`
- `POST /api/rag/query`

### Install

```bash
cd mcp-server-nexusmap-rag
npm install
```

### Run (local NexusMap)

Start NexusMap (`web`) on `http://localhost:3000`, then in another terminal:

```bash
cd mcp-server-nexusmap-rag
NEXUSMAP_BASE_URL=http://localhost:3000 npm start
```

### Optional auth (server-to-server)

If your NexusMap deployment sets `RAG_API_KEY`, set:

- `NEXUSMAP_RAG_API_KEY=<same value>`

### Tools exposed

- `nexusmap_rag_ingest`
- `nexusmap_rag_query`

Both tools optionally accept `openaiApiKey` so each user can bring their own key.

