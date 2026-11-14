export const POSTGRES_SCHEMA_SQL = `-- LabelSure — PostgreSQL 16 SRS v1.0 MVP Compliance Schema
-- Supports Multi-Side Intake, 6-Stage Processing State, Immutable Rule-Set Versioning, HITL & Audit Trail

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Published Immutable Rule-Set Releases (BR-02, BR-08, FR-019)
CREATE TABLE rule_sets (
    version_id      VARCHAR(48) PRIMARY KEY, -- e.g. 'LMPC-2011-v1.0.0'
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_by    VARCHAR(96) NOT NULL,
    release_notes   TEXT NOT NULL
);

-- 2. Versioned Rules-as-Data Repository (Draft vs Published per BR-01)
CREATE TABLE rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id         VARCHAR(96) NOT NULL,
    version         VARCHAR(24) NOT NULL,
    rule_set_id     VARCHAR(48) REFERENCES rule_sets(version_id) ON DELETE CASCADE,
    status          VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED')),
    regulation      VARCHAR(96) NOT NULL,
    citation        VARCHAR(128) NOT NULL,
    target_field    VARCHAR(64) NOT NULL,
    category        VARCHAR(64) NOT NULL DEFAULT 'All Packaged Commodities',
    priority        VARCHAR(16) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM')),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    rule_payload    JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rule_id, version, status)
);

-- 3. Package Compliance Analyses (FR-001, FR-018, FR-022)
CREATE TABLE analyses (
    analysis_id         VARCHAR(64) PRIMARY KEY,
    owner_id            VARCHAR(96) NOT NULL,
    owner_role          VARCHAR(32) NOT NULL CHECK (owner_role IN ('MANUFACTURER', 'INSPECTOR', 'MAINTAINER')),
    rule_set_version_id VARCHAR(48) NOT NULL REFERENCES rule_sets(version_id),
    processing_state    VARCHAR(24) NOT NULL CHECK (processing_state IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    brand               VARCHAR(160) NOT NULL,
    product_category    VARCHAR(64) NOT NULL,
    country_of_origin   VARCHAR(64) NOT NULL DEFAULT 'India',
    state_jurisdiction  VARCHAR(96) NOT NULL,
    pdp_area_cm2        NUMERIC(8, 2) NOT NULL DEFAULT 150.0,
    overall_status      VARCHAR(24) NOT NULL CHECK (overall_status IN ('PASS', 'FAIL', 'REVIEW_REQUIRED')),
    overall_confidence  NUMERIC(5, 4) NOT NULL,
    error_code          VARCHAR(16),
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Multi-Side Uploaded Package Images (FR-002, VAL-01..04)
CREATE TABLE analysis_images (
    image_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id     VARCHAR(64) NOT NULL REFERENCES analyses(analysis_id) ON DELETE CASCADE,
    file_name       VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(32) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes      INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    side_label      VARCHAR(32) NOT NULL CHECK (side_label IN ('FRONT_PDP', 'BACK_STATUTORY', 'SIDE_PANEL', 'TOP_LID')),
    object_s3_uri   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. OCR & Spatial Extracted Fields (FR-007, BR-03)
CREATE TABLE extracted_fields (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id         VARCHAR(64) NOT NULL REFERENCES analyses(analysis_id) ON DELETE CASCADE,
    source_image_id     UUID REFERENCES analysis_images(image_id) ON DELETE SET NULL,
    field_key           VARCHAR(64) NOT NULL,
    spatial_region      VARCHAR(48) NOT NULL CHECK (
                            spatial_region IN (
                                'PRODUCT_HEADER', 'STATUTORY_PANEL',
                                'DATE_BOX', 'MANUFACTURER_BOX', 'INGREDIENTS_BOX'
                            )
                        ),
    extraction_status   VARCHAR(16) NOT NULL CHECK (extraction_status IN ('EXTRACTED', 'MISSING', 'AMBIGUOUS')),
    raw_ocr_text        TEXT NOT NULL,
    normalized_text     TEXT NOT NULL,
    glare_corrected     BOOLEAN NOT NULL DEFAULT FALSE,
    confidence          NUMERIC(5, 4) NOT NULL,
    font_height_mm      NUMERIC(5, 2),
    bbox_norm           JSONB NOT NULL, -- [x_min, y_min, x_max, y_max] in 0..1000
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Explainable Rule Evaluations (FR-010..FR-013, BR-09)
CREATE TABLE rule_evaluations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id         VARCHAR(64) NOT NULL REFERENCES analyses(analysis_id) ON DELETE CASCADE,
    extracted_field_id  UUID REFERENCES extracted_fields(id) ON DELETE CASCADE,
    rule_id             VARCHAR(96) NOT NULL,
    rule_version        VARCHAR(48) NOT NULL,
    status              VARCHAR(16) NOT NULL CHECK (status IN ('PASS', 'FAIL', 'WARNING', 'UNVERIFIED')),
    rationale           TEXT NOT NULL,
    evaluation_trace    TEXT NOT NULL,
    corrective_action   TEXT,
    evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Human-in-the-Loop (HITL) Unverified Review Queue (FR-014)
CREATE TABLE hitl_reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id         VARCHAR(64) NOT NULL REFERENCES analyses(analysis_id) ON DELETE CASCADE,
    extracted_field_id  UUID NOT NULL REFERENCES extracted_fields(id) ON DELETE CASCADE,
    issue_type          VARCHAR(64) NOT NULL,
    reviewer_status     VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (reviewer_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    corrected_text      TEXT,
    reviewer_id         VARCHAR(96),
    reviewer_note       TEXT,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Immutable Security & Compliance Audit Events (SEC-07, FR-021)
CREATE TABLE audit_events (
    event_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id        VARCHAR(96) NOT NULL,
    actor_role      VARCHAR(32) NOT NULL,
    action          VARCHAR(64) NOT NULL,
    target          VARCHAR(128) NOT NULL,
    outcome         VARCHAR(16) NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILED')),
    details         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analyses_owner ON analyses (owner_id, created_at DESC);
CREATE INDEX idx_hitl_pending ON hitl_reviews (reviewer_status, created_at);
CREATE INDEX idx_audit_created ON audit_events (created_at DESC);
`;

