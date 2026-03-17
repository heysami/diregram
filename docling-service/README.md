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

When `includeImages=true` is sent to `/convert`, the service additionally:
- exports page/picture/table images as separate `.png` files in Storage
- writes an image manifest JSON alongside the markdown output
- keeps markdown itself text-only (no inline binary payloads)
- filters low-value image assets before upload so storage does not fill with noise

The image filter rejects common low-value assets such as:
- very small images
- extremely wide banner-like images
- near-square logo-like images under a size threshold
- repeated duplicate images by exact hash
- repeated non-screen-like images with the same dimensions
- full-page renders after the first few pages

The filter prefers assets that look like usable screens or embedded product UI, while still allowing larger non-logo figures through.

## Environment

Set these env vars (server-only):

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `PORT` (default: `8686`)
- `DOCLING_MAX_INPUT_MB` (default: `25`; larger files return HTTP 413)
- `DOCLING_IMAGE_SCALE` (default: `1.5`)
- `DOCLING_IMAGE_MIN_EDGE_PX` (default: `220`)
- `DOCLING_IMAGE_MIN_AREA_PX` (default: `90000`)
- `DOCLING_IMAGE_BANNER_RATIO` (default: `3.8`)
- `DOCLING_IMAGE_BANNER_MAX_HEIGHT_PX` (default: `720`)
- `DOCLING_IMAGE_LOGO_MAX_AREA_PX` (default: `420000`)
- `DOCLING_IMAGE_LOGO_MAX_EDGE_PX` (default: `700`)
- `DOCLING_IMAGE_MAX_PAGE_NO` (default: `4`)
- `DOCLING_IMAGE_DUPLICATE_DIMS_LIMIT_NON_SCREEN` (default: `2`)
- `DOCLING_IMAGE_DUPLICATE_DIMS_LIMIT_SCREEN` (default: `8`)

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PORT=8686 uvicorn app:app --host 127.0.0.1 --port 8686 --reload
```
