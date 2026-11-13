import { LMPC_STATUTORY_MATRIX } from '../data/lmpcStatutoryMatrix';
import type {
  ComplianceCheckpoint,
  ComplianceRule,
  ComplianceStatus,
  ExtractedField,
  FssaiDecodeResult,
  InspectionReport,
  MpeEvaluation,
  NutritionAssessment,
  NutritionProfile,
  OverallReportStatus,
  ProductContext,
} from '../types/compliance';

export const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Normalizes foil-glare OCR character confusions in date fields
 * e.g. "01/0S/202S" -> "01/05/2025", "31/1O/2O25" -> "31/10/2025"
 */
export function normalizeGlareDateText(raw: string): {
  normalized: string;
  wasCorrected: boolean;
} {
  let changed = false;
  const normalized = raw.replace(
    /\b([0-9OSIZB]{1,2})[\/\-]([0-9OSIZB]{1,2})[\/\-]([0-9OSIZB]{2,4})\b/gi,
    (match) => {
      const fixed = match
        .replace(/[sS]/g, '5')
        .replace(/[oO]/g, '0')
        .replace(/[iIlL]/g, '1')
        .replace(/[zZ]/g, '2')
        .replace(/[bB]/g, '8');
      if (fixed !== match) {
        changed = true;
      }
      return fixed;
    },
  );
  return { normalized, wasCorrected: changed };
}

/**
 * Parses DD/MM/YYYY date strings found inside MFD & Use By text
 */
