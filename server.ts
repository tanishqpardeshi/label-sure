import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import {
  buildFailedAnalysisReport,
  evaluatePackageCompliance,
  extractDatesFromText,
  normalizeGlareDateText,
} from './src/lib/complianceEngine';
import {
  decodeBase64ToBytes,
  validateImageBuffer,
} from './src/lib/inputValidation';
import { canAccessRecord, DEMO_SESSIONS, getRolePermissions } from './src/lib/rbac';
import {
  DEFAULT_COMPLIANCE_RULES,
  INITIAL_AUDIT_EVENTS,
  INITIAL_PUBLISHED_RULE_SET,
} from './src/data/goldenSample';
import type {
  AnalysisImage,
  AuditEvent,
  ComplianceRule,
  ExtractionStatus,
  ExtractedField,
  FieldKey,
  InspectionReport,
  PackageSideLabel,
  ProductContext,
  RuleSetVersion,
  SpatialRegion,
  UserRole,
} from './src/types/compliance';

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '35mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory MVP persistence store (synced alongside browser localStorage per FR-018)
const persistedAnalyses = new Map<string, InspectionReport>();
const publishedRuleSets: RuleSetVersion[] = [INITIAL_PUBLISHED_RULE_SET];
const auditLogStore: AuditEvent[] = [...INITIAL_AUDIT_EVENTS];

const VALID_REGIONS: SpatialRegion[] = [
  'PRODUCT_HEADER',
  'STATUTORY_PANEL',
  'DATE_BOX',
  'MANUFACTURER_BOX',
  'INGREDIENTS_BOX',
];

const VALID_KEYS: FieldKey[] = [
  'product_name',
  'net_quantity',
  'mrp_usp',
  'mfd_use_by',
  'batch_number',
  'fssai_license',
  'manufacturer_details',
  'ingredients_declaration',
];

const FIELD_LABELS: Record<FieldKey, string> = {
  product_name: 'Product Name',
  net_quantity: 'Net Quantity',
  mrp_usp: 'MRP & USP',
  mfd_use_by: 'MFD & Use By Date',
  batch_number: 'Batch Number',
  fssai_license: 'FSSAI License Number',
  manufacturer_details: 'Manufacturer Details',
  ingredients_declaration: 'Ingredients Declaration',
};

function resolveRequestRole(req: express.Request): { role: UserRole; actorId: string } {
  const rawRole = String(req.header('x-demo-role') || 'MANUFACTURER').toUpperCase();
  const validRole: UserRole =
    rawRole === 'INSPECTOR' || rawRole === 'MAINTAINER' || rawRole === 'VISITOR'
      ? rawRole
      : 'MANUFACTURER';
  const session = DEMO_SESSIONS[validRole];
  return { role: session.role, actorId: session.actorId };
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'LabelSure Screening Verification API',
    activeRuleSetVersion: publishedRuleSets[0]?.versionId ?? 'LMPC-2011-v1.0.0',
  });
});

app.get('/api/analyses', (req, res) => {
  const { role, actorId } = resolveRequestRole(req);
  if (role === 'VISITOR') {
    res.status(403).json({
      errorCode: 'ERR-08',
      error: 'ERR-08: Unauthenticated visitors cannot access private analyses or reports (AUTH-01).',
    });
    return;
  }

  const session = DEMO_SESSIONS[role];
  const authorized = [...persistedAnalyses.values()]
    .filter((item) => canAccessRecord({ ...session, actorId }, item))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  res.json({ analyses: authorized });
});

app.post('/api/analyses', (req, res) => {
  const { role } = resolveRequestRole(req);
  const perms = getRolePermissions(role);
  if (!perms.canRunAnalysis) {
    res.status(403).json({
      errorCode: 'ERR-08',
      error: 'ERR-08: Authentication required to store analysis records.',
    });
    return;
  }

  const { report } = req.body as { report?: InspectionReport };
  if (!report || !report.analysisId) {
    res.status(400).json({ error: 'Invalid analysis report payload.' });
    return;
  }

  persistedAnalyses.set(report.analysisId, report);
  res.json({ saved: true, analysisId: report.analysisId });
});

app.get('/api/rules/versions', (_req, res) => {
  res.json({
    activeVersionId: publishedRuleSets[0]?.versionId,
    versions: publishedRuleSets,
    auditEvents: auditLogStore,
  });
});

