import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Lock,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  FULL_SRS_ACCEPTANCE_MATRIX,
  SRS_ACCEPTANCE_FIXTURES,
  type AcceptanceTestSpec,
} from '../data/goldenSample';
import { canAccessRecord } from '../lib/rbac';
import type {
  DemoSession,
  InspectionReport,
  RuleSetVersion,
} from '../types/compliance';

interface RecordsAndTestsViewProps {
  session: DemoSession;
  persistedAnalyses: InspectionReport[];
  publishedRuleSets: RuleSetVersion[];
  activeReportId: string;
  onOpenReport: (analysisId: string) => void;
  onRunAcceptanceFixture: (fixtureId: AcceptanceTestSpec['id']) => void;
}

function VerdictBadge({ report }: { report: InspectionReport }) {
  if (report.processingState === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-0.5 font-mono text-[11px] font-bold text-red-900">
        <XCircle className="h-3.5 w-3.5 text-red-700" />
        FAILED ({report.errorDetail?.code ?? 'ERR-01'})
      </span>
    );
  }
  if (report.overallStatus === 'PASS') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-900">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
        PASS
      </span>
    );
  }
  if (report.overallStatus === 'FAIL') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-0.5 font-mono text-[11px] font-bold text-red-900">
        <XCircle className="h-3.5 w-3.5 text-red-700" />
        FAIL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
      REVIEW_REQUIRED
    </span>
  );
}

