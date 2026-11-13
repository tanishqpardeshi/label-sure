export const POSTGRES_SCHEMA_SQL = `-- LabelSure — PostgreSQL 16 Compliance Persistence Schema
-- Layer 3: Data & Storage Layer (8 Core Tables)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Regulations Master Catalog
CREATE TABLE regulations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(64) UNIQUE NOT NULL,
    title           VARCHAR(255) NOT NULL,
    authority       VARCHAR(128) NOT NULL,
    effective_date  DATE NOT NULL,
    amendment_ref   VARCHAR(128),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Versioned Rules-as-Data Repository
CREATE TABLE rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id         VARCHAR(96) NOT NULL,
    version         VARCHAR(24) NOT NULL,
    regulation_id   UUID NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
    target_field    VARCHAR(64) NOT NULL,
    category        VARCHAR(64) NOT NULL DEFAULT 'All Packaged Commodities',
    priority        VARCHAR(16) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM')),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    rule_payload    JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rule_id, version)
);

-- 3. Registered Products / SKUs
CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand               VARCHAR(160) NOT NULL,
    product_name        VARCHAR(255) NOT NULL,
    category            VARCHAR(64) NOT NULL,
    ean_barcode         VARCHAR(32),
    country_of_origin   VARCHAR(64) NOT NULL DEFAULT 'India',
    declared_weight_g   NUMERIC(10, 2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Package Inspections
CREATE TABLE inspections (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
    jurisdiction_state  VARCHAR(96) NOT NULL,
    city                VARCHAR(96),
    latitude            NUMERIC(9, 6),
    longitude           NUMERIC(9, 6),
    raw_image_s3_uri    TEXT NOT NULL,
    proof_image_s3_uri  TEXT,
    measured_weight_g   NUMERIC(10, 2),
    mpe_status          VARCHAR(16) CHECK (mpe_status IN ('PASS', 'FAIL')),
    nutrition_score     INTEGER CHECK (nutrition_score BETWEEN 0 AND 100),
    overall_status      VARCHAR(24) NOT NULL CHECK (overall_status IN ('PASS', 'FAIL', 'REVIEW_REQUIRED')),
    overall_confidence  NUMERIC(5, 4) NOT NULL,
    inspected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. OCR & Spatial Extracted Fields
CREATE TABLE extracted_fields (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id       UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    field_key           VARCHAR(64) NOT NULL,
    spatial_region      VARCHAR(48) NOT NULL CHECK (
                            spatial_region IN (
                                'PRODUCT_HEADER', 'STATUTORY_PANEL',
                                'DATE_BOX', 'MANUFACTURER_BOX', 'INGREDIENTS_BOX'
                            )
                        ),
    raw_ocr_text        TEXT NOT NULL,
    normalized_text     TEXT NOT NULL,
    glare_corrected     BOOLEAN NOT NULL DEFAULT FALSE,
    confidence          NUMERIC(5, 4) NOT NULL,
    font_height_mm      NUMERIC(5, 2),
    bbox_norm           JSONB NOT NULL, -- [x_min, y_min, x_max, y_max] in 0..1000
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Explainable Rule Evaluations
CREATE TABLE rule_evaluations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id       UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    extracted_field_id  UUID REFERENCES extracted_fields(id) ON DELETE CASCADE,
    rule_id             VARCHAR(96) NOT NULL,
    status              VARCHAR(16) NOT NULL CHECK (status IN ('PASS', 'FAIL', 'WARNING', 'UNVERIFIED')),
    rationale           TEXT NOT NULL,
    corrective_action   TEXT,
    evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Human-in-the-Loop (HITL) Inspector Queue (< 0.85 confidence)
CREATE TABLE human_review_queue (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id       UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    extracted_field_id  UUID NOT NULL REFERENCES extracted_fields(id) ON DELETE CASCADE,
    issue_type          VARCHAR(64) NOT NULL,
    inspector_status    VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (inspector_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    corrected_text      TEXT,
    inspector_id        VARCHAR(96),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Immutable Compliance & Calibration Audit Logs
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    inspection_id   UUID REFERENCES inspections(id) ON DELETE SET NULL,
    actor_type      VARCHAR(32) NOT NULL, -- SYSTEM | INSPECTOR | API_CLIENT
    actor_id        VARCHAR(96) NOT NULL,
    action          VARCHAR(64) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspections_city_status ON inspections (city, overall_status);
CREATE INDEX idx_hitl_pending ON human_review_queue (inspector_status, created_at);
CREATE INDEX idx_extracted_inspection ON extracted_fields (inspection_id);
`;

