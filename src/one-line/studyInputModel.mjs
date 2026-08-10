export function isMotorStudyComponentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = `${meta.type || ''}`.trim().toLowerCase();
  const subtype = `${meta.subtype || ''}`.trim().toLowerCase();
  return ['motor_load', 'motor', 'motor_controller', 'motor_starter'].includes(type)
    || ['motor_load', 'motor', 'vfd', 'soft_starter'].includes(subtype)
    || subtype.includes('starter');
}

export function isTransformerStudyComponentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = `${meta.type || ''}`.trim().toLowerCase();
  const subtype = `${meta.subtype || ''}`.trim().toLowerCase();
  return type === 'transformer' || subtype.includes('transformer') || subtype.includes('xfmr');
}

export function isArcFlashStudyComponentMeta(meta, { isDiagramAssetComponentMeta = () => true } = {}) {
  if (!isDiagramAssetComponentMeta(meta)) return false;
  const type = `${meta?.type || ''}`.trim().toLowerCase();
  const subtype = `${meta?.subtype || ''}`.trim().toLowerCase();
  return !['cable', 'busway'].includes(type) && !['cable', 'busway'].includes(subtype);
}

export function isHarmonicStudyComponentMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = `${meta.type || ''}`.trim().toLowerCase();
  const subtype = `${meta.subtype || ''}`.trim().toLowerCase();
  return ['pv_inverter', 'bess_inverter', 'rectifier', 'ups', 'static_load'].includes(type)
    || type === 'motor_controller'
    || subtype === 'vfd'
    || subtype === 'soft_starter'
    || subtype.includes('inverter')
    || subtype.includes('rectifier')
    || subtype.includes('ups');
}

export function isDefaultHarmonicSourceMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const type = `${meta.type || ''}`.trim().toLowerCase();
  const subtype = `${meta.subtype || ''}`.trim().toLowerCase();
  return ['pv_inverter', 'bess_inverter', 'rectifier', 'ups'].includes(type)
    || subtype === 'vfd'
    || subtype.includes('vfd')
    || subtype.includes('inverter')
    || subtype.includes('rectifier')
    || subtype.includes('ups');
}

