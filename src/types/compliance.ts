export type SpatialRegion =
  | 'PRODUCT_HEADER'
  | 'STATUTORY_PANEL'
  | 'DATE_BOX'
  | 'MANUFACTURER_BOX'
  | 'INGREDIENTS_BOX';

export type ComplianceStatus = 'PASS' | 'FAIL' | 'WARNING' | 'UNVERIFIED';

export type OverallReportStatus = 'PASS' | 'FAIL' | 'REVIEW_REQUIRED';

export type ExtractionStatus = 'EXTRACTED' | 'MISSING' | 'AMBIGUOUS';

export type ProcessingState = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type PipelineStageId =
  | 'INTAKE'
  | 'OCR'
  | 'EXTRACTION'
  | 'RULE_SELECTION'
  | 'EVALUATION'
  | 'REPORTING';

export type PipelineStageStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';

export type PackageSideLabel =
  | 'FRONT_PDP'
  | 'BACK_STATUTORY'
  | 'SIDE_PANEL'
  | 'TOP_LID';

export type UserRole =
  | 'MANUFACTURER'
  | 'INSPECTOR'
  | 'MAINTAINER'
  | 'VISITOR';

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

export interface AnalysisImage {
  imageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sideLabel: PackageSideLabel;
  previewUrl: string;
  widthPx?: number;
  heightPx?: number;
}

export interface ExtractedField {
  id: string;
  key: FieldKey;
  label: string;
  rawText: string;
  normalizedText: string;
  region: SpatialRegion;
  extractionStatus: ExtractionStatus;
  confidence: number; // 0.0 to 1.0
  fontHeightMm: number;
  bbox: BoundingBox;
  sourceImageId?: string;
  sourceSideLabel?: PackageSideLabel;
  glareNormalized?: boolean;
  glareRawSample?: string;
  ambiguityReason?: string;
}

export interface ComplianceCheckpoint {
  fieldId: string;
  key: FieldKey;
  label: string;
  ruleId: string;
  ruleVersion: string;
  regulationCitation: string;
  region: SpatialRegion;
  extractionStatus: ExtractionStatus;
  rawText: string;
  normalizedText: string;
  confidence: number;
  fontHeightMm: number;
  bbox: BoundingBox;
  sourceImageId?: string;
  sourceSideLabel?: PackageSideLabel;
  status: ComplianceStatus;
  rationale: string;
  evaluationTrace: string;
  correctiveAction?: string;
  glareNormalized?: boolean;
  glareRawSample?: string;
}

export interface ComplianceRule {
  ruleId: string;
  version: string;
  name: string;
  regulation:
    | 'LMPC Rules 2011'
    | 'LMPC Amendment 2017'
    | 'LMPC Amendment 2022'
    | 'FSSAI Labelling & Display 2020';
  citation: string;
  targetField: FieldKey | 'CROSS_FIELD';
  category: 'All Packaged Commodities' | 'Packaged Food' | 'Cosmetics' | 'Electronics';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  enabled: boolean;
  status: 'PUBLISHED' | 'DRAFT';
  description: string;
  parameters: Record<string, string | number | boolean | string[]>;
}

export interface RuleSetVersion {
  versionId: string;
  publishedAt: string;
  publishedBy: string;
  releaseNotes: string;
  rules: ComplianceRule[];
}

export interface AuditEvent {
  eventId: string;
  actorId: string;
  actorRole: UserRole;
  action:
    | 'ANALYSIS_CREATED'
    | 'ANALYSIS_FAILED'
    | 'RULE_DRAFT_UPDATED'
    | 'RULE_SET_PUBLISHED'
    | 'HITL_ITEM_APPROVED'
    | 'HITL_ITEM_REJECTED'
    | 'ACCESS_DENIED'
    | 'ROLE_SESSION_SWITCHED';
  target: string;
  timestamp: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  details: string;
}

export interface ProductContext {
  brand: string;
  category: 'Packaged Food' | 'Cosmetics' | 'Electronics' | 'Beverages' | 'Household';
  countryOfOrigin: string;
  stateJurisdiction: string;
  pdpAreaCm2?: number;
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
  analysisId: string;
  ownerId: string;
  productName: string;
  fieldKey: FieldKey;
  fieldLabel: string;
  region: SpatialRegion;
  sourceSideLabel?: PackageSideLabel;
  rawOcrText: string;
  suggestedText: string;
  confidence: number;
  issueType:
    | 'Foil Glare Distortion'
    | 'Low Print Contrast'
    | 'Creased Surface'
    | 'Ambiguous Date Order'
    | 'Missing Mandatory Field'
    | 'Indic-English Script Mix';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  capturedAt: string;
  inspectorNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  bbox: BoundingBox;
}

export interface PipelineStageRecord {
  id: PipelineStageId;
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  status: PipelineStageStatus;
  detail: string;
  metadata?: string;
}

export interface OcrMetadata {
  engine: string;
  engineVersion: string;
  languages: string[];
  detectedRegionsCount: number;
  averageConfidence: number;
}

export interface PipelineErrorDetail {
  code: 'ERR-01' | 'ERR-02' | 'ERR-03' | 'ERR-04' | 'ERR-08';
  stage: PipelineStageId;
  message: string;
  guidance: string;
}

export interface InspectionReport {
  analysisId: string;
  ownerId: string;
  ownerRole: UserRole;
  timestamp: string;
  sourceMode: 'golden_sample' | 'upload' | 'sample_preset' | 'acceptance_fixture';
  fixtureId?: string;
  processingState: ProcessingState;
  ruleSetVersionId: string;
  images: AnalysisImage[];
  productContext: ProductContext;
  pdpAreaCm2: number;
  requiredFontHeightMm: number;
  ocrMetadata: OcrMetadata;
  selectedRuleIds: string[];
  pipelineStages: PipelineStageRecord[];
  overallStatus: OverallReportStatus;
  overallConfidence: number;
  checkpoints: ComplianceCheckpoint[];
  hitlPendingCount: number;
  summaryCounts: {
    pass: number;
    fail: number;
    warning: number;
    unverified: number;
  };
  errorDetail?: PipelineErrorDetail;
}

export interface DemoSession {
  role: UserRole;
  actorId: string;
  displayName: string;
  organization: string;
}
