// @ts-check
/**
 * Report sections for the supplemental studies listed in the Report Package
 * Builder registry (analysis/reportPackage.mjs): Sustainability Footprint,
 * TCC Settings Manifest, Hazardous Area Classification, Insulation
 * Coordination and Egress Lighting.
 *
 * Each builder reads the exact shape the study page saves with
 * saveStudyResult() and returns the same section shape as the advanced study
 * sections in analysis/projectReport.mjs: `headers`, lifecycle-decorated
 * `rows`, a `summary` object and `warnings`.  Values from a result that is
 * not current and evaluated are withheld by decorateStudyRows().
 *
 * This module is pure computation (no DOM, no dataStore imports) and must not
 * import analysis/projectReport.mjs, which imports it.
 */

import { assessStudyResult, decorateStudyRows } from './studyResultContext.mjs';
import { NFPA_EGRESS_MAX_MIN_RATIO } from './lighting.mjs';

const SECTION_TITLES = {
  sustainability: 'Sustainability Footprint',
  tccSettings: 'TCC Settings Manifest',
  hazAreaClass: 'Hazardous Area Classification',
  insulationCoord: 'Insulation Coordination (BIL/SIL)',
  lighting: 'Egress Lighting (NFPA 101)',
};

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function num(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function passLabel(pass) {
  if (pass === true) return 'PASS';
  if (pass === false) return 'FAIL';
  return null;
}

function humanize(value) {
  const str = text(value);
  if (!str) return null;
  const spaced = str.replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function compactSummary(summary) {
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value != null && value !== ''));
}

function readinessFor(data, assessment) {
  const metadata = data?.runMetadata || {};
  return {
    ...assessment,
    valid: assessment.eligible,
    validityLabel: assessment.label,
    source: metadata.source || assessment.provenance?.source || 'not recorded',
    runAt: assessment.runAt,
    convergence: metadata.convergence?.message || null,
  };
}

/**
 * Wrap rows and summary in the advanced-section shape.  `studyKey` drives the
 * lifecycle assessment and approval lookup; `key` is the report section key.
 * `identityKeys` stay visible when the row values are withheld.
 */
/** @param {{ key: string, studyKey: string, data: any, approvals?: object, headers: Array<{key: string, label: string}>, rows?: object[], summary?: object, warnings?: string[], identityKeys?: string[], options?: Record<string, any> }} section */
function studySection({
  key,
  studyKey,
  data,
  approvals = {},
  headers,
  rows = [],
  summary = {},
  warnings = [],
  identityKeys = [],
  options = {},
}) {
  const title = SECTION_TITLES[key];
  const assessment = assessStudyResult(studyKey, data, options.studyProvenance?.[studyKey], options);
  const cleanSummary = compactSummary(summary);
  const visibleSummary = assessment.eligible
    ? cleanSummary
    : {
      'Result summary': assessment.label,
      'Historical summary (withheld)': JSON.stringify(cleanSummary),
    };
  const preserve = [...list(options.preserve), ...identityKeys];
  return {
    key,
    title,
    headers,
    rows: decorateStudyRows(rows, assessment, { ...options, preserve }),
    summary: visibleSummary,
    warnings: [...new Set(list(warnings).map(text).filter(Boolean))],
    readiness: readinessFor(data, assessment),
    studyMetadata: assessment,
    approval: approvals?.[studyKey] || null,
  };
}

function emptySection(key) {
  return { key, title: SECTION_TITLES[key], empty: true };
}

// ---------------------------------------------------------------------------
// Sustainability footprint — saved by sustainability.js as
// { _inputs, _result: buildSustainabilityReport(), _bom }.
// ---------------------------------------------------------------------------

const SUSTAINABILITY_QUALITY_LABELS = {
  'screening-library': 'Screening library average',
  'documented-epd': 'Documented EPD',
  'undocumented-override': 'Undocumented override',
  'product-specific': 'Product-specific EPD',
  mixed: 'Mixed (EPD and library)',
  'no-data': 'No factors matched',
};

