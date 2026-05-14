/**
 * Hazardous Area Classification — Gap #94
 *
 * Pure calculation module. No DOM access; persistence is handled by the page
 * JS layer (hazareaclassification.js).
 *
 * Standards:
 *   NEC Article 500   — Hazardous (Classified) Locations — Classes I, II, III
 *   NEC Article 505   — Zone Classification System for Hazardous Locations
 *   NEC Article 506   — Zone 20, 21, 22 Classification for Combustible Dusts/Fibres
 *   IEC 60079-10-1:2020 — Explosive atmospheres — Area classification (flammable gas)
 *   IEC 60079-10-2:2015 — Explosive atmospheres — Area classification (combustible dust)
 *   IEC 60079-0:2017    — Equipment general requirements (equipment group, T-rating)
 *   ATEX Directive 2014/34/EU — Equipment for explosive atmospheres (EU)
 *   API RP 505-1997     — Recommended Practice for Classification of Locations for
 *                         Electrical Installations at Petroleum Facilities
 *
 * Module overview
 * ───────────────
 * 1. Constants / lookup tables  — classes, divisions, zones, groups, T-ratings
 * 2. classifyArea()             — validate and normalise a classified area descriptor
 * 3. checkEquipmentCompatibility() — verify Ex protection type / group / T-class
 * 4. checkAllEquipment()        — batch check all equipment against their areas
 * 5. classificationReport()     — aggregate summary for reporting
 * 6. runHazAreaStudy()          — unified entry point with input validation
 *
 * Data model
 * ──────────
 * HazArea  { id, label, standard, necClass, necDivision, iecZone, dustZone,
 *            gasGroup, dustGroup, tRating }
 * Equipment { id, label, hazAreaId, exProtection, exGroup, tRating, certNumber }
 */

// ---------------------------------------------------------------------------
// NEC Class / Division system (Articles 500-502)
// ---------------------------------------------------------------------------

/**
 * NEC hazardous location classes.
 * Class I  — flammable gases or vapours
 * Class II — combustible dust
 * Class III — ignitable fibres / flyings
 */
export const NEC_CLASSES = Object.freeze([
  { value: 'I',   label: 'Class I — Flammable Gases / Vapours' },
  { value: 'II',  label: 'Class II — Combustible Dust' },
  { value: 'III', label: 'Class III — Ignitable Fibres / Flyings' },
]);

/**
 * NEC Divisions.
 * Division 1 — hazardous material present under normal operating conditions
 * Division 2 — hazardous material present only under abnormal conditions
 */
export const NEC_DIVISIONS = Object.freeze([
  { value: '1', label: 'Division 1 — Normal conditions' },
  { value: '2', label: 'Division 2 — Abnormal conditions' },
]);

/**
 * NEC Article 500 gas / vapour groups (Class I).
 * Groups are ordered A (most severe) → D (least severe).
 */
export const NEC_GAS_GROUPS = Object.freeze([
  { value: 'A', label: 'Group A — Acetylene' },
  { value: 'B', label: 'Group B — Hydrogen, Ethylene Oxide, etc.' },
  { value: 'C', label: 'Group C — Ethylene, Diethyl Ether, etc.' },
  { value: 'D', label: 'Group D — Acetone, Ammonia, Propane, etc.' },
]);

/**
 * NEC Article 500 dust groups (Class II).
 */
export const NEC_DUST_GROUPS = Object.freeze([
  { value: 'E', label: 'Group E — Metal Dust (conductive)' },
  { value: 'F', label: 'Group F — Carbon Black / Coal Dust' },
  { value: 'G', label: 'Group G — Grain, Flour, Wood Dust, etc.' },
]);

// ---------------------------------------------------------------------------
// IEC / NEC Article 505 Zone system (Class I, Zones 0/1/2)
// ---------------------------------------------------------------------------

/**
 * IEC 60079-10-1 / NEC 505 gas/vapour zones.
 * Zone 0 — explosive atmosphere present continuously or for long periods
 * Zone 1 — explosive atmosphere likely under normal operation
 * Zone 2 — explosive atmosphere unlikely under normal operation; only briefly
 */
export const IEC_GAS_ZONES = Object.freeze([
  { value: '0', label: 'Zone 0 — Continuous' },
  { value: '1', label: 'Zone 1 — Likely (normal operation)' },
  { value: '2', label: 'Zone 2 — Unlikely (abnormal only)' },
]);

/**
 * IEC 60079-10-2 / NEC 506 dust zones.
 * Zone 20 — combustible dust present continuously or for long periods
 * Zone 21 — combustible dust likely under normal operation
 * Zone 22 — combustible dust unlikely; only briefly
 */
export const IEC_DUST_ZONES = Object.freeze([
  { value: '20', label: 'Zone 20 — Continuous (dust)' },
  { value: '21', label: 'Zone 21 — Likely (dust, normal operation)' },
  { value: '22', label: 'Zone 22 — Unlikely (dust, abnormal only)' },
]);

