import { buildCablePullPlan } from './cablePullPlan.mjs';

const EPSILON = 1e-6;

const finitePositive = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
};

const normalizePoint = point => (Array.isArray(point) && point.length >= 3
  ? point.slice(0, 3).map(value => Number(value).toFixed(2)).join(',')
  : 'missing');

const containment = segment => {
  const value = String(
    segment?.containmentType
      || segment?.containment
      || segment?.raceway_type
      || segment?.type
      || ''
  ).trim().toLowerCase();
  if (value === 'field' || segment?.isFieldRouting) return 'field';
  if (value.includes('duct')) return 'ductbank';
  if (value.includes('conduit') || segment?.conduit_id) return 'conduit';
  return 'tray';
};

const racewayId = segment => String(
  segment?.raceway_id || segment?.tray_id || segment?.conduit_id || ''
).trim().toUpperCase();

const segmentLength = segment => {
  const explicit = finitePositive(segment?.length);
  if (explicit) return explicit;
  if (!Array.isArray(segment?.start) || !Array.isArray(segment?.end)) return 0;
  return Math.hypot(
    Number(segment.end[0]) - Number(segment.start[0]),
    Number(segment.end[1]) - Number(segment.start[1]),
    Number(segment.end[2]) - Number(segment.start[2])
  ) || 0;
};

const directedSegmentKey = (segment, reverse = false) => {
  const start = normalizePoint(reverse ? segment?.end : segment?.start);
  const end = normalizePoint(reverse ? segment?.start : segment?.end);
  return `${containment(segment)}:${racewayId(segment)}:${start}>${end}`;
};

const undirectedSegmentKey = segment => {
  const start = normalizePoint(segment?.start);
  const end = normalizePoint(segment?.end);
  const points = [start, end].sort();
  return `${containment(segment)}:${racewayId(segment)}:${points[0]}<>${points[1]}`;
};

export const canonicalRouteSignature = routeSegments => {
  const segments = Array.isArray(routeSegments) ? routeSegments.filter(Boolean) : [];
  if (!segments.length) return '';
  const forward = segments.map(segment => directedSegmentKey(segment)).join('|');
  const reverse = [...segments].reverse().map(segment => directedSegmentKey(segment, true)).join('|');
  return forward < reverse ? forward : reverse;
};

const cableClass = cable => {
  const explicit = String(cable?.allowed_cable_group || cable?.allowedGroup || '').trim().toUpperCase();
  if (explicit) return explicit;
  const type = String(cable?.cable_type || cable?.type || '').trim().toUpperCase();
  if (type.includes('COMM')) return 'COMMUNICATION';
  if (type.includes('INSTR') || type.includes('SIGNAL')) return 'INSTRUMENT';
  if (type.includes('POWER')) return 'POWER-UNCLASSIFIED';
  if (type.includes('CONTROL')) return 'CONTROL-UNCLASSIFIED';
  return 'UNCLASSIFIED';
};

const cableName = (cable, fallback) => String(cable?.name || cable?.tag || fallback || 'Cable').trim();

const cableProperties = (cable, options) => ({
  name: cableName(cable),
  weight: finitePositive(cable?.weight, cable?.weight_lbs_ft, cable?.weightLbsPerFt),
  diameter: finitePositive(cable?.outerDiameterIn, cable?.diameter, cable?.cable_od),
  maxTension: finitePositive(
    cable?.maxTension,
    cable?.allowableTension,
    cable?.max_tension,
    options.allowableTension
  ),
  maxSidewallPressure: finitePositive(
    cable?.maxSidewallPressure,
    cable?.allowableSidewallPressure,
    cable?.max_sidewall_pressure,
    options.allowableSidewallPressure
  ),
  coeffFriction: finitePositive(cable?.coeffFriction, cable?.mu, options.coeffFriction) || 0.35
});

const hashString = value => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase();
};

const sharedRoutePercent = (left, right) => {
  const leftSegments = new Map((left.routeSegments || []).map(segment => [
    undirectedSegmentKey(segment),
    segmentLength(segment)
  ]));
  const rightSegments = new Map((right.routeSegments || []).map(segment => [
    undirectedSegmentKey(segment),
    segmentLength(segment)
  ]));
  const leftLength = [...leftSegments.values()].reduce((sum, value) => sum + value, 0);
  const rightLength = [...rightSegments.values()].reduce((sum, value) => sum + value, 0);
  const denominator = Math.min(leftLength, rightLength);
  if (denominator <= EPSILON) return 0;
  let sharedLength = 0;
  leftSegments.forEach((length, key) => {
    if (rightSegments.has(key)) sharedLength += Math.min(length, rightSegments.get(key));
  });
  return Math.max(0, Math.min(100, (sharedLength / denominator) * 100));
};