export function createStudyInputFieldSpecs({
  getHarmonicProfileOptions,
  getDefaultHarmonicProfileId,
  getDefaultHarmonicSpectrum
} = {}) {
  return {
    common: [
      { name: 'mtbf', label: 'MTBF (hr)', type: 'number', required: false, defaultValue: '' },
      { name: 'mttr', label: 'MTTR (hr)', type: 'number', required: false, defaultValue: '' }
    ],
    arcFlash: [
      { name: 'clearing_time', label: 'Clearing Time (s)', type: 'number', required: false, defaultValue: '' },
      {
        name: 'enclosure', label: 'Arc Flash Enclosure', type: 'select', required: false, defaultValue: 'box',
        options: [
          { value: 'box', label: 'Box / enclosed' }, { value: 'open', label: 'Open air' },
          { value: 'NEMA 1', label: 'NEMA 1' }, { value: 'NEMA 3R', label: 'NEMA 3R' },
          { value: 'NEMA 4', label: 'NEMA 4' }, { value: 'NEMA 4X', label: 'NEMA 4X' }
        ]
      },
      { name: 'gap', label: 'Electrode Gap (mm)', type: 'number', required: false, defaultValue: '' },
      { name: 'working_distance', label: 'Working Distance (mm)', type: 'number', required: false, defaultValue: '' },
      { name: 'enclosure_height', label: 'Enclosure Height (mm)', type: 'number', required: false, defaultValue: '' },
      { name: 'enclosure_width', label: 'Enclosure Width (mm)', type: 'number', required: false, defaultValue: '' },
      { name: 'enclosure_depth', label: 'Enclosure Depth (mm)', type: 'number', required: false, defaultValue: '' },
      {
        name: 'electrode_config', label: 'Electrode Configuration', type: 'select', required: false,
        defaultValue: 'VCB', options: ['VCB', 'VCBB', 'HCB', 'VOA', 'HOA']
      }
    ],
    transformerTcc: [
      { name: 'inrush_multiple', label: 'Transformer Inrush Multiple (x FLA)', type: 'number', required: false, defaultValue: 12 },
      { name: 'inrush_duration', label: 'Transformer Inrush Duration (s)', type: 'number', required: false, defaultValue: 0.1 }
    ],
    harmonic: [
      { name: 'harmonicSource', label: 'Harmonic Source', type: 'checkbox', required: false, defaultValue: (component, meta) => isDefaultHarmonicSourceMeta(meta || component) },
      { name: 'harmonicProfileId', label: 'Harmonic Profile', type: 'select', required: false, defaultValue: (component, meta) => getDefaultHarmonicProfileId(meta || component), options: () => getHarmonicProfileOptions() },
      { name: 'harmonics', label: 'Harmonic Spectrum (order:pct)', type: 'text', required: false, defaultValue: (component, meta) => getDefaultHarmonicSpectrum(meta || component), placeholder: '5:35 7:25 11:12 13:8' },
      { name: 'scMVA', label: 'Short-Circuit Strength at Bus (MVA)', type: 'number', required: false, defaultValue: '' },
      { name: 'harmonicsA', label: 'Phase A Harmonics (order:pct)', type: 'text', required: false, defaultValue: '' },
      { name: 'harmonicsB', label: 'Phase B Harmonics (order:pct)', type: 'text', required: false, defaultValue: '' },
      { name: 'harmonicsC', label: 'Phase C Harmonics (order:pct)', type: 'text', required: false, defaultValue: '' }
    ],
    motor: [
      { name: 'full_load_amps', label: 'Full-Load Amps (A)', type: 'number', required: false, defaultValue: component => component.rated_current_a || component.rated_current || '' },
      { name: 'pf', label: 'Power Factor', type: 'number', required: false, defaultValue: 0.88 },
      { name: 'efficiency', label: 'Efficiency (%)', type: 'number', required: false, defaultValue: 95 },
      { name: 'lr_current_pu', label: 'Locked-Rotor Current (x FLA)', type: 'number', required: false, defaultValue: 6 },
      { name: 'inrushMultiple', label: 'Inrush Multiple (x FLA)', type: 'number', required: false, defaultValue: 6 },
      { name: 'thevenin_r', label: 'Thevenin R (ohm)', type: 'number', required: false, defaultValue: '' },
      { name: 'thevenin_x', label: 'Thevenin X (ohm)', type: 'number', required: false, defaultValue: '' },
      { name: 'inertia', label: 'Inertia (kg*m^2)', type: 'number', required: false, defaultValue: '' },
      { name: 'load_torque_curve', label: 'Load Torque Curve (speed%:torque%)', type: 'textarea', required: false, rows: 3, defaultValue: '0:0 100:100' },
      { name: 'start_time_s', label: 'Start Time (s)', type: 'number', required: false, defaultValue: '' },
      { name: 'stall_time', label: 'Stall Time (s)', type: 'number', required: false, defaultValue: '' },
      { name: 'synchronous_speed_rpm', label: 'Synchronous Speed (rpm)', type: 'number', required: false, defaultValue: '' },
      { name: 'current_limit_pu', label: 'Current Limit (x FLA)', type: 'number', required: false, defaultValue: '' },
      { name: 'vfd_current_limit_pu', label: 'VFD Current Limit (x FLA)', type: 'number', required: false, defaultValue: '' },
      { name: 'initial_voltage_pu', label: 'Initial Voltage (pu)', type: 'number', required: false, defaultValue: '' },
      { name: 'ramp_time_s', label: 'Ramp Time (s)', type: 'number', required: false, defaultValue: '' }
    ]
  };
}

export function resolveStudyInputFieldSpecs(meta, fieldSpecs, {
  isDiagramAssetComponentMeta = () => true
} = {}) {
  if (!isDiagramAssetComponentMeta(meta)) return [];
  const specs = [...fieldSpecs.common];
  if (isArcFlashStudyComponentMeta(meta, { isDiagramAssetComponentMeta })) specs.push(...fieldSpecs.arcFlash);
  if (isTransformerStudyComponentMeta(meta)) specs.push(...fieldSpecs.transformerTcc);
  if (isHarmonicStudyComponentMeta(meta)) specs.push(...fieldSpecs.harmonic);
  if (isMotorStudyComponentMeta(meta)) specs.push(...fieldSpecs.motor);
  return specs;
}
