## NexusMap

NexusMap is split into two Node.js apps:

- `web/`: Next.js frontend (UI, local-first storage, Yjs client)
- `collab-server/`: Hocuspocus websocket server (Yjs sync)

### Why it “works” even when you’re signed out

Right now:

- The **workspace + file list** is stored in your browser `localStorage`.
- The **actual document markdown** is snapshot-saved to your browser `localStorage`.
- The websocket collab server is **anonymous** and (currently) **non-persistent**.
- Supabase “Sign in” exists, but the app does **not** yet restrict editing based on auth.

So editing while signed out is expected: you’re mostly editing your own local browser state.

### Local dev

Start the websocket server:

```bash
cd collab-server
npm install
npm run dev
```

Start the web app:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

### Config

See `web/env.example` for environment keys (copy values into `.env.local`, created manually).

