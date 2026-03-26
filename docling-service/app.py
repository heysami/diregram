import hashlib
import io
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client


def _require_env(name: str) -> str:
    v = (os.getenv(name) or "").strip()
    if not v:
        raise RuntimeError(f"Missing env var: {name}")
    return v


def _safe_filename(name: str) -> str:
    s = (name or "").strip()
    if not s:
        return "document"
    s = s.replace("\x00", "")
    s = re.sub(r"[^\w.\- ()\[\]]+", "_", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:160] or "document"


def _env_mb_limit(name: str, default_mb: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return max(1, default_mb) * 1024 * 1024
    try:
        mb = int(raw)
    except ValueError:
        return max(1, default_mb) * 1024 * 1024
    return max(1, mb) * 1024 * 1024


def _env_float(name: str, default_value: float, min_value: float, max_value: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return max(min_value, min(default_value, max_value))
    try:
        value = float(raw)
    except ValueError:
        return max(min_value, min(default_value, max_value))
    return max(min_value, min(value, max_value))


def _env_int(name: str, default_value: int, min_value: int, max_value: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return max(min_value, min(default_value, max_value))
    try:
        value = int(raw)
    except ValueError:
        return max(min_value, min(default_value, max_value))
    return max(min_value, min(value, max_value))


def _build_docling_converter(suffix: str, include_images: bool):
    # Import Docling lazily so the server can start with low memory.
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    if suffix.lower() != ".pdf":
        return DocumentConverter()

    pdf_mode = (os.getenv("DOCLING_PDF_CONVERTER_MODE") or "default").strip().lower()
    if pdf_mode not in {"conservative", "tuned"}:
        # Preserve the original PDF behavior unless the conservative path is explicitly requested.
        return DocumentConverter()

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False
    pipeline_options.do_picture_classification = False
    pipeline_options.do_picture_description = False
    pipeline_options.generate_page_images = include_images
    pipeline_options.generate_picture_images = include_images
    if include_images and hasattr(pipeline_options, "images_scale"):
        pipeline_options.images_scale = _env_float("DOCLING_IMAGE_SCALE", 1.5, 1.0, 4.0)

    if hasattr(pipeline_options, "generate_table_images"):
        pipeline_options.generate_table_images = include_images
    if hasattr(pipeline_options, "generate_parsed_pages"):
        pipeline_options.generate_parsed_pages = False
    if hasattr(pipeline_options, "force_backend_text"):
        pipeline_options.force_backend_text = True

    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=pipeline_options,
            )
        }
    )


def _guess_page_no_from_element(element) -> Optional[int]:
    prov = getattr(element, "prov", None)
    if not prov:
        return None
    try:
        first = prov[0]
    except Exception:
        return None
    page_no = getattr(first, "page_no", None)
    return int(page_no) if page_no is not None else None


def _image_to_png_bytes(image) -> tuple[bytes, Optional[int], Optional[int]]:
    width = int(getattr(image, "width", 0) or 0) or None
    height = int(getattr(image, "height", 0) or 0) or None
    pil_image = getattr(image, "pil_image", None) or image
    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    return buffer.getvalue(), width, height


def _upload_bytes(supabase, bucket_id: str, object_path: str, payload: bytes, content_type: str):
    supabase.storage.from_(bucket_id).upload(
        object_path,
        payload,
        file_options={"content-type": content_type, "x-upsert": "true"},
    )


def _aspect_ratio(width: Optional[int], height: Optional[int]) -> Optional[float]:
    if not width or not height or width <= 0 or height <= 0:
        return None
    return width / height


def _is_screen_like(width: Optional[int], height: Optional[int]) -> bool:
    ratio = _aspect_ratio(width, height)
    if ratio is None:
        return False
    area = int(width or 0) * int(height or 0)
    if area < 180_000:
        return False
    return (0.42 <= ratio <= 0.82) or (1.15 <= ratio <= 2.4)


