import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_COMPLIANCE_RULES,
  GOLDEN_SAMPLE_CONTEXT,
  GOLDEN_SAMPLE_FIELDS,
  GOLDEN_SAMPLE_NUTRITION,
  INITIAL_HITL_QUEUE,
} from './data/goldenSample';
import { evaluatePackageCompliance, parseWeightToGrams } from './lib/complianceEngine';
import type {
  BarcodeVerificationResult,
  ComplianceRule,
  ExtractedField,
  HitlReviewItem,
  InspectionReport,
  NutritionProfile,
  ProductContext,
} from './types/compliance';
import { TopNav, type AppTab } from './components/TopNav';
import { ScannerView } from './components/ScannerView';
import { RuleEngineManager } from './components/RuleEngineManager';
import { HitlQueueView } from './components/HitlQueueView';
import { AnalyticsApiView } from './components/AnalyticsApiView';
import { CodeExporterView } from './components/CodeExporterView';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('scanner');
  const [rules, setRules] = useState<ComplianceRule[]>(DEFAULT_COMPLIANCE_RULES);
  const [productContext, setProductContext] = useState<ProductContext>(GOLDEN_SAMPLE_CONTEXT);
  const [measuredWeightGrams, setMeasuredWeightGrams] = useState<number>(120);
  const [verifiedJurisdictionCity, setVerifiedJurisdictionCity] = useState<string | null>(null);

  // Active scan source state (defaults to Golden Sample Demo out of the box)
  const [activeScan, setActiveScan] = useState<{
    inspectionId: string;
    sourceMode: InspectionReport['sourceMode'];
    imageUrl?: string;
    fields: ExtractedField[];
    nutritionProfile?: NutritionProfile;
  }>({
    inspectionId: 'INSP-GS-2025-001',
    sourceMode: 'golden_sample',
    fields: GOLDEN_SAMPLE_FIELDS,
    nutritionProfile: GOLDEN_SAMPLE_NUTRITION,
  });

  const [hitlQueue, setHitlQueue] = useState<HitlReviewItem[]>(INITIAL_HITL_QUEUE);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const uploadTriggerRef = useRef<HTMLInputElement | null>(null);

  // Deterministically evaluate active scan whenever rules, fields, PDP area, or scale weight change
  const report = useMemo(() => {
    return evaluatePackageCompliance({
      inspectionId: activeScan.inspectionId,
      sourceMode: activeScan.sourceMode,
      imageUrl: activeScan.imageUrl,
      productContext,
      fields: activeScan.fields,
      rules,
      nutritionProfile: activeScan.nutritionProfile,
      measuredWeightGrams,
    });
  }, [activeScan, productContext, rules, measuredWeightGrams]);

  const handleToggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.ruleId === ruleId ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const handleUpdateRuleParameters = (
    ruleId: string,
    paramsJson: Record<string, string | number | boolean | string[]>,
  ) => {
    setRules((prev) =>
      prev.map((r) => (r.ruleId === ruleId ? { ...r, parameters: paramsJson } : r)),
    );
  };

  const handleResetGoldenSample = () => {
    setProductContext(GOLDEN_SAMPLE_CONTEXT);
    setMeasuredWeightGrams(120);
    setAnalyzeError(null);
    setActiveScan({
      inspectionId: 'INSP-GS-2025-001',
      sourceMode: 'golden_sample',
      fields: GOLDEN_SAMPLE_FIELDS,
      nutritionProfile: GOLDEN_SAMPLE_NUTRITION,
    });
  };

  const handleApplyBarcodeProduct = (result: BarcodeVerificationResult) => {
    setProductContext((prev) => ({
      ...prev,
      brand: result.brand || prev.brand,
      barcode: result.barcode,
    }));

    const parsedWeight = parseWeightToGrams(result.netQuantity);
    if (parsedWeight.valueGrams) {
      setMeasuredWeightGrams(parsedWeight.valueGrams);
    }

    setActiveScan((prev) => ({
      ...prev,
      inspectionId: `INSP-EAN-${result.barcode.slice(-6)}`,
      nutritionProfile: result.nutritionProfile ?? prev.nutritionProfile,
      fields: prev.fields.map((f) => {
        if (f.key === 'product_name') {
          return {
            ...f,
            rawText: result.productName.toUpperCase(),
            normalizedText: result.productName.toUpperCase(),
          };
        }
        if (f.key === 'net_quantity' && result.netQuantity) {
          return {
            ...f,
            rawText: result.netQuantity,
            normalizedText: result.netQuantity,
          };
        }
        if (f.key === 'ingredients_declaration' && result.ingredientsText) {
          const formattedIngredients = /^INGREDIENTS?\s*[:\-]/i.test(result.ingredientsText)
            ? result.ingredientsText
            : `INGREDIENTS: ${result.ingredientsText}`;
          return {
            ...f,
            rawText: formattedIngredients,
            normalizedText: formattedIngredients,
          };
        }
        return f;
      }),
    }));
  };

  const handleVerifiedPinJurisdiction = (district: string, state: string) => {
    setVerifiedJurisdictionCity(district);
    const stateOptions = [
      'Madhya Pradesh (Central LMPC 2011 + FSSAI 2020)',
      'Maharashtra (Central LMPC 2011 + FSSAI 2020)',
      'Delhi NCR (Central LMPC 2011 + FSSAI 2020)',
      'Karnataka (Central LMPC 2011 + FSSAI 2020)',
      'Gujarat (Central LMPC 2011 + FSSAI 2020)',
    ];
    const matched = stateOptions.find((opt) =>
      opt.toLowerCase().includes(state.toLowerCase().split(' ')[0]),
    );
    if (matched) {
      setProductContext((prev) => ({ ...prev, stateJurisdiction: matched }));
    }
  };

  const handleAnalyzeImage = async (payload: {
    imageBase64?: string;
    mimeType?: string;
    presetImagePath?: string;
    sourceMode: 'upload' | 'camera' | 'sample_preset';
    previewUrl: string;
    declaredWeightHint?: number;
  }) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const response = await fetch('/api/analyze-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: payload.imageBase64,
          mimeType: payload.mimeType,
          presetImagePath: payload.presetImagePath,
          sourceMode: payload.sourceMode,
          productContext,
          rules,
          measuredWeightGrams: payload.declaredWeightHint ?? measuredWeightGrams,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.report) {
        throw new Error(data.error || 'Failed to analyze package label image');
      }

      const apiReport = data.report as InspectionReport;
      const convertedFields: ExtractedField[] = apiReport.checkpoints.map((cp) => ({
        id: cp.fieldId,
        key: cp.key,
        label: cp.label,
        rawText: cp.rawText,
        normalizedText: cp.normalizedText,
        region: cp.region,
        confidence: cp.confidence,
        fontHeightMm: cp.fontHeightMm,
        bbox: cp.bbox,
        glareNormalized: cp.glareNormalized,
        glareRawSample: cp.glareRawSample,
      }));

      if (payload.declaredWeightHint) {
        setMeasuredWeightGrams(payload.declaredWeightHint);
      }

      setActiveScan({
        inspectionId: apiReport.inspectionId,
        sourceMode: payload.sourceMode,
        imageUrl: payload.previewUrl,
        fields: convertedFields,
        nutritionProfile: apiReport.nutrition?.profile,
      });

      const lowConfItems: HitlReviewItem[] = apiReport.checkpoints
        .filter((cp) => cp.status === 'UNVERIFIED')
        .map((cp) => ({
          id: `HITL-${Date.now().toString().slice(-4)}-${cp.key.slice(0, 3).toUpperCase()}`,
          inspectionId: apiReport.inspectionId,
          productName:
            apiReport.checkpoints.find((c) => c.key === 'product_name')?.normalizedText ||
            productContext.brand,
          fieldKey: cp.key,
          fieldLabel: cp.label,
          region: cp.region,
          rawOcrText: cp.rawText,
          suggestedText: cp.normalizedText,
          confidence: cp.confidence,
          issueType: 'Low Print Contrast',
          status: 'PENDING',
          capturedAt: apiReport.timestamp,
          bbox: cp.bbox,
        }));

      if (lowConfItems.length > 0) {
        setHitlQueue((prev) => [...lowConfItems, ...prev]);
      }
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : 'Unexpected error while analyzing label image',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResolveHitlItem = (
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    correctedText: string,
    note: string,
  ) => {
    setHitlQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: decision,
              suggestedText: correctedText,
              inspectorNote: note,
            }
          : item,
      ),
    );

    const targetItem = hitlQueue.find((i) => i.id === id);
    if (targetItem && targetItem.inspectionId === activeScan.inspectionId) {
      setActiveScan((prev) => ({
        ...prev,
        fields: prev.fields.map((f) =>
          f.key === targetItem.fieldKey
            ? {
                ...f,
                normalizedText: correctedText,
                confidence: decision === 'APPROVED' ? 0.99 : f.confidence,
              }
            : f,
        ),
      }));
    }
  };

  const handleNewInspection = () => {
    setActiveTab('scanner');
    setTimeout(() => {
      uploadTriggerRef.current?.click();
    }, 50);
  };

  const pendingHitlCount = hitlQueue.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onNewInspection={handleNewInspection}
        hitlPendingCount={pendingHitlCount}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === 'scanner' && (
          <ScannerView
            report={report}
            productContext={productContext}
            onChangeContext={setProductContext}
            measuredWeightGrams={measuredWeightGrams}
            onChangeMeasuredGrams={setMeasuredWeightGrams}
            onResetGoldenSample={handleResetGoldenSample}
            onAnalyzeImage={handleAnalyzeImage}
            onApplyBarcodeProduct={handleApplyBarcodeProduct}
            onVerifiedPinJurisdiction={handleVerifiedPinJurisdiction}
            isAnalyzing={isAnalyzing}
            analyzeError={analyzeError}
            onClearError={() => setAnalyzeError(null)}
            uploadTriggerRef={uploadTriggerRef}
          />
        )}

        {activeTab === 'rules' && (
          <RuleEngineManager
            rules={rules}
            onToggleRule={handleToggleRule}
            onUpdateRuleParameters={handleUpdateRuleParameters}
            activePdpAreaCm2={productContext.pdpAreaCm2 ?? 150}
            onChangePdpAreaCm2={(area) =>
              setProductContext((prev) => ({ ...prev, pdpAreaCm2: area }))
            }
          />
        )}

        {activeTab === 'hitl' && (
          <HitlQueueView items={hitlQueue} onResolveItem={handleResolveHitlItem} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsApiView
            rules={rules}
            verifiedJurisdictionCity={verifiedJurisdictionCity}
          />
        )}

        {activeTab === 'code' && <CodeExporterView />}
      </main>

      <footer className="no-print border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          <span>LabelSure — From Package Label to Proof</span>
          <span>LMPC Rules 2011 · 2017 &amp; 2022 Amendments · FSSAI Labelling &amp; Display 2020</span>
        </div>
      </footer>
    </div>
  );
}
