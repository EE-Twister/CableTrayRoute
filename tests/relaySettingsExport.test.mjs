/**
 * Tests for reports/relaySettingsExport.mjs (Gap #97 — Vendor Relay-Settings File Export)
 */

import assert from 'assert';
import {
  resolveSettings,
  filterExportableEntries,
  hashSettings,
  formatSEL,
  formatGEURS,
  formatABBCFG,
  formatSiemensXRIO,
  formatNeutral,
  selectVendorFormat,
  buildExportFiles,
  MANIFEST_HEADERS,
  VENDOR_FORMATS,
} from '../reports/relaySettingsExport.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

// ─── Fixture entries ──────────────────────────────────────────────────────

const GE_RELAY_ENTRY = {
  uid: 'library:ge_multilin_750',
  name: 'GE Multilin 750',
  deviceType: 'relay',
  baseDevice: {
    id: 'ge_multilin_750',
    type: 'relay',
    vendor: 'GE',
    name: 'GE Multilin 750 Relay',
    settings: {
      curveProfile: 'IEC_VeryInverse',
      longTimePickup: 150,
      longTimeDelay: 0.15,
      shortTimePickup: 450,
      shortTimeDelay: 0.05,
      instantaneousPickup: 600,
    },
  },
  overrideSource: {},
};

const SEL_RELAY_ENTRY = {
  uid: 'library:sel_487b',
  name: 'SEL-487B Bus Diff',
  deviceType: 'relay_87',
  baseDevice: {
    id: 'sel_487b',
    type: 'relay',
    subtype: 'relay_87',
    vendor: 'SEL',
    name: 'SEL-487B Bus Differential Relay',
    settings: {
      slope1: 0.25,
      slope2: 0.65,
      minPickupPu: 0.20,
      breakpointPu: 3.0,
      tapSetting: 1.0,
    },
  },
  overrideSource: {},
};

const ABB_BREAKER_ENTRY = {
  uid: 'library:abb_tmax_160',
  name: 'ABB Tmax T3 160A',
  deviceType: 'breaker',
  baseDevice: {
    id: 'abb_tmax_160',
    type: 'breaker',
    vendor: 'ABB',
    name: 'ABB Tmax T3 160A',
    settings: { pickup: 160, time: 0.2, instantaneous: 800 },
  },
  overrideSource: { pickup: 125 },
};

const SIEMENS_BREAKER_ENTRY = {
  uid: 'library:siemens_3va_125',
  name: 'Siemens 3VA 125A',
  deviceType: 'breaker',
  baseDevice: {
    id: 'siemens_3va_125',
    type: 'breaker',
    vendor: 'Siemens',
    name: 'Siemens 3VA 125A',
    settings: { pickup: 125, time: 0.25, instantaneous: 600 },
  },
  overrideSource: {},
};

const UNKNOWN_VENDOR_ENTRY = {
  uid: 'library:custom_relay',
  name: 'Custom Relay',
  deviceType: 'relay',
  baseDevice: {
    id: 'custom_relay',
    type: 'relay',
    vendor: 'Acme',
    name: 'Acme Generic Relay',
    settings: { pickup: 100, tms: 0.5 },
  },
  overrideSource: {},
};

const CABLE_ENTRY = {
  uid: 'cable:c1',
  name: 'Cable C-1',
  kind: 'cable',
  baseDevice: null,
  overrideSource: {},
};

const NO_SETTINGS_ENTRY = {
  uid: 'library:bare',
  name: 'Bare Device',
  baseDevice: { id: 'bare', type: 'relay', vendor: 'SEL', name: 'Bare', settings: {} },
  overrideSource: {},
};

// ─── resolveSettings ──────────────────────────────────────────────────────

