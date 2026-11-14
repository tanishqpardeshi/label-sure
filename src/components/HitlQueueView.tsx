import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, FileWarning, Lock, ShieldAlert, XCircle } from 'lucide-react';
import { getRolePermissions } from '../lib/rbac';
import type { HitlReviewItem, UserRole } from '../types/compliance';

interface HitlQueueViewProps {
  activeRole: UserRole;
  items: HitlReviewItem[];
  onResolveItem: (
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    correctedText: string,
    note: string,
  ) => void;
  onOpenAnalysis?: (analysisId: string) => void;
}

const ITEM_STATUS_STYLE: Record<
  HitlReviewItem['status'],
  { icon: React.ReactNode; label: string; className: string }
> = {
  PENDING: {
    icon: <Clock className="h-3.5 w-3.5 text-amber-700 shrink-0" />,
    label: 'PENDING',
    className: 'text-amber-900 bg-amber-50 border-amber-300',
  },
  APPROVED: {
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />,
    label: 'APPROVED',
    className: 'text-emerald-900 bg-emerald-50 border-emerald-300',
  },
  REJECTED: {
    icon: <XCircle className="h-3.5 w-3.5 text-red-700 shrink-0" />,
    label: 'REJECTED',
    className: 'text-red-900 bg-red-50 border-red-300',
  },
};