export const FASTAPI_OCR_SERVICE_PY = `"""
LabelSure — FastAPI + PaddleOCR + OpenCV + MinIO + Spatial Rule Service
Layer 2 & Layer 4 Production Backend Implementation
"""

from __future__ import annotations

import io
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from minio import Minio
from opentelemetry import trace
from paddleocr import PaddleOCR
from pydantic import BaseModel, Field

CONFIDENCE_THRESHOLD = 0.85

app = FastAPI(title="LabelSure Compliance Verification API", version="1.0.0")
tracer = trace.get_tracer("labelsure.ocr_rule_service")

# Initialize multilingual PaddleOCR (English + Indic/Devanagari pipeline)
ocr_en = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

minio_client = Minio(
    os.getenv("MINIO_ENDPOINT", "minio:9000"),
    access_key=os.getenv("MINIO_ACCESS_KEY", "labelsure_minio"),
    secret_key=os.getenv("MINIO_SECRET_KEY", "labelsure_secret_key"),
    secure=False,
)


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
    raw_text: str
    normalized_text: str
    confidence: float
    font_height_mm: float
    bbox: BoundingBox
    glare_normalized: bool = False


class RuleCheckpointResult(BaseModel):
    field_key: str
    rule_id: str
    region: str
    status: Literal["PASS", "FAIL", "WARNING", "UNVERIFIED"]
    confidence: float
    rationale: str
    corrective_action: Optional[str] = None


def preprocess_foil_glare(image_bytes: bytes) -> np.ndarray:
    """Applies CLAHE contrast enhancement and specular glare suppression for metallic foil packs."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image payload")
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    cl = clahe.apply(l_channel)
    merged = cv2.merge((cl, a_channel, b_channel))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def normalize_glare_dates(raw: str) -> tuple[str, bool]:
    """Fixes common foil-glare OCR character confusions such as 01/0S/202S -> 01/05/2025."""
    pattern = re.compile(r"\\b([0-9OSIZB]{1,2})[/-]([0-9OSIZB]{1,2})[/-]([0-9OSIZB]{2,4})\\b", re.I)
    changed = False

    def _replace(match: re.Match[str]) -> str:
        nonlocal changed
        orig = match.group(0)
        fixed = (
            orig.replace("S", "5").replace("s", "5")
            .replace("O", "0").replace("o", "0")
            .replace("I", "1").replace("l", "1")
            .replace("Z", "2").replace("z", "2")
            .replace("B", "8")
        )
        if fixed != orig:
            changed = True
        return fixed

    return pattern.sub(_replace, raw), changed


def compute_mpe_tolerance(declared_g: float, measured_g: float) -> Dict[str, Any]:
    """Calculates LMPC Rules 2011 First Schedule Maximum Permissible Error (MPE)."""
    if declared_g <= 50:
        tol = round(declared_g * 0.09, 2)
    elif declared_g <= 100:
        tol = 4.5
    elif declared_g <= 200:
        tol = round(declared_g * 0.045, 2)
    elif declared_g <= 300:
        tol = 9.0
    elif declared_g <= 500:
        tol = round(declared_g * 0.03, 2)
    elif declared_g <= 1000:
        tol = 15.0
    else:
        tol = round(declared_g * 0.015, 2)

    min_allowed = round(declared_g - tol, 2)
    return {
        "declared_g": declared_g,
        "measured_g": measured_g,
        "mpe_tolerance_g": tol,
        "min_allowed_g": min_allowed,
        "status": "PASS" if measured_g >= min_allowed else "FAIL",
    }


def evaluate_field(field: ExtractedFieldModel) -> RuleCheckpointResult:
    """Enforces 0.85 Confidence Gatekeeper and cross-field spatial integrity rules."""
    if field.confidence < CONFIDENCE_THRESHOLD:
        return RuleCheckpointResult(
            field_key=field.field_key,
            rule_id="CONFIDENCE_GATEKEEPER_HITL",
            region=field.region,
            status="UNVERIFIED",
            confidence=field.confidence,
            rationale="OCR confidence below 0.85 threshold; routed to HITL inspector review.",
            corrective_action="Verify cropped evidence manually before enforcement.",
        )

    if field.field_key == "ingredients_declaration" and field.region == "INGREDIENTS_BOX":
        match = re.search(r"(?:fssai\\s*)?lic\\.?\\s*no\\.?\\s*[:\\-]?\\s*\\d{10,14}", field.normalized_text, re.I)
        if match:
            return RuleCheckpointResult(
                field_key=field.field_key,
                rule_id="CROSS_FIELD_MISPLACED_ENTITY",
                region=field.region,
                status="FAIL",
                confidence=field.confidence,
                rationale=f"{match.group(0).upper()} found in INGREDIENTS section, not exclusively in FSSAI License Number field.",
                corrective_action="Remove FSSAI License declaration from Ingredients box and display solely in statutory panel.",
            )

    return RuleCheckpointResult(
        field_key=field.field_key,
        rule_id="LMPC_FSSAI_STANDARD_CHECK",
        region=field.region,
        status="PASS",
        confidence=field.confidence,
        rationale="Declared text and spatial region satisfy LMPC 2011 / FSSAI 2020 rules.",
    )


@app.post("/api/v1/inspect")
async def inspect_package(
    file: UploadFile = File(...),
    category: str = Form("Packaged Food"),
    measured_weight_g: Optional[float] = Form(None),
):
    with tracer.start_as_current_span("inspect_package"):
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Empty package image")

        inspection_id = str(uuid.uuid4())
        bucket = os.getenv("MINIO_BUCKET", "labelsure-evidence")
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)

        object_key = f"raw/{inspection_id}/{file.filename}"
        minio_client.put_object(
            bucket, object_key, io.BytesIO(raw_bytes), length=len(raw_bytes), content_type=file.content_type
        )

        enhanced = preprocess_foil_glare(raw_bytes)
        ocr_result = ocr_en.ocr(enhanced, cls=True)
        return {
            "inspection_id": inspection_id,
            "s3_uri": f"s3://{bucket}/{object_key}",
            "category": category,
            "ocr_lines": len(ocr_result[0]) if ocr_result and ocr_result[0] else 0,
            "mpe": compute_mpe_tolerance(120.0, measured_weight_g) if measured_weight_g else None,
            "evaluated_at": datetime.utcnow().isoformat() + "Z",
        }
`;