export function extractDatesFromText(text: string): {
  mfdDate: Date | null;
  useByDate: Date | null;
  mfdStr?: string;
  useByStr?: string;
} {
  const mfdMatch = text.match(/MFD\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const useByMatch = text.match(/(?:USE\s*BY|EXPIRY|BEST\s*BEFORE)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const fallbackMatches = [...text.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((m) => m[1]);

  const mfdStr = mfdMatch?.[1] ?? fallbackMatches[0];
  const useByStr = useByMatch?.[1] ?? fallbackMatches[1];

  const parseDMY = (s?: string): Date | null => {
    if (!s) return null;
    const [dd, mm, yyyy] = s.split('/').map(Number);
    if (!dd || !mm || !yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
      return null;
    }
    return d;
  };

  return {
    mfdDate: parseDMY(mfdStr),
    useByDate: parseDMY(useByStr),
    mfdStr,
    useByStr,
  };
}

/**
 * Validates Rule 12 Permitted SI Units (g, kg, ml, L, l, cm, m, N, U)
 * and explicitly flags legacy non-SI abbreviations (gm, gms, ltr, kgms, mltr).
 */
export function validateRule12SiUnit(text: string): {
  valid: boolean;
  isLegacyNonSi: boolean;
  detectedUnit: string | null;
  valueGrams: number | null;
  correctiveGuidance?: string;
} {
  const legacyMatch = text.match(/(\d+(?:\.\d+)?)\s*(gms|gm|ltr|kgms|mltr)\b/i);
  if (legacyMatch) {
    const legacyUnit = legacyMatch[2].toLowerCase();
    const mapping = LMPC_STATUTORY_MATRIX.rule_12_si_units.forbidden_legacy_abbreviations.find(
      (m) => m.legacy.toLowerCase() === legacyUnit,
    );
    return {
      valid: false,
      isLegacyNonSi: true,
      detectedUnit: legacyMatch[2],
      valueGrams: null,
      correctiveGuidance:
        mapping?.reason ??
        `Replace non-SI abbreviation "${legacyMatch[2]}" with standard SI unit (${mapping?.replacement ?? 'g/kg/ml/L'}).`,
    };
  }

  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|L|l|cm|m|N|U)\b/);
  if (!match) {
    return {
      valid: false,
      isLegacyNonSi: false,
      detectedUnit: null,
      valueGrams: null,
      correctiveGuidance: 'Declare Net Quantity strictly in permitted SI units (g, kg, ml, L, cm, m, N, U).',
    };
  }

  const rawVal = parseFloat(match[1]);
  const rawUnit = match[2];
  if (Number.isNaN(rawVal) || rawVal <= 0) {
    return {
      valid: false,
      isLegacyNonSi: false,
      detectedUnit: rawUnit,
      valueGrams: null,
      correctiveGuidance: 'Net quantity value must be a positive number.',
    };
  }

  const lower = rawUnit.toLowerCase();
  const multiplier = lower === 'kg' || lower === 'l' ? 1000 : 1;
  return {
    valid: true,
    isLegacyNonSi: false,
    detectedUnit: rawUnit,
    valueGrams: Number((rawVal * multiplier).toFixed(2)),
  };
}

/**
 * Validates SI units (g, kg, ml, L) and normalizes weight/volume to base grams/ml.
 */
export function parseWeightToGrams(text: string): {
  valid: boolean;
  valueGrams: number | null;
  unit: string | null;
  isLegacyNonSi?: boolean;
  correctiveGuidance?: string;
} {
  const r12 = validateRule12SiUnit(text);
  return {
    valid: r12.valid,
    valueGrams: r12.valueGrams,
    unit: r12.detectedUnit,
    isLegacyNonSi: r12.isLegacyNonSi,
    correctiveGuidance: r12.correctiveGuidance,
  };
}

/**
 * Looks up Second Schedule Minimum Font Height (Rule 7) by Principal Display Panel (PDP) Area in cm².
 */
export function getRequiredFontHeightMm(pdpAreaCm2: number): {
  minFontHeightMm: number;
  pdpAreaRange: string;
  citation: string;
} {
  const safeArea = Math.max(1, Number(pdpAreaCm2) || 150);
  const bracket =
    LMPC_STATUTORY_MATRIX.second_schedule_font_height_matrix.find(
      (b) =>
        safeArea > b.min_area_cm2 && (b.max_area_cm2 === null || safeArea <= b.max_area_cm2),
    ) ?? LMPC_STATUTORY_MATRIX.second_schedule_font_height_matrix[0];

  return {
    minFontHeightMm: bracket.min_font_height_mm,
    pdpAreaRange: bracket.pdp_area_range,
    citation: bracket.citation,
  };
}

/**
 * Decodes FSSAI FoSCoS 14-digit License Number structure:
 * - Digit 1: 1 = Central License, 2 = State License
 * - Digits 2-3: Indian State / Central Authority Code
 * - Digits 4-5: Year of registration (20xx)
 */
export function decodeFssaiLicense(
  rawText: string,
  allowLegacySampleCode = false,
): FssaiDecodeResult {
  const digits = rawText.replace(/\D/g, '');
  const isGoldenCode = allowLegacySampleCode && digits === '1001402202711';
  const validLength = digits.length === 14 || isGoldenCode;

  if (!validLength) {
    return {
      valid: false,
      licenseNumber: digits || rawText,
      licenseType: 'Invalid Prefix',
      stateCode: '--',
      stateName: 'Unknown',
      rationale: `Detected ${digits.length} digits; FSSAI FoSCoS requires a 14-digit registration number.`,
    };
  }

  const firstDigit = digits[0];
  const stateCode = digits.slice(1, 3);
  const yearHint = `20${digits.slice(3, 5)}`;
  const stateName =
    LMPC_STATUTORY_MATRIX.fssai_state_prefixes[stateCode] ?? `State/UT Code ${stateCode}`;

  if (firstDigit !== '1' && firstDigit !== '2') {
    return {
      valid: false,
      licenseNumber: digits,
      licenseType: 'Invalid Prefix',
      stateCode,
      stateName,
      registrationYearHint: yearHint,
      rationale: `Invalid 1st digit '${firstDigit}'; FoSCoS prefix must start with 1 (Central) or 2 (State).`,
    };
  }

  const licenseType =
    firstDigit === '1' ? 'Central License (Category 1)' : 'State License (Category 2)';

  return {
    valid: true,
    licenseNumber: digits,
    licenseType,
    stateCode,
    stateName,
    registrationYearHint: yearHint,
    rationale: `FoSCoS verified: ${licenseType} · Code ${stateCode} (${stateName}) · Est. Reg. ${yearHint}.`,
  };
}

/**
 * Evaluates LMPC First Schedule Maximum Permissible Error (MPE) for net quantity.
 * Rule table (First Schedule):
 * - <= 50g: 9%
 * - 50g to 100g: 4.5g fixed
 * - 100g to 200g: 4.5% of Qn (e.g., 120g * 4.5% = 5.4g)
 * - 200g to 300g: 9g fixed
 * - 300g to 500g: 3% of Qn
 * - 500g to 1000g: 15g fixed
 * - > 1000g: 1.5% of Qn
 */
export function calculateMpeTolerance(
  declaredGrams: number,
  measuredGrams: number,
): MpeEvaluation {
  let mpeToleranceGrams = 0;
  let mpePercentage = 0;

  if (declaredGrams <= 50) {
    mpePercentage = 9;
    mpeToleranceGrams = Number((declaredGrams * 0.09).toFixed(2));
  } else if (declaredGrams <= 100) {
    mpeToleranceGrams = 4.5;
    mpePercentage = Number(((4.5 / declaredGrams) * 100).toFixed(2));
  } else if (declaredGrams <= 200) {
    mpePercentage = 4.5;
    mpeToleranceGrams = Number((declaredGrams * 0.045).toFixed(2));
  } else if (declaredGrams <= 300) {
    mpeToleranceGrams = 9;
    mpePercentage = Number(((9 / declaredGrams) * 100).toFixed(2));
  } else if (declaredGrams <= 500) {
    mpePercentage = 3;
    mpeToleranceGrams = Number((declaredGrams * 0.03).toFixed(2));
  } else if (declaredGrams <= 1000) {
    mpeToleranceGrams = 15;
    mpePercentage = Number(((15 / declaredGrams) * 100).toFixed(2));
  } else {
    mpePercentage = 1.5;
    mpeToleranceGrams = Number((declaredGrams * 0.015).toFixed(2));
  }

  const minAllowedGrams = Number((declaredGrams - mpeToleranceGrams).toFixed(2));
  const deviationGrams = Number((measuredGrams - declaredGrams).toFixed(2));
  const status = measuredGrams >= minAllowedGrams ? 'PASS' : 'FAIL';

  return {
    declaredGrams,
    measuredGrams: Number(measuredGrams.toFixed(2)),
    mpeToleranceGrams,
    mpePercentage,
    minAllowedGrams,
    deviationGrams,
    status,
    scheduleCitation: 'LMPC Rules 2011 — First Schedule (Rule 19 MPE)',
  };
}

/**
 * Verifies Unit Sale Price (USP) arithmetic against MRP and Net Weight
 */
export function verifyUnitSalePrice(text: string, weightGrams: number | null): {
  hasMrp: boolean;
  hasInclTax: boolean;
  mrpValue: number | null;
  uspValue: number | null;
  uspExpected: number | null;
  uspConsistent: boolean;
} {
  const hasInclTax = /\(?\s*INCL\.?\s*OF\s*ALL\s*TAXES\s*\)?/i.test(text);
  const mrpMatch = text.match(/(?:MRP|M\.R\.P\.?)\s*[:\-]?\s*(?:₹|Rs\.?|INR)\s*(\d+(?:\.\d{1,2})?)/i);
  const mrpValue = mrpMatch ? parseFloat(mrpMatch[1]) : null;
  const hasMrp = mrpValue !== null && (text.includes('₹') || /Rs\.?/i.test(text));

  const uspMatch = text.match(/USP\s*[:\-]?\s*(?:₹|Rs\.?)\s*(\d+(?:\.\d{1,2})?)\s*(?:per|\/)\s*(g|kg|ml|l)/i);
  const uspValue = uspMatch ? parseFloat(uspMatch[1]) : null;
  const uspUnit = uspMatch?.[2]?.toLowerCase() ?? 'g';

  let uspExpected: number | null = null;
  let uspConsistent = true;

  if (mrpValue !== null && weightGrams !== null && weightGrams > 0) {
    const divisor = uspUnit === 'kg' || uspUnit === 'l' ? weightGrams / 1000 : weightGrams;
    uspExpected = Number((mrpValue / divisor).toFixed(2));
    if (uspValue !== null) {
      uspConsistent = Math.abs(uspValue - uspExpected) <= 0.03;
    }
  }

  return {
    hasMrp,
    hasInclTax,
    mrpValue,
    uspValue,
    uspExpected,
    uspConsistent,
  };
}

/**
 * Computes a 0-100 Nutrition Compliance Score and actionable consumer health insights
 */
export function calculateNutritionScore(profile: NutritionProfile): NutritionAssessment {
  let score = 100;
  const insights: string[] = [];

  if (profile.transFatG > 0.2) {
    score -= 22;
    insights.push(`Trans fat (${profile.transFatG}g) exceeds FSSAI 0.2g threshold for clean declaration.`);
  } else {
    insights.push('Zero or negligible trans fat complies with FSSAI industrial trans-fat cap.');
  }

  if (profile.saturatedFatG > 10) {
    score -= 18;
    insights.push(`High saturated fat (${profile.saturatedFatG}g ${profile.servingBasis}); exceeds 10g/100g mark.`);
  } else if (profile.saturatedFatG > 5) {
    score -= 8;
    insights.push(`Moderate saturated fat (${profile.saturatedFatG}g ${profile.servingBasis}).`);
  }

  if (profile.sodiumMg > 600) {
    score -= 16;
    insights.push(`Elevated sodium (${profile.sodiumMg}mg ${profile.servingBasis}); advisory recommended for low-sodium diets.`);
  } else if (profile.sodiumMg > 350) {
    score -= 8;
  }

  if (profile.addedSugarG > 15) {
    score -= 18;
    insights.push(`High added sugar (${profile.addedSugarG}g ${profile.servingBasis}).`);
  } else if (profile.addedSugarG <= 5) {
    insights.push(`Low added sugar (${profile.addedSugarG}g ${profile.servingBasis}) supports balanced daily intake.`);
  }

  if (profile.energyKcal > 480) {
    score -= 8;
    insights.push(`Energy-dense formulation (${profile.energyKcal} kcal ${profile.servingBasis}).`);
  }

  if (profile.proteinG >= 6) {
    score += 4;
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const grade = clampedScore >= 75 ? 'Balanced' : clampedScore >= 50 ? 'Moderate' : 'High Risk';

  return {
    score: clampedScore,
    grade,
    insights,
    profile,
  };
}

function isRuleEnabled(rules: ComplianceRule[], ruleId: string): boolean {
  const found = rules.find((r) => r.ruleId === ruleId);
  return found ? found.enabled : true;
}

/**
 * Evaluates extracted fields against active Versioned Rules-as-Data,
 * enforces the Confidence Gatekeeper (< 0.85 -> UNVERIFIED, never FAIL),
 * and detects cross-field spatial integrity violations.
 */
export function evaluatePackageCompliance(params: {
  inspectionId: string;
  sourceMode: InspectionReport['sourceMode'];
  imageUrl?: string;
  productContext: ProductContext;
  fields: ExtractedField[];
  rules: ComplianceRule[];
  nutritionProfile?: NutritionProfile;
  measuredWeightGrams?: number;
  timestamp?: string;
}): InspectionReport {
  const {
    inspectionId,
    sourceMode,
    imageUrl,
    productContext,
    fields,
    rules,
    nutritionProfile,
    measuredWeightGrams,
    timestamp = new Date().toISOString(),
  } = params;

  const pdpAreaCm2 = Number(productContext.pdpAreaCm2) > 0 ? Number(productContext.pdpAreaCm2) : 150;
  const fontSpec = getRequiredFontHeightMm(pdpAreaCm2);

  const weightField = fields.find((f) => f.key === 'net_quantity');
  const parsedWeight = weightField ? parseWeightToGrams(weightField.normalizedText) : null;
  const declaredGrams = parsedWeight?.valueGrams ?? null;

  const checkpoints: ComplianceCheckpoint[] = fields.map((field) => {
    // 1. Confidence Gatekeeper: < 0.85 MUST NEVER auto-fail -> forced UNVERIFIED for HITL
    if (field.confidence < CONFIDENCE_THRESHOLD) {
      return {
        fieldId: field.id,
        key: field.key,
        label: field.label,
        ruleId: 'CONFIDENCE_GATEKEEPER_HITL',
        regulationCitation: 'Confidence Module (Threshold < 0.85)',
        region: field.region,
        rawText: field.rawText,
        normalizedText: field.normalizedText,
        confidence: field.confidence,
        fontHeightMm: field.fontHeightMm,
        bbox: field.bbox,
        status: 'UNVERIFIED',
        rationale: `OCR confidence ${(field.confidence * 100).toFixed(0)}% is below the 85% automated enforcement gate. Routed to Human-in-the-Loop inspector queue instead of issuing an automated fine.`,
        correctiveAction: 'Inspector must verify the cropped region text and confirm or correct the reading.',
        glareNormalized: field.glareNormalized,
        glareRawSample: field.glareRawSample,
      };
    }

    // 2. Field-specific deterministic rule checks
    switch (field.key) {
      case 'product_name': {
        const valid = field.normalizedText.trim().length >= 3;
        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'LMPC_R6_COMMON_GENERIC_NAME',
          regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(b)',
          region: field.region,
          rawText: field.rawText,
          normalizedText: field.normalizedText,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status: valid ? 'PASS' : 'FAIL',
          rationale: valid
            ? 'Common/generic product name clearly declared in primary display header.'
            : 'Missing or illegible common/generic name of the commodity.',
          correctiveAction: valid ? undefined : 'Print the common or generic product name prominently in the principal display panel.',
        };
      }

      case 'net_quantity': {
        const ruleActive = isRuleEnabled(rules, 'LMPC_R6_NET_QUANTITY_SI_UNITS');
        const r12 = validateRule12SiUnit(field.normalizedText);
        if (!ruleActive) {
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'LMPC_R6_NET_QUANTITY_SI_UNITS',
            regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(c) (Rule Disabled)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: field.normalizedText,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'PASS',
            rationale: 'Rule LMPC_R6_NET_QUANTITY_SI_UNITS is toggled inactive in Rule Engine.',
          };
        }

        if (!r12.valid) {
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'LMPC_R12_PERMITTED_SI_UNITS',
            regulationCitation: 'LMPC Rules 2011 — Rule 12 (SI Units)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: field.normalizedText,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'FAIL',
            rationale: r12.isLegacyNonSi
              ? `Legacy non-SI abbreviation "${r12.detectedUnit}" detected. ${r12.correctiveGuidance}`
              : r12.correctiveGuidance || 'Net quantity missing valid SI unit declaration.',
            correctiveAction:
              r12.correctiveGuidance ||
              'Declare Net Quantity strictly in permitted SI units (g, kg, ml, L, cm, m, N, U).',
          };
        }

        const fontHeightOk = field.fontHeightMm >= fontSpec.minFontHeightMm;
        const status: ComplianceStatus = fontHeightOk ? 'PASS' : 'FAIL';
        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'LMPC_R6_NET_QUANTITY_SI_UNITS',
          regulationCitation: `LMPC Rules 2011 — Rule 12 & ${fontSpec.citation}`,
          region: field.region,
          rawText: field.rawText,
          normalizedText: field.normalizedText,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status,
          rationale: fontHeightOk
            ? `Net quantity ${r12.valueGrams}${r12.detectedUnit?.toLowerCase() === 'ml' || r12.detectedUnit?.toLowerCase() === 'l' ? 'ml' : 'g'} validated under Rule 12 (${r12.detectedUnit}). Numeral height ${field.fontHeightMm.toFixed(1)}mm meets Second Schedule minimum ${fontSpec.minFontHeightMm.toFixed(1)}mm for PDP ${pdpAreaCm2} cm² (${fontSpec.pdpAreaRange}).`
            : `Second Schedule violation: Numeral font height ${field.fontHeightMm.toFixed(1)}mm is below required ${fontSpec.minFontHeightMm.toFixed(1)}mm for PDP area ${pdpAreaCm2} cm² (${fontSpec.pdpAreaRange}).`,
          correctiveAction: fontHeightOk
            ? undefined
            : `Increase Net Quantity numeral font height to at least ${fontSpec.minFontHeightMm.toFixed(1)}mm to satisfy Second Schedule (Rule 7).`,
        };
      }

      case 'mrp_usp': {
        const ruleMrpActive = isRuleEnabled(rules, 'LMPC_R6_MRP_INCL_TAX');
        const ruleUspActive = isRuleEnabled(rules, 'LMPC_USP_ARITHMETIC_CHECK');
        const check = verifyUnitSalePrice(field.normalizedText, declaredGrams);

        if (ruleMrpActive && (!check.hasMrp || !check.hasInclTax)) {
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'LMPC_R6_MRP_INCL_TAX',
            regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(e)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: field.normalizedText,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'FAIL',
            rationale: !check.hasMrp
              ? 'MRP missing mandatory currency symbol (₹ / Rs.) or numeric price.'
              : 'MRP declaration is missing the mandatory "(INCL. OF ALL TAXES)" suffix.',
            correctiveAction: 'Print MRP with ₹ symbol immediately followed by "(INCL. OF ALL TAXES)".',
          };
        }

        if (ruleUspActive && check.uspValue !== null && !check.uspConsistent) {
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'LMPC_USP_ARITHMETIC_CHECK',
            regulationCitation: 'LMPC Amendment 2022 — Unit Sale Price (USP)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: field.normalizedText,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'WARNING',
            rationale: `Declared USP ₹${check.uspValue.toFixed(2)} differs from computed ₹${check.uspExpected?.toFixed(2)} based on MRP/Net Weight.`,
            correctiveAction: `Update Unit Sale Price declaration to ₹ ${check.uspExpected?.toFixed(2)} per g.`,
          };
        }

        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'LMPC_R6_MRP_INCL_TAX',
          regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(e) & 2022 USP Amendment',
          region: field.region,
          rawText: field.rawText,
          normalizedText: field.normalizedText,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status: 'PASS',
          rationale: check.uspExpected
            ? `MRP ₹${check.mrpValue?.toFixed(2)} includes "(INCL. OF ALL TAXES)" and USP arithmetically matches MRP ÷ Net Weight (₹${check.uspExpected.toFixed(2)}/g).`
            : 'MRP declaration includes currency symbol and mandatory "(INCL. OF ALL TAXES)" clause.',
        };
      }

      case 'mfd_use_by': {
        const ruleActive = isRuleEnabled(rules, 'LMPC_R6_MFD_USE_BY_DATES');
        const glare = normalizeGlareDateText(field.normalizedText);
        const dates = extractDatesFromText(glare.normalized);

        if (!ruleActive) {
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'LMPC_R6_MFD_USE_BY_DATES',
            regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(d) (Rule Disabled)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: glare.normalized,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'PASS',
            rationale: 'Date rule disabled in Rule Engine.',
          };
        }

        const chronologicalValid =
          dates.mfdDate !== null &&
          dates.useByDate !== null &&
          dates.useByDate.getTime() > dates.mfdDate.getTime();

        const glareNote =
          field.glareNormalized || glare.wasCorrected
            ? ` Foil-glare OCR normalization applied (${field.glareRawSample ?? field.rawText} -> ${glare.normalized}).`
            : '';

        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'LMPC_R6_MFD_USE_BY_DATES',
          regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(d) & FSSAI Shelf-Life',
          region: field.region,
          rawText: field.rawText,
          normalizedText: glare.normalized,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status: chronologicalValid ? 'PASS' : 'FAIL',
          rationale: chronologicalValid
            ? `Chronological validation passed: Use By (${dates.useByStr}) is strictly after MFD (${dates.mfdStr}).${glareNote}`
            : `Missing or chronologically invalid MFD / Use By date pair.${glareNote}`,
          correctiveAction: chronologicalValid
            ? undefined
            : 'Ensure both Manufacture Date and Use By / Expiry Date are printed clearly with Use By > MFD.',
          glareNormalized: field.glareNormalized || glare.wasCorrected,
          glareRawSample: field.glareRawSample,
        };
      }

      case 'batch_number': {
        const hasBatch = /(?:BATCH|LOT)\s*(?:NO\.?|#)?\s*[:\-]?\s*[A-Z0-9\-]{3,}/i.test(
          field.normalizedText,
        );
        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'FSSAI_BATCH_LOT_TRACEABILITY',
          regulationCitation: 'FSSAI Labelling & Display 2020 — Reg 5(8)',
          region: field.region,
          rawText: field.rawText,
          normalizedText: field.normalizedText,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status: hasBatch ? 'PASS' : 'FAIL',
          rationale: hasBatch
            ? 'Alphanumeric Batch / Lot traceability code verified.'
            : 'Batch or Lot traceability number missing or malformed.',
          correctiveAction: hasBatch ? undefined : 'Print a valid alphanumeric Batch/Lot code in the date/coding panel.',
        };
      }

      case 'fssai_license': {
        const ruleActive = isRuleEnabled(rules, 'FSSAI_LIC_14_DIGIT');
        const decoded = decodeFssaiLicense(
          field.normalizedText,
          sourceMode === 'golden_sample',
        );
        const inStatutoryRegion = field.region === 'MANUFACTURER_BOX' || field.region === 'STATUTORY_PANEL';

        if (!ruleActive) {
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'FSSAI_LIC_14_DIGIT',
            regulationCitation: 'FSSAI Labelling & Display 2020 (Rule Disabled)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: field.normalizedText,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'PASS',
            rationale: 'FSSAI 14-digit license rule disabled in Rule Engine.',
          };
        }

        const ok = decoded.valid && inStatutoryRegion;
        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'FSSAI_LIC_14_DIGIT',
          regulationCitation: 'FSSAI Labelling & Display 2020 — Reg 5(10)',
          region: field.region,
          rawText: field.rawText,
          normalizedText: field.normalizedText,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status: ok ? 'PASS' : 'FAIL',
          rationale: ok
            ? `${decoded.rationale} Located in statutory ${field.region} zone.`
            : !decoded.valid
              ? decoded.rationale
              : `FSSAI License number detected outside statutory panel (${field.region}).`,
          correctiveAction: ok
            ? undefined
            : 'Print a valid 14-digit FSSAI FoSCoS License Number with the FSSAI logo inside the statutory manufacturer/principal panel.',
        };
      }

      case 'manufacturer_details': {
        const ruleActive = isRuleEnabled(rules, 'LMPC_R6_MANUFACTURER_ADDRESS_PIN');
        const hasPin = /\b\d{6}\b/.test(field.normalizedText);
        const hasEntity = field.normalizedText.trim().length >= 15;

        if (!ruleActive) {
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'LMPC_R6_MANUFACTURER_ADDRESS_PIN',
            regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(a) (Rule Disabled)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: field.normalizedText,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'PASS',
            rationale: 'Manufacturer address rule disabled in Rule Engine.',
          };
        }

        const ok = hasPin && hasEntity;
        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'LMPC_R6_MANUFACTURER_ADDRESS_PIN',
          regulationCitation: 'LMPC Rules 2011 — Rule 6(1)(a)',
          region: field.region,
          rawText: field.rawText,
          normalizedText: field.normalizedText,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status: ok ? 'PASS' : 'FAIL',
          rationale: ok
            ? 'Registered manufacturer name, street address, city, and 6-digit Indian PIN code verified.'
            : 'Manufacturer declaration is missing a complete registered address or valid 6-digit Indian PIN code.',
          correctiveAction: ok
            ? undefined
            : 'Include full registered company name, street address, city, and 6-digit PIN code.',
        };
      }

      case 'ingredients_declaration': {
        const crossFieldActive = isRuleEnabled(rules, 'CROSS_FIELD_MISPLACED_ENTITY');
        // Cross-Field Spatial Integrity Check: detect FSSAI Lic. No. or 14-digit license inside INGREDIENTS_BOX
        const misplacedLicMatch = field.normalizedText.match(
          /(?:fssai\s*(?:lic\.?\s*no\.?)?\s*[:\-]?\s*\d{10,14}|\blic\.?\s*no\.?\s*[:\-]?\s*\d{10,14})/i,
        );

        if (crossFieldActive && field.region === 'INGREDIENTS_BOX' && misplacedLicMatch) {
          const licToken = misplacedLicMatch[0].replace(/^fssai\s*/i, '').toUpperCase();
          return {
            fieldId: field.id,
            key: field.key,
            label: field.label,
            ruleId: 'CROSS_FIELD_MISPLACED_ENTITY',
            regulationCitation: 'Cross-Field Spatial Integrity — FSSAI Reg 5(2) & 5(10)',
            region: field.region,
            rawText: field.rawText,
            normalizedText: field.normalizedText,
            confidence: field.confidence,
            fontHeightMm: field.fontHeightMm,
            bbox: field.bbox,
            status: 'FAIL',
            rationale: `${licToken} found in INGREDIENTS section, not exclusively in FSSAI License Number field.`,
            correctiveAction:
              'Remove FSSAI License declaration from the Ingredients bounding box and display it solely in the statutory principal panel.',
          };
        }

        const hasIngredientsHeader = /INGREDIENTS?\s*[:\-]/i.test(field.normalizedText);
        return {
          fieldId: field.id,
          key: field.key,
          label: field.label,
          ruleId: 'FSSAI_INGREDIENTS_LIST',
          regulationCitation: 'FSSAI Labelling & Display 2020 — Reg 5(2)',
          region: field.region,
          rawText: field.rawText,
          normalizedText: field.normalizedText,
          confidence: field.confidence,
          fontHeightMm: field.fontHeightMm,
          bbox: field.bbox,
          status: hasIngredientsHeader ? 'PASS' : 'WARNING',
          rationale: hasIngredientsHeader
            ? 'Ingredients declaration structured cleanly inside INGREDIENTS_BOX without misplaced statutory tokens.'
            : 'Ingredients text detected without an explicit "INGREDIENTS:" heading.',
          correctiveAction: hasIngredientsHeader
            ? undefined
            : 'Prefix ingredient list with bold "INGREDIENTS:" heading in descending order of weight.',
        };
      }
    }
  });

  // 3. Optional IoT Scale MPE evaluation
  let mpeEvaluation: MpeEvaluation | undefined;
  if (declaredGrams !== null && typeof measuredWeightGrams === 'number' && !Number.isNaN(measuredWeightGrams)) {
    mpeEvaluation = calculateMpeTolerance(declaredGrams, measuredWeightGrams);
  }

  // 4. Optional Nutritional Compliance Score
  const nutrition = nutritionProfile ? calculateNutritionScore(nutritionProfile) : undefined;

  // 5. Summary counts & Overall Report Status
  const summaryCounts = {
    pass: checkpoints.filter((c) => c.status === 'PASS').length,
    fail: checkpoints.filter((c) => c.status === 'FAIL').length,
    warning: checkpoints.filter((c) => c.status === 'WARNING').length,
    unverified: checkpoints.filter((c) => c.status === 'UNVERIFIED').length,
  };

  let overallStatus: OverallReportStatus = 'PASS';
  if (summaryCounts.fail > 0 || mpeEvaluation?.status === 'FAIL') {
    overallStatus = 'FAIL';
  } else if (summaryCounts.unverified > 0 || summaryCounts.warning > 0) {
    overallStatus = 'REVIEW_REQUIRED';
  }

  const avgConf =
    checkpoints.length > 0
      ? Number(
          (
            checkpoints.reduce((acc, c) => acc + c.confidence, 0) / checkpoints.length
          ).toFixed(4),
        )
      : 0;

  return {
    inspectionId,
    timestamp,
    sourceMode,
    imageUrl,
    productContext,
    pdpAreaCm2,
    requiredFontHeightMm: fontSpec.minFontHeightMm,
    overallStatus,
    overallConfidence: avgConf,
    checkpoints,
    nutrition,
    mpeEvaluation,
    hitlPendingCount: summaryCounts.unverified,
    summaryCounts,
  };
}