export const HitlQueueView: React.FC<HitlQueueViewProps> = ({
  activeRole,
  items,
  onResolveItem,
  onOpenAnalysis,
}) => {
  const permissions = getRolePermissions(activeRole);
  const [filterStatus, setFilterStatus] = useState<'PENDING' | 'ALL'>('PENDING');
  const visibleItems = items.filter((item) =>
    filterStatus === 'PENDING' ? item.status === 'PENDING' : true,
  );

  const [selectedId, setSelectedId] = useState<string>(visibleItems[0]?.id ?? items[0]?.id ?? '');
  const selectedItem =
    visibleItems.find((i) => i.id === selectedId) ?? visibleItems[0] ?? items[0];

  const [editedText, setEditedText] = useState<string>(selectedItem?.suggestedText ?? '');
  const [inspectorNote, setInspectorNote] = useState<string>(selectedItem?.inspectorNote ?? '');

  useEffect(() => {
    if (selectedItem) {
      setEditedText(selectedItem.suggestedText);
      setInspectorNote(selectedItem.inspectorNote ?? '');
    }
  }, [selectedItem?.id]);

  const selectItem = (item: HitlReviewItem) => {
    setSelectedId(item.id);
    setEditedText(item.suggestedText);
    setInspectorNote(item.inspectorNote ?? '');
  };

  const handleDecision = (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedItem || !permissions.canReviewHitl) return;
    onResolveItem(selectedItem.id, decision, editedText, inspectorNote);
    const remaining = items.filter((i) => i.id !== selectedItem.id && i.status === 'PENDING');
    if (remaining[0]) {
      selectItem(remaining[0]);
    }
  };

  const pendingCount = items.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 space-y-3 shadow-[0_1px_3px_rgba(46,46,46,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-[#2E2E2E]">
              Human-in-the-Loop (HITL) Unverified Review Queue
            </h1>
            <p className="text-xs text-[#2E2E2E]/75">
              Non-Guessing Confidence Gatekeeper: Extractions below 85% confidence, missing
              mandatory fields, or ambiguous date orders are held as UNVERIFIED here (FR-014 /
              BR-03).
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[#DDD5CD] bg-[#DDD5CD]/45 p-1">
            <button
              type="button"
              onClick={() => setFilterStatus('PENDING')}
              className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                filterStatus === 'PENDING'
                  ? 'bg-[#7D4047] text-[#FAF7F2] font-semibold shadow-xs'
                  : 'text-[#2E2E2E]/80 hover:text-[#2E2E2E]'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                filterStatus === 'ALL'
                  ? 'bg-[#7D4047] text-[#FAF7F2] font-semibold shadow-xs'
                  : 'text-[#2E2E2E]/80 hover:text-[#2E2E2E]'
              }`}
            >
              All Cases ({items.length})
            </button>
          </div>
        </div>

        {!permissions.canReviewHitl && (
          <div
            role="note"
            data-testid="hitl-rbac-readonly"
            className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950"
          >
            <Lock className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              Read-only queue preview for role <strong className="font-mono">{activeRole}</strong>.
              Switch to <strong>Inspector / Reviewer</strong> or{' '}
              <strong>Rule Maintainer / Administrator</strong> to approve or reject UNVERIFIED
              cases (AUTH-03 / ERR-08).
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Queue List */}
        <div className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] divide-y divide-[#DDD5CD] overflow-hidden shadow-[0_1px_3px_rgba(46,46,46,0.04)] lg:col-span-5">
          {visibleItems.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-700" />
              <p className="text-sm font-semibold text-[#2E2E2E]">All HITL cases verified</p>
              <p className="text-xs text-[#2E2E2E]/70">
                Switch to &quot;All Cases&quot; to audit reviewer decisions or run AT-07 in the
                Workbench to generate a low-confidence / ambiguous case.
              </p>
            </div>
          ) : (
            visibleItems.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const statusMeta = ITEM_STATUS_STYLE[item.status];
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`hitl-item-${item.id}`}
                  onClick={() => selectItem(item)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected ? 'bg-[#7D4047]/10' : 'hover:bg-[#F1ECE6]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[#7D4047]">
                      {item.id}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${statusMeta.className}`}
                    >
                      {statusMeta.icon}
                      <span>{statusMeta.label}</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-[#2E2E2E]">{item.productName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#2E2E2E]/70">
                    <span>{item.fieldLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-amber-800 font-semibold">
                      {(item.confidence * 100).toFixed(0)}% conf
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.issueType}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Inspector Workbench */}
        <section
          aria-label="Reviewer verification workbench"
          className="rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-5 shadow-[0_1px_3px_rgba(46,46,46,0.04)] lg:col-span-7"
        >
          {selectedItem ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DDD5CD] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-amber-700" />
                    <h2 className="font-display text-base font-semibold text-[#2E2E2E]">
                      {selectedItem.productName} — {selectedItem.fieldLabel}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-xs text-[#2E2E2E]/70">
                    Analysis <span className="font-mono text-[#7D4047] font-medium">{selectedItem.analysisId}</span> · Owner{' '}
                    <span className="font-mono">{selectedItem.ownerId}</span> · Side{' '}
                    <span className="font-mono">{selectedItem.sourceSideLabel ?? 'BACK_STATUTORY'}</span>{' '}
                    · Region <span className="font-mono">{selectedItem.region}</span>
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-[11px] text-[#2E2E2E]/65 block">OCR Confidence</span>
                  <span className="text-base font-bold text-amber-800">
                    {(selectedItem.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Evidence Crop Box */}
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#2E2E2E]">
                    Cropped Evidence Region (bbox [{selectedItem.bbox.x_min},{' '}
                    {selectedItem.bbox.y_min}, {selectedItem.bbox.x_max}, {selectedItem.bbox.y_max}])
                  </span>
                  {onOpenAnalysis && (
                    <button
                      type="button"
                      onClick={() => onOpenAnalysis(selectedItem.analysisId)}
                      className="font-semibold text-[#7D4047] hover:underline"
                    >
                      Open Analysis in Workbench
                    </button>
                  )}
                </div>
                <div className="mt-1.5 relative overflow-hidden rounded-lg border border-amber-300 bg-gradient-to-r from-[#DDD5CD] via-[#FAF7F2] to-[#DDD5CD] p-5 text-center">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-40"
                    style={{
                      backgroundImage:
                        'linear-gradient(125deg, transparent 35%, rgba(255,255,255,0.9) 50%, transparent 65%)',
                    }}
                  />
                  <p className="relative font-mono text-base font-semibold tracking-wide text-[#2E2E2E]">
                    {selectedItem.rawOcrText || '[MISSING DECLARATION — NOT DETECTED]'}
                  </p>
                  <p className="relative mt-2 text-[11px] text-[#2E2E2E]/70">
                    Raw OCR Read ({selectedItem.issueType})
                  </p>
                </div>
              </div>

              {/* Editable Verified Text */}
              <div>
                <label
                  htmlFor="hitl-edit-text"
                  className="block text-xs font-medium text-[#2E2E2E]"
                >
                  Reviewer Verified / Corrected Text
                </label>
                <input
                  id="hitl-edit-text"
                  type="text"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  disabled={selectedItem.status !== 'PENDING' || !permissions.canReviewHitl}
                  className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-2 font-mono text-sm text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none disabled:opacity-65"
                />
              </div>

              <div>
                <label
                  htmlFor="hitl-inspector-note"
                  className="block text-xs font-medium text-[#2E2E2E]"
                >
                  Audit Rationale &amp; Verification Note
                </label>
                <input
                  id="hitl-inspector-note"
                  type="text"
                  placeholder="e.g., Confirmed unambiguous date format & legible numerals from back statutory crop"
                  value={inspectorNote}
                  onChange={(e) => setInspectorNote(e.target.value)}
                  disabled={selectedItem.status !== 'PENDING' || !permissions.canReviewHitl}
                  className="mt-1 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-2 text-xs text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none disabled:opacity-65"
                />
              </div>

              {selectedItem.status === 'PENDING' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD5CD] pt-4">
                  <span className="text-xs text-[#2E2E2E]/70">
                    Resolution logs an immutable SEC-07 audit event and updates linked reports
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!permissions.canReviewHitl}
                      data-testid="hitl-reject-btn"
                      onClick={() => handleDecision('REJECTED')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Flag Violation
                    </button>
                    <button
                      type="button"
                      disabled={!permissions.canReviewHitl}
                      data-testid="hitl-approve-btn"
                      onClick={() => handleDecision('APPROVED')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#7D4047] px-3.5 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#663238] disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve &amp; Verify
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-3 py-2.5 text-xs text-[#2E2E2E]">
                  <ShieldAlert className="h-4 w-4 text-[#7D4047] shrink-0" />
                  <span>
                    Case resolved as <strong className="font-mono">{selectedItem.status}</strong>{' '}
                    with verified value:{' '}
                    <span className="font-mono font-semibold">{selectedItem.suggestedText}</span>
                    {selectedItem.reviewedBy && (
                      <span className="text-[#2E2E2E]/70"> · Reviewed by {selectedItem.reviewedBy}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#2E2E2E]/70">
              Select a queue item to inspect cropped OCR evidence.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
