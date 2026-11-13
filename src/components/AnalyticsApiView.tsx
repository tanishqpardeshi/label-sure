import React, { useState } from 'react';
import { Loader2, MapPin, Play, Server } from 'lucide-react';
import {
  DEFAULT_ECOMMERCE_BULK_PAYLOAD,
  REGIONAL_CITY_METRICS,
} from '../data/goldenSample';
import type { ComplianceRule, RegionalCityMetric } from '../types/compliance';

interface AnalyticsApiViewProps {
  rules: ComplianceRule[];
  verifiedJurisdictionCity?: string | null;
}

interface BulkAuditResult {
  httpStatus: number;
  marketplace: string;
  batchId: string;
  evaluatedAt: string;
  totalSkus: number;
  approvedForListing: number;
  blockedForViolation: number;
  results: Array<{
    sku: string;
    productName: string;
    listingAllowed: boolean;
    overallStatus: string;
    summaryCounts: { pass: number; fail: number; warning: number; unverified: number };
    violations: Array<{
      ruleId: string;
      field: string;
      status: string;
      rationale: string;
      correctiveAction?: string;
    }>;
  }>;
}

// Convert India lat/lng roughly onto a 400x440 SVG viewBox (lng 68..97 -> x 40..360, lat 8..37 -> y 400..40)
function projectToSvg(lat: number, lng: number): { x: number; y: number } {
  const x = 40 + ((lng - 68) / (97 - 68)) * 320;
  const y = 400 - ((lat - 8) / (37 - 8)) * 360;
  return { x, y };
}

