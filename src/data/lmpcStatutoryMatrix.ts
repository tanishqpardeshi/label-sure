import matrixJson from './lmpcStatutoryMatrix.json';

export interface MpeBracket {
  bracket: string;
  min_qn: number;
  max_qn: number | null;
  tolerance_type: 'percentage' | 'fixed';
  tolerance_value: number;
  unit: string;
}

export interface SecondScheduleFontBracket {
  pdp_area_range: string;
  min_area_cm2: number;
  max_area_cm2: number | null;
  min_font_height_mm: number;
  citation: string;
}

export interface LegacyUnitMapping {
  legacy: string;
  replacement: string;
  reason: string;
}

export interface Rule6CategorySpec {
  citation: string;
  required_declarations: string[];
}

export interface LmpcStatutoryMatrix {
  schema_version: string;
  framework: string;
  rule_6_mandatory_declarations: Record<string, Rule6CategorySpec>;
  first_schedule_mpe_table: MpeBracket[];
  second_schedule_font_height_matrix: SecondScheduleFontBracket[];
  rule_12_si_units: {
    citation: string;
    permitted_si_units: string[];
    forbidden_legacy_abbreviations: LegacyUnitMapping[];
  };
  fssai_state_prefixes: Record<string, string>;
}

export const LMPC_STATUTORY_MATRIX: LmpcStatutoryMatrix =
  matrixJson as LmpcStatutoryMatrix;
