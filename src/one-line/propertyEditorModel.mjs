const RESERVED_TOP_LEVEL_FIELD_NAMES = new Set([
  'id', 'type', 'subtype', 'x', 'y', 'width', 'height', 'rotation', 'rotationManual', 'flipped', 'label',
  'ports', 'connections', 'meta', 'svg', 'icon', 'scheduleLinks', 'props'
]);

const ACRONYM_LABELS = new Map([
  ['a', 'A'], ['ac', 'AC'], ['dc', 'DC'], ['fla', 'FLA'], ['hp', 'HP'], ['id', 'ID'],
  ['ka', 'kA'], ['kv', 'kV'], ['kva', 'kVA'], ['kvar', 'kVAR'], ['kw', 'kW'], ['mva', 'MVA'],
  ['mw', 'MW'], ['pf', 'PF'], ['pt', 'PT'], ['pu', 'pu'], ['tcc', 'TCC'], ['ups', 'UPS'],
  ['v', 'V'], ['vt', 'VT'], ['xr', 'X/R']
]);

function createGeneralLabelOverrides(getHarmonicProfileOptions) {
  const harmonicProfileField = {
    label: 'Harmonic Profile',
    type: 'select',
    options: () => getHarmonicProfileOptions(),
    help: 'Select a library profile or save the current spectrum as a custom profile.'
  };
  return {
    hp: 'Horsepower',
    pf: 'Power Factor',
    service_factor: 'Service Factor',
    full_load_amps: 'Full-Load Amps (A)',
    rated_current: 'Rated Current (A)',
    rated_current_a: 'Rated Current (A)',
    lr_current_pu: 'Locked-Rotor Current (x FLA)',
    current_limit_pu: 'Current Limit (x FLA)',
    vfd_current_limit_pu: 'VFD Current Limit (x FLA)',
    initial_voltage_pu: 'Initial Voltage (pu)',
    ramp_time_s: 'Ramp Time (s)',
    start_time_s: 'Start Time (s)',
    stall_time: 'Stall Time (s)',
    synchronous_speed_rpm: 'Synchronous Speed (rpm)',
    inrushMultiple: 'Inrush Multiple (× FLA)',
    thevenin_r: 'Thevenin R (Ω)',
    thevenin_x: 'Thevenin X (Ω)',
    inertia: 'Inertia (kg·m²)',
    load_torque_curve: 'Load Torque Curve (speed%:torque%)',
    mtbf: 'MTBF (hr)',
    mttr: 'MTTR (hr)',
    clearing_time: 'Clearing Time (s)',
    gap: 'Electrode Gap (mm)',
    working_distance: 'Working Distance (mm)',
    enclosure_height: 'Enclosure Height (mm)',
    enclosure_width: 'Enclosure Width (mm)',
    enclosure_depth: 'Enclosure Depth (mm)',
    inrush_multiple: 'Transformer Inrush Multiple (x FLA)',
    inrush_duration: 'Transformer Inrush Duration (s)',
    harmonicSource: 'Harmonic Source',
    harmonicProfileId: harmonicProfileField,
    harmonic_profile_id: harmonicProfileField,
    harmonics: {
      label: 'Harmonic Spectrum (order:pct)',
      placeholder: '5:35 7:25 11:12 13:8',
      help: 'Populated by the harmonic profile library; custom spectra use order:pct pairs separated by spaces or commas.'
    },
    harmonicsA: 'Phase A Harmonics (order:pct)',
    harmonicsB: 'Phase B Harmonics (order:pct)',
    harmonicsC: 'Phase C Harmonics (order:pct)',
    scMVA: 'Short-Circuit Strength at Bus (MVA)',
    electrode_config: { label: 'Electrode Configuration', type: 'select', options: ['VCB', 'VCBB', 'HCB', 'VOA', 'HOA'] },
    primary_connection: 'Primary Connection',
    secondary_connection: 'Secondary Connection',
    tertiary_connection: 'Tertiary Connection',
    source_voltage_base: { label: 'Source Voltage (kV)', help: 'Defines system base voltage. Reference point of system.' },
    short_circuit_capacity: { label: 'Short Circuit Capacity (MVA or kA)', help: 'Defines source strength. Used for fault calc.' },
    source_impedance: {
      label: 'Source Impedance (R + jX)',
      help: 'Sets Thevenin equivalent. Core short circuit input.',
      placeholder: '0.01 + j0.08'
    },
    sequence_impedances: {
      label: 'Sequence Impedances (Z1,Z2,Z0)',
      help: 'For asymmetrical faults. Required for detailed calc.',
      placeholder: 'Z1=, Z2=, Z0='
    },
    frequency_hz: { label: 'Frequency (Hz)', help: 'System operating frequency. Usually 50 or 60 Hz.' },
    grounding: { label: 'Grounding Type (solid, resistive)', help: 'Defines earth fault characteristics. Important for grounding model.' },
    voltage_regulation_percent: { label: 'Voltage Regulation (%)', help: 'Defines source voltage control range. Used for load flow.' },
    phase_angle: { label: 'Phase Angle', help: 'Reference for system phase. Used for synchronization.' },
    max_mw_delivery: { label: 'Max MW Delivery', help: 'For power flow limit modeling. Defines source constraint.' },
    losses_r_percent: { label: 'Losses (R%)', help: 'For performance modeling. Used for efficiency calc.' },
    stability_response: { label: 'Stability Response', help: 'Used in dynamic studies. Defines voltage recovery.' },
    transformer_impedance: { label: 'Transformer Impedance (if substation integrated)', help: 'Defines interface strength. For network modeling.' },
    operating_mode: { label: 'Operating Mode (infinite bus, finite grid)', help: 'Determines model behavior. Impacts fault current.' },
    short_circuit_duration_cycles: { label: 'Short Circuit Duration (cycles)', help: 'For thermal withstand calc. Time-dependent modeling.' },
    ratio_primary: 'CT Ratio Primary (A)',
    ratio_secondary: 'CT Ratio Secondary (A)',
    accuracy_class: 'CT Accuracy Class',
    burden_va: 'CT Burden (VA)',
    knee_point_v: 'CT Knee-Point Voltage (V)',
    polarity: { label: 'CT Polarity', type: 'select', options: ['H1-X1', 'H1-X2'] },
    location_context: { label: 'CT Context', type: 'select', options: ['protection', 'metering'] },
    protected_device_id: 'Protected Device ID',
    meter_id: 'Linked Meter ID',
    relay_id: 'Linked Relay ID',
    primary_voltage: 'PT/VT Primary Voltage (V)',
    secondary_voltage: 'PT/VT Secondary Voltage (V)',
    connection_type: { label: 'PT/VT Connection Type', type: 'select', options: ['wye-grounded', 'wye-ungrounded', 'delta', 'open-delta'] },
    fuse_protection: { label: 'PT/VT Fuse Protection', type: 'select', options: ['yes', 'no'] },
    consumer_ids: 'Linked Consumer IDs'
  };
}

