import {
  DEFAULT_MCC_SECTION_WIDTH_IN,
  DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN,
  MCC_STARTER_TYPES,
  bucketHeightFromUnits,
  createMccUniqueId,
  normalizeMccLineup
} from '../mccLineupModel.mjs';

const LOAD_MANAGED_BUCKET_FIELDS = [
  'label',
  'equipmentTag',
  'equipmentDescription',
  'loadTag',
  'type',
  'status',
  'hp',
  'breakerA',
  'starterType',
  'starterSize',
  'cableTag',
  'notes'
];

function text(value) {
  return String(value ?? '').trim();
}

function token(value) {
  return text(value).toLowerCase();
}

function valuesEqual(left, right) {
  return String(left ?? '') === String(right ?? '');
}

function explicitValue(load, fields) {
  for (const field of fields) {
    if (text(load?.[field])) return text(load[field]);
  }
  return '';
}

function loadBucketType(load) {
  const kind = token(load?.loadType || load?.type);
  if (kind.includes('spare')) return 'spare';
  if (kind.includes('vfd') || kind.includes('variable frequency')) return 'vfd';
  if (kind.includes('motor')) return 'starter';
  if (kind.includes('breaker')) return 'breaker';
  return 'feeder';
}

function bucketSourceValues(load) {
  const equipmentTag = explicitValue(load, ['tag', 'ref', 'id']);
  const type = loadBucketType(load);
  const status = type === 'spare' ? 'spare' : 'active';
  const requestedStarterType = token(explicitValue(load, ['starterType', 'starter_type'])).replace(/[\s_]+/g, '-');
  return {
    label: equipmentTag || 'LOAD',
    equipmentTag,
    equipmentDescription: text(load.description),
    loadTag: equipmentTag,
    type,
    status,
    hp: explicitValue(load, ['hp', 'horsepower', 'motorHp', 'motorHP']),
    breakerA: explicitValue(load, ['breakerA', 'ocpdRating', 'ocpd_rating']),
    starterType: MCC_STARTER_TYPES.includes(requestedStarterType) ? requestedStarterType : '',
    starterSize: explicitValue(load, ['starterSize', 'starter_size']),
    cableTag: explicitValue(load, ['cableTag', 'cable_tag']),
    notes: text(load.notes)
  };
}

function sourceMetadata(load) {
  return {
    loadListManaged: true,
    sourceLoadId: text(load.id || load.ref || load.tag),
    sourceLoadTag: text(load.tag || load.ref || load.id),
    sourceCircuit: text(load.circuit),
    sourceLoadType: text(load.loadType || load.type),
    sourceKw: text(load.kw),
    sourceVoltage: text(load.voltage),
    sourceQuantity: text(load.quantity)
  };
}

function newManagedBucket(load, lineup) {
  const sourceValues = bucketSourceValues(load);
  const requestedUnits = Number.parseFloat(load.mccBucketUnits ?? load.bucketUnits ?? load.sizeUnits);
  const sizeUnits = Number.isFinite(requestedUnits) && requestedUnits > 0 ? requestedUnits : 1;
  return {
    id: createMccUniqueId('mcc-bkt'),
    mainDevice: '',
    sizeUnits,
    heightIn: bucketHeightFromUnits(sizeUnits, lineup.unitHeightIn),
    motorSpaceHeaterRequired: false,
    motorSpaceHeaterVa: '',
    ...sourceValues,
    ...sourceMetadata(load),
    loadListSourceValues: sourceValues
  };
}

function refreshManagedBucket(bucket, load) {
  const incoming = bucketSourceValues(load);
  const previous = bucket.loadListSourceValues && typeof bucket.loadListSourceValues === 'object'
    ? bucket.loadListSourceValues
    : {};
  const next = { ...bucket };
  let sourceChanged = false;
  let manualOverrides = 0;

  LOAD_MANAGED_BUCKET_FIELDS.forEach(field => {
    const hadPrevious = Object.prototype.hasOwnProperty.call(previous, field);
    if (!valuesEqual(previous[field], incoming[field])) sourceChanged = true;
    if (!hadPrevious || valuesEqual(bucket[field], previous[field])) {
      next[field] = incoming[field];
    } else if (!valuesEqual(bucket[field], incoming[field])) {
      manualOverrides += 1;
    }
  });

  Object.assign(next, sourceMetadata(load));
  next.loadListSourceValues = incoming;
  return { bucket: next, sourceChanged, manualOverrides };
}

