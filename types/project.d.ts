// Shared shapes for the data that crosses module boundaries. They are
// deliberately permissive (every field optional, extra fields allowed): saved
// projects come from many revisions and imports, so these document the fields
// consumers read, not a schema the data is guaranteed to satisfy.
//
// Reference them from JSDoc, for example:
//   /** @param {import('../types/project').Cable[]} cables */

/** A cable schedule row. */
export interface Cable {
  tag?: string;
  cable_id?: string;
  id?: string;
  name?: string;
  cable_type?: string;
  from_tag?: string;
  to_tag?: string;
  from?: string;
  to?: string;
  conductor_size?: string;
  conductor_material?: string;
  insulation_rating?: number | string;
  /** Rated insulation voltage (V). Not the system voltage; see operating_voltage. */
  voltage_rating?: number | string;
  /** System operating voltage (V), normalised by cableOperatingVoltage.mjs. */
  operating_voltage?: number | string;
  length?: number | string;
  /** Raceway assignment: id list, or a comma/semicolon separated string. */
  raceway_ids?: string[] | string;
  ground_size?: string;
  ocpd_rating?: number | string;
  /** Slot or compartment within a divided tray (one-based slot index). */
  slot_index?: number | string;
  zone?: number | string;
  od?: number | string;
  diameter?: number | string;
  count?: number | string;
  last_modified?: string;
}

/** A cable tray schedule row. */
export interface Tray {
  tray_id?: string;
  id?: string;
  inside_width?: number | string;
  tray_depth?: number | string;
  tray_type?: string;
  num_slots?: number | string;
  slot_groups?: unknown;
  [field: string]: unknown;
}

/** Study lifecycle state as produced by assessStudyResult(). */
export interface StudyAssessment {
  validity?: string | { state?: string };
  freshness?: 'current' | 'stale' | 'unknown' | string;
  /** True only when the result is current and eligible for reports and labels. */
  eligible?: boolean;
  resultEligibility?: string;
  calculationVersionStatus?: string;
  calculationStatus?: string | null;
  warnings?: string[];
  [field: string]: unknown;
}

/** One location's short-circuit result. */
export interface ShortCircuitResult {
  equipmentTag?: string;
  method?: string;
  threePhaseKA?: number | null;
  lineToGroundKA?: number | null;
  lineToLineKA?: number | null;
  doubleLineGroundKA?: number | null;
  calculationStatus?: string;
  requiredInputs?: string[];
  warnings?: string[];
  [field: string]: unknown;
}

/** One location's arc-flash result. Boundary and working distance are in mm. */
export interface ArcFlashResult {
  equipmentTag?: string;
  incidentEnergy?: number | null;
  boundary?: number | null;
  workingDistance?: number | null;
  calculationStatus?: string;
  requiredInputs?: string[];
  [field: string]: unknown;
}

/** A row for the bar charts in resultViz.mjs. */
export interface BarRow {
  label: string;
  value: number;
  limit?: number | null;
  /** One of pass, warn, fail, info, na (see STATUS_META in resultViz.mjs). */
  status?: string;
  badgeLabel?: string;
  valueLabel?: string;
  note?: string;
  noBadge?: boolean;
  notReady?: boolean;
  id?: string;
}

/** Readiness verdict for one chart row. `ready: false` withholds the verdict. */
export interface ChartReadiness {
  ready: boolean;
  badge?: string;
  reason?: string;
  invalid?: boolean;
}