describe('resolveSettings', () => {
  it('returns base settings when no overrides', () => {
    const s = resolveSettings(GE_RELAY_ENTRY);
    assert.strictEqual(s.longTimePickup, 150);
    assert.strictEqual(s.instantaneousPickup, 600);
  });

  it('overrides win over base settings', () => {
    const s = resolveSettings(ABB_BREAKER_ENTRY);
    assert.strictEqual(s.pickup, 125);      // override
    assert.strictEqual(s.time, 0.2);        // base
    assert.strictEqual(s.instantaneous, 800); // base
  });

  it('returns empty object when entry has no baseDevice', () => {
    const s = resolveSettings(CABLE_ENTRY);
    assert.deepStrictEqual(s, {});
  });

  it('returns empty object for empty entry', () => {
    assert.deepStrictEqual(resolveSettings({}), {});
  });
});

// ─── filterExportableEntries ──────────────────────────────────────────────

describe('filterExportableEntries', () => {
  const all = [GE_RELAY_ENTRY, SEL_RELAY_ENTRY, ABB_BREAKER_ENTRY, CABLE_ENTRY, NO_SETTINGS_ENTRY];

  it('excludes entries with no baseDevice (cables, inrush)', () => {
    const result = filterExportableEntries(all);
    assert.ok(!result.some(e => e.uid === CABLE_ENTRY.uid));
  });

  it('excludes entries with empty settings', () => {
    const result = filterExportableEntries(all);
    assert.ok(!result.some(e => e.uid === NO_SETTINGS_ENTRY.uid));
  });

  it('includes relay and breaker entries with settings', () => {
    const result = filterExportableEntries(all);
    assert.ok(result.some(e => e.uid === GE_RELAY_ENTRY.uid));
    assert.ok(result.some(e => e.uid === SEL_RELAY_ENTRY.uid));
    assert.ok(result.some(e => e.uid === ABB_BREAKER_ENTRY.uid));
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(filterExportableEntries([]), []);
  });
});

// ─── hashSettings ─────────────────────────────────────────────────────────

describe('hashSettings', () => {
  it('returns 8-character hex string', () => {
    const h = hashSettings({ pickup: 100 });
    assert.match(h, /^[0-9a-f]{8}$/);
  });

  it('same settings produce same hash', () => {
    const a = hashSettings({ pickup: 150, tms: 0.5 });
    const b = hashSettings({ tms: 0.5, pickup: 150 });
    assert.strictEqual(a, b, 'hash should be key-order independent');
  });

  it('different settings produce different hashes', () => {
    const a = hashSettings({ pickup: 100 });
    const b = hashSettings({ pickup: 200 });
    assert.notStrictEqual(a, b);
  });

  it('returns 8-char hex for empty object', () => {
    assert.match(hashSettings({}), /^[0-9a-f]{8}$/);
  });
});

// ─── formatSEL ────────────────────────────────────────────────────────────

describe('formatSEL — overcurrent relay', () => {
  let out;
  before(() => { out = formatSEL(GE_RELAY_ENTRY); });
  function before(fn) { out = fn() ?? out; }

  it('contains [OVERCURRENT] section header', () => {
    out = formatSEL(GE_RELAY_ENTRY);
    assert.ok(out.includes('[OVERCURRENT]'), `got:\n${out}`);
  });

  it('maps instantaneousPickup to 50P1P', () => {
    assert.ok(out.includes('50P1P=600'), `got:\n${out}`);
  });

  it('maps longTimePickup to 51P1P', () => {
    assert.ok(out.includes('51P1P=150'), `got:\n${out}`);
  });

  it('maps longTimeDelay to 51P1TD', () => {
    assert.ok(out.includes('51P1TD=0.15'), `got:\n${out}`);
  });

  it('maps IEC_VeryInverse to curve code C2', () => {
    assert.ok(out.includes('51P1C=C2'), `got:\n${out}`);
  });

  it('includes SEL file header comment', () => {
    assert.ok(out.startsWith('; SEL Relay Settings File'), `got:\n${out}`);
  });
});

