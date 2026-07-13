const PROJECT_META_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  name: '',
  number: '',
  client: '',
  site: '',
  location: '',
  engineer: '',
  license: '',
  preparedBy: '',
  revision: '0',
  issueDate: '',
  coverNotes: '',
  altitudeFt: 0,
  ambientTempC: 40,
  minAmbientTempC: 20,
  maxAmbientTempC: 40,
  batteryRuntimeHours: 2,
  updatedAt: ''
});

function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function finite(value, fallback = 0) {
  const result = Number.parseFloat(value);
  return Number.isFinite(result) ? result : fallback;
}

function unitFactor(value, fallback) {
  const parsed = finite(value, fallback);
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0.1, Math.min(1, normalized));
}

function hasRecordValue(record) {
  return record && typeof record === 'object'
    && Object.values(record).some(value => value !== null && value !== undefined && String(value).trim() !== '');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

export function stableSerialize(value) {
  return JSON.stringify(stableValue(value));
}

export function hashProjectInputs(value) {
  const serialized = stableSerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeProjectMeta(input = {}, fallbackName = '') {
  const source = input && typeof input === 'object' ? input : {};
  const legacyAmbient = finite(source.ambientTempC, 40);
  return {
    ...PROJECT_META_DEFAULTS,
    name: text(source.name, fallbackName),
    number: text(source.number || source.projectNumber),
    client: text(source.client || source.owner),
    site: text(source.site),
    location: text(source.location),
    engineer: text(source.engineer || source.responsibleEngineer),
    license: text(source.license || source.licenseNumber),
    preparedBy: text(source.preparedBy),
    revision: text(source.revision || source.revisionNumber, '0'),
    issueDate: text(source.issueDate || source.date),
    coverNotes: text(source.coverNotes || source.notes),
    altitudeFt: Math.max(0, finite(source.altitudeFt, 0)),
    ambientTempC: legacyAmbient,
    minAmbientTempC: finite(source.minAmbientTempC, legacyAmbient),
    maxAmbientTempC: finite(source.maxAmbientTempC, legacyAmbient),
    batteryRuntimeHours: Math.max(0.01, finite(source.batteryRuntimeHours, 2)),
    updatedAt: text(source.updatedAt)
  };
}

export function projectLoadRows(loads = []) {
  return (Array.isArray(loads) ? loads : [])
    .filter(hasRecordValue)
    .map((load, index) => {
      const quantity = Math.max(1, finite(load.quantity, 1));
      let kw = finite(load.kw, Number.NaN);
      if (!Number.isFinite(kw)) kw = finite(load.power, Number.NaN);
      if (!Number.isFinite(kw)) kw = finite(load.watts, 0) / 1000;
      if (!(kw > 0)) {
        const kva = finite(load.kva || load.kVA, 0);
        kw = kva * Math.max(0.1, Math.min(1, finite(load.powerFactor || load.pf, 1)));
      }
      if (!(kw > 0)) {
        const hp = finite(load.hp || load.horsepower || load.motorHp, 0);
        const efficiency = unitFactor(load.efficiency, 0.9);
        kw = hp > 0 ? hp * 0.746 / efficiency : 0;
      }
      const rawDemandFactor = finite(load.demandFactor, 1);
      const demandFactor = Math.max(0, Math.min(1, rawDemandFactor > 1 ? rawDemandFactor / 100 : rawDemandFactor));
      const label = text(load.description || load.label || load.tag || load.ref || load.id, `Load ${index + 1}`);
      return {
        id: text(load.id || load.ref || load.tag, `load-${index + 1}`),
        equipmentId: text(load.equipmentId || load.equipmentRef || load.source),
        label,
        kw: Number((kw * quantity).toFixed(3)),
        demandFactor,
        sourcePath: `loads.${text(load.id || load.ref || load.tag, index)}`
      };
    })
    .filter(load => load.kw > 0);
}

export function largestProjectMotor(equipment = [], loads = []) {
  const candidates = [...(Array.isArray(equipment) ? equipment : []), ...(Array.isArray(loads) ? loads : [])]
    .filter(hasRecordValue)
    .map((item, index) => {
      const efficiency = unitFactor(item.efficiency, 0.92);
      const motorLike = /motor|pump|fan|compressor/i.test([
        item.loadType, item.category, item.subCategory, item.description, item.label
      ].filter(Boolean).join(' '));
      const explicitHp = finite(item.hp || item.horsepower || item.motorHp || item.ratingHp || item.ratedHp, 0);
      const inferredHp = motorLike ? finite(item.kw || item.power, 0) * efficiency / 0.746 : 0;
      return {
        id: text(item.id || item.ref || item.tag, `motor-${index + 1}`),
        label: text(item.description || item.label || item.tag || item.ref, `Motor ${index + 1}`),
        hp: explicitHp || Number(inferredHp.toFixed(1)),
        powerFactor: unitFactor(item.powerFactor || item.pf, 0.85),
        efficiency
      };
    })
    .filter(item => item.hp > 0)
    .sort((a, b) => b.hp - a.hp);
  return candidates[0] || null;
}

function topLevelNumber(source, keys) {
  for (const key of keys) {
    const value = finite(source?.[key], Number.NaN);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export function buildBatteryProjectInputs({ loads = [], studies = {}, designBasis = {}, projectMeta = {} } = {}) {
  const linkedLoads = projectLoadRows(loads);
  const averageLoadKw = linkedLoads.reduce((sum, load) => sum + load.kw * load.demandFactor, 0);
  const motorStart = studies && typeof studies === 'object' ? studies.motorStart || {} : {};
  const peakFromStudy = topLevelNumber(motorStart, ['peakLoadKw', 'startingKw', 'maximumKw', 'peakKw']);
  const sizingDefaults = designBasis?.sizingDefaults || {};
  const meta = normalizeProjectMeta(projectMeta);
  const inputs = {
    systemLabel: meta.site || meta.name,
    averageLoadKw: Number(averageLoadKw.toFixed(3)),
    peakLoadKw: Number(Math.max(averageLoadKw, peakFromStudy || 0).toFixed(3)),
    runtimeHours: meta.batteryRuntimeHours,
    ambientTempC: finite(projectMeta?.batteryAmbientTempC, finite(projectMeta?.minAmbientTempC, finite(projectMeta?.ambientTempC, 25))),
    upsPowerFactor: Math.max(0.5, Math.min(1, finite(sizingDefaults.defaultPowerFactor, 0.9)))
  };
  return {
    inputs,
    bindings: {
      systemLabel: { sourcePath: meta.site ? 'projectMeta.site' : 'projectMeta.name', sourceLabel: 'Project metadata' },
      averageLoadKw: { sourcePath: 'loads', sourceLabel: `Load List (${linkedLoads.length} loads)` },
      peakLoadKw: { sourcePath: peakFromStudy ? 'studyResults.motorStart' : 'loads', sourceLabel: peakFromStudy ? 'Motor Start' : `Load List (${linkedLoads.length} loads)` },
      runtimeHours: { sourcePath: 'projectMeta.batteryRuntimeHours', sourceLabel: 'Project metadata' },
      ambientTempC: { sourcePath: 'projectMeta.minAmbientTempC', sourceLabel: 'Project metadata' },
      upsPowerFactor: { sourcePath: 'designBasis.sizingDefaults.defaultPowerFactor', sourceLabel: 'Design Basis' }
    },
    missing: linkedLoads.length ? [] : ['Add at least one load with a kW, kVA, watts, or horsepower value.']
  };
}

export function buildGeneratorProjectInputs({ loads = [], equipment = [], projectMeta = {} } = {}) {
  const linkedLoads = projectLoadRows(loads);
  const motor = largestProjectMotor(equipment, loads);
  const meta = normalizeProjectMeta(projectMeta);
  return {
    inputs: {
      projectLabel: meta.site || meta.name,
      loads: linkedLoads.map(load => ({ label: load.label, kw: load.kw, demandFactor: load.demandFactor, sourceId: load.id })),
      altitudeFt: meta.altitudeFt,
      ambientC: meta.maxAmbientTempC,
      motorHp: motor?.hp || 0,
      motorPf: motor?.powerFactor || 0.85,
      motorEff: motor?.efficiency || 0.92
    },
    bindings: {
      projectLabel: { sourcePath: meta.site ? 'projectMeta.site' : 'projectMeta.name', sourceLabel: 'Project metadata' },
      loads: { sourcePath: 'loads', sourceLabel: `Load List (${linkedLoads.length} loads)` },
      altitudeFt: { sourcePath: 'projectMeta.altitudeFt', sourceLabel: 'Project metadata' },
      ambientC: { sourcePath: 'projectMeta.ambientTempC', sourceLabel: 'Project metadata' },
      motorHp: { sourcePath: motor ? `equipment.${motor.id}` : 'equipment', sourceLabel: motor ? `Equipment · ${motor.label}` : 'Equipment' },
      motorPf: { sourcePath: motor ? `equipment.${motor.id}.powerFactor` : 'equipment', sourceLabel: 'Equipment' },
      motorEff: { sourcePath: motor ? `equipment.${motor.id}.efficiency` : 'equipment', sourceLabel: 'Equipment' }
    },
    missing: linkedLoads.length ? [] : ['Add at least one load with a usable power value.']
  };
}

export function createStudyInputSnapshot(studyKey, inputs, bindings = {}, overrides = []) {
  const sourceSnapshot = { studyKey, inputs, bindings, overrides: [...overrides].sort() };
  return {
    schemaVersion: 1,
    studyKey,
    inputHash: hashProjectInputs(sourceSnapshot),
    bindings,
    overrides: [...overrides].sort(),
    sourceSnapshot,
    capturedAt: new Date().toISOString()
  };
}

export function withStudyProvenance(result, snapshot) {
  return { ...result, projectLink: snapshot };
}

export function getStudyStaleness(result, currentSnapshot) {
  const previous = result?.projectLink;
  if (!previous?.inputHash) return { status: 'unknown', stale: false, changedFields: [] };
  if (previous.inputHash === currentSnapshot?.inputHash) return { status: 'current', stale: false, changedFields: [] };
  const before = previous.sourceSnapshot?.inputs || {};
  const after = currentSnapshot?.sourceSnapshot?.inputs || {};
  const changedFields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => stableSerialize(before[key]) !== stableSerialize(after[key]));
  return { status: 'stale', stale: true, changedFields };
}

function identityToken(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function recordId(record, prefix, index, used) {
  const base = identityToken(record?.id || record?.ref || record?.tag || record?.name)
    || `${prefix}-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function identityIndex(records) {
  const index = new Map();
  records.forEach(record => {
    [record.id, record.ref, record.tag, record.name].filter(Boolean).forEach(value => {
      index.set(String(value).trim().toLowerCase(), record.id);
    });
  });
  return index;
}

function resolveIdentity(index, ...values) {
  for (const value of values) {
    const resolved = index.get(text(value).toLowerCase());
    if (resolved) return resolved;
  }
  return '';
}

export function normalizeProjectEntities({ equipment = [], loads = [], cables = [] } = {}) {
  const equipmentIds = new Set();
  const normalizedEquipment = (Array.isArray(equipment) ? equipment : []).map((record, index) => (
    hasRecordValue(record)
      ? { ...record, id: recordId(record, 'equipment', index, equipmentIds) }
      : { ...record, id: text(record?.id) }
  ));
  const equipmentIndex = identityIndex(normalizedEquipment);

  const loadIds = new Set();
  const normalizedLoads = (Array.isArray(loads) ? loads : []).map((record, index) => {
    if (!hasRecordValue(record)) return { ...record, id: text(record?.id) };
    const id = recordId(record, 'load', index, loadIds);
    const equipmentId = text(record.equipmentId) || resolveIdentity(
      equipmentIndex,
      record.equipmentRef,
      record.tag,
      record.ref,
      record.id
    );
    return { ...record, id, ...(equipmentId ? { equipmentId } : {}) };
  });

  const cableIds = new Set();
  const normalizedCables = (Array.isArray(cables) ? cables : []).map((record, index) => {
    if (!hasRecordValue(record)) return { ...record, id: text(record?.id) };
    const id = recordId(record, 'circuit', index, cableIds);
    const sourceEquipmentId = text(record.sourceEquipmentId) || resolveIdentity(
      equipmentIndex,
      record.fromId,
      record.from_tag,
      record.from,
      record.source
    );
    const targetEquipmentId = text(record.targetEquipmentId) || resolveIdentity(
      equipmentIndex,
      record.toId,
      record.to_tag,
      record.to,
      record.target
    );
    return {
      ...record,
      id,
      circuitId: text(record.circuitId, id),
      ...(sourceEquipmentId ? { sourceEquipmentId } : {}),
      ...(targetEquipmentId ? { targetEquipmentId } : {}),
    };
  });

  return { equipment: normalizedEquipment, loads: normalizedLoads, cables: normalizedCables };
}

export function normalizeOneLineReferences(oneLine = {}, project = {}) {
  const normalized = normalizeProjectEntities(project);
  const entityIndex = identityIndex([...normalized.equipment, ...normalized.loads]);
  const circuitIndex = identityIndex(normalized.cables);
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  return {
    ...oneLine,
    sheets: sheets.map(sheet => ({
      ...sheet,
      components: (Array.isArray(sheet.components) ? sheet.components : []).map(component => {
        const entityId = text(component.entityId) || resolveIdentity(
          entityIndex,
          component.scheduleLinks?.equipment,
          component.scheduleLinks?.load,
          component.equipmentRef,
          component.loadRef,
          component.ref,
          component.tag
        );
        return entityId ? { ...component, entityId } : component;
      }),
      connections: (Array.isArray(sheet.connections) ? sheet.connections : []).map(connection => {
        const circuitId = text(connection.circuitId) || resolveIdentity(
          circuitIndex,
          connection.cable?.id,
          connection.cable?.tag,
          connection.cable_tag,
          connection.tag
        );
        return circuitId ? { ...connection, circuitId } : connection;
      }),
    }))
  };
}

export function buildOneLineProjectView(oneLine = {}, project = {}) {
  const normalized = normalizeProjectEntities(project);
  const entities = new Map();
  [...normalized.equipment, ...normalized.loads].forEach(entity => {
    if (!entity?.id) return;
    entities.set(entity.id, { ...(entities.get(entity.id) || {}), ...entity });
  });
  const circuits = new Map(normalized.cables.filter(cable => cable?.id).map(cable => [cable.id, cable]));
  const visualKeys = ['id', 'x', 'y', 'z', 'label', 'type', 'subtype', 'layer', 'ports', 'connections', 'scheduleLinks', 'equipmentRef', 'loadRef', 'panelRef', 'ref', 'props'];
  return {
    ...oneLine,
    sheets: (Array.isArray(oneLine?.sheets) ? oneLine.sheets : []).map(sheet => ({
      ...sheet,
      components: (Array.isArray(sheet.components) ? sheet.components : []).map(component => {
        const entity = entities.get(component.entityId);
        if (!entity) return component;
        const view = { ...component, ...entity, entityId: component.entityId, projectEntity: entity };
        visualKeys.forEach(key => {
          if (component[key] !== undefined) view[key] = component[key];
        });
        return view;
      }),
      connections: (Array.isArray(sheet.connections) ? sheet.connections : []).map(connection => {
        const circuit = circuits.get(connection.circuitId);
        if (!circuit) return connection;
        return {
          ...connection,
          circuitId: connection.circuitId,
          cable: { ...(connection.cable || {}), ...circuit },
          projectCircuit: circuit,
        };
      }),
    }))
  };
}

function voltageV(value) {
  if (value === null || value === undefined) return 0;
  const source = String(value).trim().toLowerCase();
  const match = source.match(/[\d.]+/);
  if (!match) return 0;
  const parsed = Number.parseFloat(match[0]);
  if (!Number.isFinite(parsed)) return 0;
  return source.includes('kv') ? parsed * 1000 : parsed;
}

function scopedFaultCurrent(studies = {}, identities = []) {
  const shortCircuit = studies?.shortCircuit || studies?.iec60909 || {};
  const direct = topLevelNumber(shortCircuit, [
    'availableFaultKa', 'availableFaultKA', 'faultCurrentKA', 'faultKa', 'ikssKA', 'ikKA'
  ]);
  if (direct) return direct;
  const keys = identities.filter(Boolean).map(value => String(value).toLowerCase());
  const visit = value => {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = visit(entry);
        if (found) return found;
      }
      return null;
    }
    const identity = text(value.id || value.ref || value.tag || value.label).toLowerCase();
    if (!keys.length || keys.includes(identity)) {
      const result = topLevelNumber(value, ['availableFaultKa', 'faultCurrentKA', 'faultKa', 'ikssKA', 'ikKA']);
      if (result) return result;
    }
    for (const entry of Object.values(value)) {
      const found = visit(entry);
      if (found) return found;
    }
    return null;
  };
  return visit(shortCircuit) || 0;
}

export function buildProjectScopeOptions({ equipment = [], loads = [], cables = [] } = {}, kinds = ['load', 'circuit', 'equipment']) {
  const normalized = normalizeProjectEntities({ equipment, loads, cables });
  const options = [];
  if (kinds.includes('load')) {
    projectLoadRows(normalized.loads).forEach(load => options.push({
      value: `load:${load.id}`,
      label: `Load · ${load.label}`,
      kind: 'load',
      powerKw: load.kw,
    }));
  }
  if (kinds.includes('circuit')) {
    normalized.cables.filter(hasRecordValue).forEach((cable, index) => options.push({
      value: `circuit:${cable.id}`,
      label: `Circuit · ${text(cable.tag || cable.name || cable.id, `Circuit ${index + 1}`)}`,
      kind: 'circuit',
      powerKw: 0,
    }));
  }
  if (kinds.includes('equipment')) {
    normalized.equipment.filter(hasRecordValue).forEach((item, index) => options.push({
      value: `equipment:${item.id}`,
      label: `Equipment · ${text(item.tag || item.ref || item.description || item.id, `Equipment ${index + 1}`)}`,
      kind: 'equipment',
      powerKw: 0,
    }));
  }
  return options.sort((a, b) => (b.powerKw || 0) - (a.powerKw || 0) || a.label.localeCompare(b.label));
}

export function resolveProjectScope(scopeValue, { equipment = [], loads = [], cables = [], studies = {} } = {}) {
  const normalized = normalizeProjectEntities({ equipment, loads, cables });
  const [kind, id] = String(scopeValue || '').split(':');
  let load = null;
  let cable = null;
  let item = null;
  if (kind === 'load') load = normalized.loads.find(record => record.id === id) || null;
  if (kind === 'circuit') cable = normalized.cables.find(record => record.id === id) || null;
  if (kind === 'equipment') item = normalized.equipment.find(record => record.id === id) || null;
  if (load) {
    item = normalized.equipment.find(record => record.id === load.equipmentId) || null;
    cable = normalized.cables.find(record => (
      record.targetEquipmentId === load.equipmentId
      || [record.to, record.to_tag, record.target].some(value => text(value).toLowerCase() === text(load.tag || load.ref || load.id).toLowerCase())
    )) || null;
  }
  if (cable) {
    item = normalized.equipment.find(record => record.id === cable.targetEquipmentId) || item;
    load = normalized.loads.find(record => record.equipmentId === cable.targetEquipmentId) || load;
  }
  if (item && !load) load = normalized.loads.find(record => record.equipmentId === item.id) || null;
  if (item && !cable) cable = normalized.cables.find(record => record.targetEquipmentId === item.id) || null;
  const loadRow = load ? projectLoadRows([load])[0] : null;
  const voltage = voltageV(load?.voltage || item?.voltage || cable?.voltage || cable?.operating_voltage);
  const phases = Math.max(1, Math.round(finite(load?.phases || item?.phases || cable?.phases, 3)));
  const pf = unitFactor(load?.powerFactor || load?.pf || item?.powerFactor || item?.pf, 0.9);
  const kw = loadRow?.kw || finite(item?.kw || item?.powerKw || cable?.load_kw, 0);
  const current = finite(cable?.current || cable?.current_a || cable?.load_current, 0)
    || (voltage > 0 && kw > 0 ? kw * 1000 / ((phases === 3 ? Math.sqrt(3) : 1) * voltage * pf) : 0);
  const identities = [load?.id, load?.tag, item?.id, item?.tag, cable?.id, cable?.tag];
  return {
    scopeValue,
    kind,
    label: text(load?.description || item?.description || cable?.tag || cable?.name || id, 'Project scope'),
    load,
    equipment: item,
    cable,
    voltageV: voltage,
    phases,
    powerFactor: pf,
    loadKw: kw,
    currentA: Number(current.toFixed(2)),
    lengthFt: finite(cable?.length_ft || cable?.length, 0),
    faultCurrentKA: scopedFaultCurrent(studies, identities),
  };
}

export function buildBusDuctProjectInputs(scope, projectMeta = {}) {
  const meta = normalizeProjectMeta(projectMeta);
  return {
    inputs: {
      label: scope.label,
      phases: scope.phases,
      systemVoltageV: scope.voltageV,
      currentA: scope.currentA,
      lengthFt: scope.lengthFt,
      ambientC: meta.maxAmbientTempC,
      faultCurrentKA: scope.faultCurrentKA,
    },
    bindings: {
      label: { sourcePath: scope.scopeValue, sourceLabel: 'Selected project scope' },
      phases: { sourcePath: `${scope.scopeValue}.phases`, sourceLabel: 'Selected project scope' },
      systemVoltageV: { sourcePath: `${scope.scopeValue}.voltage`, sourceLabel: 'Selected project scope' },
      currentA: { sourcePath: `${scope.scopeValue}.load`, sourceLabel: 'Load List / circuit' },
      lengthFt: { sourcePath: `${scope.scopeValue}.length`, sourceLabel: 'Cable Schedule' },
      ambientC: { sourcePath: 'projectMeta.maxAmbientTempC', sourceLabel: 'Maximum ambient' },
      faultCurrentKA: { sourcePath: 'studyResults.shortCircuit', sourceLabel: 'Short Circuit' },
    },
    missing: [
      ...(!scope.voltageV ? ['Voltage is missing.'] : []),
      ...(!scope.currentA ? ['Load current could not be derived.'] : []),
      ...(!scope.faultCurrentKA ? ['Run Short Circuit or enter available fault current.'] : []),
    ],
  };
}

export function buildVoltageFlickerProjectInputs(project = {}) {
  const options = buildProjectScopeOptions(project, ['load']);
  const scopes = options.map(option => resolveProjectScope(option.value, project));
  const disturbanceScopes = scopes.filter(scope => /motor|furnace|welder|wind/i.test([
    scope.load?.loadType, scope.load?.description, scope.equipment?.category, scope.equipment?.subCategory
  ].filter(Boolean).join(' ')));
  const selected = disturbanceScopes.length ? disturbanceScopes : scopes;
  const primary = selected[0] || { voltageV: 0, faultCurrentKA: 0 };
  const systemKva = primary.voltageV > 0 && primary.faultCurrentKA > 0
    ? Math.sqrt(3) * (primary.voltageV / 1000) * primary.faultCurrentKA * 1000
    : 0;
  return {
    inputs: {
      nominalVoltageKv: primary.voltageV / 1000,
      systemKva: Number(systemKva.toFixed(1)),
      xrRatio: finite(project.studies?.shortCircuit?.xrRatio || project.studies?.shortCircuit?.xOverR, 10),
      loadSteps: selected.map(scope => ({
        label: scope.label,
        loadKw: scope.loadKw,
        repetitionsPerHour: Math.max(0.001, finite(scope.load?.repetitionsPerHour || scope.load?.startsPerHour, 10)),
        type: /motor/i.test(scope.load?.loadType || '') ? 'Motor Start' : 'Other',
      })).filter(step => step.loadKw > 0),
    },
    bindings: {
      systemKva: { sourcePath: 'studyResults.shortCircuit', sourceLabel: 'Short Circuit' },
      xrRatio: { sourcePath: 'studyResults.shortCircuit.xrRatio', sourceLabel: 'Short Circuit' },
      nominalVoltageKv: { sourcePath: primary.scopeValue || 'loadList', sourceLabel: 'Selected project load' },
      loadSteps: { sourcePath: 'loadList', sourceLabel: `Load List (${selected.length} disturbances)` },
    },
    missing: [
      ...(!primary.faultCurrentKA ? ['Run Short Circuit to establish PCC strength.'] : []),
      ...(!selected.length ? ['Add a motor, furnace, welder, wind, or other load step.'] : []),
    ],
  };
}

const CABLE_SIZE_MM2 = {
  '14': 2.08, '12': 3.31, '10': 5.26, '8': 8.37, '6': 13.3, '4': 21.2,
  '3': 26.7, '2': 33.6, '1': 42.4, '1/0': 53.5, '2/0': 67.4, '3/0': 85,
  '4/0': 107, '250': 127, '300': 152, '350': 177, '400': 203, '500': 253,
  '600': 304, '750': 380, '1000': 507,
};

export function cableSizeMm2(value) {
  const source = text(value).toUpperCase().replace('#', '').replace(/\s*(AWG|KCMIL|MCM|MM²|MM2)\s*/g, '').trim();
  if (CABLE_SIZE_MM2[source]) return CABLE_SIZE_MM2[source];
  const numeric = finite(source, 0);
  return numeric > 0 ? numeric : 0;
}

export function buildCableThermalProjectInputs(scope, project = {}) {
  const cable = scope.cable || {};
  const designBasis = project.designBasis || {};
  const racewayIds = Array.isArray(cable.raceway_ids) ? cable.raceway_ids : [cable.raceway_id || cable.route_preference].filter(Boolean);
  const inTray = racewayIds.some(id => (project.trays || []).some(tray => [tray.id, tray.tray_id, tray.tag].includes(id)));
  const inConduit = racewayIds.some(id => (project.conduits || []).some(conduit => [conduit.id, conduit.conduit_id, conduit.tag].includes(id)));
  const voltage = scope.voltageV;
  const rawSizeMm2 = cableSizeMm2(cable.conductor_size || cable.size || cable.size_mm2);
  const standardSizesMm2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000, 1200, 1600, 2000, 2500];
  const sizeMm2 = standardSizesMm2.find(size => size >= rawSizeMm2) || standardSizesMm2.at(-1);
  const insulationText = text(cable.insulation || cable.insulation_type || designBasis.sizingDefaults?.insulationType, 'XLPE').toUpperCase();
  const insulation = insulationText.includes('EPR') ? 'EPR'
    : insulationText.includes('LSZH') ? 'LSZH'
      : insulationText.includes('PAPER') ? 'Paper-MV'
        : insulationText.includes('PVC') || insulationText.includes('THW') ? 'PVC'
          : 'XLPE';
  return {
    inputs: {
      sizeMm2,
      material: /al/i.test(cable.conductor_material || cable.material || '') ? 'Al' : 'Cu',
      insulation,
      nCores: Math.max(1, Math.round(finite(cable.conductors || cable.conductors_count, 3))),
      installMethod: inTray ? 'tray' : inConduit ? 'conduit' : text(designBasis.sizingDefaults?.installationType, 'air'),
      ambientTempC: normalizeProjectMeta(project.projectMeta).maxAmbientTempC,
      U0_kV: voltage > 0 ? Number((voltage / Math.sqrt(3) / 1000).toFixed(3)) : 0,
    },
    bindings: {
      sizeMm2: { sourcePath: `${scope.scopeValue}.conductor_size`, sourceLabel: 'Cable Schedule' },
      material: { sourcePath: `${scope.scopeValue}.conductor_material`, sourceLabel: 'Cable Schedule' },
      insulation: { sourcePath: `${scope.scopeValue}.insulation`, sourceLabel: 'Cable / Design Basis' },
      nCores: { sourcePath: `${scope.scopeValue}.conductors`, sourceLabel: 'Cable Schedule' },
      installMethod: { sourcePath: `${scope.scopeValue}.raceway_ids`, sourceLabel: 'Raceway assignment' },
      ambientTempC: { sourcePath: 'projectMeta.maxAmbientTempC', sourceLabel: 'Maximum ambient' },
      U0_kV: { sourcePath: `${scope.scopeValue}.voltage`, sourceLabel: 'Cable Schedule' },
    },
    missing: [
      ...(!rawSizeMm2 ? ['Cable conductor size is missing or unsupported.'] : []),
      ...(!voltage ? ['Cable operating voltage is missing.'] : []),
    ],
  };
}

export function buildBessHazardProjectInputs(project = {}) {
  const battery = project.studies?.batterySizing || {};
  const equipment = (Array.isArray(project.equipment) ? project.equipment : []).find(item => (
    /battery|bess|ups|energy storage/i.test([item.category, item.subCategory, item.description, item.tag].filter(Boolean).join(' '))
  )) || {};
  const rawChemistry = text(equipment.chemistry || battery.chemistry).toLowerCase();
  const chemistry = rawChemistry.includes('nicd') || rawChemistry.includes('nickel') ? 'NiCd'
    : rawChemistry.includes('lead') ? 'lead-acid'
      : rawChemistry.includes('nca') ? 'NCA'
        : rawChemistry.includes('nmc') ? 'NMC'
          : 'LFP';
  const rack = battery.rackLayoutInputs || {};
  const ratedKwh = finite(
    equipment.ratedKwh || equipment.capacityKwh || equipment.energyKwh
      || battery.selectedBankKwh || battery.selectedKwh || battery.kwhSelected,
    0
  );
  return {
    inputs: {
      ratedKwh,
      chemistry,
      cellsPerModule: Math.max(1, Math.round(finite(equipment.cellsPerModule || rack.cellsPerModule, 16))),
      modulesPerRack: Math.max(1, Math.round(finite(equipment.modulesPerRack || rack.modulesPerRack, 8))),
      ambientC: normalizeProjectMeta(project.projectMeta).maxAmbientTempC,
    },
    bindings: {
      ratedKwh: { sourcePath: ratedKwh && equipment.id ? `equipment.${equipment.id}.ratedKwh` : 'studyResults.batterySizing.selectedBankKwh', sourceLabel: equipment.id ? 'Equipment' : 'Battery Sizing' },
      chemistry: { sourcePath: equipment.id ? `equipment.${equipment.id}.chemistry` : 'studyResults.batterySizing.chemistry', sourceLabel: equipment.id ? 'Equipment' : 'Battery Sizing' },
      cellsPerModule: { sourcePath: 'studyResults.batterySizing.rackLayoutInputs.cellsPerModule', sourceLabel: 'Battery rack layout' },
      modulesPerRack: { sourcePath: 'studyResults.batterySizing.rackLayoutInputs.modulesPerRack', sourceLabel: 'Battery rack layout' },
      ambientC: { sourcePath: 'projectMeta.maxAmbientTempC', sourceLabel: 'Maximum ambient' },
    },
    missing: ratedKwh ? [] : ['Run Battery Sizing or add BESS equipment capacity.'],
  };
}

export function buildInsulationCoordinationProjectInputs(scope, projectMeta = {}) {
  const nominalKv = scope.voltageV / 1000;
  const standardUm = [3.6, 7.2, 12, 17.5, 24, 36, 52, 72.5, 100, 123, 145, 170, 245, 300, 362, 420, 525, 765, 800, 1100];
  const umKv = standardUm.find(value => value >= nominalKv) || standardUm.at(-1);
  const equipment = scope.equipment || {};
  const mcov = finite(
    equipment.arresterMcovKv || equipment.mcovKv || equipment.surgeArresterMcovKv
      || equipment.props?.arrester_mcov_kv || equipment.props?.mcov_kv,
    0
  );
  return {
    inputs: {
      studyLabel: scope.label,
      nominalVoltageKv: Number(nominalKv.toFixed(3)),
      umKv,
      altitudeM: Number((normalizeProjectMeta(projectMeta).altitudeFt * 0.3048).toFixed(1)),
      surgeArresterMcovKv: mcov,
    },
    bindings: {
      studyLabel: { sourcePath: scope.scopeValue, sourceLabel: 'Selected project scope' },
      nominalVoltageKv: { sourcePath: `${scope.scopeValue}.voltage`, sourceLabel: 'Selected project scope' },
      umKv: { sourcePath: `${scope.scopeValue}.voltage`, sourceLabel: 'IEC voltage class' },
      altitudeM: { sourcePath: 'projectMeta.altitudeFt', sourceLabel: 'Site altitude' },
      surgeArresterMcovKv: { sourcePath: `${scope.scopeValue}.arresterMcovKv`, sourceLabel: 'Equipment / One-Line' },
    },
    missing: [
      ...(!nominalKv ? ['Selected equipment voltage is missing.'] : []),
      ...(!mcov ? ['Surge arrester MCOV is not available; enter the selected arrester value.'] : []),
    ],
  };
}
