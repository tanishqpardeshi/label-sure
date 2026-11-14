import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  FlaskConical,
  Loader2,
  Play,
  Printer,
  RotateCcw,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  SAMPLE_PRESET_IMAGES,
  SRS_ACCEPTANCE_FIXTURES,
  type AcceptanceTestSpec,
} from '../data/goldenSample';
import { MANDATORY_SCREENING_DISCLAIMER } from '../lib/complianceEngine';
import {
  decodeBase64ToBytes,
  validateImageBuffer,
  verifyBrowserImageDecode,
} from '../lib/inputValidation';
import type {
  ComplianceStatus,
  ExtractionStatus,
  InspectionReport,
  PackageSideLabel,
  ProductContext,
} from '../types/compliance';
import { PackageEvidenceCanvas } from './PackageEvidenceCanvas';
import { PipelineStepper } from './PipelineStepper';

export interface StagedSideUpload {
  imageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sideLabel: PackageSideLabel;
  dataUrl: string;
  widthPx?: number;
  heightPx?: number;
}

interface ScannerViewProps {
  report: InspectionReport;
  productContext: ProductContext;
  onChangeContext: (ctx: ProductContext) => void;
  onResetGoldenSample: () => void;
  onAnalyzeMultiSide: (payload: {
    images: Array<{
      imageId: string;
      fileName: string;
      mimeType: string;
      sideLabel: PackageSideLabel;
      imageBase64?: string;
      presetImagePath?: string;
    }>;
    sourceMode: 'upload' | 'sample_preset';
    contextOverride?: ProductContext;
  }) => Promise<void>;
  onValidationFailure: (errorCode: 'ERR-01', message: string, guidance: string) => void;
  onRunAcceptanceFixture: (fixtureId: AcceptanceTestSpec['id']) => void;
  isAnalyzing: boolean;
  analyzeError: string | null;
  onClearError: () => void;
  uploadTriggerRef: React.RefObject<HTMLInputElement | null>;
}

const STATUS_DISPLAY: Record<
  ComplianceStatus,
  { icon: React.ReactNode; label: string; textClass: string; rowTint: string; badgeClass: string }
> = {
  PASS: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />,
    label: 'PASS',
    textClass: 'text-emerald-800',
    rowTint: 'bg-[#FAF7F2]',
    badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  },
  FAIL: {
    icon: <XCircle className="h-4 w-4 text-red-700 shrink-0" />,
    label: 'FAIL',
    textClass: 'text-red-800',
    rowTint: 'bg-red-50/50',
    badgeClass: 'border-red-300 bg-red-50 text-red-900',
  },
  WARNING: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />,
    label: 'WARNING',
    textClass: 'text-amber-800',
    rowTint: 'bg-amber-50/50',
    badgeClass: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  UNVERIFIED: {
    icon: <FileWarning className="h-4 w-4 text-amber-700 shrink-0" />,
    label: 'UNVERIFIED',
    textClass: 'text-amber-800',
    rowTint: 'bg-amber-50/60',
    badgeClass: 'border-amber-300 bg-amber-50 text-amber-900',
  },
};

const EXTRACTION_LABELS: Record<ExtractionStatus, { label: string; styleClass: string }> = {
  EXTRACTED: { label: 'EXTRACTED', styleClass: 'text-[#2E2E2E]/70' },
  MISSING: { label: 'MISSING', styleClass: 'text-red-800 font-bold' },
  AMBIGUOUS: { label: 'AMBIGUOUS', styleClass: 'text-amber-800 font-bold' },
};

const SIDE_OPTIONS: Array<{ value: PackageSideLabel; label: string }> = [
  { value: 'FRONT_PDP', label: 'Front PDP' },
  { value: 'BACK_STATUTORY', label: 'Back Statutory Panel' },
  { value: 'SIDE_PANEL', label: 'Side Panel' },
  { value: 'TOP_LID', label: 'Top / Lid' },
];

