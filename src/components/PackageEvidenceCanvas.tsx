import React, { useState } from 'react';
import { Eye, EyeOff, PackageCheck, ZoomIn, ZoomOut } from 'lucide-react';
import type { ComplianceCheckpoint, ComplianceStatus } from '../types/compliance';

interface PackageEvidenceCanvasProps {
  sourceMode: 'golden_sample' | 'upload' | 'camera' | 'sample_preset';
  imageUrl?: string;
  checkpoints: ComplianceCheckpoint[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
}

type BoxFilter = 'ALL' | 'PASS' | 'FAIL' | 'UNVERIFIED';

const STATUS_BOX_STYLES: Record<
  ComplianceStatus,
  { border: string; bg: string; tagBg: string; label: string }
> = {
  PASS: {
    border: 'border-emerald-600',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    tagBg: 'bg-emerald-700 text-white',
    label: 'PASS',
  },
  FAIL: {
    border: 'border-red-600',
    bg: 'bg-red-500/15 hover:bg-red-500/25',
    tagBg: 'bg-red-700 text-white',
    label: 'FAIL',
  },
  WARNING: {
    border: 'border-amber-600',
    bg: 'bg-amber-500/15 hover:bg-amber-500/25',
    tagBg: 'bg-amber-700 text-white',
    label: 'WARN',
  },
  UNVERIFIED: {
    border: 'border-amber-600 border-dashed',
    bg: 'bg-amber-500/15 hover:bg-amber-500/25',
    tagBg: 'bg-amber-700 text-white',
    label: 'UNVERIFIED',
  },
};

export const PackageEvidenceCanvas: React.FC<PackageEvidenceCanvasProps> = ({
  sourceMode,
  imageUrl,
  checkpoints,
  selectedFieldId,
  onSelectField,
}) => {
  const [showBoxes, setShowBoxes] = useState(true);
  const [boxFilter, setBoxFilter] = useState<BoxFilter>('ALL');
  const [zoomed, setZoomed] = useState(false);
  const [imgError, setImgError] = useState(false);

  const visibleCheckpoints = checkpoints.filter((cp) => {
    if (!showBoxes) return false;
    if (boxFilter === 'ALL') return true;
    if (boxFilter === 'UNVERIFIED') {
      return cp.status === 'UNVERIFIED' || cp.status === 'WARNING';
    }
    return cp.status === boxFilter;
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Visual Evidence Canvas
          </h2>
          <p className="text-xs text-slate-500">
            Click any bounding box to inspect rule citation and OCR metrics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Bounding box status filter"
            className="flex items-center rounded-md bg-slate-100 p-0.5"
          >
            {(['ALL', 'PASS', 'FAIL', 'UNVERIFIED'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setBoxFilter(f)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  boxFilter === f
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
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
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {showBoxes ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showBoxes ? 'Boxes On' : 'Boxes Off'}
          </button>

          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? 'Reset evidence zoom' : 'Zoom in evidence canvas'}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {zoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
            {zoomed ? '100%' : '125%'}
          </button>
        </div>
      </div>

      {/* Evidence Surface */}
      <div className="overflow-auto bg-slate-100/80 p-4 sm:p-6">
        <div
          data-testid="evidence-canvas-stage"
          className={`relative mx-auto overflow-hidden rounded-md border border-slate-300 bg-white transition-transform duration-200 origin-top ${
            zoomed ? 'max-w-[780px]' : 'max-w-[620px]'
          }`}
          style={{ aspectRatio: '3 / 4' }}
        >
          {sourceMode === 'golden_sample' || !imageUrl || imgError ? (
            /* High-fidelity deterministic Golden Sample foil label proof sheet */
            <div className="relative h-full w-full select-none bg-gradient-to-br from-amber-50 via-stone-50 to-amber-100/70 p-0 text-slate-900">
              {/* Foil seam top & bottom decoration */}
              <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-r from-amber-300/60 via-amber-100 to-amber-300/60 border-b border-amber-300/70" />
              <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-r from-amber-300/60 via-amber-100 to-amber-300/60 border-t border-amber-300/70" />

              {imgError && imageUrl ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                  <PackageCheck className="h-10 w-10 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">
                    Uploaded package preview unavailable
                  </p>
                  <p className="text-xs text-slate-500">
                    Extracted bounding boxes remain active below.
                  </p>
                </div>
              ) : (
                <div className="relative h-full w-full font-sans">
                  {/* PRODUCT_HEADER (x: 70-930, y: 55-145) */}
                  <div
                    className="absolute flex flex-col justify-center rounded border border-amber-300/80 bg-amber-400/20 px-3"
                    style={{ left: '7%', top: '5.5%', width: '86%', height: '9%' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-950">
                        POTATO CHIPS — CLASSIC SALTED
                      </span>
                      <span className="inline-flex h-4 w-4 items-center justify-center border border-emerald-700 bg-white">
                        <span className="h-2 w-2 rounded-full bg-emerald-700" />
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-600">
                      Crispy Kettle-Cooked Namkeen · Ready to Eat Savoury
                    </span>
                  </div>

                  {/* STATUTORY_PANEL Net Weight (x: 70-455, y: 175-235) */}
                  <div
                    className="absolute flex items-center rounded border border-slate-300 bg-white/90 px-2.5"
                    style={{ left: '7%', top: '17.5%', width: '38.5%', height: '6%' }}
                  >
                    <span className="font-mono text-xs sm:text-sm font-bold text-slate-900">
                      NET WEIGHT: 120g
                    </span>
                  </div>

                  {/* STATUTORY_PANEL MRP & USP (x: 70-455, y: 268-354) */}
                  <div
                    className="absolute flex flex-col justify-center rounded border border-slate-300 bg-white/90 px-2.5 leading-tight"
                    style={{ left: '7%', top: '26.8%', width: '38.5%', height: '8.6%' }}
                  >
                    <span className="font-mono text-[11px] sm:text-xs font-bold text-slate-900">
                      MRP ₹ 40.00
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-semibold text-slate-700">
                      (INCL. OF ALL TAXES)
                    </span>
                    <span className="font-mono text-[9px] sm:text-[10px] text-slate-600">
                      USP ₹ 0.33 per g
                    </span>
                  </div>

                  {/* DATE_BOX MFD & USE BY with foil glare shimmer (x: 485-930, y: 175-265) */}
                  <div
                    className="absolute flex flex-col justify-center rounded border border-slate-300 bg-gradient-to-tr from-slate-200/90 via-white to-slate-200/80 px-2.5 leading-tight"
                    style={{ left: '48.5%', top: '17.5%', width: '44.5%', height: '9%' }}
                  >
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-slate-800">
                      MFD: 01/0S/202S
                    </span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-slate-800">
                      USE BY: 31/10/2025
                    </span>
                  </div>

                  {/* DATE_BOX Batch No (x: 485-930, y: 275-345) */}
                  <div
                    className="absolute flex items-center rounded border border-slate-300 bg-white/90 px-2.5"
                    style={{ left: '48.5%', top: '27.5%', width: '44.5%', height: '7%' }}
                  >
                    <span className="font-mono text-[10px] sm:text-xs font-semibold text-slate-800">
                      BATCH NO.: A12345
                    </span>
                  </div>

                  {/* INGREDIENTS_BOX (x: 70-930, y: 380-555) */}
                  <div
                    className="absolute flex flex-col justify-between rounded border border-slate-300 bg-white/90 p-2.5 text-[10px] sm:text-[11px] leading-snug text-slate-800"
                    style={{ left: '7%', top: '38%', width: '86%', height: '17.5%' }}
                  >
                    <p>
                      <strong className="font-semibold text-slate-950">INGREDIENTS:</strong> Potato
                      (62%), Edible Vegetable Oil (Palmolein), Iodised Salt, CONTAINS ADDED FLAVOUR
                      (Natural &amp; Nature Identical Flavouring Substances).
                    </p>
                    <p className="font-mono text-[10px] font-semibold text-red-800">
                      fssai Lic. No. 1001402202711
                    </p>
                  </div>

                  {/* MANUFACTURER_BOX FSSAI (x: 70-455, y: 585-685) */}
                  <div
                    className="absolute flex flex-col justify-center rounded border border-slate-300 bg-white/90 px-2.5"
                    style={{ left: '7%', top: '58.5%', width: '38.5%', height: '10%' }}
                  >
                    <span className="font-display text-xs italic font-bold text-slate-900">
                      fssai
                    </span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-slate-800">
                      Lic. No. 1001402202711
                    </span>
                  </div>

                  {/* Mini Nutrition Table on Right of FSSAI for visual balance */}
                  <div
                    className="absolute flex flex-col justify-center rounded border border-slate-300 bg-white/85 px-2.5 py-1 text-[9px] text-slate-700"
                    style={{ left: '48.5%', top: '58.5%', width: '44.5%', height: '10%' }}
                  >
                    <span className="font-semibold text-slate-900">
                      NUTRITION INFO (per 100g)
                    </span>
                    <span className="font-mono tabular-nums">
                      Energy 536 kcal · Fat 34g · Sat.Fat 14.2g
                    </span>
                    <span className="font-mono tabular-nums">
                      Protein 6.5g · Sodium 680mg
                    </span>
                  </div>

                  {/* MANUFACTURER_BOX Address & PIN (x: 70-930, y: 695-810) */}
                  <div
                    className="absolute flex flex-col justify-center rounded border border-slate-300 bg-white/90 px-2.5 text-[10px] sm:text-[11px] leading-snug text-slate-800"
                    style={{ left: '7%', top: '69.5%', width: '86%', height: '11.5%' }}
                  >
                    <span className="font-semibold text-slate-950">
                      MANUFACTURED &amp; PACKED BY:
                    </span>
                    <span>ABC Foods Pvt. Ltd., 123, Industrial Area, Indore-452001, India</span>
                  </div>

                  {/* Barcode Footer */}
                  <div
                    className="absolute flex items-center justify-between px-1 text-[9px] text-slate-600"
                    style={{ left: '7%', top: '84%', width: '86%', height: '10%' }}
                  >
                    <div className="flex flex-col">
                      <div className="flex h-7 items-end gap-[2px]">
                        {[2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2].map(
                          (w, i) => (
                            <span
                              key={i}
                              className="inline-block bg-slate-900"
                              style={{ width: `${w}px`, height: i % 3 === 0 ? '26px' : '22px' }}
                            />
                          ),
                        )}
                      </div>
                      <span className="font-mono text-[9px] tracking-widest text-slate-800">
                        8 901491 101837
                      </span>
                    </div>
                    <span className="text-right text-[9px] font-medium text-slate-600">
                      Store in a cool, dry place · Made in India
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <img
              src={imageUrl}
              alt="Inspected commodity packaging label"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-contain bg-slate-950/5"
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
                className={`group absolute rounded-xs border-2 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-700 ${
                  style.border
                } ${style.bg} ${
                  isSelected ? 'ring-2 ring-blue-700 ring-offset-1 z-20' : 'z-10'
                }`}
              >
                <span
                  className={`absolute -top-4 left-0 inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none tracking-tight shadow-xs whitespace-nowrap ${style.tagBg}`}
                >
                  {style.label} · {(cp.confidence * 100).toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs border-2 border-emerald-600 bg-emerald-500/20" />
            Green: Pass
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs border-2 border-red-600 bg-red-500/20" />
            Red: Fail
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs border-2 border-dashed border-amber-600 bg-amber-500/20" />
            Amber: Unverified (&lt;85% HITL)
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-slate-500">
          {visibleCheckpoints.length} / {checkpoints.length} boxes displayed
        </span>
      </div>
    </div>
  );
};