/**
 * IEC equipment groups (IEC 60079-0 §5.1).
 * Group I   — mines susceptible to firedamp
 * Group II  — all other surface industries (A/B/C subgroups by gas type)
 * Group III — combustible dust (A/B/C subgroups by dust type)
 */
export const IEC_EQUIPMENT_GROUPS = Object.freeze([
  { value: 'I',    label: 'Group I — Mining (firedamp)' },
  { value: 'IIA',  label: 'Group IIA — Propane / low-hazard gases' },
  { value: 'IIB',  label: 'Group IIB — Ethylene / medium-hazard gases' },
  { value: 'IIC',  label: 'Group IIC — Hydrogen / acetylene (highest hazard)' },
  { value: 'IIIA', label: 'Group IIIA — Flyings (conductive fibres)' },
  { value: 'IIIB', label: 'Group IIIB — Non-conductive dust' },
  { value: 'IIIC', label: 'Group IIIC — Conductive dust (highest hazard)' },
]);

/**
 * IEC 60079-0 temperature classes (maximum surface temperature).
 * T1 (450 °C) → T6 (85 °C).  Higher T-number = lower surface temperature = safer.
 */
export const T_RATINGS = Object.freeze([
  { value: 'T1', label: 'T1 — 450 °C', maxTempC: 450 },
  { value: 'T2', label: 'T2 — 300 °C', maxTempC: 300 },
  { value: 'T3', label: 'T3 — 200 °C', maxTempC: 200 },
  { value: 'T4', label: 'T4 — 135 °C', maxTempC: 135 },
  { value: 'T5', label: 'T5 — 100 °C', maxTempC: 100 },
  { value: 'T6', label: 'T6 —  85 °C', maxTempC:  85 },
]);

/**
 * IEC 60079 Ex protection types (IEC 60079-0, Table 1).
 * Each protection type is permitted in specific zones.
 */
export const EX_PROTECTION_TYPES = Object.freeze([
  { value: 'd',   label: 'Ex d — Flameproof enclosure',           zones: ['0','1','2'], dustZones: [] },
  { value: 'e',   label: 'Ex e — Increased safety',               zones: ['1','2'],     dustZones: [] },
  { value: 'ia',  label: 'Ex ia — Intrinsic safety (Cat ia)',      zones: ['0','1','2'], dustZones: ['20','21','22'] },
  { value: 'ib',  label: 'Ex ib — Intrinsic safety (Cat ib)',      zones: ['1','2'],     dustZones: ['21','22'] },
  { value: 'ic',  label: 'Ex ic — Intrinsic safety (Cat ic)',      zones: ['2'],         dustZones: ['22'] },
  { value: 'ma',  label: 'Ex ma — Encapsulation (Cat a)',          zones: ['0','1','2'], dustZones: ['20','21','22'] },
  { value: 'mb',  label: 'Ex mb — Encapsulation (Cat b)',          zones: ['1','2'],     dustZones: ['21','22'] },
  { value: 'n',   label: 'Ex n — Non-sparking (Zone 2 only)',      zones: ['2'],         dustZones: [] },
  { value: 'nA',  label: 'Ex nA — Non-sparking (Zone 2)',          zones: ['2'],         dustZones: [] },
  { value: 'nC',  label: 'Ex nC — Sparking parts (Zone 2)',        zones: ['2'],         dustZones: [] },
  { value: 'o',   label: 'Ex o — Oil immersion',                   zones: ['1','2'],     dustZones: [] },
  { value: 'p',   label: 'Ex p — Pressurization',                  zones: ['1','2'],     dustZones: [] },
  { value: 'px',  label: 'Ex px — Pressurized (Zone 1/21)',        zones: ['1','2'],     dustZones: ['21','22'] },
  { value: 'py',  label: 'Ex py — Pressurized (Zone 2 only)',      zones: ['2'],         dustZones: [] },
  { value: 'q',   label: 'Ex q — Powder filling',                  zones: ['1','2'],     dustZones: [] },
  { value: 't',   label: 'Ex t — Dust ignition-proof enclosure',   zones: [],            dustZones: ['20','21','22'] },
  { value: 'ta',  label: 'Ex ta — Dust enclosure (Cat 1)',         zones: [],            dustZones: ['20','21','22'] },
  { value: 'tb',  label: 'Ex tb — Dust enclosure (Cat 2)',         zones: [],            dustZones: ['21','22'] },
  { value: 'tc',  label: 'Ex tc — Dust enclosure (Cat 3)',         zones: [],            dustZones: ['22'] },
]);

/**
 * NEC Division-to-IEC-Zone equivalence mapping (NEC Table 505.7(A)).
 * Used when checking NEC Division equipment against IEC zone designations.
 */
