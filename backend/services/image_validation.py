"""Image validation helpers."""

from __future__ import annotations

import io
import logging

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from config import get_settings

logger = logging.getLogger("snapact.images")

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
}

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg"}


async def validate_and_read_image(file: UploadFile) -> tuple[bytes, str]:
    """Validate upload and return (bytes, content_type). Raises HTTPException on failure."""
    settings = get_settings()

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Image file is required.")

    filename = file.filename.lower()
    ext_ok = any(filename.endswith(ext) for ext in ALLOWED_EXTENSIONS)

    content_type = (file.content_type or "").lower().strip()
    if content_type == "image/jpg":
        content_type = "image/jpeg"

    if content_type and content_type not in ALLOWED_CONTENT_TYPES and not ext_ok:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{content_type or filename}'. Use PNG or JPEG.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    if len(data) > settings.max_image_bytes:
        mb = settings.max_image_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum size is {mb:.0f} MB for the demo.",
        )

    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "").upper()
            if fmt not in {"PNG", "JPEG"}:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported image format '{fmt}'. Use PNG or JPEG.",
                )
            resolved = "image/png" if fmt == "PNG" else "image/jpeg"
    except HTTPException:
        raise
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="Could not read image. The file may be corrupted. Use a PNG or JPEG screenshot.",
        ) from None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Image validation failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=400,
            detail="Invalid image upload. Please try another PNG or JPEG screenshot.",
        ) from None

    return data, resolved
