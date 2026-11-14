import { describe, expect, it } from 'vitest';
import {
  buildFailedAnalysisReport,
  decodeFssaiLicense,
  evaluatePackageCompliance,
  extractDatesFromText,
  getRequiredFontHeightMm,
  normalizeGlareDateText,
  parseWeightToGrams,
  selectApplicablePublishedRules,
  validateRule12SiUnit,
  verifyUnitSalePrice,
} from './complianceEngine';
import {
  detectImageMagicFormat,
  MAX_IMAGE_SIZE_BYTES,
  validateImageBuffer,
} from './inputValidation';
import { canAccessRecord, DEMO_SESSIONS, getRolePermissions } from './rbac';
import {
  COMPLIANT_FIXTURE_FIELDS,
  DEFAULT_COMPLIANCE_RULES,
  GOLDEN_SAMPLE_CONTEXT,
  GOLDEN_SAMPLE_FIELDS,
  GOLDEN_SAMPLE_IMAGES,
  INITIAL_RULE_SET_VERSION_ID,
  MISSING_DECLARATION_FIELDS,
} from '../data/goldenSample';
import type { ComplianceRule, ExtractedField } from '../types/compliance';

describe('LabelSure Core Screening Engine (SRS v1.0)', () => {
  it('normalizeGlareDateText corrects foil-glare S/O/I substitutions', () => {
    const res = normalizeGlareDateText('MFD: 01/0S/202S | USE BY: 31/10/2025');
    expect(res.wasCorrected).toBe(true);
    expect(res.normalized).toBe('MFD: 01/05/2025 | USE BY: 31/10/2025');
  });

  it('VAL-07: flags ambiguous numeric dates (both <= 12) instead of guessing, while accepting unambiguous DD/MM pairs', () => {
    const ambiguous = extractDatesFromText('MFD: 03/04/2026 | USE BY: 09/10/2026');
    expect(ambiguous.isAmbiguous).toBe(true);
    expect(ambiguous.mfdDate).toBeNull();

    const unambiguous = extractDatesFromText('MFD: 01/05/2025 | USE BY: 31/10/2025');
    expect(unambiguous.isAmbiguous).toBe(false);
    expect(unambiguous.mfdDate).not.toBeNull();
    expect(unambiguous.useByDate).not.toBeNull();
  });

  it('Rule 12 validates permitted SI units and rejects legacy abbreviations (gm, gms, ltr, kgms, mltr)', () => {
    expect(parseWeightToGrams('NET WEIGHT: 120g').valueGrams).toBe(120);
    expect(parseWeightToGrams('NET WT: 1.5 kg').valueGrams).toBe(1500);
    expect(validateRule12SiUnit('200 U').valid).toBe(true);
    expect(validateRule12SiUnit('100 N').valid).toBe(true);

    for (const legacy of ['120 gm', '120 gms', '1 ltr', '2 kgms', '500 mltr']) {
      const r = validateRule12SiUnit(legacy);
      expect(r.valid).toBe(false);
      expect(r.isLegacyNonSi).toBe(true);
      expect(r.correctiveGuidance).toBeTruthy();
    }
  });

  it('Second Schedule maps PDP area cm² to minimum font height and enforces it dynamically', () => {
    expect(getRequiredFontHeightMm(40).minFontHeightMm).toBe(1.0);
    expect(getRequiredFontHeightMm(150).minFontHeightMm).toBe(2.0);
    expect(getRequiredFontHeightMm(350).minFontHeightMm).toBe(4.0);
    expect(getRequiredFontHeightMm(650).minFontHeightMm).toBe(6.0);

    const netQtyField: ExtractedField = {
      id: 'f-qty',
      key: 'net_quantity',
      label: 'Net Quantity',
      rawText: 'NET WEIGHT: 120g',
      normalizedText: 'NET WEIGHT: 120g',
      region: 'STATUTORY_PANEL',
      extractionStatus: 'EXTRACTED',
      confidence: 0.97,
      fontHeightMm: 2.6,
      bbox: { x_min: 70, y_min: 175, x_max: 455, y_max: 235 },
    };

    const passReport = evaluatePackageCompliance({
      analysisId: 'ANL-PDP-PASS',
      sourceMode: 'upload',
      productContext: { ...GOLDEN_SAMPLE_CONTEXT, pdpAreaCm2: 150 },
      fields: [netQtyField],
      rules: DEFAULT_COMPLIANCE_RULES,
    });
    const qtyPassCp = passReport.checkpoints.find((c) => c.key === 'net_quantity');
    expect(qtyPassCp?.status).toBe('PASS');

    const failReport = evaluatePackageCompliance({
      analysisId: 'ANL-PDP-FAIL',
      sourceMode: 'upload',
      productContext: { ...GOLDEN_SAMPLE_CONTEXT, pdpAreaCm2: 350 },
      fields: [netQtyField],
      rules: DEFAULT_COMPLIANCE_RULES,
    });
    const qtyFailCp = failReport.checkpoints.find((c) => c.key === 'net_quantity');
    expect(qtyFailCp?.status).toBe('FAIL');
    expect(qtyFailCp?.rationale).toMatch(/Second Schedule violation/i);
  });

  it('decodeFssaiLicense decodes Central vs State prefix and Indian state codes', () => {
    const mpState = decodeFssaiLicense('21324012000456');
    expect(mpState.valid).toBe(true);
    expect(mpState.licenseType).toBe('State License (Category 2)');
    expect(mpState.stateCode).toBe('13');
    expect(mpState.stateName).toBe('Madhya Pradesh');

    const mhCentral = decodeFssaiLicense('11122011000999');
    expect(mhCentral.valid).toBe(true);
    expect(mhCentral.licenseType).toBe('Central License (Category 1)');
    expect(mhCentral.stateName).toBe('Maharashtra');

    expect(decodeFssaiLicense('91324012000456').valid).toBe(false);
  });

  it('verifyUnitSalePrice checks MRP inclusive tax and USP arithmetic', () => {
    const res = verifyUnitSalePrice('MRP ₹ 40.00 (INCL. OF ALL TAXES) | USP ₹ 0.33 per g', 120);
    expect(res.hasMrp).toBe(true);
    expect(res.hasInclTax).toBe(true);
    expect(res.mrpValue).toBe(40);
    expect(res.uspExpected).toBe(0.33);
    expect(res.uspConsistent).toBe(true);
  });

  it('AT-07: Confidence Gatekeeper routes < 0.85 fields to UNVERIFIED instead of FAIL', () => {
    const fields: ExtractedField[] = [
      {
        id: 'f-low-conf',
        key: 'mrp_usp',
        label: 'MRP & USP',
        rawText: 'MRP 40',
        normalizedText: 'MRP 40',
        region: 'STATUTORY_PANEL',
        extractionStatus: 'EXTRACTED',
        confidence: 0.78,
        fontHeightMm: 2.1,
        bbox: { x_min: 100, y_min: 100, x_max: 300, y_max: 200 },
      },
    ];
    const report = evaluatePackageCompliance({
      analysisId: 'ANL-LOW-CONF',
      sourceMode: 'upload',
      productContext: GOLDEN_SAMPLE_CONTEXT,
      fields,
      rules: DEFAULT_COMPLIANCE_RULES,
    });
    const mrpCp = report.checkpoints.find((c) => c.key === 'mrp_usp');
    expect(mrpCp?.status).toBe('UNVERIFIED');
    expect(report.summaryCounts.fail).toBe(0);
    expect(report.overallStatus).toBe('REVIEW_REQUIRED');
  });

  it('AT-04: Missing mandatory declarations are marked MISSING and evaluated UNVERIFIED (never PASS)', () => {
    const report = evaluatePackageCompliance({
      analysisId: 'ANL-MISSING',
      sourceMode: 'acceptance_fixture',
      fixtureId: 'AT-04',
      productContext: GOLDEN_SAMPLE_CONTEXT,
      fields: MISSING_DECLARATION_FIELDS,
      rules: DEFAULT_COMPLIANCE_RULES,
    });

    const mrpCp = report.checkpoints.find((c) => c.key === 'mrp_usp');
    const qtyCp = report.checkpoints.find((c) => c.key === 'net_quantity');
    expect(mrpCp?.extractionStatus).toBe('MISSING');
    expect(mrpCp?.status).toBe('UNVERIFIED');
    expect(qtyCp?.extractionStatus).toBe('MISSING');
    expect(qtyCp?.status).toBe('UNVERIFIED');
    expect(report.overallStatus).toBe('REVIEW_REQUIRED');
  });

  it('AT-05 & AT-01/06: Compliant fixture passes all checks; Golden Sample fails Cross-Field Spatial Integrity', () => {
    const passReport = evaluatePackageCompliance({
      analysisId: 'ANL-OK',
      sourceMode: 'acceptance_fixture',
      fixtureId: 'AT-05',
      images: GOLDEN_SAMPLE_IMAGES,
      productContext: GOLDEN_SAMPLE_CONTEXT,
      fields: COMPLIANT_FIXTURE_FIELDS,
      rules: DEFAULT_COMPLIANCE_RULES,
    });
    expect(passReport.overallStatus).toBe('PASS');
    expect(passReport.summaryCounts.fail).toBe(0);
    expect(passReport.pipelineStages).toHaveLength(6);
    expect(passReport.pipelineStages.every((s) => s.status === 'COMPLETED')).toBe(true);

    const goldenReport = evaluatePackageCompliance({
      analysisId: 'ANL-GS',
      sourceMode: 'golden_sample',
      fixtureId: 'AT-01',
      images: GOLDEN_SAMPLE_IMAGES,
      productContext: GOLDEN_SAMPLE_CONTEXT,
      fields: GOLDEN_SAMPLE_FIELDS,
      rules: DEFAULT_COMPLIANCE_RULES,
    });
    expect(goldenReport.overallStatus).toBe('FAIL');
    const ingCp = goldenReport.checkpoints.find((c) => c.key === 'ingredients_declaration');
    expect(ingCp?.status).toBe('FAIL');
    expect(ingCp?.ruleId).toBe('CROSS_FIELD_MISPLACED_ENTITY');
  });

  it('BR-01 & AT-10: Draft rules are excluded from runtime rule selection and ruleSetVersionId stays immutable', () => {
    const draftRule: ComplianceRule = {
      ...DEFAULT_COMPLIANCE_RULES[0],
      ruleId: 'DRAFT_EXPERIMENTAL_RULE',
      status: 'DRAFT',
    };
    const selected = selectApplicablePublishedRules(
      [...DEFAULT_COMPLIANCE_RULES, draftRule],
      'Electronics',
    );
    expect(selected.some((r) => r.ruleId === 'DRAFT_EXPERIMENTAL_RULE')).toBe(false);
    // Packaged Food-only rules should not be selected for Electronics
    expect(selected.some((r) => r.ruleId === 'FSSAI_LIC_14_DIGIT')).toBe(false);

    const report = evaluatePackageCompliance({
      analysisId: 'ANL-IMMUTABLE',
      ruleSetVersionId: INITIAL_RULE_SET_VERSION_ID,
      sourceMode: 'golden_sample',
      productContext: GOLDEN_SAMPLE_CONTEXT,
      fields: COMPLIANT_FIXTURE_FIELDS,
      rules: DEFAULT_COMPLIANCE_RULES,
    });
    expect(report.ruleSetVersionId).toBe('LMPC-2011-v1.0.0');
  });

  it('VAL-01..03 & AT-02: Validates magic bytes, rejects corrupt/oversized buffers with ERR-01, and builds FAILED state', () => {
    const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]);
    expect(detectImageMagicFormat(validPng)).toBe('PNG');
    expect(
      validateImageBuffer({
        fileName: 'label.png',
        mimeType: 'image/png',
        bytes: validPng,
      }).valid,
    ).toBe(true);

    const corruptSpoofedJpg = new TextEncoder().encode('NOT_A_REAL_JPEG_STREAM_1234');
    const badRes = validateImageBuffer({
      fileName: 'corrupt.jpg',
      mimeType: 'image/jpeg',
      bytes: corruptSpoofedJpg,
    });
    expect(badRes.valid).toBe(false);
    expect(badRes.errorCode).toBe('ERR-01');

    const oversized = new Uint8Array(MAX_IMAGE_SIZE_BYTES + 10);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;
    const sizeRes = validateImageBuffer({
      fileName: 'huge.jpg',
      mimeType: 'image/jpeg',
      bytes: oversized,
    });
    expect(sizeRes.valid).toBe(false);
    expect(sizeRes.errorCode).toBe('ERR-01');

    const failedReport = buildFailedAnalysisReport({
      analysisId: 'ANL-CORRUPT',
      ownerId: 'msme-abc-foods',
      ownerRole: 'MANUFACTURER',
      ruleSetVersionId: INITIAL_RULE_SET_VERSION_ID,
      sourceMode: 'upload',
      productContext: GOLDEN_SAMPLE_CONTEXT,
      images: [],
      errorDetail: {
        code: 'ERR-01',
        stage: 'INTAKE',
        message: badRes.errorMessage || 'ERR-01',
        guidance: badRes.guidance || '',
      },
    });
    expect(failedReport.processingState).toBe('FAILED');
    expect(failedReport.checkpoints).toHaveLength(0);
    expect(failedReport.pipelineStages[0].status).toBe('FAILED');
  });

  it('AUTH-01..06 & SEC-01: Enforces RBAC permissions and record ownership isolation', () => {
    expect(getRolePermissions('VISITOR').isAuthenticated).toBe(false);
    expect(canAccessRecord(DEMO_SESSIONS.VISITOR, { ownerId: 'msme-abc-foods' })).toBe(false);

    expect(canAccessRecord(DEMO_SESSIONS.MANUFACTURER, { ownerId: 'msme-abc-foods' })).toBe(true);
    expect(canAccessRecord(DEMO_SESSIONS.MANUFACTURER, { ownerId: 'msme-other-packer' })).toBe(false);
    expect(getRolePermissions('MANUFACTURER').canPublishRuleVersion).toBe(false);

    expect(getRolePermissions('INSPECTOR').canReviewHitl).toBe(true);
    expect(getRolePermissions('INSPECTOR').canPublishRuleVersion).toBe(false);
    expect(canAccessRecord(DEMO_SESSIONS.INSPECTOR, { ownerId: 'msme-other-packer' })).toBe(true);

    expect(getRolePermissions('MAINTAINER').canPublishRuleVersion).toBe(true);
    expect(getRolePermissions('MAINTAINER').canViewAuditLog).toBe(true);
  });
});