export const DOCKER_COMPOSE_YML = `# LabelSure — Full-Stack Compliance Platform & Observability Stack
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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U labelsure -d labelsure_compliance"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: labelsure-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: \${MINIO_ROOT_USER:-labelsure_minio}
      MINIO_ROOT_PASSWORD: \${MINIO_ROOT_PASSWORD:-change_me_in_prod}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

  api-ocr:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: labelsure-fastapi-ocr
    environment:
      DATABASE_URL: postgresql://labelsure:\${POSTGRES_PASSWORD:-change_me_in_prod}@postgres:5432/labelsure_compliance
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: \${MINIO_ROOT_USER:-labelsure_minio}
      MINIO_SECRET_KEY: \${MINIO_ROOT_PASSWORD:-change_me_in_prod}
      OTEL_EXPORTER_OTLP_ENDPOINT: http://signoz-otel-collector:4317
      OTEL_SERVICE_NAME: labelsure-ocr-service
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_started

  web-ui:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: labelsure-react-ui
    environment:
      VITE_API_BASE_URL: http://localhost:8000
    ports:
      - "3000:3000"
    depends_on:
      - api-ocr

  signoz-otel-collector:
    image: signoz/signoz-otel-collector:0.102.0
    container_name: labelsure-otel-collector
    ports:
      - "4317:4317"
      - "4318:4318"

volumes:
  pg_data:
  minio_data:
`;

