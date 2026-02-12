## collab-server

Websocket collaboration server for NexusMap using Hocuspocus/Yjs.

### Local dev

```bash
npm install
npm run dev
```

By default it listens on port `1234`.

### Production hosting notes

- Many hosts inject a `PORT` environment variable; this server respects it.
- Your web app should point at this server via `NEXT_PUBLIC_COLLAB_SERVER_URL` (use `wss://...` in production).

### Important limitations (current)

- **No authentication**: any client can connect to any document name.
- **No persistence**: documents are not durably stored; if the server restarts, state is lost.
  The frontend currently mitigates this by snapshot-saving markdown to the user’s browser `localStorage`.

