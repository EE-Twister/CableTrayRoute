import {
  cableHasRoutingCoordinates,
  getCableAssignedRacewayIds
} from '../../analysis/scheduleWorkflow.mjs';
import { summarizeRouteScreening } from '../../analysis/routeScreeningSummary.mjs';
import { routeResultSucceeded } from '../../analysis/routeResults.mjs';

export function isRoutedResult(result) {
  return Boolean(result) && routeResultSucceeded(result);
}

export function formatRouteDistance(value, formatter = null) {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return 'N/A';
  return typeof formatter === 'function' ? formatter(distance) : `${distance.toFixed(2)} ft`;
}

export function getRejectedReasonCounts(results = []) {
  const counts = {};
  results.forEach(result => {
    (result?.exclusions || []).forEach(exclusion => {
      if (exclusion.reason) counts[exclusion.reason] = (counts[exclusion.reason] || 0) + 1;
    });
    (result?.mismatched_records || []).forEach(record => {
      const reason = record.reason || 'mismatched raceway';
      counts[reason] = (counts[reason] || 0) + 1;
    });
  });
  return counts;
}

export function buildRouteIssueAdvice(result, { cables = [], readiness = null } = {}) {
  if (isRoutedResult(result)) return [];
  const reasons = new Set([
    ...(result?.exclusions || []).map(exclusion => exclusion.reason).filter(Boolean),
    ...(result?.mismatched_records || []).map(record => record.reason).filter(Boolean)
  ]);
  const advice = [];
  const matchingCable = cables.find(cable => {
    const tag = cable.name || cable.tag || cable.id || cable.ref;
    return String(tag || '') === String(result?.cable || '');
  });

  if (matchingCable && !cableHasRoutingCoordinates(matchingCable)) {
    advice.push('Add start/end XYZ coordinates for this cable, then rerun routing.');
  }
  if (matchingCable && readiness?.diagnostics?.invalidAssignedRefs) {
    const cableTag = matchingCable.name || matchingCable.tag || matchingCable.id || matchingCable.ref || '(untagged cable)';
    const assignedRefs = new Set(getCableAssignedRacewayIds(matchingCable));
    const invalidRefs = readiness.diagnostics.invalidAssignedRefs
      .filter(item => item.cable === cableTag && assignedRefs.has(item.raceway))
      .map(item => item.raceway);
    if (invalidRefs.length) {
      advice.push(`Confirm raceway assignment(s) ${invalidRefs.join(', ')} exist in the Raceway Schedule.`);
    }
  }
  if ([...reasons].some(reason => /fill|capacity/i.test(reason))) {
    advice.push('Review tray fill or lower the cable group density before rerouting.');
  }
  if ([...reasons].some(reason => /group|segregation|mismatch/i.test(reason))) {
    advice.push('Check allowed cable group values in the cable and raceway schedules.');
  }
  if (result?.total_length === 'N/A' || reasons.size === 0) {
    advice.push('Check that start/end coordinates are near the tray network or increase the proximity threshold.');
  }
  return advice;
}

export function buildRouteExplanationPoints(result, options = {}) {
  if (!result) return [];
  if (!isRoutedResult(result)) {
    return ['No valid route was found for this cable.', ...buildRouteIssueAdvice(result, options)];
  }
  const trayCount = Number(result.tray_segments_count) || 0;
  const fieldLength = Number(result.field_length) || 0;
  const formatDistance = options.formatDistance || (value => formatRouteDistance(value));
  const points = [
    `${result.mode || 'Automatic'} route selected using ${trayCount} tray/conduit segment${trayCount === 1 ? '' : 's'}.`,
    fieldLength > 0
      ? `${formatDistance(fieldLength)} of field routing was used for endpoint jumps or network gaps.`
      : 'No field routing was needed for this cable.'
  ];
  const screeningCount = summarizeRouteScreening(result).total;
  points.push(screeningCount
    ? `${screeningCount} candidate segment${screeningCount === 1 ? '' : 's'} were not used; review the grouped reasons below.`
    : 'Every reported candidate raceway remained eligible for this route.');
  return points;
}

export function summarizeRouteReview(results = [], updatedUtilization = [], isOverloaded = () => false) {
  const routed = results.filter(isRoutedResult);
  const primary = routed[0] || {};
  const primaryLength = Number(primary.total_length) || 0;
  const primaryFieldLength = Number(primary.field_length) || 0;
  const totalLength = routed.reduce((sum, row) => sum + (Number(row.total_length) || 0), 0);
  const totalFieldLength = routed.reduce((sum, row) => sum + (Number(row.field_length) || 0), 0);
  return {
    routedCount: routed.length,
    failedCount: results.length - routed.length,
    primaryLength,
    primaryContainedPercent: primaryLength > 0
      ? Math.max(0, 100 - (primaryFieldLength / primaryLength) * 100)
      : 0,
    containedLength: totalLength - totalFieldLength,
    overloadCount: updatedUtilization.filter(isOverloaded).length
  };
}
