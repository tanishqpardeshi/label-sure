import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Code2,
  Download,
  History,
  Lock,
  Rocket,
  Search,
  Sliders,
  XCircle,
} from 'lucide-react';
import { LMPC_STATUTORY_MATRIX } from '../data/lmpcStatutoryMatrix';
import { getRequiredFontHeightMm, validateRule12SiUnit } from '../lib/complianceEngine';
import { getRolePermissions } from '../lib/rbac';
import type {
  AuditEvent,
  ComplianceRule,
  RuleSetVersion,
  UserRole,
} from '../types/compliance';

interface RuleEngineManagerProps {
  activeRole: UserRole;
  publishedRuleSets: RuleSetVersion[];
  draftRules: ComplianceRule[];
  auditEvents: AuditEvent[];
  onToggleDraftRule: (ruleId: string) => void;
  onUpdateDraftRuleParameters: (
    ruleId: string,
    paramsJson: Record<string, string | number | boolean | string[]>,
  ) => void;
  onPublishNewRuleSetVersion: (releaseNotes: string) => string;
  activePdpAreaCm2: number;
  onChangePdpAreaCm2: (area: number) => void;
}

type MatrixTab = 'rules' | 'second_schedule' | 'rule12_rule6' | 'audit_log';

export const RuleEngineManager: React.FC<RuleEngineManagerProps> = ({
  activeRole,
  publishedRuleSets,
  draftRules,
  auditEvents,
  onToggleDraftRule,
  onUpdateDraftRuleParameters,
  onPublishNewRuleSetVersion,
  activePdpAreaCm2,
  onChangePdpAreaCm2,
}) => {
  const permissions = getRolePermissions(activeRole);
  const activePublished = publishedRuleSets[0];

  const [matrixTab, setMatrixTab] = useState<MatrixTab>('rules');
  const [viewMode, setViewMode] = useState<'PUBLISHED' | 'DRAFT'>(
    permissions.canEditDraftRules ? 'DRAFT' : 'PUBLISHED',
  );
  const [regFilter, setRegFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState<string>(draftRules[0]?.ruleId ?? '');
  const [jsonDraft, setJsonDraft] = useState<string>(
    JSON.stringify(draftRules[0]?.parameters ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState(
    'Updated LMPC / FSSAI parameter thresholds and draft rule activation.',
  );
  const [publishedBanner, setPublishedBanner] = useState<string | null>(null);

  const [siTestInput, setSiTestInput] = useState<string>('120 gms');
  const [selectedCategory, setSelectedCategory] = useState<string>('Packaged Food');

  const regulations = [
    'ALL',
    'LMPC Rules 2011',
    'LMPC Amendment 2017',
    'LMPC Amendment 2022',
    'FSSAI Labelling & Display 2020',
  ];

  const sourceRules = viewMode === 'DRAFT' ? draftRules : activePublished?.rules ?? draftRules;

  const filteredRules = sourceRules.filter((r) => {
    const matchesReg = regFilter === 'ALL' || r.regulation === regFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.ruleId.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q);
    return matchesReg && matchesSearch;
  });

  const selectedRule =
    sourceRules.find((r) => r.ruleId === selectedRuleId) ?? filteredRules[0];

  const handleSelectRule = (rule: ComplianceRule) => {
    setSelectedRuleId(rule.ruleId);
    setJsonDraft(JSON.stringify(rule.parameters, null, 2));
    setJsonError(null);
    setSavedToast(false);
  };

  const handleSaveJson = () => {
    if (!selectedRule || !permissions.canEditDraftRules || viewMode !== 'DRAFT') return;
    try {
      const parsed = JSON.parse(jsonDraft);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Rule parameters must be a valid JSON object.');
        return;
      }
      onUpdateDraftRuleParameters(selectedRule.ruleId, parsed);
      setJsonError(null);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch {
      setJsonError('Invalid JSON syntax. Please verify quotes and commas.');
    }
  };

  const handlePublishClick = () => {
    if (!permissions.canPublishRuleVersion) return;
    const newVersionId = onPublishNewRuleSetVersion(releaseNotes);
    setPublishedBanner(
      `Published immutable rule-set ${newVersionId}. Existing persisted reports retain their original rule_set_version_id (BR-08 / AT-10).`,
    );
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

  const pdpFontSpec = getRequiredFontHeightMm(activePdpAreaCm2);
  const siPreview = validateRule12SiUnit(siTestInput);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-[#2E2E2E]">
              Versioned Rule Repository &amp; Maintainer Console
            </h1>
            <p className="text-xs text-[#2E2E2E]/75">
              Active Published Rule-Set:{' '}
              <span
                data-testid="active-ruleset-version"
                className="font-mono font-semibold text-[#7D4047]"
              >
                {activePublished?.versionId}
              </span>{' '}
              · Only reviewed, published rules execute at runtime (BR-01)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-[#2E2E2E]/75">
              {publishedRuleSets.length} published version{publishedRuleSets.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={handleDownloadMatrixJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-1.5 text-xs font-medium text-[#2E2E2E] hover:bg-[#DDD5CD]/50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export Statutory Matrix JSON
            </button>
          </div>
        </div>

        {/* Maintainer Publish Bar (Visible in Rule Repository for Maintainer; Read-Only Notice otherwise) */}
        {permissions.canPublishRuleVersion ? (
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[#7D4047]/35 bg-[#7D4047]/10 p-3">
            <div className="flex-1 min-w-[260px]">
              <label
                htmlFor="publish-release-notes"
                className="block text-xs font-semibold text-[#2E2E2E]"
              >
                Publish Draft Rule-Set as New Immutable Version (FR-020 / BR-02)
              </label>
              <input
                id="publish-release-notes"
                type="text"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#FAF7F2] px-2.5 py-1.5 text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
              />
            </div>
            <button
              type="button"
              data-testid="publish-ruleset-btn"
              onClick={handlePublishClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7D4047] px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#663238] whitespace-nowrap shrink-0"
            >
              <Rocket className="h-3.5 w-3.5" />
              Publish New Rule-Set Version
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-2.5 text-xs text-[#2E2E2E]">
            <Lock className="h-4 w-4 text-[#7D4047] shrink-0" />
            <span>
              Read-only view for role <strong className="font-mono">{activeRole}</strong>. Switch to{' '}
              <strong>Rule Maintainer / Administrator</strong> to edit draft rules, publish new
              versions, or inspect the Audit Log (AUTH-04).
            </span>
          </div>
        )}

        {publishedBanner && (
          <div
            role="status"
            data-testid="publish-success-banner"
            className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
            <span>{publishedBanner}</span>
          </div>
        )}

        {/* Sub-Navigation */}
        <div className="mt-4 flex flex-wrap items-center gap-1 rounded-lg border border-[#DDD5CD] bg-[#DDD5CD]/45 p-1">
          {[
            { id: 'rules' as const, label: 'Published & Draft Rules' },
            { id: 'second_schedule' as const, label: 'Second Schedule (Font Height)' },
            { id: 'rule12_rule6' as const, label: 'Rule 12 SI & Rule 6 Matrix' },
            { id: 'audit_log' as const, label: `Audit Log (${auditEvents.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMatrixTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                matrixTab === tab.id
                  ? 'bg-[#7D4047] text-[#FAF7F2] font-semibold shadow-xs'
                  : 'text-[#2E2E2E]/80 hover:text-[#2E2E2E]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {matrixTab === 'rules' && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD5CD]/80 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Published vs Draft Switcher */}
              <div className="flex items-center rounded-lg border border-[#DDD5CD] bg-[#DDD5CD]/45 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('PUBLISHED')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 ${
                    viewMode === 'PUBLISHED'
                      ? 'bg-[#FAF7F2] text-emerald-800 shadow-xs'
                      : 'text-[#2E2E2E]/75 hover:text-[#2E2E2E]'
                  }`}
                >
                  Published ({activePublished?.versionId})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('DRAFT')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 ${
                    viewMode === 'DRAFT'
                      ? 'bg-[#FAF7F2] text-[#7D4047] shadow-xs'
                      : 'text-[#2E2E2E]/75 hover:text-[#2E2E2E]'
                  }`}
                >
                  Draft Workspace
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#DDD5CD] bg-[#DDD5CD]/45 p-1">
                {regulations.map((reg) => (
                  <button
                    key={reg}
                    type="button"
                    onClick={() => setRegFilter(reg)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      regFilter === reg
                        ? 'bg-[#FAF7F2] text-[#2E2E2E] font-semibold shadow-xs'
                        : 'text-[#2E2E2E]/75 hover:text-[#2E2E2E]'
                    }`}
                  >
                    {reg === 'ALL' ? 'All Regulations' : reg}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#2E2E2E]/50" />
              <input
                type="search"
                aria-label="Search compliance rules"
                placeholder="Search rule ID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] py-1.5 pl-8 pr-3 text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Versioned Rules */}
      {matrixTab === 'rules' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <div className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] divide-y divide-[#DDD5CD] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)] lg:col-span-7">
            {filteredRules.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#2E2E2E]/70">
                No rules match your current filter.
              </div>
            ) : (
              filteredRules.map((rule) => {
                const isSelected = selectedRule?.ruleId === rule.ruleId;
                const canEditThisView = permissions.canEditDraftRules && viewMode === 'DRAFT';
                return (
                  <div
                    key={rule.ruleId}
                    onClick={() => handleSelectRule(rule)}
                    className={`cursor-pointer p-4 transition-colors ${
                      isSelected ? 'bg-[#7D4047]/10' : 'hover:bg-[#F1ECE6]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#7D4047]">
                            {rule.ruleId}
                          </span>
                          <span className="text-xs text-[#2E2E2E]/40">·</span>
                          <span className="font-mono text-xs text-[#2E2E2E]/65">{rule.version}</span>
                          <span className="text-xs text-[#2E2E2E]/40">·</span>
                          <span
                            className={`font-mono text-[11px] font-semibold ${
                              viewMode === 'PUBLISHED' ? 'text-emerald-700' : 'text-amber-800'
                            }`}
                          >
                            {viewMode}
                          </span>
                          <span className="text-xs text-[#2E2E2E]/40">·</span>
                          <span
                            className={`text-xs font-semibold ${
                              rule.priority === 'CRITICAL'
                                ? 'text-red-700'
                                : rule.priority === 'HIGH'
                                  ? 'text-amber-800'
                                  : 'text-[#2E2E2E]/70'
                            }`}
                          >
                            {rule.priority}
                          </span>
                        </div>
                        <h2 className="mt-1 font-display text-sm font-semibold text-[#2E2E2E]">
                          {rule.name}
                        </h2>
                        <p className="mt-1 text-xs text-[#2E2E2E]/80 leading-relaxed">
                          {rule.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#2E2E2E]/65">
                          <span>{rule.regulation}</span>
                          <span aria-hidden="true">·</span>
                          <span>{rule.citation}</span>
                          <span aria-hidden="true">·</span>
                          <span>Applicability: {rule.category}</span>
                        </div>
                      </div>

                      <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.enabled}
                          aria-label={`Toggle rule ${rule.ruleId}`}
                          disabled={!canEditThisView}
                          data-testid={`toggle-rule-${rule.ruleId}`}
                          onClick={() => onToggleDraftRule(rule.ruleId)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4047] ${
                            rule.enabled ? 'bg-[#7D4047]' : 'bg-[#DDD5CD]'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-[#FAF7F2] transition-transform ${
                              rule.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="mt-1 block text-center font-mono text-[10px] text-[#2E2E2E]/65">
                          {rule.enabled ? 'ACTIVE' : 'OFF'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Panel: JSON Definition & Published Versions History */}
          <div className="space-y-6 lg:col-span-5">
            <section
              aria-labelledby="rule-json-editor-heading"
              className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]"
            >
              <div className="flex items-center justify-between border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-[#7D4047]" />
                  <h2
                    id="rule-json-editor-heading"
                    className="font-display text-sm font-semibold text-[#2E2E2E]"
                  >
                    Rule JSON Definition ({viewMode})
                  </h2>
                </div>
                {selectedRule && (
                  <span className="font-mono text-xs text-[#2E2E2E]/65">{selectedRule.version}</span>
                )}
              </div>

              {selectedRule ? (
                <div className="p-4 space-y-3">
                  <div className="text-xs text-[#2E2E2E]/80 space-y-0.5">
                    <p className="font-display text-sm font-semibold text-[#2E2E2E]">
                      {selectedRule.name}
                    </p>
                    <p className="font-mono text-xs font-medium text-[#7D4047]">
                      {selectedRule.ruleId}
                    </p>
                    <p>
                      {selectedRule.regulation} · {selectedRule.citation}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="rule-params-textarea"
                      className="flex items-center gap-1.5 text-xs font-medium text-[#2E2E2E]"
                    >
                      <Sliders className="h-3.5 w-3.5 text-[#7D4047]" />
                      Machine-Readable Parameters (JSON)
                    </label>
                    <textarea
                      id="rule-params-textarea"
                      rows={8}
                      readOnly={!permissions.canEditDraftRules || viewMode !== 'DRAFT'}
                      value={jsonDraft}
                      onChange={(e) => setJsonDraft(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-[#DDD5CD] bg-[#2E2E2E] p-3 font-mono text-xs text-[#F1ECE6] focus:border-[#7D4047] focus:outline-none read-only:opacity-85"
                    />
                  </div>

                  {jsonError && <p className="text-xs text-red-700">{jsonError}</p>}

                  <div className="flex items-center justify-between pt-1">
                    {savedToast ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                        Draft updated (publish to activate)
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#2E2E2E]/65">
                        {viewMode === 'PUBLISHED'
                          ? 'Immutable published snapshot'
                          : 'Draft changes require Publish to affect evaluations'}
                      </span>
                    )}
                    {permissions.canEditDraftRules && viewMode === 'DRAFT' && (
                      <button
                        type="button"
                        onClick={handleSaveJson}
                        className="rounded-lg bg-[#7D4047] px-3.5 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#663238]"
                      >
                        Save Draft JSON
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-xs text-[#2E2E2E]/70">Select a rule to inspect its JSON.</div>
              )}
            </section>

            {/* Published Rule-Set Versions History */}
            <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
              <div className="flex items-center gap-2 border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
                <History className="h-4 w-4 text-[#7D4047]" />
                <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
                  Published Rule-Set Version History
                </h2>
              </div>
              <div className="divide-y divide-[#DDD5CD]">
                {publishedRuleSets.map((rs, idx) => (
                  <div key={rs.versionId} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#7D4047]">{rs.versionId}</span>
                      <span className="font-mono text-[11px] text-[#2E2E2E]/65">
                        {idx === 0 ? 'ACTIVE' : 'ARCHIVED'} · {rs.rules.filter((r) => r.enabled).length} rules
                      </span>
                    </div>
                    <p className="text-[#2E2E2E]/85">{rs.releaseNotes}</p>
                    <p className="font-mono text-[10px] text-[#2E2E2E]/60">
                      Published by {rs.publishedBy} · {new Date(rs.publishedAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Tab 2: Second Schedule Minimum Font Height Matrix */}
      {matrixTab === 'second_schedule' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] lg:col-span-8 overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
            <div className="border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
                Second Schedule — Minimum Font Height Matrix (Rule 7)
              </h2>
              <p className="text-xs text-[#2E2E2E]/70">
                Mandatory minimum numeral height for Net Quantity &amp; MRP based on Principal
                Display Panel (PDP) area in cm²
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#DDD5CD] bg-[#DDD5CD]/50 text-[#2E2E2E]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Principal Display Panel (PDP) Area</th>
                    <th className="px-4 py-2.5 font-semibold">Citation</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Min Font Height (mm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDD5CD]">
                  {LMPC_STATUTORY_MATRIX.second_schedule_font_height_matrix.map((row) => {
                    const isActive =
                      activePdpAreaCm2 > row.min_area_cm2 &&
                      (row.max_area_cm2 === null || activePdpAreaCm2 <= row.max_area_cm2);
                    return (
                      <tr
                        key={row.pdp_area_range}
                        className={isActive ? 'bg-[#7D4047]/10' : 'hover:bg-[#F1ECE6]'}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-[#2E2E2E]">
                          {row.pdp_area_range}
                        </td>
                        <td className="px-4 py-3 text-[#2E2E2E]/75">{row.citation}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#7D4047]">
                          {row.min_font_height_mm.toFixed(1)} mm
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 space-y-3 shadow-[0_1px_3px_rgba(46,46,46,0.04)] lg:col-span-4">
            <h3 className="font-display text-sm font-semibold text-[#2E2E2E]">
              Active Workbench PDP Area Control
            </h3>
            <p className="text-xs text-[#2E2E2E]/70">
              Adjusting PDP Area updates the Workbench&apos;s Second Schedule font height threshold
              immediately.
            </p>
            <div>
              <label htmlFor="rule-pdp-input" className="block text-xs font-medium text-[#2E2E2E]">
                Principal Display Panel Area (cm²)
              </label>
              <input
                id="rule-pdp-input"
                type="number"
                min="10"
                max="2000"
                value={activePdpAreaCm2}
                onChange={(e) => onChangePdpAreaCm2(Math.max(10, Number(e.target.value) || 150))}
                className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-1.5 font-mono text-sm tabular-nums text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[40, 150, 350, 600].map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => onChangePdpAreaCm2(area)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-xs ${
                    activePdpAreaCm2 === area
                      ? 'border-[#7D4047] bg-[#7D4047] font-semibold text-[#FAF7F2]'
                      : 'border-[#DDD5CD] bg-[#F1ECE6] text-[#2E2E2E] hover:bg-[#DDD5CD]/50'
                  }`}
                >
                  {area} cm²
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] p-3 text-xs space-y-1">
              <p className="text-[#2E2E2E]/80">
                Active Bracket:{' '}
                <span className="font-mono font-semibold text-[#2E2E2E]">
                  {pdpFontSpec.pdpAreaRange}
                </span>
              </p>
              <p className="text-[#2E2E2E]/80">
                Required Minimum Height:{' '}
                <span className="font-mono font-bold text-[#7D4047]">
                  {pdpFontSpec.minFontHeightMm.toFixed(1)} mm
                </span>
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Tab 3: Rule 12 SI Units & Rule 6 Category Matrix */}
      {matrixTab === 'rule12_rule6' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 space-y-4 shadow-[0_1px_3px_rgba(46,46,46,0.04)] lg:col-span-6">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
                Rule 12 — Permitted SI Units &amp; Legacy Unit Validator
              </h2>
              <p className="text-xs text-[#2E2E2E]/70">
                Strictly allows <span className="font-mono">g, kg, ml, L, l, cm, m, N, U</span> and
                rejects legacy abbreviations (
                <span className="font-mono">gm, gms, ltr, kgms, mltr</span>).
              </p>
            </div>

            <div>
              <label htmlFor="si-unit-tester" className="block text-xs font-medium text-[#2E2E2E]">
                Test Net Quantity Declaration String
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="si-unit-tester"
                  type="text"
                  value={siTestInput}
                  onChange={(e) => setSiTestInput(e.target.value)}
                  className="flex-1 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-1.5 font-mono text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['120g', '120 gms', '1 ltr', '500 mltr', '1.5 kg', '250 U'].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setSiTestInput(sample)}
                    className="rounded-md border border-[#DDD5CD] bg-[#F1ECE6] px-2 py-0.5 font-mono text-[11px] text-[#2E2E2E] hover:bg-[#DDD5CD]/50"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <div
              data-testid="rule12-validator-output"
              className={`rounded-lg border p-3 text-xs ${
                siPreview.valid
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-red-300 bg-red-50 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {siPreview.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-700" />
                )}
                <span>
                  {siPreview.valid ? 'PASS — Valid Rule 12 SI Unit' : 'FAIL — Non-Compliant Unit'}
                </span>
              </div>
              <p className="mt-1">
                {siPreview.valid
                  ? `Detected SI unit "${siPreview.detectedUnit}" (normalized base: ${siPreview.valueGrams}).`
                  : siPreview.correctiveGuidance}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 space-y-4 shadow-[0_1px_3px_rgba(46,46,46,0.04)] lg:col-span-6">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
                Rule 6 Mandatory Declarations by Product Category
              </h2>
              <p className="text-xs text-[#2E2E2E]/70">
                Statutory label checklist mapped by LMPC commodity classification
              </p>
            </div>

            <div className="flex flex-wrap gap-1 rounded-lg border border-[#DDD5CD] bg-[#DDD5CD]/45 p-1">
              {Object.keys(LMPC_STATUTORY_MATRIX.rule_6_mandatory_declarations).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-[#7D4047] text-[#FAF7F2] font-semibold shadow-xs'
                      : 'text-[#2E2E2E]/80 hover:text-[#2E2E2E]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {LMPC_STATUTORY_MATRIX.rule_6_mandatory_declarations[selectedCategory] && (
              <div className="space-y-2">
                <p className="font-mono text-[11px] font-semibold text-[#7D4047]">
                  {LMPC_STATUTORY_MATRIX.rule_6_mandatory_declarations[selectedCategory].citation}
                </p>
                <ul className="divide-y divide-[#DDD5CD]/70 border-t border-[#DDD5CD] text-xs text-[#2E2E2E]">
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

      {/* Tab 4: Administrative Audit Log (SEC-07 — Maintainer Only) */}
      {matrixTab === 'audit_log' && (
        <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
          <div className="border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
              Security &amp; Rule Governance Audit Log (SEC-07)
            </h2>
            <p className="text-xs text-[#2E2E2E]/70">
              Records actor_id, action, target, timestamp, and outcome for rule publications, HITL
              decisions, analyses, and access denials.
            </p>
          </div>

          {!permissions.canViewAuditLog ? (
            <div
              role="alert"
              className="flex items-center gap-3 p-6 text-xs text-red-900 bg-red-50/70"
            >
              <Lock className="h-4 w-4 text-red-700 shrink-0" />
              <span>
                ERR-08: Administrative Audit Log requires{' '}
                <strong>Rule Maintainer / Administrator</strong> privileges (SEC-07 / AUTH-04).
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#DDD5CD] bg-[#DDD5CD]/50 text-[#2E2E2E]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Event ID</th>
                    <th className="px-4 py-2.5 font-semibold">Actor</th>
                    <th className="px-4 py-2.5 font-semibold">Action</th>
                    <th className="px-4 py-2.5 font-semibold">Target</th>
                    <th className="px-4 py-2.5 font-semibold">Outcome</th>
                    <th className="px-4 py-2.5 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDD5CD]">
                  {auditEvents.map((ev) => (
                    <tr key={ev.eventId} className="hover:bg-[#F1ECE6]">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-[#2E2E2E]/80">
                        {ev.eventId}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[#2E2E2E]">{ev.actorId}</span>
                        <span className="block text-[10px] text-[#2E2E2E]/60">{ev.actorRole}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-[#7D4047]">
                        {ev.action}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[#2E2E2E]">{ev.target}</span>
                        <span className="block text-[11px] text-[#2E2E2E]/70">{ev.details}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold">
                        <span
                          className={
                            ev.outcome === 'SUCCESS'
                              ? 'text-emerald-700'
                              : ev.outcome === 'DENIED'
                                ? 'text-red-700'
                                : 'text-amber-800'
                          }
                        >
                          {ev.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-[#2E2E2E]/65">
                        {new Date(ev.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
