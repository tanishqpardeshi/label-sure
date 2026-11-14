import React from 'react';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { PipelineStageRecord, ProcessingState } from '../types/compliance';

interface PipelineStepperProps {
  analysisId: string;
  ruleSetVersionId: string;
  processingState: ProcessingState;
  stages: PipelineStageRecord[];
}

const PROCESSING_BADGE: Record<
  ProcessingState,
  { icon: React.ReactNode; label: string; styleClass: string }
> = {
  QUEUED: {
    icon: <Clock className="h-3.5 w-3.5 text-[#2E2E2E]/70 shrink-0" />,
    label: 'QUEUED',
    styleClass: 'border-[#DDD5CD] bg-[#F1ECE6] text-[#2E2E2E]',
  },
  PROCESSING: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7D4047] shrink-0" />,
    label: 'PROCESSING',
    styleClass: 'border-[#7D4047]/40 bg-[#7D4047]/10 text-[#7D4047]',
  },
  COMPLETED: {
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />,
    label: 'COMPLETED',
    styleClass: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  },
  FAILED: {
    icon: <XCircle className="h-3.5 w-3.5 text-red-700 shrink-0" />,
    label: 'FAILED',
    styleClass: 'border-red-300 bg-red-50 text-red-900',
  },
};

export const PipelineStepper: React.FC<PipelineStepperProps> = ({
  analysisId,
  ruleSetVersionId,
  processingState,
  stages,
}) => {
  const badge = PROCESSING_BADGE[processingState];

  return (
    <section
      aria-label="6-stage screening pipeline status"
      data-testid="pipeline-stepper"
      className="no-print rounded-xl border border-[#DDD5CD] bg-[#FAF7F2] p-4 shadow-[0_1px_3px_rgba(46,46,46,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD5CD]/80 pb-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#2E2E2E]/75">
          <h2 className="font-display text-sm font-semibold text-[#2E2E2E]">
            6-Stage Screening Pipeline
          </h2>
          <span aria-hidden="true">·</span>
          <span>
            Analysis ID: <strong className="font-mono text-[#2E2E2E]">{analysisId}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Rule-Set: <strong className="font-mono text-[#7D4047]">{ruleSetVersionId}</strong>
          </span>
        </div>

        <div
          data-testid="processing-state-badge"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${badge.styleClass}`}
        >
          {badge.icon}
          <span>STATE: {badge.label}</span>
        </div>
      </div>

      <ol className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
        {stages.map((stage) => {
          const isCompleted = stage.status === 'COMPLETED';
          const isFailed = stage.status === 'FAILED';
          const isActive = stage.status === 'ACTIVE';

          const cardStyle = isFailed
            ? 'border-red-300 bg-red-50/70'
            : isCompleted
              ? 'border-[#DDD5CD] bg-[#F1ECE6]'
              : isActive
                ? 'border-[#7D4047]/40 bg-[#7D4047]/10'
                : 'border-[#DDD5CD] bg-[#F1ECE6]/60';

          return (
            <li
              key={stage.id}
              data-testid={`pipeline-stage-${stage.id.toLowerCase()}`}
              className={`rounded-lg border p-2.5 ${cardStyle}`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-display text-xs font-semibold text-[#2E2E2E]">
                  {stage.stepNumber}. {stage.label}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold">
                  {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />}
                  {isFailed && <XCircle className="h-3.5 w-3.5 text-red-700" />}
                  {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7D4047]" />}
                  {!isCompleted && !isFailed && !isActive && (
                    <Clock className="h-3.5 w-3.5 text-[#2E2E2E]/50" />
                  )}
                  <span
                    className={
                      isFailed
                        ? 'text-red-800'
                        : isCompleted
                          ? 'text-emerald-800'
                          : isActive
                            ? 'text-[#7D4047]'
                            : 'text-[#2E2E2E]/60'
                    }
                  >
                    {stage.status}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[#2E2E2E]/85">{stage.detail}</p>
              {stage.metadata && (
                <p className="mt-1 font-mono text-[10px] text-[#2E2E2E]/65 truncate">
                  {stage.metadata}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};