app.post('/api/rules/publish', (req, res) => {
  const { role, actorId } = resolveRequestRole(req);
  const perms = getRolePermissions(role);
  if (!perms.canPublishRuleVersion) {
    auditLogStore.unshift({
      eventId: `AUD-${Date.now()}`,
      actorId,
      actorRole: role,
      action: 'ACCESS_DENIED',
      target: 'RULE_SET_PUBLISH',
      timestamp: new Date().toISOString(),
      outcome: 'DENIED',
      details: `Role ${role} attempted to publish rule-set version without MAINTAINER privileges (ERR-08).`,
    });
    res.status(403).json({
      errorCode: 'ERR-08',
      error: 'ERR-08: Only Rule Maintainer / Administrator can publish rule-set versions.',
    });
    return;
  }

  const { versionId, releaseNotes, rules } = req.body as {
    versionId: string;
    releaseNotes?: string;
    rules: ComplianceRule[];
  };
  if (!versionId || !Array.isArray(rules)) {
    res.status(400).json({ error: 'versionId and rules[] are required.' });
    return;
  }

  const publishedSnapshot: RuleSetVersion = {
    versionId,
    publishedAt: new Date().toISOString(),
    publishedBy: actorId,
    releaseNotes: releaseNotes || `Published rule-set ${versionId}`,
    rules: rules.map((r) => ({ ...r, status: 'PUBLISHED' as const })),
  };

  publishedRuleSets.unshift(publishedSnapshot);
  auditLogStore.unshift({
    eventId: `AUD-${Date.now()}`,
    actorId,
    actorRole: role,
    action: 'RULE_SET_PUBLISHED',
    target: versionId,
    timestamp: publishedSnapshot.publishedAt,
    outcome: 'SUCCESS',
    details: publishedSnapshot.releaseNotes,
  });

  res.json({ ruleSetVersion: publishedSnapshot });
});

interface IncomingSidePayload {
  imageId?: string;
  fileName?: string;
  mimeType?: string;
  sideLabel?: PackageSideLabel;
  imageBase64?: string;
  presetImagePath?: string;
}

