import {
  cableAreaIn2,
  evaluateConduitFill,
  recordId,
} from './conduitFill.mjs';
import {
  normalizeRouteResults,
  routeResultSucceeded,
  routeResultTag,
} from './routeResults.mjs';
import { evaluateTrayFill, summarizeTrayFillResult } from './trayFill.mjs';
import {
  buildDuctbankConduitIndex,
  canonicalConduitIdentity,
  resolveDuctbankConduitAssignment,
} from './ductbankConduitAssignment.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function normalizedKey(value) {
  return text(value).toLowerCase();
}

function finitePoint(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const values = value.slice(0, 3).map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function pointFromRecord(record, prefix) {
  const arrayPoint = finitePoint(record?.[prefix]);
  if (arrayPoint) return arrayPoint;
  const aliases = prefix === 'start'
    ? [
        ['start_x', 'start_y', 'start_z'],
        ['startX', 'startY', 'startZ'],
        ['sx', 'sy', 'sz'],
      ]
    : [
        ['end_x', 'end_y', 'end_z'],
        ['endX', 'endY', 'endZ'],
        ['ex', 'ey', 'ez'],
      ];
  for (const fields of aliases) {
    const values = fields.map(field => Number(record?.[field]));
    if (values.every(Number.isFinite)) return values;
  }
  return null;
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function closePoints(a, b, tolerance) {
  return distance(a, b) <= tolerance;
}

function round(value, digits = 6) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
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

function firstValue(record, fields) {
  for (const field of fields) {
    const value = record?.[field];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return '';
}

function cableTag(cable = {}) {
  return firstValue(cable, ['tag', 'name', 'id', 'cable_id', 'cableId', 'cable_tag', 'ref']);
}

function cableGroup(cable = {}) {
  return text(firstValue(cable, ['allowed_cable_group', 'cable_group', 'cableGroup']));
}

function racewayGroup(raceway = {}) {
  return text(firstValue(raceway, ['allowed_cable_group', 'cable_group', 'cableGroup']));
}

function trayId(tray = {}) {
  return text(firstValue(tray, ['tray_id', 'trayId', 'id', 'tag', 'name']));
}

function conduitId(conduit = {}) {
  return text(recordId(conduit));
}

function ductbankId(ductbank = {}) {
  return text(firstValue(ductbank, ['tag', 'id', 'ductbankTag', 'ductbank_id', 'ductbankId']));
}

function makeIssue(code, severity, message, {
  blocking = severity === 'error',
  cable = '',
  raceway = '',
  segment = null,
  href = 'optimalRoute.html',
} = {}) {
  return { code, severity, blocking, message, cable, raceway, segment, href };
}

function routeSegmentRacewayId(segment = {}) {
  if (segment.type === 'field') return '';
  const conduit = text(segment.conduit_id);
  const ductbank = text(segment.ductbankTag);
  if (conduit) return canonicalConduitIdentity(ductbank, conduit);
  return text(segment.raceway_id || segment.tray_id || ductbank);
}

export function buildFieldRouteBasis(result = {}) {
  const segments = Array.isArray(result.route_segments) ? result.route_segments : [];
  const fieldSegments = segments.filter(segment => segment.type === 'field');
  if (!fieldSegments.length) return null;
  const nonFieldSegments = segments.filter(segment => segment.type !== 'field');
  const stored = result.field_route_basis && typeof result.field_route_basis === 'object'
    ? result.field_route_basis
    : null;
  if (stored?.code && stored?.explanation) return { ...stored, source: stored.source || 'stored' };
  if (nonFieldSegments.length) {
    return {
      code: 'equipment-to-raceway-transition',
      explanation: 'Field segments connect cable endpoints or raceway transitions to the selected contained route under the saved proximity and cost constraints.',
      source: 'derived-from-route-geometry',
      fieldSegmentCount: fieldSegments.length,
    };
  }
  return {
    code: 'direct-field-path',
    explanation: 'No contained raceway segment was selected; the saved result is a direct field path under the routing inputs and cost constraints and requires field review.',
    source: 'derived-from-route-geometry',
    fieldSegmentCount: fieldSegments.length,
  };
}

export function routeAssuranceSignature(result = {}, { cable = {}, conduitAssignmentIndex = null } = {}) {
  const normalized = normalizeRouteResults([result])[0] || result;
  const payload = {
    cable: text(routeResultTag(normalized)),
    segments: (normalized.route_segments || []).map(segment => {
      const resolution = conduitAssignmentIndex
        ? resolveDuctbankConduitAssignment(segment, cable, conduitAssignmentIndex)
        : null;
      const signedSegment = resolution?.status === 'resolved'
        ? { ...segment, conduit_id: resolution.conduitId, ductbankTag: resolution.ductbankId }
        : segment;
      return {
        type: text(segment.type),
        raceway: routeSegmentRacewayId(signedSegment),
        start: finitePoint(segment.start)?.map(value => round(value)) || null,
        end: finitePoint(segment.end)?.map(value => round(value)) || null,
        length: round(segment.length),
      };
    }),
    totalLength: round(normalized.total_length),
    fieldRouteBasis: buildFieldRouteBasis(normalized)?.code || null,
  };
  return stableHash(JSON.stringify(payload));
}

function buildRacewayIndexes({ trays, conduits, ductbanks }) {
  const trayIndex = new Map();
  const conduitIndex = new Map();
  const ductbankIndex = new Map();
  trays.forEach(tray => {
    const id = trayId(tray);
    if (id) trayIndex.set(normalizedKey(id), tray);
  });
  conduits.forEach(conduit => {
    const id = conduitId(conduit);
    if (id) conduitIndex.set(normalizedKey(id), conduit);
  });
  ductbanks.forEach(ductbank => {
    const id = ductbankId(ductbank);
    if (id) ductbankIndex.set(normalizedKey(id), ductbank);
    (Array.isArray(ductbank?.conduits) ? ductbank.conduits : []).forEach(conduit => {
      const nestedId = conduitId(conduit);
      if (nestedId) conduitIndex.set(normalizedKey(nestedId), { ...conduit, ductbankTag: id });
    });
  });
  return {
    trayIndex,
    conduitIndex,
    ductbankIndex,
    conduitAssignmentIndex: buildDuctbankConduitIndex({ conduits, ductbanks }),
  };
}

function findRaceway(id, indexes) {
  const key = normalizedKey(id);
  if (!key) return null;
  if (indexes.trayIndex.has(key)) return { kind: 'tray', id: text(id), record: indexes.trayIndex.get(key) };
  const conduitResolution = resolveDuctbankConduitAssignment({ conduit_id: id }, {}, indexes.conduitAssignmentIndex);
  if (conduitResolution.status === 'resolved') {
    return {
      kind: 'conduit',
      id: conduitResolution.identity,
      record: conduitResolution.record,
      conduitResolution,
    };
  }
  if (indexes.conduitIndex.has(key)) return { kind: 'conduit', id: text(id), record: indexes.conduitIndex.get(key) };
  if (indexes.ductbankIndex.has(key)) return { kind: 'ductbank', id: text(id), record: indexes.ductbankIndex.get(key) };
  return null;
}

function resolveSegmentRaceway(segment, cable, indexes) {
  if (segment.type !== 'field' && (segment.conduit_id || segment.ductbankTag || /conduit|ductbank/i.test(text(segment.type)))) {
    const conduitResolution = resolveDuctbankConduitAssignment(segment, cable, indexes.conduitAssignmentIndex);
    if (conduitResolution.status === 'resolved') {
      return {
        kind: 'conduit',
        id: conduitResolution.identity,
        record: conduitResolution.record,
        conduitResolution,
      };
    }
    if (conduitResolution.status !== 'not-applicable') {
      return { kind: 'unresolved-conduit', id: routeSegmentRacewayId(segment), conduitResolution };
    }
  }
  return findRaceway(routeSegmentRacewayId(segment), indexes);
}

function conduitResolutionIssue(resolved, cableName, segmentNumber) {
  const resolution = resolved?.conduitResolution;
  const parent = text(resolution?.ductbankId) || text(resolved?.id) || '(unknown ductbank)';
  if (resolution?.status === 'ambiguous' || resolution?.status === 'missing') {
    const candidates = resolution.candidates?.length ? ` Candidates: ${resolution.candidates.join(', ')}.` : '';
    return makeIssue(
      'DUCTBANK-CONDUIT-ASSIGNMENT-MISSING',
      'warning',
      `Segment ${segmentNumber} does not identify one internal conduit in ductbank "${parent}".${candidates}`,
      { blocking: true, cable: cableName, raceway: parent, segment: segmentNumber, href: 'ductbankroute.html' }
    );
  }
  return makeIssue(
    'DUCTBANK-CONDUIT-NOT-FOUND',
    'error',
    `Segment ${segmentNumber} references an internal conduit assignment that is not present in the ductbank schedule.`,
    { cable: cableName, raceway: parent, segment: segmentNumber, href: 'ductbankroute.html' }
  );
}

function addAssignedCable(map, resolved, cable) {
  const id = text(resolved?.id);
  const assignmentKey = `${resolved?.kind || 'raceway'}:${normalizedKey(id)}`;
  if (!id || !cable) return;
  if (!map.has(assignmentKey)) {
    map.set(assignmentKey, {
      id,
      kind: resolved.kind,
      record: resolved.record,
      conduitResolution: resolved.conduitResolution || null,
      cables: [],
    });
  }
  const assigned = map.get(assignmentKey).cables;
  const tag = normalizedKey(cableTag(cable));
  if (!assigned.some(existing => normalizedKey(cableTag(existing)) === tag)) assigned.push(cable);
}

function checkRouteGeometry(result, cable, indexes, tolerance) {
  const issues = [];
  const cableName = text(routeResultTag(result));
  const segments = result.route_segments || [];
  if (!segments.length) {
    issues.push(makeIssue('ROUTE-NO-SEGMENTS', 'error', 'Saved routed result has no route segments.', { cable: cableName }));
    return issues;
  }

  segments.forEach((segment, index) => {
    const start = finitePoint(segment.start);
    const end = finitePoint(segment.end);
    if (!start || !end) {
      issues.push(makeIssue('ROUTE-GEOMETRY-MISSING', 'error', `Segment ${index + 1} is missing finite XYZ start/end geometry.`, { cable: cableName, segment: index + 1 }));
      return;
    }
    const geometryLength = distance(start, end);
    const recordedLength = Number(segment.length);
    if (!(geometryLength > tolerance)) {
      issues.push(makeIssue('ROUTE-ZERO-LENGTH', 'error', `Segment ${index + 1} has zero or negligible length.`, { cable: cableName, segment: index + 1 }));
    }
    if (!Number.isFinite(recordedLength) || Math.abs(recordedLength - geometryLength) > Math.max(tolerance, geometryLength * 0.001)) {
      issues.push(makeIssue('ROUTE-SEGMENT-LENGTH-MISMATCH', 'error', `Segment ${index + 1} recorded length does not reconcile with its XYZ geometry.`, { cable: cableName, segment: index + 1 }));
    }
    if (index > 0) {
      const previousEnd = finitePoint(segments[index - 1].end);
      if (!closePoints(previousEnd, start, tolerance)) {
        issues.push(makeIssue('ROUTE-DISCONTINUITY', 'error', `Segment ${index} end does not meet segment ${index + 1} start within ${tolerance} drawing units.`, { cable: cableName, segment: index + 1 }));
      }
    }
    if (segment.type !== 'field') {
      const id = routeSegmentRacewayId(segment);
      const resolved = resolveSegmentRaceway(segment, cable, indexes);
      if (!id || !resolved) {
        issues.push(makeIssue('ROUTE-RACEWAY-NOT-FOUND', 'error', `Segment ${index + 1} references missing raceway "${id || '(blank)'}".`, { cable: cableName, raceway: id, segment: index + 1 }));
      } else if (resolved.kind === 'unresolved-conduit') {
        issues.push(conduitResolutionIssue(resolved, cableName, index + 1));
      } else {
        const requiredGroup = normalizedKey(cableGroup(cable));
        const allowedGroup = normalizedKey(racewayGroup(resolved.record));
        if (requiredGroup && allowedGroup && requiredGroup !== allowedGroup) {
          issues.push(makeIssue('ROUTE-CABLE-GROUP-MISMATCH', 'error', `Cable group "${cableGroup(cable)}" is not permitted by raceway "${id}" group "${racewayGroup(resolved.record)}".`, { cable: cableName, raceway: id, segment: index + 1 }));
        }
      }
    }
  });

  const firstStart = finitePoint(segments[0]?.start);
  const lastEnd = finitePoint(segments[segments.length - 1]?.end);
  const expectedStart = pointFromRecord(cable, 'start');
  const expectedEnd = pointFromRecord(cable, 'end');
  if (expectedStart && expectedEnd && firstStart && lastEnd) {
    const forward = closePoints(firstStart, expectedStart, tolerance) && closePoints(lastEnd, expectedEnd, tolerance);
    const reverse = closePoints(firstStart, expectedEnd, tolerance) && closePoints(lastEnd, expectedStart, tolerance);
    if (!forward && !reverse) {
      issues.push(makeIssue('ROUTE-ENDPOINT-MISMATCH', 'error', 'Route geometry does not terminate at the cable schedule start/end coordinates.', { cable: cableName }));
    }
  } else if (!expectedStart || !expectedEnd) {
    issues.push(makeIssue('ROUTE-ENDPOINT-EVIDENCE-MISSING', 'warning', 'Cable schedule endpoint coordinates are incomplete, so endpoint reconciliation could not be performed.', { blocking: true, cable: cableName, href: 'cableschedule.html' }));
  }

  const segmentTotal = segments.reduce((sum, segment) => sum + (Number(segment.length) || 0), 0);
  const recordedTotal = Number(result.total_length);
  if (!Number.isFinite(recordedTotal) || Math.abs(recordedTotal - segmentTotal) > Math.max(tolerance, segmentTotal * 0.001)) {
    issues.push(makeIssue('ROUTE-TOTAL-LENGTH-MISMATCH', 'error', 'Saved total route length does not equal the sum of route segment lengths.', { cable: cableName }));
  }
  return issues;
}

function buildCapacityChecks(assignments, indexes) {
  const checks = [];
  const issues = [];
  for (const assignment of assignments.values()) {
    const { id, cables } = assignment;
    const resolved = assignment.record
      ? assignment
      : findRaceway(id, indexes);
    if (!resolved || resolved.kind === 'unresolved-conduit') continue;
    if (resolved.kind === 'tray') {
      const result = evaluateTrayFill(resolved.record, cables);
      checks.push({ racewayId: id, kind: 'tray', cableTags: cables.map(cableTag), result });
      if (result.status === 'fail') {
        issues.push(makeIssue('TRAY-FILL-EXCEEDED', 'error', summarizeTrayFillResult(result), { raceway: id, href: 'cabletrayfill.html' }));
      } else if (result.status !== 'pass') {
        issues.push(makeIssue('TRAY-FILL-EVIDENCE-INCOMPLETE', 'warning', summarizeTrayFillResult(result), { blocking: true, raceway: id, href: 'cabletrayfill.html' }));
      }
    } else if (resolved.kind === 'conduit') {
      const result = evaluateConduitFill(resolved.record, cables);
      checks.push({
        racewayId: id,
        kind: 'conduit',
        ductbankId: resolved.conduitResolution?.ductbankId || '',
        conduitId: resolved.conduitResolution?.conduitId || conduitId(resolved.record),
        assignmentSource: resolved.conduitResolution?.source || 'raceway-reference',
        cableTags: cables.map(cableTag),
        result,
      });
      if (!result.internalAreaIn2 || result.missingAreaCables.length || !result.fillLimit) {
        issues.push(makeIssue('CONDUIT-FILL-EVIDENCE-INCOMPLETE', 'warning', `Conduit "${id}" is missing a recognized type/size or cable outside-diameter evidence.`, { blocking: true, raceway: id, href: 'conduitfill.html' }));
      } else if (result.fillPercent > result.fillLimit * 100 + 1e-9) {
        issues.push(makeIssue('CONDUIT-FILL-EXCEEDED', 'error', `Conduit "${id}" fill ${result.fillPercent.toFixed(1)}% exceeds the selected ${(result.fillLimit * 100).toFixed(0)}% Chapter 9 screen.`, { raceway: id, href: 'conduitfill.html' }));
      }
    }
  }
  return { checks, issues };
}

/**
 * Verify saved route results and the capacity evidence for the raceways they use.
 */
export function buildRacewayAssurance({
  routeResults = [],
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  currentInputFingerprint = '',
  tolerance = 0.01,
} = {}) {
  const indexes = buildRacewayIndexes({
    trays: Array.isArray(trays) ? trays : [],
    conduits: Array.isArray(conduits) ? conduits : [],
    ductbanks: Array.isArray(ductbanks) ? ductbanks : [],
  });
  const cableByTag = new Map((Array.isArray(cables) ? cables : [])
    .map(cable => [normalizedKey(cableTag(cable)), cable])
    .filter(([tag]) => tag));
  const savedFingerprint = routeResults && typeof routeResults === 'object' && !Array.isArray(routeResults)
    ? text(routeResults.inputFingerprint)
    : '';
  const rows = normalizeRouteResults(routeResults).filter(routeResultSucceeded);
  const issues = [];
  const assignments = new Map();
  const seenTags = new Set();
  const resultChecks = [];

  if (currentInputFingerprint && savedFingerprint && currentInputFingerprint !== savedFingerprint) {
    issues.push(makeIssue('ROUTE-RESULTS-STALE', 'error', 'Saved route-result fingerprint does not match the current project inputs. Rerun routing before issue.'));
  } else if (currentInputFingerprint && !savedFingerprint && rows.length) {
    issues.push(makeIssue('ROUTE-FINGERPRINT-MISSING', 'warning', 'Saved route results do not carry an input fingerprint, so freshness cannot be established.', { blocking: true }));
  }

  rows.forEach(result => {
    const tag = text(routeResultTag(result));
    const key = normalizedKey(tag);
    const cable = cableByTag.get(key);
    const rowIssues = [];
    if (!cable) {
      rowIssues.push(makeIssue('ROUTE-CABLE-NOT-FOUND', 'error', `Route result references missing cable "${tag || '(blank)'}".`, { cable: tag }));
    }
    if (key && seenTags.has(key)) {
      rowIssues.push(makeIssue('ROUTE-DUPLICATE-CABLE', 'error', `Multiple saved route results exist for cable "${tag}".`, { cable: tag }));
    }
    if (key) seenTags.add(key);
    if (cable) rowIssues.push(...checkRouteGeometry(result, cable, indexes, tolerance));

    const fieldRouteBasis = buildFieldRouteBasis(result);
    const conduitAssignments = [];
    (result.route_segments || []).forEach((segment, segmentIndex) => {
      if (segment.type === 'field' || !cable) return;
      const resolved = resolveSegmentRaceway(segment, cable, indexes);
      if (resolved?.conduitResolution && resolved.conduitResolution.status !== 'not-applicable') {
        conduitAssignments.push({
          segment: segmentIndex + 1,
          status: resolved.conduitResolution.status,
          source: resolved.conduitResolution.source,
          identity: resolved.conduitResolution.identity,
          ductbankId: resolved.conduitResolution.ductbankId,
          conduitId: resolved.conduitResolution.conduitId,
          candidates: resolved.conduitResolution.candidates,
        });
      }
      if (resolved && resolved.kind !== 'unresolved-conduit') addAssignedCable(assignments, resolved, cable);
    });
    issues.push(...rowIssues);
    resultChecks.push({
      cable: tag,
      signature: routeAssuranceSignature(result, { cable, conduitAssignmentIndex: indexes.conduitAssignmentIndex }),
      fieldRouteBasis,
      conduitAssignments,
      issues: rowIssues,
      ready: !rowIssues.some(issue => issue.blocking),
    });
  });

  const capacity = buildCapacityChecks(assignments, indexes);
  issues.push(...capacity.issues);
  const blockingIssues = issues.filter(issue => issue.blocking);
  const warnings = issues.filter(issue => !issue.blocking || issue.severity === 'warning');
  return {
    schemaVersion: 2,
    status: blockingIssues.length ? 'blocked' : warnings.length ? 'review' : 'pass',
    intendedUse: 'Routing, internal-conduit assignment, and selected fill evidence for issue-gate screening; manufacturer constraints and qualified field review remain required.',
    inputFingerprint: savedFingerprint || null,
    currentInputFingerprint: currentInputFingerprint || null,
    routeCount: rows.length,
    resultChecks,
    capacityChecks: capacity.checks,
    issues,
    blockingIssues,
    warnings,
    summary: {
      routesChecked: rows.length,
      routeSignatures: resultChecks.length,
      fieldRoutes: resultChecks.filter(check => check.fieldRouteBasis).length,
      capacityChecks: capacity.checks.length,
      internalConduitAssignments: resultChecks.reduce((sum, check) => sum + check.conduitAssignments.filter(item => item.status === 'resolved' && item.ductbankId).length, 0),
      unresolvedConduitAssignments: resultChecks.reduce((sum, check) => sum + check.conduitAssignments.filter(item => item.status !== 'resolved').length, 0),
      blockingIssues: blockingIssues.length,
      warnings: warnings.length,
    },
  };
}
