export const NEMA_STARTER_HP_TABLE_ROWS = [
  ['00', '1 1/2', '1 1/2', '2', '--', '--', '--', '--', '--', '--', '--', '--', '--'],
  ['0', '3', '3', '5', '--', '--', '--', '--', '--', '--', '--', '--', '--'],
  ['1', '7 1/2', '7 1/2', '10', '7 1/2', '7 1/2', '10', '10', '10', '15', '10', '10', '15'],
  ['2', '10', '15', '25', '10', '15', '25', '20', '25', '40', '20', '25', '40'],
  ['3', '25', '30', '50', '25', '30', '50', '40', '50', '75', '40', '50', '75'],
  ['4', '40', '50', '100', '40', '50', '100', '75', '75', '150', '60', '75', '150'],
  ['5', '75', '100', '200', '75', '100', '200', '150', '150', '350', '150', '150', '300'],
  ['6', '150', '200', '400', '150', '200', '400', '--', '300', '600', '300', '350', '700'],
  ['7', '--', '300', '600', '--', '300', '600', '--', '450', '900', '500', '500', '1000'],
  ['8', '--', '450', '900', '--', '450', '900', '--', '700', '1400', '750', '800', '1500'],
  ['9', '--', '800', '1600', '--', '800', '1600', '--', '1300', '2600', '1500', '1500', '3000']
];

export const NEMA_STARTER_HP_SOURCE = {
  label: 'Eaton NEMA Contactors and Starters catalog',
  url: 'https://www.eaton.com/content/dam/eaton/products/industrialcontrols-drives-automation-sensors/nema-contactors-and-starters-v5-t2-ca08100006e.pdf'
};

export const MCC_BUCKET_SIZE_SOURCES = [
  {
    label: 'Eaton Freedom MCC catalog',
    url: 'https://www.eaton.com/content/dam/eaton/products/low-voltage-power-distribution-controls-systems/motor-contols/mcc-catalog.pdf-vol03-tab03.pdf'
  },
  {
    label: 'Rockwell Automation CENTERLINE 2100 selection guide',
    url: 'https://literature.rockwellautomation.com/idc/groups/literature/documents/sg/2100-sg003_-en-p.pdf'
  },
  {
    label: 'Schneider Electric Model 6 size 1 starter FAQ',
    url: 'https://www.se.com/us/en/faqs/FA236769/'
  }
];

export const CONSERVATIVE_FVNR_BUCKET_HEIGHT_IN = {
  '00': 12,
  '0': 12,
  '1': 12,
  '2': 12,
  '3': 24,
  '4': 36,
  '5': 48
};

const METHOD_COLUMN_OFFSET = {
  'full-voltage': 1,
  'auto-transformer': 4,
  'part-winding': 7,
  'wye-delta': 10
};

function numberValue(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function hpRating(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === '--') return null;
  const parts = normalized.split(/\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes('/')) {
      const [numerator, denominator] = part.split('/').map(Number);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
      total += numerator / denominator;
    } else {
      const parsed = Number.parseFloat(part);
      if (!Number.isFinite(parsed)) return null;
      total += parsed;
    }
  }
  return total;
}

function voltageColumn(value) {
  const voltage = numberValue(value);
  if (voltage === null) return null;
  if ([200, 208].includes(voltage)) return { offset: 0, label: '200 V class' };
  if ([220, 230, 240].includes(voltage)) return { offset: 1, label: '230 V class' };
  if ([440, 460, 480, 575, 600].includes(voltage)) return { offset: 2, label: '460/575 V class' };
  return null;
}

function starterMethod(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!normalized || normalized === 'fvnr' || normalized === 'fvr') {
    return { key: 'full-voltage', label: 'full voltage', assumed: !normalized };
  }
  if (normalized === 'reduced-voltage-autotransformer') {
    return { key: 'auto-transformer', label: 'auto transformer', assumed: false };
  }
  if (normalized === 'part-winding') {
    return { key: 'part-winding', label: 'part winding', assumed: false };
  }
  if (normalized === 'wye-delta') {
    return { key: 'wye-delta', label: 'wye delta', assumed: false };
  }
  return null;
}

export function approximateNemaStarterSize({ hp, voltage, phases, starterType = '' } = {}) {
  const hpValue = numberValue(hp);
  if (hpValue === null || hpValue <= 0) return { size: null, reason: 'missing-hp' };

  const phaseValue = numberValue(phases);
  if (phaseValue !== 3) return { size: null, reason: 'unsupported-phases' };

  const voltageClass = voltageColumn(voltage);
  if (!voltageClass) return { size: null, reason: 'unsupported-voltage' };

  const method = starterMethod(starterType);
  if (!method) return { size: null, reason: 'unsupported-method' };

  const ratingColumn = METHOD_COLUMN_OFFSET[method.key] + voltageClass.offset;
  for (const row of NEMA_STARTER_HP_TABLE_ROWS) {
    const maximumHp = hpRating(row[ratingColumn]);
    if (maximumHp !== null && hpValue <= maximumHp) {
      return {
        size: row[0],
        label: `NEMA ${row[0]}`,
        maximumHp,
        hp: hpValue,
        voltageClass: voltageClass.label,
        method: method.label,
        assumedFullVoltage: method.assumed,
        basis: `${hpValue} HP, ${voltageClass.label}, ${method.label}, three phase${method.assumed ? ' (full-voltage method assumed because no starter method was provided)' : ''}`
      };
    }
  }

  return { size: null, reason: 'above-table' };
}

function normalizedNemaSize(value) {
  return String(value ?? '').trim().toUpperCase().replace(/^NEMA\s*/, '');
}

function fvnrBucketMethod(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!normalized) return { supported: true, assumed: true };
  return { supported: normalized === 'fvnr', assumed: false };
}

export function approximateMccBucketSizeFromNema({
  starterSize,
  starterType = '',
  unitHeightIn = 6,
  usableBucketHeightIn = 72
} = {}) {
  const size = normalizedNemaSize(starterSize);
  if (!size) return { sizeUnits: null, heightIn: null, reason: 'missing-starter-size' };

  const method = fvnrBucketMethod(starterType);
  if (!method.supported) return { sizeUnits: null, heightIn: null, reason: 'unsupported-method' };

  const unitHeight = numberValue(unitHeightIn);
  if (unitHeight === null || unitHeight <= 0) {
    return { sizeUnits: null, heightIn: null, reason: 'invalid-unit-height' };
  }

  if (['7', '8', '9'].includes(size)) {
    return { sizeUnits: null, heightIn: null, reason: 'custom-size-required' };
  }

  let heightIn = CONSERVATIVE_FVNR_BUCKET_HEIGHT_IN[size] || null;
  let fullSection = false;
  if (size === '6') {
    const usableHeight = numberValue(usableBucketHeightIn);
    if (usableHeight === null || usableHeight <= 0) {
      return { sizeUnits: null, heightIn: null, reason: 'invalid-usable-height' };
    }
    heightIn = usableHeight;
    fullSection = true;
  }

  if (heightIn === null) return { sizeUnits: null, heightIn: null, reason: 'unsupported-starter-size' };

  const sizeUnits = Math.round((heightIn / unitHeight) * 100) / 100;
  const assumption = method.assumed ? ' FVNR assumed because no starter method was provided.' : '';
  return {
    sizeUnits,
    heightIn,
    nemaSize: size,
    fullSection,
    assumedFvnr: method.assumed,
    basis: `Generic conservative FVNR planning allowance for NEMA ${size}: ${heightIn} in. (${sizeUnits} MCC units at ${unitHeight} in./unit).${assumption}`
  };
}
