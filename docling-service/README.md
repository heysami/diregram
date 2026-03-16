# Diregram Docling service

Internal document conversion service used by the Diregram web app.

## What it does

- Downloads an uploaded file from Supabase Storage (`docling-files` bucket)
- Runs Docling conversion
- Uploads the result back to the same bucket under `docling/<userId>/out/...`

PDF conversion runs in a conservative text-only mode:
- OCR is disabled
- picture extraction/classification/description is disabled
- embedded text is preferred when available

This prevents image-heavy PDFs from producing misleading extracted content. Image-only scanned PDFs may return little or no usable text.

## Environment

Set these env vars (server-only):

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `PORT` (default: `8686`)
- `DOCLING_MAX_INPUT_MB` (default: `25`; larger files return HTTP 413)

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PORT=8686 uvicorn app:app --host 127.0.0.1 --port 8686 --reload
```
