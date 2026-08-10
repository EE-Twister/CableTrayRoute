import {
  getComponentValue,
  parseConductorsDescriptor,
  parseNumeric,
  parsePhases
} from './equipmentOverlayModel.mjs';
import {
  formatDetailValue,
  formatOptionLabel,
  formatSettingLabel,
  formatSettingValue
} from './settingModel.mjs';

const COMPONENT_DETAIL_FIELDS = [
  { label: 'Manufacturer', keys: ['manufacturer', 'vendor'] },
  { label: 'Model', keys: ['model', 'catalog_number', 'catalogNumber'] },
  {
    label: 'Amp Rating',
    keys: ['amp_rating', 'ampRating', 'ampacity', 'rating'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} A`;
      const str = formatDetailValue(value);
      return str ? `${str} A` : '';
    }
  },
  { label: 'Frame Size', keys: ['frame', 'frame_size', 'breaker_frame', 'breakerFrame'] },
  {
    label: 'Sensor Rating',
    keys: ['sensor_rating', 'sensorRating'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} A`;
      const str = formatDetailValue(value);
      return str ? `${str} A` : '';
    }
  },
  { label: 'Trip Unit', keys: ['trip_unit', 'tripUnit'] },
  {
    label: 'Interrupt Rating',
    keys: ['interrupt_rating', 'interruptRating', 'ic_rating', 'icRating', 'short_circuit_rating', 'shortCircuitRating'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} kA`;
      const str = formatDetailValue(value);
      return str || '';
    }
  },
  {
    label: 'Full-Load Amps',
    keys: ['full_load_amps', 'fullLoadAmps', 'fla'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} A`;
      const str = formatDetailValue(value);
      return str ? `${str} A` : '';
    }
  },
  {
    label: 'Voltage',
    keys: ['voltage', 'volts', 'kv', 'kV', 'prefault_voltage', 'baseKV'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} V`;
      const str = formatDetailValue(value);
      if (!str) return '';
      if (/\bkv\b/i.test(str)) return str;
      return `${str} V`;
    }
  },
  {
    label: 'Phases',
    keys: ['phases'],
    format: value => {
      const phases = parsePhases(value);
      if (phases.length) return phases.join(', ');
      return formatDetailValue(value);
    }
  }
];

const COMPONENT_SKIP_KEYS = new Set([
  'id', 'name', 'label', 'type', 'subtype', 'connections', 'tccid', 'tcc_id',
  'tccoverrides', 'props', 'x', 'y', 'cx', 'cy', 'fx', 'fy', 'px', 'py',
  'width', 'height', 'rotation', 'angle', 'sheet', 'sheetname', 'componentid',
  'component_id', 'notes', 'description', 'manufacturer', 'vendor', 'maker',
  'brand', 'model', 'amp_rating', 'amprating', 'ampacity', 'rating', 'frame',
  'frame_size', 'breaker_frame', 'framesize', 'sensor_rating', 'sensorrating',
  'trip_unit', 'tripunit', 'interrupt_rating', 'interruptrating', 'ic_rating',
  'icrating', 'short_circuit_rating', 'shortcircuitrating', 'full_load_amps',
  'fullloadamps', 'fla', 'voltage', 'volts', 'kv', 'prefault_voltage', 'basekv',
  'phases'
]);

export function describeComponentDetailRows(entry, usedLabels = new Set()) {
  const component = entry?.component;
  if (!component) return [];
  const rows = [];
  const used = usedLabels instanceof Set ? usedLabels : new Set();
  const normalizedSkip = new Set([...COMPONENT_SKIP_KEYS]);
  const maxRows = 20;

  const cableSources = [];
  if (component && typeof component === 'object') cableSources.push(component);
  if (component.cable && typeof component.cable === 'object') cableSources.push(component.cable);
  if (component.props && typeof component.props === 'object' && typeof component.props.cable === 'object') {
    cableSources.push(component.props.cable);
  }

  const pickValue = (keys, { sources = cableSources } = {}) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const key of list) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          const value = source[key];
          if (value !== undefined && value !== null && value !== '') return value;
        }
        if (source.props && typeof source.props === 'object' && Object.prototype.hasOwnProperty.call(source.props, key)) {
          const value = source.props[key];
          if (value !== undefined && value !== null && value !== '') return value;
        }
      }
    }
    return null;
  };

  const pushRow = (label, value) => {
    const formatted = typeof value === 'string' ? value : formatDetailValue(value);
    if (!formatted) return;
    const key = label.toLowerCase();
    if (used.has(key)) return;
    rows.push({ label, value: formatted, range: '' });
    used.add(key);
  };

  const addField = ({ label, keys, format }) => {
    if (rows.length >= maxRows) return;
    for (const key of keys) {
      const raw = getComponentValue(component, key);
      if (raw === undefined || raw === null || raw === '') continue;
      const value = typeof format === 'function'
        ? format(raw, { key, component })
        : formatDetailValue(raw);
      if (!value) continue;
      pushRow(label, value);
      keys.forEach(candidate => normalizedSkip.add(String(candidate).toLowerCase()));
      return;
    }
  };

  COMPONENT_DETAIL_FIELDS.forEach(addField);

  const componentType = String(component.type || component.subtype || '').toLowerCase();
  if (componentType.includes('cable')) {
    const sizeValue = pickValue(['conductor_size', 'conductorSize', 'size_awg_kcmil', 'conductor_size_awg_kcmil', 'size', 'awg']);
    const conductorsDescriptor = pickValue(['conductors']);
    const materialValue = pickValue(['conductor_material', 'material']);
    const insulationRaw = pickValue(['insulation_rating', 'temperature_rating', 'temp_rating_c', 'insulation_temp_c', 'insulation']);
    const resolvedSize = (() => {
      if (sizeValue) return formatDetailValue(sizeValue);
      if (conductorsDescriptor) {
        const parsed = parseConductorsDescriptor(conductorsDescriptor);
        if (parsed?.size) return formatDetailValue(parsed.size);
      }
      return '';
    })();

    if (resolvedSize) {
      pushRow('Conductor Size', resolvedSize);
      ['conductor_size', 'conductorsize', 'size_awg_kcmil', 'conductor_size_awg_kcmil', 'size', 'awg', 'conductors']
        .forEach(key => normalizedSkip.add(key));
    }
    if (materialValue) {
      pushRow('Conductor Material', formatOptionLabel(materialValue));
      ['conductor_material', 'conductormaterial', 'material'].forEach(key => normalizedSkip.add(key));
    }
    if (insulationRaw !== null && insulationRaw !== undefined && insulationRaw !== '') {
      const numeric = parseNumeric(insulationRaw);
      const formatted = Number.isFinite(numeric) && numeric > 0
        ? `${formatSettingValue(numeric)} °C`
        : formatDetailValue(insulationRaw);
      pushRow('Insulation Rating', formatted);
      ['insulation_rating', 'insulationrating', 'temperature_rating', 'temperaturerating', 'temp_rating_c', 'insulation_temp_c', 'insulation']
        .forEach(key => normalizedSkip.add(key));
    }
  }

  const appendSimpleProps = source => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([key, raw]) => {
      if (rows.length >= maxRows) return;
      if (raw === undefined || raw === null || raw === '') return;
      const normalizedKey = String(key).toLowerCase();
      if (normalizedSkip.has(normalizedKey)) return;
      if (typeof raw === 'object' && !Array.isArray(raw)) return;
      const value = formatDetailValue(raw);
      if (!value) return;
      pushRow(formatSettingLabel(key), value);
      normalizedSkip.add(normalizedKey);
    });
  };

  appendSimpleProps(component);
  if (component.props && typeof component.props === 'object') appendSimpleProps(component.props);

  return rows;
}