def _docling_image_filter_config():
    return {
        "min_edge_px": _env_int("DOCLING_IMAGE_MIN_EDGE_PX", 220, 64, 4096),
        "min_area_px": _env_int("DOCLING_IMAGE_MIN_AREA_PX", 90_000, 16_384, 20_000_000),
        "banner_ratio": _env_float("DOCLING_IMAGE_BANNER_RATIO", 3.8, 2.0, 12.0),
        "banner_max_height_px": _env_int("DOCLING_IMAGE_BANNER_MAX_HEIGHT_PX", 720, 64, 4096),
        "logo_max_area_px": _env_int("DOCLING_IMAGE_LOGO_MAX_AREA_PX", 420_000, 16_384, 5_000_000),
        "logo_max_edge_px": _env_int("DOCLING_IMAGE_LOGO_MAX_EDGE_PX", 700, 64, 4096),
        "max_page_no": _env_int("DOCLING_IMAGE_MAX_PAGE_NO", 4, 1, 50),
        "duplicate_dims_limit_non_screen": _env_int("DOCLING_IMAGE_DUPLICATE_DIMS_LIMIT_NON_SCREEN", 2, 1, 20),
        "duplicate_dims_limit_screen": _env_int("DOCLING_IMAGE_DUPLICATE_DIMS_LIMIT_SCREEN", 8, 1, 50),
    }


def _should_keep_docling_image(
    *,
    kind: str,
    page_no: Optional[int],
    width: Optional[int],
    height: Optional[int],
    image_bytes: bytes,
    seen_hashes: set[str],
    seen_dimension_counts: dict[tuple[str, int, int], int],
    config: dict[str, int | float],
) -> tuple[bool, str]:
    width = int(width or 0) or None
    height = int(height or 0) or None
    area = (width or 0) * (height or 0)
    shortest_edge = min(width or 0, height or 0)
    longest_edge = max(width or 0, height or 0)
    ratio = _aspect_ratio(width, height)
    screen_like = _is_screen_like(width, height)
    image_hash = hashlib.sha256(image_bytes).hexdigest()[:24]

    if image_hash in seen_hashes:
        return False, "duplicate_hash"

    if kind == "page" and page_no and page_no > int(config["max_page_no"]):
        return False, "page_after_limit"

    if shortest_edge and shortest_edge < int(config["min_edge_px"]):
        return False, "too_small"

    if area and area < int(config["min_area_px"]):
        return False, "too_small"

    if ratio and ratio >= float(config["banner_ratio"]) and (height or 0) <= int(config["banner_max_height_px"]):
        return False, "banner_like"

    if kind != "page" and ratio and 0.75 <= ratio <= 1.33 and area and area <= int(config["logo_max_area_px"]) and longest_edge <= int(config["logo_max_edge_px"]):
        return False, "logo_like"

    if width and height:
        dims_key = (kind, width, height)
        dims_limit = int(config["duplicate_dims_limit_screen"] if screen_like else config["duplicate_dims_limit_non_screen"])
        if seen_dimension_counts.get(dims_key, 0) >= dims_limit:
            return False, "duplicate_dimensions"

    return True, image_hash


