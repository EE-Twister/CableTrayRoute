import { fingerprintStudySource } from './studyResultReadiness.mjs';

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function propsOf(component = {}) {
  return { ...component, ...(component.parameters || {}), ...(component.props || {}) };
}

function labelOf(component) {
  const props = propsOf(component);
  return props.tag || props.ref || props.name || props.label || component.id || 'Generator';
}

export function buildTransientStabilityProjectInputs(oneLine = {}, studies = {}) {
  const sourceStudies = { shortCircuit: studies.shortCircuit || null };
  const components = (Array.isArray(oneLine.sheets) ? oneLine.sheets : [])
    .flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
  const generators = components.filter(component => {
    const kind = `${component.type || ''} ${component.subtype || ''}`.toLowerCase();
    return kind.includes('generator') || kind.includes('genset');
  });
  const generator = generators.find(component => {
    const kind = `${component.type || ''} ${component.subtype || ''}`.toLowerCase();
    return kind.includes('synchronous') || kind.includes('sync');
  }) || generators[0];
  if (!generator) {
    return {
      inputs: null,
      ready: false,
      warnings: ['No synchronous generator was found on the project One-Line.'],
      sourceFingerprint: fingerprintStudySource({ oneLine, studies: sourceStudies }),
    };
  }
  const props = propsOf(generator);
  const pmaxMw = finite(
    props.max_mw,
    props.max_kw != null ? Number(props.max_kw) / 1000 : null,
    props.kw != null ? Number(props.kw) / 1000 : null
  );
  const operatingMw = finite(
    props.operating_mw,
    props.pg_mw,
    props.kw != null ? Number(props.kw) / 1000 : null
  );
  const baseMva = finite(props.rated_mva, props.kva != null ? Number(props.kva) / 1000 : null);
  const pm = pmaxMw > 0 && operatingMw > 0 ? Math.min(0.95, operatingMw / pmaxMw) : null;
  const shortCircuit = studies.shortCircuit || {};
  const clearingSeconds = finite(
    shortCircuit.clearingTimeSeconds,
    shortCircuit.summary?.clearingTimeSeconds,
    shortCircuit.inputs?.clearingTimeSeconds
  );
  const inputs = {
    H: finite(props.h_constant_s, props.inertia_constant_s, props.inertia),
    f: finite(props.frequency_hz, props.frequency, 60) || 60,
    Pm: pm,
    Pmax_pre: 1,
    Pmax_fault: null,
    Pmax_post: null,
    t_clear: clearingSeconds,
    t_end: 2,
    generatorLabel: labelOf(generator),
    baseMva,
  };
  const warnings = [
    'During-fault and post-fault transfer limits are network-reduction inputs and are not inferred from equipment nameplate data.',
  ];
  if (!Number.isFinite(inputs.H)) warnings.push('Generator inertia constant H is missing.');
  if (!Number.isFinite(inputs.Pm)) warnings.push('Generator operating power could not be normalized to its maximum output.');
  if (!Number.isFinite(inputs.t_clear)) warnings.push('No clearing time was found in the saved Short Circuit result.');

  return {
    inputs,
    ready: false,
    warnings,
    sourceFingerprint: fingerprintStudySource({ oneLine, studies: sourceStudies }),
  };
}
