import React from 'react';
import { AlertTriangle, FileCheck2, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { MANDATORY_SCREENING_DISCLAIMER } from '../lib/complianceEngine';
import { DEMO_SESSIONS } from '../lib/rbac';
import type { UserRole } from '../types/compliance';

interface VisitorPortalViewProps {
  attemptedPrivateRoute?: string | null;
  onSelectRole: (role: UserRole) => void;
}

export const VisitorPortalView: React.FC<VisitorPortalViewProps> = ({
  attemptedPrivateRoute,
  onSelectRole,
}) => {
  return (
    <div className="space-y-6">
      {attemptedPrivateRoute && (
        <div
          role="alert"
          data-testid="visitor-access-denied"
          className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-900 shadow-[0_1px_2px_rgba(46,46,46,0.04)]"
        >
          <Lock className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              ERR-08: Access Denied — Authentication Required (AUTH-01 / SEC-01)
            </p>
            <p className="mt-0.5">
              Unauthenticated Visitors cannot access {attemptedPrivateRoute}, uploaded label images,
              or compliance reports. Select an authenticated demo role below to continue.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-6 space-y-5 shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#DDD5CD]/80 pb-4">
          <div className="max-w-2xl space-y-1.5">
            <div className="flex items-center gap-2 text-[#7D4047]">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-mono text-xs font-semibold">
                Controlled Demo Session Mode · Public Informational Screen
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#2E2E2E]">
              LabelSure — From Package Label to Proof
            </h1>
            <p className="text-sm text-[#2E2E2E]/80 leading-relaxed">
              Explainable pre-screening workbench verifying packaged commodity label declarations
              under the Legal Metrology (Packaged Commodities) Rules, 2011 and FSSAI Labelling
              &amp; Display Regulations, 2020.
            </p>
          </div>
        </div>

        {/* Mandatory BR-06 Screening Disclaimer */}
        <div
          role="note"
          data-testid="br06-disclaimer"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950"
        >
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed font-medium">{MANDATORY_SCREENING_DISCLAIMER}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#DDD5CD] bg-[#F1ECE6] p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2E2E2E]">
              <FileCheck2 className="h-4 w-4 text-[#7D4047]" />
              <span>Multi-Side Intake &amp; Limits</span>
            </div>
            <p className="text-xs text-[#2E2E2E]/80 leading-relaxed">
              Accepts JPG, PNG, and WEBP package side images up to 10 MB per image with magic-byte
              and decode validation before OCR.
            </p>
          </div>
          <div className="rounded-xl border border-[#DDD5CD] bg-[#F1ECE6] p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2E2E2E]">
              <UserCheck className="h-4 w-4 text-[#7D4047]" />
              <span>Non-Guessing Confidence Gate</span>
            </div>
            <p className="text-xs text-[#2E2E2E]/80 leading-relaxed">
              Missing declarations, ambiguous dates, and low-confidence OCR readings (&lt;85%) are
              marked UNVERIFIED and routed for human review.
            </p>
          </div>
          <div className="rounded-xl border border-[#DDD5CD] bg-[#F1ECE6] p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2E2E2E]">
              <Lock className="h-4 w-4 text-[#7D4047]" />
              <span>Record Isolation (RBAC)</span>
            </div>
            <p className="text-xs text-[#2E2E2E]/80 leading-relaxed">
              Private package analyses, images, and reports are hidden from unauthenticated
              visitors and isolated by record ownership.
            </p>
          </div>
        </div>

        {/* Demo Authentication Choices */}
        <div className="border-t border-[#DDD5CD]/80 pt-5">
          <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
            Authenticate Controlled Demo Session
          </h2>
          <p className="mt-1 text-xs text-[#2E2E2E]/70">
            Select a role below (or via the top header switcher) to evaluate role-scoped workflows:
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['MANUFACTURER', 'INSPECTOR', 'MAINTAINER'] as const).map((roleKey) => {
              const session = DEMO_SESSIONS[roleKey];
              const scopeSummary =
                roleKey === 'MANUFACTURER'
                  ? 'Create analyses, view & export own reports. Cannot edit rules or view others’ records.'
                  : roleKey === 'INSPECTOR'
                    ? 'Create analyses, inspect authorized reports, and resolve UNVERIFIED HITL queue items.'
                    : 'Manage draft rules, publish immutable rule-set versions, and view the Audit Log.';

              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => onSelectRole(roleKey)}
                  className="flex flex-col justify-between rounded-xl border border-[#DDD5CD] bg-[#F1ECE6] p-4 text-left transition-colors hover:border-[#7D4047] hover:bg-[#7D4047]/10"
                >
                  <div>
                    <span className="font-display text-sm font-semibold text-[#7D4047]">
                      Sign in as {session.displayName}
                    </span>
                    <p className="mt-1 text-xs text-[#2E2E2E]/80 leading-relaxed">{scopeSummary}</p>
                  </div>
                  <span className="mt-3 font-mono text-[11px] text-[#2E2E2E]/65">
                    actor_id: {session.actorId}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
