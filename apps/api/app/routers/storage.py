from fastapi import APIRouter, Depends
from supabase import Client
from uuid import UUID, uuid4
from datetime import datetime, timedelta

from app.deps import get_supabase, get_current_user_id
from app.models import (
    SignUploadRequest,
    SignUploadResponse,
    SignDownloadRequest,
    SignDownloadResponse,
)

router = APIRouter(prefix="/storage", tags=["storage"])

BUCKET_NAME = "attachments"


@router.post("/sign-upload", response_model=SignUploadResponse)
async def sign_upload(
    data: SignUploadRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    # Gerar path único
    attachment_id = uuid4()
    ext = data.filename.split(".")[-1] if "." in data.filename else ""
    path = f"{owner_id}/{attachment_id}.{ext}" if ext else f"{owner_id}/{attachment_id}"

    # Gerar signed URL para upload (expira em 1h)
    result = db.storage.from_(BUCKET_NAME).create_signed_upload_url(path)

    # Criar registro do attachment
    db.table("attachments").insert({
        "id": str(attachment_id),
        "owner_id": str(owner_id),
        "filename": data.filename,
        "content_type": data.content_type,
        "size_bytes": data.size_bytes,
        "storage_bucket": BUCKET_NAME,
        "storage_path": path,
    }).execute()

    return SignUploadResponse(
        attachment_id=attachment_id,
        upload_url=result["signed_url"],
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )


@router.post("/sign-download", response_model=SignDownloadResponse)
async def sign_download(
    data: SignDownloadRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    # Buscar attachment
    result = db.table("attachments").select("*").eq(
        "id", str(data.attachment_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not result.data:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Attachment não encontrado")

    attachment = result.data

    # Gerar signed URL para download (expira em 1h)
    signed = db.storage.from_(BUCKET_NAME).create_signed_url(
        attachment["storage_path"],
        expires_in=3600,
    )

    return SignDownloadResponse(
        download_url=signed["signedURL"],
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