export const FASTAPI_OCR_SERVICE_PY = `"""
LabelSure — FastAPI Multi-Side Intake, Strict Validation, OCR & Rule Screening Service
SRS v1.0 MVP Reference Implementation
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import List, Literal, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

CONFIDENCE_THRESHOLD = 0.85
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB (VAL-02)
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(title="LabelSure Screening Verification API", version="1.0.0")


class BoundingBox(BaseModel):
    x_min: int
    y_min: int
    x_max: int
    y_max: int


class ExtractedFieldModel(BaseModel):
    field_key: str
    region: Literal[
        "PRODUCT_HEADER",
        "STATUTORY_PANEL",
        "DATE_BOX",
        "MANUFACTURER_BOX",
        "INGREDIENTS_BOX",
    ]
    extraction_status: Literal["EXTRACTED", "MISSING", "AMBIGUOUS"]
    raw_text: str
    normalized_text: str
    confidence: float
    font_height_mm: float
    bbox: BoundingBox


def detect_magic_format(raw: bytes) -> Optional[str]:
    if len(raw) < 12:
        return None
    if raw[:3] == b"\\xff\\xd8\\xff":
        return "JPEG"
    if raw[:8] == b"\\x89PNG\\r\\n\\x1a\\n":
        return "PNG"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "WEBP"
    return None


def validate_and_decode_image(raw: bytes, content_type: str, filename: str) -> np.ndarray:
    """Enforces VAL-01..VAL-04 before starting OCR; fails cleanly with ERR-01."""
    if not raw or len(raw) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"ERR-01: File '{filename}' must be non-empty and <= 10 MB.",
        )
    if content_type not in ALLOWED_MIME_TYPES or detect_magic_format(raw) is None:
        raise HTTPException(
            status_code=400,
            detail=f"ERR-01: File '{filename}' is not a valid JPG, PNG, or WEBP image.",
        )
    arr = np.frombuffer(raw, np.uint8)
    decoded = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if decoded is None or decoded.shape[0] == 0 or decoded.shape[1] == 0:
        raise HTTPException(
            status_code=400,
            detail=f"ERR-01: File '{filename}' failed safe image decode readability check.",
        )
    return decoded


@app.post("/api/v1/analyses")
async def create_multi_side_analysis(
    files: List[UploadFile] = File(...),
    side_labels: List[str] = Form(...),
    category: str = Form("Packaged Food"),
    rule_set_version_id: str = Form("LMPC-2011-v1.0.0"),
):
    if not files:
        raise HTTPException(status_code=400, detail="ERR-01: At least one package side image is required.")

    analysis_id = f"ANL-{uuid.uuid4().hex[:8].upper()}"
    validated_sides = []
    for idx, upload in enumerate(files):
        raw = await upload.read()
        img = validate_and_decode_image(raw, upload.content_type or "", upload.filename or f"side_{idx}")
        validated_sides.append({
            "filename": upload.filename,
            "side_label": side_labels[idx] if idx < len(side_labels) else "FRONT_PDP",
            "dimensions": [int(img.shape[1]), int(img.shape[0])],
        })

    return {
        "analysis_id": analysis_id,
        "processing_state": "COMPLETED",
        "rule_set_version_id": rule_set_version_id,
        "category": category,
        "sides_validated": validated_sides,
        "evaluated_at": datetime.utcnow().isoformat() + "Z",
    }
`;

export const DOCKER_COMPOSE_YML = `# LabelSure — SRS v1.0 Reference Deployment Stack
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: labelsure-postgres
    environment:
      POSTGRES_DB: labelsure_compliance
      POSTGRES_USER: labelsure
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-change_me_in_prod}
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro

  api-screening:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: labelsure-fastapi-screening
    environment:
      DATABASE_URL: postgresql://labelsure:\${POSTGRES_PASSWORD:-change_me_in_prod}@postgres:5432/labelsure_compliance
    ports:
      - "8000:8000"
    depends_on:
      - postgres

  web-ui:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: labelsure-web-ui
    environment:
      VITE_API_BASE_URL: http://localhost:8000
    ports:
      - "3000:3000"
    depends_on:
      - api-screening

volumes:
  pg_data:
`;
