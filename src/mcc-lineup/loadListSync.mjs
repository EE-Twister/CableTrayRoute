import {
  DEFAULT_MCC_SECTION_WIDTH_IN,
  DEFAULT_MCC_VERTICAL_WIREWAY_WIDTH_IN,
  MCC_STARTER_TYPES,
  bucketHeightFromUnits,
  createMccUniqueId,
  normalizeMccLineup
} from '../mccLineupModel.mjs';
import {
  approximateMccBucketSizeFromNema,
  approximateNemaStarterSize
} from './nemaStarterSizing.mjs';
import { approximateFeederBreakerBucketSize } from './breakerBucketSizing.mjs';

const LOAD_MANAGED_BUCKET_FIELDS = [
  'label',
  'equipmentTag',
  'equipmentDescription',
  'loadTag',
  'type',
  'mainDevice',
  'status',
  'sizeUnits',
  'heightIn',
  'bucketSizeEstimated',
  'bucketSizeBasis',
  'bucketSizeEstimateKind',
  'hp',
  'breakerA',
  'breakerFrameA',
  'starterType',
  'starterSize',
  'starterSizeEstimated',
  'starterSizeBasis',
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
  const requestedType = token(load?.mccUnitType || load?.mccBucketType || load?.bucketType).replace(/[\s_]+/g, '-');
  if (['main-mlo', 'main-breaker', 'starter', 'vfd', 'breaker', 'feeder', 'space', 'spare'].includes(requestedType)) return requestedType;
  const kind = token(load?.loadType || load?.type);
  if (kind.includes('spare')) return 'spare';
  if (kind.includes('vfd') || kind.includes('variable frequency')) return 'vfd';
  if (kind.includes('motor')) return 'starter';
  if (kind.includes('breaker')) return 'breaker';
  return 'feeder';
}

function bucketSourceValues(load, lineup) {
  const equipmentTag = explicitValue(load, ['tag', 'ref', 'id']);
  const requestedType = loadBucketType(load);
  const type = requestedType === 'main-mlo' || requestedType === 'main-breaker' ? 'main' : requestedType;
  const mainDevice = requestedType === 'main-breaker' ? 'breaker' : (requestedType === 'main-mlo' ? 'mlo' : '');
  const status = type === 'space' ? 'space' : (type === 'spare' ? 'spare' : 'active');
  const requestedStarterType = token(explicitValue(load, ['starterType', 'starter_type'])).replace(/[\s_]+/g, '-');
  const starterType = MCC_STARTER_TYPES.includes(requestedStarterType) ? requestedStarterType : '';
  const hp = explicitValue(load, ['hp', 'horsepower', 'motorHp', 'motorHP']);
  const explicitStarterSize = explicitValue(load, ['starterSize', 'starter_size']);
  const starterSizing = type === 'starter' && !explicitStarterSize
    ? approximateNemaStarterSize({ hp, voltage: load.voltage, phases: load.phases, starterType: requestedStarterType || starterType })
    : { size: null, reason: explicitStarterSize ? 'explicit-size' : 'not-starter' };
  const starterSize = explicitStarterSize || starterSizing.label || '';
  const breakerA = explicitValue(load, ['breakerA', 'breaker', 'ocpdRating', 'ocpd_rating', 'breakerTripA', 'breaker_trip_a']);
  const breakerFrameA = explicitValue(load, ['breakerFrameA', 'breakerFrame', 'breaker_frame_a', 'breaker_frame', 'frameA', 'frame_a']);
  const requestedUnits = Number.parseFloat(load.mccBucketUnits ?? load.bucketUnits ?? load.sizeUnits);
  const hasExplicitBucketSize = Number.isFinite(requestedUnits) && requestedUnits > 0;
  let bucketSizing = { sizeUnits: null, heightIn: null, reason: hasExplicitBucketSize ? 'explicit-size' : 'unsupported-type' };
  let bucketSizeEstimateKind = '';
  if (type === 'starter' && !hasExplicitBucketSize) {
    bucketSizing = approximateMccBucketSizeFromNema({
      starterSize,
      starterType: requestedStarterType || starterType,
      unitHeightIn: lineup.unitHeightIn,
      usableBucketHeightIn: lineup.usableBucketHeightIn
    });
    if (bucketSizing.sizeUnits) bucketSizeEstimateKind = 'starter';
  } else if (['breaker', 'feeder', 'spare'].includes(type) && !hasExplicitBucketSize) {
    bucketSizing = approximateFeederBreakerBucketSize({
      breakerA,
      breakerFrameA,
      unitHeightIn: lineup.unitHeightIn,
      usableBucketHeightIn: lineup.usableBucketHeightIn
    });
    if (bucketSizing.sizeUnits) bucketSizeEstimateKind = 'breaker-frame';
  }
  const sizeUnits = hasExplicitBucketSize ? requestedUnits : (bucketSizing.sizeUnits || 1);
  const heightIn = hasExplicitBucketSize
    ? bucketHeightFromUnits(sizeUnits, lineup.unitHeightIn)
    : (bucketSizing.heightIn || bucketHeightFromUnits(sizeUnits, lineup.unitHeightIn));
  return {
    label: equipmentTag || 'LOAD',
    equipmentTag,
    equipmentDescription: text(load.description),
    loadTag: equipmentTag,
    type,
    mainDevice,
    status,
    sizeUnits,
    heightIn,
    bucketSizeEstimated: Boolean(bucketSizing.sizeUnits),
    bucketSizeBasis: bucketSizing.sizeUnits ? bucketSizing.basis : '',
    bucketSizeEstimateKind,
    hp,
    breakerA,
    breakerFrameA,
    starterType,
    starterSize,
    starterSizeEstimated: Boolean(starterSizing.size),
    starterSizeBasis: starterSizing.size ? starterSizing.basis : '',
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
    sourceMccUnitType: text(load.mccUnitType || load.mccBucketType || load.bucketType),
    sourceKw: text(load.kw),
    sourceHp: explicitValue(load, ['hp', 'horsepower', 'motorHp', 'motorHP']),
    sourceVoltage: text(load.voltage),
    sourcePhases: text(load.phases),
    sourceQuantity: text(load.quantity)
  };
}

