from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.file_parser import extract_text
from pathlib import Path

router = APIRouter(prefix="/files", tags=["files"])

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    is_image = ext in (".png", ".jpg", ".jpeg")

    content = await file.read()

    if is_image:
        # Images are handled client-side as base64; just acknowledge
        return {
            "filename": file.filename,
            "extracted_text": "",
            "file_type": "image",
        }

    extracted = extract_text(file.filename or "file", content)
    return {
        "filename": file.filename,
        "extracted_text": extracted,
        "file_type": ext.lstrip("."),
    }
