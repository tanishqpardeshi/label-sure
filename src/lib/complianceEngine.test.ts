import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMpeTolerance,
  calculateNutritionScore,
  decodeFssaiLicense,
  evaluatePackageCompliance,
  getRequiredFontHeightMm,
  normalizeGlareDateText,
  parseWeightToGrams,
  validateRule12SiUnit,
  verifyUnitSalePrice,
} from './complianceEngine';
import type { ComplianceRule, ExtractedField, ProductContext } from '../types/compliance';

const defaultContext: ProductContext = {
  brand: 'ABC Foods Pvt. Ltd.',
  category: 'Packaged Food',
  countryOfOrigin: 'India',
  stateJurisdiction: 'Madhya Pradesh (Central LMPC + FSSAI)',
  pdpAreaCm2: 150,
};

const defaultRules: ComplianceRule[] = [
  {
    ruleId: 'LMPC_R6_MRP_INCL_TAX',
    version: 'v2022.4',
    name: 'MRP & Inclusive of All Taxes',
    regulation: 'LMPC Rules 2011',
    citation: 'Rule 6(1)(e)',
    targetField: 'mrp_usp',
    category: 'All Packaged Commodities',
    priority: 'CRITICAL',
    enabled: true,
    description: 'Requires ₹ symbol and (INCL. OF ALL TAXES)',
    parameters: { requireCurrencySymbol: true },
  },
  {
    ruleId: 'LMPC_R6_NET_QUANTITY_SI_UNITS',
    version: 'v2017.2',
    name: 'Net Quantity SI Units',
    regulation: 'LMPC Rules 2011',
    citation: 'Rule 6(1)(c)',
    targetField: 'net_quantity',
    category: 'All Packaged Commodities',
    priority: 'CRITICAL',
    enabled: true,
    description: 'Requires permitted SI units',
    parameters: { allowedUnits: ['g', 'kg', 'ml', 'L'] },
  },
  {
    ruleId: 'LMPC_R6_MFD_USE_BY_DATES',
    version: 'v2020.1',
    name: 'Chronological MFD & Use By Dates',
    regulation: 'LMPC Rules 2011',
    citation: 'Rule 6(1)(d)',
    targetField: 'mfd_use_by',
    category: 'Packaged Food',
    priority: 'CRITICAL',
    enabled: true,
    description: 'Use By must be strictly after MFD',
    parameters: { enableGlareNormalization: true },
  },
  {
    ruleId: 'LMPC_R6_MANUFACTURER_ADDRESS_PIN',
    version: 'v2011.1',
    name: 'Manufacturer Address & 6-Digit PIN',
    regulation: 'LMPC Rules 2011',
    citation: 'Rule 6(1)(a)',
    targetField: 'manufacturer_details',
    category: 'All Packaged Commodities',
    priority: 'HIGH',
    enabled: true,
    description: 'Requires full address and 6-digit Indian PIN',
    parameters: { pinDigits: 6 },
  },
  {
    ruleId: 'FSSAI_LIC_14_DIGIT',
    version: 'v2020.3',
    name: '14-Digit FSSAI License',
    regulation: 'FSSAI Labelling & Display 2020',
    citation: 'Reg 5(10)',
    targetField: 'fssai_license',
    category: 'Packaged Food',
    priority: 'CRITICAL',
    enabled: true,
    description: 'Requires valid 14-digit FSSAI number',
    parameters: { length: 14 },
  },
  {
    ruleId: 'CROSS_FIELD_MISPLACED_ENTITY',
    version: 'v2024.1',
    name: 'Cross-Field Spatial Integrity',
    regulation: 'FSSAI Labelling & Display 2020',
    citation: 'Reg 5(2) & 5(10)',
    targetField: 'CROSS_FIELD',
    category: 'Packaged Food',
    priority: 'CRITICAL',
    enabled: true,
    description: 'Flags FSSAI Lic. No. printed inside INGREDIENTS_BOX',
    parameters: { forbidInIngredients: true },
  },
];