function sustainabilityQuantityUnit(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'equipment') return 'each';
  if (['cable', 'tray', 'conduit'].includes(normalized)) return 'm';
  return null;
}

export function buildSustainabilitySection(studies = {}, approvals = {}, options = {}) {
  const key = 'sustainability';
  const data = studies?.sustainabilityFootprint;
  if (!isRecord(data)) return emptySection(key);
  const result = isRecord(data._result) ? data._result : (isRecord(data.embodied) ? data : null);
  const embodied = isRecord(result?.embodied) ? result.embodied : {};
  const lines = list(embodied.lines);

  const rows = lines.map((line, index) => ({
    id: text(line.id) || `Line ${index + 1}`,
    category: humanize(line.type),
    quantity: num(line.quantity),
    quantityUnit: sustainabilityQuantityUnit(line.type),
    factorKgPerUnit: num(line.co2eKgPerUnit),
    embodiedKg: num(line.subtotalKg),
    factorQuality: SUSTAINABILITY_QUALITY_LABELS[line.sourceQuality] || humanize(line.sourceQuality || line.source),
    factorBasis: text(line.factorNote),
  }));

  const summary = {};
  if (result) {
    const operating = isRecord(result.operating) ? result.operating : null;
    const provenance = isRecord(result.gridFactorProvenance) ? result.gridFactorProvenance : {};
    const coverage = isRecord(result.factorCoverage) ? result.factorCoverage : {};
    summary['Total footprint (kgCO2e)'] = num(result.totalKg);
    summary['Total footprint (tCO2e)'] = num(result.totalTonnes);
    summary['Embodied carbon, Scope 3 (kgCO2e)'] = num(embodied.totalKg);
    summary['Operating carbon, Scope 2 lifetime (kgCO2e)'] = operating
      ? num(operating.lifetimeKgCO2e)
      : 'Not included (no conductor losses entered)';
    if (operating) {
      summary['Annual conductor losses (kWh/yr)'] = num(operating.annualKwh);
      summary['Lifetime energy losses (kWh)'] = num(operating.lifetimeKwh);
    }
    summary['Grid emission factor (kgCO2e/kWh)'] = num(result.gridFactorKgPerKwh);
    summary['Grid factor basis'] = text(provenance.label) || text(result.gridRegion);
    summary['Grid factor source'] = [text(provenance.source), text(provenance.release || provenance.sourceDate)]
      .filter(Boolean).join(', ') || null;
    summary['Project life (years)'] = num(result.projectLifeYears);
    const byCategory = new Map();
    lines.forEach(line => {
      const category = humanize(line.type) || 'Other';
      byCategory.set(category, (byCategory.get(category) || 0) + (num(line.subtotalKg) || 0));
    });
    byCategory.forEach((totalKg, category) => {
      summary[`Embodied carbon, ${category.toLowerCase()} (kgCO2e)`] = totalKg;
    });
    summary['Emission factor quality'] = SUSTAINABILITY_QUALITY_LABELS[coverage.quality] || humanize(coverage.quality);
    summary['BOM lines included'] = num(coverage.includedLines) ?? lines.length;
    summary['BOM lines skipped'] = num(coverage.skippedLines) ?? list(embodied.skippedItems).length;
    const alternative = isRecord(result.alternativeComparison) ? result.alternativeComparison : null;
    if (alternative) {
      summary['Alternative design total (kgCO2e)'] = num(alternative.totalKg);
      summary['Alternative minus primary (kgCO2e)'] = num(alternative.deltaKg);
    }
  }

  const warnings = [
    ...(result ? [] : ['The saved sustainability record has no calculated footprint; run the study again.']),
    ...list(embodied.skippedItems).map(item =>
      `Skipped BOM item ${text(item?.id) || '(no id)'}: ${text(item?.reason) || 'no reason recorded'}`),
    ...(list(result?.alternativeComparison?.skippedItems).length
      ? [`${result.alternativeComparison.skippedItems.length} alternative BOM item(s) were skipped.`]
      : []),
  ];

  return studySection({
    key,
    studyKey: 'sustainabilityFootprint',
    data,
    approvals,
    headers: [
      { key: 'id', label: 'BOM item' },
      { key: 'category', label: 'Category' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'quantityUnit', label: 'Quantity unit' },
      { key: 'factorKgPerUnit', label: 'Emission factor (kgCO2e per unit)' },
      { key: 'embodiedKg', label: 'Embodied carbon (kgCO2e)' },
      { key: 'factorQuality', label: 'Factor quality' },
      { key: 'factorBasis', label: 'Factor basis' },
    ],
    rows,
    summary,
    warnings,
    identityKeys: ['category'],
    options,
  });
}

