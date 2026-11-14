import React, { useState } from 'react';
import { Check, Copy, Download, Layers } from 'lucide-react';
import { LMPC_STATUTORY_MATRIX } from '../data/lmpcStatutoryMatrix';
import {
  DOCKER_COMPOSE_YML,
  FASTAPI_OCR_SERVICE_PY,
  POSTGRES_SCHEMA_SQL,
} from '../data/productionCodeTemplates';

type CodeTab = 'schema' | 'fastapi' | 'docker' | 'matrix';

const CODE_FILES: Record<
  CodeTab,
  { filename: string; subtitle: string; content: string }
> = {
  schema: {
    filename: 'schema.sql',
    subtitle: 'PostgreSQL 16 · SRS v1.0 MVP 8-Table Schema (Rule-Sets, Multi-Side Analyses, Extractions, HITL & Audit)',
    content: POSTGRES_SCHEMA_SQL,
  },
  fastapi: {
    filename: 'ocr_rule_service.py',
    subtitle: 'FastAPI · Multi-Side Intake, Magic-Byte & OpenCV Decode Validation (ERR-01) & Screening API',
    content: FASTAPI_OCR_SERVICE_PY,
  },
  docker: {
    filename: 'docker-compose.yml',
    subtitle: 'Docker Compose · Postgres, FastAPI Screening API & React Web UI',
    content: DOCKER_COMPOSE_YML,
  },
  matrix: {
    filename: 'lmpc_statutory_matrix.json',
    subtitle: 'PostgreSQL JSONB Seed · Rule 6 Declarations, Second Schedule Font Height & Rule 12 SI Units',
    content: JSON.stringify(LMPC_STATUTORY_MATRIX, null, 2),
  },
};

const ARCHITECTURE_LAYERS = [
  {
    layer: '01. Multi-Side Intake',
    detail:
      'Browser-based multi-side upload (JPG, PNG, WEBP <= 10 MB) with magic-byte & decode validation before OCR.',
  },
  {
    layer: '02. OCR & Extraction',
    detail:
      'Multilingual OCR extraction mapping declarations to source sides with explicit EXTRACTED, MISSING, or AMBIGUOUS status.',
  },
  {
    layer: '03. Published Rule Engine',
    detail:
      'Runtime selection of active PUBLISHED rules (BR-01), 85% HITL confidence gate, and non-guessing evaluation trace.',
  },
  {
    layer: '04. Ledger & Versioning',
    detail:
      'PostgreSQL 8-table ledger preserving immutable rule_set_version_id snapshots (BR-08) and SEC-07 audit events.',
  },
  {
    layer: '05. Explainable Proof',
    detail:
      'Side-aware bounding-box evidence canvas, HITL reviewer queue, BR-06 screening disclaimer, JSON & Printable PDF export.',
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
      {/* 5-Layer SRS MVP Architecture Summary */}
      <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex items-center gap-2 border-b border-[#DDD5CD] pb-3">
          <Layers className="h-4 w-4 text-[#7D4047]" />
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-[#2E2E2E]">
              Architecture &amp; SRS Data Schema Exporter
            </h1>
            <p className="text-xs text-[#2E2E2E]/70">
              SRS v1.0 MVP 5-Stage Reference Architecture with downloadable PostgreSQL DDL, FastAPI
              validation service, and Docker deployment manifests
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {ARCHITECTURE_LAYERS.map((item) => (
            <div key={item.layer} className="rounded-xl border border-[#DDD5CD] bg-[#F1ECE6] p-3">
              <h2 className="font-display text-xs font-semibold text-[#7D4047]">{item.layer}</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-[#2E2E2E]/80">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Code Viewer Tabs */}
      <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#DDD5CD] bg-[#DDD5CD]/45 p-1">
            {(Object.keys(CODE_FILES) as CodeTab[]).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => {
                  setActiveFile(tabKey);
                  setCopied(false);
                }}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeFile === tabKey
                    ? 'bg-[#7D4047] text-[#FAF7F2] font-semibold shadow-xs'
                    : 'text-[#2E2E2E]/80 hover:text-[#2E2E2E]'
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD5CD] bg-[#FAF7F2] px-3 py-1.5 text-xs font-medium text-[#2E2E2E] hover:bg-[#DDD5CD]/40 whitespace-nowrap shrink-0"
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7D4047] px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#663238] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Download {current.filename}
            </button>
          </div>
        </div>

        <div className="border-b border-[#2E2E2E] bg-[#2E2E2E] px-4 py-2 text-xs text-[#DDD5CD]">
          {current.subtitle}
        </div>

        <pre className="max-h-[580px] overflow-auto bg-[#2E2E2E] p-4 font-mono text-xs leading-relaxed text-[#F1ECE6]">
          <code>{current.content}</code>
        </pre>
      </section>
    </div>
  );
};
