import { isMotorComponent } from './motorStartCalc.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function finite(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function identityToken(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function recordTokens(record = {}) {
  const values = [
    record.id,
    record.entityId,
    record.equipmentId,
    record.equipmentRef,
    record.loadId,
    record.loadRef,
    record.ref,
    record.tag,
    record.name,
    record.label,
    record.scheduleLinks?.equipment,
    record.scheduleLinks?.load,
  ];
  return new Set(values.map(identityToken).filter(Boolean));
}

function tokensIntersect(left, right) {
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function motorLike(record = {}) {
  if (isMotorComponent(record)) return true;
  const classification = [
    record.type,
    record.subtype,
    record.loadType,
    record.category,
    record.subCategory,
    record.description,
  ].map(text).join(' ');
  const horsepower = finite(
    record.hp ?? record.horsepower ?? record.motorHp ?? record.ratingHp ?? record.ratedHp
      ?? record.props?.hp ?? record.props?.rated_hp
  );
  const powerKw = finite(record.kw ?? record.powerKw ?? record.power);
  return /motor|pump|fan|compressor|blower/i.test(classification) && (horsepower > 0 || powerKw > 0);
}

function flattenOneLine(oneLine = {}) {
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  return sheets.flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
}

function mergeMotorRecords(...records) {
  const present = records.filter(record => record && typeof record === 'object');
  return present.reduce((merged, record) => {
    Object.entries(record).forEach(([key, value]) => {
      if (key === 'props') return;
      if (value !== '' && value !== null && value !== undefined) merged[key] = value;
    });
    merged.props = merged.props || {};
    Object.entries(record.props || {}).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) merged.props[key] = value;
    });
    return merged;
  }, {});
}

function firstMatchingRecord(records, tokens, claimed = new Set()) {
  return records.find(record => !claimed.has(record) && tokensIntersect(recordTokens(record), tokens)) || null;
}