test('normalizeGlareDateText corrects foil-glare S/O/I substitutions', () => {
  const res = normalizeGlareDateText('MFD: 01/0S/202S | USE BY: 31/10/2025');
  assert.equal(res.wasCorrected, true);
  assert.equal(res.normalized, 'MFD: 01/05/2025 | USE BY: 31/10/2025');
});

test('Rule 12 validates permitted SI units and flags legacy abbreviations (gm, gms, ltr, kgms, mltr)', () => {
  assert.deepEqual(parseWeightToGrams('NET WEIGHT: 120g').valueGrams, 120);
  assert.deepEqual(parseWeightToGrams('NET WT: 1.5 kg').valueGrams, 1500);
  assert.equal(validateRule12SiUnit('200 U').valid, true);
  assert.equal(validateRule12SiUnit('100 N').valid, true);

  for (const legacy of ['120 gm', '120 gms', '1 ltr', '2 kgms', '500 mltr']) {
    const r = validateRule12SiUnit(legacy);
    assert.equal(r.valid, false, `Expected ${legacy} to fail Rule 12`);
    assert.equal(r.isLegacyNonSi, true);
    assert.ok(r.correctiveGuidance && r.correctiveGuidance.length > 0);
  }
});

test('First Schedule MPE table evaluates all 7 weight brackets accurately', () => {
  assert.equal(calculateMpeTolerance(40, 36.4).mpeToleranceGrams, 3.6); // 9%
  assert.equal(calculateMpeTolerance(80, 75.5).mpeToleranceGrams, 4.5); // 4.5g fixed
  assert.equal(calculateMpeTolerance(120, 118.5).mpeToleranceGrams, 5.4); // 4.5%
  assert.equal(calculateMpeTolerance(120, 113.0).status, 'FAIL');
  assert.equal(calculateMpeTolerance(250, 241.0).mpeToleranceGrams, 9); // 9g fixed
  assert.equal(calculateMpeTolerance(400, 388.0).mpeToleranceGrams, 12); // 3%
  assert.equal(calculateMpeTolerance(750, 735.0).mpeToleranceGrams, 15); // 15g fixed
  assert.equal(calculateMpeTolerance(2000, 1970.0).mpeToleranceGrams, 30); // 1.5%
});

test('Second Schedule maps PDP area cm² to minimum font height and enforces it dynamically', () => {
  assert.equal(getRequiredFontHeightMm(40).minFontHeightMm, 1.0);
  assert.equal(getRequiredFontHeightMm(150).minFontHeightMm, 2.0);
  assert.equal(getRequiredFontHeightMm(350).minFontHeightMm, 4.0);
  assert.equal(getRequiredFontHeightMm(650).minFontHeightMm, 6.0);

  const netQtyField: ExtractedField = {
    id: 'f-qty',
    key: 'net_quantity',
    label: 'Net Quantity',
    rawText: 'NET WEIGHT: 120g',
    normalizedText: 'NET WEIGHT: 120g',
    region: 'STATUTORY_PANEL',
    confidence: 0.97,
    fontHeightMm: 2.6,
    bbox: { x_min: 70, y_min: 175, x_max: 455, y_max: 235 },
  };

  // Passes at PDP 150 cm² (requires 2.0mm)
  const passReport = evaluatePackageCompliance({
    inspectionId: 'TEST-PDP-PASS',
    sourceMode: 'upload',
    productContext: { ...defaultContext, pdpAreaCm2: 150 },
    fields: [netQtyField],
    rules: defaultRules,
  });
  assert.equal(passReport.checkpoints[0].status, 'PASS');
  assert.equal(passReport.requiredFontHeightMm, 2.0);

  // Fails at PDP 350 cm² (requires 4.0mm, field has 2.6mm)
  const failReport = evaluatePackageCompliance({
    inspectionId: 'TEST-PDP-FAIL',
    sourceMode: 'upload',
    productContext: { ...defaultContext, pdpAreaCm2: 350 },
    fields: [netQtyField],
    rules: defaultRules,
  });
  assert.equal(failReport.checkpoints[0].status, 'FAIL');
  assert.equal(failReport.requiredFontHeightMm, 4.0);
  assert.match(failReport.checkpoints[0].rationale, /Second Schedule violation/i);
});