function newManagedBucket(load, lineup) {
  const sourceValues = bucketSourceValues(load, lineup);
  return {
    id: createMccUniqueId('mcc-bkt'),
    mainDevice: '',
    motorSpaceHeaterRequired: false,
    motorSpaceHeaterVa: '',
    ...sourceValues,
    ...sourceMetadata(load),
    loadListSourceValues: sourceValues
  };
}

function refreshManagedBucket(bucket, load, lineup) {
  const incoming = bucketSourceValues(load, lineup);
  const previous = bucket.loadListSourceValues && typeof bucket.loadListSourceValues === 'object'
    ? bucket.loadListSourceValues
    : {};
  const next = { ...bucket };
  let sourceChanged = false;
  let manualOverrides = 0;
  const starterDriverFields = ['type', 'hp', 'starterType', 'starterSize'];
  const breakerDriverFields = ['breakerA', 'breakerFrameA'];
  const starterDependentFields = ['starterSize', 'starterSizeEstimated', 'starterSizeBasis'];
  const bucketDependentFields = ['sizeUnits', 'heightIn', 'bucketSizeEstimated', 'bucketSizeBasis', 'bucketSizeEstimateKind'];
  const isManualOverride = field => (
    Object.prototype.hasOwnProperty.call(previous, field)
    && !valuesEqual(bucket[field], previous[field])
    && !valuesEqual(bucket[field], incoming[field])
  );
  const starterSizingOverridden = starterDriverFields.some(isManualOverride);
  const breakerSizingOverridden = breakerDriverFields.some(isManualOverride);
  const physicalSizingOverridden = ['sizeUnits', 'heightIn'].some(field => {
    if (isManualOverride(field)) return true;
    if (Object.prototype.hasOwnProperty.call(previous, field)) return false;
    const previousVersionDefault = field === 'sizeUnits'
      ? valuesEqual(bucket[field], 1)
      : valuesEqual(bucket[field], bucketHeightFromUnits(1, lineup.unitHeightIn));
    return !previousVersionDefault && !valuesEqual(bucket[field], incoming[field]);
  });
  const bucketSizingOverridden = starterSizingOverridden || breakerSizingOverridden || physicalSizingOverridden;

  LOAD_MANAGED_BUCKET_FIELDS.forEach(field => {
    const hadPrevious = Object.prototype.hasOwnProperty.call(previous, field);
    if (!valuesEqual(previous[field], incoming[field])) sourceChanged = true;
    if (starterSizingOverridden && starterDependentFields.includes(field)) return;
    if (bucketSizingOverridden && bucketDependentFields.includes(field)) return;
    const physicalField = field === 'sizeUnits' || field === 'heightIn';
    const previousVersionDefault = physicalField && !hadPrevious && (
      (field === 'sizeUnits' && valuesEqual(bucket[field], 1))
      || (field === 'heightIn' && valuesEqual(bucket[field], bucketHeightFromUnits(1, lineup.unitHeightIn)))
    );
    if ((!hadPrevious && (!physicalField || previousVersionDefault)) || valuesEqual(bucket[field], previous[field])) {
      next[field] = incoming[field];
    } else if (!valuesEqual(bucket[field], incoming[field])) {
      manualOverrides += 1;
    }
  });

  if (starterSizingOverridden) manualOverrides += 1;
  if (breakerSizingOverridden) manualOverrides += 1;
  if (physicalSizingOverridden) manualOverrides += 1;

  if (starterSizingOverridden) {
    next.starterSizeEstimated = false;
    next.starterSizeBasis = 'Manual MCC starter selection override; verify against the selected starter method and manufacturer ratings.';
  }
  if (breakerSizingOverridden && !physicalSizingOverridden && ['breaker', 'feeder', 'spare'].includes(next.type)) {
    const manualBreakerEstimate = approximateFeederBreakerBucketSize({
      breakerA: next.breakerA,
      breakerFrameA: next.breakerFrameA,
      unitHeightIn: lineup.unitHeightIn,
      usableBucketHeightIn: lineup.usableBucketHeightIn
    });
    if (manualBreakerEstimate.sizeUnits) {
      next.sizeUnits = manualBreakerEstimate.sizeUnits;
      next.heightIn = manualBreakerEstimate.heightIn;
      next.bucketSizeEstimated = true;
      next.bucketSizeBasis = manualBreakerEstimate.basis;
      next.bucketSizeEstimateKind = 'breaker-frame';
    } else {
      next.bucketSizeEstimated = false;
      next.bucketSizeBasis = 'Manual MCC breaker selection could not be assigned a generic frame-based bucket size; verify manufacturer construction.';
      next.bucketSizeEstimateKind = '';
    }
  } else if (bucketSizingOverridden) {
    next.bucketSizeEstimated = false;
    next.bucketSizeBasis = 'Manual MCC bucket sizing override; verify against the selected MCC manufacturer, starter construction, and options.';
    next.bucketSizeEstimateKind = '';
  }

  Object.assign(next, sourceMetadata(load));
  next.loadListSourceValues = incoming;
  return { bucket: next, sourceChanged, manualOverrides };
}