export function parsePropertyNumber(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim();
  if (!text) return null;
  const match = text.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

export function readPropertyValue(component, name) {
  if (!component || !name) return null;
  if (Object.prototype.hasOwnProperty.call(component, name)) {
    const direct = component[name];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
  }
  if (component.props && Object.prototype.hasOwnProperty.call(component.props, name)) {
    const propertyValue = component.props[name];
    if (propertyValue !== undefined && propertyValue !== null && propertyValue !== '') return propertyValue;
  }
  return null;
}

export function formatPropertyNumber(value, decimals = 3) {
  if (!Number.isFinite(value)) return '';
  const factor = 10 ** decimals;
  let text = (Math.round(value * factor) / factor).toFixed(decimals);
  text = text.replace(/\.0+$/, '');
  return text.replace(/(\.[0-9]*[1-9])0+$/, '$1');
}

export function formatPropertyFieldLabel(label, fieldName = '') {
  const raw = String(label || fieldName || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  const formatToken = token => token.replace(/[A-Za-z0-9/]+/g, match => {
    const mapped = ACRONYM_LABELS.get(match.toLowerCase());
    if (mapped) return mapped;
    if (match.length <= 1 && match === match.toUpperCase()) return match;
    return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
  });
  return raw.split(' ').map(formatToken).join(' ')
    .replace(/\bVoltage Volts\b/g, 'Voltage (V)')
    .replace(/\bDC V\b/g, 'DC Voltage')
    .replace(/\bPct\b/g, '(%)')
    .replace(/\bRuntime Min\b/g, 'Runtime (min)')
    .replace(/\bDuration S\b/g, 'Duration (s)')
    .replace(/\bTime S\b/g, 'Time (s)');
}

export function applyPropertyFieldFromForm(target, field, formData) {
  if (RESERVED_TOP_LEVEL_FIELD_NAMES.has(field.name) && typeof field.setValue !== 'function') return;
  const hasPropKey = !!(
    target?.props
    && typeof target.props === 'object'
    && Object.prototype.hasOwnProperty.call(target.props, field.name)
  );
  if (field.type === 'checkbox') {
    const checked = formData.get(field.name) === 'on';
    if (typeof field.setValue === 'function') field.setValue(target, checked);
    else target[field.name] = checked;
    if (hasPropKey) target.props[field.name] = checked;
    return;
  }
  const raw = formData.get(field.name);
  const value = raw === null ? '' : raw;
  if (typeof field.setValue === 'function') {
    field.setValue(target, value);
    if (hasPropKey) target.props[field.name] = field.type === 'number' && value ? parseFloat(value) : value || '';
    return;
  }
  const normalizedValue = field.type === 'number' ? (value ? parseFloat(value) : '') : value || '';
  target[field.name] = normalizedValue;
  if (hasPropKey) target.props[field.name] = normalizedValue;
}

export function normalizePropertySchema({
  rawSchema,
  targetComponent,
  isMotorStudyComponent,
  isConductorSegment,
  voltageClasses,
  thermalRatings,
  manufacturerOptions,
  getManufacturerModels,
  transformerConnectionOptions,
  cablePropertyMetadata,
  getHarmonicProfileOptions
}) {
  const overrides = createGeneralLabelOverrides(getHarmonicProfileOptions);
  let schema = rawSchema.map(field => {
    if (field.name === 'voltage_class') return { ...field, type: 'select', options: voltageClasses };
    if (field.name === 'thermal_rating') return { ...field, type: 'select', options: thermalRatings };
    if (field.name === 'manufacturer') return { ...field, type: 'select', options: manufacturerOptions };
    if (field.name === 'model') {
      const manufacturer = targetComponent.manufacturer || manufacturerOptions[0];
      return { ...field, type: 'select', options: getManufacturerModels(manufacturer) };
    }
    if (
      targetComponent.type === 'transformer'
      && ['primary_connection', 'secondary_connection', 'tertiary_connection'].includes(field.name)
    ) {
      return { ...field, type: 'select', options: transformerConnectionOptions };
    }
    if (isMotorStudyComponent && field.name === 'load_torque_curve') {
      return {
        ...field,
        type: 'textarea',
        rows: 3,
        placeholder: '0:0 50:40 100:100',
        help: 'Enter speed%:torque% pairs separated by spaces or commas.'
      };
    }
    return { ...field };
  });

  schema = schema.map(field => {
    const next = { ...field };
    if (next.name.startsWith('cable_')) {
      const metadata = cablePropertyMetadata[next.name.replace(/^cable_/, '')];
      if (metadata?.label) next.label = metadata.label;
      if (metadata?.type) next.type = metadata.type;
      if (metadata?.help) next.help = metadata.help;
    } else if (overrides[next.name]) {
      const override = overrides[next.name];
      if (typeof override === 'string') {
        next.label = override;
      } else {
        if (override.label) next.label = override.label;
        if (override.type) next.type = override.type;
        if (override.options) next.options = override.options;
        if (override.placeholder) next.placeholder = override.placeholder;
        if (override.help) next.help = override.help;
      }
    }
    return next;
  });

  if (isConductorSegment) {
    schema = schema.filter(field => !['cable_cable_rating', 'cable_impedance_r', 'cable_impedance_x'].includes(field.name));
  }
  if (isMotorStudyComponent) {
    schema = schema.filter(field => !['conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly'].includes(field.name));
  }
  return schema;
}
