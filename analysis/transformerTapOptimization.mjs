const EPSILON = 1e-9;
const DEFAULT_MIN_VOLTAGE_PU = 0.95;
const DEFAULT_MAX_VOLTAGE_PU = 1.05;
const MAX_PERMITTED_TAP_STEPS = 201;

function cloneData(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function firstFinite(values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return null;
}

function readValue(component, keys) {
  for (const key of keys) {
    if (component && component[key] !== undefined && component[key] !== null && component[key] !== '') {
      return component[key];
    }
    if (component?.props && component.props[key] !== undefined && component.props[key] !== null && component.props[key] !== '') {
      return component.props[key];
    }
  }
  return null;
}

function readNested(component, key) {
  const direct = component?.[key];
  const nested = component?.props?.[key];
  const directRecord = direct && typeof direct === 'object' && !Array.isArray(direct) ? direct : {};
  const nestedRecord = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : {};
  return { ...nestedRecord, ...directRecord };
}

function readNestedValue(component, objectKey, keys) {
  const nested = readNested(component, objectKey);
  return firstNonEmpty(keys.map(key => nested[key]));
}

function isTransformer(component) {
  const type = String(component?.type || '').toLowerCase();
  const subtype = String(component?.subtype || '').toLowerCase();
  return type === 'transformer' || subtype.includes('transformer') || subtype.includes('xfmr');
}

function formatRatio(ratio) {
  return Number(Number(ratio).toFixed(8));
}

function resolveNominalTapVolts(component) {
  return firstFinite([
    readNestedValue(component, 'ltc', ['nominal_tap_volts', 'nominal_voltage_volts']),
    readValue(component, ['volts_secondary', 'volts_lv', 'voltage_secondary', 'voltage_lv']),
    readValue(component, ['volts_primary', 'volts_hv', 'voltage_primary', 'voltage_hv'])
  ]);
}

function resolveCurrentTapRatio(component) {
  const directTap = readValue(component, ['tap', 'tap_ratio', 'tapRatio']);
  const objectTap = directTap && typeof directTap === 'object'
    ? firstFinite([directTap.ratio, directTap.tap_ratio, directTap.tapRatio])
    : null;
  if (Number.isFinite(objectTap) && objectTap > 0) return formatRatio(objectTap);

  const scalarTap = directTap && typeof directTap !== 'object' ? Number(directTap) : null;
  if (Number.isFinite(scalarTap) && scalarTap > 0) return formatRatio(scalarTap);

  const percentTap = firstFinite([
    readValue(component, ['tap_percent']),
    readNestedValue(component, 'ltc', ['tap_percent', 'position_percent'])
  ]);
  if (Number.isFinite(percentTap)) return formatRatio(1 + percentTap / 100);
  return 1;
}

function resolveRange(component, nominalTapVolts) {
  const ltc = readNested(component, 'ltc');
  const minVolts = firstFinite([
    ltc.min_tap_volts,
    ltc.min_tap_voltage,
    readValue(component, ['min_tap_volts', 'tap_min_volts'])
  ]);
  const maxVolts = firstFinite([
    ltc.max_tap_volts,
    ltc.max_tap_voltage,
    readValue(component, ['max_tap_volts', 'tap_max_volts'])
  ]);
  if (Number.isFinite(minVolts) && Number.isFinite(maxVolts) && Number.isFinite(nominalTapVolts) && nominalTapVolts > 0) {
    return { minRatio: minVolts / nominalTapVolts, maxRatio: maxVolts / nominalTapVolts, minVolts, maxVolts };
  }

  const minRatio = firstFinite([
    ltc.min_tap_ratio,
    ltc.tap_min_ratio,
    readValue(component, ['min_tap_ratio', 'tap_min_ratio'])
  ]);
  const maxRatio = firstFinite([
    ltc.max_tap_ratio,
    ltc.tap_max_ratio,
    readValue(component, ['max_tap_ratio', 'tap_max_ratio'])
  ]);
  if (Number.isFinite(minRatio) && Number.isFinite(maxRatio)) {
    return { minRatio, maxRatio, minVolts: null, maxVolts: null };
  }

  const minPercent = firstFinite([
    ltc.min_tap_percent,
    ltc.tap_min_percent,
    readValue(component, ['min_tap_percent', 'tap_min_percent'])
  ]);
  const maxPercent = firstFinite([
    ltc.max_tap_percent,
    ltc.tap_max_percent,
    readValue(component, ['max_tap_percent', 'tap_max_percent'])
  ]);
  if (Number.isFinite(minPercent) && Number.isFinite(maxPercent)) {
    return {
      minRatio: 1 + minPercent / 100,
      maxRatio: 1 + maxPercent / 100,
      minVolts: Number.isFinite(nominalTapVolts) ? nominalTapVolts * (1 + minPercent / 100) : null,
      maxVolts: Number.isFinite(nominalTapVolts) ? nominalTapVolts * (1 + maxPercent / 100) : null
    };
  }
  return null;
}

export function normalizeTransformerTapConstraints(component, options = {}) {
  if (!isTransformer(component)) return { eligible: false, reason: 'not_transformer' };
  const ltc = readNested(component, 'ltc');
  const explicitConstraint = [
    'tap_step_percent', 'step_percent', 'tap_min_ratio', 'tap_max_ratio',
    'min_tap_ratio', 'max_tap_ratio', 'tap_min_percent', 'tap_max_percent',
    'min_tap_percent', 'max_tap_percent', 'min_tap_volts', 'max_tap_volts'
  ].some(key => readValue(component, [key]) !== null);
  const enabledSetting = ltc.enabled ?? readValue(component, ['ltc_enabled', 'tap_control_enabled']);
  const explicitlyDisabled = enabledSetting === false || String(enabledSetting).trim().toLowerCase() === 'false';
  const explicitlyEnabled = enabledSetting === true || String(enabledSetting).trim().toLowerCase() === 'true';
  const enabled = explicitlyDisabled ? false : explicitlyEnabled || (enabledSetting === null || enabledSetting === undefined) && explicitConstraint;
  if (!enabled) return { eligible: false, reason: 'ltc_not_enabled' };

  const nominalTapVolts = resolveNominalTapVolts(component);
  const range = resolveRange(component, nominalTapVolts);
  if (!range || !Number.isFinite(range.minRatio) || !Number.isFinite(range.maxRatio) || range.minRatio >= range.maxRatio) {
    return { eligible: false, reason: 'missing_tap_range', nominalTapVolts };
  }

  const stepPercent = firstFinite([
    ltc.step_percent,
    ltc.tap_step_percent,
    readValue(component, ['step_percent', 'tap_step_percent'])
  ]);
  const stepRatio = firstFinite([
    ltc.step_ratio,
    ltc.tap_step_ratio,
    readValue(component, ['step_ratio', 'tap_step_ratio'])
  ]) ?? (Number.isFinite(stepPercent) ? stepPercent / 100 : null);
  if (!Number.isFinite(stepRatio) || stepRatio <= 0) {
    return { eligible: false, reason: 'missing_tap_step', nominalTapVolts, ...range };
  }

  const minVoltagePu = firstFinite([
    options.minVoltagePu,
    ltc.min_voltage_pu,
    ltc.voltage_min_pu
  ]) ?? DEFAULT_MIN_VOLTAGE_PU;
  const maxVoltagePu = firstFinite([
    options.maxVoltagePu,
    ltc.max_voltage_pu,
    ltc.voltage_max_pu
  ]) ?? DEFAULT_MAX_VOLTAGE_PU;
  if (minVoltagePu <= 0 || maxVoltagePu <= minVoltagePu) {
    return {
      eligible: false,
      reason: 'invalid_voltage_limits',
      nominalTapVolts,
      ...range,
      minVoltagePu,
      maxVoltagePu
    };
  }
  const setpointPu = firstFinite([
    ltc.setpoint_pu,
    ltc.voltage_setpoint_pu,
    options.setpointPu
  ]) ?? 1;
  const controlledBusId = firstNonEmpty([
    ltc.regulated_bus_id,
    ltc.controlled_bus_id,
    ltc.bus_id,
    readValue(component, ['regulated_bus_id', 'controlled_bus_id'])
  ]);

  return {
    eligible: true,
    enabled: true,
    currentTapRatio: resolveCurrentTapRatio(component),
    nominalTapVolts,
    minRatio: Math.min(range.minRatio, range.maxRatio),
    maxRatio: Math.max(range.minRatio, range.maxRatio),
    minTapVolts: range.minVolts,
    maxTapVolts: range.maxVolts,
    stepPercent: Number.isFinite(stepPercent) ? stepPercent : stepRatio * 100,
    stepRatio,
    setpointPu,
    minVoltagePu,
    maxVoltagePu,
    controlledBusId
  };
}

export function buildPermittedTapRatios(constraints) {
  if (!constraints?.eligible) return [];
  const { minRatio, maxRatio, stepRatio } = constraints;
  const start = Math.ceil(((minRatio - 1) / stepRatio) - EPSILON);
  const end = Math.floor(((maxRatio - 1) / stepRatio) + EPSILON);
  const count = end - start + 1;
  if (count <= 0 || count > MAX_PERMITTED_TAP_STEPS) return [];
  return Array.from({ length: count }, (_, index) => formatRatio(1 + (start + index) * stepRatio));
}

function flattenComponents(oneLine) {
  return (Array.isArray(oneLine?.sheets) ? oneLine.sheets : [])
    .flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
}

function resolveTransformerBranch(model, transformerId) {
  return (model?.branches || []).find(branch => branch?.id === transformerId) || null;
}

function summarizeStudyResult(result, controlledBusId, setpointPu, minVoltagePu, maxVoltagePu, currentTargetVoltagePu = null) {
  const buses = Array.isArray(result?.buses) ? result.buses.filter(bus => Number.isFinite(bus?.Vm)) : [];
  const targetBuses = buses.filter(bus => bus.id === controlledBusId);
  const targetVoltagePu = targetBuses.length
    ? targetBuses.reduce((sum, bus) => sum + bus.Vm, 0) / targetBuses.length
    : null;
  const voltageValues = buses.map(bus => bus.Vm);
  const systemMinPu = voltageValues.length ? Math.min(...voltageValues) : null;
  const systemMaxPu = voltageValues.length ? Math.max(...voltageValues) : null;
  const lowViolations = voltageValues.filter(value => value < minVoltagePu - EPSILON).length;
  const highViolations = voltageValues.filter(value => value > maxVoltagePu + EPSILON).length;
  const violations = lowViolations + highViolations;
  const converged = result?.converged !== false;
  const feasible = converged && Number.isFinite(targetVoltagePu) && buses.length > 0 && violations === 0;
  return {
    converged,
    feasible,
    targetVoltagePu,
    deltaVoltagePu: Number.isFinite(targetVoltagePu) && Number.isFinite(currentTargetVoltagePu)
      ? targetVoltagePu - currentTargetVoltagePu
      : null,
    deltaVoltagePct: Number.isFinite(targetVoltagePu) && Number.isFinite(currentTargetVoltagePu) && currentTargetVoltagePu !== 0
      ? (targetVoltagePu - currentTargetVoltagePu) / currentTargetVoltagePu * 100
      : null,
    targetErrorPu: Number.isFinite(targetVoltagePu) ? Math.abs(targetVoltagePu - setpointPu) : null,
    systemMinPu,
    systemMaxPu,
    lowViolations,
    highViolations,
    violations,
    busCount: buses.length,
    warning: result?.warnings?.length ? cloneData(result.warnings) : []
  };
}

function compareCases(a, b, currentTapRatio) {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  const aError = Number.isFinite(a.targetErrorPu) ? a.targetErrorPu : Number.POSITIVE_INFINITY;
  const bError = Number.isFinite(b.targetErrorPu) ? b.targetErrorPu : Number.POSITIVE_INFINITY;
  if (Math.abs(aError - bError) > EPSILON) return aError - bError;
  return Math.abs(a.tapRatio - currentTapRatio) - Math.abs(b.tapRatio - currentTapRatio);
}

function updateTransformerTapInClone(component, ratio) {
  const next = component;
  const updateExistingTapKeys = target => {
    if (!target || typeof target !== 'object') return false;
    let updated = false;
    ['tap_ratio', 'tapRatio', 'tap'].forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(target, key)) return;
      const value = target[key];
      target[key] = key === 'tap' && value && typeof value === 'object' && !Array.isArray(value)
        ? { ...value, ratio }
        : ratio;
      updated = true;
    });
    return updated;
  };
  const updatedDirect = updateExistingTapKeys(next);
  const updatedProps = updateExistingTapKeys(next.props);
  if (!updatedDirect && !updatedProps) {
    next.tap_ratio = ratio;
    next.props = { ...(next.props || {}), tap_ratio: ratio };
  }
  if (Object.prototype.hasOwnProperty.call(next, 'tap_percent')) next.tap_percent = (ratio - 1) * 100;
  if (Object.prototype.hasOwnProperty.call(next.props || {}, 'tap_percent')) next.props.tap_percent = (ratio - 1) * 100;
  return next;
}

