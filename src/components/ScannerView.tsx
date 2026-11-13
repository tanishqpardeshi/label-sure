import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  Building2,
  Camera,
  CheckCircle2,
  Download,
  FileWarning,
  Loader2,
  MapPinned,
  Printer,
  RotateCcw,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { SAMPLE_PRESET_IMAGES } from '../data/goldenSample';
import type {
  BarcodeVerificationResult,
  ComplianceStatus,
  FssaiDecodeResult,
  InspectionReport,
  PinCodeVerificationResult,
  ProductContext,
} from '../types/compliance';
import { PackageEvidenceCanvas } from './PackageEvidenceCanvas';
import { ScaleMpeSimulator } from './ScaleMpeSimulator';
import { NutritionScoreCard } from './NutritionScoreCard';

interface ScannerViewProps {
  report: InspectionReport;
  productContext: ProductContext;
  onChangeContext: (ctx: ProductContext) => void;
  measuredWeightGrams: number;
  onChangeMeasuredGrams: (val: number) => void;
  onResetGoldenSample: () => void;
  onAnalyzeImage: (payload: {
    imageBase64?: string;
    mimeType?: string;
    presetImagePath?: string;
    sourceMode: 'upload' | 'camera' | 'sample_preset';
    previewUrl: string;
    declaredWeightHint?: number;
  }) => Promise<void>;
  onApplyBarcodeProduct: (result: BarcodeVerificationResult) => void;
  onVerifiedPinJurisdiction: (district: string, state: string) => void;
  isAnalyzing: boolean;
  analyzeError: string | null;
  onClearError: () => void;
  uploadTriggerRef: React.RefObject<HTMLInputElement | null>;
}

const STATUS_DISPLAY: Record<
  ComplianceStatus,
  { icon: React.ReactNode; label: string; textClass: string; rowTint: string }
> = {
  PASS: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />,
    label: 'PASS',
    textClass: 'text-emerald-800',
    rowTint: 'bg-white',
  },
  FAIL: {
    icon: <XCircle className="h-4 w-4 text-red-700 shrink-0" />,
    label: 'FAIL',
    textClass: 'text-red-800',
    rowTint: 'bg-red-50/40',
  },
  WARNING: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />,
    label: 'WARNING',
    textClass: 'text-amber-800',
    rowTint: 'bg-amber-50/40',
  },
  UNVERIFIED: {
    icon: <FileWarning className="h-4 w-4 text-amber-700 shrink-0" />,
    label: 'UNVERIFIED',
    textClass: 'text-amber-800',
    rowTint: 'bg-amber-50/50',
  },
};

