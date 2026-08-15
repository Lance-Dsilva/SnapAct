import logging
import uuid
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from schemas.api import CaptureResponse
from services.capture_service import process_capture
from services.image_validation import validate_and_read_image

router = APIRouter(tags=["capture"])
logger = logging.getLogger("snapact.api.capture")


@router.post("/capture", response_model=CaptureResponse)
async def capture(
    image: UploadFile = File(...),
    mode: Literal["save", "ask"] = Form("save"),
    question: str | None = Form(None),
    source: Literal["shortcut", "web", "mac", "iphone"] | None = Form("web"),
    captured_at: str | None = Form(None),
    client_request_id: str | None = Form(None),
) -> CaptureResponse:
    request_id = uuid.uuid4().hex[:12]
    logger.info(
        "capture request_id=%s source=%s mode=%s client_request_id=%s",
        request_id,
        source,
        mode,
        client_request_id,
    )

    if mode == "ask" and not (question and question.strip()):
        raise HTTPException(
            status_code=400,
            detail="question is required when mode=ask.",
        )

    image_bytes, content_type = await validate_and_read_image(image)

    try:
        return await process_capture(
            image_bytes=image_bytes,
            content_type=content_type,
            mode=mode,
            question=question.strip() if question else None,
            source=source,
            captured_at=captured_at,
            client_request_id=client_request_id,
            request_id=request_id,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("capture failed request_id=%s", request_id)
        raise HTTPException(
            status_code=502,
            detail="Capture processing failed. Please try again.",
        ) from exc