describe('formatSEL — differential relay', () => {
  it('uses [DIFFERENTIAL] section for relay_87 subtype', () => {
    const out = formatSEL(SEL_RELAY_ENTRY);
    assert.ok(out.includes('[DIFFERENTIAL]'), `got:\n${out}`);
  });

  it('maps slope1 to SLP1', () => {
    const out = formatSEL(SEL_RELAY_ENTRY);
    assert.ok(out.includes('SLP1=0.25'), `got:\n${out}`);
  });

  it('maps minPickupPu to O87P', () => {
    const out = formatSEL(SEL_RELAY_ENTRY);
    assert.ok(out.includes('O87P=0.2'), `got:\n${out}`);
  });
});

// ─── formatGEURS ──────────────────────────────────────────────────────────

describe('formatGEURS — overcurrent relay', () => {
  it('contains OC_PICKUP key with longTimePickup value', () => {
    const out = formatGEURS(GE_RELAY_ENTRY);
    assert.ok(out.includes('OC_PICKUP=150'), `got:\n${out}`);
  });

  it('maps IEC_VeryInverse to VINE', () => {
    const out = formatGEURS(GE_RELAY_ENTRY);
    assert.ok(out.includes('OC_CURVE=VINE'), `got:\n${out}`);
  });

  it('contains INST_PICKUP with instantaneousPickup value', () => {
    const out = formatGEURS(GE_RELAY_ENTRY);
    assert.ok(out.includes('INST_PICKUP=600'), `got:\n${out}`);
  });

  it('starts with GE EnerVista header comment', () => {
    const out = formatGEURS(GE_RELAY_ENTRY);
    assert.ok(out.startsWith('# GE EnerVista Settings File'), `got:\n${out}`);
  });
});

describe('formatGEURS — differential relay', () => {
  it('emits DIFF_SLOPE1 for relay_87 subtype', () => {
    const out = formatGEURS(SEL_RELAY_ENTRY);
    assert.ok(out.includes('DIFF_SLOPE1=0.25'), `got:\n${out}`);
  });
});

// ─── formatABBCFG ─────────────────────────────────────────────────────────

describe('formatABBCFG', () => {
  it('produces valid XML with root <Configuration> element', () => {
    const out = formatABBCFG(ABB_BREAKER_ENTRY);
    assert.ok(out.includes('<Configuration '), `got:\n${out}`);
    assert.ok(out.includes('</Configuration>'), `got:\n${out}`);
  });

  it('contains <Parameter> for each setting key', () => {
    const out = formatABBCFG(ABB_BREAKER_ENTRY);
    assert.ok(out.includes('name="pickup"'), `got:\n${out}`);
    assert.ok(out.includes('name="instantaneous"'), `got:\n${out}`);
  });

  it('uses override value for pickup, not base value', () => {
    const out = formatABBCFG(ABB_BREAKER_ENTRY);
    // override is 125; base is 160
    assert.ok(out.includes('value="125"'), `got:\n${out}`);
    assert.ok(!out.includes('value="160"'), `should use override 125, got:\n${out}`);
  });

  it('escapes special XML characters in device name', () => {
    const entry = {
      ...ABB_BREAKER_ENTRY,
      baseDevice: { ...ABB_BREAKER_ENTRY.baseDevice, name: 'A <Test> & "Relay"' },
    };
    const out = formatABBCFG(entry);
    assert.ok(!out.includes('<Test>'), 'raw < should be escaped');
    assert.ok(out.includes('&lt;Test&gt;'), `got:\n${out}`);
  });
});

// ─── formatSiemensXRIO ────────────────────────────────────────────────────

describe('formatSiemensXRIO', () => {
  it('produces valid XML with <XRIO> root element', () => {
    const out = formatSiemensXRIO(SIEMENS_BREAKER_ENTRY);
    assert.ok(out.includes('<XRIO '), `got:\n${out}`);
    assert.ok(out.includes('</XRIO>'), `got:\n${out}`);
  });

  it('contains <Device> with correct id attribute', () => {
    const out = formatSiemensXRIO(SIEMENS_BREAKER_ENTRY);
    assert.ok(out.includes('id="siemens_3va_125"'), `got:\n${out}`);
  });

  it('contains <ParameterSet> section', () => {
    const out = formatSiemensXRIO(SIEMENS_BREAKER_ENTRY);
    assert.ok(out.includes('<ParameterSet'), `got:\n${out}`);
  });

  it('contains <Parameter> for each setting', () => {
    const out = formatSiemensXRIO(SIEMENS_BREAKER_ENTRY);
    assert.ok(out.includes('name="pickup"'), `got:\n${out}`);
    assert.ok(out.includes('name="time"'), `got:\n${out}`);
  });
});

