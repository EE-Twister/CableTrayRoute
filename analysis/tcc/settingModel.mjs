export function formatSettingLabel(field = '') {
  const known = {
    pickup: 'Pickup (A)',
    time: 'Delay',
    delay: 'Delay',
    tms: 'TMS (Time Multiplier)',
    instantaneous: 'Instantaneous Pickup',
    instantaneousDelay: 'Instantaneous Delay',
    instantaneousMax: 'Instantaneous Max',
    instantaneousPickup: 'Instantaneous Pickup',
    curveFamily: 'Curve Family (IEC 60255-151)',
    curveProfile: 'Curve Profile',
    longTimePickup: 'Long Time Pickup',
    longTimeDelay: 'Long Time Delay',
    shortTimePickup: 'Short Time Pickup',
    shortTimeDelay: 'Short Time Delay',
    ampRating: 'Amp Rating',
    speed: 'Speed'
  };
  if (known[field]) return known[field];
  return String(field)
    .replace(/[_\s]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase())
    .trim();
}

export function formatSettingValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return formatSettingValue(num);
    return trimmed;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const num = value;
  if (Math.abs(num) >= 1000 || Number.isInteger(num)) return String(num);
  if (Math.abs(num) >= 100) return num.toFixed(1);
  if (Math.abs(num) >= 10) return num.toFixed(2);
  return num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatCoordinationCurrent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (Math.abs(num) >= 1000) return Math.round(num).toLocaleString('en-US');
  if (Math.abs(num) >= 100) return num.toFixed(1).replace(/\.0$/, '');
  if (Math.abs(num) >= 10) return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatCoordinationSeconds(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (Math.abs(num) >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (Math.abs(num) >= 10) return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatOptionLabel(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatSettingValue(value);
  const str = String(value).trim();
  if (!str) return '';
  return str
    .replace(/[_\s-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase());
}

export function formatDetailValue(value) {
  const MAX_ARRAY_DEPTH = 8;
  const MAX_ARRAY_ITEMS = 100;
  const MAX_OUTPUT_LENGTH = 1000;

  const trimOutput = str => {
    if (!str) return '';
    if (str.length <= MAX_OUTPUT_LENGTH) return str;
    return `${str.slice(0, MAX_OUTPUT_LENGTH - 1)}…`;
  };

  const walk = (current, depth, seen) => {
    if (current === null || current === undefined) return '';
    if (Array.isArray(current)) {
      if (depth >= MAX_ARRAY_DEPTH || seen.has(current)) return '[…]';
      seen.add(current);
      const parts = [];
      const maxItems = Math.min(current.length, MAX_ARRAY_ITEMS);
      for (let idx = 0; idx < maxItems; idx += 1) {
        const part = walk(current[idx], depth + 1, seen);
        if (part) parts.push(part);
      }
      if (current.length > MAX_ARRAY_ITEMS) parts.push('…');
      seen.delete(current);
      return trimOutput(parts.join(', '));
    }
    if (typeof current === 'boolean') return current ? 'Yes' : 'No';
    if (typeof current === 'number') return formatSettingValue(current);
    if (typeof current === 'string') return current.trim();
    return '';
  };

  return walk(value, 0, new Set());
}

export function normalizeSettingOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map(option => {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const value = option.value;
      return {
        value,
        valueStr: String(value ?? ''),
        label: option.label ?? formatOptionLabel(value)
      };
    }
    return {
      value: option,
      valueStr: String(option ?? ''),
      label: formatOptionLabel(option)
    };
  });
}

export function getSettingOptions(device, field) {
  if (!device || !device.settingOptions) return [];
  const raw = device.settingOptions[field];
  if (!Array.isArray(raw)) return [];
  return normalizeSettingOptions(raw);
}

export function describeSettingRange(device, field) {
  const options = getSettingOptions(device, field);
  if (!options.length) return '';
  const numericOptions = options
    .map(option => {
      const num = Number(option.value);
      return Number.isFinite(num) ? num : null;
    })
    .filter(num => num !== null);
  if (numericOptions.length === options.length && numericOptions.length) {
    const min = Math.min(...numericOptions);
    const max = Math.max(...numericOptions);
    if (Math.abs(min - max) < 1e-9) return formatSettingValue(min);
    return `${formatSettingValue(min)} – ${formatSettingValue(max)}`;
  }
  return options
    .map(option => option.label)
    .filter(label => label && label.trim())
    .join(', ');
}

export function valuesEqual(a, b) {
  if (a === b) return true;
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return Math.abs(numA - numB) < 1e-9;
  }
  return String(a) === String(b);
}

export function snapSettingValue(device, field, value) {
  if (value === undefined || value === null) return value;
  const options = getSettingOptions(device, field);
  if (!options.length) return value;
  const numericOptions = options
    .map(option => {
      const numeric = Number(option.value);
      return Number.isFinite(numeric) ? { ...option, numeric } : null;
    })
    .filter(Boolean);
  const parsedValue = Number(value);
  if (numericOptions.length === options.length && Number.isFinite(parsedValue)) {
    let best = numericOptions[0];
    let bestDiff = Math.abs(parsedValue - best.numeric);
    numericOptions.slice(1).forEach(option => {
      const diff = Math.abs(parsedValue - option.numeric);
      if (diff < bestDiff) {
        best = option;
        bestDiff = diff;
      }
    });
    if (typeof best.value === 'number') return best.value;
    const asNumber = Number(best.value);
    return Number.isFinite(asNumber) ? asNumber : best.value;
  }
  const strValue = String(value);
  const match = options.find(option => option.valueStr === strValue || valuesEqual(option.value, value));
  if (match) return match.value;
  return options[0].value;
}

export function snapOverridesToOptions(device, overrides = {}) {
  if (!device) return { ...overrides };
  const result = {};
  Object.entries(overrides).forEach(([field, value]) => {
    if (value === undefined || value === null) return;
    const snapped = snapSettingValue(device, field, value);
    if (snapped !== undefined && snapped !== null) result[field] = snapped;
  });
  return result;
}

export function resolveSettingType(defaultValue, options) {
  if (Array.isArray(options)) {
    const hasNonNumericOption = options.some(option => {
      const value = option && typeof option === 'object' && !Array.isArray(option)
        ? option.value
        : option;
      if (value === null || value === undefined) return false;
      if (typeof value === 'number') return false;
      return Number.isNaN(Number(value));
    });
    if (hasNonNumericOption) return 'string';
  }
  if (defaultValue !== null && defaultValue !== undefined) {
    if (typeof defaultValue === 'string') {
      if (Number.isNaN(Number(defaultValue))) return 'string';
    } else if (typeof defaultValue !== 'number') {
      return 'string';
    }
  }
  return 'number';
}
