"""OCR / SMS / Image / Voice extraction endpoints."""
from __future__ import annotations

import base64
import logging
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from models import OCRImageBase64Input, OCRTextInput
from services.db import EMERGENT_LLM_KEY
from services.llm import llm_extract_structured, normalize_image_b64


def build_extraction_router() -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.post("/extract/sms")
    async def extract_sms(payload: OCRTextInput):
        if not payload.text or not payload.text.strip():
            raise HTTPException(status_code=400, detail="text required")
        return await llm_extract_structured(payload.text)

    @r.post("/extract/image")
    async def extract_image(payload: OCRImageBase64Input):
        if not payload.image_base64:
            raise HTTPException(status_code=400, detail="image_base64 required")
        normalized = normalize_image_b64(payload.image_base64)
        return await llm_extract_structured(
            "Extract voucher / coupon / membership card information from this image.",
            image_base64=normalized,
        )

    @r.post("/extract/image-upload")
    async def extract_image_upload(file: UploadFile = File(...)):
        raw = await file.read()
        b64 = base64.b64encode(raw).decode("ascii")
        normalized = normalize_image_b64(b64)
        return await llm_extract_structured(
            "Extract voucher / coupon / membership card information from this image.",
            image_base64=normalized,
        )

    @r.post("/extract/voice")
    async def extract_voice(file: UploadFile = File(...)):
        """Voice → Whisper transcript → GPT-4o structured voucher fields."""
        from emergentintegrations.llm.openai import OpenAISpeechToText

        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="empty audio")
        if len(raw) > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="audio too large (max 25 MB)")

        suffix = ".webm"
        ct = (file.content_type or "").lower()
        if "wav" in ct: suffix = ".wav"
        elif "mp4" in ct or "m4a" in ct: suffix = ".m4a"
        elif "mp3" in ct or "mpeg" in ct: suffix = ".mp3"

        try:
            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
                tmp.write(raw)
                tmp.flush()
                tmp.seek(0)
                with open(tmp.name, "rb") as audio_file:
                    stt_resp = await stt.transcribe(
                        file=audio_file,
                        model="whisper-1",
                        response_format="json",
                        prompt=(
                            "Voucher and membership entry. Brands include Swiggy, "
                            "Zomato, Amazon, Flipkart, BigBasket, Croma, Myntra, "
                            "Tata Neu, Reliance, Jio, Ajio, Pantaloons. Codes are "
                            "uppercase alphanumeric. Currency is rupees (₹/Rs)."
                        ),
                        temperature=0.0,
                    )
            transcript = (stt_resp.text or "").strip()
        except Exception as e:
            logging.exception("Whisper transcription failed")
            raise HTTPException(status_code=502, detail=f"voice transcription failed: {e}")

        if not transcript:
            raise HTTPException(status_code=422, detail="no speech detected — please retry")

        parsed = await llm_extract_structured(transcript)
        return {"transcript": transcript, "parsed": parsed}

    return r
