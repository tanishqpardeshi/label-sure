import React, { useState } from 'react';
import { Check, Copy, Download, Layers } from 'lucide-react';
import { LMPC_STATUTORY_MATRIX } from '../data/lmpcStatutoryMatrix';
import {
  DOCKER_COMPOSE_YML,
  FASTAPI_OCR_SERVICE_PY,
  LIVE_VERIFICATION_SERVICE_PY,
  POSTGRES_SCHEMA_SQL,
} from '../data/productionCodeTemplates';

type CodeTab = 'schema' | 'fastapi' | 'docker' | 'matrix' | 'live_service';

const CODE_FILES: Record<
  CodeTab,
  { filename: string; subtitle: string; content: string }
> = {
  schema: {
    filename: 'schema.sql',
    subtitle: 'PostgreSQL 16 · 8 Core Compliance & HITL Tables',
    content: POSTGRES_SCHEMA_SQL,
  },
  fastapi: {
    filename: 'ocr_rule_service.py',
    subtitle: 'FastAPI + PaddleOCR + OpenCV Glare Normalization + MinIO + MPE Service',
    content: FASTAPI_OCR_SERVICE_PY,
  },
  docker: {
    filename: 'docker-compose.yml',
    subtitle: 'Docker Compose · Postgres, MinIO, FastAPI, React & OpenTelemetry/SigNoz',
    content: DOCKER_COMPOSE_YML,
  },
  matrix: {
    filename: 'lmpc_statutory_matrix.json',
    subtitle: 'PostgreSQL JSONB Seed · Rule 6, First Schedule MPE, Second Schedule Font Height & Rule 12 SI Units',
    content: JSON.stringify(LMPC_STATUTORY_MATRIX, null, 2),
  },
  live_service: {
    filename: 'live_verification_service.py',
    subtitle: 'FastAPI + httpx + Pydantic · Open Food Facts India, India Post PIN & FSSAI FoSCoS Verifier',
    content: LIVE_VERIFICATION_SERVICE_PY,
  },
};

const ARCHITECTURE_LAYERS = [
  {
    layer: '01. Input Layer',
    detail: 'Live Camera, Single/Bulk Image Uploads, Product & Regulatory Context, Barcode & IoT Scale Input',
  },
  {
    layer: '02. Processing Layer',
    detail: 'TensorFlow + PaddleOCR Spatial Segmentation, Nutrition Engine, Versioned Rule Engine, 0.85 Confidence HITL Gatekeeper, Evidence Mapper',
  },
  {
    layer: '03. Data & Storage Layer',
    detail: 'PostgreSQL 8-table compliance ledger + MinIO S3-compatible raw & annotated proof object storage',
  },
  {
    layer: '04. Tech Stack & DevOps',
    detail: 'React, Tailwind CSS, Python FastAPI, TensorFlow, PaddleOCR, OpenCV, Docker, AWS, OpenTelemetry, SigNoz',
  },
  {
    layer: '05. Output Layer',
    detail: 'Explainable Violation Reports, Bounding-Box Proof Canvas, HITL Review Queue, Regional Heatmaps & Bulk APIs',
  },
];

export const CodeExporterView: React.FC = () => {
  const [activeFile, setActiveFile] = useState<CodeTab>('schema');
  const [copied, setCopied] = useState(false);

  const current = CODE_FILES[activeFile];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([current.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = current.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 5-Layer System Architecture Summary */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Layers className="h-4 w-4 text-slate-600" />
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
              Backend Architecture &amp; Production Code Exporter
            </h1>
            <p className="text-xs text-slate-500">
              5-Layer Reference Architecture with downloadable PostgreSQL, FastAPI/PaddleOCR, and
              Docker Compose deployment manifests
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {ARCHITECTURE_LAYERS.map((item) => (
            <div key={item.layer} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <h2 className="font-display text-xs font-semibold text-blue-900">{item.layer}</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Code Viewer Tabs */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
            {(Object.keys(CODE_FILES) as CodeTab[]).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => {
                  setActiveFile(tabKey);
                  setCopied(false);
                }}
                className={`rounded px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeFile === tabKey
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {CODE_FILES[tabKey].filename}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy Code'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Download {current.filename}
            </button>
          </div>
        </div>

        <div className="border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-300">
          {current.subtitle}
        </div>

        <pre className="max-h-[580px] overflow-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
          <code>{current.content}</code>
        </pre>
      </section>
    </div>
  );
};
