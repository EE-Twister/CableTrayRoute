/**
 * Vendor relay-settings file export (Gap #97).
 *
 * Generates per-device settings files in vendor-native formats:
 *   SEL SET/RDB, GE EnerVista URS, ABB PCM600 CFG, Siemens DIGSI XRIO,
 *   and a vendor-neutral IEC 61850-compatible JSON fallback.
 *
 * All functions are pure (no DOM, no dataStore) so they can be tested in Node.
 */

export const MANIFEST_HEADERS = [
  'Device ID', 'Name', 'Vendor', 'Relay Model',
  'Settings Hash', 'File Name', 'Format', 'Warnings',
];

// ---------------------------------------------------------------------------
// Settings extraction
// ---------------------------------------------------------------------------

/**
 * Merge baseDevice.settings with entry.overrideSource to get effective settings.
 * @param {Object} entry - TCC device entry
 * @returns {Object}
 */
export function resolveSettings(entry = {}) {
  const base = entry.baseDevice?.settings || {};
  const overrides = entry.overrideSource || {};
  return { ...base, ...overrides };
}

/**
 * Return entries that have a base device with at least one setting defined.
 * Includes relays, breakers, fuses, and reclosers — anything with configurable settings.
 * @param {Array} entries - TCC device entry array
 * @returns {Array}
 */