export function applyTapRatioToOneLine(oneLine, transformerId, ratio) {
  if (!oneLine || !transformerId || !Number.isFinite(Number(ratio)) || Number(ratio) <= 0) return null;
  const next = cloneData(oneLine);
  let changed = false;
  (Array.isArray(next.sheets) ? next.sheets : []).forEach(sheet => {
    (Array.isArray(sheet?.components) ? sheet.components : []).forEach(component => {
      if (component?.id !== transformerId || !isTransformer(component)) return;
      updateTransformerTapInClone(component, formatRatio(Number(ratio)));
      changed = true;
    });
  });
  return changed ? next : null;
}

function describeReason(reason) {
  const labels = {
    ltc_not_enabled: 'LTC is not enabled.',
    missing_tap_range: 'A complete permitted tap range is required.',
    missing_tap_step: 'A positive tap step is required.',
    invalid_voltage_limits: 'The configured voltage limits are invalid.',
    controlled_bus_not_found: 'The configured controlled bus could not be resolved.',
    not_transformer: 'Component is not a transformer.'
  };
  return labels[reason] || 'Tap constraints are incomplete.';
}

export async function evaluateTransformerTapOptimization(oneLine, {
  baseMVA = 100,
  balanced = true,
  maxIterations = 20,
  minVoltagePu = null,
  maxVoltagePu = null,
  transformerId = null,
  runStudy
} = {}) {
  if (typeof runStudy !== 'function') throw new TypeError('runStudy must be a function');
  const { buildLoadFlowModel } = await import('./loadFlowModel.js');
  const model = buildLoadFlowModel(oneLine || {});
  const modeledBusIds = new Set((model?.buses || []).map(bus => bus?.id).filter(Boolean));
  const transformers = flattenComponents(oneLine).filter(component => isTransformer(component));
  const selected = transformerId ? transformers.filter(component => component.id === transformerId) : transformers;
  const studyOptions = { baseMVA, balanced, maxIterations };
  const records = [];

  for (const transformer of selected) {
    const constraints = normalizeTransformerTapConstraints(transformer, { minVoltagePu, maxVoltagePu });
    const label = firstNonEmpty([transformer.label, transformer.ref, transformer.name, transformer.id]) || transformer.id;
    const branch = resolveTransformerBranch(model, transformer.id);
    const secondaryConnection = (transformer.connections || [])
      .find(connection => Number(connection?.sourcePort) === 1)
      || (transformer.connections || [])[1];
    const controlledBusId = constraints.controlledBusId || branch?.to || secondaryConnection?.target || null;
    if (!constraints.eligible) {
      records.push({
        transformerId: transformer.id,
        label,
        eligible: false,
        reason: constraints.reason,
        reasonText: describeReason(constraints.reason),
        controlledBusId,
        currentTapRatio: resolveCurrentTapRatio(transformer)
      });
      continue;
    }

    if (!controlledBusId || !modeledBusIds.has(controlledBusId)) {
      records.push({
        ...constraints,
        transformerId: transformer.id,
        label,
        eligible: false,
        reason: 'controlled_bus_not_found',
        reasonText: describeReason('controlled_bus_not_found'),
        controlledBusId,
        currentTapRatio: constraints.currentTapRatio
      });
      continue;
    }

    const permittedRatios = buildPermittedTapRatios(constraints);
    if (!permittedRatios.length) {
      records.push({
        transformerId: transformer.id,
        label,
        eligible: false,
        reason: 'tap_range_has_no_permitted_steps',
        reasonText: 'The configured range contains no permitted tap steps.',
        ...constraints,
        controlledBusId
      });
      continue;
    }

    const currentTapRatio = constraints.currentTapRatio;
    const currentSnapshot = applyTapRatioToOneLine(oneLine, transformer.id, currentTapRatio) || cloneData(oneLine);
    const currentResult = await runStudy(currentSnapshot, studyOptions);
    const currentSummary = summarizeStudyResult(
      currentResult,
      controlledBusId,
      constraints.setpointPu,
      constraints.minVoltagePu,
      constraints.maxVoltagePu
    );
    const currentCase = {
      tapRatio: currentTapRatio,
      tapPercent: (currentTapRatio - 1) * 100,
      isCurrent: true,
      permitted: permittedRatios.some(ratio => Math.abs(ratio - currentTapRatio) <= EPSILON),
      ...currentSummary
    };
    const cases = [currentCase];
    for (const tapRatio of permittedRatios) {
      if (Math.abs(tapRatio - currentTapRatio) <= EPSILON) continue;
      const snapshot = applyTapRatioToOneLine(oneLine, transformer.id, tapRatio);
      const result = await runStudy(snapshot, studyOptions);
      const summary = summarizeStudyResult(
        result,
        controlledBusId,
        constraints.setpointPu,
        constraints.minVoltagePu,
        constraints.maxVoltagePu,
        currentSummary.targetVoltagePu
      );
      cases.push({
        tapRatio,
        tapPercent: (tapRatio - 1) * 100,
        isCurrent: false,
        permitted: true,
        ...summary
      });
    }
    const feasibleCandidates = cases.filter(candidate => candidate.permitted && candidate.feasible);
    const recommended = feasibleCandidates.sort((a, b) => compareCases(a, b, currentTapRatio))[0] || null;
    records.push({
      transformerId: transformer.id,
      label,
      eligible: true,
      ...constraints,
      controlledBusId,
      currentTapRatio,
      currentTargetVoltagePu: currentSummary.targetVoltagePu,
      recommendedTapRatio: recommended?.tapRatio ?? null,
      recommendationReason: recommended?.isCurrent
        ? 'The current permitted tap already meets the voltage limits and is closest to the LTC setpoint.'
        : recommended
          ? 'Best permitted step meeting the voltage limits and closest to the LTC setpoint.'
        : 'No permitted tap step produced a converged result within the voltage limits.',
      permittedRatios,
      cases,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    balanced,
    studyOptions,
    voltageLimits: {
      minPu: firstFinite([minVoltagePu]) ?? DEFAULT_MIN_VOLTAGE_PU,
      maxPu: firstFinite([maxVoltagePu]) ?? DEFAULT_MAX_VOLTAGE_PU,
      source: Number.isFinite(firstFinite([minVoltagePu])) || Number.isFinite(firstFinite([maxVoltagePu]))
        ? 'workflow_override'
        : 'default_when_transformer_unset'
    },
    transformers: records
  };
}