function voltageNumber(value) {
  const parsed = Number.parseFloat(text(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function loadHasMeaningfulData(load) {
  return ['tag', 'ref', 'id', 'description', 'kw', 'loadType'].some(field => text(load?.[field]));
}

export function mccLoadListTarget(lineup = {}) {
  return text(lineup.equipmentTag || lineup.tag);
}

export function loadsForMccLineup(loads = [], lineup = {}) {
  const target = token(mccLoadListTarget(lineup));
  if (!target || !Array.isArray(loads)) return [];
  return loads.filter(load => loadHasMeaningfulData(load) && token(load.source) === target);
}

function loadWarnings(loads, lineup, createdCount) {
  const warnings = [];
  const lineupVoltage = voltageNumber(lineup.voltage);
  const missingTags = loads.filter(load => !text(load.tag || load.ref)).length;
  const quantityRows = loads.filter(load => {
    const quantity = Number.parseFloat(load.quantity);
    return Number.isFinite(quantity) && quantity > 1;
  }).length;
  const voltageMismatches = loads.filter(load => {
    const loadVoltage = voltageNumber(load.voltage);
    return lineupVoltage !== null && loadVoltage !== null && Math.abs(lineupVoltage - loadVoltage) > 0.5;
  }).length;
  const motorsMissingHp = loads.filter(load => (
    loadBucketType(load) === 'starter'
    && !explicitValue(load, ['hp', 'horsepower', 'motorHp', 'motorHP'])
  )).length;
  const missingBucketSize = loads.filter(load => {
    const units = Number.parseFloat(load.mccBucketUnits ?? load.bucketUnits ?? load.sizeUnits);
    return !Number.isFinite(units) || units <= 0;
  }).length;

  if (!loads.length) warnings.push(`No Load List records use ${mccLoadListTarget(lineup)} as their Source / Panel.`);
  if (missingTags) warnings.push(`${missingTags} matching load${missingTags === 1 ? '' : 's'} lack a tag; generated project IDs will be used.`);
  if (quantityRows) warnings.push(`${quantityRows} load row${quantityRows === 1 ? ' has' : 's have'} quantity above 1; each row creates one bucket pending equipment-level confirmation.`);
  if (voltageMismatches) warnings.push(`${voltageMismatches} load${voltageMismatches === 1 ? '' : 's'} do not match the lineup voltage.`);
  if (motorsMissingHp) warnings.push(`${motorsMissingHp} motor load${motorsMissingHp === 1 ? '' : 's'} lack explicit horsepower; horsepower, starter size, and protective-device ratings remain unassigned.`);
  if (createdCount && missingBucketSize) warnings.push(`${missingBucketSize} load${missingBucketSize === 1 ? '' : 's'} lack an explicit MCC bucket size; new buckets use one MCC unit for preliminary layout.`);
  return warnings;
}

function packManagedSections(lineup, buckets, previousSections = []) {
  if (!buckets.length) return [];
  const capacity = Math.max(1, Number.parseFloat(lineup.usableBucketHeightIn) || 72);
  const sections = [];
  let current = null;
  let used = 0;

  buckets.forEach(bucket => {
    const height = Math.max(1, Number.parseFloat(bucket.heightIn) || bucketHeightFromUnits(bucket.sizeUnits || 1, lineup.unitHeightIn));
    if (!current || (used > 0 && used + height > capacity)) {
      const previous = previousSections[sections.length];
      current = {
        id: previous?.id || createMccUniqueId('mcc-sec'),
        name: `Load List ${sections.length + 1}`,
        widthIn: previous?.widthIn || DEFAULT_MCC_SECTION_WIDTH_IN,
        verticalWirewayWidthIn: previous?.verticalWirewayWidthIn ?? DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN,
        loadListManaged: true,
        buckets: []
      };
      sections.push(current);
      used = 0;
    }
    current.buckets.push(bucket);
    used += height;
  });
  return sections;
}

export function reconcileMccLineupFromLoads(lineup = {}, loads = []) {
  const normalized = normalizeMccLineup(lineup);
  const matchingLoads = loadsForMccLineup(loads, normalized);
  const previousManagedSections = normalized.sections.filter(section => section.loadListManaged);
  const existingManagedBuckets = new Map();
  let manualBucketsPreserved = 0;

  normalized.sections.forEach(section => {
    section.buckets.forEach(bucket => {
      if (bucket.loadListManaged && bucket.sourceLoadId) {
        existingManagedBuckets.set(text(bucket.sourceLoadId), bucket);
      } else {
        manualBucketsPreserved += 1;
      }
    });
  });

  const summary = {
    target: mccLoadListTarget(normalized),
    matched: matchingLoads.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    manualOverrides: 0,
    manualBucketsPreserved,
    generatedSections: 0,
    warnings: [],
    loads: matchingLoads.map(load => ({
      id: text(load.id),
      tag: text(load.tag || load.ref || load.id),
      description: text(load.description),
      loadType: text(load.loadType),
      kw: text(load.kw),
      voltage: text(load.voltage)
    }))
  };

  const seenLoadIds = new Set();
  const managedBuckets = matchingLoads.map(load => {
    const sourceLoadId = text(load.id || load.ref || load.tag);
    seenLoadIds.add(sourceLoadId);
    const existing = existingManagedBuckets.get(sourceLoadId);
    if (!existing) {
      summary.created += 1;
      return newManagedBucket(load, normalized);
    }
    const refreshed = refreshManagedBucket(existing, load);
    summary.manualOverrides += refreshed.manualOverrides;
    if (refreshed.sourceChanged) summary.updated += 1;
    else summary.unchanged += 1;
    return refreshed.bucket;
  });

  summary.removed = Array.from(existingManagedBuckets.keys()).filter(id => !seenLoadIds.has(id)).length;
  summary.warnings = loadWarnings(matchingLoads, normalized, summary.created);

  const manualSections = normalized.sections.reduce((sections, section) => {
    const manualBuckets = section.buckets.filter(bucket => !bucket.loadListManaged || !bucket.sourceLoadId);
    if (!section.loadListManaged || manualBuckets.length) {
      sections.push({ ...section, loadListManaged: false, buckets: manualBuckets });
    }
    return sections;
  }, []);
  const manualSectionIds = new Set(manualSections.map(section => section.id));
  const reusableManagedSections = previousManagedSections.filter(section => !manualSectionIds.has(section.id));
  const generatedSections = packManagedSections(normalized, managedBuckets, reusableManagedSections);
  summary.generatedSections = generatedSections.length;

  return {
    lineup: normalizeMccLineup({ ...normalized, sections: [...manualSections, ...generatedSections] }),
    summary
  };
}