// ---------------------------------------------------------------------------
// TCC — no page calls saveStudyResult('tcc'); the only saved shape is the
// sample package record { status, method, updatedAt,
// minimumCoordinationIntervalSeconds, pairs: [{ upstream, downstream,
// faultCurrentKA, intervalSeconds, status }] }.
// ---------------------------------------------------------------------------

export function buildTccSettingsSection(studies = {}, approvals = {}, options = {}) {
  const key = 'tccSettings';
  const data = studies?.tcc;
  if (!isRecord(data)) return emptySection(key);
  const pairs = list(data.pairs).filter(isRecord);

  const rows = pairs.map(pair => ({
    from: text(pair.upstream ?? pair.upstreamId ?? pair.from),
    to: text(pair.downstream ?? pair.downstreamId ?? pair.to),
    faultCurrentKA: num(pair.faultCurrentKA ?? pair.faultKA),
    intervalSeconds: num(pair.intervalSeconds ?? pair.ctiSeconds),
    status: text(pair.status),
  }));

  const intervals = rows.map(row => row.intervalSeconds).filter(value => value != null);
  const summary = {
    Method: text(data.method),
    'Saved study status': text(data.status),
    'Minimum coordination interval (s)': num(data.minimumCoordinationIntervalSeconds),
    'Device pairs': rows.length,
    'Smallest saved interval (s)': intervals.length ? Math.min(...intervals) : null,
    'Saved at': text(data.updatedAt),
  };

  const warnings = [
    ...list(data.warnings),
    ...(rows.length ? [] : ['The saved TCC result lists no coordinated device pairs.']),
  ];

  return studySection({
    key,
    studyKey: 'tcc',
    data,
    approvals,
    headers: [
      { key: 'from', label: 'Upstream device' },
      { key: 'to', label: 'Downstream device' },
      { key: 'faultCurrentKA', label: 'Fault current (kA)' },
      { key: 'intervalSeconds', label: 'Coordination time interval (s)' },
      { key: 'status', label: 'Saved coordination status' },
    ],
    rows,
    summary,
    warnings,
    options,
  });
}

// ---------------------------------------------------------------------------
// Hazardous area classification — saved by hazareaclassification.js as the
// runHazAreaStudy() result: { areas, equipment, summary, _inputs, mapModel }.
// ---------------------------------------------------------------------------

function hazEquipmentStatus(check, mapped) {
  if (text(mapped?.status)) return mapped.status;
  if (check.pass === false) return 'FAIL';
  if (check.pass === null) return 'WARN';
  if (list(check.warnings).length) return 'WARN';
  if (check.pass === true) return 'PASS';
  return null;
}

