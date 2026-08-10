import { CUSTOM_CURVE_VENDOR_FALLBACK } from './customCurveModel.mjs';
import { describeComponentDetailRows } from './componentDetailModel.mjs';
import { getComponentVendor } from './equipmentOverlayModel.mjs';
import {
  describeSettingRange,
  formatOptionLabel,
  formatSettingLabel,
  formatSettingValue
} from './settingModel.mjs';

const OVERLAY_GROUP_LABELS = {
  inrush: 'Transformer Inrush',
  transformerDamage: 'Transformer Damage',
  cable: 'Cable Damage',
  motorStart: 'Motor Starting',
  motorThermal: 'Motor Thermal Limit'
};
const SYSTEM_OVERLAY_GROUP = 'System Curves';
const COMPONENT_FALLBACK_GROUP = 'One-Line Devices';
const LIBRARY_FALLBACK_GROUP = 'Library Devices';
const OTHER_MANUFACTURER_GROUP = 'Other Manufacturers';
const OVERLAY_GROUP_SET = new Set([...Object.values(OVERLAY_GROUP_LABELS), SYSTEM_OVERLAY_GROUP]);

const TYPE_LABEL_OVERRIDES = {
  'lv breaker': 'LV Breaker',
  'mv breaker': 'MV Breaker',
  'hv breaker': 'HV Breaker',
  'custom curve': 'Custom Curves',
  ats: 'ATS',
  ups: 'UPS'
};

const TYPE_PRIORITY = new Map([
  ['lv breaker', -6], ['mv breaker', -5], ['breaker', -4], ['fuse', -3],
  ['relay', -2], ['recloser', -1], ['custom curve', -0.5], ['contactor', 0],
  ['switch', 1], ['transformer', 2], ['motor', 3], ['cable', 4],
  ['system', 5], ['other', 6]
]);

function manufacturerPriority(name) {
  if (name === COMPONENT_FALLBACK_GROUP) return -2;
  if (name === LIBRARY_FALLBACK_GROUP) return -1;
  if (name === OTHER_MANUFACTURER_GROUP) return 2;
  if (OVERLAY_GROUP_SET.has(name)) return 5;
  return 0;
}

export function getManufacturerLabel(entry) {
  if (!entry) return OTHER_MANUFACTURER_GROUP;
  if (entry.kind === 'library' || entry.kind === 'component') {
    const base = entry.baseDevice || {};
    const vendor = (base.vendor || base.manufacturer || '').trim();
    if (vendor) return vendor;
    if (entry.kind === 'component') {
      const componentVendor = (entry.componentVendor || getComponentVendor(entry.component)).trim();
      if (componentVendor) return componentVendor;
      return COMPONENT_FALLBACK_GROUP;
    }
    return LIBRARY_FALLBACK_GROUP;
  }
  return OVERLAY_GROUP_LABELS[entry.kind] || SYSTEM_OVERLAY_GROUP;
}

export function normalizeTypeKey(value) {
  if (value === null || value === undefined) return 'other';
  const str = String(value).trim();
  if (!str) return 'other';
  return str.toLowerCase().replace(/[_\s-]+/g, ' ');
}

function resolveTypeLabel(rawValue) {
  const normalized = normalizeTypeKey(rawValue);
  if (TYPE_LABEL_OVERRIDES[normalized]) return TYPE_LABEL_OVERRIDES[normalized];
  if (!rawValue || !String(rawValue).trim()) return 'Other Devices';
  return formatOptionLabel(rawValue);
}

function resolveTypePriority(rawValue) {
  const normalized = normalizeTypeKey(rawValue);
  if (TYPE_PRIORITY.has(normalized)) return TYPE_PRIORITY.get(normalized);
  if (normalized.includes('breaker')) return -3;
  if (normalized.includes('relay')) return -2;
  if (normalized.includes('transformer')) return 2;
  if (normalized.includes('motor')) return 3;
  if (normalized.includes('cable')) return 4;
  return TYPE_PRIORITY.get('other');
}

function getTypeInfo(entry) {
  if (!entry) return { id: 'other', label: 'Other Devices', priority: TYPE_PRIORITY.get('other') };
  const base = entry.baseDevice || {};
  const category = entry.deviceCategory || base.type || entry.deviceType || entry.kind || 'other';
  const normalized = normalizeTypeKey(category);
  return { id: normalized, label: resolveTypeLabel(category), priority: resolveTypePriority(category) };
}

export function buildTypeGroups(entries = []) {
  const groups = new Map();
  entries.forEach(entry => {
    const typeInfo = getTypeInfo(entry);
    if (!groups.has(typeInfo.id)) {
      groups.set(typeInfo.id, {
        id: typeInfo.id,
        label: typeInfo.label,
        priority: typeInfo.priority,
        manufacturers: new Map(),
        total: 0
      });
    }
    const group = groups.get(typeInfo.id);
    const manufacturerName = getManufacturerLabel(entry);
    if (!group.manufacturers.has(manufacturerName)) {
      group.manufacturers.set(manufacturerName, {
        name: manufacturerName,
        entries: [],
        priority: manufacturerPriority(manufacturerName)
      });
    }
    group.manufacturers.get(manufacturerName).entries.push(entry);
    group.total += 1;
  });

  return [...groups.values()]
    .map(group => ({
      ...group,
      manufacturers: [...group.manufacturers.values()]
        .map(manufacturer => ({
          ...manufacturer,
          entries: manufacturer.entries
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        }))
        .sort((a, b) => (
          a.priority !== b.priority
            ? a.priority - b.priority
            : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        ))
    }))
    .sort((a, b) => (
      a.priority !== b.priority
        ? a.priority - b.priority
        : a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    ));
}