// ─── formatNeutral ────────────────────────────────────────────────────────

describe('formatNeutral', () => {
  it('produces valid JSON', () => {
    const out = formatNeutral(UNKNOWN_VENDOR_ENTRY);
    assert.doesNotThrow(() => JSON.parse(out));
  });

  it('includes all required top-level keys', () => {
    const obj = JSON.parse(formatNeutral(UNKNOWN_VENDOR_ENTRY));
    ['version', 'standard', 'generated', 'device', 'settings', 'hash'].forEach(k => {
      assert.ok(k in obj, `missing key: ${k}`);
    });
  });

  it('settings field matches resolved settings', () => {
    const obj = JSON.parse(formatNeutral(UNKNOWN_VENDOR_ENTRY));
    assert.strictEqual(obj.settings.pickup, 100);
    assert.strictEqual(obj.settings.tms, 0.5);
  });

  it('hash field is 8-char hex', () => {
    const obj = JSON.parse(formatNeutral(UNKNOWN_VENDOR_ENTRY));
    assert.match(obj.hash, /^[0-9a-f]{8}$/);
  });
});

// ─── selectVendorFormat ───────────────────────────────────────────────────

describe('selectVendorFormat', () => {
  it('returns SEL format descriptor for SEL vendor', () => {
    const fmt = selectVendorFormat(SEL_RELAY_ENTRY);
    assert.ok(fmt, 'should return a format');
    assert.strictEqual(fmt.ext, 'set');
    assert.strictEqual(fmt.label, 'SEL SET');
  });

  it('returns GE format descriptor for GE vendor', () => {
    const fmt = selectVendorFormat(GE_RELAY_ENTRY);
    assert.strictEqual(fmt?.ext, 'urs');
    assert.strictEqual(fmt?.label, 'GE URS');
  });

  it('returns ABB format descriptor for ABB vendor', () => {
    const fmt = selectVendorFormat(ABB_BREAKER_ENTRY);
    assert.strictEqual(fmt?.ext, 'cfg');
    assert.strictEqual(fmt?.label, 'ABB CFG');
  });

  it('returns Siemens format descriptor for Siemens vendor', () => {
    const fmt = selectVendorFormat(SIEMENS_BREAKER_ENTRY);
    assert.strictEqual(fmt?.ext, 'xrio');
    assert.strictEqual(fmt?.label, 'Siemens XRIO');
  });

  it('returns null for unknown vendor', () => {
    assert.strictEqual(selectVendorFormat(UNKNOWN_VENDOR_ENTRY), null);
  });

  it('returns null for entry with no baseDevice', () => {
    assert.strictEqual(selectVendorFormat(CABLE_ENTRY), null);
  });
});

// ─── buildExportFiles ─────────────────────────────────────────────────────

