import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileWarning,
  Layers,
  PackageCheck,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AnalysisImage,
  ComplianceCheckpoint,
  ComplianceStatus,
  PackageSideLabel,
} from '../types/compliance';

interface PackageEvidenceCanvasProps {
  sourceMode: 'golden_sample' | 'upload' | 'sample_preset' | 'acceptance_fixture';
  images: AnalysisImage[];
  checkpoints: ComplianceCheckpoint[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
}

type BoxFilter = 'ALL' | 'PASS' | 'FAIL' | 'UNVERIFIED';

const SIDE_LABELS_HUMAN: Record<PackageSideLabel, string> = {
  FRONT_PDP: 'Front PDP',
  BACK_STATUTORY: 'Back Statutory',
  SIDE_PANEL: 'Side Panel',
  TOP_LID: 'Top / Lid',
};

const STATUS_BOX_STYLES: Record<
  ComplianceStatus,
  { border: string; bg: string; tagBg: string; label: string; icon: React.ReactNode }
> = {
  PASS: {
    border: 'border-emerald-700',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    tagBg: 'bg-emerald-700 text-white',
    label: 'PASS',
    icon: <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />,
  },
  FAIL: {
    border: 'border-red-700',
    bg: 'bg-red-500/15 hover:bg-red-500/25',
    tagBg: 'bg-red-700 text-white',
    label: 'FAIL',
    icon: <XCircle className="h-2.5 w-2.5 shrink-0" />,
  },
  WARNING: {
    border: 'border-amber-700',
    bg: 'bg-amber-500/15 hover:bg-amber-500/25',
    tagBg: 'bg-amber-700 text-white',
    label: 'WARN',
    icon: <AlertTriangle className="h-2.5 w-2.5 shrink-0" />,
  },
  UNVERIFIED: {
    border: 'border-amber-700 border-dashed',
    bg: 'bg-amber-500/15 hover:bg-amber-500/25',
    tagBg: 'bg-amber-700 text-white',
    label: 'UNVERIFIED',
    icon: <FileWarning className="h-2.5 w-2.5 shrink-0" />,
  },
};

export const PackageEvidenceCanvas: React.FC<PackageEvidenceCanvasProps> = ({
  sourceMode,
  images,
  checkpoints,
  selectedFieldId,
  onSelectField,
}) => {
  const [showBoxes, setShowBoxes] = useState(true);
  const [boxFilter, setBoxFilter] = useState<BoxFilter>('ALL');
  const [zoomed, setZoomed] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string>(images[0]?.imageId ?? '');

  useEffect(() => {
    setImgError(false);
    if (images.length > 0 && !images.some((i) => i.imageId === activeImageId)) {
      setActiveImageId(images[0].imageId);
    }
  }, [images, activeImageId]);

  // Auto-sync displayed side when user selects a checkpoint on another package side
  useEffect(() => {
    if (!selectedFieldId) return;
    const selectedCp = checkpoints.find((c) => c.fieldId === selectedFieldId);
    if (!selectedCp) return;
    const matchedById = images.find((i) => i.imageId === selectedCp.sourceImageId);
    const matchedBySide = images.find((i) => i.sideLabel === selectedCp.sourceSideLabel);
    const target = matchedById ?? matchedBySide;
    if (target) {
      setActiveImageId(target.imageId);
    }
  }, [selectedFieldId, checkpoints, images]);

  const activeImage = images.find((i) => i.imageId === activeImageId) ?? images[0];
  const isSyntheticProof =
    !activeImage ||
    activeImage.previewUrl.startsWith('golden://') ||
    sourceMode === 'golden_sample' ||
    sourceMode === 'acceptance_fixture';

  const matchesActiveSide = (cp: ComplianceCheckpoint): boolean => {
    if (images.length <= 1 || !activeImage) return true;
    if (cp.sourceImageId && images.some((i) => i.imageId === cp.sourceImageId)) {
      return cp.sourceImageId === activeImage.imageId;
    }
    if (cp.sourceSideLabel) {
      return cp.sourceSideLabel === activeImage.sideLabel;
    }
    return true;
  };

  const visibleCheckpoints = checkpoints.filter((cp) => {
    if (!showBoxes) return false;
    if (cp.extractionStatus === 'MISSING') return false;
    if (!matchesActiveSide(cp)) return false;
    if (boxFilter === 'ALL') return true;
    if (boxFilter === 'UNVERIFIED') {
      return cp.status === 'UNVERIFIED' || cp.status === 'WARNING';
    }
    return cp.status === boxFilter;
  });

  return (
    <div className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
      {/* Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD5CD] px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
            Visual Evidence Canvas
          </h2>
          <p className="text-xs text-[#2E2E2E]/70">
            Multi-side evidence viewer · Click any bounding box to trace rule rationale
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Bounding box status filter"
            className="flex items-center rounded-lg border border-[#DDD5CD] bg-[#DDD5CD]/45 p-0.5"
          >
            {(['ALL', 'PASS', 'FAIL', 'UNVERIFIED'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setBoxFilter(f)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  boxFilter === f
                    ? 'bg-[#7D4047] text-[#FAF7F2] font-semibold shadow-xs'
                    : 'text-[#2E2E2E]/80 hover:text-[#2E2E2E]'
                }`}
              >
                {f === 'ALL' ? 'All Boxes' : f}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowBoxes((v) => !v)}
            aria-pressed={showBoxes}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1.5 text-xs font-medium text-[#2E2E2E] hover:bg-[#DDD5CD]/50 whitespace-nowrap shrink-0"
          >
            {showBoxes ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showBoxes ? 'Boxes On' : 'Boxes Off'}
          </button>

          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? 'Reset evidence zoom' : 'Zoom in evidence canvas'}
            className="inline-flex items-center gap-1 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1.5 text-xs font-medium text-[#2E2E2E] hover:bg-[#DDD5CD]/50 whitespace-nowrap shrink-0"
          >
            {zoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
            {zoomed ? '100%' : '125%'}
          </button>
        </div>
      </div>

      {/* Multi-Side Switcher Bar */}
      {images.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2E2E2E]/75 mr-1">
              <Layers className="h-3.5 w-3.5 text-[#7D4047]" />
              Package Sides ({images.length}):
            </span>
            {images.map((img) => {
              const isActive = activeImage?.imageId === img.imageId;
              return (
                <button
                  key={img.imageId}
                  type="button"
                  onClick={() => {
                    setActiveImageId(img.imageId);
                    setImgError(false);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'border-[#7D4047] bg-[#7D4047] text-[#FAF7F2] font-semibold'
                      : 'border-[#DDD5CD] bg-[#FAF7F2] text-[#2E2E2E] hover:bg-[#DDD5CD]/50'
                  }`}
                >
                  {SIDE_LABELS_HUMAN[img.sideLabel]}
                </button>
              );
            })}
          </div>
          {activeImage && (
            <span className="font-mono text-[11px] text-[#2E2E2E]/65 truncate max-w-[220px]">
              {activeImage.fileName}
            </span>
          )}
        </div>
      )}

      {/* Evidence Surface */}
      <div className="overflow-auto bg-[#F1ECE6] p-4 sm:p-6">
        <div
          data-testid="evidence-canvas-stage"
          className={`relative mx-auto overflow-hidden rounded-lg border border-[#DDD5CD] bg-[#FAF7F2] transition-transform duration-200 origin-top ${
            zoomed ? 'max-w-[780px]' : 'max-w-[620px]'
          }`}
          style={{ aspectRatio: '3 / 4' }}
        >
          {isSyntheticProof || !activeImage?.previewUrl || imgError ? (
            <div className="relative h-full w-full select-none bg-gradient-to-br from-[#FAF7F2] via-[#F1ECE6] to-[#DDD5CD]/60 p-0 text-[#2E2E2E]">
              <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-r from-[#7D4047]/30 via-[#DDD5CD] to-[#7D4047]/30 border-b border-[#DDD5CD]" />
              <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-r from-[#7D4047]/30 via-[#DDD5CD] to-[#7D4047]/30 border-t border-[#DDD5CD]" />

              {imgError && activeImage?.previewUrl ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                  <PackageCheck className="h-10 w-10 text-[#2E2E2E]/40" />
                  <p className="text-sm font-medium text-[#2E2E2E]">
                    Uploaded package preview unavailable
                  </p>
                  <p className="text-xs text-[#2E2E2E]/70">
                    Extracted bounding boxes remain active below.
                  </p>
                </div>
              ) : (
                <div className="relative h-full w-full font-sans">
                  {checkpoints
                    .filter((c) => c.extractionStatus !== 'MISSING' && matchesActiveSide(c))
                    .map((cp) => {
                      const left = `${cp.bbox.x_min / 10}%`;
                      const top = `${cp.bbox.y_min / 10}%`;
                      const width = `${Math.max(10, (cp.bbox.x_max - cp.bbox.x_min) / 10)}%`;
                      const height = `${Math.max(5, (cp.bbox.y_max - cp.bbox.y_min) / 10)}%`;

                      return (
                        <div
                          key={`proof-${cp.fieldId}`}
                          style={{ left, top, width, height }}
                          className={`absolute flex flex-col justify-center rounded border px-2.5 py-1 text-[#2E2E2E] ${
                            cp.region === 'PRODUCT_HEADER'
                              ? 'border-[#7D4047]/40 bg-[#7D4047]/10'
                              : cp.region === 'DATE_BOX'
                                ? 'border-[#DDD5CD] bg-gradient-to-tr from-[#DDD5CD]/80 via-[#FAF7F2] to-[#DDD5CD]/70'
                                : 'border-[#DDD5CD] bg-[#FAF7F2]/95'
                          }`}
                        >
                          <span className="font-mono text-[9px] font-semibold text-[#2E2E2E]/65">
                            {cp.label} ({cp.sourceSideLabel ?? 'PANEL'})
                          </span>
                          <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-[#2E2E2E] line-clamp-2">
                            {cp.rawText}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <img
              src={activeImage.previewUrl}
              alt={`Inspected package side: ${SIDE_LABELS_HUMAN[activeImage.sideLabel]}`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-contain bg-[#2E2E2E]/5"
            />
          )}

          {/* Bounding Box Overlay Layer */}
          {visibleCheckpoints.map((cp) => {
            const style = STATUS_BOX_STYLES[cp.status];
            const isSelected = selectedFieldId === cp.fieldId;
            const left = `${cp.bbox.x_min / 10}%`;
            const top = `${cp.bbox.y_min / 10}%`;
            const width = `${Math.max(8, (cp.bbox.x_max - cp.bbox.x_min) / 10)}%`;
            const height = `${Math.max(5, (cp.bbox.y_max - cp.bbox.y_min) / 10)}%`;

            return (
              <button
                key={cp.fieldId}
                type="button"
                onClick={() => onSelectField(cp.fieldId)}
                aria-label={`${cp.label} bounding box (${cp.status}, ${(cp.confidence * 100).toFixed(0)}% confidence)`}
                style={{ left, top, width, height }}
                className={`group absolute rounded-xs border-2 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#7D4047] ${
                  style.border
                } ${style.bg} ${
                  isSelected ? 'ring-2 ring-[#7D4047] ring-offset-1 z-20' : 'z-10'
                }`}
              >
                <span
                  className={`absolute -top-4 left-0 inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none tracking-tight shadow-xs whitespace-nowrap ${style.tagBg}`}
                >
                  {style.icon}
                  <span>
                    {style.label} · {(cp.confidence * 100).toFixed(0)}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accessible Legend Bar (Icon + Text + Border Pattern) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#DDD5CD] bg-[#FAF7F2] px-4 py-2.5 text-xs text-[#2E2E2E]/75">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
            <span>PASS (Solid)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-red-700" />
            <span>FAIL (Violation)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileWarning className="h-3.5 w-3.5 text-amber-700" />
            <span>UNVERIFIED (Dashed / &lt;85% HITL)</span>
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-[#2E2E2E]/65">
          {visibleCheckpoints.length} / {checkpoints.filter((c) => c.extractionStatus !== 'MISSING').length} boxes
        </span>
      </div>
    </div>
  );
};