export const ScannerView: React.FC<ScannerViewProps> = ({
  report,
  productContext,
  onChangeContext,
  onResetGoldenSample,
  onAnalyzeMultiSide,
  onValidationFailure,
  onRunAcceptanceFixture,
  isAnalyzing,
  analyzeError,
  onClearError,
  uploadTriggerRef,
}) => {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    report.checkpoints.find((c) => c.status === 'FAIL')?.fieldId ??
      report.checkpoints[0]?.fieldId ??
      null,
  );
  const [stagedSides, setStagedSides] = useState<StagedSideUpload[]>([]);

  useEffect(() => {
    setSelectedFieldId(
      report.checkpoints.find((c) => c.status === 'FAIL' || c.status === 'UNVERIFIED')?.fieldId ??
        report.checkpoints[0]?.fieldId ??
        null,
    );
  }, [report.analysisId, report.processingState]);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Unable to read file "${file.name}".`));
      reader.readAsDataURL(file);
    });

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0) return;

    const validatedUploads: StagedSideUpload[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      let dataUrl = '';
      try {
        dataUrl = await readFileAsDataUrl(file);
      } catch (err) {
        onValidationFailure(
          'ERR-01',
          `ERR-01: Failed to read "${file.name}" (${err instanceof Error ? err.message : 'I/O error'}).`,
          'Select a readable JPG, PNG, or WEBP package image (max 10 MB).',
        );
        return;
      }

      const bytes = decodeBase64ToBytes(dataUrl);
      const bufferCheck = validateImageBuffer({
        fileName: file.name,
        mimeType: file.type,
        bytes,
      });

      if (!bufferCheck.valid) {
        onValidationFailure(
          'ERR-01',
          bufferCheck.errorMessage || `ERR-01: Invalid package image "${file.name}".`,
          bufferCheck.guidance || 'Upload an uncorrupted JPG, PNG, or WEBP image under 10 MB.',
        );
        return;
      }

      const decodeCheck = await verifyBrowserImageDecode(file);
      if (!decodeCheck.readable) {
        onValidationFailure(
          'ERR-01',
          decodeCheck.errorMessage || `ERR-01: Corrupt image decode for "${file.name}".`,
          'Re-export or upload a valid, uncorrupted JPG, PNG, or WEBP image.',
        );
        return;
      }

      const defaultSide: PackageSideLabel =
        stagedSides.length + i === 0
          ? 'FRONT_PDP'
          : stagedSides.length + i === 1
            ? 'BACK_STATUTORY'
            : 'SIDE_PANEL';

      validatedUploads.push({
        imageId: `upload-${Date.now()}-${i}`,
        fileName: file.name,
        mimeType: file.type || (bufferCheck.detectedFormat === 'PNG' ? 'image/png' : 'image/jpeg'),
        sizeBytes: bytes.length,
        sideLabel: defaultSide,
        dataUrl,
        widthPx: decodeCheck.widthPx,
        heightPx: decodeCheck.heightPx,
      });
    }

    onClearError();
    setStagedSides((prev) => [...prev, ...validatedUploads]);
  };

  const handleUpdateSideLabel = (imageId: string, sideLabel: PackageSideLabel) => {
    setStagedSides((prev) =>
      prev.map((s) => (s.imageId === imageId ? { ...s, sideLabel } : s)),
    );
  };

  const handleRemoveStagedSide = (imageId: string) => {
    setStagedSides((prev) => prev.filter((s) => s.imageId !== imageId));
  };

  const handleRunStagedAnalysis = async () => {
    if (stagedSides.length === 0) return;
    await onAnalyzeMultiSide({
      sourceMode: 'upload',
      images: stagedSides.map((s) => ({
        imageId: s.imageId,
        fileName: s.fileName,
        mimeType: s.mimeType,
        sideLabel: s.sideLabel,
        imageBase64: s.dataUrl,
      })),
    });
  };

  const handleDownloadJson = () => {
    const exportPayload = {
      disclaimer: MANDATORY_SCREENING_DISCLAIMER,
      ...report,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labelsure-report-${report.analysisId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const overallColor =
    report.processingState === 'FAILED'
      ? 'border-red-300 bg-red-50 text-red-900'
      : report.overallStatus === 'PASS'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
        : report.overallStatus === 'FAIL'
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-amber-300 bg-amber-50 text-amber-900';

  return (
    <div className="space-y-6">
      {/* Hidden multi-file input (JPG/PNG/WEBP, max 10 MB per image) */}
      <input
        ref={uploadTriggerRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={handleFilesSelected}
        className="hidden"
        aria-label="Upload multi-side package label images"
      />

      {/* Layer 1: Multi-Side Intake & Product Context */}
      <section
        aria-label="Multi-side package intake and regulatory context"
        className="no-print rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 shadow-[0_1px_3px_rgba(46,46,46,0.04)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDD5CD]/80 pb-4">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-[#2E2E2E]">
              LabelSure — From Package Label to Proof
            </h1>
            <p className="text-xs text-[#2E2E2E]/75">
              Multi-side packaged commodity screening under LMPC Rules 2011 &amp; FSSAI 2020 ·
              Accepted formats: <span className="font-mono font-semibold text-[#2E2E2E]">JPG, PNG, WEBP</span> ·
              Max upload: <span className="font-mono font-semibold text-[#2E2E2E]">10 MB per image</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => uploadTriggerRef.current?.click()}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7D4047] px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#663238] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              Add Package Side Image(s)
            </button>
            {stagedSides.length > 0 && (
              <button
                type="button"
                onClick={handleRunStagedAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2E2E2E] px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#2E2E2E]/90 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                Run 6-Stage Analysis ({stagedSides.length} side{stagedSides.length === 1 ? '' : 's'})
              </button>
            )}
            <button
              type="button"
              onClick={onResetGoldenSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-2 text-xs font-medium text-[#2E2E2E] hover:bg-[#DDD5CD]/50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Golden Sample
            </button>
          </div>
        </div>

        {/* Staged Multi-Side Images Queue */}
        {stagedSides.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#DDD5CD] bg-[#F1ECE6] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#2E2E2E]">
                Staged Package Sides ({stagedSides.length}) — Validated (Magic Bytes &amp; Decode OK)
              </span>
              <button
                type="button"
                onClick={() => setStagedSides([])}
                className="text-xs font-medium text-[#7D4047] hover:underline"
              >
                Clear Staged
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stagedSides.map((side) => (
                <div
                  key={side.imageId}
                  className="flex items-center gap-3 rounded-lg border border-[#DDD5CD] bg-[#FAF7F2] p-2"
                >
                  <img
                    src={side.dataUrl}
                    alt={side.fileName}
                    className="h-12 w-12 rounded border border-[#DDD5CD] object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-mono text-[11px] font-medium text-[#2E2E2E]">
                      {side.fileName}
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Package side label for ${side.fileName}`}
                        value={side.sideLabel}
                        onChange={(e) =>
                          handleUpdateSideLabel(side.imageId, e.target.value as PackageSideLabel)
                        }
                        className="rounded border border-[#DDD5CD] bg-[#F1ECE6] px-1.5 py-0.5 text-[11px] text-[#2E2E2E]"
                      >
                        {SIDE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="font-mono text-[10px] tabular-nums text-[#2E2E2E]/65">
                        {(side.sizeBytes / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveStagedSide(side.imageId)}
                    aria-label={`Remove ${side.fileName}`}
                    className="rounded p-1 text-[#2E2E2E]/50 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Context & PDP Area Selectors */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="ctx-brand" className="block text-[11px] font-medium text-[#2E2E2E]/75">
              Brand / Manufacturer
            </label>
            <input
              id="ctx-brand"
              type="text"
              value={productContext.brand}
              onChange={(e) => onChangeContext({ ...productContext, brand: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1.5 text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="ctx-category" className="block text-[11px] font-medium text-[#2E2E2E]/75">
              Product Category (Rule Applicability)
            </label>
            <select
              id="ctx-category"
              value={productContext.category}
              onChange={(e) =>
                onChangeContext({
                  ...productContext,
                  category: e.target.value as ProductContext['category'],
                })
              }
              className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1.5 text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
            >
              <option value="Packaged Food">Packaged Food</option>
              <option value="Beverages">Beverages</option>
              <option value="Cosmetics">Cosmetics</option>
              <option value="Electronics">Electronics</option>
              <option value="Household">Household</option>
            </select>
          </div>
          <div>
            <label htmlFor="ctx-origin" className="block text-[11px] font-medium text-[#2E2E2E]/75">
              Country of Origin
            </label>
            <input
              id="ctx-origin"
              type="text"
              value={productContext.countryOfOrigin}
              onChange={(e) =>
                onChangeContext({ ...productContext, countryOfOrigin: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1.5 text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="ctx-state" className="block text-[11px] font-medium text-[#2E2E2E]/75">
              Regulatory Jurisdiction
            </label>
            <select
              id="ctx-state"
              value={productContext.stateJurisdiction}
              onChange={(e) =>
                onChangeContext({ ...productContext, stateJurisdiction: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1.5 text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
            >
              <option value="Madhya Pradesh (Central LMPC 2011 + FSSAI 2020)">
                Madhya Pradesh (LMPC + FSSAI)
              </option>
              <option value="Maharashtra (Central LMPC 2011 + FSSAI 2020)">
                Maharashtra (LMPC + FSSAI)
              </option>
              <option value="Delhi NCR (Central LMPC 2011 + FSSAI 2020)">
                Delhi NCR (LMPC + FSSAI)
              </option>
              <option value="Karnataka (Central LMPC 2011 + FSSAI 2020)">
                Karnataka (LMPC + FSSAI)
              </option>
              <option value="Gujarat (Central LMPC 2011 + FSSAI 2020)">
                Gujarat (LMPC + FSSAI)
              </option>
            </select>
          </div>
          <div>
            <label htmlFor="ctx-pdp-area" className="block text-[11px] font-medium text-[#2E2E2E]/75">
              PDP Area (cm²) · Min {report.requiredFontHeightMm.toFixed(1)}mm
            </label>
            <input
              id="ctx-pdp-area"
              type="number"
              min="10"
              max="2000"
              value={productContext.pdpAreaCm2 ?? 150}
              onChange={(e) =>
                onChangeContext({
                  ...productContext,
                  pdpAreaCm2: Math.max(10, Number(e.target.value) || 150),
                })
              }
              className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1.5 font-mono text-xs tabular-nums text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
            />
          </div>
        </div>

        {/* Sample Presets & SRS Acceptance Test Fixtures Strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD5CD]/80 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2E2E2E]">
              <FlaskConical className="h-3.5 w-3.5 text-[#7D4047]" />
              SRS Fixtures:
            </span>
            {SRS_ACCEPTANCE_FIXTURES.filter((f) => f.id !== 'AT-10').map((fixture) => (
              <button
                key={fixture.id}
                type="button"
                disabled={isAnalyzing}
                data-testid={`fixture-btn-${fixture.id}`}
                onClick={() => onRunAcceptanceFixture(fixture.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  report.fixtureId === fixture.id
                    ? 'border-[#7D4047] bg-[#7D4047] text-[#FAF7F2] font-semibold'
                    : 'border-[#DDD5CD] bg-[#F1ECE6] text-[#2E2E2E] hover:bg-[#DDD5CD]/60'
                }`}
              >
                {fixture.id === 'AT-01'
                  ? 'AT-01/06 Non-Compliant'
                  : fixture.id === 'AT-02'
                    ? 'AT-02 Corrupt Upload'
                    : fixture.id === 'AT-04'
                      ? 'AT-04 Missing Fields'
                      : fixture.id === 'AT-05'
                        ? 'AT-05 Fully Compliant'
                        : 'AT-07 Low-Conf / Glare'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[#2E2E2E]/65">AI Sample Packs:</span>
            {SAMPLE_PRESET_IMAGES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                disabled={isAnalyzing}
                onClick={() =>
                  onAnalyzeMultiSide({
                    sourceMode: 'sample_preset',
                    contextOverride: sample.context,
                    images: [
                      {
                        imageId: sample.id,
                        fileName: `${sample.id}.jpg`,
                        mimeType: 'image/jpeg',
                        sideLabel: sample.sideLabel,
                        presetImagePath: sample.imageUrl,
                      },
                    ],
                  })
                }
                className="rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1 text-xs font-medium text-[#2E2E2E] hover:bg-[#DDD5CD]/60 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {sample.title}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Mandatory BR-06 Screening Disclaimer Banner (Screen + Print) */}
      <div
        role="note"
        data-testid="br06-disclaimer"
        className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 shadow-[0_1px_2px_rgba(46,46,46,0.03)]"
      >
        <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        <p className="leading-relaxed font-medium">{MANDATORY_SCREENING_DISCLAIMER}</p>
      </div>

      {/* 6-Stage Processing Pipeline Stepper */}
      <PipelineStepper
        analysisId={report.analysisId}
        ruleSetVersionId={report.ruleSetVersionId}
        processingState={isAnalyzing ? 'PROCESSING' : report.processingState}
        stages={report.pipelineStages}
      />

      {/* Loading / Actionable Validation Error Banner */}
      {isAnalyzing && (
        <div className="flex items-center gap-3 rounded-xl border border-[#7D4047]/35 bg-[#7D4047]/10 px-4 py-3 text-xs text-[#2E2E2E]">
          <Loader2 className="h-4 w-4 animate-spin text-[#7D4047] shrink-0" />
          <span>
            Executing Intake validation, multilingual OCR, structured field extraction, published
            rule selection, and deterministic screening evaluation...
          </span>
        </div>
      )}

      {(analyzeError || report.processingState === 'FAILED') && (
        <div
          role="alert"
          data-testid="pipeline-error-alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-900"
        >
          <div className="flex items-start gap-2.5">
            <XCircle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {report.errorDetail?.message || analyzeError}
              </p>
              {report.errorDetail?.guidance && (
                <p className="mt-1 text-red-800">
                  Actionable Guidance: {report.errorDetail.guidance}
                </p>
              )}
              <p className="mt-1 font-mono text-[11px] text-red-700">
                Processing State: FAILED · No false compliance verdict was generated (FR-022 / AT-02).
              </p>
            </div>
          </div>
          {analyzeError && (
            <button
              type="button"
              onClick={onClearError}
              aria-label="Dismiss error"
              className="rounded p-1 text-red-700 hover:bg-red-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Printable Header Summary (Visible in Print/PDF Export per FR-017 / BR-09 / AT-09) */}
      <section className="hidden print:block rounded-xl border border-[#DDD5CD] bg-white p-4 space-y-2 text-xs">
        <div className="flex items-start justify-between border-b border-[#DDD5CD] pb-2">
          <div>
            <h2 className="font-display text-base font-bold text-[#2E2E2E]">
              LabelSure — From Package Label to Proof (Screening Report)
            </h2>
            <p className="text-[#2E2E2E]/75">
              Brand: {report.productContext.brand} · Category: {report.productContext.category} ·
              Jurisdiction: {report.productContext.stateJurisdiction}
            </p>
          </div>
          <div className="text-right font-mono">
            <p>Analysis ID: {report.analysisId}</p>
            <p>Rule-Set Version: {report.ruleSetVersionId}</p>
            <p>Timestamp: {report.timestamp}</p>
          </div>
        </div>
        <p className="font-mono">
          Source Evidence Sides:{' '}
          {report.images.map((i) => `${i.sideLabel} (${i.fileName})`).join(', ') || 'Golden Sample Proof'}
        </p>
      </section>

      {/* Only render Verdict & Evidence/Report when processingState is NOT FAILED */}
      {report.processingState !== 'FAILED' && (
        <>
          {/* Overall Report Verdict Summary Strip */}
          <section
            aria-label="Compliance verdict summary"
            className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-4 py-3 shadow-[0_1px_2px_rgba(46,46,46,0.03)] ${overallColor}`}
          >
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-[11px] font-medium opacity-80">Overall Screening Verdict</span>
                <div className="flex items-center gap-2">
                  {report.overallStatus === 'PASS' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                  ) : report.overallStatus === 'FAIL' ? (
                    <XCircle className="h-5 w-5 text-red-700" />
                  ) : (
                    <FileWarning className="h-5 w-5 text-amber-700" />
                  )}
                  <p
                    data-testid="overall-report-status"
                    className="font-display text-base font-bold tracking-tight"
                  >
                    {report.overallStatus}
                  </p>
                </div>
              </div>
              <div className="h-8 w-px bg-current opacity-20 hidden sm:block" />
              <div className="text-xs space-x-2 tabular-nums">
                <span className="font-semibold">{report.summaryCounts.pass} Pass</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold">{report.summaryCounts.fail} Fail</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold">{report.summaryCounts.unverified} Unverified</span>
                {report.summaryCounts.warning > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold">{report.summaryCounts.warning} Warning</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  Rule-Set {report.ruleSetVersionId}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  Avg Conf {(report.overallConfidence * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="no-print flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD5CD] bg-[#FAF7F2] px-3 py-1.5 text-xs font-medium text-[#2E2E2E] hover:bg-[#F1ECE6] whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2E2E2E] px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#2E2E2E]/90 whitespace-nowrap shrink-0"
              >
                <Printer className="h-3.5 w-3.5" />
                Printable PDF Report
              </button>
            </div>
          </section>

          {/* Main 2-Column Inspection Workspace */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* Left Column: Multi-Side Visual Evidence Canvas + OCR/Rule Metadata */}
            <div className="space-y-6 lg:col-span-6">
              <PackageEvidenceCanvas
                sourceMode={report.sourceMode}
                images={report.images}
                checkpoints={report.checkpoints}
                selectedFieldId={selectedFieldId}
                onSelectField={setSelectedFieldId}
              />

              {/* Stage 2 & Stage 4 Metadata Summary Card */}
              <section
                aria-label="OCR and rule selection trace"
                className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 space-y-3 shadow-[0_1px_3px_rgba(46,46,46,0.04)]"
              >
                <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
                  OCR Engine &amp; Applicable Rule Selection Trace
                </h2>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#2E2E2E]/65 block">OCR Engine &amp; Version</span>
                    <span className="font-mono font-medium text-[#2E2E2E]">
                      {report.ocrMetadata.engine} ({report.ocrMetadata.engineVersion})
                    </span>
                  </div>
                  <div>
                    <span className="text-[#2E2E2E]/65 block">Published Rule-Set Version</span>
                    <span className="font-mono font-semibold text-[#7D4047]">
                      {report.ruleSetVersionId}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#2E2E2E]/65 block">Selected Active Rules</span>
                    <span className="font-mono tabular-nums text-[#2E2E2E]">
                      {report.selectedRuleIds.length} rules for {report.productContext.category}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#2E2E2E]/65 block">Second Schedule Min Font</span>
                    <span className="font-mono tabular-nums text-[#2E2E2E]">
                      {report.requiredFontHeightMm.toFixed(1)} mm (PDP {report.pdpAreaCm2} cm²)
                    </span>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Explainable Rule & Checkpoint Ledger */}
            <section
              aria-labelledby="checkpoint-ledger-heading"
              className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)] lg:col-span-6"
            >
              <div className="flex items-center justify-between border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
                <div>
                  <h2
                    id="checkpoint-ledger-heading"
                    className="font-display text-sm font-semibold text-[#2E2E2E]"
                  >
                    Rule-Wise Evaluation &amp; Explainable Report
                  </h2>
                  <p className="text-xs text-[#2E2E2E]/70">
                    Analysis <span className="font-mono text-[#2E2E2E]">{report.analysisId}</span> · Threshold: 85%
                    HITL gate · Non-guessing policy
                  </p>
                </div>
                <span className="font-mono text-xs tabular-nums text-[#2E2E2E]/70">
                  {report.checkpoints.length} fields
                </span>
              </div>

              <div className="divide-y divide-[#DDD5CD]">
                {report.checkpoints.map((cp) => {
                  const display = STATUS_DISPLAY[cp.status];
                  const extBadge = EXTRACTION_LABELS[cp.extractionStatus];
                  const isSelected = selectedFieldId === cp.fieldId;
                  return (
                    <div
                      key={cp.fieldId}
                      data-testid={`checkpoint-${cp.key}`}
                      onClick={() => setSelectedFieldId(cp.fieldId)}
                      className={`cursor-pointer p-4 transition-colors ${display.rowTint} ${
                        isSelected
                          ? 'ring-2 ring-inset ring-[#7D4047] bg-[#7D4047]/5'
                          : 'hover:bg-[#F1ECE6]/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${display.badgeClass}`}
                            >
                              {display.icon}
                              <span>{display.label}</span>
                            </span>
                            <h3 className="font-display text-sm font-semibold text-[#2E2E2E]">
                              {cp.label}
                            </h3>
                            <span className={`font-mono text-[11px] ${extBadge.styleClass}`}>
                              [{extBadge.label}]
                            </span>
                          </div>

                          {/* Unboxed metadata row */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#2E2E2E]/65">
                            <span className="font-mono text-[11px]">
                              {cp.sourceSideLabel ?? 'PANEL'} · {cp.region}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Conf {(cp.confidence * 100).toFixed(0)}%
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px] text-[#7D4047] font-medium">
                              {cp.ruleId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{cp.regulationCitation}</span>
                          </div>
                        </div>
                      </div>

                      {/* Extracted OCR Value */}
                      <div className="mt-2.5 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-2 font-mono text-xs text-[#2E2E2E] break-words">
                        {cp.normalizedText}
                      </div>

                      {cp.glareNormalized && (
                        <p className="mt-1.5 text-xs text-[#7D4047]">
                          Glare Normalization Applied: Raw foil read{' '}
                          <span className="font-mono font-semibold">{cp.glareRawSample}</span> corrected
                          deterministically.
                        </p>
                      )}

                      <p className="mt-2 text-xs leading-relaxed text-[#2E2E2E]/85">
                        <span className="font-semibold text-[#2E2E2E]">Rationale:</span>{' '}
                        {cp.rationale}
                      </p>

                      <p className="mt-1 font-mono text-[11px] text-[#2E2E2E]/65">
                        Trace: {cp.evaluationTrace}
                      </p>

                      {cp.correctiveAction && (
                        <p className="mt-1.5 text-xs leading-relaxed text-red-900">
                          <span className="font-semibold">Corrective Suggestion:</span>{' '}
                          {cp.correctiveAction}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};