export const AnalyticsApiView: React.FC<AnalyticsApiViewProps> = ({
  rules,
  verifiedJurisdictionCity,
}) => {
  const initialCity =
    (verifiedJurisdictionCity &&
      REGIONAL_CITY_METRICS.find((c) =>
        verifiedJurisdictionCity.toLowerCase().includes(c.city.toLowerCase()),
      )) ||
    REGIONAL_CITY_METRICS[0];
  const [selectedCity, setSelectedCity] = useState<RegionalCityMetric>(initialCity);
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(DEFAULT_ECOMMERCE_BULK_PAYLOAD, null, 2),
  );
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [auditResponse, setAuditResponse] = useState<BulkAuditResult | null>(null);

  const totalInspections = REGIONAL_CITY_METRICS.reduce((a, c) => a + c.inspectionsCount, 0);
  const totalCritical = REGIONAL_CITY_METRICS.reduce((a, c) => a + c.criticalFails, 0);
  const avgViolationRate = (
    REGIONAL_CITY_METRICS.reduce((a, c) => a + c.violationRatePct, 0) /
    REGIONAL_CITY_METRICS.length
  ).toFixed(1);

  const runBulkAudit = async () => {
    setApiError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      setApiError('Invalid JSON payload in simulator editor.');
      return;
    }

    setApiLoading(true);
    try {
      const res = await fetch('/api/ecommerce/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, rules }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Audit API request failed');
      }
      setAuditResponse(data as BulkAuditResult);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Top Metrics Strip */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
              Regional Compliance Heatmap &amp; E-Commerce Bulk API
            </h1>
            <p className="text-xs text-slate-500">
              Geo-tagged inspection telemetry across Indian enforcement zones and pre-listing seller
              API simulator
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">5 Enforcement Corridors</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span className="text-xs text-slate-500">Total Audited Packages</span>
            <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-slate-900">
              {totalInspections.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Mean Violation Rate</span>
            <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-amber-700">
              {avgViolationRate}%
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Critical Rule Failures</span>
            <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-red-700">
              {totalCritical}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Selected Zone</span>
            <p className="mt-0.5 font-display text-base font-bold text-blue-900">
              {selectedCity.city}
            </p>
          </div>
        </div>
      </div>

      {/* Geo-Tagged Heatmap & City Table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Interactive India Spatial Map */}
        <section
          aria-labelledby="heatmap-heading"
          className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-600" />
              <h2 id="heatmap-heading" className="font-display text-sm font-semibold text-slate-900">
                Geo-Tagged Violation Heatmap
              </h2>
            </div>
            <span className="text-xs text-slate-500">Click city pin</span>
          </div>

          <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2">
            <svg
              viewBox="0 0 400 440"
              role="img"
              aria-label="India regional compliance violation heatmap"
              className="mx-auto h-72 w-full max-w-[340px]"
            >
              {/* Simplified schematic India boundary polygon */}
              <path
                d="M150,35 L188,30 L215,65 L205,98 L250,122 L318,125 L355,148 L332,185 L292,188 L278,225 L238,265 L205,315 L178,395 L155,412 L132,360 L115,300 L102,240 L62,205 L58,168 L98,142 L112,102 L135,62 Z"
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth="2"
              />

              {/* Latitude / Longitude reference hairlines */}
              <line x1="40" y1="220" x2="360" y2="220" stroke="#e2e8f0" strokeDasharray="4 4" />
              <line x1="175" y1="30" x2="175" y2="415" stroke="#e2e8f0" strokeDasharray="4 4" />

              {REGIONAL_CITY_METRICS.map((city) => {
                const { x, y } = projectToSvg(city.lat, city.lng);
                const isSelected = selectedCity.city === city.city;
                const fill =
                  city.recentBatchStatus === 'Elevated Risk'
                    ? '#dc2626'
                    : city.recentBatchStatus === 'Moderate'
                      ? '#d97706'
                      : '#16a34a';
                const radius = Math.max(8, Math.min(18, city.violationRatePct * 0.9));

                const labelOffsets: Record<
                  string,
                  { dx: number; dy: number; anchor: 'start' | 'end' }
                > = {
                  Indore: { dx: -12, dy: 12, anchor: 'end' },
                  Bhopal: { dx: 12, dy: -6, anchor: 'start' },
                  Mumbai: { dx: -10, dy: 4, anchor: 'end' },
                  Delhi: { dx: 12, dy: 4, anchor: 'start' },
                  Bengaluru: { dx: 12, dy: 4, anchor: 'start' },
                };
                const offset = labelOffsets[city.city] ?? { dx: 11, dy: 4, anchor: 'start' };

                return (
                  <g
                    key={city.city}
                    onClick={() => setSelectedCity(city)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 6}
                      fill={fill}
                      fillOpacity={isSelected ? 0.25 : 0.12}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 7 : 5}
                      fill={fill}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={x + offset.dx}
                      y={y + offset.dy}
                      textAnchor={offset.anchor}
                      fontSize="11"
                      fontWeight={isSelected ? '700' : '600'}
                      fill="#0f172a"
                      stroke="#ffffff"
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {city.city} ({city.violationRatePct}%)
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected City Detail */}
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-slate-900">
                {selectedCity.city}, {selectedCity.state}
              </span>
              <span
                className={`font-mono font-semibold ${
                  selectedCity.recentBatchStatus === 'Elevated Risk'
                    ? 'text-red-700'
                    : selectedCity.recentBatchStatus === 'Moderate'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}
              >
                {selectedCity.recentBatchStatus}
              </span>
            </div>
            <p className="text-slate-600">
              Top Violation Rule:{' '}
              <span className="font-mono font-medium text-slate-900">
                {selectedCity.topViolationRule}
              </span>
            </p>
            <p className="font-mono tabular-nums text-slate-600">
              {selectedCity.inspectionsCount.toLocaleString()} scans · {selectedCity.criticalFails}{' '}
              critical fails
            </p>
          </div>
        </section>

        {/* City Breakdown Data Grid */}
        <section
          aria-labelledby="city-table-heading"
          className="rounded-lg border border-slate-200 bg-white lg:col-span-7 overflow-hidden"
        >
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 id="city-table-heading" className="font-display text-sm font-semibold text-slate-900">
              Regional Enforcement &amp; Violation Breakdown
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">City / State</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Inspections</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Violation Rate</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Critical Fails</th>
                  <th className="px-4 py-2.5 font-semibold">Top Triggered Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {REGIONAL_CITY_METRICS.map((city) => {
                  const isSelected = selectedCity.city === city.city;
                  return (
                    <tr
                      key={city.city}
                      onClick={() => setSelectedCity(city)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900 block">{city.city}</span>
                        <span className="text-[11px] text-slate-500">{city.state}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                        {city.inspectionsCount.toLocaleString()}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                          city.violationRatePct > 15
                            ? 'text-red-700'
                            : city.violationRatePct > 10
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }`}
                      >
                        {city.violationRatePct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                        {city.criticalFails}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                        {city.topViolationRule}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* E-Commerce Pre-Listing Bulk API Audit Simulator */}
      <section
        aria-labelledby="bulk-api-heading"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-600" />
            <div>
              <h2 id="bulk-api-heading" className="font-display text-sm font-semibold text-slate-900">
                E-Commerce Pre-Listing Bulk Audit REST API Simulator
              </h2>
              <p className="font-mono text-[11px] text-slate-500">
                POST /api/ecommerce/audit · Evaluates seller SKU feeds before marketplace publish
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={runBulkAudit}
            disabled={apiLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {apiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run Bulk Audit
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
          <div>
            <label
              htmlFor="bulk-payload-editor"
              className="block text-xs font-medium text-slate-700"
            >
              Request Payload (JSON)
            </label>
            <textarea
              id="bulk-payload-editor"
              rows={15}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-blue-600 focus:outline-none"
            />
            {apiError && <p className="mt-1.5 text-xs text-red-700">{apiError}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">Live API Audit Response</span>
              {auditResponse && (
                <span className="font-mono text-xs tabular-nums text-slate-600">
                  Approved: {auditResponse.approvedForListing} / Blocked:{' '}
                  {auditResponse.blockedForViolation}
                </span>
              )}
            </div>

            {!auditResponse ? (
              <div className="mt-1.5 flex h-[318px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
                Click &quot;Run Bulk Audit&quot; to execute live LMPC &amp; FSSAI validation against
                the SKU batch payload.
              </div>
            ) : (
              <div className="mt-1.5 space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {auditResponse.results.map((skuRes) => (
                  <div
                    key={skuRes.sku}
                    className={`rounded-md border p-3 text-xs ${
                      skuRes.listingAllowed
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-red-200 bg-red-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900">
                        {skuRes.sku} · {skuRes.productName}
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          skuRes.listingAllowed ? 'text-emerald-800' : 'text-red-800'
                        }`}
                      >
                        {skuRes.listingAllowed ? 'LISTING APPROVED' : 'LISTING BLOCKED'}
                      </span>
                    </div>
                    {skuRes.violations.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-red-900">
                        {skuRes.violations.map((v, i) => (
                          <li key={i}>
                            <span className="font-mono font-semibold">{v.ruleId}:</span>{' '}
                            {v.rationale}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-emerald-800">
                        All LMPC &amp; FSSAI declarations and MPE tolerances passed.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