def _export_docling_images(*, conv_res, supabase, bucket_id: str, user_id: str, job_id: str, stem: str, input_object_path: str):
    from docling_core.types.doc import PictureItem, TableItem

    assets = []
    skipped_reason_counts = {}
    assets_prefix = f"docling/{user_id}/out/{job_id}/assets"
    filter_config = _docling_image_filter_config()
    seen_hashes = set()
    seen_dimension_counts = {}

    def maybe_store_image(*, kind: str, index: int, page_no: Optional[int], image, label: str):
        image_bytes, width, height = _image_to_png_bytes(image)
        keep, decision = _should_keep_docling_image(
            kind=kind,
            page_no=page_no,
            width=width,
            height=height,
            image_bytes=image_bytes,
            seen_hashes=seen_hashes,
            seen_dimension_counts=seen_dimension_counts,
            config=filter_config,
        )
        if not keep:
            skipped_reason_counts[decision] = int(skipped_reason_counts.get(decision, 0)) + 1
            return

        object_path = f"{assets_prefix}/{kind}s/{stem}-{kind}-{index:03d}.png"
        if kind == "page":
            object_path = f"{assets_prefix}/pages/{stem}-page-{index:03d}.png"
        _upload_bytes(supabase, bucket_id, object_path, image_bytes, "image/png")

        seen_hashes.add(str(decision))
        if width and height:
            dims_key = (kind, int(width), int(height))
            seen_dimension_counts[dims_key] = int(seen_dimension_counts.get(dims_key, 0)) + 1

        assets.append(
            {
                "kind": kind,
                "objectPath": object_path,
                "pageNo": page_no,
                "index": index,
                "width": width,
                "height": height,
                "bytes": len(image_bytes),
                "label": label,
            }
        )

    pages = getattr(conv_res.document, "pages", {}) or {}
    for page_key in sorted(pages.keys()):
        page = pages[page_key]
        page_no = int(getattr(page, "page_no", page_key) or page_key)
        page_image = getattr(page, "image", None)
        if page_image is None:
            continue
        maybe_store_image(kind="page", index=page_no, page_no=page_no, image=page_image, label=f"Page {page_no}")

    picture_counter = 0
    table_counter = 0
    for element, _level in conv_res.document.iterate_items():
        kind = None
        index = 0
        if isinstance(element, PictureItem):
            picture_counter += 1
            kind = "picture"
            index = picture_counter
        elif isinstance(element, TableItem):
            table_counter += 1
            kind = "table"
            index = table_counter
        else:
            continue

        try:
            image = element.get_image(conv_res.document)
        except Exception:
            image = None
        if image is None:
            continue
        page_no = _guess_page_no_from_element(element)
        maybe_store_image(kind=kind, index=index, page_no=page_no, image=image, label=f"{kind.title()} {index}")

    manifest = {
        "version": 1,
        "inputObjectPath": input_object_path,
        "assetsPrefix": assets_prefix,
        "images": assets,
        "filtering": {
            "keptCount": len(assets),
            "skippedCount": sum(int(v) for v in skipped_reason_counts.values()),
            "skippedReasonCounts": skipped_reason_counts,
            "maxPageNo": int(filter_config["max_page_no"]),
        },
    }
    return assets, manifest


class ConvertRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    bucketId: str = Field(default="docling-files", min_length=1)
    objectPath: str = Field(..., min_length=1)
    originalFilename: Optional[str] = None
    jobId: Optional[str] = None
    outputFormat: Literal["markdown", "json"] = "markdown"
    includeImages: bool = False


class ConvertResponse(BaseModel):
    ok: bool = True
    userId: str
    bucketId: str
    inputObjectPath: str
    outputObjectPath: str
    outputFormat: Literal["markdown", "json"]
    imageManifestObjectPath: Optional[str] = None
    imageAssetCount: int = 0


ConvertJobStatus = Literal["queued", "processing", "done", "error"]


class ConvertJobStatusResponse(BaseModel):
    ok: bool = True
    jobId: str
    status: ConvertJobStatus
    result: Optional[ConvertResponse] = None
    detail: Optional[str] = None
    statusCode: Optional[int] = None


app = FastAPI(title="Diregram Docling Service")
_JOB_STATUS_BUCKET = (os.getenv("DOCLING_JOB_STATUS_BUCKET") or "docling-files").strip() or "docling-files"
_JOB_STATUS_PREFIX = "_internal/docling-jobs"


def _resolve_service_config():
    supabase_url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    supabase_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) env var")
    if not supabase_key:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY env var")
    return supabase_url, supabase_key


def _create_supabase_client():
    supabase_url, supabase_key = _resolve_service_config()
    return create_client(supabase_url, supabase_key)


def _normalize_request(req: ConvertRequest):
    user_id = req.userId.strip()
    bucket_id = req.bucketId.strip()
    object_path = req.objectPath.strip().lstrip("/")
    expected_prefix = f"docling/{user_id}/"
    if not object_path.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail=f"objectPath must start with {expected_prefix!r}")
    return user_id, bucket_id, object_path


