const REASON_DETAILS = {
  over_capacity: {
    label: 'Capacity limit',
    description: 'Adding this cable would exceed the configured raceway fill limit.'
  },
  group_mismatch: {
    label: 'Cable class mismatch',
    description: 'The raceway is assigned to a different voltage or circuit class.'
  },
  start_beyond_proximity: {
    label: 'Start outside search range',
    description: 'The raceway is farther from the cable start than the configured proximity threshold.'
  },
  end_beyond_proximity: {
    label: 'End outside search range',
    description: 'The raceway is farther from the cable end than the configured proximity threshold.'
  },
  not_found: {
    label: 'Raceway not found',
    description: 'A referenced raceway could not be found in the available routing network.'
  }
};

const displayText = value => String(value || '').trim();

const fallbackLabel = reason => displayText(reason)
  .replace(/_/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase()) || 'Other screening rule';

const candidateId = item => displayText(
  item?.tray_id
  || item?.id
  || [item?.ductbank_tag, item?.conduit_id].filter(Boolean).join(':')
  || 'Unidentified raceway'
);

export function routeScreeningCandidates(result = {}) {
  const candidates = [];
  const seen = new Set();
  const sourceItems = [
    ...(Array.isArray(result.exclusions) ? result.exclusions : []),
    ...(Array.isArray(result.mismatched_records) ? result.mismatched_records : [])
  ];

  sourceItems.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const reason = displayText(item.reason) || 'other';
    const id = candidateId(item);
    const key = `${id.toLowerCase()}|${reason.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id,
      reason,
      message: displayText(item.message),
      filter: displayText(item.filter),
      conduitId: displayText(item.conduit_id),
      ductbankTag: displayText(item.ductbank_tag)
    });
  });

  return candidates;
}

export function summarizeRouteScreening(result = {}) {
  const candidates = routeScreeningCandidates(result);
  const groupMap = new Map();

  candidates.forEach(candidate => {
    const details = REASON_DETAILS[candidate.reason] || {
      label: fallbackLabel(candidate.reason),
      description: 'The candidate did not satisfy one of the configured routing rules.'
    };
    if (!groupMap.has(candidate.reason)) {
      groupMap.set(candidate.reason, {
        code: candidate.reason,
        label: details.label,
        description: details.description,
        count: 0,
        candidates: []
      });
    }
    const group = groupMap.get(candidate.reason);
    group.count += 1;
    group.candidates.push(candidate);
  });

  const groups = [...groupMap.values()].sort((left, right) => (
    right.count - left.count || left.label.localeCompare(right.label)
  ));

  return {
    total: candidates.length,
    groups,
    candidates
  };
}

export { REASON_DETAILS };