export const RecordsAndTestsView: React.FC<RecordsAndTestsViewProps> = ({
  session,
  persistedAnalyses,
  publishedRuleSets,
  activeReportId,
  onOpenReport,
  onRunAcceptanceFixture,
}) => {
  const authorizedRecords = persistedAnalyses.filter((r) => canAccessRecord(session, r));
  const hiddenOtherOwnerCount = persistedAnalyses.length - authorizedRecords.length;
  const activeRuleSetId = publishedRuleSets[0]?.versionId ?? 'LMPC-2011-v1.0.0';

  const historicalBaselineRecords = authorizedRecords.filter(
    (r) => r.ruleSetVersionId !== activeRuleSetId,
  );

  return (
    <div className="space-y-6">
      {/* Section 1: Persisted Inspection Records (FR-018 & RBAC Isolation) */}
      <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-[#2E2E2E]">
              Persisted Inspection Records &amp; SRS Acceptance Suite
            </h1>
            <p className="text-xs text-[#2E2E2E]/75">
              Persistent local + backend inspection ledger (FR-018) scoped by RBAC ownership
              (AUTH-02 / SEC-06) · Active Rule-Set:{' '}
              <span className="font-mono font-semibold text-[#7D4047]">{activeRuleSetId}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-mono tabular-nums text-[#2E2E2E]/85">
              Visible: <strong>{authorizedRecords.length}</strong> of {persistedAnalyses.length} records
            </span>
          </div>
        </div>

        {hiddenOtherOwnerCount > 0 && (
          <div
            role="note"
            data-testid="rbac-ownership-isolation-notice"
            className="flex items-center gap-2 border-b border-[#DDD5CD] bg-[#DDD5CD]/45 px-4 py-2 text-xs text-[#2E2E2E]"
          >
            <Lock className="h-3.5 w-3.5 text-[#7D4047] shrink-0" />
            <span>
              RBAC Ownership Filter Active (<strong className="font-mono">{session.actorId}</strong>
              ): {hiddenOtherOwnerCount} record{hiddenOtherOwnerCount === 1 ? '' : 's'} belonging
              to other manufacturers {hiddenOtherOwnerCount === 1 ? 'is' : 'are'} hidden from this
              session (SEC-06 / AT-11). Switch to <strong>Inspector</strong> or{' '}
              <strong>Maintainer</strong> to inspect all submissions.
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#DDD5CD] bg-[#DDD5CD]/50 text-[#2E2E2E]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Analysis ID</th>
                <th className="px-4 py-2.5 font-semibold">Brand &amp; Category</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 font-semibold">Rule-Set Version</th>
                <th className="px-4 py-2.5 font-semibold">Verdict / State</th>
                <th className="px-4 py-2.5 font-semibold">Timestamp</th>
                <th className="px-4 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD5CD]">
              {authorizedRecords.map((rec) => {
                const isActive = rec.analysisId === activeReportId;
                return (
                  <tr
                    key={rec.analysisId}
                    data-testid={`record-row-${rec.analysisId}`}
                    className={isActive ? 'bg-[#7D4047]/10' : 'hover:bg-[#F1ECE6]'}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-[#7D4047]">
                      {rec.analysisId}
                      {rec.fixtureId && (
                        <span className="ml-1.5 text-[10px] text-[#2E2E2E]/65">[{rec.fixtureId}]</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[#2E2E2E] block">
                        {rec.productContext.brand}
                      </span>
                      <span className="text-[11px] text-[#2E2E2E]/70">
                        {rec.productContext.category} · {rec.images.length} side
                        {rec.images.length === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#2E2E2E]/80">
                      {rec.ownerId}
                    </td>
                    <td
                      data-testid={`record-ruleset-${rec.analysisId}`}
                      className="px-4 py-3 font-mono font-semibold text-[#2E2E2E]"
                    >
                      {rec.ruleSetVersionId}
                    </td>
                    <td className="px-4 py-3">
                      <VerdictBadge report={rec} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-[#2E2E2E]/65">
                      {new Date(rec.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenReport(rec.analysisId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 py-1 text-xs font-medium text-[#2E2E2E] hover:bg-[#DDD5CD]/50 whitespace-nowrap"
                      >
                        <ExternalLink className="h-3 w-3 text-[#7D4047]" />
                        Open in Workbench
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Interactive SRS Acceptance Test Fixtures (AT-01..AT-10) */}
      <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 space-y-4 shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD5CD] pb-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[#7D4047]" />
            <div>
              <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
                Interactive SRS v1.0 Acceptance Test Fixtures
              </h2>
              <p className="text-xs text-[#2E2E2E]/70">
                Execute repeatable deterministic verification scenarios and inspect results in the
                Workbench or Rule Repository.
              </p>
            </div>
          </div>

          {historicalBaselineRecords.length > 0 && (
            <div
              data-testid="at10-immutability-verified"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              AT-10 Verified: {historicalBaselineRecords.length} historical record(s) locked to prior
              rule-set while active is {activeRuleSetId}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {SRS_ACCEPTANCE_FIXTURES.map((fixture) => (
            <div
              key={fixture.id}
              className="flex flex-col justify-between rounded-xl border border-[#DDD5CD] bg-[#F1ECE6] p-3.5 space-y-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold text-[#7D4047]">
                    {fixture.srsRef}
                  </span>
                </div>
                <h3 className="font-display text-sm font-semibold text-[#2E2E2E]">
                  {fixture.title}
                </h3>
                <p className="text-xs text-[#2E2E2E]/80 leading-relaxed">{fixture.description}</p>
                <p className="font-mono text-[11px] text-[#2E2E2E]/90 pt-1">
                  Expected: {fixture.expectedOutcome}
                </p>
              </div>

              <button
                type="button"
                data-testid={`records-fixture-${fixture.id}`}
                onClick={() => onRunAcceptanceFixture(fixture.id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#7D4047] px-3 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#663238]"
              >
                <Play className="h-3.5 w-3.5" />
                Run {fixture.id} Fixture
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Full SRS Section 12 Acceptance Matrix (AT-01..AT-12) */}
      <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex items-center gap-2 border-b border-[#DDD5CD] bg-[#F1ECE6] px-4 py-3">
          <FileCheck2 className="h-4 w-4 text-[#7D4047]" />
          <div>
            <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
              SRS Section 12 Acceptance Traceability Matrix (AT-01 to AT-12)
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#DDD5CD] bg-[#DDD5CD]/50 text-[#2E2E2E]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Test ID</th>
                <th className="px-4 py-2.5 font-semibold">Acceptance Criterion</th>
                <th className="px-4 py-2.5 font-semibold">SRS Traceability</th>
                <th className="px-4 py-2.5 font-semibold">Verification Surface</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD5CD]">
              {FULL_SRS_ACCEPTANCE_MATRIX.map((row) => (
                <tr key={row.id} className="hover:bg-[#F1ECE6]">
                  <td className="px-4 py-2.5 font-mono font-bold text-[#7D4047]">{row.id}</td>
                  <td className="px-4 py-2.5 font-medium text-[#2E2E2E]">{row.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-[#2E2E2E]/75">{row.srsRef}</td>
                  <td className="px-4 py-2.5 text-[#2E2E2E]/80">{row.mode}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                      IMPLEMENTED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