describe('buildExportFiles', () => {
  const allEntries = [
    GE_RELAY_ENTRY, SEL_RELAY_ENTRY, ABB_BREAKER_ENTRY,
    SIEMENS_BREAKER_ENTRY, UNKNOWN_VENDOR_ENTRY, CABLE_ENTRY, NO_SETTINGS_ENTRY,
  ];

  it('skips non-settable entries (cables, empty settings)', () => {
    const { files } = buildExportFiles(allEntries);
    assert.ok(!files.some(f => f.filename.includes('Cable')));
    assert.ok(!files.some(f => f.filename.includes('Bare')));
  });

  it('produces one file per exportable entry', () => {
    const { files } = buildExportFiles(allEntries);
    // 5 settable: GE, SEL, ABB, Siemens, Unknown
    assert.strictEqual(files.length, 5);
  });

  it('manifest rows count equals file count', () => {
    const { files, manifestRows } = buildExportFiles(allEntries);
    assert.strictEqual(manifestRows.length, files.length);
  });

  it('GE entry gets .urs extension', () => {
    const { files } = buildExportFiles([GE_RELAY_ENTRY]);
    assert.ok(files[0].filename.endsWith('.urs'), `got: ${files[0].filename}`);
  });

  it('SEL entry gets .set extension', () => {
    const { files } = buildExportFiles([SEL_RELAY_ENTRY]);
    assert.ok(files[0].filename.endsWith('.set'), `got: ${files[0].filename}`);
  });

  it('ABB entry gets .cfg extension', () => {
    const { files } = buildExportFiles([ABB_BREAKER_ENTRY]);
    assert.ok(files[0].filename.endsWith('.cfg'), `got: ${files[0].filename}`);
  });

  it('Siemens entry gets .xrio extension', () => {
    const { files } = buildExportFiles([SIEMENS_BREAKER_ENTRY]);
    assert.ok(files[0].filename.endsWith('.xrio'), `got: ${files[0].filename}`);
  });

  it('unknown vendor falls back to .json neutral format', () => {
    const { files, warnings } = buildExportFiles([UNKNOWN_VENDOR_ENTRY]);
    assert.ok(files[0].filename.endsWith('.json'), `got: ${files[0].filename}`);
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes('Acme'));
  });

  it('manifest rows contain all required MANIFEST_HEADERS keys', () => {
    const { manifestRows } = buildExportFiles([GE_RELAY_ENTRY]);
    MANIFEST_HEADERS.forEach(h => {
      assert.ok(h in manifestRows[0], `missing manifest header: ${h}`);
    });
  });

  it('manifest row Settings Hash is 8-char hex', () => {
    const { manifestRows } = buildExportFiles([GE_RELAY_ENTRY]);
    assert.match(manifestRows[0]['Settings Hash'], /^[0-9a-f]{8}$/);
  });

  it('manifest row File Name matches files array filename', () => {
    const { files, manifestRows } = buildExportFiles([ABB_BREAKER_ENTRY]);
    assert.strictEqual(manifestRows[0]['File Name'], files[0].filename);
  });

  it('returns empty arrays for no-settable entries', () => {
    const { files, manifestRows, warnings } = buildExportFiles([CABLE_ENTRY, NO_SETTINGS_ENTRY]);
    assert.strictEqual(files.length, 0);
    assert.strictEqual(manifestRows.length, 0);
    assert.strictEqual(warnings.length, 0);
  });

  it('override values appear in exported content', () => {
    const { files } = buildExportFiles([ABB_BREAKER_ENTRY]);
    // ABB_BREAKER_ENTRY override pickup=125 (base was 160)
    assert.ok(files[0].content.includes('125'), `override value missing:\n${files[0].content}`);
    assert.ok(!files[0].content.includes('value="160"'), `base value should be overridden:\n${files[0].content}`);
  });
});

// ─── MANIFEST_HEADERS ─────────────────────────────────────────────────────

describe('MANIFEST_HEADERS', () => {
  it('exports the expected 8 columns', () => {
    assert.deepStrictEqual(MANIFEST_HEADERS, [
      'Device ID', 'Name', 'Vendor', 'Relay Model',
      'Settings Hash', 'File Name', 'Format', 'Warnings',
    ]);
  });
});

// ─── VENDOR_FORMATS registry ──────────────────────────────────────────────

describe('VENDOR_FORMATS registry', () => {
  it('has entries for all four supported vendors', () => {
    ['SEL', 'GE', 'ABB', 'Siemens'].forEach(v => {
      assert.ok(v in VENDOR_FORMATS, `missing vendor: ${v}`);
    });
  });

  it('each vendor format has format function, ext, and label', () => {
    Object.entries(VENDOR_FORMATS).forEach(([vendor, desc]) => {
      assert.strictEqual(typeof desc.format, 'function', `${vendor}.format not a function`);
      assert.ok(desc.ext, `${vendor} missing ext`);
      assert.ok(desc.label, `${vendor} missing label`);
    });
  });
});
