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

### Making it “real” (recommended next steps)

- **Deploy `web`**: easiest is Vercel (Next.js native), or any Node hosting that can run `next start`.
- **Deploy `collab-server`**: host it somewhere that supports websockets (Render/Fly/Railway/etc.). Set `NEXT_PUBLIC_COLLAB_SERVER_URL` in the `web` deployment.
- **Add persistence**: the collab server currently does not persist Yjs docs. For “real” documents you’ll want durable storage (e.g. Postgres/Redis/S3) and load/save hooks.
- **Enforce access**: once Supabase is configured, gate `/editor` and enforce per-file permissions server-side (Supabase RLS policies in `web/schema.sql` are a starting point).

