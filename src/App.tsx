import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMPLIANT_FIXTURE_FIELDS,
  DEFAULT_COMPLIANCE_RULES,
  GOLDEN_SAMPLE_CONTEXT,
  GOLDEN_SAMPLE_FIELDS,
  GOLDEN_SAMPLE_IMAGES,
  INITIAL_AUDIT_EVENTS,
  INITIAL_HITL_QUEUE,
  INITIAL_PUBLISHED_RULE_SET,
  INITIAL_RULE_SET_VERSION_ID,
  LOW_CONFIDENCE_GLARE_FIELDS,
  MISSING_DECLARATION_FIELDS,
  type AcceptanceTestSpec,
} from './data/goldenSample';
import {
  buildFailedAnalysisReport,
  evaluatePackageCompliance,
} from './lib/complianceEngine';
import { canAccessRecord, DEMO_SESSIONS, getRolePermissions } from './lib/rbac';
import type {
  AnalysisImage,
  AuditEvent,
  ComplianceRule,
  ExtractedField,
  HitlReviewItem,
  InspectionReport,
  PackageSideLabel,
  ProductContext,
  RuleSetVersion,
  UserRole,
} from './types/compliance';
import { TopNav, type AppTab } from './components/TopNav';
import { ScannerView } from './components/ScannerView';
import { RuleEngineManager } from './components/RuleEngineManager';
import { HitlQueueView } from './components/HitlQueueView';
import { RecordsAndTestsView } from './components/RecordsAndTestsView';
import { CodeExporterView } from './components/CodeExporterView';
import { VisitorPortalView } from './components/VisitorPortalView';

const STORAGE_KEYS = {
  analyses: 'labelsure_mvp_v1_analyses',
  ruleSets: 'labelsure_mvp_v1_rulesets',
  draftRules: 'labelsure_mvp_v1_draft_rules',
  hitl: 'labelsure_mvp_v1_hitl',
  audit: 'labelsure_mvp_v1_audit',
};

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function buildSeedAnalyses(): InspectionReport[] {
  const gsReport = evaluatePackageCompliance({
    analysisId: 'ANL-GS-2026-001',
    ownerId: 'msme-abc-foods',
    ownerRole: 'MANUFACTURER',
    ruleSetVersionId: INITIAL_RULE_SET_VERSION_ID,
    sourceMode: 'golden_sample',
    fixtureId: 'AT-01',
    images: GOLDEN_SAMPLE_IMAGES,
    productContext: GOLDEN_SAMPLE_CONTEXT,
    fields: GOLDEN_SAMPLE_FIELDS,
    rules: INITIAL_PUBLISHED_RULE_SET.rules,
    timestamp: '2026-11-13T08:30:00Z',
  });

  const secondaryOwnerReport = evaluatePackageCompliance({
    analysisId: 'ANL-MP-4092',
    ownerId: 'msme-other-packer',
    ownerRole: 'MANUFACTURER',
    ruleSetVersionId: INITIAL_RULE_SET_VERSION_ID,
    sourceMode: 'acceptance_fixture',
    fixtureId: 'AT-05',
    images: GOLDEN_SAMPLE_IMAGES,
    productContext: {
      brand: 'Shree Ganesh Foods Pvt. Ltd.',
      category: 'Packaged Food',
      countryOfOrigin: 'India',
      stateJurisdiction: 'Gujarat (Central LMPC 2011 + FSSAI 2020)',
      pdpAreaCm2: 150,
    },
    fields: COMPLIANT_FIXTURE_FIELDS,
    rules: INITIAL_PUBLISHED_RULE_SET.rules,
    timestamp: '2026-11-13T08:45:00Z',
  });

  return [gsReport, secondaryOwnerReport];
}

