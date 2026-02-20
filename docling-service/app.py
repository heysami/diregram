import json
import os
import re
import tempfile
from pathlib import Path
from typing import Literal, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client

from docling.document_converter import DocumentConverter


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


class ConvertRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    bucketId: str = Field(default="docling-files", min_length=1)
    objectPath: str = Field(..., min_length=1)
    originalFilename: Optional[str] = None
    jobId: Optional[str] = None
    outputFormat: Literal["markdown", "json"] = "markdown"


class ConvertResponse(BaseModel):
    ok: bool = True
    userId: str
    bucketId: str
    inputObjectPath: str
    outputObjectPath: str
    outputFormat: Literal["markdown", "json"]


app = FastAPI(title="NexusMap Docling Service")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/convert", response_model=ConvertResponse)
def convert(req: ConvertRequest):
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    supabase_url = supabase_url.strip()
    supabase_key = supabase_key.strip()
    if not supabase_url:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) env var")
    if not supabase_key:
        raise HTTPException(status_code=500, detail="Missing SUPABASE_SERVICE_ROLE_KEY env var")

    user_id = req.userId.strip()
    bucket_id = req.bucketId.strip()
    object_path = req.objectPath.strip().lstrip("/")

    # Safety: service-role bypasses Storage RLS; enforce the path is scoped to the user.
    expected_prefix = f"docling/{user_id}/"
    if not object_path.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail=f"objectPath must start with {expected_prefix!r}")

    supabase = create_client(supabase_url, supabase_key)

    try:
        data = supabase.storage.from_(bucket_id).download(object_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Failed to download input: {e}")

    job_id = (req.jobId or "").strip() or uuid4().hex
    original_name = _safe_filename(req.originalFilename or Path(object_path).name)
    stem = Path(original_name).stem or "document"
    out_ext = "md" if req.outputFormat == "markdown" else "json"
    output_object_path = f"docling/{user_id}/out/{job_id}/{_safe_filename(stem)}.{out_ext}"

    try:
        suffix = Path(original_name).suffix or Path(object_path).suffix or ""
        with tempfile.TemporaryDirectory(prefix="docling_") as td:
            in_path = Path(td) / f"input{suffix}"
            in_path.write_bytes(data if isinstance(data, (bytes, bytearray)) else bytes(data))

            converter = DocumentConverter()
            result = converter.convert(str(in_path))

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
    )