function voltageNumber(value) {
  const parsed = Number.parseFloat(text(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function loadHasMeaningfulData(load) {
  return ['tag', 'ref', 'id', 'description', 'kw', 'loadType', 'mccUnitType', 'starterType'].some(field => text(load?.[field]));
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
  const sourceValues = loads.map(load => bucketSourceValues(load, lineup));
  const preliminaryStarterSizes = sourceValues.filter(values => values.starterSizeEstimated).length;
  const preliminaryStarterBucketSizes = sourceValues.filter(values => values.bucketSizeEstimateKind === 'starter').length;
  const preliminaryBreakerBucketSizes = sourceValues.filter(values => values.bucketSizeEstimateKind === 'breaker-frame').length;
  const unsupportedStarterSizes = loads.filter(load => {
    if (loadBucketType(load) !== 'starter') return false;
    if (!explicitValue(load, ['hp', 'horsepower', 'motorHp', 'motorHP'])) return false;
    if (explicitValue(load, ['starterSize', 'starter_size'])) return false;
    return !bucketSourceValues(load, lineup).starterSizeEstimated;
  }).length;
  const missingBucketSize = sourceValues.filter((values, index) => {
    const load = loads[index];
    const units = Number.parseFloat(load.mccBucketUnits ?? load.bucketUnits ?? load.sizeUnits);
    const hasExplicitBucketSize = Number.isFinite(units) && units > 0;
    return !hasExplicitBucketSize && !values.bucketSizeEstimated;
  }).length;

  if (!loads.length) warnings.push(`No Load List records use ${mccLoadListTarget(lineup)} as their Source / Panel.`);
  if (missingTags) warnings.push(`${missingTags} matching load${missingTags === 1 ? '' : 's'} lack a tag; generated project IDs will be used.`);
  if (quantityRows) warnings.push(`${quantityRows} load row${quantityRows === 1 ? ' has' : 's have'} quantity above 1; each row creates one bucket pending equipment-level confirmation.`);
  if (voltageMismatches) warnings.push(`${voltageMismatches} load${voltageMismatches === 1 ? '' : 's'} do not match the lineup voltage.`);
  if (motorsMissingHp) warnings.push(`${motorsMissingHp} motor load${motorsMissingHp === 1 ? '' : 's'} lack explicit horsepower; horsepower, starter size, and protective-device ratings remain unassigned.`);
  if (preliminaryStarterSizes) warnings.push(`${preliminaryStarterSizes} starter size${preliminaryStarterSizes === 1 ? ' uses' : 's use'} a preliminary NEMA horsepower-table estimate; confirm motor nameplate current, starter method, duty, and manufacturer ratings.`);
  if (preliminaryStarterBucketSizes) warnings.push(`${preliminaryStarterBucketSizes} MCC bucket height${preliminaryStarterBucketSizes === 1 ? ' uses' : 's use'} a conservative generic FVNR planning estimate; confirm the selected MCC manufacturer, starter construction, and options.`);
  if (preliminaryBreakerBucketSizes) warnings.push(`${preliminaryBreakerBucketSizes} feeder-breaker bucket height${preliminaryBreakerBucketSizes === 1 ? ' uses' : 's use'} a conservative amp-frame planning estimate; confirm the selected breaker frame, MCC manufacturer, lug and cable space, interrupting rating, and options.`);
  if (unsupportedStarterSizes) warnings.push(`${unsupportedStarterSizes} motor load${unsupportedStarterSizes === 1 ? '' : 's'} could not be assigned a preliminary NEMA starter size because the phase, voltage, horsepower, or starter method is outside the supported table scope.`);
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
      mccUnitType: text(load.mccUnitType || load.mccBucketType || load.bucketType),
      starterType: text(load.starterType || load.starter_type),
      kw: text(load.kw),
      hp: explicitValue(load, ['hp', 'horsepower', 'motorHp', 'motorHP']),
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
    const refreshed = refreshManagedBucket(existing, load, normalized);
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