export function filterExportableEntries(entries = []) {
  return entries.filter(e =>
    e.baseDevice && Object.keys(e.baseDevice.settings || {}).length > 0
  );
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Deterministic djb2-based hash of a settings object. Returns 8-char hex string.
 * Keys are sorted before serialisation so field order does not affect the hash.
 * @param {Object} settings
 * @returns {string}
 */
export function hashSettings(settings = {}) {
  const str = JSON.stringify(settings, Object.keys(settings).sort());
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// SEL SET / RDB format
// ---------------------------------------------------------------------------

const SEL_CURVE_MAP = {
  IEC_Inverse:          'C1',
  IEC_VeryInverse:      'C2',
  NI:                   'C2',
  VI:                   'C2',
  IEC_ExtremelyInverse: 'C3',
  EI:                   'C3',
  IEC_LongTimeInverse:  'C4',
  LTI:                  'C4',
  IEC_DefiniteTime:     'U3',
};

/**
 * Format a device entry as SEL SET/RDB (INI-style key=value).
 * Overcurrent relays use SEL SELOGIC function block mnemonics (50/51 elements).
 * Differential relays use slope/breakpoint mnemonics.
 * @param {Object} entry
 * @returns {string}
 */
export function formatSEL(entry = {}) {
  const dev = entry.baseDevice || {};
  const s = resolveSettings(entry);
  const ts = new Date().toISOString();
  const lines = [
    `; SEL Relay Settings File`,
    `; Device  : ${dev.name || entry.name || 'Unknown'} (${dev.id || ''})`,
    `; Vendor  : ${dev.vendor || 'SEL'}`,
    `; Generated: ${ts}`,
    `;`,
  ];

  const subtype = (dev.subtype || entry.deviceType || '').toLowerCase();

  if (subtype === 'relay_87') {
    lines.push(`[DIFFERENTIAL]`);
    if (s.slope1 !== undefined)                    lines.push(`SLP1=${s.slope1}`);
    if (s.slope2 !== undefined)                    lines.push(`SLP2=${s.slope2}`);
    if (s.minPickupPu !== undefined)               lines.push(`O87P=${s.minPickupPu}`);
    if (s.breakpointPu !== undefined)              lines.push(`IRS1=${s.breakpointPu}`);
    if (s.tapSetting !== undefined)                lines.push(`TAP1=${s.tapSetting}`);
    if (s.secondHarmonicThresholdPct !== undefined) lines.push(`PCT2=${s.secondHarmonicThresholdPct}`);
    if (s.fifthHarmonicThresholdPct !== undefined)  lines.push(`PCT5=${s.fifthHarmonicThresholdPct}`);
  } else {
    const pickup   = s.longTimePickup  ?? s.pickup;
    const tms      = s.tms ?? s.longTimeDelay ?? s.time;
    const instPkup = s.instantaneousPickup ?? s.instantaneous;
    const stPickup = s.shortTimePickup;
    const stDelay  = s.shortTimeDelay;
    const curve    = SEL_CURVE_MAP[s.curveProfile ?? s.curveFamily] ?? 'U1';

    lines.push(`[OVERCURRENT]`);
    if (instPkup !== undefined) lines.push(`50P1P=${instPkup}`);
    if (pickup    !== undefined) lines.push(`51P1P=${pickup}`);
    if (tms       !== undefined) lines.push(`51P1TD=${tms}`);
    lines.push(`51P1C=${curve}`);
    if (stPickup  !== undefined) lines.push(`51P1SP=${stPickup}`);
    if (stDelay   !== undefined) lines.push(`51P1SD=${stDelay}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// GE EnerVista URS format
// ---------------------------------------------------------------------------

const GE_CURVE_MAP = {
  IEC_Inverse:          'INVS',
  IEC_VeryInverse:      'VINE',
  NI:                   'IAC_NI',
  VI:                   'VINE',
  IEC_ExtremelyInverse: 'EINN',
  EI:                   'EINN',
  IEC_LongTimeInverse:  'LTVE',
  LTI:                  'LTVE',
  IEC_DefiniteTime:     'DEFT',
};

/**
 * Format a device entry as GE EnerVista URS (key=value, # comments).
 * @param {Object} entry
 * @returns {string}
 */
export function formatGEURS(entry = {}) {
  const dev = entry.baseDevice || {};
  const s = resolveSettings(entry);
  const ts = new Date().toISOString();
  const lines = [
    `# GE EnerVista Settings File`,
    `# Device  : ${dev.name || entry.name || 'Unknown'} (${dev.id || ''})`,
    `# Vendor  : ${dev.vendor || 'GE'}`,
    `# Generated: ${ts}`,
    `#`,
  ];

  const subtype = (dev.subtype || entry.deviceType || '').toLowerCase();

  if (subtype === 'relay_87') {
    lines.push(`# Differential protection`);
    if (s.slope1 !== undefined)                    lines.push(`DIFF_SLOPE1=${s.slope1}`);
    if (s.slope2 !== undefined)                    lines.push(`DIFF_SLOPE2=${s.slope2}`);
    if (s.minPickupPu !== undefined)               lines.push(`DIFF_PICKUP=${s.minPickupPu}`);
    if (s.breakpointPu !== undefined)              lines.push(`DIFF_BREAKPOINT=${s.breakpointPu}`);
    if (s.tapSetting !== undefined)                lines.push(`TAP_W1=${s.tapSetting}`);
    if (s.secondHarmonicThresholdPct !== undefined) lines.push(`PCT2H=${s.secondHarmonicThresholdPct}`);
    if (s.fifthHarmonicThresholdPct !== undefined)  lines.push(`PCT5H=${s.fifthHarmonicThresholdPct}`);
  } else {
    const pickup   = s.longTimePickup  ?? s.pickup;
    const tms      = s.tms ?? s.longTimeDelay ?? s.time;
    const instPkup = s.instantaneousPickup ?? s.instantaneous;
    const stPickup = s.shortTimePickup;
    const stDelay  = s.shortTimeDelay;
    const curve    = GE_CURVE_MAP[s.curveProfile ?? s.curveFamily] ?? 'INVS';

    if (pickup    !== undefined) lines.push(`OC_PICKUP=${pickup}`);
    if (tms       !== undefined) lines.push(`OC_TIME_DIAL=${tms}`);
    lines.push(`OC_CURVE=${curve}`);
    if (stPickup  !== undefined) lines.push(`OC_ST_PICKUP=${stPickup}`);
    if (stDelay   !== undefined) lines.push(`OC_ST_DELAY=${stDelay}`);
    if (instPkup  !== undefined) lines.push(`INST_PICKUP=${instPkup}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// ABB PCM600 CFG format (XML)
// ---------------------------------------------------------------------------

function xmlEsc(v) {
  return String(v).replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])
  );
}

/**
 * Format a device entry as ABB PCM600 CFG (simplified XML).
 * @param {Object} entry
 * @returns {string}
 */
export function formatABBCFG(entry = {}) {
  const dev = entry.baseDevice || {};
  const s = resolveSettings(entry);
  const ts = new Date().toISOString();

  const paramLines = Object.entries(s).map(
    ([k, v]) => `    <Parameter name="${xmlEsc(k)}" value="${xmlEsc(v)}" />`
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- ABB PCM600 Configuration Export -->`,
    `<!-- Device: ${xmlEsc(dev.name || entry.name || 'Unknown')} | Generated: ${ts} -->`,
    `<Configuration device="${xmlEsc(dev.id || '')}" model="${xmlEsc(dev.name || '')}" vendor="${xmlEsc(dev.vendor || 'ABB')}">`,
    `  <Settings>`,
    ...paramLines,
    `  </Settings>`,
    `</Configuration>`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Siemens DIGSI XRIO format (XML)
// ---------------------------------------------------------------------------

/**
 * Format a device entry as Siemens DIGSI XRIO (XML).
 * @param {Object} entry
 * @returns {string}
 */
export function formatSiemensXRIO(entry = {}) {
  const dev = entry.baseDevice || {};
  const s = resolveSettings(entry);
  const ts = new Date().toISOString();

  const paramLines = Object.entries(s).map(
    ([k, v]) => `      <Parameter name="${xmlEsc(k)}" value="${xmlEsc(v)}" />`
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Siemens DIGSI XRIO Export -->`,
    `<!-- Device: ${xmlEsc(dev.name || entry.name || 'Unknown')} | Generated: ${ts} -->`,
    `<XRIO xmlns="urn:siemens:digsi:xrio" version="2.0">`,
    `  <Device id="${xmlEsc(dev.id || '')}" name="${xmlEsc(dev.name || '')}" vendor="${xmlEsc(dev.vendor || 'Siemens')}">`,
    `    <ParameterSet type="Protection">`,
    ...paramLines,
    `    </ParameterSet>`,
    `  </Device>`,
    `</XRIO>`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Neutral IEC 61850-compatible JSON format
// ---------------------------------------------------------------------------

/**
 * Format a device entry as vendor-neutral IEC 61850-compatible JSON.
 * Used as fallback for vendors without a native adapter.
 * @param {Object} entry
 * @returns {string}
 */
export function formatNeutral(entry = {}) {
  const dev = entry.baseDevice || {};
  const s = resolveSettings(entry);
  return JSON.stringify({
    version: '1.0',
    standard: 'IEC-61850-SCL-compatible',
    generated: new Date().toISOString(),
    device: {
      id:     dev.id     || '',
      name:   dev.name   || entry.name || '',
      vendor: dev.vendor || '',
      type:   dev.type   || entry.deviceType || '',
    },
    settings: s,
    hash: hashSettings(s),
  }, null, 2);
}

// ---------------------------------------------------------------------------
// Vendor dispatch
// ---------------------------------------------------------------------------

export const VENDOR_FORMATS = {
  SEL:     { format: formatSEL,          ext: 'set',  label: 'SEL SET' },
  GE:      { format: formatGEURS,        ext: 'urs',  label: 'GE URS' },
  ABB:     { format: formatABBCFG,       ext: 'cfg',  label: 'ABB CFG' },
  Siemens: { format: formatSiemensXRIO,  ext: 'xrio', label: 'Siemens XRIO' },
};

/**
 * Return the vendor format descriptor for an entry, or null for unknown vendors.
 * @param {Object} entry
 * @returns {{ format: Function, ext: string, label: string } | null}
 */
export function selectVendorFormat(entry = {}) {
  const vendor = (entry.baseDevice?.vendor || entry.componentVendor || '').trim();
  return VENDOR_FORMATS[vendor] ?? null;
}

// ---------------------------------------------------------------------------
// File list + manifest assembly
// ---------------------------------------------------------------------------

/**
 * Build the list of export files and manifest rows from TCC device entries.
 * Non-settable entries (cables, inrush, motor-start curves, etc.) are skipped.
 *
 * @param {Array} entries - All TCC device entries
 * @returns {{
 *   files: Array<{filename:string, content:string, contentType:string}>,
 *   manifestRows: Array<Object>,
 *   warnings: string[]
 * }}
 */
export function buildExportFiles(entries = []) {
  const exportable = filterExportableEntries(entries);
  const files = [];
  const manifestRows = [];
  const warnings = [];

  exportable.forEach(entry => {
    const dev = entry.baseDevice || {};
    const s   = resolveSettings(entry);
    const hash = hashSettings(s);
    const vendorFmt = selectVendorFormat(entry);
    const safeName = (entry.name || dev.id || 'device').replace(/[^a-zA-Z0-9_-]/g, '_');

    let content, ext, fmt, warn = '';

    if (vendorFmt) {
      content = vendorFmt.format(entry);
      ext     = vendorFmt.ext;
      fmt     = vendorFmt.label;
    } else {
      content = formatNeutral(entry);
      ext     = 'json';
      fmt     = 'Neutral JSON';
      warn    = `Unknown vendor "${dev.vendor || ''}" — exported as neutral JSON`;
      if (warn) warnings.push(`${entry.name || dev.id}: ${warn}`);
    }

    const filename = `${safeName}.${ext}`;
    files.push({
      filename,
      content,
      contentType: ext === 'json' ? 'application/json' : 'text/plain',
    });
    manifestRows.push({
      'Device ID':     dev.id     || entry.uid || '',
      'Name':          entry.name || dev.name  || '',
      'Vendor':        dev.vendor || '',
      'Relay Model':   dev.name   || '',
      'Settings Hash': hash,
      'File Name':     filename,
      'Format':        fmt,
      'Warnings':      warn,
    });
  });

  return { files, manifestRows, warnings };
}