def _with_job_id(req: ConvertRequest, job_id: str) -> ConvertRequest:
    if hasattr(req, "model_copy"):
        return req.model_copy(update={"jobId": job_id})
    return req.copy(update={"jobId": job_id})


def _job_status_object_path(job_id: str) -> str:
    safe_job_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", (job_id or "").strip()) or uuid4().hex
    return f"{_JOB_STATUS_PREFIX}/{safe_job_id}.json"


def _is_storage_not_found_error(error: Exception) -> bool:
    message = str(error or "").lower()
    return "not found" in message or "status code 404" in message or "404" in message


def _coerce_job_state(data: object) -> Optional[dict]:
    if isinstance(data, dict):
        return data
    if isinstance(data, (bytes, bytearray)):
        raw = bytes(data).decode("utf-8", errors="ignore").strip()
    else:
        raw = str(data or "").strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _model_to_dict(model):
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    return dict(model)


def _read_convert_job_state(supabase, job_id: str) -> Optional[dict]:
    try:
        data = supabase.storage.from_(_JOB_STATUS_BUCKET).download(_job_status_object_path(job_id))
    except Exception as exc:
        if _is_storage_not_found_error(exc):
            return None
        raise HTTPException(status_code=500, detail=f"Failed to load convert job status: {exc}")
    return _coerce_job_state(data)


def _load_convert_job(supabase, job_id: str) -> Optional[ConvertJobStatusResponse]:
    state = _read_convert_job_state(supabase, job_id)
    if not state:
        return None

    status = str(state.get("status") or "queued")
    if status not in {"queued", "processing", "done", "error"}:
        status = "error"
    result = state.get("result")
    parsed_result = ConvertResponse(**result) if isinstance(result, dict) else None
    return ConvertJobStatusResponse(
        jobId=job_id,
        status=status,  # type: ignore[arg-type]
        result=parsed_result,
        detail=str(state.get("detail") or "").strip() or None,
        statusCode=int(state["statusCode"]) if state.get("statusCode") is not None else None,
    )


