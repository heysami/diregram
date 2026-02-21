# Diregram Docling service

Internal document conversion service used by the Diregram web app.

## What it does

- Downloads an uploaded file from Supabase Storage (`docling-files` bucket)
- Runs Docling conversion
- Uploads the result back to the same bucket under `docling/<userId>/out/...`

## Environment

Set these env vars (server-only):

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `PORT` (default: `8686`)

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PORT=8686 uvicorn app:app --host 127.0.0.1 --port 8686 --reload
```