export const NEC_DIV_TO_IEC_ZONE = Object.freeze({
  'I-1': ['0', '1'],  // Class I Div 1 ≈ Zone 0 + Zone 1
  'I-2': ['2'],       // Class I Div 2 ≈ Zone 2
  'II-1': ['20', '21'], // Class II Div 1 ≈ Zone 20 + Zone 21
  'II-2': ['22'],       // Class II Div 2 ≈ Zone 22
});

// ---------------------------------------------------------------------------
// IEC equipment group vs. gas group compatibility
// (IEC 60079-0 §5.1 — higher group covers lower groups)
// ---------------------------------------------------------------------------

/** Gas-group hazard ranking: higher index = more hazardous. */
const GAS_GROUP_RANK = { IIA: 0, IIB: 1, IIC: 2 };
/** NEC gas group to IEC subgroup equivalent (approximate mapping). */
const NEC_GAS_TO_IEC = Object.freeze({ A: 'IIC', B: 'IIC', C: 'IIB', D: 'IIA' });
/** NEC dust group to IEC subgroup equivalent. */
const NEC_DUST_TO_IEC_III = Object.freeze({ E: 'IIIC', F: 'IIIB', G: 'IIIA' });

export const DEFAULT_HAZAREA_LAYOUT = Object.freeze({
  widthFt: 80,
  heightFt: 50,
  gridFt: 10,
  elevationFt: 20
});

const HAZAREA_COLORS = Object.freeze({
  severe: Object.freeze({ fill: '#fca5a5', stroke: '#b91c1c', label: 'Zone 0/20 or Div 1' }),
  elevated: Object.freeze({ fill: '#fdba74', stroke: '#c2410c', label: 'Zone 1/21' }),
  moderate: Object.freeze({ fill: '#fde68a', stroke: '#b45309', label: 'Zone 2/22 or Div 2' }),
  general: Object.freeze({ fill: '#bfdbfe', stroke: '#1d4ed8', label: 'Classified area' })
});

