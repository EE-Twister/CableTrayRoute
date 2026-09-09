import {
  normalizeRouteResults,
  routeResultSucceeded,
  routeResultTag,
} from './routeResults.mjs';

const EPSILON = 1e-6;

function text(value) {
  return String(value ?? '').trim();
}

function finitePositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function point(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const values = value.slice(0, 3).map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function vector(segment = {}) {
  const start = point(segment.start);
  const end = point(segment.end);
  if (!start || !end) return null;
  const values = end.map((value, index) => value - start[index]);
  const length = Math.hypot(...values);
  return length > EPSILON ? { values, length } : null;
}

function turnAngle(previous, current) {
  const before = vector(previous);
  const after = vector(current);
  if (!before || !after) return 0;
  const dot = before.values.reduce((sum, value, index) => sum + value * after.values[index], 0);
  const cosine = Math.max(-1, Math.min(1, dot / (before.length * after.length)));
  return Math.acos(cosine);
}

function firstText(record, fields) {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  return '';
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  const source = String(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function roundedNumber(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function pullPointId(index, pointValue, distanceFt) {
  return `pull-point-${index + 1}-${stableHash(JSON.stringify({
    point: point(pointValue)?.map(value => roundedNumber(value)) || null,
    distanceFt: roundedNumber(distanceFt),
  }))}`;
}

function requiredPullPoints(pullPlan = {}) {
  const sections = Array.isArray(pullPlan.sections) ? pullPlan.sections : [];
  if (!sections.length) return [];
  const points = [{
    type: 'reel',
    label: 'Reel / pull start',
    point: point(sections[0].startPoint),
    distanceFt: Number(sections[0].startDistance) || 0,
    sectionBefore: null,
    sectionAfter: sections[0].index || 1,
  }];
  sections.slice(0, -1).forEach((section, index) => {
    const nextSection = sections[index + 1];
    points.push({
      type: 'intermediate',
      label: `Intermediate setup ${index + 1}`,
      point: point(section.endPoint) || point(nextSection.startPoint),
      distanceFt: Number(section.endDistance) || Number(nextSection.startDistance) || 0,
      sectionBefore: section.index || index + 1,
      sectionAfter: nextSection.index || index + 2,
    });
  });
  const finalSection = sections.at(-1);
  points.push({
    type: 'receiving',
    label: 'Receiving / pull end',
    point: point(finalSection.endPoint),
    distanceFt: Number(finalSection.endDistance) || Number(finalSection.length) || 0,
    sectionBefore: finalSection.index || sections.length,
    sectionAfter: null,
  });
  return points.map((record, index) => ({
    ...record,
    id: pullPointId(index, record.point, record.distanceFt),
    index: index + 1,
  }));
}

function normalizePullPointAccessRecords(pullPlan, options = {}) {
  const requirements = requiredPullPoints(pullPlan);
  const saved = new Map((Array.isArray(options.pullPointAccessRecords) ? options.pullPointAccessRecords : [])
    .map(record => [text(record?.id), record])
    .filter(([id]) => id));
  const defaultSource = text(options.pullPointAccessSource);
  const records = requirements.map(requirement => {
    const record = saved.get(requirement.id) || {};
    const status = ['confirmed', 'blocked'].includes(text(record.status).toLowerCase())
      ? text(record.status).toLowerCase()
      : 'pending';
    const source = text(record.source) || defaultSource;
    return {
      ...requirement,
      status,
      source: source || null,
      notes: text(record.notes) || null,
      confirmed: status === 'confirmed' && Boolean(source),
    };
  });
  const currentIds = new Set(requirements.map(record => record.id));
  const staleRecords = [...saved.values()].filter(record => !currentIds.has(text(record?.id)));
  return { records, staleRecords };
}

function issue(code, message, { severity = 'error', blocking = true, href = 'optimalRoute.html' } = {}) {
  return { code, severity, blocking, message, href };
}

function cableLimitSource(cable, options) {
  return text(options.cableLimitSource) || firstText(cable, [
    'pulling_limit_source',
    'pullingLimitSource',
    'manufacturer_data_source',
    'manufacturerDataSource',
    'source_document',
    'sourceDocument',
    'datasheet',
  ]);
}

function minimumBendRadiusFt(cable) {
  return finitePositive(
    cable?.minBendRadiusFt,
    cable?.min_bend_radius_ft,
    finitePositive(cable?.min_bend_radius_in) ? Number(cable.min_bend_radius_in) / 12 : null
  );
}

function bendEvidence(routeSegments, cable, options) {
  const bends = [];
  const minimumRadiusFt = minimumBendRadiusFt(cable);
  for (let index = 1; index < routeSegments.length; index += 1) {
    const previous = routeSegments[index - 1] || {};
    const current = routeSegments[index] || {};
    const angle = turnAngle(previous, current);
    if (angle <= EPSILON) continue;
    const explicitRadiusFt = finitePositive(
      current.radius,
      current.bendRadiusFt,
      current.bend_radius_ft,
      previous.radius,
      previous.bendRadiusFt,
      previous.bend_radius_ft
    );
    const confirmedDefault = options.bendGeometryConfirmed === true
      && text(options.bendGeometrySource)
      && finitePositive(options.defaultBendRadiusFt);
    const actualRadiusFt = explicitRadiusFt || (confirmedDefault ? Number(options.defaultBendRadiusFt) : null);
    bends.push({
      junction: index,
      point: point(current.start),
      angleDeg: angle * 180 / Math.PI,
      radiusFt: actualRadiusFt,
      minimumRadiusFt,
      basis: explicitRadiusFt ? 'route-segment' : confirmedDefault ? 'confirmed-project-basis' : 'assumed-default',
      source: explicitRadiusFt
        ? firstText(current, ['bend_radius_source', 'bendRadiusSource'])
          || firstText(previous, ['bend_radius_source', 'bendRadiusSource'])
          || 'route-segment geometry'
        : text(options.bendGeometrySource),
      pass: Boolean(actualRadiusFt && minimumRadiusFt && actualRadiusFt + EPSILON >= minimumRadiusFt),
    });
  }
  return { bends, minimumRadiusFt };
}

function buildSignaturePayload({ routeSegments, cable, pullPlan, options, bends, pullPoints }) {
  return {
    cable: firstText(cable, ['tag', 'name', 'id', 'cable_id', 'cableId']),
    route: routeSegments.map(segment => ({
      start: point(segment.start),
      end: point(segment.end),
      length: finitePositive(segment.length),
      radius: finitePositive(segment.radius, segment.bendRadiusFt, segment.bend_radius_ft),
      raceway: firstText(segment, ['conduit_id', 'tray_id', 'raceway_id', 'ductbankTag']),
    })),
    limits: {
      cableTensionLbf: pullPlan.cableAllowableTension,
      systemTensionLbf: pullPlan.allowableTension,
      sidewallPressureLbfFt: pullPlan.allowableSidewallPressure,
      minimumBendRadiusFt: minimumBendRadiusFt(cable),
      cableSource: cableLimitSource(cable, options),
      equipmentSource: text(options.equipmentRatingsSource),
    },
    basis: {
      bendGeometryConfirmed: options.bendGeometryConfirmed === true,
      bendGeometrySource: text(options.bendGeometrySource),
      pullPointAccessRecords: pullPoints.records.map(record => ({
        id: record.id,
        type: record.type,
        point: record.point,
        distanceFt: record.distanceFt,
        status: record.status,
        source: record.source,
        notes: record.notes,
      })),
    },
    bends,
    result: {
      direction: pullPlan.direction,
      sections: pullPlan.sections?.length || 0,
      maxTension: pullPlan.maxTension,
      maxSidewallPressure: pullPlan.maxSidewallPressure,
      status: pullPlan.status,
      equipmentFailures: pullPlan.directionComparison?.[pullPlan.direction]?.equipmentFailures ?? null,
    },
  };
}

/**
 * Build issue-gate evidence around an existing pull calculation. This does not
 * replace the tension solver; it verifies that its physical inputs and field
 * setup assumptions are traceable enough for qualified review.
 */
export function buildPullConstructabilityEvidence({
  routeSegments = [],
  cable = {},
  pullPlan = {},
  options = {},
} = {}) {
  const segments = Array.isArray(routeSegments) ? routeSegments : [];
  const issues = [];
  const { bends, minimumRadiusFt } = bendEvidence(segments, cable, options);
  const limitSource = cableLimitSource(cable, options);
  const equipmentSource = text(options.equipmentRatingsSource);
  const pullPoints = normalizePullPointAccessRecords(pullPlan, options);

  if (pullPlan.status === 'inputs-required' || (pullPlan.missingInputs || []).length) {
    issues.push(issue(
      'PULL-INPUTS-INCOMPLETE',
      `Pull calculation inputs are incomplete: ${(pullPlan.missingInputs || []).join(', ') || 'required pull inputs are missing'}.`
    ));
  }
  if (!pullPlan.directionComparison?.forward || !pullPlan.directionComparison?.reverse) {
    issues.push(issue('PULL-DIRECTION-COMPARISON-MISSING', 'Both pull directions have not been retained for review.'));
  }
  if (!limitSource) {
    issues.push(issue('PULL-CABLE-LIMIT-SOURCE-MISSING', 'Cable pulling-tension and sidewall-pressure limits do not identify a manufacturer or governed source.'));
  }
  if (bends.length && !minimumRadiusFt) {
    issues.push(issue('PULL-MIN-BEND-RADIUS-MISSING', 'Cable minimum bend radius is missing for a route containing direction changes.'));
  }
  bends.forEach(bend => {
    if (!bend.radiusFt || bend.basis === 'assumed-default') {
      issues.push(issue(
        'PULL-BEND-GEOMETRY-UNCONFIRMED',
        `Bend at route junction ${bend.junction} uses an unconfirmed default radius.`
      ));
    } else if (bend.minimumRadiusFt && bend.radiusFt + EPSILON < bend.minimumRadiusFt) {
      issues.push(issue(
        'PULL-BEND-RADIUS-BELOW-MINIMUM',
        `Bend at route junction ${bend.junction} has ${bend.radiusFt.toFixed(2)} ft radius, below the ${bend.minimumRadiusFt.toFixed(2)} ft cable minimum.`
      ));
    }
  });
  if (!equipmentSource) {
    issues.push(issue('PULL-EQUIPMENT-SOURCE-MISSING', 'Puller, rope, grip, anchorage, and sheave ratings do not identify an equipment source.'));
  }
  if (pullPlan.status === 'review-required' || Number(pullPlan.directionComparison?.[pullPlan.direction]?.equipmentFailures) > 0) {
    issues.push(issue('PULL-LIMIT-OR-EQUIPMENT-FAILED', 'The selected pull direction exceeds a section or field-equipment working limit.'));
  }
  pullPoints.records.forEach(record => {
    if (record.status === 'blocked') {
      issues.push(issue(
        'PULL-POINT-ACCESS-BLOCKED',
        `${record.label} at ${record.distanceFt.toFixed(1)} ft is recorded as inaccessible or obstructed${record.notes ? `: ${record.notes}` : '.'}`
      ));
    } else if (record.status !== 'confirmed') {
      issues.push(issue(
        'PULL-POINT-ACCESS-PENDING',
        `${record.label} at ${record.distanceFt.toFixed(1)} ft has not been individually confirmed.`
      ));
    } else if (!record.source) {
      issues.push(issue(
        'PULL-POINT-ACCESS-SOURCE-MISSING',
        `${record.label} at ${record.distanceFt.toFixed(1)} ft is marked confirmed without a site-plan, structure-schedule, or field-walkdown source.`
      ));
    }
  });
  if (pullPoints.staleRecords.length) {
    issues.push(issue(
      'PULL-POINT-ACCESS-RECORDS-STALE',
      `${pullPoints.staleRecords.length} saved pull-point access record(s) no longer match the calculated pull geometry and were not used.`,
      { severity: 'warning', blocking: false }
    ));
  }

  const blockingIssues = issues.filter(item => item.blocking);
  const payload = buildSignaturePayload({ routeSegments: segments, cable, pullPlan, options, bends, pullPoints });
  const confirmedPointCount = pullPoints.records.filter(record => record.confirmed).length;
  return {
    schemaVersion: 2,
    status: blockingIssues.length ? 'blocked' : 'pass',
    intendedUse: 'Cable-pull constructability evidence for qualified review; field verification and manufacturer instructions remain required.',
    signature: stableHash(JSON.stringify(payload)),
    bends,
    pullPoints: {
      sectionCount: pullPlan.sections?.length || 0,
      setupPointCount: pullPlan.setupPoints?.length || 0,
      requiredCount: pullPoints.records.length,
      confirmedCount: confirmedPointCount,
      pendingCount: pullPoints.records.filter(record => record.status === 'pending').length,
      blockedCount: pullPoints.records.filter(record => record.status === 'blocked').length,
      confirmed: pullPoints.records.length > 0 && confirmedPointCount === pullPoints.records.length,
      source: pullPoints.records.every(record => record.source === pullPoints.records[0]?.source)
        ? pullPoints.records[0]?.source || null
        : 'Per-point sources',
      records: pullPoints.records,
      staleRecordCount: pullPoints.staleRecords.length,
    },
    sources: {
      cableLimits: limitSource || null,
      equipmentRatings: equipmentSource || null,
      bendGeometry: text(options.bendGeometrySource) || null,
    },
    issues,
    blockingIssues,
  };
}

/** Aggregate saved route pull checks into a deliverable issue gate. */
export function buildPullConstructabilityAssurance({ routeResults = [] } = {}) {
  const rows = normalizeRouteResults(routeResults).filter(routeResultSucceeded);
  const applicable = rows.some(row => row.pull_check);
  const checks = [];
  const issues = [];
  if (!applicable) {
    return {
      schemaVersion: 2,
      applicable: false,
      status: 'not-applicable',
      checks,
      issues,
      blockingIssues: [],
      summary: { routes: rows.length, checked: 0, ready: 0, blocked: 0 },
    };
  }

  rows.forEach(row => {
    const cable = text(routeResultTag(row));
    if (!row.pull_check) {
      const missing = issue('PULL-PLAN-COVERAGE-MISSING', `Cable "${cable}" does not have a saved pull check.`);
      issues.push({ ...missing, cable });
      checks.push({ cable, status: 'blocked', signature: '', issues: [missing] });
      return;
    }
    const evidence = row.pull_check.constructability;
    if (!evidence || evidence.schemaVersion !== 2) {
      const missing = issue('PULL-CONSTRUCTABILITY-EVIDENCE-MISSING', `Cable "${cable}" has a pull calculation without constructability evidence. Recalculate the pull plan.`);
      issues.push({ ...missing, cable });
      checks.push({ cable, status: 'blocked', signature: '', issues: [missing] });
      return;
    }
    const checkIssues = (evidence.issues || []).map(item => ({ ...item, cable }));
    issues.push(...checkIssues);
    checks.push({
      cable,
      status: evidence.status,
      signature: evidence.signature,
      bends: evidence.bends || [],
      pullPoints: evidence.pullPoints || {},
      sources: evidence.sources || {},
      issues: checkIssues,
    });
  });

  const blockingIssues = issues.filter(item => item.blocking);
  return {
    schemaVersion: 2,
    applicable: true,
    status: blockingIssues.length ? 'blocked' : 'pass',
    checks,
    issues,
    blockingIssues,
    summary: {
      routes: rows.length,
      checked: checks.length,
      ready: checks.filter(check => check.status === 'pass').length,
      blocked: checks.filter(check => check.status !== 'pass').length,
    },
  };
}