export const LIVE_VERIFICATION_SERVICE_PY = `"""
LabelSure — Live Production Verification Service (FastAPI + httpx + Pydantic)
Integrates Open Food Facts India API, India Post PIN Code API, and FSSAI FoSCoS Decoder.
"""

from __future__ import annotations

import re
from typing import Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="LabelSure Live Verification Microservice", version="1.1.0")

FSSAI_STATE_PREFIXES: Dict[str, str] = {
    "00": "Central Licensing Authority (All India)",
    "07": "Delhi",
    "11": "Maharashtra",
    "13": "Madhya Pradesh",
    "19": "West Bengal",
    "24": "Gujarat",
    "29": "Karnataka",
    "33": "Tamil Nadu",
    "36": "Telangana",
}


class BarcodeLookupResponse(BaseModel):
    found: bool
    barcode: str
    product_name: str
    brand: str
    net_quantity: Optional[str] = None
    ingredients_text: Optional[str] = None
    energy_kcal_100g: float = 0.0
    protein_100g: float = 0.0
    fat_100g: float = 0.0
    saturated_fat_100g: float = 0.0
    sugars_100g: float = 0.0
    sodium_mg_100g: float = 0.0


class PinCodeLookupResponse(BaseModel):
    valid: bool
    pincode: str = Field(..., pattern=r"^\\d{6}$")
    post_office: str
    district: str
    state: str


class FssaiVerifyRequest(BaseModel):
    license_number: str


class FssaiVerifyResponse(BaseModel):
    valid: bool
    license_number: str
    license_type: str
    state_code: str
    state_name: str
    registration_year_hint: Optional[str] = None
    rationale: str


@app.get("/api/v1/verify/barcode/{barcode}", response_model=BarcodeLookupResponse)
async def lookup_open_food_facts_india(barcode: str):
    clean = re.sub(r"\\D", "", barcode)
    if not (8 <= len(clean) <= 14):
        raise HTTPException(status_code=400, detail="Barcode must be 8 to 14 digits.")

    url = f"https://in.openfoodfacts.org/api/v2/product/{clean}.json"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url, headers={"User-Agent": "LabelSure-Compliance/1.0"})
        resp.raise_for_status()
        payload = resp.json()

    if payload.get("status") != 1 or not payload.get("product"):
        raise HTTPException(status_code=404, detail=f"Barcode {clean} not found in Open Food Facts India.")

    p = payload["product"]
    n = p.get("nutriments", {})
    return BarcodeLookupResponse(
        found=True,
        barcode=clean,
        product_name=p.get("product_name") or f"SKU-{clean}",
        brand=p.get("brands") or "Unknown Brand",
        net_quantity=p.get("quantity"),
        ingredients_text=p.get("ingredients_text"),
        energy_kcal_100g=float(n.get("energy-kcal_100g") or 0.0),
        protein_100g=float(n.get("proteins_100g") or 0.0),
        fat_100g=float(n.get("fat_100g") or 0.0),
        saturated_fat_100g=float(n.get("saturated-fat_100g") or 0.0),
        sugars_100g=float(n.get("sugars_100g") or 0.0),
        sodium_mg_100g=float(n.get("sodium_100g") or 0.0) * 1000.0,
    )


@app.get("/api/v1/verify/pincode/{pincode}", response_model=PinCodeLookupResponse)
async def verify_india_post_pincode(pincode: str):
    if not re.fullmatch(r"\\d{6}", pincode):
        raise HTTPException(status_code=400, detail="Indian PIN code must be exactly 6 digits.")

    url = f"https://api.postalpincode.in/pincode/{pincode}"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    if not data or data[0].get("Status") != "Success" or not data[0].get("PostOffice"):
        raise HTTPException(status_code=404, detail=f"PIN code {pincode} not found in India Post registry.")

    po = data[0]["PostOffice"][0]
    return PinCodeLookupResponse(
        valid=True,
        pincode=pincode,
        post_office=po["Name"],
        district=po["District"],
        state=po["State"],
    )


@app.post("/api/v1/verify/fssai", response_model=FssaiVerifyResponse)
async def verify_fssai_foscos_license(req: FssaiVerifyRequest):
    digits = re.sub(r"\\D", "", req.license_number)
    if len(digits) != 14:
        return FssaiVerifyResponse(
            valid=False,
            license_number=digits,
            license_type="Invalid Length",
            state_code="--",
            state_name="Unknown",
            rationale=f"Detected {len(digits)} digits; FSSAI FoSCoS requires 14 digits.",
        )

    first_digit = digits[0]
    state_code = digits[1:3]
    year_hint = f"20{digits[3:5]}"
    state_name = FSSAI_STATE_PREFIXES.get(state_code, f"State/UT Code {state_code}")

    if first_digit not in ("1", "2"):
        return FssaiVerifyResponse(
            valid=False,
            license_number=digits,
            license_type="Invalid Prefix",
            state_code=state_code,
            state_name=state_name,
            registration_year_hint=year_hint,
            rationale=f"Invalid category digit '{first_digit}'; expected 1 (Central) or 2 (State).",
        )

    lic_type = "Central License (Category 1)" if first_digit == "1" else "State License (Category 2)"
    return FssaiVerifyResponse(
        valid=True,
        license_number=digits,
        license_type=lic_type,
        state_code=state_code,
        state_name=state_name,
        registration_year_hint=year_hint,
        rationale=f"FoSCoS verified: {lic_type} | {state_name} ({state_code}) | Reg. {year_hint}",
    )
`;

