export type SpatialRegion =
  | 'PRODUCT_HEADER'
  | 'STATUTORY_PANEL'
  | 'DATE_BOX'
  | 'MANUFACTURER_BOX'
  | 'INGREDIENTS_BOX';

export type ComplianceStatus = 'PASS' | 'FAIL' | 'WARNING' | 'UNVERIFIED';

export type OverallReportStatus = 'PASS' | 'FAIL' | 'REVIEW_REQUIRED';

export type FieldKey =
  | 'product_name'
  | 'net_quantity'
  | 'mrp_usp'
  | 'mfd_use_by'
  | 'batch_number'
  | 'fssai_license'
  | 'manufacturer_details'
  | 'ingredients_declaration';

export interface BoundingBox {
  /** Normalized 0..1000 coordinates [x_min, y_min, x_max, y_max] */
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export interface ExtractedField {
  id: string;
  key: FieldKey;
  label: string;
  rawText: string;
  normalizedText: string;
  region: SpatialRegion;
  confidence: number; // 0.0 to 1.0
  fontHeightMm: number;
  bbox: BoundingBox;
  glareNormalized?: boolean;
  glareRawSample?: string;
}

export interface ComplianceCheckpoint {
  fieldId: string;
  key: FieldKey;
  label: string;
  ruleId: string;
  regulationCitation: string;
  region: SpatialRegion;
  rawText: string;
  normalizedText: string;
  confidence: number;
  fontHeightMm: number;
  bbox: BoundingBox;
  status: ComplianceStatus;
  rationale: string;
  correctiveAction?: string;
  glareNormalized?: boolean;
  glareRawSample?: string;
}

export interface NutritionProfile {
  servingBasis: 'per 100g' | 'per 100ml';
  energyKcal: number;
  proteinG: number;
  totalFatG: number;
  saturatedFatG: number;
  transFatG: number;
  carbohydratesG: number;
  addedSugarG: number;
  sodiumMg: number;
}

export interface NutritionAssessment {
  score: number; // 0 to 100
  grade: 'Balanced' | 'Moderate' | 'High Risk';
  insights: string[];
  profile: NutritionProfile;
}

export interface MpeEvaluation {
  declaredGrams: number;
  measuredGrams: number;
  mpeToleranceGrams: number;
  mpePercentage: number;
  minAllowedGrams: number;
  deviationGrams: number;
  status: 'PASS' | 'FAIL';
  scheduleCitation: string;
}

export interface ComplianceRule {
  ruleId: string;
  version: string;
  name: string;
  regulation: 'LMPC Rules 2011' | 'LMPC Amendment 2017' | 'LMPC Amendment 2022' | 'FSSAI Labelling & Display 2020';
  citation: string;
  targetField: FieldKey | 'CROSS_FIELD';
  category: 'All Packaged Commodities' | 'Packaged Food' | 'Cosmetics' | 'Electronics';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  enabled: boolean;
  description: string;
  parameters: Record<string, string | number | boolean | string[]>;
}

export interface ProductContext {
  brand: string;
  category: 'Packaged Food' | 'Cosmetics' | 'Electronics' | 'Beverages' | 'Household';
  countryOfOrigin: string;
  stateJurisdiction: string;
  barcode?: string;
  pdpAreaCm2?: number;
}

export interface BarcodeVerificationResult {
  found: boolean;
  source: 'openfoodfacts_live' | 'offline_catalog_fallback';
  barcode: string;
  productName: string;
  brand: string;
  netQuantity: string;
  ingredientsText: string;
  nutritionProfile?: NutritionProfile;
}

export interface PinCodeVerificationResult {
  valid: boolean;
  source: 'indiapost_live' | 'offline_directory_fallback';
  pincode: string;
  postOffice: string;
  district: string;
  state: string;
  message: string;
}

export interface FssaiDecodeResult {
  valid: boolean;
  licenseNumber: string;
  licenseType: 'Central License (Category 1)' | 'State License (Category 2)' | 'Invalid Prefix';
  stateCode: string;
  stateName: string;
  registrationYearHint?: string;
  rationale: string;
}

export interface HitlReviewItem {
  id: string;
  inspectionId: string;
  productName: string;
  fieldKey: FieldKey;
  fieldLabel: string;
  region: SpatialRegion;
  rawOcrText: string;
  suggestedText: string;
  confidence: number;
  issueType: 'Foil Glare Distortion' | 'Low Print Contrast' | 'Creased Surface' | 'Indic-English Script Mix';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  capturedAt: string;
  inspectorNote?: string;
  bbox: BoundingBox;
}

export interface InspectionReport {
  inspectionId: string;
  timestamp: string;
  sourceMode: 'golden_sample' | 'upload' | 'camera' | 'sample_preset';
  imageUrl?: string;
  productContext: ProductContext;
  pdpAreaCm2: number;
  requiredFontHeightMm: number;
  overallStatus: OverallReportStatus;
  overallConfidence: number;
  checkpoints: ComplianceCheckpoint[];
  nutrition?: NutritionAssessment;
  mpeEvaluation?: MpeEvaluation;
  hitlPendingCount: number;
  summaryCounts: {
    pass: number;
    fail: number;
    warning: number;
    unverified: number;
  };
}

export interface RegionalCityMetric {
  city: string;
  state: string;
  lat: number;
  lng: number;
  inspectionsCount: number;
  violationRatePct: number;
  criticalFails: number;
  topViolationRule: string;
  recentBatchStatus: 'Elevated Risk' | 'Moderate' | 'Compliant';
}