export function describeEntryAttributes(entry) {
  if (!entry) return [];
  if (entry.kind === 'library' || entry.kind === 'component') {
    const base = entry.baseDevice || {};
    const baseRows = Object.keys(base.settings || {}).map(field => ({
      label: formatSettingLabel(field),
      value: formatSettingValue(base.settings?.[field]),
      range: describeSettingRange(base, field)
    }));
    if (entry.isCustom) {
      const profileCount = Array.isArray(entry.customCurve?.curveProfiles) ? entry.customCurve.curveProfiles.length : 0;
      const pointCount = Array.isArray(entry.customCurve?.curve) ? entry.customCurve.curve.length : 0;
      let pointSummary = pointCount ? `${pointCount} point${pointCount === 1 ? '' : 's'}` : '';
      if (profileCount > 1) {
        pointSummary = pointSummary
          ? `${pointSummary} (primary of ${profileCount} curves)`
          : `Primary of ${profileCount} curves`;
      }
      baseRows.unshift({ label: 'Data Points', value: pointSummary, range: '' });
      if (profileCount > 1) baseRows.unshift({ label: 'Curve Profiles', value: `${profileCount} curves`, range: '' });
      const manufacturer = entry.baseDevice?.vendor || entry.baseDevice?.manufacturer || CUSTOM_CURVE_VENDOR_FALLBACK;
      baseRows.unshift({ label: 'Manufacturer', value: manufacturer, range: '' });
    }
    if (entry.kind === 'component') {
      const used = new Set(baseRows.map(row => row.label.toLowerCase()));
      baseRows.push(...describeComponentDetailRows(entry, used));
    }
    return baseRows;
  }
  if (entry.kind === 'inrush') {
    return [
      { label: 'Inrush Current', value: entry.current !== undefined ? `${formatSettingValue(entry.current)} A` : '', range: '' },
      { label: 'Duration', value: entry.duration !== undefined ? `${formatSettingValue(entry.duration)} s` : '', range: '' }
    ];
  }
  if (entry.kind === 'transformerDamage') {
    return [
      { label: 'Full-Load Amps', value: entry.fla !== undefined ? `${formatSettingValue(entry.fla)} A` : '', range: '' },
      { label: 'Data Points', value: Array.isArray(entry.curve) ? `${entry.curve.length} points` : '', range: '' }
    ];
  }
  if (entry.kind === 'cable') {
    return [
      { label: 'Conductor Size', value: entry.conductorSize || '', range: '' },
      { label: 'Material', value: entry.conductorMaterial ? formatOptionLabel(entry.conductorMaterial) : '', range: '' },
      { label: 'Insulation', value: entry.insulationType || '', range: '' },
      { label: 'Ampacity', value: entry.ampacity !== undefined ? `${formatSettingValue(entry.ampacity)} A` : '', range: '' },
      { label: 'Data Points', value: Array.isArray(entry.curve) ? `${entry.curve.length} points` : '', range: '' }
    ];
  }
  if (entry.kind === 'motorStart') {
    return [
      { label: 'Start Profile', value: entry.startProfile || '', range: '' },
      { label: 'Full-Load Amps', value: entry.fla !== undefined ? `${formatSettingValue(entry.fla)} A` : '', range: '' },
      { label: 'Locked Rotor', value: entry.lockedRotor !== undefined ? `${formatSettingValue(entry.lockedRotor)} A` : '', range: '' },
      { label: 'Start Time', value: entry.startTime !== undefined ? `${formatSettingValue(entry.startTime)} s` : '', range: '' },
      { label: 'Voltage', value: entry.voltage !== undefined ? `${formatSettingValue(entry.voltage)} V` : '', range: '' },
      { label: 'Source', value: entry.estimated ? 'Estimated' : '', range: '' }
    ];
  }
  if (entry.kind === 'motorThermal') {
    return [
      { label: 'Full-Load Amps', value: entry.fla !== undefined ? `${formatSettingValue(entry.fla)} A` : '', range: '' },
      { label: 'Locked Rotor', value: entry.lockedRotor !== undefined ? `${formatSettingValue(entry.lockedRotor)} A` : '', range: '' },
      { label: 'Stall Time', value: entry.stallTime !== undefined ? `${formatSettingValue(entry.stallTime)} s` : '', range: '' },
      { label: 'Service Factor', value: entry.serviceFactor !== undefined ? formatSettingValue(entry.serviceFactor) : '', range: '' },
      { label: 'Continuous Current', value: entry.continuousCurrent !== undefined ? `${formatSettingValue(entry.continuousCurrent)} A` : '', range: '' },
      { label: 'Voltage', value: entry.voltage !== undefined ? `${formatSettingValue(entry.voltage)} V` : '', range: '' },
      { label: 'Source', value: entry.estimated ? 'Estimated' : '', range: '' },
      { label: 'Data Points', value: Array.isArray(entry.curve) ? `${entry.curve.length} points` : '', range: '' }
    ];
  }
  return [];
}
