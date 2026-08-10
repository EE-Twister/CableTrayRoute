export const MANUAL_HARMONIC_PROFILE_ID = 'custom';

export const BUILT_IN_HARMONIC_PROFILES = Object.freeze([
  {
    id: 'six_pulse_vfd',
    label: '6-pulse VFD / rectifier',
    spectrum: '5:35 7:25 11:12 13:8',
    description: 'Typical untreated six-pulse input current profile.'
  },
  {
    id: 'six_pulse_line_reactor',
    label: '6-pulse VFD with line reactor',
    spectrum: '5:20 7:14 11:9 13:7',
    description: 'Reduced characteristic harmonics for a six-pulse drive with input impedance.'
  },
  {
    id: 'twelve_pulse_drive',
    label: '12-pulse drive / rectifier',
    spectrum: '11:12 13:10 23:5 25:4',
    description: 'Dominant harmonics shifted to the 11th, 13th, 23rd, and 25th orders.'
  },
  {
    id: 'eighteen_pulse_drive',
    label: '18-pulse drive / rectifier',
    spectrum: '17:8 19:7 35:3 37:3',
    description: 'Dominant harmonics shifted higher for eighteen-pulse front ends.'
  },
  {
    id: 'active_front_end',
    label: 'Active front-end drive',
    spectrum: '5:4 7:3 11:2 13:1',
    description: 'Low-distortion active front-end or active filter corrected profile.'
  },
  {
    id: 'ups_inverter',
    label: 'UPS / inverter',
    spectrum: '5:3 7:2 11:1',
    description: 'Low-distortion inverter source profile.'
  },
  {
    id: MANUAL_HARMONIC_PROFILE_ID,
    label: 'Custom / manual spectrum',
    spectrum: '',
    description: 'Use the entered harmonic spectrum for this component.'
  }
]);

export function normalizeHarmonicProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const label = String(profile.label || profile.name || '').trim();
  const spectrum = String(profile.spectrum || '').trim();
  const id = String(profile.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '_'))
    .replace(/^_+|_+$/g, '');
  if (!id || !label) return null;
  return {
    id,
    label,
    spectrum,
    description: String(profile.description || '').trim(),
    custom: !!profile.custom
  };
}

export function mergeHarmonicProfiles(customProfiles = [], builtInProfiles = BUILT_IN_HARMONIC_PROFILES) {
  const builtIns = builtInProfiles
    .map(profile => normalizeHarmonicProfile({ ...profile, custom: false }))
    .filter(Boolean);
  const custom = (Array.isArray(customProfiles) ? customProfiles : [])
    .map(profile => normalizeHarmonicProfile({ ...profile, custom: true }))
    .filter(Boolean);
  const reservedIds = new Set(builtIns.map(profile => profile.id));
  return [
    ...builtIns.filter(profile => profile.id !== MANUAL_HARMONIC_PROFILE_ID),
    ...custom.filter(profile => !reservedIds.has(profile.id)),
    builtIns.find(profile => profile.id === MANUAL_HARMONIC_PROFILE_ID)
  ].filter(Boolean);
}

export function findHarmonicProfileById(profiles = [], id) {
  const normalizedId = String(id || '').trim();
  return profiles.find(profile => profile?.id === normalizedId) || null;
}

export function findHarmonicProfileBySpectrum(profiles = [], spectrum) {
  const normalizedSpectrum = String(spectrum || '').trim();
  if (!normalizedSpectrum) return null;
  return profiles
    .filter(profile => profile?.id !== MANUAL_HARMONIC_PROFILE_ID)
    .find(profile => profile?.spectrum === normalizedSpectrum) || null;
}

export function defaultHarmonicProfileId(componentMeta) {
  const type = `${componentMeta?.type || ''}`.trim().toLowerCase();
  const subtype = `${componentMeta?.subtype || ''}`.trim().toLowerCase();
  if (subtype === 'vfd' || subtype.includes('vfd') || type === 'rectifier' || subtype.includes('rectifier')) {
    return 'six_pulse_vfd';
  }
  if (subtype === 'soft_starter' || subtype.includes('soft_starter')) return MANUAL_HARMONIC_PROFILE_ID;
  if (type === 'ups' || subtype.includes('ups')) return 'ups_inverter';
  if (type.includes('inverter') || subtype.includes('inverter')) return 'ups_inverter';
  return MANUAL_HARMONIC_PROFILE_ID;
}

export function createCustomHarmonicProfile(label, spectrum) {
  const normalizedLabel = String(label || '').trim();
  const normalizedSpectrum = String(spectrum || '').trim();
  if (!normalizedLabel || !normalizedSpectrum) return null;
  const baseId = normalizedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    || 'custom_profile';
  return {
    id: `custom_${baseId}`,
    label: normalizedLabel,
    spectrum: normalizedSpectrum,
    description: 'Custom harmonic profile.',
    custom: true
  };
}

export function parseHarmonicSpectrumPoints(spectrum) {
  const valuesByOrder = new Map();
  if (!spectrum) return [];
  if (Array.isArray(spectrum)) {
    spectrum.forEach((value, index) => {
      const percent = Number(value);
      const order = index + 1;
      if (Number.isFinite(percent) && percent > 0 && order > 1) valuesByOrder.set(order, percent);
    });
  } else if (typeof spectrum === 'string') {
    spectrum.split(/[,\s]+/).forEach(part => {
      if (!part) return;
      const [orderPart, percentPart] = part.split(':');
      const order = Number(orderPart);
      const percent = Number(percentPart ?? orderPart);
      if (Number.isFinite(order) && Number.isFinite(percent) && order > 1 && percent >= 0) {
        valuesByOrder.set(order, percent);
      }
    });
  }
  return [...valuesByOrder.entries()]
    .map(([order, pct]) => ({ order, pct }))
    .sort((first, second) => first.order - second.order);
}

export function harmonicThdPercent(points) {
  if (!Array.isArray(points) || !points.length) return 0;
  const sumSquares = points.reduce((sum, point) => {
    const percent = Number(point?.pct);
    return Number.isFinite(percent) ? sum + percent * percent : sum;
  }, 0);
  return Math.sqrt(sumSquares);
}

export function formatHarmonicMetric(value, decimals = 1) {
  if (!Number.isFinite(value)) return '';
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toFixed(decimals)
    .replace(/\.0+$/, '')
    .replace(/(\.[0-9]*[1-9])0+$/, '$1');
}

export function estimateVoltageHarmonicPoints(currentPoints, { voltage, loadKw, scMVA } = {}) {
  if (
    !Array.isArray(currentPoints)
    || !currentPoints.length
    || !Number.isFinite(voltage)
    || voltage <= 0
    || !Number.isFinite(loadKw)
    || loadKw <= 0
    || !Number.isFinite(scMVA)
    || scMVA <= 0
  ) {
    return [];
  }
  const baseCurrent = loadKw * 1000 / (Math.sqrt(3) * voltage);
  const kilovolts = voltage / 1000;
  const baseAdmittance = scMVA / (kilovolts * kilovolts);
  if (!Number.isFinite(baseCurrent) || baseCurrent <= 0 || !Number.isFinite(baseAdmittance) || baseAdmittance <= 0) {
    return [];
  }
  return currentPoints.map(point => {
    const harmonicCurrent = baseCurrent * (point.pct / 100);
    const harmonicVoltage = harmonicCurrent / baseAdmittance;
    const percent = harmonicVoltage / voltage * 100;
    return {
      order: point.order,
      pct: Number.isFinite(percent) && percent > 0 ? percent : 0
    };
  });
}
