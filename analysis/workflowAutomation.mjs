import { sizeFeederFromKw } from './autoSize.mjs';
import { designBasisToAutomationOptions, summarizeDesignBasis } from './designBasis.mjs';

const DEFAULT_OPTIONS = {
  defaultLengthFt: 100,
  defaultTrayId: 'TR-AUTO-001',
  defaultTrayWidthIn: 12,
  defaultTrayDepthIn: 4,
  defaultTrayElevationFt: 10,
  conductorMaterial: 'copper',
  insulationType: 'THWN-2',
  tempRating: 75,
  installationType: 'conduit',
  defaultPowerFactor: 0.9,
  voltageDropLimitPct: 3,
  continuousLoadPolicy: 'assume-continuous',
  fieldRoutePolicy: 'allow-field-legs',
  fillLimitPct: 40,
  routeResultSource: 'workflowAutomation'
};

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.values(value).some(hasValue);
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function meaningfulRows(rows) {
  return Array.isArray(rows)
    ? rows.filter(row => row && typeof row === 'object' && Object.values(row).some(hasValue))
    : [];
}

function fieldValue(record, fields) {
  for (const field of fields) {
    if (hasValue(record?.[field])) return record[field];
  }
  return '';
}

function text(value) {
  return String(value || '').trim();
}

function normalizedKey(value) {
  return text(value).toLowerCase();
}

