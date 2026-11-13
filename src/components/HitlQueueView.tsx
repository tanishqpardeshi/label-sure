import React, { useState } from 'react';
import { CheckCircle2, FileWarning, ShieldAlert, XCircle } from 'lucide-react';
import type { HitlReviewItem } from '../types/compliance';

interface HitlQueueViewProps {
  items: HitlReviewItem[];
  onResolveItem: (
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    correctedText: string,
    note: string,
  ) => void;
}

export const HitlQueueView: React.FC<HitlQueueViewProps> = ({ items, onResolveItem }) => {
  const [filterStatus, setFilterStatus] = useState<'PENDING' | 'ALL'>('PENDING');
  const visibleItems = items.filter((item) =>
    filterStatus === 'PENDING' ? item.status === 'PENDING' : true,
  );

  const [selectedId, setSelectedId] = useState<string>(visibleItems[0]?.id ?? items[0]?.id ?? '');
  const selectedItem =
    visibleItems.find((i) => i.id === selectedId) ?? visibleItems[0] ?? items[0];

  const [editedText, setEditedText] = useState<string>(selectedItem?.suggestedText ?? '');
  const [inspectorNote, setInspectorNote] = useState<string>('');

  const selectItem = (item: HitlReviewItem) => {
    setSelectedId(item.id);
    setEditedText(item.suggestedText);
    setInspectorNote(item.inspectorNote ?? '');
  };

  const handleDecision = (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedItem) return;
    onResolveItem(selectedItem.id, decision, editedText, inspectorNote);
    const remaining = items.filter((i) => i.id !== selectedItem.id && i.status === 'PENDING');
    if (remaining[0]) {
      selectItem(remaining[0]);
    }
  };

  const pendingCount = items.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
              Human-in-the-Loop (HITL) Inspector Queue
            </h1>
            <p className="text-xs text-slate-500">
              Confidence Module Gatekeeper: Any OCR extraction below 85% confidence is held as
              UNVERIFIED here—never auto-fined.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilterStatus('PENDING')}
              className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                filterStatus === 'PENDING'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                filterStatus === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Cases ({items.length})
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Queue List */}
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-200 lg:col-span-5">
          {visibleItems.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-900">All HITL cases verified</p>
              <p className="text-xs text-slate-500">
                Switch to &quot;All Cases&quot; to audit inspector decisions or scan a new low-contrast
                package image.
              </p>
            </div>
          ) : (
            visibleItems.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {item.id}
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        item.status === 'PENDING'
                          ? 'text-amber-700'
                          : item.status === 'APPROVED'
                            ? 'text-emerald-700'
                            : 'text-red-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">{item.productName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{item.fieldLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-amber-700 font-medium">
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
          aria-label="Inspector verification workbench"
          className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7"
        >
          {selectedItem ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-amber-700" />
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      {selectedItem.productName} — {selectedItem.fieldLabel}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Inspection {selectedItem.inspectionId} · Region{' '}
                    <span className="font-mono">{selectedItem.region}</span> · Issue:{' '}
                    {selectedItem.issueType}
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-[11px] text-slate-500 block">OCR Confidence</span>
                  <span className="text-base font-bold text-amber-700">
                    {(selectedItem.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Simulated Cropped Region Preview */}
              <div>
                <span className="text-xs font-medium text-slate-700">
                  Cropped Evidence Region (bbox [{selectedItem.bbox.x_min},{' '}
                  {selectedItem.bbox.y_min}, {selectedItem.bbox.x_max}, {selectedItem.bbox.y_max}])
                </span>
                <div className="mt-1.5 relative overflow-hidden rounded-md border border-amber-300 bg-gradient-to-r from-slate-200 via-white to-slate-300 p-5 text-center">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-40"
                    style={{
                      backgroundImage:
                        'linear-gradient(125deg, transparent 35%, rgba(255,255,255,0.9) 50%, transparent 65%)',
                    }}
                  />
                  <p className="relative font-mono text-base font-semibold tracking-wide text-slate-800 blur-[0.4px]">
                    {selectedItem.rawOcrText}
                  </p>
                  <p className="relative mt-2 text-[11px] text-slate-500">
                    Raw OCR Read ({selectedItem.issueType})
                  </p>
                </div>
              </div>

              {/* Editable Verified Text */}
              <div>
                <label
                  htmlFor="hitl-edit-text"
                  className="block text-xs font-medium text-slate-700"
                >
                  Inspector Verified / Corrected Text
                </label>
                <input
                  id="hitl-edit-text"
                  type="text"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  disabled={selectedItem.status !== 'PENDING'}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-700 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="hitl-inspector-note"
                  className="block text-xs font-medium text-slate-700"
                >
                  Audit Rationale &amp; Calibration Note
                </label>
                <input
                  id="hitl-inspector-note"
                  type="text"
                  placeholder="e.g., Confirmed digit 5 under metallic specular glare; feed sample to PaddleOCR retraining set"
                  value={inspectorNote}
                  onChange={(e) => setInspectorNote(e.target.value)}
                  disabled={selectedItem.status !== 'PENDING'}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              {selectedItem.status === 'PENDING' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-500">
                    Decision triggers continuous OCR calibration feedback loop
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecision('REJECTED')}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Flag Violation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision('APPROVED')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve &amp; Verify
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
                  <ShieldAlert className="h-4 w-4 text-slate-500" />
                  <span>
                    Case resolved as <strong className="font-mono">{selectedItem.status}</strong>{' '}
                    with verified value:{' '}
                    <span className="font-mono font-semibold">{selectedItem.suggestedText}</span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              Select a queue item to inspect cropped OCR evidence.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