export function buildHazAreaClassSection(studies = {}, approvals = {}, options = {}) {
  const key = 'hazAreaClass';
  const data = studies?.hazAreaClassification;
  if (!isRecord(data)) return emptySection(key);
  const areas = list(data.areas).filter(isRecord);
  const checks = list(data.equipment).filter(isRecord);
  const inputsById = new Map(list(data._inputs?.equipment).filter(isRecord).map(item => [item.id, item]));
  const mappedById = new Map(list(data.mapModel?.equipment).filter(isRecord).map(item => [item.id, item]));
  const areaById = new Map(areas.map(area => [area.id, area]));

  const areaColumns = (area, fallbackId) => ({
    areaId: text(area?.id ?? fallbackId),
    areaName: text(area?.label),
    classification: area
      ? [text(area.designation), area.standard ? `(${area.standard})` : null].filter(Boolean).join(' ') || null
      : null,
    gasGroup: area && area.gasGroup !== '—' ? text(area.gasGroup) : null,
    areaTRating: area && area.tRating !== '—' ? text(area.tRating) : null,
  });

  const equipmentRow = check => {
    const input = inputsById.get(check.equipId) || {};
    const mapped = mappedById.get(check.equipId);
    const issues = [...list(check.failures), ...list(check.warnings), ...list(mapped?.geometryWarnings)];
    return {
      id: text(check.equipId),
      label: text(check.label ?? input.label),
      ...areaColumns(areaById.get(check.areaId), check.areaId),
      exProtection: text(input.exProtection),
      exGroup: text(input.exGroup),
      equipmentTRating: text(input.tRating),
      certNumber: text(input.certNumber),
      status: hazEquipmentStatus(check, mapped),
      issues: issues.length ? issues.join('; ') : null,
    };
  };

  const rows = [];
  const placed = new Set();
  areas.forEach(area => {
    const inArea = checks.filter(check => check.areaId === area.id);
    inArea.forEach(check => {
      rows.push(equipmentRow(check));
      placed.add(check);
    });
    if (!inArea.length) {
      rows.push({
        id: null,
        label: null,
        ...areaColumns(area),
        exProtection: null,
        exGroup: null,
        equipmentTRating: null,
        certNumber: null,
        status: text(area.status),
        issues: 'No equipment assigned to this area',
      });
    }
  });
  checks.filter(check => !placed.has(check)).forEach(check => rows.push(equipmentRow(check)));

  const studySummary = isRecord(data.summary) ? data.summary : {};
  const totalEquipment = num(studySummary.totalEquipment) ?? checks.length;
  const summary = {
    'Overall status': totalEquipment > 0 ? text(studySummary.status) : 'No equipment checked',
    'Classified areas': num(studySummary.totalAreas) ?? areas.length,
    'Equipment items checked': totalEquipment,
    'Equipment passing': num(studySummary.passCount),
    'Equipment failing': num(studySummary.failCount),
    'Equipment with warnings': num(studySummary.warnCount),
  };

  return studySection({
    key,
    studyKey: 'hazAreaClassification',
    data,
    approvals,
    headers: [
      { key: 'areaId', label: 'Area ID' },
      { key: 'areaName', label: 'Area' },
      { key: 'classification', label: 'Classification' },
      { key: 'gasGroup', label: 'Gas / dust group' },
      { key: 'areaTRating', label: 'Area T-rating' },
      { key: 'id', label: 'Equipment ID' },
      { key: 'label', label: 'Equipment' },
      { key: 'exProtection', label: 'Ex protection' },
      { key: 'exGroup', label: 'Equipment group' },
      { key: 'equipmentTRating', label: 'Equipment T-rating' },
      { key: 'certNumber', label: 'Certificate' },
      { key: 'status', label: 'Status' },
      { key: 'issues', label: 'Issues' },
    ],
    rows,
    summary,
    warnings: list(data.warnings),
    identityKeys: ['areaId', 'areaName', 'classification'],
    options,
  });
}

// ---------------------------------------------------------------------------
// Insulation coordination — saved by insulationcoordination.js as the
// runInsulationCoordinationStudy() result plus a `projectLink` snapshot.
// Only mcovCheck.pass, protectiveMargin.pass and allPassed are saved
// verdicts; rows without one of them carry no status.
// ---------------------------------------------------------------------------