test('decodeFssaiLicense decodes Central vs State prefix and Indian state codes', () => {
  const mpState = decodeFssaiLicense('21324012000456');
  assert.equal(mpState.valid, true);
  assert.equal(mpState.licenseType, 'State License (Category 2)');
  assert.equal(mpState.stateCode, '13');
  assert.equal(mpState.stateName, 'Madhya Pradesh');

  const mhCentral = decodeFssaiLicense('11122011000999');
  assert.equal(mhCentral.valid, true);
  assert.equal(mhCentral.licenseType, 'Central License (Category 1)');
  assert.equal(mhCentral.stateName, 'Maharashtra');

  const invalidPrefix = decodeFssaiLicense('91324012000456');
  assert.equal(invalidPrefix.valid, false);
});

test('verifyUnitSalePrice checks MRP inclusive tax and USP arithmetic', () => {
  const res = verifyUnitSalePrice('MRP ₹ 40.00 (INCL. OF ALL TAXES) | USP ₹ 0.33 per g', 120);
  assert.equal(res.hasMrp, true);
  assert.equal(res.hasInclTax, true);
  assert.equal(res.mrpValue, 40);
  assert.equal(res.uspExpected, 0.33);
  assert.equal(res.uspConsistent, true);
});

test('Confidence Gatekeeper routes < 0.85 fields to UNVERIFIED instead of FAIL', () => {
  const fields: ExtractedField[] = [
    {
      id: 'f-low-conf',
      key: 'mrp_usp',
      label: 'MRP & USP',
      rawText: 'MRP 40',
      normalizedText: 'MRP 40',
      region: 'STATUTORY_PANEL',
      confidence: 0.78,
      fontHeightMm: 2.1,
      bbox: { x_min: 100, y_min: 100, x_max: 300, y_max: 200 },
    },
  ];
  const report = evaluatePackageCompliance({
    inspectionId: 'TEST-1',
    sourceMode: 'upload',
    productContext: defaultContext,
    fields,
    rules: defaultRules,
  });
  assert.equal(report.checkpoints[0].status, 'UNVERIFIED');
  assert.equal(report.summaryCounts.fail, 0);
  assert.equal(report.summaryCounts.unverified, 1);
  assert.equal(report.overallStatus, 'REVIEW_REQUIRED');
});

test('Cross-Field Spatial Integrity flags FAIL when FSSAI Lic. No. is inside INGREDIENTS_BOX', () => {
  const fields: ExtractedField[] = [
    {
      id: 'f-ing',
      key: 'ingredients_declaration',
      label: 'Ingredients Declaration',
      rawText: 'INGREDIENTS: Potato, Edible Vegetable Oil, fssai Lic. No. 1001402202711',
      normalizedText: 'INGREDIENTS: Potato, Edible Vegetable Oil, fssai Lic. No. 1001402202711',
      region: 'INGREDIENTS_BOX',
      confidence: 0.94,
      fontHeightMm: 1.6,
      bbox: { x_min: 50, y_min: 400, x_max: 500, y_max: 650 },
    },
  ];
  const report = evaluatePackageCompliance({
    inspectionId: 'TEST-2',
    sourceMode: 'golden_sample',
    productContext: defaultContext,
    fields,
    rules: defaultRules,
  });
  assert.equal(report.checkpoints[0].status, 'FAIL');
  assert.match(report.checkpoints[0].rationale, /INGREDIENTS section/i);
  assert.equal(report.overallStatus, 'FAIL');
});

test('calculateNutritionScore scores balanced vs high-risk profiles accurately', () => {
  const highRisk = calculateNutritionScore({
    servingBasis: 'per 100g',
    energyKcal: 536,
    proteinG: 6.5,
    totalFatG: 34,
    saturatedFatG: 14.2,
    transFatG: 0.1,
    carbohydratesG: 52,
    addedSugarG: 1.2,
    sodiumMg: 680,
  });
  assert.ok(highRisk.score >= 40 && highRisk.score < 75);
  assert.equal(highRisk.grade, 'Moderate');
});