const buildBundleCable = (entries, options) => {
  const properties = entries.map(entry => cableProperties(entry.cable, options));
  const combinedWeight = properties.reduce((sum, item) => sum + (item.weight || 0), 0);
  const equivalentDiameter = Math.sqrt(properties.reduce((sum, item) => (
    sum + Math.pow(item.diameter || 0, 2)
  ), 0));
  const share = item => combinedWeight > EPSILON ? (item.weight || 0) / combinedWeight : 0;
  const groupTensionLimit = Math.min(...properties.map(item => {
    const fraction = share(item);
    return item.maxTension && fraction > EPSILON ? item.maxTension / fraction : Number.POSITIVE_INFINITY;
  }));
  const groupSidewallLimit = Math.min(...properties.map(item => {
    const fraction = share(item);
    return item.maxSidewallPressure && fraction > EPSILON
      ? item.maxSidewallPressure / fraction
      : Number.POSITIVE_INFINITY;
  }));
  const first = entries[0].cable || {};
  return {
    name: entries.map(entry => entry.name).join(' + '),
    weight: combinedWeight,
    diameter: equivalentDiameter,
    max_tension: Number.isFinite(groupTensionLimit) ? groupTensionLimit : null,
    max_sidewall_pressure: Number.isFinite(groupSidewallLimit) ? groupSidewallLimit : null,
    coeffFriction: Math.max(...properties.map(item => item.coeffFriction)),
    start_tag: first.start_tag || first.from || 'Group start',
    end_tag: first.end_tag || first.to || 'Group end',
    allowed_cable_group: entries[0].className,
    groupProperties: properties.map(item => ({
      ...item,
      tensionSharePct: combinedWeight > EPSILON ? ((item.weight || 0) / combinedWeight) * 100 : 0
    }))
  };
};

const missingGroupInputs = (entries, options) => {
  const missing = [];
  entries.forEach(entry => {
    const properties = cableProperties(entry.cable, options);
    if (!properties.weight) missing.push(`${entry.name}: cable weight`);
    if (!properties.diameter) missing.push(`${entry.name}: cable outside diameter`);
    if (!properties.maxTension) missing.push(`${entry.name}: pulling-tension limit`);
    if (!properties.maxSidewallPressure) missing.push(`${entry.name}: sidewall-pressure limit`);
  });
  return missing;
};

const createGroup = (entries, sequence, options) => {
  const bundleCable = buildBundleCable(entries, options);
  const missingInputs = missingGroupInputs(entries, options);
  const plan = buildCablePullPlan(entries[0].routeSegments, bundleCable, options);
  const status = missingInputs.length || plan.status === 'inputs-required' || plan.status === 'review-required'
    ? 'review'
    : 'recommended';
  const individualEquipment = entries.reduce((totals, entry) => {
    const counts = entry.route?.pull_check?.equipment?.counts || {};
    totals.reels += Number(counts.reels) || 0;
    totals.tuggers += Number(counts.tuggers) || 0;
    totals.handPulls += Number(counts.handPulls) || 0;
    return totals;
  }, { reels: 0, tuggers: 0, handPulls: 0 });
  const groupEquipment = plan.equipment?.counts || {};
  const groupPullSections = Array.isArray(plan.sections) ? plan.sections.length : 0;
  const names = entries.map(entry => entry.name).sort();
  return {
    id: `pull-set-${hashString(`${entries[0].signature}|${names.join('|')}`)}`,
    label: `PS-${String(sequence).padStart(2, '0')}`,
    status,
    className: entries[0].className,
    cableNames: names,
    cableCount: entries.length,
    routeLengthFt: entries[0].routeLengthFt,
    combinedWeightLbsFt: bundleCable.weight,
    equivalentDiameterIn: bundleCable.diameter,
    cableProperties: bundleCable.groupProperties,
    missingInputs,
    plan,
    fieldEquipment: {
      payoffStations: groupPullSections,
      cableReels: groupPullSections * entries.length,
      tuggers: Number(groupEquipment.tuggers) || 0,
      handPulls: Number(groupEquipment.handPulls) || 0,
      sheaves: Number(groupEquipment.sheaves) || 0,
      rollers: Number(groupEquipment.rollers) || 0
    },
    equipmentSavings: {
      pullOperations: Math.max(0, individualEquipment.reels - groupPullSections),
      tuggers: Math.max(0, individualEquipment.tuggers - (Number(groupEquipment.tuggers) || 0))
    },
    routeIndices: entries.map(entry => entry.routeIndex),
    reasons: status === 'recommended'
      ? [
          'The cables share the complete start-to-end route.',
          `All cables are assigned to the ${entries[0].className} circuit class.`,
          `The combined pull remains within the configured screening limits using ${plan.sections.length} pull section${plan.sections.length === 1 ? '' : 's'}.`
        ]
      : [
          missingInputs.length ? `Missing bundle inputs: ${missingInputs.join(', ')}.` : 'The combined pull exceeds at least one configured screening or equipment limit.',
          'Keep these cables separate until the flagged inputs and equipment limits are resolved.'
        ]
  };
};