const MARKER_COLORS = Object.freeze({
  PASS: '#16a34a',
  FAIL: '#dc2626',
  WARN: '#d97706',
  INFO: '#2563eb'
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function roundFt(value) {
  return Number(Number(value).toFixed(3));
}

export function normalizeHazAreaLayout(layout = {}) {
  const widthFt = finitePositive(layout.widthFt, DEFAULT_HAZAREA_LAYOUT.widthFt);
  const heightFt = finitePositive(layout.heightFt, DEFAULT_HAZAREA_LAYOUT.heightFt);
  const elevationFt = finitePositive(layout.elevationFt, DEFAULT_HAZAREA_LAYOUT.elevationFt);
  const maxGrid = Math.max(1, Math.min(widthFt, heightFt));
  const gridFt = clamp(finitePositive(layout.gridFt, DEFAULT_HAZAREA_LAYOUT.gridFt), 1, maxGrid);

  return {
    widthFt: roundFt(widthFt),
    heightFt: roundFt(heightFt),
    gridFt: roundFt(gridFt),
    elevationFt: roundFt(elevationFt)
  };
}

export function defaultHazAreaGeometry(index = 0, layoutInput = {}, totalAreas = 1) {
  const layout = normalizeHazAreaLayout(layoutInput);
  const count = Math.max(1, totalAreas);
  const aspect = layout.widthFt / layout.heightFt;
  const columns = count === 1 ? 1 : Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const cellWidth = layout.widthFt / columns;
  const cellHeight = layout.heightFt / rows;
  const xFt = (column + 0.5) * cellWidth;
  const yFt = layout.heightFt - ((row + 0.5) * cellHeight);
  const radiusFt = Math.max(3, Math.min(cellWidth, cellHeight) * 0.28);

  return {
    shape: 'circle',
    xFt: roundFt(xFt),
    yFt: roundFt(yFt),
    radiusFt: roundFt(radiusFt),
    zMinFt: 0,
    zMaxFt: roundFt(layout.elevationFt)
  };
}

function normalizeHazAreaGeometry(area = {}, index = 0, layoutInput = {}, totalAreas = 1) {
  const layout = normalizeHazAreaLayout(layoutInput);
  const fallback = defaultHazAreaGeometry(index, layout, totalAreas);
  const rawGeometry = area.geometry && typeof area.geometry === 'object' ? area.geometry : {};
  const shape = rawGeometry.shape === 'rect' ? 'rect' : 'circle';
  const xFt = clamp(finiteNumber(rawGeometry.xFt, fallback.xFt), 0, layout.widthFt);
  const yFt = clamp(finiteNumber(rawGeometry.yFt, fallback.yFt), 0, layout.heightFt);
  const zMinInput = finiteNumber(rawGeometry.zMinFt, fallback.zMinFt);
  const zMaxInput = finiteNumber(rawGeometry.zMaxFt, fallback.zMaxFt);
  const zLow = clamp(Math.min(zMinInput, zMaxInput), 0, layout.elevationFt);
  const zHigh = clamp(Math.max(zMinInput, zMaxInput), 0, layout.elevationFt);
  const zMinFt = roundFt(zLow);
  const zMaxFt = roundFt(zHigh === zLow ? clamp(zLow + 1, 0, layout.elevationFt) : zHigh);

  if (shape === 'rect') {
    const fallbackWidth = Math.max(6, Math.min(layout.widthFt * 0.25, fallback.radiusFt * 2));
    const fallbackHeight = Math.max(6, Math.min(layout.heightFt * 0.3, fallback.radiusFt * 2));
    const widthFt = clamp(finitePositive(rawGeometry.widthFt, fallbackWidth), 1, layout.widthFt);
    const heightFt = clamp(finitePositive(rawGeometry.heightFt, fallbackHeight), 1, layout.heightFt);

    return {
      shape,
      xFt: roundFt(xFt),
      yFt: roundFt(yFt),
      widthFt: roundFt(widthFt),
      heightFt: roundFt(heightFt),
      zMinFt,
      zMaxFt
    };
  }

  const radiusFt = clamp(finitePositive(rawGeometry.radiusFt, fallback.radiusFt), 1, Math.max(layout.widthFt, layout.heightFt));

  return {
    shape,
    xFt: roundFt(xFt),
    yFt: roundFt(yFt),
    radiusFt: roundFt(radiusFt),
    zMinFt,
    zMaxFt
  };
}

export function defaultHazEquipmentPosition(equipment = {}, areaGeometry = null, layoutInput = {}) {
  const layout = normalizeHazAreaLayout(layoutInput);
  const fallbackX = areaGeometry ? areaGeometry.xFt : layout.widthFt / 2;
  const fallbackY = areaGeometry ? areaGeometry.yFt : layout.heightFt / 2;
  const fallbackZ = areaGeometry && Number.isFinite(areaGeometry.zMinFt) && Number.isFinite(areaGeometry.zMaxFt)
    ? (areaGeometry.zMinFt + areaGeometry.zMaxFt) / 2
    : 0;

  return {
    xFt: roundFt(finiteNumber(equipment.xFt, fallbackX)),
    yFt: roundFt(finiteNumber(equipment.yFt, fallbackY)),
    zFt: roundFt(finiteNumber(equipment.zFt, fallbackZ))
  };
}

export function pointInHazAreaGeometry(point = {}, geometry = null) {
  if (!geometry) return false;
  const xFt = finiteNumber(point.xFt, Number.NaN);
  const yFt = finiteNumber(point.yFt, Number.NaN);
  if (!Number.isFinite(xFt) || !Number.isFinite(yFt)) return false;
  const zFt = finiteNumber(point.zFt, Number.NaN);
  if (Number.isFinite(zFt) && (zFt < geometry.zMinFt || zFt > geometry.zMaxFt)) return false;

  if (geometry.shape === 'rect') {
    return Math.abs(xFt - geometry.xFt) <= geometry.widthFt / 2
      && Math.abs(yFt - geometry.yFt) <= geometry.heightFt / 2;
  }

  const radiusFt = finitePositive(geometry.radiusFt, 0);
  const dx = xFt - geometry.xFt;
  const dy = yFt - geometry.yFt;
  return Math.sqrt((dx * dx) + (dy * dy)) <= radiusFt;
}

function areaVisual(area = {}) {
  const iecZone = area.iecZone || area.dustZone;
  if (iecZone === '0' || iecZone === '20') return HAZAREA_COLORS.severe;
  if (iecZone === '1' || iecZone === '21') return HAZAREA_COLORS.elevated;
  if (iecZone === '2' || iecZone === '22') return HAZAREA_COLORS.moderate;
  if (area.necDivision === '1') return HAZAREA_COLORS.severe;
  if (area.necDivision === '2') return HAZAREA_COLORS.moderate;
  return HAZAREA_COLORS.general;
}

function equipmentMapStatus(checkRow, geometryWarnings = []) {
  if (!checkRow) {
    return geometryWarnings.length ? 'WARN' : 'INFO';
  }

  if (checkRow.pass === false) return 'FAIL';
  if (checkRow.pass === null) return 'WARN';
  if ((checkRow.warnings || []).length || geometryWarnings.length) return 'WARN';
  return 'PASS';
}

function markerShape(status) {
  if (status === 'FAIL') return 'diamond';
  if (status === 'WARN') return 'triangle';
  if (status === 'PASS') return 'circle';
  return 'square';
}

export function buildHazAreaMapModel(inputs = {}, result = null) {
  const sourceInputs = result && result._inputs ? result._inputs : inputs;
  const layout = normalizeHazAreaLayout(sourceInputs.layout || {});
  const rawAreas = Array.isArray(sourceInputs.areas) ? sourceInputs.areas : [];
  const rawEquipment = Array.isArray(sourceInputs.equipment) ? sourceInputs.equipment : [];
  const resultAreas = new Map((result && Array.isArray(result.areas) ? result.areas : []).map((area) => [area.id, area]));
  const resultEquipment = new Map((result && Array.isArray(result.equipment) ? result.equipment : []).map((equipment) => [equipment.equipId, equipment]));

  const areas = rawAreas.map((area, index) => {
    const classified = classifyArea(area);
    const normalizedArea = classified.valid ? classified.area : area;
    const reportArea = resultAreas.get(area.id);
    const geometry = normalizeHazAreaGeometry(area, index, layout, rawAreas.length);
    const visual = areaVisual(normalizedArea);

    return {
      id: area.id || `area-${index + 1}`,
      label: area.label || 'Classified Area',
      standard: normalizedArea.standard || area.standard || 'IEC',
      designation: reportArea ? reportArea.designation : _areaDesignation(normalizedArea),
      gasGroup: normalizedArea.gasGroup || normalizedArea.dustGroup || '',
      tRating: normalizedArea.tRating || '',
      status: reportArea ? reportArea.status : 'INFO',
      equipCount: reportArea ? reportArea.equipCount : 0,
      geometry,
      fill: visual.fill,
      stroke: visual.stroke,
      severityLabel: visual.label
    };
  });

  const areaById = new Map(areas.map((area) => [area.id, area]));
  const equipment = rawEquipment.map((equipmentItem, index) => {
    const assignedArea = areaById.get(equipmentItem.hazAreaId);
    const position = defaultHazEquipmentPosition(equipmentItem, assignedArea ? assignedArea.geometry : null, layout);
    const checkRow = resultEquipment.get(equipmentItem.id);
    const geometryWarnings = [];

    if (position.xFt < 0 || position.xFt > layout.widthFt
      || position.yFt < 0 || position.yFt > layout.heightFt
      || position.zFt < 0 || position.zFt > layout.elevationFt) {
      geometryWarnings.push('Equipment position is outside the facility volume.');
    }

    if (assignedArea && !pointInHazAreaGeometry(position, assignedArea.geometry)) {
      geometryWarnings.push(`Equipment position is outside assigned area ${assignedArea.id}.`);
    }

    if (!assignedArea && equipmentItem.hazAreaId) {
      geometryWarnings.push(`Assigned area ${equipmentItem.hazAreaId} is not defined.`);
    }

    const status = equipmentMapStatus(checkRow, geometryWarnings);
    const failures = checkRow ? checkRow.failures || [] : [];
    const warnings = checkRow ? checkRow.warnings || [] : [];

    return {
      id: equipmentItem.id || `equip-${index + 1}`,
      label: equipmentItem.label || 'Equipment',
      hazAreaId: equipmentItem.hazAreaId || '',
      status,
      color: MARKER_COLORS[status],
      marker: markerShape(status),
      position,
      failures,
      warnings,
      geometryWarnings,
      issueCount: failures.length + warnings.length + geometryWarnings.length
    };
  });

  const summary = equipment.reduce((acc, item) => {
    if (item.status === 'PASS') acc.pass += 1;
    else if (item.status === 'FAIL') acc.fail += 1;
    else if (item.status === 'WARN') acc.warn += 1;
    else acc.info += 1;
    return acc;
  }, { areas: areas.length, equipment: equipment.length, pass: 0, fail: 0, warn: 0, info: 0 });

  summary.status = summary.fail ? 'FAIL' : summary.warn ? 'WARN' : 'PASS';

  return {
    layout,
    areas,
    equipment,
    summary,
    legend: [
      { label: HAZAREA_COLORS.severe.label, fill: HAZAREA_COLORS.severe.fill, stroke: HAZAREA_COLORS.severe.stroke },
      { label: HAZAREA_COLORS.elevated.label, fill: HAZAREA_COLORS.elevated.fill, stroke: HAZAREA_COLORS.elevated.stroke },
      { label: HAZAREA_COLORS.moderate.label, fill: HAZAREA_COLORS.moderate.fill, stroke: HAZAREA_COLORS.moderate.stroke },
      { label: 'Pass equipment', color: MARKER_COLORS.PASS, marker: 'circle' },
      { label: 'Fail equipment', color: MARKER_COLORS.FAIL, marker: 'diamond' },
      { label: 'Warning equipment', color: MARKER_COLORS.WARN, marker: 'triangle' },
      { label: 'Unchecked equipment', color: MARKER_COLORS.INFO, marker: 'square' }
    ]
  };
}

// ---------------------------------------------------------------------------
// 1. classifyArea — validate and normalise an area descriptor
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a hazardous area descriptor.
 *
 * Accepts either NEC (class + division) or IEC (zone) designation.
 * Returns a normalised object with both representations populated where
 * unambiguous equivalents exist.
 *
 * @param {object} area
 * @param {'NEC'|'IEC'} area.standard
 * @param {'I'|'II'|'III'|''} [area.necClass]
 * @param {'1'|'2'|''} [area.necDivision]
 * @param {'0'|'1'|'2'|''} [area.iecZone]
 * @param {'20'|'21'|'22'|''} [area.dustZone]
 * @param {string} [area.gasGroup]  — NEC: A-D; IEC: IIA/IIB/IIC
 * @param {string} [area.dustGroup] — NEC: E/F/G; IEC: IIIA/IIIB/IIIC
 * @param {string} [area.tRating]   — T1–T6 minimum temperature class required
 * @returns {{ valid: boolean, errors: string[], area: object }}
 */
export function classifyArea(area) {
  const errors = [];
  const norm = { ...area };

  if (!['NEC', 'IEC'].includes(area.standard)) {
    errors.push('standard must be "NEC" or "IEC"');
  }

  if (area.standard === 'NEC') {
    if (!['I', 'II', 'III'].includes(area.necClass)) {
      errors.push('necClass must be I, II, or III for NEC areas');
    }
    if (!['1', '2'].includes(area.necDivision)) {
      errors.push('necDivision must be 1 or 2 for NEC areas');
    }
    if (area.necClass === 'I' && area.gasGroup &&
        !NEC_GAS_GROUPS.map(g => g.value).includes(area.gasGroup)) {
      errors.push(`gasGroup "${area.gasGroup}" is not a valid NEC Class I group (A–D)`);
    }
    if (area.necClass === 'II' && area.dustGroup &&
        !NEC_DUST_GROUPS.map(g => g.value).includes(area.dustGroup)) {
      errors.push(`dustGroup "${area.dustGroup}" is not a valid NEC Class II group (E–G)`);
    }
    // Populate equivalent IEC zone for informational display
    const key = `${area.necClass}-${area.necDivision}`;
    if (NEC_DIV_TO_IEC_ZONE[key]) {
      norm._iecZoneEquiv = NEC_DIV_TO_IEC_ZONE[key];
    }
  }

  if (area.standard === 'IEC') {
    const gasZoneValues = IEC_GAS_ZONES.map(z => z.value);
    const dustZoneValues = IEC_DUST_ZONES.map(z => z.value);
    const hasGas  = area.iecZone  && gasZoneValues.includes(area.iecZone);
    const hasDust = area.dustZone && dustZoneValues.includes(area.dustZone);

    if (!hasGas && !hasDust) {
      errors.push('IEC area must specify iecZone (0/1/2) or dustZone (20/21/22)');
    }
    if (area.iecZone && !hasGas) {
      errors.push(`iecZone "${area.iecZone}" is invalid; must be 0, 1, or 2`);
    }
    if (area.dustZone && !hasDust) {
      errors.push(`dustZone "${area.dustZone}" is invalid; must be 20, 21, or 22`);
    }
    if (area.gasGroup && !IEC_EQUIPMENT_GROUPS.map(g => g.value).includes(area.gasGroup)) {
      errors.push(`gasGroup "${area.gasGroup}" is invalid for IEC`);
    }
  }

  if (area.tRating && !T_RATINGS.map(t => t.value).includes(area.tRating)) {
    errors.push(`tRating "${area.tRating}" is invalid; must be T1–T6`);
  }

  return { valid: errors.length === 0, errors, area: norm };
}

// ---------------------------------------------------------------------------
// 2. checkEquipmentCompatibility
// ---------------------------------------------------------------------------

/**
 * Check whether a single piece of equipment is compatible with its assigned
 * hazardous area.
 *
 * Checks:
 *   a) Ex protection type is rated for the area zone / division
 *   b) Equipment group covers the area gas/dust group
 *   c) T-rating (max surface temperature) is adequate for the area
 *
 * @param {object} equip
 * @param {string} equip.id
 * @param {string} equip.label
 * @param {string} [equip.exProtection]  — e.g. 'd', 'e', 'ia'
 * @param {string} [equip.exGroup]       — e.g. 'IIB', 'IIIC'
 * @param {string} [equip.tRating]       — e.g. 'T3'
 * @param {string} [equip.certNumber]    — ATEX/IECEx cert reference
 * @param {object} area                  — normalised HazArea (from classifyArea)
 * @returns {{ pass: boolean, warnings: string[], failures: string[] }}
 */
export function checkEquipmentCompatibility(equip, area) {
  const warnings = [];
  const failures = [];

  if (!equip.exProtection) {
    warnings.push(`${equip.label}: No Ex protection type declared — cannot verify suitability`);
    return { pass: false, warnings, failures };
  }

  const protDef = EX_PROTECTION_TYPES.find(p => p.value === equip.exProtection);
  if (!protDef) {
    failures.push(`${equip.label}: Unknown Ex protection type "${equip.exProtection}"`);
    return { pass: false, warnings, failures };
  }

  // --- Zone / Division check ------------------------------------------------
  if (area.standard === 'IEC') {
    if (area.iecZone && !protDef.zones.includes(area.iecZone)) {
      failures.push(
        `${equip.label}: Ex ${equip.exProtection} is NOT rated for Zone ${area.iecZone} ` +
        `(permitted zones: ${protDef.zones.join(', ') || 'none'})`
      );
    }
    if (area.dustZone && !protDef.dustZones.includes(area.dustZone)) {
      failures.push(
        `${equip.label}: Ex ${equip.exProtection} is NOT rated for Zone ${area.dustZone} ` +
        `(permitted dust zones: ${protDef.dustZones.join(', ') || 'none'})`
      );
    }
  }

  if (area.standard === 'NEC') {
    // Map NEC division to equivalent IEC zones and check protection type
    const key = `${area.necClass}-${area.necDivision}`;
    const equivZones = NEC_DIV_TO_IEC_ZONE[key] || [];
    // Check if equipment's zone coverage overlaps the required equivalent zones
    const gasZones  = equivZones.filter(z => ['0','1','2'].includes(z));
    const dustZones = equivZones.filter(z => ['20','21','22'].includes(z));

    if (gasZones.length > 0) {
      const mostSevere = gasZones.sort()[0]; // '0' < '1' < '2'
      if (!protDef.zones.includes(mostSevere)) {
        failures.push(
          `${equip.label}: Ex ${equip.exProtection} is NOT suitable for NEC Class ${area.necClass} ` +
          `Division ${area.necDivision} (requires Zone ${mostSevere} coverage)`
        );
      }
    }
    if (dustZones.length > 0 && (area.necClass === 'II' || area.necClass === 'III')) {
      const mostSevere = dustZones.sort()[0];
      if (!protDef.dustZones.includes(mostSevere)) {
        failures.push(
          `${equip.label}: Ex ${equip.exProtection} is NOT suitable for NEC Class ${area.necClass} ` +
          `Division ${area.necDivision} (requires dust Zone ${mostSevere} coverage)`
        );
      }
    }
  }

  // --- Equipment group check ------------------------------------------------
  if (equip.exGroup && (area.gasGroup || area.dustGroup)) {
    const areaGroup = area.gasGroup || area.dustGroup;

    // IEC group hierarchy: IIC covers IIB and IIA; IIIC covers IIIB and IIIA
    if (['IIA','IIB','IIC'].includes(equip.exGroup) &&
        ['IIA','IIB','IIC'].includes(areaGroup)) {
      if (GAS_GROUP_RANK[equip.exGroup] < GAS_GROUP_RANK[areaGroup]) {
        failures.push(
          `${equip.label}: Equipment group ${equip.exGroup} does NOT cover area gas group ` +
          `${areaGroup} (need ${areaGroup} or higher)`
        );
      }
    }

    // NEC gas group: map to IEC equivalent then check
    if (['A','B','C','D'].includes(areaGroup)) {
      const iecEquiv = NEC_GAS_TO_IEC[areaGroup];
      if (['IIA','IIB','IIC'].includes(equip.exGroup) &&
          GAS_GROUP_RANK[equip.exGroup] < GAS_GROUP_RANK[iecEquiv]) {
        failures.push(
          `${equip.label}: Equipment group ${equip.exGroup} does NOT cover NEC Group ${areaGroup} ` +
          `(requires IEC equiv. ${iecEquiv} or higher)`
        );
      }
    }

    // NEC dust group
    if (['E','F','G'].includes(areaGroup) && equip.exGroup) {
      const iecEquiv = NEC_DUST_TO_IEC_III[areaGroup] || 'IIIC';
      const dustRank = { IIIA: 0, IIIB: 1, IIIC: 2 };
      if (dustRank[equip.exGroup] !== undefined &&
          dustRank[equip.exGroup] < dustRank[iecEquiv]) {
        failures.push(
          `${equip.label}: Equipment group ${equip.exGroup} does NOT cover NEC Group ${areaGroup} ` +
          `(requires IEC equiv. ${iecEquiv} or higher)`
        );
      }
    }
  }

  // --- T-rating check -------------------------------------------------------
  if (area.tRating && equip.tRating) {
    const areaT  = T_RATINGS.find(t => t.value === area.tRating);
    const equipT = T_RATINGS.find(t => t.value === equip.tRating);
    if (areaT && equipT && equipT.maxTempC > areaT.maxTempC) {
      failures.push(
        `${equip.label}: T-rating ${equip.tRating} (${equipT.maxTempC} °C max surface) ` +
        `exceeds area requirement ${area.tRating} (${areaT.maxTempC} °C max); upgrade required`
      );
    }
  } else if (area.tRating && !equip.tRating) {
    warnings.push(`${equip.label}: No T-rating declared; area requires ${area.tRating} or better`);
  }

  if (!equip.certNumber) {
    warnings.push(`${equip.label}: No ATEX/IECEx certificate number on record`);
  }

  return {
    pass: failures.length === 0,
    warnings,
    failures,
  };
}

// ---------------------------------------------------------------------------
// 3. checkAllEquipment — batch check
// ---------------------------------------------------------------------------

/**
 * Check all equipment items against the hazardous areas they are assigned to.
 *
 * @param {object[]} equipmentList  — array of equipment descriptors
 * @param {object[]} areas          — array of normalised area descriptors
 * @returns {{ results: object[], passCount: number, failCount: number, warnCount: number }}
 */
export function checkAllEquipment(equipmentList, areas) {
  const areaMap = Object.fromEntries(areas.map(a => [a.id, a]));
  const results = [];
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const equip of equipmentList) {
    const area = areaMap[equip.hazAreaId];
    if (!area) {
      results.push({
        equipId:  equip.id,
        label:    equip.label,
        areaId:   equip.hazAreaId,
        pass:     null,
        warnings: [`Area ID "${equip.hazAreaId}" not found — equipment not checked`],
        failures: [],
      });
      warnCount++;
      continue;
    }

    const { pass, warnings, failures } = checkEquipmentCompatibility(equip, area);
    results.push({
      equipId:    equip.id,
      label:      equip.label,
      areaId:     equip.hazAreaId,
      areaLabel:  area.label || area.id,
      pass,
      warnings,
      failures,
    });
    if (pass) passCount++; else failCount++;
    if (warnings.length > 0) warnCount++;
  }

  return { results, passCount, failCount, warnCount };
}

// ---------------------------------------------------------------------------
// 4. classificationReport — aggregate summary
// ---------------------------------------------------------------------------

/**
 * Build a structured classification report for the full study.
 *
 * @param {object[]} areas       — normalised area descriptors
 * @param {object[]} equipment   — equipment items
 * @param {object}  checkResult  — output of checkAllEquipment()
 * @returns {object}  report object ready for serialisation / PDF rendering
 */
export function classificationReport(areas, equipment, checkResult) {
  const areaRows = areas.map(area => {
    const areaEquip = equipment.filter(e => e.hazAreaId === area.id);
    const areaResults = checkResult.results.filter(r => r.areaId === area.id);
    const failedInArea = areaResults.filter(r => r.pass === false).length;
    const passedInArea = areaResults.filter(r => r.pass === true).length;

    return {
      id:           area.id,
      label:        area.label || area.id,
      standard:     area.standard,
      necClass:     area.necClass || '',
      necDivision:  area.necDivision || '',
      iecZone:      area.iecZone || '',
      dustZone:     area.dustZone || '',
      designation:  _areaDesignation(area),
      gasGroup:     area.gasGroup || area.dustGroup || '—',
      tRating:      area.tRating || '—',
      geometry:     area.geometry || null,
      equipCount:   areaEquip.length,
      passCount:    passedInArea,
      failCount:    failedInArea,
      status:       failedInArea > 0 ? 'FAIL' : (passedInArea > 0 ? 'PASS' : 'INFO'),
    };
  });

  return {
    areas:        areaRows,
    equipment:    checkResult.results,
    summary: {
      totalAreas:     areas.length,
      totalEquipment: equipment.length,
      passCount:      checkResult.passCount,
      failCount:      checkResult.failCount,
      warnCount:      checkResult.warnCount,
      status:         checkResult.failCount > 0 ? 'FAIL'
                    : checkResult.warnCount > 0  ? 'WARN'
                    : 'PASS',
    },
  };
}

/** Format a short human-readable designation string for an area. */
function _areaDesignation(area) {
  if (area.standard === 'NEC') {
    return `Class ${area.necClass} Div ${area.necDivision}`;
  }
  if (area.iecZone)  return `Zone ${area.iecZone}`;
  if (area.dustZone) return `Zone ${area.dustZone}`;
  return '—';
}

// ---------------------------------------------------------------------------
// 5. runHazAreaStudy — unified entry point
// ---------------------------------------------------------------------------

/**
 * Run the full hazardous area classification study.
 *
 * @param {object} inputs
 * @param {object[]} inputs.areas      — raw area descriptors (pre-validation)
 * @param {object[]} inputs.equipment  — equipment descriptors
 * @returns {{ valid: boolean, errors: string[], result: object|null }}
 */
export function runHazAreaStudy(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    return { valid: false, errors: ['inputs must be an object'], result: null };
  }

  const areas      = Array.isArray(inputs.areas)     ? inputs.areas     : [];
  const equipment  = Array.isArray(inputs.equipment) ? inputs.equipment : [];
  const globalErrors = [];

  if (areas.length === 0) {
    return { valid: false, errors: ['At least one classified area is required'], result: null };
  }

  // Validate and normalise each area
  const normAreas = [];
  for (const area of areas) {
    const { valid, errors, area: norm } = classifyArea(area);
    if (!valid) {
      globalErrors.push(...errors.map(e => `Area "${area.label || area.id}": ${e}`));
    } else {
      normAreas.push(norm);
    }
  }

  if (globalErrors.length > 0) {
    return { valid: false, errors: globalErrors, result: null };
  }

  const checkResult = checkAllEquipment(equipment, normAreas);
  const report      = classificationReport(normAreas, equipment, checkResult);
  const result      = {
    ...report,
    _inputs: inputs,
  };
  result.mapModel = buildHazAreaMapModel(inputs, result);

  return {
    valid:   true,
    errors:  [],
    result,
  };
}