function numberValue(value) {
  if (!hasValue(value)) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function equipmentTag(record) {
  return text(fieldValue(record, ['tag', 'ref', 'id', 'equipment_id', 'equipmentId', 'name']));
}

function loadTag(record) {
  return text(fieldValue(record, ['tag', 'ref', 'id', 'load_id', 'loadId', 'equipment_tag', 'equipmentTag', 'description']));
}

function cableTag(record) {
  return text(fieldValue(record, ['tag', 'name', 'id', 'cable_id', 'cableId', 'ref']));
}

function cableFrom(record) {
  return text(fieldValue(record, ['from_tag', 'fromTag', 'start_tag', 'startTag', 'from', 'source', 'source_tag']));
}

function cableTo(record) {
  return text(fieldValue(record, ['to_tag', 'toTag', 'end_tag', 'endTag', 'to', 'destination', 'load', 'load_tag']));
}

function routeResultTag(record) {
  return text(fieldValue(record, ['cable', 'tag', 'name', 'id', 'cable_tag', 'cableId']));
}

function slug(value, fallback = 'ITEM') {
  const cleaned = text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function componentIdFor(prefix, tag) {
  return `${prefix}-${slug(tag).toLowerCase()}`;
}

function sourceVoltageFor(load, sourceEquipment) {
  return numberValue(load?.voltage) || numberValue(sourceEquipment?.voltage) || null;
}

function loadPowerFactor(load, fallback = 0.9) {
  const pf = numberValue(fieldValue(load, ['powerFactor', 'pf', 'power_factor']));
  return pf && pf > 0 && pf <= 1 ? pf : fallback;
}

function loadPhase(load) {
  const phases = Number.parseInt(fieldValue(load, ['phases', 'phase']), 10);
  return phases === 1 ? '1ph' : '3ph';
}

function connectedKw(load) {
  const qty = numberValue(load?.quantity) || 1;
  const kw = numberValue(fieldValue(load, ['kw', 'kW', 'power_kw', 'power'])) || 0;
  return qty * kw;
}

function isContinuous(load, policy = 'assume-continuous') {
  const duty = text(fieldValue(load, ['duty', 'loadDuty'])).toLowerCase();
  if (!duty) return policy !== 'assume-noncontinuous';
  return duty.includes('continuous') || duty.includes('motor') || duty.includes('hvac');
}

function estimateDistanceFt(a, b, fallback) {
  const ax = numberValue(a?.x);
  const ay = numberValue(a?.y);
  const az = numberValue(a?.z) || 0;
  const bx = numberValue(b?.x);
  const by = numberValue(b?.y);
  const bz = numberValue(b?.z) || 0;
  if ([ax, ay, bx, by].every(value => Number.isFinite(value))) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const distance = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    if (distance > 0) return Math.round(distance * 1.1 * 10) / 10;
  }
  return fallback;
}

function pointFor(record, fallbackZ = 0) {
  const x = numberValue(record?.x);
  const y = numberValue(record?.y);
  const z = numberValue(record?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y, Number.isFinite(z) ? z : fallbackZ];
}

function distanceBetween(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const values = [...a.slice(0, 3), ...b.slice(0, 3)].map(Number);
  if (!values.every(Number.isFinite)) return 0;
  return Math.hypot(values[3] - values[0], values[4] - values[1], values[5] - values[2]);
}

function roundLength(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function codeBasisLabel(options) {
  const code = options.designBasis?.codeBasis;
  return code ? `${code.primaryCode} ${code.edition}` : 'NEC 2023 default';
}

function designBasisTrace(options, scope) {
  const trace = {
    scope,
    codeBasis: codeBasisLabel(options),
    generatedBy: 'Auto-Build Workflow'
  };
  if (scope === 'cable') {
    trace.conductorMaterial = options.conductorMaterial;
    trace.insulationType = options.insulationType;
    trace.temperatureRatingC = options.tempRating;
    trace.installationType = options.installationType;
    trace.defaultPowerFactor = options.defaultPowerFactor;
    trace.voltageDropLimitPct = options.voltageDropLimitPct;
    trace.continuousLoadPolicy = options.continuousLoadPolicy;
  }
  if (scope === 'raceway') {
    trace.defaultTrayId = options.defaultTrayId;
    trace.defaultTrayWidthIn = options.defaultTrayWidthIn;
    trace.defaultTrayDepthIn = options.defaultTrayDepthIn;
    trace.defaultTrayElevationFt = options.defaultTrayElevationFt;
    trace.fillLimitPct = options.fillLimitPct;
  }
  if (scope === 'route-result') {
    trace.fieldRoutePolicy = options.fieldRoutePolicy;
    trace.routeResultSource = options.routeResultSource;
  }
  return trace;
}

function inferComponentType(equipment) {
  const category = `${equipment?.category || ''} ${equipment?.subCategory || ''} ${equipment?.description || ''}`.toLowerCase();
  if (category.includes('transformer')) return { type: 'transformer', subtype: 'two_winding_transformer' };
  if (category.includes('panel')) return { type: 'panel', subtype: 'panelboard' };
  if (category.includes('mcc')) return { type: 'equipment', subtype: 'mcc' };
  if (category.includes('switchboard') || category.includes('switchgear') || category.includes('service') || category.includes('source')) {
    return { type: 'source', subtype: 'utility_source' };
  }
  return { type: 'equipment', subtype: 'equipment' };
}

function inferLoadSubtype(load) {
  const kind = `${load?.loadType || ''} ${load?.description || ''}`.toLowerCase();
  if (kind.includes('motor') || kind.includes('pump') || kind.includes('fan')) return 'motor_load';
  if (kind.includes('lighting')) return 'lighting_load';
  if (kind.includes('receptacle')) return 'receptacle_load';
  return 'load';
}

function addIfBlank(record, field, value) {
  if (!hasValue(value) || hasValue(record[field])) return false;
  record[field] = value;
  return true;
}

function cloneOneLine(oneLine) {
  const source = oneLine && typeof oneLine === 'object' ? oneLine : {};
  const sheets = Array.isArray(source.sheets) ? source.sheets : [];
  return {
    activeSheet: Number.isInteger(source.activeSheet) && source.activeSheet >= 0 ? source.activeSheet : 0,
    sheets: sheets.map(sheet => ({
      ...sheet,
      components: Array.isArray(sheet.components) ? sheet.components.map(component => ({
        ...component,
        connections: Array.isArray(component.connections) ? component.connections.map(connection => ({ ...connection })) : []
      })) : [],
      connections: Array.isArray(sheet.connections) ? sheet.connections.map(connection => ({ ...connection })) : []
    }))
  };
}

function getOrCreateSheet(oneLine) {
  if (!oneLine.sheets.length) {
    oneLine.sheets.push({ id: 'workflow-auto-main', name: 'Workflow Auto-Build', components: [], connections: [] });
    oneLine.activeSheet = 0;
  }
  const activeIndex = Math.min(Math.max(oneLine.activeSheet || 0, 0), oneLine.sheets.length - 1);
  return oneLine.sheets[activeIndex];
}

function indexComponents(sheet) {
  const byRef = new Map();
  const byId = new Map();
  (sheet.components || []).forEach(component => {
    if (component.id) byId.set(component.id, component);
    [
      component.ref,
      component.label,
      component.equipmentRef,
      component.loadRef,
      component.panelRef,
      component.scheduleLinks?.equipment,
      component.scheduleLinks?.load,
      component.scheduleLinks?.panel
    ].forEach(value => {
      const key = normalizedKey(value);
      if (key && !byRef.has(key)) byRef.set(key, component);
    });
  });
  return { byRef, byId };
}

function ensureConnection(source, targetId, cable) {
  if (!source || !targetId) return false;
  if (!Array.isArray(source.connections)) source.connections = [];
  const existing = source.connections.find(connection => connection?.target === targetId);
  if (existing) {
    if (!existing.cable && cable) {
      existing.cable = cable;
      return true;
    }
    return false;
  }
  source.connections.push({ target: targetId, ...(cable ? { cable } : {}) });
  return true;
}

function connectionKey(connection) {
  return [
    normalizedKey(connection?.from),
    normalizedKey(connection?.to || connection?.target),
    normalizedKey(connection?.tag || connection?.cable?.tag)
  ].join('|');
}

function syncSheetConnections(sheet) {
  if (!sheet) return;
  const flatConnections = Array.isArray(sheet.connections)
    ? sheet.connections.map(connection => ({ ...connection }))
    : [];
  const seen = new Set(flatConnections.map(connectionKey));
  (sheet.components || []).forEach(component => {
    (component.connections || []).forEach(connection => {
      const flattened = {
        ...connection,
        from: component.id,
        to: connection.target
      };
      const key = connectionKey(flattened);
      if (!key || seen.has(key)) return;
      flatConnections.push(flattened);
      seen.add(key);
    });
  });
  sheet.connections = flatConnections;
}

function ensureOneLine({ equipment, loads, oneLine, cables }, options) {
  const nextOneLine = cloneOneLine(oneLine);
  const sheet = getOrCreateSheet(nextOneLine);
  if (!Array.isArray(sheet.components)) sheet.components = [];
  const equipmentRows = meaningfulRows(equipment);
  const loadRows = meaningfulRows(loads);
  const equipmentByTag = new Map(equipmentRows.map(row => [normalizedKey(equipmentTag(row)), row]).filter(([key]) => key));
  const index = indexComponents(sheet);
  let createdComponents = 0;
  let createdConnections = 0;

  equipmentRows.forEach((row, indexOffset) => {
    const tag = equipmentTag(row);
    if (!tag || index.byRef.has(normalizedKey(tag))) return;
    const typeInfo = inferComponentType(row);
    const component = {
      id: componentIdFor('comp', tag),
      ...typeInfo,
      label: tag,
      ref: tag,
      x: numberValue(row.x) ?? 120,
      y: numberValue(row.y) ?? 120 + (indexOffset * 120),
      equipmentRef: tag,
      scheduleLinks: { equipment: tag },
      _workflowAutoGenerated: true
    };
    sheet.components.push(component);
    index.byRef.set(normalizedKey(tag), component);
    index.byId.set(component.id, component);
    createdComponents += 1;
  });

  loadRows.forEach((load, loadIndex) => {
    const tag = loadTag(load);
    if (!tag) return;
    let loadComponent = index.byRef.get(normalizedKey(tag));
    if (!loadComponent) {
      loadComponent = {
        id: componentIdFor('load', tag),
        type: 'load',
        subtype: inferLoadSubtype(load),
        label: tag,
        ref: tag,
        x: 520,
        y: 120 + (loadIndex * 120),
        loadRef: tag,
        equipmentRef: tag,
        scheduleLinks: { load: tag },
        _workflowAutoGenerated: true
      };
      sheet.components.push(loadComponent);
      index.byRef.set(normalizedKey(tag), loadComponent);
      index.byId.set(loadComponent.id, loadComponent);
      createdComponents += 1;
    }
    const sourceTag = text(load.source);
    const sourceEquipment = equipmentByTag.get(normalizedKey(sourceTag));
    const sourceComponent = sourceTag ? index.byRef.get(normalizedKey(sourceTag)) : null;
    const sourceX = numberValue(sourceEquipment?.x);
    const sourceY = numberValue(sourceEquipment?.y);
    if (sourceComponent && !hasValue(loadComponent.x) && Number.isFinite(sourceX)) loadComponent.x = sourceX + 320;
    if (sourceComponent && !hasValue(loadComponent.y) && Number.isFinite(sourceY)) loadComponent.y = sourceY;
    const cable = findCableForLoad(cables, sourceTag, tag);
    const changed = ensureConnection(sourceComponent, loadComponent.id, cable ? {
      tag: cableTag(cable),
      conductor_size: fieldValue(cable, ['conductor_size', 'conductorSize', 'size']),
      length: fieldValue(cable, ['length', 'length_ft', 'lengthFt', 'estimated_length'])
    } : null);
    if (changed) createdConnections += 1;
  });

  syncSheetConnections(sheet);

  return { oneLine: nextOneLine, createdComponents, createdConnections };
}

function findCableForLoad(cables, sourceTag, loadTagValue) {
  const sourceKey = normalizedKey(sourceTag);
  const loadKey = normalizedKey(loadTagValue);
  return meaningfulRows(cables).find(cable => {
    const fromKey = normalizedKey(cableFrom(cable));
    const toKey = normalizedKey(cableTo(cable));
    return fromKey === sourceKey && toKey === loadKey;
  }) || null;
}

function buildCableTag(sourceTag, loadTagValue, usedTags) {
  const base = `CBL-${slug(sourceTag, 'SRC')}-${slug(loadTagValue, 'LOAD')}`;
  let candidate = base;
  let suffix = 2;
  while (usedTags.has(normalizedKey(candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedTags.add(normalizedKey(candidate));
  return candidate;
}

function sizeLoadCable(load, sourceEquipment, options, assumptions, warnings) {
  const kw = connectedKw(load);
  const voltage = sourceVoltageFor(load, sourceEquipment);
  if (!(kw > 0) || !(voltage > 0)) {
    warnings.push(`Skipped conductor sizing for ${loadTag(load) || 'load'} because kW or voltage is missing.`);
    return null;
  }
  if (options.continuousLoadPolicy === 'require-duty-field' && !hasValue(fieldValue(load, ['duty', 'loadDuty']))) {
    warnings.push(`${loadTag(load) || 'Load'} is missing duty classification required by the design basis; continuous-load sizing was assumed until reviewed.`);
  }
  try {
    const result = sizeFeederFromKw({
      kw,
      pf: loadPowerFactor(load, options.defaultPowerFactor),
      voltage,
      phase: loadPhase(load),
      continuous: isContinuous(load, options.continuousLoadPolicy),
      material: options.conductorMaterial,
      tempRating: options.tempRating,
      installationType: options.installationType
    });
    assumptions.add('Cable conductors sized from connected load using NEC 210.20(A)/215.3 and Table 310.16 defaults; verify duty, ambient, bundling, and terminal ratings.');
    return result;
  } catch (error) {
    warnings.push(`Could not size conductor for ${loadTag(load) || 'load'}: ${error.message}`);
    return null;
  }
}

function ensureCables({ equipment, loads, cables }, options, assumptions, warnings) {
  const nextCables = meaningfulRows(cables).map(cable => ({ ...cable }));
  const equipmentByTag = new Map(meaningfulRows(equipment).map(row => [normalizedKey(equipmentTag(row)), row]).filter(([key]) => key));
  const usedTags = new Set(nextCables.map(cable => normalizedKey(cableTag(cable))).filter(Boolean));
  let created = 0;
  let updated = 0;

  meaningfulRows(loads).forEach(load => {
    const sourceTag = text(load.source);
    const targetTag = loadTag(load);
    if (!sourceTag || !targetTag) {
      warnings.push(`Skipped cable creation for ${targetTag || 'untagged load'} because source or load tag is missing.`);
      return;
    }
    const sourceEquipment = equipmentByTag.get(normalizedKey(sourceTag));
    const loadEquipment = equipmentByTag.get(normalizedKey(targetTag));
    const sizing = sizeLoadCable(load, sourceEquipment, options, assumptions, warnings);
    const length = estimateDistanceFt(sourceEquipment, loadEquipment, options.defaultLengthFt);
    const incoming = {
      tag: buildCableTag(sourceTag, targetTag, usedTags),
      from_tag: sourceTag,
      to_tag: targetTag,
      source_tag: sourceTag,
      load_tag: targetTag,
      voltage: sourceVoltageFor(load, sourceEquipment) || '',
      phases: fieldValue(load, ['phases', 'phase']) || '',
      kw: connectedKw(load) || '',
      powerFactor: loadPowerFactor(load, options.defaultPowerFactor),
      length,
      estimated_length: length,
      conductor_material: options.conductorMaterial,
      insulation_type: options.insulationType,
      install_method: options.installationType,
      voltage_drop_limit_pct: options.voltageDropLimitPct,
      _workflowAutoGenerated: true,
      _workflowBasis: 'Generated from Load List source/load relationship.',
      _designBasis: designBasisTrace(options, 'cable')
    };
    if (sizing && !sizing.error) {
      incoming.conductor_size = `${sizing.conductorSize} ${options.conductorMaterial === 'aluminum' ? 'AL' : 'CU'}`;
      incoming.ocpd_rating = sizing.ocpdRating;
      incoming.load_amps = sizing.loadAmps;
      incoming.required_amps = sizing.requiredAmps;
      incoming.sizing_basis = 'NEC 210.20(A), 215.3, 240.4(B), 240.6(A), 310.16';
    }

    const existing = nextCables.find(cable => normalizedKey(cableFrom(cable)) === normalizedKey(sourceTag)
      && normalizedKey(cableTo(cable)) === normalizedKey(targetTag));
    if (!existing) {
      nextCables.push(incoming);
      created += 1;
      return;
    }
    let changed = false;
    Object.entries(incoming).forEach(([field, value]) => {
      changed = addIfBlank(existing, field, value) || changed;
    });
    if (changed) updated += 1;
  });

  return { cables: nextCables, created, updated };
}

function firstRacewayId({ trays = [], conduits = [], ductbanks = [] }) {
  const tray = meaningfulRows(trays).find(row => hasValue(fieldValue(row, ['tray_id', 'trayId', 'id', 'tag', 'ref'])));
  if (tray) return text(fieldValue(tray, ['tray_id', 'trayId', 'id', 'tag', 'ref']));
  const conduit = meaningfulRows(conduits).find(row => hasValue(fieldValue(row, ['conduit_id', 'conduitId', 'id', 'tag', 'ref'])));
  if (conduit) return text(fieldValue(conduit, ['conduit_id', 'conduitId', 'id', 'tag', 'ref']));
  const ductbank = meaningfulRows(ductbanks).find(row => hasValue(fieldValue(row, ['tag', 'ductbank_id', 'ductbankId', 'id', 'ref'])));
  return ductbank ? text(fieldValue(ductbank, ['tag', 'ductbank_id', 'ductbankId', 'id', 'ref'])) : '';
}

function cableHasRaceway(cable) {
  return hasValue(fieldValue(cable, [
    'raceway_ids',
    'racewayIds',
    'raceway_id',
    'racewayId',
    'raceway',
    'tray_id',
    'trayId',
    'conduit_id',
    'conduitId',
    'ductbank_id',
    'ductbankId'
  ]));
}

function ensureRaceways({ equipment, trays, conduits, ductbanks, cables }, options, assumptions) {
  const nextTrays = meaningfulRows(trays).map(row => ({ ...row }));
  const nextConduits = meaningfulRows(conduits).map(row => ({ ...row }));
  const nextDuctbanks = meaningfulRows(ductbanks).map(row => ({ ...row }));
  let racewayId = firstRacewayId({ trays: nextTrays, conduits: nextConduits, ductbanks: nextDuctbanks });
  let created = 0;
  let assignedCables = 0;

  if (!racewayId && meaningfulRows(cables).length) {
    const equipmentByTag = new Map(meaningfulRows(equipment).map(row => [normalizedKey(equipmentTag(row)), row]).filter(([key]) => key));
    const firstCable = meaningfulRows(cables)[0] || {};
    const sourcePoint = pointFor(equipmentByTag.get(normalizedKey(cableFrom(firstCable))));
    const loadPoint = pointFor(equipmentByTag.get(normalizedKey(cableTo(firstCable))));
    racewayId = options.defaultTrayId;
    nextTrays.push({
      tray_id: racewayId,
      inside_width: options.defaultTrayWidthIn,
      tray_depth: options.defaultTrayDepthIn,
      tray_type: 'Ladder',
      material: 'Steel',
      cover_condition: 'Open',
      allowed_cable_group: 'Power',
      fill_limit_pct: options.fillLimitPct,
      start_x: sourcePoint?.[0] ?? 0,
      start_y: sourcePoint?.[1] ?? 0,
      start_z: options.defaultTrayElevationFt,
      end_x: loadPoint?.[0] ?? Math.max(options.defaultLengthFt, 100),
      end_y: loadPoint?.[1] ?? 0,
      end_z: options.defaultTrayElevationFt,
      _workflowAutoGenerated: true,
      _workflowBasis: 'Starter tray generated so schedule-ready cables have a routing destination.',
      _designBasis: designBasisTrace(options, 'raceway')
    });
    created = 1;
    assumptions.add(`Starter raceway uses a ${options.defaultTrayWidthIn} in x ${options.defaultTrayDepthIn} in open ladder tray with placeholder geometry; route, supports, fill, and tray type must be confirmed.`);
  }

  const nextCables = meaningfulRows(cables).map(cable => {
    const copy = { ...cable };
    if (racewayId && !cableHasRaceway(copy)) {
      copy.raceway_ids = [racewayId];
      copy.raceway_id = racewayId;
      copy._workflowRacewayAssigned = true;
      assignedCables += 1;
    }
    return copy;
  });

  return {
    trays: nextTrays,
    conduits: nextConduits,
    ductbanks: nextDuctbanks,
    cables: nextCables,
    created,
    assignedCables
  };
}

function assignedRacewayIds(cable) {
  const values = [];
  [
    'raceway_ids',
    'racewayIds',
    'raceway_id',
    'racewayId',
    'raceway',
    'tray_id',
    'trayId',
    'conduit_id',
    'conduitId',
    'ductbank_id',
    'ductbankId'
  ].forEach(field => {
    const value = cable?.[field];
    if (Array.isArray(value)) values.push(...value);
    else if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) values.push(...parsed);
        else values.push(value);
      } catch {
        values.push(value);
      }
    } else if (typeof value === 'string' && /[,;|]/.test(value)) {
      values.push(...value.split(/[,;|]/));
    } else {
      values.push(value);
    }
  });
  return [...new Set(values.map(text).filter(Boolean))];
}

function geometryPoint(record, prefix) {
  const x = numberValue(record?.[`${prefix}_x`] ?? record?.[`${prefix}X`]);
  const y = numberValue(record?.[`${prefix}_y`] ?? record?.[`${prefix}Y`]);
  const z = numberValue(record?.[`${prefix}_z`] ?? record?.[`${prefix}Z`]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y, Number.isFinite(z) ? z : 0];
}

function racewayRecordId(record, fields) {
  return text(fieldValue(record, fields));
}

function buildRacewayIndex({ trays = [], conduits = [], ductbanks = [] }) {
  const entries = new Map();
  const add = (record, fields, kind) => {
    const id = racewayRecordId(record, fields);
    const start = geometryPoint(record, 'start');
    const end = geometryPoint(record, 'end');
    if (!id || !start || !end) return;
    entries.set(normalizedKey(id), {
      id,
      kind,
      record,
      start,
      end,
      length: roundLength(distanceBetween(start, end))
    });
  };
  meaningfulRows(trays).forEach(row => add(row, ['tray_id', 'trayId', 'id', 'tag', 'ref'], 'tray'));
  meaningfulRows(conduits).forEach(row => add(row, ['conduit_id', 'conduitId', 'id', 'tag', 'ref'], 'conduit'));
  meaningfulRows(ductbanks).forEach(row => add(row, ['tag', 'ductbank_id', 'ductbankId', 'id', 'ref'], 'ductbank'));
  return entries;
}

function routeResultRows(routeResults) {
  if (Array.isArray(routeResults)) return routeResults.filter(row => row && typeof row === 'object').map(row => ({ ...row }));
  if (routeResults && typeof routeResults === 'object') {
    if (Array.isArray(routeResults.batchResults)) return routeResults.batchResults.filter(row => row && typeof row === 'object').map(row => ({ ...row }));
    if (Array.isArray(routeResults.routeResults)) return routeResults.routeResults.filter(row => row && typeof row === 'object').map(row => ({ ...row }));
    if (Array.isArray(routeResults.latestRouteData)) return routeResults.latestRouteData.filter(row => row && typeof row === 'object').map(row => ({ ...row }));
    if (Array.isArray(routeResults.results)) return routeResults.results.filter(row => row && typeof row === 'object').map(row => ({ ...row }));
  }
  return [];
}

function routeResultSucceeded(result) {
  const status = text(result?.status).toLowerCase();
  if (/fail|error|not routed/.test(status)) return false;
  const totalLength = numberValue(result?.total_length ?? result?.totalLength ?? result?.length);
  return totalLength > 0 || status.includes('routed');
}

function segmentBreakdown(segment, index) {
  return {
    segment: index + 1,
    tray_id: segment.tray_id || 'Field Route',
    type: segment.type || 'field',
    start: segment.start,
    end: segment.end,
    length: roundLength(segment.length),
    raceway: segment.raceway_id || '',
    conduit_id: segment.conduit_id || '',
    ductbankTag: segment.ductbankTag || ''
  };
}

function fieldSegment(start, end) {
  const length = roundLength(distanceBetween(start, end));
  if (!(length > 0)) return null;
  return {
    type: 'field',
    tray_id: 'Field Route',
    start,
    end,
    length
  };
}

function racewaySegment(raceway, start, end) {
  const segment = {
    type: raceway.kind,
    tray_id: raceway.kind === 'tray' ? raceway.id : undefined,
    raceway_id: raceway.id,
    conduit_id: raceway.kind === 'conduit' ? raceway.id : (raceway.record?.conduit_id || raceway.record?.conduitId || ''),
    ductbankTag: raceway.kind === 'ductbank' ? raceway.id : (raceway.record?.ductbankTag || raceway.record?.ductbank_tag || ''),
    start,
    end,
    length: roundLength(distanceBetween(start, end))
  };
  return Object.fromEntries(Object.entries(segment).filter(([, value]) => hasValue(value)));
}

function buildRouteResultForCable(cable, racewayIndex, equipmentByTag, options, warnings) {
  const tag = cableTag(cable);
  const racewayIds = assignedRacewayIds(cable);
  if (!tag || !racewayIds.length) return null;
  const raceways = racewayIds.map(id => racewayIndex.get(normalizedKey(id))).filter(Boolean);
  if (!raceways.length) {
    warnings.push(`Skipped route result for ${tag} because assigned raceway geometry is missing.`);
    return null;
  }

  const sourcePoint = pointFor(equipmentByTag.get(normalizedKey(cableFrom(cable))));
  const loadPoint = pointFor(equipmentByTag.get(normalizedKey(cableTo(cable))));
  const routeSegments = [];
  let currentPoint = sourcePoint;
  const orientedRaceways = [];
  raceways.forEach((raceway, index) => {
    let start = raceway.start;
    let end = raceway.end;
    const fromPoint = index === 0 ? sourcePoint : orientedRaceways[index - 1]?.end;
    const toPoint = index === raceways.length - 1 ? loadPoint : raceways[index + 1]?.start;
    if (fromPoint || toPoint) {
      const normalScore = (fromPoint ? distanceBetween(fromPoint, start) : 0) + (toPoint ? distanceBetween(end, toPoint) : 0);
      const reversedScore = (fromPoint ? distanceBetween(fromPoint, end) : 0) + (toPoint ? distanceBetween(start, toPoint) : 0);
      if (reversedScore < normalScore) {
        start = raceway.end;
        end = raceway.start;
      }
    }
    orientedRaceways.push({ raceway, start, end });
  });

  orientedRaceways.forEach(({ raceway, start, end }) => {
    const field = currentPoint ? fieldSegment(currentPoint, start) : null;
    if (field) routeSegments.push(field);
    routeSegments.push(racewaySegment(raceway, start, end));
    currentPoint = end;
  });
  const finalField = currentPoint && loadPoint ? fieldSegment(currentPoint, loadPoint) : null;
  if (finalField) routeSegments.push(finalField);

  const totalLength = roundLength(routeSegments.reduce((sum, segment) => sum + (Number(segment.length) || 0), 0));
  if (!(totalLength > 0)) {
    warnings.push(`Skipped route result for ${tag} because generated route length is zero.`);
    return null;
  }
  const fieldLength = roundLength(routeSegments
    .filter(segment => segment.type === 'field')
    .reduce((sum, segment) => sum + (Number(segment.length) || 0), 0));
  if (fieldLength > 0 && options.fieldRoutePolicy === 'require-raceway-only') {
    warnings.push(`${tag} includes ${fieldLength} ft of field legs even though the design basis requires raceway-only route results.`);
  }
  const traySegments = routeSegments
    .filter(segment => segment.tray_id && segment.tray_id !== 'Field Route')
    .map(segment => segment.tray_id);
  return {
    cable: tag,
    status: 'Routed',
    mode: 'Workflow Auto-Build',
    total_length: totalLength,
    field_length: fieldLength,
    tray_segments_count: traySegments.length,
    segments_count: routeSegments.length,
    tray_segments: traySegments,
    route_segments: routeSegments,
    voltage_drop_pct: 'N/A',
    exclusions: [],
    breakdown: routeSegments.map(segmentBreakdown),
    _workflowAutoGenerated: true,
    _workflowBasis: 'Generated from assigned raceway geometry by Auto-Build Workflow.',
    _designBasis: designBasisTrace(options, 'route-result')
  };
}

function ensureRouteResults({ equipment, cables, trays, conduits, ductbanks, routeResults }, options, assumptions, warnings) {
  const nextRows = routeResultRows(routeResults);
  const routedTags = new Set(nextRows
    .filter(routeResultSucceeded)
    .map(routeResultTag)
    .map(normalizedKey)
    .filter(Boolean));
  const racewayIndex = buildRacewayIndex({ trays, conduits, ductbanks });
  const equipmentByTag = new Map(meaningfulRows(equipment).map(row => [normalizedKey(equipmentTag(row)), row]).filter(([key]) => key));
  let created = 0;

  meaningfulRows(cables).forEach(cable => {
    const tag = cableTag(cable);
    if (!tag || routedTags.has(normalizedKey(tag)) || !cableHasRaceway(cable)) return;
    const routeResult = buildRouteResultForCable(cable, racewayIndex, equipmentByTag, options, warnings);
    if (!routeResult) return;
    nextRows.push(routeResult);
    routedTags.add(normalizedKey(tag));
    created += 1;
  });

  if (created > 0) {
    assumptions.add('Auto-route results use assigned raceway geometry plus field legs from equipment coordinates; run Optimal Route when detailed routing, fill optimization, or manual path review is required.');
  }

  return {
    routeResults: {
      batchResults: nextRows,
      source: options.routeResultSource,
      updatedAt: new Date().toISOString()
    },
    created
  };
}

export function buildMinimalDesignAutomation(project = {}, opts = {}) {
  const sourceDesignBasis = opts.designBasis || project.designBasis || null;
  const designBasisOptions = sourceDesignBasis ? designBasisToAutomationOptions(sourceDesignBasis) : {};
  const options = {
    ...DEFAULT_OPTIONS,
    ...designBasisOptions,
    ...opts,
    designBasis: designBasisOptions.designBasis || sourceDesignBasis
  };
  const designBasisSummary = summarizeDesignBasis(options.designBasis);
  const assumptions = new Set();
  const warnings = [];

  if (designBasisSummary.configured) {
    const { basis } = designBasisSummary;
    assumptions.add(`Auto-Build defaults follow the saved ${designBasisSummary.codeLabel} design basis.`);
    if (basis.codeBasis.jurisdiction || basis.codeBasis.ahj) {
      assumptions.add(`Code-basis review context: ${basis.codeBasis.jurisdiction || 'jurisdiction not set'} / ${basis.codeBasis.ahj || 'AHJ not set'}.`);
    }
    if (basis.codeBasis.primaryCode !== 'NEC') {
      warnings.push(`Auto-Build conductor sizing currently uses NEC ampacity logic; verify generated cable sizes against ${basis.codeBasis.primaryCode} ${basis.codeBasis.edition}.`);
    }
  } else {
    warnings.push('Design Basis Wizard has not been saved; Auto-Build used default NEC, copper conductor, and starter routing assumptions.');
  }

  const cableResult = ensureCables({
    equipment: project.equipment || [],
    loads: project.loads || [],
    cables: project.cables || []
  }, options, assumptions, warnings);
  const racewayResult = ensureRaceways({
    equipment: project.equipment || [],
    trays: project.trays || [],
    conduits: project.conduits || [],
    ductbanks: project.ductbanks || [],
    cables: cableResult.cables
  }, options, assumptions);
  const oneLineResult = ensureOneLine({
    equipment: project.equipment || [],
    loads: project.loads || [],
    oneLine: project.oneLine || {},
    cables: racewayResult.cables
  }, options);
  const routeResult = ensureRouteResults({
    equipment: project.equipment || [],
    cables: racewayResult.cables,
    trays: racewayResult.trays,
    conduits: racewayResult.conduits,
    ductbanks: racewayResult.ductbanks,
    routeResults: project.routeResults || project.latestRouteResults || []
  }, options, assumptions, warnings);

  const changed = oneLineResult.createdComponents > 0
    || oneLineResult.createdConnections > 0
    || cableResult.created > 0
    || cableResult.updated > 0
    || racewayResult.created > 0
    || racewayResult.assignedCables > 0
    || routeResult.created > 0;

  return {
    changed,
    next: {
      oneLine: oneLineResult.oneLine,
      cables: racewayResult.cables,
      trays: racewayResult.trays,
      conduits: racewayResult.conduits,
      ductbanks: racewayResult.ductbanks,
      routeResults: routeResult.routeResults
    },
    summary: {
      createdOneLineComponents: oneLineResult.createdComponents,
      createdOneLineConnections: oneLineResult.createdConnections,
      createdCables: cableResult.created,
      updatedCables: cableResult.updated,
      createdRaceways: racewayResult.created,
      assignedCablesToRaceway: racewayResult.assignedCables,
      createdRouteResults: routeResult.created,
      assumptions: Array.from(assumptions),
      warnings,
      designBasis: designBasisSummary.configured ? designBasisSummary.basis : null,
      reviewGates: designBasisSummary.reviewGates,
      codeBasis: [
        designBasisSummary.configured ? `${designBasisSummary.codeLabel} saved project design basis` : 'Default NEC 2023 project design basis until wizard is saved',
        'NEC 210.20(A) and 215.3 continuous-load sizing basis',
        'NEC 240.4(B) and 240.6(A) OCPD sizing basis',
        'NEC Table 310.16 conductor ampacity basis',
        'NEC 392 starter tray placeholder requires fill and routing validation',
        'Route results are generated from assigned raceway geometry for workflow continuity'
      ]
    }
  };
}