export function buildPullGroupSuggestions(routeResults = [], cables = [], options = {}) {
  const maximumGroupSize = Math.max(2, Math.min(12, Math.round(Number(options.maxPullGroupSize) || 4)));
  const cableMap = new Map((Array.isArray(cables) ? cables : []).map(cable => [cableName(cable), cable]));
  const entries = (Array.isArray(routeResults) ? routeResults : [])
    .map((route, routeIndex) => {
      const routeSegments = Array.isArray(route?.route_segments) ? route.route_segments : [];
      if (!routeSegments.length) return null;
      const cable = cableMap.get(String(route?.cable || '').trim()) || {};
      return {
        route,
        routeIndex,
        routeSegments,
        cable,
        name: cableName(cable, route?.cable || `Cable ${routeIndex + 1}`),
        className: cableClass(cable),
        signature: canonicalRouteSignature(routeSegments),
        routeLengthFt: routeSegments.reduce((sum, segment) => sum + segmentLength(segment), 0)
      };
    })
    .filter(entry => entry && entry.signature);

  const buckets = new Map();
  entries.forEach(entry => {
    const key = `${entry.signature}::${entry.className}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  });

  const groups = [];
  [...buckets.values()]
    .filter(bucket => bucket.length >= 2)
    .sort((left, right) => left[0].name.localeCompare(right[0].name))
    .forEach(bucket => {
      for (let index = 0; index < bucket.length; index += maximumGroupSize) {
        const members = bucket.slice(index, index + maximumGroupSize);
        if (members.length >= 2) groups.push(createGroup(members, groups.length + 1, options));
      }
    });

  const recommended = groups.filter(group => group.status === 'recommended');
  const reviewGroups = groups.filter(group => group.status === 'review');
  const groupedNames = new Set(recommended.flatMap(group => group.cableNames));
  const separate = entries
    .filter(entry => !groupedNames.has(entry.name))
    .map(entry => {
      const peers = entries.filter(candidate => candidate !== entry);
      const exactPathDifferentClass = peers.find(candidate => (
        candidate.signature === entry.signature && candidate.className !== entry.className
      ));
      const closest = peers
        .map(candidate => ({ candidate, sharedPct: sharedRoutePercent(entry, candidate) }))
        .sort((left, right) => right.sharedPct - left.sharedPct)[0];
      let reason = 'No other cable has the same complete route and circuit class.';
      if (exactPathDifferentClass) {
        reason = `${exactPathDifferentClass.name} shares the route but is ${exactPathDifferentClass.className}; circuit classes must match.`;
      } else if (closest?.sharedPct > 0 && closest.sharedPct < 99.5) {
        reason = `Closest match is ${closest.candidate.name} at ${closest.sharedPct.toFixed(0)}% shared route; automatic grouping requires a fully coextensive pull.`;
      } else if (entry.className === 'UNCLASSIFIED') {
        reason = 'Assign a cable circuit class before evaluating a simultaneous pull.';
      }
      return {
        cableName: entry.name,
        className: entry.className,
        reason,
        closestSharedRoutePct: closest?.sharedPct || 0
      };
    });

  const blockedPairs = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      if (left.signature === right.signature && left.className !== right.className) {
        blockedPairs.push({
          cables: [left.name, right.name],
          reason: `${left.className} and ${right.className} circuit classes cannot be combined automatically.`
        });
      }
    }
  }

  return {
    enabled: true,
    maximumGroupSize,
    suggestions: recommended,
    reviewGroups,
    separate,
    blockedPairs: blockedPairs.slice(0, 8),
    summary: {
      routedCables: entries.length,
      suggestedGroups: recommended.length,
      suggestedCables: recommended.reduce((sum, group) => sum + group.cableCount, 0),
      reviewGroups: reviewGroups.length,
      separateCables: separate.length
    },
    assumptions: {
      fullRouteMatchRequired: true,
      matchingCircuitClassRequired: true,
      tensionSharedByCableWeight: true,
      equivalentDiameterMethod: 'square root of summed cable diameter squared',
      defaultDecision: 'separate'
    }
  };
}
