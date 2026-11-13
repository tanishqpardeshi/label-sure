import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Code2,
  Download,
  Search,
  Sliders,
  XCircle,
} from 'lucide-react';
import { LMPC_STATUTORY_MATRIX } from '../data/lmpcStatutoryMatrix';
import {
  calculateMpeTolerance,
  getRequiredFontHeightMm,
  validateRule12SiUnit,
} from '../lib/complianceEngine';
import type { ComplianceRule } from '../types/compliance';

interface RuleEngineManagerProps {
  rules: ComplianceRule[];
  onToggleRule: (ruleId: string) => void;
  onUpdateRuleParameters: (
    ruleId: string,
    paramsJson: Record<string, string | number | boolean | string[]>,
  ) => void;
  activePdpAreaCm2: number;
  onChangePdpAreaCm2: (area: number) => void;
}

type MatrixTab = 'rules' | 'first_schedule' | 'second_schedule' | 'rule12_rule6';

export const RuleEngineManager: React.FC<RuleEngineManagerProps> = ({
  rules,
  onToggleRule,
  onUpdateRuleParameters,
  activePdpAreaCm2,
  onChangePdpAreaCm2,
}) => {
  const [matrixTab, setMatrixTab] = useState<MatrixTab>('rules');
  const [regFilter, setRegFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState<string>(rules[0]?.ruleId ?? '');
  const [jsonDraft, setJsonDraft] = useState<string>(
    JSON.stringify(rules[0]?.parameters ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  // Interactive calculators inside statutory matrix views
  const [mpeTestWeight, setMpeTestWeight] = useState<number>(120);
  const [siTestInput, setSiTestInput] = useState<string>('120 gms');
  const [selectedCategory, setSelectedCategory] = useState<string>('Packaged Food');

  const regulations = [
    'ALL',
    'LMPC Rules 2011',
    'LMPC Amendment 2017',
    'LMPC Amendment 2022',
    'FSSAI Labelling & Display 2020',
  ];

  const filteredRules = rules.filter((r) => {
    const matchesReg = regFilter === 'ALL' || r.regulation === regFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.ruleId.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q);
    return matchesReg && matchesSearch;
  });

  const selectedRule = rules.find((r) => r.ruleId === selectedRuleId) ?? filteredRules[0];

  const handleSelectRule = (rule: ComplianceRule) => {
    setSelectedRuleId(rule.ruleId);
    setJsonDraft(JSON.stringify(rule.parameters, null, 2));
    setJsonError(null);
    setSavedToast(false);
  };

  const handleSaveJson = () => {
    if (!selectedRule) return;
    try {
      const parsed = JSON.parse(jsonDraft);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Rule parameters must be a valid JSON object.');
        return;
      }
      onUpdateRuleParameters(selectedRule.ruleId, parsed);
      setJsonError(null);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch {
      setJsonError('Invalid JSON syntax. Please verify quotes and commas.');
    }
  };

  const handleDownloadMatrixJson = () => {
    const blob = new Blob([JSON.stringify(LMPC_STATUTORY_MATRIX, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lmpc_statutory_matrix.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const mpePreview = calculateMpeTolerance(mpeTestWeight, mpeTestWeight);
  const pdpFontSpec = getRequiredFontHeightMm(activePdpAreaCm2);
  const siPreview = validateRule12SiUnit(siTestInput);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
              Versioned Rule Engine &amp; Statutory Lookup Matrix
            </h1>
            <p className="text-xs text-slate-500">
              LMPC Rules 2011 (2017/2022 Amendments) &amp; FSSAI 2020 rules-as-data, First &amp;
              Second Schedules, and Rule 12 SI unit registry.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-slate-600">
              {rules.filter((r) => r.enabled).length} / {rules.length} rules active
            </span>
            <button
              type="button"
              onClick={handleDownloadMatrixJson}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Download lmpc_statutory_matrix.json
            </button>
          </div>
        </div>

        {/* Sub-Navigation for Rules vs Statutory Schedules */}
        <div className="mt-4 flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
          {[
            { id: 'rules' as const, label: 'Versioned Rules' },
            { id: 'first_schedule' as const, label: 'First Schedule (MPE)' },
            { id: 'second_schedule' as const, label: 'Second Schedule (Font Height)' },
            { id: 'rule12_rule6' as const, label: 'Rule 12 SI & Rule 6 Matrix' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMatrixTab(tab.id)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                matrixTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {matrixTab === 'rules' && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
              {regulations.map((reg) => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setRegFilter(reg)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    regFilter === reg
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {reg === 'ALL' ? 'All Regulations' : reg}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                aria-label="Search compliance rules"
                placeholder="Search rule ID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Versioned Rules */}
      {matrixTab === 'rules' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-200 lg:col-span-7">
            {filteredRules.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No rules match your current filter.
              </div>
            ) : (
              filteredRules.map((rule) => {
                const isSelected = selectedRule?.ruleId === rule.ruleId;
                return (
                  <div
                    key={rule.ruleId}
                    onClick={() => handleSelectRule(rule)}
                    className={`cursor-pointer p-4 transition-colors ${
                      isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-blue-900">
                            {rule.ruleId}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="font-mono text-xs text-slate-500">{rule.version}</span>
                          <span className="text-xs text-slate-400">·</span>
                          <span
                            className={`text-xs font-semibold ${
                              rule.priority === 'CRITICAL'
                                ? 'text-red-700'
                                : rule.priority === 'HIGH'
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                            }`}
                          >
                            {rule.priority}
                          </span>
                        </div>
                        <h2 className="mt-1 font-display text-sm font-semibold text-slate-900">
                          {rule.name}
                        </h2>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                          {rule.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span>{rule.regulation}</span>
                          <span aria-hidden="true">·</span>
                          <span>{rule.citation}</span>
                          <span aria-hidden="true">·</span>
                          <span>Category: {rule.category}</span>
                        </div>
                      </div>

                      <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.enabled}
                          aria-label={`Toggle rule ${rule.ruleId}`}
                          data-testid={`toggle-rule-${rule.ruleId}`}
                          onClick={() => onToggleRule(rule.ruleId)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                            rule.enabled ? 'bg-blue-900' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              rule.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="mt-1 block text-center font-mono text-[10px] text-slate-500">
                          {rule.enabled ? 'ACTIVE' : 'OFF'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <section
            aria-labelledby="rule-json-editor-heading"
            className="rounded-lg border border-slate-200 bg-white lg:col-span-5 lg:sticky lg:top-20"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-slate-600" />
                <h2
                  id="rule-json-editor-heading"
                  className="font-display text-sm font-semibold text-slate-900"
                >
                  Rule JSON Definition
                </h2>
              </div>
              {selectedRule && (
                <span className="font-mono text-xs text-slate-500">{selectedRule.version}</span>
              )}
            </div>

            {selectedRule ? (
              <div className="p-4 space-y-3">
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p className="font-display text-sm font-semibold text-slate-900">
                    {selectedRule.name}
                  </p>
                  <p className="font-mono text-xs font-medium text-blue-900">
                    {selectedRule.ruleId}
                  </p>
                  <p>
                    {selectedRule.regulation} · {selectedRule.citation}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="rule-params-textarea"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-700"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Machine-Readable Parameters (JSON)
                  </label>
                  <textarea
                    id="rule-params-textarea"
                    rows={10}
                    value={jsonDraft}
                    onChange={(e) => setJsonDraft(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {jsonError && <p className="text-xs text-red-700">{jsonError}</p>}

                <div className="flex items-center justify-between pt-1">
                  {savedToast ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                      Parameters updated
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      Stored in PostgreSQL `rules.rule_payload`
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveJson}
                    className="rounded-md bg-blue-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    Apply JSON Rule
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-xs text-slate-500">Select a rule to inspect its JSON.</div>
            )}
          </section>
        </div>
      )}

      {/* Tab 2: First Schedule MPE Table */}
      {matrixTab === 'first_schedule' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <section className="rounded-lg border border-slate-200 bg-white lg:col-span-8 overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                First Schedule — Maximum Permissible Error (Rule 19)
              </h2>
              <p className="text-xs text-slate-500">
                Permitted negative tolerance on declared nominal quantity (Qn) for packaged
                commodities
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Declared Quantity Bracket (Qn)</th>
                    <th className="px-4 py-2.5 font-semibold">Tolerance Mode</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Maximum Permissible Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {LMPC_STATUTORY_MATRIX.first_schedule_mpe_table.map((row) => {
                    const activeBracket =
                      mpeTestWeight > row.min_qn &&
                      (row.max_qn === null || mpeTestWeight <= row.max_qn);
                    return (
                      <tr
                        key={row.bracket}
                        className={activeBracket ? 'bg-blue-50/50' : 'hover:bg-slate-50'}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-slate-900">
                          {row.bracket}
                        </td>
                        <td className="px-4 py-3 text-slate-600 capitalize">
                          {row.tolerance_type}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-blue-900">
                          {row.tolerance_value} {row.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 lg:col-span-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              First Schedule MPE Lookup Calculator
            </h3>
            <div>
              <label htmlFor="mpe-calc-input" className="block text-xs font-medium text-slate-700">
                Declared Nominal Quantity (g or ml)
              </label>
              <input
                id="mpe-calc-input"
                type="number"
                min="1"
                max="10000"
                value={mpeTestWeight}
                onChange={(e) => setMpeTestWeight(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Allowed MPE Tolerance:</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  ±{mpePreview.mpeToleranceGrams.toFixed(2)} g/ml ({mpePreview.mpePercentage}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Minimum Legal Net Weight:</span>
                <span className="font-mono font-semibold tabular-nums text-emerald-700">
                  {mpePreview.minAllowedGrams.toFixed(2)} g/ml
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Tab 3: Second Schedule Minimum Font Height Matrix */}
      {matrixTab === 'second_schedule' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <section className="rounded-lg border border-slate-200 bg-white lg:col-span-8 overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Second Schedule — Minimum Font Height Matrix (Rule 7)
              </h2>
              <p className="text-xs text-slate-500">
                Mandatory minimum numeral height for Net Quantity &amp; MRP based on Principal
                Display Panel (PDP) area in cm²
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Principal Display Panel (PDP) Area</th>
                    <th className="px-4 py-2.5 font-semibold">Citation</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Min Font Height (mm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {LMPC_STATUTORY_MATRIX.second_schedule_font_height_matrix.map((row) => {
                    const isActive =
                      activePdpAreaCm2 > row.min_area_cm2 &&
                      (row.max_area_cm2 === null || activePdpAreaCm2 <= row.max_area_cm2);
                    return (
                      <tr
                        key={row.pdp_area_range}
                        className={isActive ? 'bg-blue-50/50' : 'hover:bg-slate-50'}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-slate-900">
                          {row.pdp_area_range}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.citation}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-blue-900">
                          {row.min_font_height_mm.toFixed(1)} mm
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 lg:col-span-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Active Scanner PDP Area Control
            </h3>
            <p className="text-xs text-slate-500">
              Adjusting PDP Area updates the live Scanner inspection&apos;s Second Schedule font
              height requirement immediately.
            </p>
            <div>
              <label htmlFor="rule-pdp-input" className="block text-xs font-medium text-slate-700">
                Principal Display Panel Area (cm²)
              </label>
              <input
                id="rule-pdp-input"
                type="number"
                min="10"
                max="2000"
                value={activePdpAreaCm2}
                onChange={(e) => onChangePdpAreaCm2(Math.max(10, Number(e.target.value) || 150))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[40, 150, 350, 600].map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => onChangePdpAreaCm2(area)}
                  className={`rounded border px-2.5 py-1 font-mono text-xs ${
                    activePdpAreaCm2 === area
                      ? 'border-blue-800 bg-blue-50 font-semibold text-blue-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {area} cm²
                </button>
              ))}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <p className="text-slate-600">
                Active Bracket: <span className="font-mono font-semibold">{pdpFontSpec.pdpAreaRange}</span>
              </p>
              <p className="text-slate-600">
                Required Minimum Height:{' '}
                <span className="font-mono font-bold text-blue-900">
                  {pdpFontSpec.minFontHeightMm.toFixed(1)} mm
                </span>
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Tab 4: Rule 12 SI Units & Rule 6 Category Matrix */}
      {matrixTab === 'rule12_rule6' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Rule 12 SI Validator */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4 lg:col-span-6">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Rule 12 — Permitted SI Units &amp; Legacy Unit Validator
              </h2>
              <p className="text-xs text-slate-500">
                Strictly allows <span className="font-mono">g, kg, ml, L, l, cm, m, N, U</span> and
                rejects legacy abbreviations (<span className="font-mono">gm, gms, ltr, kgms, mltr</span>).
              </p>
            </div>

            <div>
              <label htmlFor="si-unit-tester" className="block text-xs font-medium text-slate-700">
                Test Net Quantity Declaration String
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="si-unit-tester"
                  type="text"
                  value={siTestInput}
                  onChange={(e) => setSiTestInput(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['120g', '120 gms', '1 ltr', '500 mltr', '1.5 kg', '250 U'].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setSiTestInput(sample)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <div
              data-testid="rule12-validator-output"
              className={`rounded-md border p-3 text-xs ${
                siPreview.valid
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {siPreview.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-700" />
                )}
                <span>{siPreview.valid ? 'PASS — Valid Rule 12 SI Unit' : 'FAIL — Non-Compliant Unit'}</span>
              </div>
              <p className="mt-1">
                {siPreview.valid
                  ? `Detected SI unit "${siPreview.detectedUnit}" (normalized base: ${siPreview.valueGrams}).`
                  : siPreview.correctiveGuidance}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-800">
                Forbidden Legacy Abbreviations
              </h3>
              <div className="mt-2 divide-y divide-slate-100 text-xs">
                {LMPC_STATUTORY_MATRIX.rule_12_si_units.forbidden_legacy_abbreviations.map((item) => (
                  <div key={item.legacy} className="flex items-center justify-between py-1.5">
                    <span>
                      <span className="font-mono font-semibold text-red-700">{item.legacy}</span> →{' '}
                      <span className="font-mono font-semibold text-emerald-700">
                        {item.replacement}
                      </span>
                    </span>
                    <span className="text-slate-500">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Rule 6 Mandatory Declarations Matrix by Category */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4 lg:col-span-6">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Rule 6 Mandatory Declarations by Product Category
              </h2>
              <p className="text-xs text-slate-500">
                Statutory label checklist mapped by LMPC commodity classification
              </p>
            </div>

            <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">
              {Object.keys(LMPC_STATUTORY_MATRIX.rule_6_mandatory_declarations).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {LMPC_STATUTORY_MATRIX.rule_6_mandatory_declarations[selectedCategory] && (
              <div className="space-y-2">
                <p className="font-mono text-[11px] text-blue-900">
                  {LMPC_STATUTORY_MATRIX.rule_6_mandatory_declarations[selectedCategory].citation}
                </p>
                <ul className="divide-y divide-slate-100 border-t border-slate-100 text-xs text-slate-800">
                  {LMPC_STATUTORY_MATRIX.rule_6_mandatory_declarations[
                    selectedCategory
                  ].required_declarations.map((decl) => (
                    <li key={decl} className="flex items-center gap-2 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                      <span>{decl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
