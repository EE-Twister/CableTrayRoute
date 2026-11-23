export const EQUIPMENT_SCREENING_CAVEAT = 'Equipment checks compare plotted protective curves with equipment reference limits; they do not verify device clearing time or complete protection.';

function equipmentAssociationReviewDetail(evaluation) {
  const reason = evaluation.associationReason;
  if (reason === 'ambiguous_nearest_upstream_devices' || reason === 'ambiguous_plotted_device') {
    return 'Protection association is unknown because more than one nearest-upstream device is possible. Review the one-line topology and device assignments.';
  }
  if (reason === 'associated_device_not_plotted') {
    return 'Protection association is unknown because the uniquely assigned nearest-upstream device is not plotted. Plot that component-bound device and review the screening check.';
  }
  if (reason === 'constraint_data_incomplete') {
    return 'Protection screening is unknown because the equipment reference does not contain complete current/time data.';
  }
  return 'Protection association is unknown because no uniquely assigned nearest-upstream device was found. Review the one-line topology and device assignments.';
}

function equipmentConstraintReviewDetail(evaluation, formatCurrent) {
  if (evaluation.associationReason) return equipmentAssociationReviewDetail(evaluation);

  const reasonDetails = {
    'invalid-constraint-input': 'The equipment constraint inputs are invalid or incomplete.',
    'associated-device-missing': 'The associated protective device is missing.',
    'empty-protective-curve': 'The associated protective device has no usable curve points.',
    'curve-domain-incomplete': 'The associated protective curve does not cover the equipment comparison current range.',
    'curve-comparison-incomplete': 'The protective curve comparison could not be evaluated across the required range.'
  };
  const coverage = evaluation.coverage || {};
  const formatRange = range => {
    if (!Number.isFinite(range?.minimumCurrentA) || !Number.isFinite(range?.maximumCurrentA)) return null;
    const minimum = formatCurrent(range.minimumCurrentA);
    const maximum = formatCurrent(range.maximumCurrentA);
    return range.minimumCurrentA === range.maximumCurrentA
      ? `${minimum} A`
      : `${minimum}–${maximum} A`;
  };
  const requiredRange = formatRange(coverage.requiredCurrentRangeA);
  const availableRange = formatRange(coverage.availableCurrentRangeA);
  const evaluatedRange = formatRange(coverage.evaluatedCurrentRangeA);
  const coverageDetail = [
    requiredRange ? `Required current range: ${requiredRange}.` : '',
    availableRange ? `Available protective-curve range: ${availableRange}.` : '',
    evaluatedRange ? `Evaluated current range: ${evaluatedRange}.` : 'No current interval was evaluated.'
  ].filter(Boolean).join(' ');
  const detail = reasonDetails[evaluation.reason]
    || 'The equipment protection comparison is unknown because its evidence coverage is incomplete.';
  return `Protection screening is unknown. ${detail} ${coverageDetail} No trip time or margin is reported.`;
}

function formatUnevaluatedEquipmentCheck(evaluation, formatCurrent) {
  return {
    kind: evaluation.kind,
    reason: evaluation.reason,
    status: 'warning',
    screeningStatus: 'unknown',
    label: evaluation.overlay?.sourceLabel || evaluation.overlay?.name || 'Equipment',
    detail: equipmentConstraintReviewDetail(evaluation, formatCurrent)
  };
}

function formatReviewCheck(evaluation, formatCurrent) {
  if (!evaluation.associationReason && evaluation.screeningStatus === 'unknown') {
    return formatUnevaluatedEquipmentCheck(evaluation, formatCurrent);
  }
  return {
    kind: evaluation.kind,
    status: 'warning',
    screeningStatus: 'unknown',
    label: evaluation.overlay?.sourceLabel || evaluation.overlay?.name || 'Equipment',
    detail: equipmentConstraintReviewDetail(evaluation, formatCurrent)
  };
}

function formatRideThroughCheck(evaluation, formatSeconds, formatCurrent) {
  const { current, margin, overlay, status } = evaluation;
  const label = overlay?.sourceLabel || overlay?.name || 'Equipment';
  if (status === 'review' || evaluation.screeningStatus === 'unknown') {
    return formatReviewCheck(evaluation, formatCurrent);
  }
  const eventName = overlay.kind === 'inrush'
    ? 'inrush'
    : `${overlay.startProfile || 'motor start'}${overlay.estimated ? ' estimate' : ''}`.toLowerCase();
  return {
    kind: evaluation.kind,
    status,
    label,
    detail: status === 'ok'
      ? `Plotted lower protective curve rides through the ${eventName} reference by ${formatSeconds(margin)} s.`
      : `Plotted lower protective curve does not ride through the ${eventName} reference; margin ${formatSeconds(margin)} s at ${formatCurrent(current)} A.`
  };
}

function formatDamageLimitCheck(evaluation, formatSeconds, formatCurrent) {
  const { margin, overlay, point, status } = evaluation;
  const label = overlay?.sourceLabel || overlay?.name || 'Equipment';
  if (status === 'review' || evaluation.screeningStatus === 'unknown') {
    return formatReviewCheck(evaluation, formatCurrent);
  }
  const noun = overlay.kind === 'cable'
    ? 'cable damage'
    : overlay.kind === 'motorThermal'
      ? 'motor thermal limit'
      : 'transformer damage';
  return {
    kind: evaluation.kind,
    status,
    label,
    detail: status === 'ok'
      ? `Plotted upper protective curve is at or below the ${noun} reference; margin ${formatSeconds(margin)} s.`
      : `Plotted upper protective curve meets or exceeds the ${noun} reference; margin ${formatSeconds(margin)} s at ${formatCurrent(point.current)} A.`
  };
}

export function formatEquipmentConstraintCheck(evaluation, { formatSeconds, formatCurrent }) {
  return evaluation.kind === 'rideThrough'
    ? formatRideThroughCheck(evaluation, formatSeconds, formatCurrent)
    : formatDamageLimitCheck(evaluation, formatSeconds, formatCurrent);
}