function incrementSemanticVersion(currentVersionId: string): string {
  const match = currentVersionId.match(/^(.*-v)(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return `${currentVersionId}-next`;
  const [, prefix, major, minor] = match;
  return `${prefix}${major}.${Number(minor) + 1}.0`;
}

export default function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('MANUFACTURER');
  const [activeTab, setActiveTab] = useState<AppTab>('workbench');
  const [attemptedPrivateRoute, setAttemptedPrivateRoute] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [publishedRuleSets, setPublishedRuleSets] = useState<RuleSetVersion[]>(() =>
    readStoredJson(STORAGE_KEYS.ruleSets, [INITIAL_PUBLISHED_RULE_SET]),
  );
  const [draftRules, setDraftRules] = useState<ComplianceRule[]>(() =>
    readStoredJson(
      STORAGE_KEYS.draftRules,
      DEFAULT_COMPLIANCE_RULES.map((r) => ({ ...r, status: 'DRAFT' as const })),
    ),
  );
  const [hitlQueue, setHitlQueue] = useState<HitlReviewItem[]>(() =>
    readStoredJson(STORAGE_KEYS.hitl, INITIAL_HITL_QUEUE),
  );
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() =>
    readStoredJson(STORAGE_KEYS.audit, INITIAL_AUDIT_EVENTS),
  );
  const [persistedAnalyses, setPersistedAnalyses] = useState<InspectionReport[]>(() =>
    readStoredJson(STORAGE_KEYS.analyses, buildSeedAnalyses()),
  );

  const [activeReportId, setActiveReportId] = useState<string>(
    () => persistedAnalyses[0]?.analysisId ?? 'ANL-GS-2026-001',
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const uploadTriggerRef = useRef<HTMLInputElement | null>(null);
  const session = DEMO_SESSIONS[activeRole];
  const permissions = getRolePermissions(activeRole);
  const activePublishedRuleSet = publishedRuleSets[0] ?? INITIAL_PUBLISHED_RULE_SET;

  // Persist core state in browser localStorage (FR-018)
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.ruleSets, JSON.stringify(publishedRuleSets));
      window.localStorage.setItem(STORAGE_KEYS.draftRules, JSON.stringify(draftRules));
      window.localStorage.setItem(STORAGE_KEYS.hitl, JSON.stringify(hitlQueue));
      window.localStorage.setItem(STORAGE_KEYS.audit, JSON.stringify(auditEvents));
      window.localStorage.setItem(STORAGE_KEYS.analyses, JSON.stringify(persistedAnalyses));
    } catch {
      // Ignore quota errors in restricted storage environments
    }
  }, [publishedRuleSets, draftRules, hitlQueue, auditEvents, persistedAnalyses]);

  // Seed initial analyses onto Express backend store so API & UI stay synchronized
  useEffect(() => {
    if (activeRole === 'VISITOR') return;
    persistedAnalyses.slice(0, 5).forEach((rec) => {
      fetch('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': activeRole,
        },
        body: JSON.stringify({ report: rec }),
      }).catch(() => {});
    });
  }, [activeRole]);

  const appendAuditEvent = (event: Omit<AuditEvent, 'eventId' | 'timestamp'>) => {
    const entry: AuditEvent = {
      ...event,
      eventId: `AUD-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
    };
    setAuditEvents((prev) => [entry, ...prev]);
  };

  const upsertPersistedAnalysis = (report: InspectionReport) => {
    setPersistedAnalyses((prev) => {
      const idx = prev.findIndex((r) => r.analysisId === report.analysisId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = report;
        return next;
      }
      return [report, ...prev];
    });
    setActiveReportId(report.analysisId);

    if (activeRole !== 'VISITOR') {
      fetch('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': activeRole,
        },
        body: JSON.stringify({ report }),
      }).catch(() => {});
    }
  };

  // Enforce RBAC record ownership in Workbench
  const authorizedAnalyses = useMemo(
    () => persistedAnalyses.filter((r) => canAccessRecord(session, r)),
    [persistedAnalyses, session],
  );

  const activeReport = useMemo(() => {
    return (
      authorizedAnalyses.find((r) => r.analysisId === activeReportId) ??
      authorizedAnalyses[0] ??
      persistedAnalyses[0]
    );
  }, [authorizedAnalyses, activeReportId, persistedAnalyses]);

  const handleChangeRole = (nextRole: UserRole) => {
    const nextSession = DEMO_SESSIONS[nextRole];
    setActiveRole(nextRole);
    setAttemptedPrivateRoute(null);
    setStatusNotice(null);
    setAnalyzeError(null);

    appendAuditEvent({
      actorId: nextSession.actorId,
      actorRole: nextRole,
      action: 'ROLE_SESSION_SWITCHED',
      target: nextRole,
      outcome: 'SUCCESS',
      details: `Controlled demo session switched to ${nextSession.displayName} (${nextSession.actorId}).`,
    });

    if (nextRole !== 'VISITOR') {
      const accessible = persistedAnalyses.filter((r) => canAccessRecord(nextSession, r));
      if (accessible[0] && !accessible.some((r) => r.analysisId === activeReportId)) {
        setActiveReportId(accessible[0].analysisId);
      }
    }
  };

  const handleSelectTab = (tab: AppTab) => {
    setStatusNotice(null);
    if (activeRole === 'VISITOR') {
      const tabNames: Record<AppTab, string> = {
        workbench: 'Analysis & Screening Workbench',
        rules: 'Versioned Rule Repository',
        hitl: 'HITL Review Queue',
        records: 'Persisted Inspection Records',
        schema: 'SRS Schema Exporter',
      };
      setAttemptedPrivateRoute(tabNames[tab]);
      appendAuditEvent({
        actorId: session.actorId,
        actorRole: activeRole,
        action: 'ACCESS_DENIED',
        target: tab,
        outcome: 'DENIED',
        details: `Unauthenticated visitor blocked from accessing ${tabNames[tab]} (AUTH-01 / ERR-08).`,
      });
      return;
    }
    setActiveTab(tab);
  };

  const handleChangeContext = (nextContext: ProductContext) => {
    if (!activeReport || activeReport.processingState === 'FAILED') return;

    // Re-evaluate strictly against the rule-set version stamped on THIS report so AT-10 immutability holds
    const stampedRuleSet =
      publishedRuleSets.find((rs) => rs.versionId === activeReport.ruleSetVersionId) ??
      activePublishedRuleSet;

    const currentFields: ExtractedField[] = activeReport.checkpoints.map((cp) => ({
      id: cp.fieldId,
      key: cp.key,
      label: cp.label,
      rawText: cp.rawText,
      normalizedText: cp.normalizedText,
      region: cp.region,
      extractionStatus: cp.extractionStatus,
      confidence: cp.confidence,
      fontHeightMm: cp.fontHeightMm,
      bbox: cp.bbox,
      sourceImageId: cp.sourceImageId,
      sourceSideLabel: cp.sourceSideLabel,
      glareNormalized: cp.glareNormalized,
      glareRawSample: cp.glareRawSample,
    }));

    const updated = evaluatePackageCompliance({
      analysisId: activeReport.analysisId,
      ownerId: activeReport.ownerId,
      ownerRole: activeReport.ownerRole,
      ruleSetVersionId: activeReport.ruleSetVersionId,
      sourceMode: activeReport.sourceMode,
      fixtureId: activeReport.fixtureId,
      images: activeReport.images,
      productContext: nextContext,
      fields: currentFields,
      rules: stampedRuleSet.rules,
      ocrMetadata: activeReport.ocrMetadata,
      timestamp: activeReport.timestamp,
    });

    upsertPersistedAnalysis(updated);
  };

  const handleResetGoldenSample = () => {
    setAnalyzeError(null);
    setStatusNotice(null);
    const resetReport = evaluatePackageCompliance({
      analysisId: 'ANL-GS-2026-001',
      ownerId: session.role === 'MANUFACTURER' ? session.actorId : 'msme-abc-foods',
      ownerRole: 'MANUFACTURER',
      ruleSetVersionId: activePublishedRuleSet.versionId,
      sourceMode: 'golden_sample',
      fixtureId: 'AT-01',
      images: GOLDEN_SAMPLE_IMAGES,
      productContext: GOLDEN_SAMPLE_CONTEXT,
      fields: GOLDEN_SAMPLE_FIELDS,
      rules: activePublishedRuleSet.rules,
    });
    upsertPersistedAnalysis(resetReport);
    setActiveTab('workbench');
  };

  const enqueueHitlForUnverified = (report: InspectionReport) => {
    const unverifiedCps = report.checkpoints.filter((cp) => cp.status === 'UNVERIFIED');
    if (unverifiedCps.length === 0) return;

    const productName =
      report.checkpoints.find((c) => c.key === 'product_name')?.normalizedText ||
      report.productContext.brand;

    const newItems: HitlReviewItem[] = unverifiedCps.map((cp) => ({
      id: `HITL-${report.analysisId.slice(-4)}-${cp.key.slice(0, 3).toUpperCase()}`,
      analysisId: report.analysisId,
      ownerId: report.ownerId,
      productName: productName.startsWith('[MISSING') ? report.productContext.brand : productName,
      fieldKey: cp.key,
      fieldLabel: cp.label,
      region: cp.region,
      sourceSideLabel: cp.sourceSideLabel ?? 'BACK_STATUTORY',
      rawOcrText: cp.rawText,
      suggestedText: cp.normalizedText,
      confidence: cp.confidence,
      issueType:
        cp.extractionStatus === 'MISSING'
          ? 'Missing Mandatory Field'
          : cp.extractionStatus === 'AMBIGUOUS'
            ? 'Ambiguous Date Order'
            : 'Foil Glare Distortion',
      status: 'PENDING',
      capturedAt: report.timestamp,
      bbox: cp.bbox,
    }));

    setHitlQueue((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const uniqueNew = newItems.filter((n) => !existingIds.has(n.id));
      return [...uniqueNew, ...prev];
    });
  };

  const handleValidationFailure = (
    errorCode: 'ERR-01',
    message: string,
    guidance: string,
  ) => {
    const analysisId = `ANL-ERR-${Date.now().toString().slice(-5)}`;
    const failed = buildFailedAnalysisReport({
      analysisId,
      ownerId: session.actorId,
      ownerRole: activeRole,
      ruleSetVersionId: activePublishedRuleSet.versionId,
      sourceMode: 'upload',
      productContext: activeReport?.productContext ?? GOLDEN_SAMPLE_CONTEXT,
      images: [],
      errorDetail: {
        code: errorCode,
        stage: 'INTAKE',
        message,
        guidance,
      },
    });
    setAnalyzeError(message);
    upsertPersistedAnalysis(failed);
    appendAuditEvent({
      actorId: session.actorId,
      actorRole: activeRole,
      action: 'ANALYSIS_FAILED',
      target: analysisId,
      outcome: 'FAILED',
      details: message,
    });
  };

  const handleAnalyzeMultiSide = async (payload: {
    images: Array<{
      imageId: string;
      fileName: string;
      mimeType: string;
      sideLabel: PackageSideLabel;
      imageBase64?: string;
      presetImagePath?: string;
    }>;
    sourceMode: 'upload' | 'sample_preset';
    contextOverride?: ProductContext;
  }) => {
    if (!permissions.canRunAnalysis) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setStatusNotice(null);

    const targetContext = payload.contextOverride ?? activeReport?.productContext ?? GOLDEN_SAMPLE_CONTEXT;

    try {
      const response = await fetch('/api/analyze-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': activeRole,
        },
        body: JSON.stringify({
          images: payload.images,
          sourceMode: payload.sourceMode,
          productContext: targetContext,
          rules: activePublishedRuleSet.rules,
          ruleSetVersionId: activePublishedRuleSet.versionId,
        }),
      });

      const data = await response.json();
      if (!response.ok && data.report) {
        const failedReport = data.report as InspectionReport;
        setAnalyzeError(data.error || failedReport.errorDetail?.message || 'Analysis failed.');
        upsertPersistedAnalysis(failedReport);
        appendAuditEvent({
          actorId: session.actorId,
          actorRole: activeRole,
          action: 'ANALYSIS_FAILED',
          target: failedReport.analysisId,
          outcome: 'FAILED',
          details: failedReport.errorDetail?.message || 'Pipeline halted with error.',
        });
        return;
      }

      if (!response.ok || !data.report) {
        throw new Error(data.error || 'Failed to analyze package label image(s).');
      }

      const apiReport = data.report as InspectionReport;
      upsertPersistedAnalysis(apiReport);
      enqueueHitlForUnverified(apiReport);
      appendAuditEvent({
        actorId: session.actorId,
        actorRole: activeRole,
        action: 'ANALYSIS_CREATED',
        target: apiReport.analysisId,
        outcome: 'SUCCESS',
        details: `Evaluated ${apiReport.images.length} side(s) under ${apiReport.ruleSetVersionId} -> ${apiReport.overallStatus}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error during analysis pipeline.';
      setAnalyzeError(msg);
      const failed = buildFailedAnalysisReport({
        analysisId: `ANL-ERR-${Date.now().toString().slice(-5)}`,
        ownerId: session.actorId,
        ownerRole: activeRole,
        ruleSetVersionId: activePublishedRuleSet.versionId,
        sourceMode: payload.sourceMode,
        productContext: targetContext,
        images: [],
        errorDetail: {
          code: 'ERR-02',
          stage: 'OCR',
          message: msg,
          guidance:
            'Verify GEMINI_API_KEY configuration for live image OCR, or run deterministic SRS Acceptance Fixtures.',
        },
      });
      upsertPersistedAnalysis(failed);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleDraftRule = (ruleId: string) => {
    if (!permissions.canEditDraftRules) return;
    setDraftRules((prev) =>
      prev.map((r) => (r.ruleId === ruleId ? { ...r, enabled: !r.enabled } : r)),
    );
    appendAuditEvent({
      actorId: session.actorId,
      actorRole: activeRole,
      action: 'RULE_DRAFT_UPDATED',
      target: ruleId,
      outcome: 'SUCCESS',
      details: `Toggled enabled status of draft rule ${ruleId}.`,
    });
  };

  const handleUpdateDraftRuleParameters = (
    ruleId: string,
    paramsJson: Record<string, string | number | boolean | string[]>,
  ) => {
    if (!permissions.canEditDraftRules) return;
    setDraftRules((prev) =>
      prev.map((r) => (r.ruleId === ruleId ? { ...r, parameters: paramsJson } : r)),
    );
    appendAuditEvent({
      actorId: session.actorId,
      actorRole: activeRole,
      action: 'RULE_DRAFT_UPDATED',
      target: ruleId,
      outcome: 'SUCCESS',
      details: `Updated JSON parameters on draft rule ${ruleId}.`,
    });
  };

  const handlePublishNewRuleSetVersion = (releaseNotes: string): string => {
    const nextVersionId = incrementSemanticVersion(activePublishedRuleSet.versionId);
    const snapshot: RuleSetVersion = {
      versionId: nextVersionId,
      publishedAt: new Date().toISOString(),
      publishedBy: session.actorId,
      releaseNotes: releaseNotes.trim() || `Published ${nextVersionId}`,
      rules: draftRules.map((r) => ({ ...r, status: 'PUBLISHED' as const })),
    };

    setPublishedRuleSets((prev) => [snapshot, ...prev]);
    appendAuditEvent({
      actorId: session.actorId,
      actorRole: activeRole,
      action: 'RULE_SET_PUBLISHED',
      target: nextVersionId,
      outcome: 'SUCCESS',
      details: `${snapshot.releaseNotes} Historical analyses remain locked to prior version IDs (BR-08).`,
    });

    fetch('/api/rules/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': activeRole,
      },
      body: JSON.stringify({
        versionId: nextVersionId,
        releaseNotes: snapshot.releaseNotes,
        rules: snapshot.rules,
      }),
    }).catch(() => {});

    return nextVersionId;
  };

  const handleResolveHitlItem = (
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    correctedText: string,
    note: string,
  ) => {
    if (!permissions.canReviewHitl) return;
    const now = new Date().toISOString();

    setHitlQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: decision,
              suggestedText: correctedText,
              inspectorNote: note,
              reviewedBy: session.actorId,
              reviewedAt: now,
            }
          : item,
      ),
    );

    const targetItem = hitlQueue.find((i) => i.id === id);
    if (targetItem) {
      appendAuditEvent({
        actorId: session.actorId,
        actorRole: activeRole,
        action: decision === 'APPROVED' ? 'HITL_ITEM_APPROVED' : 'HITL_ITEM_REJECTED',
        target: `${targetItem.analysisId} (${targetItem.fieldKey})`,
        outcome: 'SUCCESS',
        details: note || `Reviewer set verified text: "${correctedText}".`,
      });

      const linkedReport = persistedAnalyses.find((r) => r.analysisId === targetItem.analysisId);
      if (linkedReport && linkedReport.processingState !== 'FAILED') {
        const stampedRuleSet =
          publishedRuleSets.find((rs) => rs.versionId === linkedReport.ruleSetVersionId) ??
          activePublishedRuleSet;

        const updatedFields: ExtractedField[] = linkedReport.checkpoints.map((cp) => {
          if (cp.key !== targetItem.fieldKey) {
            return {
              id: cp.fieldId,
              key: cp.key,
              label: cp.label,
              rawText: cp.rawText,
              normalizedText: cp.normalizedText,
              region: cp.region,
              extractionStatus: cp.extractionStatus,
              confidence: cp.confidence,
              fontHeightMm: cp.fontHeightMm,
              bbox: cp.bbox,
              sourceImageId: cp.sourceImageId,
              sourceSideLabel: cp.sourceSideLabel,
              glareNormalized: cp.glareNormalized,
              glareRawSample: cp.glareRawSample,
            };
          }
          return {
            id: cp.fieldId,
            key: cp.key,
            label: cp.label,
            rawText: correctedText,
            normalizedText: correctedText,
            region: cp.region,
            extractionStatus: 'EXTRACTED',
            confidence: decision === 'APPROVED' ? 0.99 : cp.confidence,
            fontHeightMm: cp.fontHeightMm || 2.0,
            bbox: cp.bbox,
            sourceImageId: cp.sourceImageId,
            sourceSideLabel: cp.sourceSideLabel,
            glareNormalized: cp.glareNormalized,
            glareRawSample: cp.glareRawSample,
          };
        });

        const reEvaluated = evaluatePackageCompliance({
          analysisId: linkedReport.analysisId,
          ownerId: linkedReport.ownerId,
          ownerRole: linkedReport.ownerRole,
          ruleSetVersionId: linkedReport.ruleSetVersionId,
          sourceMode: linkedReport.sourceMode,
          fixtureId: linkedReport.fixtureId,
          images: linkedReport.images,
          productContext: linkedReport.productContext,
          fields: updatedFields,
          rules: stampedRuleSet.rules,
          ocrMetadata: linkedReport.ocrMetadata,
          timestamp: linkedReport.timestamp,
        });
        upsertPersistedAnalysis(reEvaluated);
      }
    }
  };

  const handleRunAcceptanceFixture = (fixtureId: AcceptanceTestSpec['id']) => {
    setAnalyzeError(null);
    setStatusNotice(null);

    if (fixtureId === 'AT-01') {
      const report = evaluatePackageCompliance({
        analysisId: 'ANL-AT01-GS',
        ownerId: session.actorId,
        ownerRole: activeRole,
        ruleSetVersionId: activePublishedRuleSet.versionId,
        sourceMode: 'acceptance_fixture',
        fixtureId: 'AT-01',
        images: GOLDEN_SAMPLE_IMAGES,
        productContext: GOLDEN_SAMPLE_CONTEXT,
        fields: GOLDEN_SAMPLE_FIELDS,
        rules: activePublishedRuleSet.rules,
      });
      upsertPersistedAnalysis(report);
      setActiveTab('workbench');
      return;
    }

    if (fixtureId === 'AT-02') {
      const corruptSide: AnalysisImage[] = [
        {
          imageId: 'img-corrupt-01',
          fileName: 'corrupt_payload.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          sideLabel: 'FRONT_PDP',
          previewUrl: '',
        },
      ];
      const failedReport = buildFailedAnalysisReport({
        analysisId: 'ANL-AT02-ERR01',
        ownerId: session.actorId,
        ownerRole: activeRole,
        ruleSetVersionId: activePublishedRuleSet.versionId,
        sourceMode: 'acceptance_fixture',
        productContext: GOLDEN_SAMPLE_CONTEXT,
        images: corruptSide,
        errorDetail: {
          code: 'ERR-01',
          stage: 'INTAKE',
          message:
            'ERR-01: File "corrupt_payload.jpg" rejected — invalid JPEG magic bytes (corrupt or spoofed binary).',
          guidance: 'Upload a valid, uncorrupted JPG, PNG, or WEBP image (max 10 MB per side).',
        },
      });
      failedReport.fixtureId = 'AT-02';
      setAnalyzeError(failedReport.errorDetail?.message ?? null);
      upsertPersistedAnalysis(failedReport);
      appendAuditEvent({
        actorId: session.actorId,
        actorRole: activeRole,
        action: 'ANALYSIS_FAILED',
        target: failedReport.analysisId,
        outcome: 'FAILED',
        details: 'AT-02 corrupt upload halted cleanly at Intake stage with ERR-01.',
      });
      setActiveTab('workbench');
      return;
    }

    if (fixtureId === 'AT-04') {
      const report = evaluatePackageCompliance({
        analysisId: 'ANL-AT04-MISSING',
        ownerId: session.actorId,
        ownerRole: activeRole,
        ruleSetVersionId: activePublishedRuleSet.versionId,
        sourceMode: 'acceptance_fixture',
        fixtureId: 'AT-04',
        images: GOLDEN_SAMPLE_IMAGES,
        productContext: {
          brand: 'Shree Ganesh Foods Pvt. Ltd.',
          category: 'Packaged Food',
          countryOfOrigin: 'India',
          stateJurisdiction: 'Gujarat (Central LMPC 2011 + FSSAI 2020)',
          pdpAreaCm2: 150,
        },
        fields: MISSING_DECLARATION_FIELDS,
        rules: activePublishedRuleSet.rules,
      });
      upsertPersistedAnalysis(report);
      enqueueHitlForUnverified(report);
      appendAuditEvent({
        actorId: session.actorId,
        actorRole: activeRole,
        action: 'ANALYSIS_CREATED',
        target: report.analysisId,
        outcome: 'SUCCESS',
        details: 'AT-04 missing MRP/Net Quantity flagged as MISSING -> UNVERIFIED (never PASS).',
      });
      setActiveTab('workbench');
      return;
    }

    if (fixtureId === 'AT-05') {
      const report = evaluatePackageCompliance({
        analysisId: 'ANL-AT05-PASS',
        ownerId: session.actorId,
        ownerRole: activeRole,
        ruleSetVersionId: activePublishedRuleSet.versionId,
        sourceMode: 'acceptance_fixture',
        fixtureId: 'AT-05',
        images: GOLDEN_SAMPLE_IMAGES,
        productContext: {
          brand: 'Shree Ganesh Foods Pvt. Ltd.',
          category: 'Packaged Food',
          countryOfOrigin: 'India',
          stateJurisdiction: 'Gujarat (Central LMPC 2011 + FSSAI 2020)',
          pdpAreaCm2: 150,
        },
        fields: COMPLIANT_FIXTURE_FIELDS,
        rules: activePublishedRuleSet.rules,
      });
      upsertPersistedAnalysis(report);
      appendAuditEvent({
        actorId: session.actorId,
        actorRole: activeRole,
        action: 'ANALYSIS_CREATED',
        target: report.analysisId,
        outcome: 'SUCCESS',
        details: 'AT-05 fully compliant packaged commodity evaluated -> PASS.',
      });
      setActiveTab('workbench');
      return;
    }

    if (fixtureId === 'AT-07') {
      const report = evaluatePackageCompliance({
        analysisId: 'ANL-AT07-HITL',
        ownerId: session.actorId,
        ownerRole: activeRole,
        ruleSetVersionId: activePublishedRuleSet.versionId,
        sourceMode: 'acceptance_fixture',
        fixtureId: 'AT-07',
        images: GOLDEN_SAMPLE_IMAGES,
        productContext: {
          brand: 'Shree Ganesh Foods Pvt. Ltd.',
          category: 'Packaged Food',
          countryOfOrigin: 'India',
          stateJurisdiction: 'Gujarat (Central LMPC 2011 + FSSAI 2020)',
          pdpAreaCm2: 150,
        },
        fields: LOW_CONFIDENCE_GLARE_FIELDS,
        rules: activePublishedRuleSet.rules,
      });
      upsertPersistedAnalysis(report);
      enqueueHitlForUnverified(report);
      appendAuditEvent({
        actorId: session.actorId,
        actorRole: activeRole,
        action: 'ANALYSIS_CREATED',
        target: report.analysisId,
        outcome: 'SUCCESS',
        details: 'AT-07 low-confidence MRP & ambiguous date routed to HITL Queue as UNVERIFIED.',
      });
      setActiveTab('workbench');
      return;
    }

    if (fixtureId === 'AT-10') {
      let targetRuleSet = activePublishedRuleSet;
      if (publishedRuleSets.length === 1 && permissions.canPublishRuleVersion) {
        const newVerId = handlePublishNewRuleSetVersion(
          'AT-10 immutability release: published minor update while locking historical analyses.',
        );
        targetRuleSet = {
          versionId: newVerId,
          publishedAt: new Date().toISOString(),
          publishedBy: session.actorId,
          releaseNotes: 'AT-10 verification release',
          rules: draftRules.map((r) => ({ ...r, status: 'PUBLISHED' as const })),
        };
      }

      const newVersionReport = evaluatePackageCompliance({
        analysisId: `ANL-AT10-${targetRuleSet.versionId.slice(-6)}`,
        ownerId: session.actorId,
        ownerRole: activeRole,
        ruleSetVersionId: targetRuleSet.versionId,
        sourceMode: 'acceptance_fixture',
        fixtureId: 'AT-10',
        images: GOLDEN_SAMPLE_IMAGES,
        productContext: GOLDEN_SAMPLE_CONTEXT,
        fields: COMPLIANT_FIXTURE_FIELDS,
        rules: targetRuleSet.rules,
      });
      upsertPersistedAnalysis(newVersionReport);
      setActiveTab('records');

      if (publishedRuleSets.length === 1 && !permissions.canPublishRuleVersion) {
        setStatusNotice(
          `AT-10 Note: Current active rule-set is ${activePublishedRuleSet.versionId}. Switch to "Rule Maintainer / Administrator" and publish a new rule-set version to observe historical record ANL-GS-2026-001 remain locked at LMPC-2011-v1.0.0.`,
        );
      } else {
        setStatusNotice(
          `AT-10 Verified: New analysis ${newVersionReport.analysisId} is stamped ${targetRuleSet.versionId}, while historical record ANL-GS-2026-001 remains locked to ${INITIAL_RULE_SET_VERSION_ID}.`,
        );
      }
    }
  };

  const handleOpenReport = (analysisId: string) => {
    const found = persistedAnalyses.find((r) => r.analysisId === analysisId);
    if (!found || !canAccessRecord(session, found)) return;
    setAnalyzeError(found.processingState === 'FAILED' ? found.errorDetail?.message ?? null : null);
    setActiveReportId(found.analysisId);
    setActiveTab('workbench');
  };

  const handleNewAnalysis = () => {
    if (activeRole === 'VISITOR') {
      handleSelectTab('workbench');
      return;
    }
    setActiveTab('workbench');
    setTimeout(() => {
      uploadTriggerRef.current?.click();
    }, 50);
  };

  const pendingHitlCount = hitlQueue.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-[#F1ECE6] text-[#2E2E2E] flex flex-col">
      <TopNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onNewAnalysis={handleNewAnalysis}
        hitlPendingCount={pendingHitlCount}
        activeRole={activeRole}
        onChangeRole={handleChangeRole}
      />

      {/* Controlled Demo Session Indicator Bar (SRS Section 2.2) */}
      <div className="no-print border-b border-[#DDD5CD] bg-[#DDD5CD]/45">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-[11px] text-[#2E2E2E]/80 sm:px-6 lg:px-8">
          <span>
            Controlled Demo Session Mode (SRS §2.2) · Role:{' '}
            <strong data-testid="active-session-role" className="font-semibold text-[#7D4047]">
              {session.displayName}
            </strong>{' '}
            (<span className="font-mono text-[#2E2E2E]">{session.actorId}</span> · {session.organization})
          </span>
          <span className="font-mono text-[#2E2E2E] font-medium">
            Active Rule-Set: <span className="text-[#7D4047] font-semibold">{activePublishedRuleSet.versionId}</span>
          </span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        {statusNotice && activeRole !== 'VISITOR' && (
          <div
            role="status"
            data-testid="app-status-notice"
            className="rounded-xl border border-[#7D4047]/35 bg-[#7D4047]/10 px-4 py-2.5 text-xs font-medium text-[#2E2E2E]"
          >
            {statusNotice}
          </div>
        )}

        {activeRole === 'VISITOR' ? (
          <VisitorPortalView
            attemptedPrivateRoute={attemptedPrivateRoute}
            onSelectRole={handleChangeRole}
          />
        ) : (
          <>
            {activeTab === 'workbench' && activeReport && (
              <ScannerView
                report={activeReport}
                productContext={activeReport.productContext}
                onChangeContext={handleChangeContext}
                onResetGoldenSample={handleResetGoldenSample}
                onAnalyzeMultiSide={handleAnalyzeMultiSide}
                onValidationFailure={handleValidationFailure}
                onRunAcceptanceFixture={handleRunAcceptanceFixture}
                isAnalyzing={isAnalyzing}
                analyzeError={analyzeError}
                onClearError={() => setAnalyzeError(null)}
                uploadTriggerRef={uploadTriggerRef}
              />
            )}

            {activeTab === 'rules' && (
              <RuleEngineManager
                activeRole={activeRole}
                publishedRuleSets={publishedRuleSets}
                draftRules={draftRules}
                auditEvents={auditEvents}
                onToggleDraftRule={handleToggleDraftRule}
                onUpdateDraftRuleParameters={handleUpdateDraftRuleParameters}
                onPublishNewRuleSetVersion={handlePublishNewRuleSetVersion}
                activePdpAreaCm2={activeReport?.productContext.pdpAreaCm2 ?? 150}
                onChangePdpAreaCm2={(area) => {
                  if (activeReport) {
                    handleChangeContext({ ...activeReport.productContext, pdpAreaCm2: area });
                  }
                }}
              />
            )}

            {activeTab === 'hitl' && (
              <HitlQueueView
                activeRole={activeRole}
                items={hitlQueue}
                onResolveItem={handleResolveHitlItem}
                onOpenAnalysis={handleOpenReport}
              />
            )}

            {activeTab === 'records' && (
              <RecordsAndTestsView
                session={session}
                persistedAnalyses={persistedAnalyses}
                publishedRuleSets={publishedRuleSets}
                activeReportId={activeReport?.analysisId ?? ''}
                onOpenReport={handleOpenReport}
                onRunAcceptanceFixture={handleRunAcceptanceFixture}
              />
            )}

            {activeTab === 'schema' && <CodeExporterView />}
          </>
        )}
      </main>

      <footer className="no-print border-t border-[#DDD5CD] bg-[#FAF7F2]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-[#2E2E2E]/75 sm:px-6 lg:px-8">
          <span className="font-medium text-[#2E2E2E]">LabelSure — From Package Label to Proof</span>
          <span>LMPC Rules 2011 · 2017 &amp; 2022 Amendments · FSSAI Labelling &amp; Display 2020</span>
        </div>
      </footer>
    </div>
  );
}