function marginStatus(margin) {
  return isRecord(margin) ? passLabel(margin.pass) : null;
}

function impulseNote(selectedKv, margin, levelName) {
  if (selectedKv == null) return `No standard ${levelName} meets the required withstand`;
  return margin ? null : 'Arrester protective margin not checked';
}

export function buildInsulationCoordSection(studies = {}, approvals = {}, options = {}) {
  const key = 'insulationCoord';
  const data = studies?.insulationCoordination;
  if (!isRecord(data)) return emptySection(key);
  const inputs = isRecord(data.inputs) ? data.inputs : {};
  const standardRow = isRecord(data.standardRow) ? data.standardRow : {};
  const correction = isRecord(data.atmosphericCorrection) ? data.atmosphericCorrection : {};
  const rows = [];
  let unassessedChecks = 0;

  const li = isRecord(data.liResult) ? data.liResult : null;
  if (li) {
    const margin = isRecord(li.protectiveMargin) ? li.protectiveMargin : null;
    rows.push({
      check: 'Lightning impulse (BIL)',
      voltageBasis: 'kV peak',
      representativeKv: num(li.representativeKvPeak),
      requiredKv: num(li.ucwKvPeak),
      selectedKv: num(li.selectedBilKv) ?? 'None found',
      marginPct: num(margin?.marginPct),
      minMarginPct: num(margin?.minMarginPct),
      status: marginStatus(margin),
      note: impulseNote(num(li.selectedBilKv), margin, 'BIL'),
    });
  }

  const si = isRecord(data.siResult) ? data.siResult : null;
  if (si) {
    const margin = isRecord(si.protectiveMargin) ? si.protectiveMargin : null;
    const noStandardLevel = list(si.availableSiwv).length === 0;
    if (noStandardLevel) unassessedChecks += 1;
    rows.push({
      check: 'Switching impulse (SIL)',
      voltageBasis: 'kV peak',
      representativeKv: num(si.representativeKvPeak),
      requiredKv: num(si.ucwKvPeak),
      selectedKv: num(si.selectedSilKv) ?? (noStandardLevel ? 'No standard SIWV for this Um' : 'None found'),
      marginPct: num(margin?.marginPct),
      minMarginPct: num(margin?.minMarginPct),
      status: marginStatus(margin),
      note: noStandardLevel
        ? 'Not assessed against a standard level (IEC 60071-1 Range I)'
        : impulseNote(num(si.selectedSilKv), margin, 'SIL'),
    });
  }

  const tov = isRecord(data.tovResult) ? data.tovResult : null;
  if (tov) {
    rows.push({
      check: 'Temporary overvoltage (PFWV)',
      voltageBasis: 'kV rms',
      representativeKv: num(tov.tovKvRms),
      requiredKv: num(tov.ucwTovKvRms),
      selectedKv: num(tov.selectedPfwvKv) ?? (list(tov.availablePfwvKv).length ? 'None found' : 'No standard PFWV for this Um'),
      marginPct: null,
      minMarginPct: null,
      status: null,
      note: num(tov.tovFactor) != null ? `TOV factor ${tov.tovFactor}` : null,
    });
  }

  const mcov = isRecord(data.mcovCheck) ? data.mcovCheck : null;
  if (mcov) {
    rows.push({
      check: 'Surge arrester MCOV',
      voltageBasis: 'kV rms',
      representativeKv: null,
      requiredKv: num(mcov.requiredMcovKv),
      selectedKv: num(mcov.providedMcovKv),
      marginPct: null,
      minMarginPct: null,
      status: passLabel(mcov.pass),
      note: text(mcov.rationale),
    });
  }

  const assessedChecks = rows.length - unassessedChecks;
  let overall = null;
  if (!assessedChecks) overall = 'No checks assessed';
  else if (typeof data.allPassed === 'boolean') overall = passLabel(data.allPassed);
  const risk = num(li?.risk?.riskOfFailure);
  const summary = {
    'Study label': text(inputs.studyLabel),
    'Nominal voltage (kV)': num(inputs.nominalVoltageKv),
    'Entered Um (kV)': num(inputs.umKv),
    'Standard Um used (kV)': num(standardRow.um),
    'IEC 60071-1 range': typeof standardRow.rangeII === 'boolean' ? (standardRow.rangeII ? 'II' : 'I') : null,
    'Standard BIL options (kV peak)': list(standardRow.liwv).join(' / ') || null,
    Grounding: humanize(inputs.groundingType),
    Approach: humanize(data.approach ?? inputs.approach),
    'Safety factor Ks': num(data.safetyFactor),
    'Altitude (m)': num(correction.altitudeM ?? inputs.altitudeM),
    'Atmospheric correction Ka (impulse)': num(correction.kaLI),
    'Atmospheric correction Ka (power frequency)': num(correction.kaPF),
    'Checks assessed': assessedChecks,
    'Overall result': overall,
    'LI risk of failure per event': risk,
    'Calculation status': humanize(data.calculationStatus),
    'Standard edition': text(data.standardEdition),
  };

  return studySection({
    key,
    studyKey: 'insulationCoordination',
    data,
    approvals,
    headers: [
      { key: 'check', label: 'Check' },
      { key: 'voltageBasis', label: 'Voltage basis' },
      { key: 'representativeKv', label: 'Representative overvoltage (kV)' },
      { key: 'requiredKv', label: 'Required withstand / minimum (kV)' },
      { key: 'selectedKv', label: 'Selected standard level / provided (kV)' },
      { key: 'marginPct', label: 'Arrester protective margin (%)' },
      { key: 'minMarginPct', label: 'Required margin (%)' },
      { key: 'status', label: 'Result' },
      { key: 'note', label: 'Note' },
    ],
    rows,
    summary,
    warnings: [...list(data.warnings), ...list(data.requiredInputs)],
    identityKeys: ['check', 'voltageBasis'],
    options,
  });
}