def _write_convert_job(
    supabase,
    job_id: str,
    *,
    status: ConvertJobStatus,
    result: Optional[ConvertResponse] = None,
    detail: Optional[str] = None,
    status_code: Optional[int] = None,
):
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_state = _read_convert_job_state(supabase, job_id) or {}
    payload = {
        "ok": True,
        "jobId": job_id,
        "status": status,
        "result": _model_to_dict(result) if result is not None else None,
        "detail": str(detail).strip() if detail else None,
        "statusCode": int(status_code) if status_code is not None else None,
        "createdAt": str(existing_state.get("createdAt") or existing_state.get("updatedAt") or now_iso).strip() or now_iso,
        "updatedAt": now_iso,
    }

    try:
        supabase.storage.from_(_JOB_STATUS_BUCKET).upload(
            _job_status_object_path(job_id),
            json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            file_options={"content-type": "application/json; charset=utf-8", "x-upsert": "true"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update convert job status: {exc}")

    return ConvertJobStatusResponse(
        jobId=job_id,
        status=status,
        result=result,
        detail=str(detail).strip() if detail else None,
        statusCode=int(status_code) if status_code is not None else None,
    )


@app.get("/health")
def health():
    return {"ok": True}


def _convert_document(req: ConvertRequest) -> ConvertResponse:
    supabase_url, supabase_key = _resolve_service_config()
    user_id, bucket_id, object_path = _normalize_request(req)
    supabase = create_client(supabase_url, supabase_key)

    try:
        data = supabase.storage.from_(bucket_id).download(object_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Failed to download input: {e}")

    max_input_bytes = _env_mb_limit("DOCLING_MAX_INPUT_MB", 25)
    input_bytes = data if isinstance(data, (bytes, bytearray)) else bytes(data)
    if len(input_bytes) > max_input_bytes:
        max_mb = round(max_input_bytes / (1024 * 1024), 2)
        got_mb = round(len(input_bytes) / (1024 * 1024), 2)
        raise HTTPException(
            status_code=413,
            detail=f"Input file is too large ({got_mb} MB). Max allowed is {max_mb} MB.",
        )

    job_id = (req.jobId or "").strip() or uuid4().hex
    original_name = _safe_filename(req.originalFilename or Path(object_path).name)
    stem = Path(original_name).stem or "document"
    out_ext = "md" if req.outputFormat == "markdown" else "json"
    output_object_path = f"docling/{user_id}/out/{job_id}/{_safe_filename(stem)}.{out_ext}"
    image_manifest_object_path = None
    image_asset_count = 0

    try:
        suffix = Path(original_name).suffix or Path(object_path).suffix or ""
        with tempfile.TemporaryDirectory(prefix="docling_") as td:
            in_path = Path(td) / f"input{suffix}"
            in_path.write_bytes(input_bytes)

            converter = _build_docling_converter(suffix, bool(req.includeImages))
            result = converter.convert(str(in_path))

            if req.includeImages:
                image_assets, image_manifest = _export_docling_images(
                    conv_res=result,
                    supabase=supabase,
                    bucket_id=bucket_id,
                    user_id=user_id,
                    job_id=job_id,
                    stem=_safe_filename(stem),
                    input_object_path=object_path,
                )
                image_asset_count = len(image_assets)
                image_manifest_object_path = f"docling/{user_id}/out/{job_id}/{_safe_filename(stem)}-images.json"
                image_manifest["outputObjectPath"] = output_object_path
                _upload_bytes(
                    supabase,
                    bucket_id,
                    image_manifest_object_path,
                    json.dumps(image_manifest, ensure_ascii=False).encode("utf-8"),
                    "application/json; charset=utf-8",
                )

            if req.outputFormat == "markdown":
                out_text = result.document.export_to_markdown()
                out_bytes = out_text.encode("utf-8")
                content_type = "text/markdown; charset=utf-8"
            else:
                out_dict = result.document.export_to_dict()
                out_bytes = json.dumps(out_dict, ensure_ascii=False).encode("utf-8")
                content_type = "application/json; charset=utf-8"

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {e}")

    try:
        supabase.storage.from_(bucket_id).upload(
            output_object_path,
            out_bytes,
            file_options={"content-type": content_type, "x-upsert": "true"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload output: {e}")

    return ConvertResponse(
        userId=user_id,
        bucketId=bucket_id,
        inputObjectPath=object_path,
        outputObjectPath=output_object_path,
        outputFormat=req.outputFormat,
        imageManifestObjectPath=image_manifest_object_path,
        imageAssetCount=image_asset_count,
    )


def _run_convert_job(job_id: str, req: ConvertRequest):
    supabase = _create_supabase_client()
    _write_convert_job(supabase, job_id, status="processing")
    try:
        result = _convert_document(req)
    except HTTPException as exc:
        detail = str(exc.detail).strip() or f"Failed (HTTP {exc.status_code})"
        _write_convert_job(supabase, job_id, status="error", detail=detail, status_code=exc.status_code)
        return
    except Exception as exc:
        _write_convert_job(supabase, job_id, status="error", detail=f"Conversion failed: {exc}", status_code=500)
        return

    _write_convert_job(supabase, job_id, status="done", result=result)


@app.post("/convert", response_model=ConvertResponse)
def convert(req: ConvertRequest):
    return _convert_document(req)


@app.post("/convert/jobs", response_model=ConvertJobStatusResponse, status_code=202)
def enqueue_convert(req: ConvertRequest, background_tasks: BackgroundTasks):
    supabase = _create_supabase_client()
    _normalize_request(req)

    job_id = (req.jobId or "").strip() or uuid4().hex
    existing = _load_convert_job(supabase, job_id)
    if existing:
        return existing

    job_req = _with_job_id(req, job_id)
    _write_convert_job(supabase, job_id, status="queued")
    background_tasks.add_task(_run_convert_job, job_id, job_req)
    return ConvertJobStatusResponse(jobId=job_id, status="queued")


@app.get("/convert/jobs/{job_id}", response_model=ConvertJobStatusResponse)
def get_convert_job(job_id: str):
    supabase = _create_supabase_client()
    status = _load_convert_job(supabase, job_id.strip())
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status