app.post('/api/analyze-label', async (req, res) => {
  const { role, actorId } = resolveRequestRole(req);
  const perms = getRolePermissions(role);

  if (!perms.canRunAnalysis) {
    res.status(403).json({
      errorCode: 'ERR-08',
      error: 'ERR-08: Unauthenticated visitors cannot submit analyses.',
    });
    return;
  }

  const body = req.body as {
    analysisId?: string;
    images?: IncomingSidePayload[];
    productContext: ProductContext;
    rules?: ComplianceRule[];
    ruleSetVersionId?: string;
    sourceMode?: 'upload' | 'sample_preset';
  };

  const analysisId =
    body.analysisId || `ANL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const productContext = body.productContext || {
    brand: 'Unknown',
    category: 'Packaged Food',
    countryOfOrigin: 'India',
    stateJurisdiction: 'Central LMPC 2011 + FSSAI 2020',
    pdpAreaCm2: 150,
  };
  const ruleSetVersionId =
    body.ruleSetVersionId || publishedRuleSets[0]?.versionId || 'LMPC-2011-v1.0.0';
  const activeRules =
    body.rules && body.rules.length > 0 ? body.rules : DEFAULT_COMPLIANCE_RULES;

  try {
    const rawInputs = Array.isArray(body.images) ? body.images : [];
    if (rawInputs.length === 0) {
      const failed = buildFailedAnalysisReport({
        analysisId,
        ownerId: actorId,
        ownerRole: role,
        ruleSetVersionId,
        sourceMode: body.sourceMode ?? 'upload',
        productContext,
        images: [],
        errorDetail: {
          code: 'ERR-01',
          stage: 'INTAKE',
          message: 'ERR-01: No package side images were supplied for analysis.',
          guidance: 'Upload at least one valid JPG, PNG, or WEBP package side image (max 10 MB).',
        },
      });
      res.status(400).json({ error: failed.errorDetail?.message, report: failed });
      return;
    }

    const validatedSides: Array<{
      meta: AnalysisImage;
      cleanBase64: string;
    }> = [];

    for (let idx = 0; idx < rawInputs.length; idx++) {
      const side = rawInputs[idx];
      let resolvedBase64 = side.imageBase64;
      let resolvedMime = side.mimeType || 'image/jpeg';
      let resolvedFileName = side.fileName || `package_side_${idx + 1}.jpg`;
      let previewUrl = '';

      if (!resolvedBase64 && side.presetImagePath) {
        const safeBasename = path.basename(side.presetImagePath);
        const allowedDir = path.resolve(process.cwd(), 'src/assets/images');
        const fullPath = path.join(allowedDir, safeBasename);
        const buf = await fs.readFile(fullPath);
        resolvedBase64 = buf.toString('base64');
        resolvedMime = safeBasename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        resolvedFileName = safeBasename;
        previewUrl = `/src/assets/images/${safeBasename}`;
      }

      if (!resolvedBase64) {
        const failed = buildFailedAnalysisReport({
          analysisId,
          ownerId: actorId,
          ownerRole: role,
          ruleSetVersionId,
          sourceMode: body.sourceMode ?? 'upload',
          productContext,
          images: [],
          errorDetail: {
            code: 'ERR-01',
            stage: 'INTAKE',
            message: `ERR-01: Side image "${resolvedFileName}" contained an empty payload.`,
            guidance: 'Re-select a valid JPG, PNG, or WEBP package image (max 10 MB).',
          },
        });
        res.status(400).json({ error: failed.errorDetail?.message, report: failed });
        return;
      }

      const cleanBase64 = resolvedBase64.replace(/^data:[^;]+;base64,/, '');
      const bytes = decodeBase64ToBytes(cleanBase64);
      const validation = validateImageBuffer({
        fileName: resolvedFileName,
        mimeType: resolvedMime,
        bytes,
      });

      if (!validation.valid) {
        const failed = buildFailedAnalysisReport({
          analysisId,
          ownerId: actorId,
          ownerRole: role,
          ruleSetVersionId,
          sourceMode: body.sourceMode ?? 'upload',
          productContext,
          images: [],
          errorDetail: {
            code: 'ERR-01',
            stage: 'INTAKE',
            message: validation.errorMessage || 'ERR-01: Invalid or corrupt image upload.',
            guidance:
              validation.guidance || 'Upload a valid JPG, PNG, or WEBP image under 10 MB.',
          },
        });
        res.status(400).json({ error: failed.errorDetail?.message, report: failed });
        return;
      }

      validatedSides.push({
        cleanBase64,
        meta: {
          imageId: side.imageId || `img-${idx + 1}`,
          fileName: resolvedFileName,
          mimeType: resolvedMime,
          sizeBytes: bytes.length,
          sideLabel: side.sideLabel || (idx === 0 ? 'FRONT_PDP' : 'BACK_STATUTORY'),
          previewUrl: previewUrl || `data:${resolvedMime};base64,${cleanBase64}`,
        },
      });
    }

    const ai = getGeminiClient();

    const sideInventory = validatedSides
      .map((s, idx) => `Image ${idx}: sideLabel=${s.meta.sideLabel}, fileName=${s.meta.fileName}`)
      .join('\n');

    const prompt = `Analyze these ${validatedSides.length} packaged commodity image(s) for Indian Legal Metrology (LMPC Rules 2011) and FSSAI Labelling & Display screening.
Product context: Brand=${productContext.brand}, Category=${productContext.category}, Country=${productContext.countryOfOrigin}.
Uploaded package sides:
${sideInventory}

Extract ONLY the fields actually visible on the uploaded image(s). NEVER invent or guess missing declarations.
Map each extracted field to:
- key: product_name | net_quantity | mrp_usp | mfd_use_by | batch_number | fssai_license | manufacturer_details | ingredients_declaration
- imageIndex: 0-based index of the image where the field appears
- region: PRODUCT_HEADER | STATUTORY_PANEL | DATE_BOX | MANUFACTURER_BOX | INGREDIENTS_BOX
- rawText: exact OCR text observed (preserve foil glare characters and Devanagari/Indic script)
- confidence: 0.0 to 1.0 realistic OCR legibility score (< 0.85 if blurry, occluded, or glare-damaged)
- fontHeightMm: estimated printed numeral/font height in mm
- y_min, x_min, y_max, x_max: normalized 0..1000 bounding box coordinates on that image.`;

    const parts = [
      ...validatedSides.map((s) => ({
        inlineData: {
          mimeType: s.meta.mimeType,
          data: s.cleanBase64,
        },
      })),
      { text: prompt },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are a precision OCR and structured label extraction engine. Extract exact visible text and 0-1000 bounding boxes per image side. Never hallucinate or fabricate missing fields.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fields: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  imageIndex: { type: Type.INTEGER },
                  rawText: { type: Type.STRING },
                  region: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  fontHeightMm: { type: Type.NUMBER },
                  y_min: { type: Type.INTEGER },
                  x_min: { type: Type.INTEGER },
                  y_max: { type: Type.INTEGER },
                  x_max: { type: Type.INTEGER },
                },
                required: [
                  'key',
                  'imageIndex',
                  'rawText',
                  'region',
                  'confidence',
                  'y_min',
                  'x_min',
                  'y_max',
                  'x_max',
                ],
              },
            },
          },
          required: ['fields'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      fields?: Array<{
        key: string;
        imageIndex?: number;
        rawText: string;
        region: string;
        confidence: number;
        fontHeightMm?: number;
        y_min: number;
        x_min: number;
        y_max: number;
        x_max: number;
      }>;
    };

    const extractedFields: ExtractedField[] = (parsed.fields || [])
      .filter((f) => VALID_KEYS.includes(f.key as FieldKey) && f.rawText.trim().length > 0)
      .map((f, idx) => {
        const key = f.key as FieldKey;
        const region = VALID_REGIONS.includes(f.region as SpatialRegion)
          ? (f.region as SpatialRegion)
          : 'STATUTORY_PANEL';
        const sideIdx = Math.max(
          0,
          Math.min(validatedSides.length - 1, Number(f.imageIndex) || 0),
        );
        const linkedSide = validatedSides[sideIdx].meta;

        let normalizedText = f.rawText;
        let glareNormalized = false;
        let glareRawSample: string | undefined;
        let extractionStatus: ExtractionStatus = 'EXTRACTED';
        let ambiguityReason: string | undefined;

        if (key === 'mfd_use_by') {
          const glare = normalizeGlareDateText(f.rawText);
          if (glare.wasCorrected) {
            normalizedText = glare.normalized;
            glareNormalized = true;
            glareRawSample = f.rawText;
          }
          const dateCheck = extractDatesFromText(normalizedText);
          if (dateCheck.isAmbiguous) {
            extractionStatus = 'AMBIGUOUS';
            ambiguityReason = dateCheck.ambiguityReason;
          }
        }

        const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0)));

        return {
          id: `live-${Date.now()}-${idx}`,
          key,
          label: FIELD_LABELS[key],
          rawText: f.rawText,
          normalizedText,
          region,
          extractionStatus,
          confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.9)),
          fontHeightMm: Number(f.fontHeightMm) || 2.0,
          bbox: {
            x_min: clamp(f.x_min),
            y_min: clamp(f.y_min),
            x_max: clamp(f.x_max),
            y_max: clamp(f.y_max),
          },
          sourceImageId: linkedSide.imageId,
          sourceSideLabel: linkedSide.sideLabel,
          glareNormalized,
          glareRawSample,
          ambiguityReason,
        };
      });

    const report = evaluatePackageCompliance({
      analysisId,
      ownerId: actorId,
      ownerRole: role,
      ruleSetVersionId,
      sourceMode: body.sourceMode ?? 'upload',
      images: validatedSides.map((s) => s.meta),
      productContext,
      fields: extractedFields,
      rules: activeRules,
      ocrMetadata: {
        engine: 'Gemini Vision Multilingual OCR',
        engineVersion: 'gemini-4-hydrogen',
        languages: ['en', 'hi'],
      },
    });

    persistedAnalyses.set(report.analysisId, report);
    res.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze package label';
    console.error('Label analysis error:', message);
    const failed = buildFailedAnalysisReport({
      analysisId,
      ownerId: actorId,
      ownerRole: role,
      ruleSetVersionId,
      sourceMode: body.sourceMode ?? 'upload',
      productContext,
      images: [],
      errorDetail: {
        code: 'ERR-02',
        stage: 'OCR',
        message: `ERR-02: OCR processing error — ${message}`,
        guidance:
          'Verify image clarity and GEMINI_API_KEY configuration, or test deterministic screening with the SRS Acceptance Fixtures.',
      },
    });
    res.status(500).json({ error: message, report: failed });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LabelSure server listening on http://localhost:${PORT}`);
  });
}

startServer();