// ---------------------------------------------------------------------------
// Egress lighting — saved by lighting.js as
// { ...runLightingStudy(), _inputs, _iesData, _iesFileName }.  The page also
// saves invalid runs ({ valid: false, errors }).
// ---------------------------------------------------------------------------

export function buildLightingSection(studies = {}, approvals = {}, options = {}) {
  const key = 'lighting';
  const data = studies?.lighting;
  if (!isRecord(data)) return emptySection(key);
  const inputs = isRecord(data._inputs) ? data._inputs : {};
  const lumen = isRecord(data.lumenMethod) ? data.lumenMethod : null;
  const egress = isRecord(data.egressCheck) ? data.egressCheck : null;
  const grid = isRecord(data.pointGrid) ? data.pointGrid : null;
  const calculated = data.valid !== false && Boolean(egress);
  const roomLabel = text(inputs.label) || 'Egress area';

  const minFc = num(egress?.minFc);
  const maxFc = num(grid?.maxFc);
  const rows = [{
    label: roomLabel,
    areaSqFt: num(lumen?.roomAreaSqFt),
    luminaires: num(inputs.numFixtures),
    lumensPerLuminaire: num(inputs.lumensPerFixture),
    mountingHeightFt: num(inputs.mountingHeightFt),
    calculationPlaneFt: num(inputs.workplaneHeightFt),
    avgFc: num(egress?.avgFc),
    minFc,
    maxFc,
    maxMinRatio: minFc != null && maxFc != null && minFc > 0 ? maxFc / minFc : null,
    basis: calculated
      ? (grid ? `Point-by-point grid (${grid.rows ?? '?'} x ${grid.cols ?? '?'} points)` : 'Lumen-method average only')
      : 'Not calculated (input errors)',
    status: calculated ? passLabel(egress.pass) : null,
  }];

  const summary = calculated ? {
    'Egress area': roomLabel,
    'Room length x width (ft)': num(inputs.roomLengthFt) != null && num(inputs.roomWidthFt) != null
      ? `${inputs.roomLengthFt} x ${inputs.roomWidthFt}`
      : null,
    'Room cavity ratio': num(lumen?.rcr),
    'Coefficient of utilization': num(lumen?.cu),
    'Light loss factor': num(lumen?.llf),
    'Ceiling / wall reflectance (%)': num(lumen?.ceilingReflPct) != null && num(lumen?.wallReflPct) != null
      ? `${lumen.ceilingReflPct} / ${lumen.wallReflPct}`
      : null,
    'Lumen-method average (fc)': num(lumen?.avgFc),
    'Point-by-point grid': grid
      ? `${grid.rows ?? '?'} x ${grid.cols ?? '?'} points`
      : 'Not computed (no IES photometry or fixture positions)',
    'Grid minimum (fc)': num(grid?.minFc),
    'Grid average (fc)': num(grid?.avgFc),
    'Grid maximum (fc)': maxFc,
    'NFPA 101 average criterion (fc)': num(egress.avgThresholdFc),
    'NFPA 101 minimum criterion (fc)': num(egress.minThresholdFc),
    'NFPA 101 max:min ratio limit': `${NFPA_EGRESS_MAX_MIN_RATIO}:1`,
    'Egress result': passLabel(egress.pass),
    'Photometric file': text(data._iesFileName),
  } : {
    'Egress area': roomLabel,
    'Egress result': 'Not calculated (input errors)',
  };

  const warnings = [
    ...list(data.errors).map(error => `Input error: ${error}`),
    ...list(egress?.violations),
    ...list(data.warnings),
  ];

  return studySection({
    key,
    studyKey: 'lighting',
    data,
    approvals,
    headers: [
      { key: 'label', label: 'Egress area' },
      { key: 'areaSqFt', label: 'Area (sq ft)' },
      { key: 'luminaires', label: 'Luminaires' },
      { key: 'lumensPerLuminaire', label: 'Lumens per luminaire (lm)' },
      { key: 'mountingHeightFt', label: 'Mounting height (ft)' },
      { key: 'calculationPlaneFt', label: 'Calculation plane height (ft)' },
      { key: 'avgFc', label: 'Average illuminance (fc)' },
      { key: 'minFc', label: 'Minimum illuminance (fc)' },
      { key: 'maxFc', label: 'Maximum illuminance (fc)' },
      { key: 'maxMinRatio', label: 'Max:min ratio' },
      { key: 'basis', label: 'Compliance basis' },
      { key: 'status', label: 'NFPA 101 result' },
    ],
    rows,
    summary,
    warnings,
    identityKeys: ['basis'],
    options,
  });
}

/**
 * Build the five supplemental study sections keyed by report section key.
 *
 * @param {object} studies   - saved study results keyed by study key
 * @param {object} approvals - study approvals keyed by study key
 * @param {object} options   - lifecycle options (studyProvenance, currentStudyContext, ...)
 * @returns {{ sustainability: object, tccSettings: object, hazAreaClass: object, insulationCoord: object, lighting: object }}
 */
export function buildSupplementalStudySections(studies = {}, approvals = {}, options = {}) {
  const safeStudies = isRecord(studies) ? studies : {};
  const safeApprovals = isRecord(approvals) ? approvals : {};
  const safeOptions = isRecord(options) ? options : {};
  return {
    sustainability: buildSustainabilitySection(safeStudies, safeApprovals, safeOptions),
    tccSettings: buildTccSettingsSection(safeStudies, safeApprovals, safeOptions),
    hazAreaClass: buildHazAreaClassSection(safeStudies, safeApprovals, safeOptions),
    insulationCoord: buildInsulationCoordSection(safeStudies, safeApprovals, safeOptions),
    lighting: buildLightingSection(safeStudies, safeApprovals, safeOptions),
  };
}
