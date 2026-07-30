function finite(value) {
  return Number.isFinite(Number(value));
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintStudySource(value) {
  const text = stableSerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function validatePowerFlowStudyModel(model, options = {}) {
  const buses = Array.isArray(model?.buses) ? model.buses : [];
  const branches = Array.isArray(model?.branches) ? model.branches : [];
  const errors = [];
  const warnings = [];
  const requireLoad = options.requireLoad !== false;
  const requireGeneration = options.requireGeneration === true;

  if (buses.length < 2) errors.push('At least two buses are required.');
  if (!branches.length) errors.push('At least one connected branch is required.');

  const slackBuses = buses.filter(bus => `${bus?.type || ''}`.toLowerCase() === 'slack');
  if (!slackBuses.length) errors.push('A source or slack bus is required.');
  if (slackBuses.length > 1) warnings.push('Multiple source/slack buses were found; confirm the intended operating point.');

  buses.forEach(bus => {
    if (!(Number(bus?.baseKV) > 0)) {
      errors.push(`Bus ${bus?.displayLabel || bus?.label || bus?.id || 'unknown'} needs a valid base voltage.`);
    }
  });

  const connected = new Set();
  branches.forEach(branch => {
    if (branch?.from) connected.add(branch.from);
    if (branch?.to) connected.add(branch.to);
  });
  buses.filter(bus => bus?.id && !connected.has(bus.id)).forEach(bus => {
    errors.push(`Bus ${bus.displayLabel || bus.label || bus.id} is isolated.`);
  });

  const totalLoadKw = buses.reduce((sum, bus) => (
    sum + Number(bus?.load?.kw ?? bus?.load?.kW ?? bus?.Pd ?? 0)
  ), 0);
  const totalGenerationKw = buses.reduce((sum, bus) => (
    sum + Number(bus?.generation?.kw ?? bus?.generation?.kW ?? bus?.Pg ?? 0)
  ), 0);
  if (requireLoad && !(totalLoadKw > 0)) errors.push('At least one positive load is required.');
  if (!requireLoad && !(totalLoadKw > 0)) warnings.push('No positive load was found.');
  if (requireGeneration && !(totalGenerationKw > 0)) errors.push('At least one generator with positive output is required.');

  branches.forEach(branch => {
    if (!branch?.from || !branch?.to) {
      errors.push(`Branch ${branch?.name || branch?.label || branch?.id || 'unknown'} needs from and to buses.`);
    }
  });

  return {
    ready: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    counts: {
      buses: buses.length,
      branches: branches.length,
      slackBuses: slackBuses.length
    },
    totals: {
      loadKw: finite(totalLoadKw) ? totalLoadKw : 0,
      generationKw: finite(totalGenerationKw) ? totalGenerationKw : 0
    },
    sourceFingerprint: fingerprintStudySource({ buses, branches })
  };
}

export function evaluateConvergenceCoverage(convergedCount, totalCount, options = {}) {
  const converged = Math.max(0, Number(convergedCount) || 0);
  const total = Math.max(0, Number(totalCount) || 0);
  const minimumRatio = Math.min(1, Math.max(0, Number(options.minimumRatio) || 0));
  const minimumConverged = Math.max(1, Number(options.minimumConverged) || 1);
  const ratio = total > 0 ? converged / total : 0;
  const valid = total > 0 && converged >= minimumConverged && ratio >= minimumRatio;
  let status = 'valid';
  let message = `${converged} of ${total} cases converged.`;
  if (!converged) {
    status = 'invalid';
    message = 'No cases converged.';
  } else if (!valid) {
    status = 'insufficient';
    message = `${converged} of ${total} cases converged (${(ratio * 100).toFixed(1)}%); at least ${(minimumRatio * 100).toFixed(1)}% is required.`;
  } else if (converged < total) {
    status = 'review';
    message = `${converged} of ${total} cases converged (${(ratio * 100).toFixed(1)}%); review excluded cases.`;
  }
  return {
    valid,
    status,
    convergedCount: converged,
    totalCount: total,
    ratio,
    coveragePct: ratio * 100,
    minimumRatio,
    minimumConverged,
    message
  };
}

export function createStudyRunMetadata(studyKey, readiness, coverage, extra = {}) {
  return {
    studyKey,
    runAt: new Date().toISOString(),
    valid: Boolean(readiness?.ready) && Boolean(coverage?.valid),
    sourceFingerprint: readiness?.sourceFingerprint || null,
    inputCounts: readiness?.counts || null,
    convergence: coverage || null,
    ...extra
  };
}

export function isStudyResultStale(result, currentSourceFingerprint) {
  const savedFingerprint = result?.runMetadata?.sourceFingerprint;
  return Boolean(savedFingerprint && currentSourceFingerprint && savedFingerprint !== currentSourceFingerprint);
}
