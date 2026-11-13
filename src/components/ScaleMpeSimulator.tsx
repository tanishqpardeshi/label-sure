import React from 'react';
import { RotateCcw, Scale } from 'lucide-react';
import { calculateMpeTolerance } from '../lib/complianceEngine';

interface ScaleMpeSimulatorProps {
  declaredGrams: number;
  measuredGrams: number;
  onChangeMeasuredGrams: (val: number) => void;
}

export const ScaleMpeSimulator: React.FC<ScaleMpeSimulatorProps> = ({
  declaredGrams,
  measuredGrams,
  onChangeMeasuredGrams,
}) => {
  const mpe = calculateMpeTolerance(declaredGrams, measuredGrams);
  const minSlider = Math.max(0, Number((declaredGrams * 0.85).toFixed(1)));
  const maxSlider = Number((declaredGrams * 1.1).toFixed(1));

  // Progress bar position from minAllowedGrams - 5g to declared + 5g
  const scaleSpan = Math.max(10, mpe.mpeToleranceGrams * 3);
  const rangeMin = declaredGrams - scaleSpan * 0.7;
  const rangeMax = declaredGrams + scaleSpan * 0.3;
  const pct = Math.max(
    0,
    Math.min(100, ((measuredGrams - rangeMin) / (rangeMax - rangeMin)) * 100),
  );
  const thresholdPct = Math.max(
    0,
    Math.min(100, ((mpe.minAllowedGrams - rangeMin) / (rangeMax - rangeMin)) * 100),
  );

  return (
    <section
      aria-labelledby="mpe-simulator-heading"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-slate-600" />
          <h3
            id="mpe-simulator-heading"
            className="font-display text-sm font-semibold text-slate-900"
          >
            IoT Weighing Scale — MPE Verifier
          </h3>
        </div>
        <button
          type="button"
          onClick={() => onChangeMeasuredGrams(declaredGrams)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <RotateCcw className="h-3 w-3" />
          Tare to {declaredGrams}g
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Hardware-styled metallic dark bezel digital scale display */}
        <div className="rounded-md border border-slate-700 bg-slate-900 p-4 text-slate-100">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <span className="block text-[11px] font-medium text-slate-400">
                Live Scale Reading (Net)
              </span>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
                <span
                  data-testid="scale-reading-value"
                  className={`text-3xl font-semibold tracking-tight ${
                    mpe.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {mpe.measuredGrams.toFixed(1)}
                </span>
                <span className="text-sm text-slate-400">g</span>
              </div>
            </div>

            <div className="text-right">
              <span className="block text-[11px] font-medium text-slate-400">
                MPE Verdict
              </span>
              <span
                data-testid="scale-mpe-status"
                className={`mt-1 inline-block font-mono text-sm font-semibold ${
                  mpe.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {mpe.status} · {mpe.deviationGrams >= 0 ? '+' : ''}
                {mpe.deviationGrams.toFixed(1)}g
              </span>
            </div>
          </div>

          {/* Tolerance bar */}
          <div className="mt-4">
            <div className="relative h-2.5 w-full overflow-hidden rounded-sm bg-slate-800">
              <div
                className="absolute inset-y-0 left-0 bg-red-900/60"
                style={{ width: `${thresholdPct}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-amber-400"
                style={{ left: `${thresholdPct}%` }}
                title={`Min Allowed: ${mpe.minAllowedGrams}g`}
              />
              <div
                className={`absolute top-0 h-2.5 w-2 -translate-x-1/2 rounded-xs ${
                  mpe.status === 'PASS' ? 'bg-emerald-400' : 'bg-red-500'
                }`}
                style={{ left: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-400">
              <span>Min Allowed: {mpe.minAllowedGrams.toFixed(1)}g</span>
              <span>Declared: {mpe.declaredGrams.toFixed(1)}g</span>
            </div>
          </div>
        </div>

        {/* Manual Weight Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="scale-weight-input"
              className="text-xs font-medium text-slate-700"
            >
              Simulate Scale Weight (g)
            </label>
            <input
              id="scale-weight-input"
              type="number"
              step="0.1"
              min="0"
              max="5000"
              value={measuredGrams}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v)) onChangeMeasuredGrams(v);
              }}
              className="w-24 rounded-md border border-slate-300 px-2.5 py-1 text-right font-mono text-xs tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>
          <input
            aria-label="Scale weight slider"
            type="range"
            min={minSlider}
            max={maxSlider}
            step="0.5"
            value={Math.min(maxSlider, Math.max(minSlider, measuredGrams))}
            onChange={(e) => onChangeMeasuredGrams(parseFloat(e.target.value))}
            className="w-full accent-blue-900 cursor-pointer"
          />
        </div>

        {/* First Schedule MPE Breakdown */}
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
          <div>
            <span className="text-slate-500">Allowed MPE ({mpe.mpePercentage}%)</span>
            <p className="font-mono font-semibold tabular-nums text-slate-900">
              ±{mpe.mpeToleranceGrams.toFixed(2)} g
            </p>
          </div>
          <div>
            <span className="text-slate-500">Rule Mapping</span>
            <p className="font-medium text-slate-800">{mpe.scheduleCitation}</p>
          </div>
        </div>
      </div>
    </section>
  );
};