export const ScannerView: React.FC<ScannerViewProps> = ({
  report,
  productContext,
  onChangeContext,
  measuredWeightGrams,
  onChangeMeasuredGrams,
  onResetGoldenSample,
  onAnalyzeImage,
  onApplyBarcodeProduct,
  onVerifiedPinJurisdiction,
  isAnalyzing,
  analyzeError,
  onClearError,
  uploadTriggerRef,
}) => {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    report.checkpoints.find((c) => c.status === 'FAIL')?.fieldId ??
      report.checkpoints[0]?.fieldId ??
      null,
  );
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Live Production API Verification States
  const extractedPinMatch = report.checkpoints
    .find((c) => c.key === 'manufacturer_details')
    ?.normalizedText.match(/\b(\d{6})\b/);
  const extractedFssaiDigits =
    report.checkpoints
      .find((c) => c.key === 'fssai_license')
      ?.normalizedText.replace(/\D/g, '') || '10018021003456';

  const [barcodeInput, setBarcodeInput] = useState<string>(
    productContext.barcode || '8901063092686',
  );
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeVerificationResult | null>(null);

  const [pincodeInput, setPincodeInput] = useState<string>(extractedPinMatch?.[1] || '452001');
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState<string | null>(null);
  const [pincodeResult, setPincodeResult] = useState<PinCodeVerificationResult | null>(null);

  const [fssaiInput, setFssaiInput] = useState<string>(
    extractedFssaiDigits.length === 14 ? extractedFssaiDigits : '21324012000456',
  );
  const [fssaiLoading, setFssaiLoading] = useState(false);
  const [fssaiResult, setFssaiResult] = useState<FssaiDecodeResult | null>(null);

  useEffect(() => {
    if (extractedPinMatch?.[1]) {
      setPincodeInput(extractedPinMatch[1]);
    }
  }, [report.inspectionId]);

  const handleFetchBarcode = async (codeOverride?: string) => {
    const code = (codeOverride ?? barcodeInput).trim();
    if (!code) return;
    setBarcodeInput(code);
    setBarcodeLoading(true);
    setBarcodeError(null);
    try {
      const res = await fetch(`/api/verify/barcode/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Barcode lookup failed');
      const result = data as BarcodeVerificationResult;
      setBarcodeResult(result);
      onApplyBarcodeProduct(result);
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : 'Barcode lookup failed');
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleVerifyPincode = async (pinOverride?: string) => {
    const pin = (pinOverride ?? pincodeInput).trim();
    if (!pin) return;
    setPincodeInput(pin);
    setPincodeLoading(true);
    setPincodeError(null);
    try {
      const res = await fetch(`/api/verify/pincode/${encodeURIComponent(pin)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN verification failed');
      const result = data as PinCodeVerificationResult;
      setPincodeResult(result);
      onVerifiedPinJurisdiction(result.district, result.state);
    } catch (err) {
      setPincodeError(err instanceof Error ? err.message : 'PIN verification failed');
    } finally {
      setPincodeLoading(false);
    }
  };

  const handleVerifyFssai = async (licOverride?: string) => {
    const lic = (licOverride ?? fssaiInput).trim();
    if (!lic) return;
    setFssaiInput(lic);
    setFssaiLoading(true);
    try {
      const res = await fetch('/api/verify/fssai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseNumber: lic }),
      });
      const data = (await res.json()) as FssaiDecodeResult;
      setFssaiResult(data);
    } finally {
      setFssaiLoading(false);
    }
  };

  // Determine declared weight from checkpoints or default 120g
  const weightCheckpoint = report.checkpoints.find((c) => c.key === 'net_quantity');
  const weightMatch = weightCheckpoint?.normalizedText.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  const declaredGrams = weightMatch
    ? parseFloat(weightMatch[1]) *
      (weightMatch[2].toLowerCase() === 'kg' || weightMatch[2].toLowerCase() === 'l' ? 1000 : 1)
    : 120;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      await onAnalyzeImage({
        imageBase64: dataUrl,
        mimeType: file.type || 'image/jpeg',
        sourceMode: 'upload',
        previewUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openCamera = async () => {
    setCameraError(null);
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError(
        'Camera access unavailable in this browser environment. Please upload a package label image or run one of the studio sample packs below.',
      );
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 720;
    canvas.height = videoRef.current.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    closeCamera();
    await onAnalyzeImage({
      imageBase64: dataUrl,
      mimeType: 'image/jpeg',
      sourceMode: 'camera',
      previewUrl: dataUrl,
    });
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labelsure-report-${report.inspectionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const overallColor =
    report.overallStatus === 'PASS'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : report.overallStatus === 'FAIL'
        ? 'border-red-300 bg-red-50 text-red-900'
        : 'border-amber-300 bg-amber-50 text-amber-900';

  return (
    <div className="space-y-6">
      {/* Hidden file input triggered by Upload button or TopNav New Inspection */}
      <input
        ref={uploadTriggerRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload package label image"
      />

      {/* Layer 1: Input & Context Strip */}
      <section
        aria-label="Package input and regulatory context"
        className="no-print rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
              LabelSure — From Package Label to Proof
            </h1>
            <p className="text-xs text-slate-500">
              Multilingual LMPC Rules 2011 &amp; FSSAI 2020 Compliance Verification Workbench
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => uploadTriggerRef.current?.click()}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Package Image
            </button>
            <button
              type="button"
              onClick={openCamera}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5" />
              Live Camera
            </button>
            {report.sourceMode !== 'golden_sample' && (
              <button
                type="button"
                onClick={onResetGoldenSample}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Load Golden Sample
              </button>
            )}
          </div>
        </div>

        {/* Context Selectors & PDP Area Control */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="ctx-brand" className="block text-[11px] font-medium text-slate-600">
              Brand / Manufacturer
            </label>
            <input
              id="ctx-brand"
              type="text"
              value={productContext.brand}
              onChange={(e) => onChangeContext({ ...productContext, brand: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="ctx-category" className="block text-[11px] font-medium text-slate-600">
              Product Category
            </label>
            <select
              id="ctx-category"
              value={productContext.category}
              onChange={(e) =>
                onChangeContext({
                  ...productContext,
                  category: e.target.value as ProductContext['category'],
                })
              }
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            >
              <option value="Packaged Food">Packaged Food</option>
              <option value="Beverages">Beverages</option>
              <option value="Cosmetics">Cosmetics</option>
              <option value="Electronics">Electronics</option>
              <option value="Household">Household</option>
            </select>
          </div>
          <div>
            <label htmlFor="ctx-origin" className="block text-[11px] font-medium text-slate-600">
              Country of Origin
            </label>
            <input
              id="ctx-origin"
              type="text"
              value={productContext.countryOfOrigin}
              onChange={(e) =>
                onChangeContext({ ...productContext, countryOfOrigin: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="ctx-state" className="block text-[11px] font-medium text-slate-600">
              Regulatory Jurisdiction
            </label>
            <select
              id="ctx-state"
              value={productContext.stateJurisdiction}
              onChange={(e) =>
                onChangeContext({ ...productContext, stateJurisdiction: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            >
              <option value="Madhya Pradesh (Central LMPC 2011 + FSSAI 2020)">
                Madhya Pradesh (LMPC + FSSAI)
              </option>
              <option value="Maharashtra (Central LMPC 2011 + FSSAI 2020)">
                Maharashtra (LMPC + FSSAI)
              </option>
              <option value="Delhi NCR (Central LMPC 2011 + FSSAI 2020)">
                Delhi NCR (LMPC + FSSAI)
              </option>
              <option value="Karnataka (Central LMPC 2011 + FSSAI 2020)">
                Karnataka (LMPC + FSSAI)
              </option>
              <option value="Gujarat (Central LMPC 2011 + FSSAI 2020)">
                Gujarat (LMPC + FSSAI)
              </option>
            </select>
          </div>
          <div>
            <label htmlFor="ctx-pdp-area" className="block text-[11px] font-medium text-slate-600">
              PDP Area (cm²) · Min {report.requiredFontHeightMm.toFixed(1)}mm
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                id="ctx-pdp-area"
                type="number"
                min="10"
                max="2000"
                value={productContext.pdpAreaCm2 ?? 150}
                onChange={(e) =>
                  onChangeContext({
                    ...productContext,
                    pdpAreaCm2: Math.max(10, Number(e.target.value) || 150),
                  })
                }
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* One-Click Live Gemini Vision Sample Packs */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">
              Test live AI extraction on studio samples:
            </span>
            {SAMPLE_PRESET_IMAGES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                disabled={isAnalyzing}
                onClick={() => {
                  onChangeContext(sample.context);
                  onAnalyzeImage({
                    presetImagePath: sample.imageUrl,
                    sourceMode: 'sample_preset',
                    previewUrl: sample.imageUrl,
                    declaredWeightHint: sample.declaredWeightGrams,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3 text-blue-800" />
                {sample.title}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span>PDP Presets:</span>
            {[
              { label: '40 cm² (1mm)', value: 40 },
              { label: '150 cm² (2mm)', value: 150 },
              { label: '350 cm² (4mm)', value: 350 },
              { label: '600 cm² (6mm)', value: 600 },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onChangeContext({ ...productContext, pdpAreaCm2: p.value })}
                className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                  (productContext.pdpAreaCm2 ?? 150) === p.value
                    ? 'border-blue-800 bg-blue-50 font-semibold text-blue-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live Production API Verification Panel (Open Food Facts India, India Post PIN, FSSAI FoSCoS) */}
      <section
        aria-labelledby="live-api-verification-heading"
        className="no-print rounded-lg border border-slate-200 bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2
              id="live-api-verification-heading"
              className="font-display text-sm font-semibold text-slate-900"
            >
              Live Production API Verification
            </h2>
            <p className="text-xs text-slate-500">
              Cross-verify EAN-13 barcodes via Open Food Facts India, manufacturer PIN codes via
              India Post, and 14-digit FSSAI FoSCoS structure
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {/* 1. Open Food Facts India Barcode Lookup */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Barcode className="h-4 w-4 text-blue-900" />
              <span>Barcode / EAN-13 Lookup</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="EAN-13 Barcode"
                placeholder="e.g. 8901063092686"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
              />
              <button
                type="button"
                disabled={barcodeLoading}
                onClick={() => handleFetchBarcode()}
                className="rounded-md bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {barcodeLoading ? 'Fetching...' : 'Fetch Live Product Data'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {['8901063092686', '8901491101837', '8901058851298'].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleFetchBarcode(code)}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-700 hover:bg-slate-100"
                >
                  {code}
                </button>
              ))}
            </div>
            {barcodeError && <p className="text-xs text-red-700">{barcodeError}</p>}
            {barcodeResult && (
              <div
                data-testid="barcode-verify-result"
                className="rounded border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs text-slate-800 space-y-0.5"
              >
                <p className="font-semibold text-emerald-900">
                  {barcodeResult.productName} · {barcodeResult.brand}
                </p>
                <p className="font-mono text-[11px] text-slate-600">
                  {barcodeResult.netQuantity} · Source:{' '}
                  {barcodeResult.source === 'openfoodfacts_live'
                    ? 'Open Food Facts Live'
                    : 'Indian SKU Catalog'}
                </p>
              </div>
            )}
          </div>

          {/* 2. India Post PIN Code & Jurisdiction Verification */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <MapPinned className="h-4 w-4 text-blue-900" />
              <span>India Post PIN Code &amp; Jurisdiction</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                aria-label="Manufacturer 6-digit PIN Code"
                placeholder="e.g. 452001"
                value={pincodeInput}
                onChange={(e) => setPincodeInput(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
              />
              <button
                type="button"
                disabled={pincodeLoading}
                onClick={() => handleVerifyPincode()}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {pincodeLoading ? 'Checking...' : 'Verify PIN Code'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {[
                { pin: '452001', label: '452001 Indore' },
                { pin: '400001', label: '400001 Mumbai' },
                { pin: '110001', label: '110001 Delhi' },
                { pin: '560001', label: '560001 Bengaluru' },
              ].map((p) => (
                <button
                  key={p.pin}
                  type="button"
                  onClick={() => handleVerifyPincode(p.pin)}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-700 hover:bg-slate-100"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {pincodeError && <p className="text-xs text-red-700">{pincodeError}</p>}
            {pincodeResult && (
              <div
                data-testid="pincode-verify-result"
                className="rounded border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs text-slate-800 space-y-0.5"
              >
                <p className="font-semibold text-emerald-900">
                  {pincodeResult.postOffice} · {pincodeResult.district}, {pincodeResult.state}
                </p>
                <p className="text-[11px] text-slate-600">
                  {pincodeResult.message} Jurisdiction auto-tagged on Regional Heatmap.
                </p>
              </div>
            )}
          </div>

          {/* 3. FSSAI FoSCoS 14-Digit License & State Prefix Validator */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Building2 className="h-4 w-4 text-blue-900" />
              <span>FSSAI FoSCoS 14-Digit Validator</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={14}
                aria-label="14-digit FSSAI License Number"
                placeholder="14-digit FSSAI number"
                value={fssaiInput}
                onChange={(e) => setFssaiInput(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
              />
              <button
                type="button"
                disabled={fssaiLoading}
                onClick={() => handleVerifyFssai()}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {fssaiLoading ? 'Validating...' : 'Validate FoSCoS'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {[
                { lic: '21324012000456', label: '213... (MP State)' },
                { lic: '11122011000999', label: '111... (MH Central)' },
                { lic: '10018021003456', label: '100... (Central)' },
              ].map((sample) => (
                <button
                  key={sample.lic}
                  type="button"
                  onClick={() => handleVerifyFssai(sample.lic)}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-700 hover:bg-slate-100"
                >
                  {sample.label}
                </button>
              ))}
            </div>
            {fssaiResult && (
              <div
                data-testid="fssai-verify-result"
                className={`rounded border p-2.5 text-xs space-y-0.5 ${
                  fssaiResult.valid
                    ? 'border-emerald-200 bg-emerald-50/60 text-slate-800'
                    : 'border-red-200 bg-red-50/60 text-red-900'
                }`}
              >
                <p className="font-semibold">
                  {fssaiResult.licenseType} · State Code {fssaiResult.stateCode} (
                  {fssaiResult.stateName})
                </p>
                <p className="text-[11px] opacity-85">{fssaiResult.rationale}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Camera Modal */}
      {cameraOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live camera capture"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Field Inspection Camera Capture
              </h2>
              <button
                type="button"
                onClick={closeCamera}
                aria-label="Close camera modal"
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3">
              {cameraError ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  {cameraError}
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="aspect-[4/3] w-full rounded bg-slate-950 object-cover"
                />
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              {!cameraError && (
                <button
                  type="button"
                  onClick={captureFromCamera}
                  className="rounded-md bg-blue-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  Capture &amp; Analyze
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analysis Loading / Error Banners */}
      {isAnalyzing && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
          <Loader2 className="h-4 w-4 animate-spin text-blue-800 shrink-0" />
          <span>
            Running spatial zone segmentation, multilingual OCR extraction, glare normalization, and
            LMPC/FSSAI rule evaluation...
          </span>
        </div>
      )}

      {analyzeError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
          <span>{analyzeError}</span>
          <button
            type="button"
            onClick={onClearError}
            aria-label="Dismiss error"
            className="rounded p-1 text-red-700 hover:bg-red-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Overall Report Verdict Summary Strip */}
      <section
        aria-label="Compliance verdict summary"
        className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3 ${overallColor}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-[11px] font-medium opacity-80">Overall Report Status</span>
            <p
              data-testid="overall-report-status"
              className="font-display text-base font-bold tracking-tight"
            >
              {report.overallStatus}
            </p>
          </div>
          <div className="h-8 w-px bg-current opacity-20 hidden sm:block" />
          <div className="text-xs space-x-2 tabular-nums">
            <span className="font-semibold">{report.summaryCounts.pass} Pass</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold">{report.summaryCounts.fail} Fail</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold">{report.summaryCounts.unverified} Unverified</span>
            {report.summaryCounts.warning > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold">{report.summaryCounts.warning} Warning</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Avg Confidence {(report.overallConfidence * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="no-print flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Download JSON
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Printer className="h-3.5 w-3.5" />
            Printable Report
          </button>
        </div>
      </section>

      {/* Main 2-Column Inspection Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Visual Evidence Canvas + IoT Scale + Nutrition */}
        <div className="space-y-6 lg:col-span-6">
          <PackageEvidenceCanvas
            sourceMode={report.sourceMode}
            imageUrl={report.imageUrl}
            checkpoints={report.checkpoints}
            selectedFieldId={selectedFieldId}
            onSelectField={setSelectedFieldId}
          />

          <ScaleMpeSimulator
            declaredGrams={declaredGrams}
            measuredGrams={measuredWeightGrams}
            onChangeMeasuredGrams={onChangeMeasuredGrams}
          />

          <NutritionScoreCard nutrition={report.nutrition} />
        </div>

        {/* Right Column: Explainable Rule & Checkpoint Ledger */}
        <section
          aria-labelledby="checkpoint-ledger-heading"
          className="rounded-lg border border-slate-200 bg-white lg:col-span-6"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2
                id="checkpoint-ledger-heading"
                className="font-display text-sm font-semibold text-slate-900"
              >
                Explainable Compliance Checkpoints
              </h2>
              <p className="text-xs text-slate-500">
                Inspection ID: <span className="font-mono">{report.inspectionId}</span> · Threshold:
                85% HITL gate
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {report.checkpoints.length} fields
            </span>
          </div>

          <div className="divide-y divide-slate-200">
            {report.checkpoints.map((cp) => {
              const display = STATUS_DISPLAY[cp.status];
              const isSelected = selectedFieldId === cp.fieldId;
              return (
                <div
                  key={cp.fieldId}
                  data-testid={`checkpoint-${cp.key}`}
                  onClick={() => setSelectedFieldId(cp.fieldId)}
                  className={`cursor-pointer p-4 transition-colors ${display.rowTint} ${
                    isSelected ? 'ring-2 ring-inset ring-blue-700/70' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {display.icon}
                        <h3 className="font-display text-sm font-semibold text-slate-900">
                          {cp.label}
                        </h3>
                        <span className={`font-mono text-xs font-bold ${display.textClass}`}>
                          {display.label}
                        </span>
                      </div>

                      {/* Unboxed metadata row per zero-pill discipline */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-mono text-[11px]">{cp.region}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Confidence {(cp.confidence * 100).toFixed(0)}%
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Font {cp.fontHeightMm.toFixed(1)}mm
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{cp.regulationCitation}</span>
                      </div>
                    </div>
                  </div>

                  {/* Extracted OCR Value */}
                  <div className="mt-2.5 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 break-words">
                    {cp.normalizedText}
                  </div>

                  {/* Foil-Glare Normalization Trace */}
                  {cp.glareNormalized && (
                    <p className="mt-1.5 text-xs text-blue-800">
                      Glare Normalization Applied: Raw foil read{' '}
                      <span className="font-mono font-medium">{cp.glareRawSample}</span> corrected
                      deterministically.
                    </p>
                  )}

                  {/* Explainable Rationale */}
                  <p className="mt-2 text-xs leading-relaxed text-slate-700">
                    <span className="font-semibold text-slate-900">Rationale:</span> {cp.rationale}
                  </p>

                  {/* Actionable Corrective Suggestion */}
                  {cp.correctiveAction && (
                    <p className="mt-1.5 text-xs leading-relaxed text-red-900">
                      <span className="font-semibold">Corrective Action:</span>{' '}
                      {cp.correctiveAction}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