function uniqueId(record, index, used) {
  const base = identityToken(record.id || record.entityId || record.tag || record.ref || record.name)
    || `project-motor-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function sourceBinding(id, sources) {
  const sourceLabels = sources.map(source => source.label);
  const sourcePaths = sources.map(source => source.path);
  return {
    sourcePath: sourcePaths.join(' + '),
    sourceLabel: sourceLabels.join(' + '),
    recordId: id,
    sources,
  };
}

/**
 * Merge motor records from the One-Line, Equipment List, and Load List.
 * One-Line values have final precedence, while schedule records fill missing
 * electrical fields. Schedule-only motors remain available for study setup.
 */
export function buildMotorStartProjectInputs({ oneLine = {}, equipment = [], loads = [], studies = {} } = {}) {
  const oneLineMotors = flattenOneLine(oneLine).filter(motorLike);
  const equipmentRecords = Array.isArray(equipment) ? equipment : [];
  const loadRecords = Array.isArray(loads) ? loads : [];
  const equipmentMotors = equipmentRecords.filter(motorLike);
  const loadMotors = loadRecords.filter(motorLike);
  const claimedEquipment = new Set();
  const claimedLoads = new Set();
  const usedIds = new Set();
  const motors = [];
  const bindingsById = {};

  const appendMotor = (record, sources) => {
    const id = uniqueId(record, motors.length, usedIds);
    const existingHp = finite(record.hp ?? record.horsepower ?? record.motorHp ?? record.props?.hp ?? record.props?.rated_hp);
    const powerKw = finite(record.kw ?? record.powerKw ?? record.power);
    const efficiencyRaw = finite(record.efficiency ?? record.eff ?? record.props?.efficiency ?? record.props?.eff);
    const efficiency = efficiencyRaw > 1 ? efficiencyRaw / 100 : (efficiencyRaw || 0.9);
    const inferredHp = !existingHp && powerKw > 0 ? Number((powerKw * efficiency / 0.746).toFixed(1)) : 0;
    const merged = { ...record, ...(inferredHp ? { hp: inferredHp } : {}), id, projectSources: sources };
    motors.push(merged);
    bindingsById[id] = sourceBinding(id, sources);
  };

  oneLineMotors.forEach(component => {
    const tokens = recordTokens(component);
    const equipmentRecord = firstMatchingRecord(equipmentRecords, tokens, claimedEquipment);
    if (equipmentRecord) {
      claimedEquipment.add(equipmentRecord);
      recordTokens(equipmentRecord).forEach(token => tokens.add(token));
    }
    const loadRecord = firstMatchingRecord(loadRecords, tokens, claimedLoads);
    if (loadRecord) claimedLoads.add(loadRecord);
    const sources = [
      ...(equipmentRecord ? [{ path: `equipment.${text(equipmentRecord.id || equipmentRecord.tag || 'motor')}`, label: 'Equipment List' }] : []),
      ...(loadRecord ? [{ path: `loadList.${text(loadRecord.id || loadRecord.tag || 'motor')}`, label: 'Load List' }] : []),
      { path: `oneLineDiagram.${text(component.id || 'motor')}`, label: 'One-Line' },
    ];
    appendMotor(mergeMotorRecords(loadRecord, equipmentRecord, component), sources);
  });

  equipmentMotors.forEach(equipmentRecord => {
    if (claimedEquipment.has(equipmentRecord)) return;
    const tokens = recordTokens(equipmentRecord);
    const loadRecord = firstMatchingRecord(loadRecords, tokens, claimedLoads);
    if (loadRecord) claimedLoads.add(loadRecord);
    claimedEquipment.add(equipmentRecord);
    appendMotor(mergeMotorRecords(loadRecord, equipmentRecord), [
      { path: `equipment.${text(equipmentRecord.id || equipmentRecord.tag || 'motor')}`, label: 'Equipment List' },
      ...(loadRecord ? [{ path: `loadList.${text(loadRecord.id || loadRecord.tag || 'motor')}`, label: 'Load List' }] : []),
    ]);
  });

  loadMotors.forEach(loadRecord => {
    if (claimedLoads.has(loadRecord)) return;
    const equipmentRecord = firstMatchingRecord(equipmentRecords, recordTokens(loadRecord), claimedEquipment);
    if (equipmentRecord) claimedEquipment.add(equipmentRecord);
    claimedLoads.add(loadRecord);
    appendMotor(mergeMotorRecords(equipmentRecord, loadRecord), [
      ...(equipmentRecord ? [{ path: `equipment.${text(equipmentRecord.id || equipmentRecord.tag || 'motor')}`, label: 'Equipment List' }] : []),
      { path: `loadList.${text(loadRecord.id || loadRecord.tag || 'motor')}`, label: 'Load List' },
    ]);
  });

  const loadFlow = studies && typeof studies === 'object' ? studies.loadFlow : null;
  const sourceCounts = {
    oneLine: oneLineMotors.length,
    equipment: equipmentMotors.length,
    loads: loadMotors.length,
    loadFlow: loadFlow?.persisted || loadFlow?.converged ? 1 : 0,
  };
  return {
    motors,
    bindingsById,
    sourceCounts,
    panelBindings: {
      oneLine: { sourcePath: 'oneLineDiagram', sourceLabel: `One-Line (${sourceCounts.oneLine} motors)` },
      equipment: { sourcePath: 'equipment', sourceLabel: `Equipment List (${sourceCounts.equipment} motors)` },
      loads: { sourcePath: 'loadList', sourceLabel: `Load List (${sourceCounts.loads} motors)` },
      ...(sourceCounts.loadFlow ? { loadFlow: { sourcePath: 'studyResults.loadFlow', sourceLabel: 'Load Flow' } } : {}),
    },
    missing: motors.length ? [] : ['Add a motor with horsepower to the One-Line, Equipment List, or Load List.'],
  };
}

/** Build downstream starting-demand values from completed motor cases. */
export function summarizeMotorStartDemand(inputs = [], results = []) {
  const summaries = results.map((result, index) => {
    const input = inputs[index] || result || {};
    const startingKva = Math.sqrt(3) * finite(input.volts) * finite(result.inrushKA);
    const startingKw = startingKva * Math.max(0, Math.min(1, finite(input.powerFactor)));
    return {
      id: text(result.id || input.id),
      label: text(result.label || input.label || result.id || input.id),
      hp: finite(input.hp),
      powerFactor: finite(input.powerFactor),
      efficiency: finite(input.efficiency),
      startingKva: Number(startingKva.toFixed(2)),
      startingKw: Number(startingKw.toFixed(2)),
    };
  }).filter(summary => summary.startingKva > 0);
  const controllingMotor = summaries.reduce((current, summary) => (
    !current || summary.startingKva > current.startingKva ? summary : current
  ), null);
  return {
    startingKva: controllingMotor?.startingKva || 0,
    startingKw: controllingMotor?.startingKw || 0,
    peakLoadKw: controllingMotor?.startingKw || 0,
    controllingMotor,
    motorDemandSummaries: summaries,
  };
}
