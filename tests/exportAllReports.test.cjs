const assert = require('node:assert/strict');
const { before, describe, it } = require('node:test');
const zlib = require('node:zlib');

const pdfLines = [];
const FAKE_PDF_BYTES = new TextEncoder().encode('%PDF-1.3 fake report');

class FakeJsPDF {
  setFontSize() {}
  addPage() {}
  addImage() {}
  text(line) { pdfLines.push(String(line)); }
  output() { return FAKE_PDF_BYTES.slice().buffer; }
}

const decoder = new TextDecoder();
const ZIP_DATE = new Date(2026, 10, 23, 14, 30, 10);

const EVALUATED = { present: true, eligible: true, validity: 'evaluated', freshness: 'current', label: 'Current saved result' };
const assessmentFor = (studyKey, overrides = {}) => ({ studyKey, ...EVALUATED, ...overrides });

/** Minimal stored-ZIP reader: walks EOCD -> central directory -> local headers and checks every CRC. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50, 'end of central directory signature');
  const count = view.getUint16(eocd + 10, true);
  assert.equal(view.getUint16(eocd + 8, true), count);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  assert.equal(centralOffset + centralSize, eocd, 'central directory ends at EOCD');
  const entries = new Map();
  let ptr = centralOffset;
  for (let i = 0; i < count; i += 1) {
    assert.equal(view.getUint32(ptr, true), 0x02014b50, 'central header signature');
    const method = view.getUint16(ptr + 10, true);
    const dosTime = view.getUint16(ptr + 12, true);
    const dosDate = view.getUint16(ptr + 14, true);
    const crc = view.getUint32(ptr + 16, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLength = view.getUint16(ptr + 28, true);
    const extraLength = view.getUint16(ptr + 30, true);
    const commentLength = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLength));
    assert.equal(method, 0, `${name} is stored`);
    assert.equal(compressedSize, size, `${name} stored size`);

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `${name} local header signature`);
    assert.equal(view.getUint16(localOffset + 8, true), 0);
    assert.equal(view.getUint16(localOffset + 10, true), dosTime);
    assert.equal(view.getUint16(localOffset + 12, true), dosDate);
    assert.equal(view.getUint32(localOffset + 14, true), crc);
    assert.equal(view.getUint32(localOffset + 18, true), size);
    assert.equal(view.getUint32(localOffset + 22, true), size);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    assert.equal(decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)), name);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const content = bytes.subarray(dataStart, dataStart + size);
    assert.equal(zlib.crc32(content), crc, `${name} CRC-32`);
    entries.set(name, { content, dosDate, dosTime });
    ptr += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(ptr, centralOffset + centralSize);
  return entries;
}

/** RFC 4180 reader for the exported CSVs (quoted cells may hold commas, quotes and JSON). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  const [headers, ...body] = rows;
  return { headers, rows: body.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i]]))) };
}

function csvFrom(zip, name) {
  const entry = zip.files[name];
  assert.ok(entry, `${name} is in the bundle (have: ${Object.keys(zip.files).join(', ')})`);
  return parseCsv(decoder.decode(entry.data));
}

describe('exportAll reports', () => {
  let buildReportZip;
  let setBranding;

  before(async () => {
    global.window = { jspdf: { jsPDF: FakeJsPDF } };
    ({ buildReportZip, setBranding } = await import('../reports/exportAll.mjs'));
  });

  it('builds zip with pdf, csv and labels', () => {
    setBranding({ title: 'Test', company: 'ACME' });
    const data = {
      equipment: [{ id: 'E1', name: 'Motor' }],
      analyses: { loadFlow: [{ id: 'B1', Vm: 1 }] },
      arcFlash: { BUS1: {
        incidentEnergy: 1,
        boundary: 2,
        equipmentTag: 'Main Switchboard',
        nominalVoltage: 480,
        workingDistance: 455,
        clearingTime: 0.1,
        upstreamDevice: 'CB-1',
        requiredInputs: []
      } }
    };
    const zip = buildReportZip(data);
    const files = Object.keys(zip.files);
    assert(files.includes('reports.pdf'));
    assert(files.includes('equipment_schedule.csv'));
    assert(files.includes('loadflow_analysis.csv'));
    assert(files.includes('Main_Switchboard.svg'));
  });

  it('sanitizes zip entry names derived from untrusted keys', () => {
    const data = {
      analyses: { '../../analysis_escape': [{ id: 'B1', Vm: 1 }] },
      arcFlash: { 'BUS/../../outside': {
        incidentEnergy: 1,
        boundary: 2,
        nominalVoltage: 480,
        workingDistance: 455,
        clearingTime: 0.1,
        upstreamDevice: 'CB-1',
        requiredInputs: []
      } }
    };
    const zip = buildReportZip(data);
    const files = Object.keys(zip.files);
    assert(files.includes('analysis_escape_analysis.csv'));
    assert(files.includes('BUS_._._outside.svg'));
    assert(!files.some(name => name.includes('..') || name.includes('/') || name.includes('\\')));
  });

  it('writes a valid stored ZIP whose entries, sizes and CRCs read back', async () => {
    const zip = buildReportZip({
      equipment: [{ id: 'E1', name: 'Motor, 50 hp "TEFC"' }],
      analyses: { loadFlow: [{ id: 'B1', Vm: 1 }] },
    });
    const bytes = await zip.generateAsync({ type: 'uint8array', date: ZIP_DATE });
    assert.ok(bytes instanceof Uint8Array);
    const entries = readZip(bytes);
    assert.deepEqual([...entries.keys()], ['reports.pdf', 'equipment_schedule.csv', 'loadflow_analysis.csv']);
    assert.deepEqual([...entries.get('reports.pdf').content], [...FAKE_PDF_BYTES]);
    assert.equal(decoder.decode(entries.get('equipment_schedule.csv').content), 'id,name\nE1,"Motor, 50 hp ""TEFC"""');
    const { dosDate, dosTime } = entries.get('reports.pdf');
    assert.deepEqual([(dosDate >> 9) + 1980, (dosDate >> 5) & 0x0f, dosDate & 0x1f], [2026, 11, 23]);
    assert.deepEqual([dosTime >> 11, (dosTime >> 5) & 0x3f, (dosTime & 0x1f) * 2], [14, 30, 10]);

    const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer', date: ZIP_DATE });
    assert.deepEqual(new Uint8Array(arrayBuffer), bytes);
    await assert.rejects(zip.generateAsync({ type: 'nodebuffer' }), /Unsupported ZIP output type/);
  });

  it('builds the bundle and zip without the Node Buffer global (browser runtime)', async () => {
    const data = {
      equipment: [{ id: 'E1', name: 'Motor' }],
      analyses: {
        voltageDropStudy: { results: [{ id: 'C1', tag: 'CBL-1', dropPct: 1.2 }], summary: { total: 1 } },
        shortCircuit: { BUS1: { threePhaseKA: 22 }, _meta: { method: 'ANSI' } },
      },
      studyAssessments: { voltageDropStudy: assessmentFor('voltageDropStudy') },
      arcFlash: { BUS1: {
        incidentEnergy: 1,
        boundary: 2,
        equipmentTag: 'Main Switchboard',
        nominalVoltage: 480,
        workingDistance: 455,
        clearingTime: 0.1,
        upstreamDevice: 'CB-1',
        requiredInputs: []
      } }
    };
    const savedBuffer = globalThis.Buffer;
    let bytes;
    let blob;
    let bufferVisible;
    try {
      delete globalThis.Buffer;
      bufferVisible = typeof Buffer !== 'undefined';
      const zip = buildReportZip(data);
      bytes = await zip.generateAsync({ type: 'uint8array', date: ZIP_DATE });
      blob = await zip.generateAsync({ type: 'blob', date: ZIP_DATE });
    } finally {
      globalThis.Buffer = savedBuffer;
    }
    assert.equal(bufferVisible, false, 'Buffer was removed for the browser simulation');
    const entries = readZip(bytes);
    assert.ok(entries.has('voltagedropstudy_analysis.csv'));
    assert.ok(entries.has('shortcircuit_analysis.csv'));
    assert.ok(entries.has('Main_Switchboard.svg'));
    assert.equal(blob.type, 'application/zip');
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  });

  it('expands voltage-drop results into rows, skips _ keys and serialises nested objects', () => {
    pdfLines.length = 0;
    const zip = buildReportZip({
      analyses: {
        voltageDropStudy: {
          results: [
            { id: 'C1', tag: 'CBL-1', dropPct: 1.2, inputSource: { voltage: 'Load flow' }, pathTags: ['CBL-0', 'CBL-1'], _internal: 'x' },
            { id: 'C2', tag: 'CBL-2', dropPct: 3.4, topologyWarning: 'ambiguous parent' },
          ],
          summary: { total: 2, evaluated: 2 },
          warnings: [],
          _runMetadata: { runAt: '2026-11-23T00:00:00Z' },
        },
      },
      studyAssessments: { voltageDropStudy: assessmentFor('voltageDropStudy') },
    });
    const csv = csvFrom(zip, 'voltagedropstudy_analysis.csv');
    assert.deepEqual(csv.rows.map(row => row.id), ['C1', 'C2']);
    assert.deepEqual(csv.rows.map(row => row.dropPct), ['1.2', '3.4']);
    assert.equal(csv.rows[0].inputSource, '{"voltage":"Load flow"}');
    assert.equal(csv.rows[0].pathTags, '["CBL-0","CBL-1"]');
    assert.ok(csv.headers.includes('topologyWarning'), 'column carried only by the second row is kept');
    assert.equal(csv.rows[1].topologyWarning, 'ambiguous parent');
    assert.ok(!csv.headers.some(header => header.startsWith('_')));
    assert.ok(!csv.headers.includes('results') && !csv.headers.includes('summary'));
    assert.equal(csv.rows[0].resultEligibility, 'eligible');
    const csvText = decoder.decode(zip.files['voltagedropstudy_analysis.csv'].data);
    assert.ok(!csvText.includes('[object Object]'));
    assert.ok(!pdfLines.some(line => line.includes('[object Object]')));
  });

  it('exports load-flow buses and branch flows as separate CSVs', () => {
    const zip = buildReportZip({
      analyses: {
        loadFlow: {
          converged: true,
          buses: [
            { id: 'B1', displayLabel: 'SWBD-1', Vm: 1, Va: 0 },
            { id: 'B2', displayLabel: 'MCC-1', Vm: 0.97, Va: -1.5, Pd: 120 },
          ],
          lines: [{ id: 'L1', from: 'B1', to: 'B2', amps: 145, dropBasis: { type: 'per-unit-terminal' } }],
          losses: { P: 1.1 },
        },
      },
      studyAssessments: { loadFlow: assessmentFor('loadFlow') },
    });
    const buses = csvFrom(zip, 'loadflow_analysis.csv');
    assert.deepEqual(buses.rows.map(row => row.id), ['B1', 'B2']);
    assert.equal(buses.rows[1].Va, '-1.5');
    assert.equal(buses.rows[1].Pd, '120');
    assert.ok(!buses.rows.some(row => ['buses', 'lines', 'converged', 'losses'].includes(row.id)));
    const lines = csvFrom(zip, 'loadflow_branch_flows_analysis.csv');
    assert.deepEqual(lines.rows.map(row => [row.id, row.from, row.to, row.amps]), [['L1', 'B1', 'B2', '145']]);
    assert.equal(lines.rows[0].dropBasis, '{"type":"per-unit-terminal"}');
    assert.equal(lines.rows[0].studyKey, 'loadFlow');
  });

  it('exports Motor Starting page results rows, not the saved object keys', () => {
    const zip = buildReportZip({
      analyses: {
        motorStart: {
          runAt: '2026-11-23T00:00:00Z',
          method: 'Thevenin screening',
          criteria: { maxVoltageSagPct: 15 },
          cases: [{ id: 'M1', hp: 100 }],
          results: [
            { id: 'M1', label: 'P-101', inrushKA: 0.84, voltageSagPct: 6.2, accelTime: 2.1, status: 'pass', checks: { voltageSag: true } },
            { id: 'M2', label: 'P-102', inrushKA: 1.4, voltageSagPct: 16.4, accelTime: 3, status: 'review' },
          ],
          startingKva: 812,
        },
      },
      studyAssessments: { motorStart: assessmentFor('motorStart') },
    });
    const csv = csvFrom(zip, 'motorstart_analysis.csv');
    assert.deepEqual(csv.rows.map(row => row.label), ['P-101', 'P-102']);
    assert.deepEqual(csv.rows.map(row => row.voltageSagPct), ['6.2', '16.4']);
    assert.deepEqual(csv.rows.map(row => row.status), ['pass', 'review']);
    assert.equal(csv.rows[0].checks, '{"voltageSag":true}');
    assert.ok(!csv.rows.some(row => ['runAt', 'method', 'criteria', 'cases', 'results'].includes(row.id)));
  });

  it('exports real Motor Starting engine output as eligible rows with calculated values', async () => {
    const { calculateMotorStartCase } = await import('../analysis/motorStartCalc.mjs');
    const zPerPhase = 480 / (Math.sqrt(3) * 30000);
    const motor = {
      id: 'M1', label: 'P-101', hp: 100, volts: 480, powerFactor: 0.88, efficiency: 0.94,
      inrushMultiple: 6, theveninR: zPerPhase / Math.sqrt(101), theveninX: 10 * zPerPhase / Math.sqrt(101),
      inertia: 5, speedRpm: 1800, type: 'dol',
    };
    const criteria = { maxVoltageSagPct: 15, maxAccelerationTimeSec: 10 };
    const cases = [motor, { ...motor, id: 'M2', label: 'P-102', type: 'wye_delta', wyeDeltaSwitchTimeSec: 5 }];
    const results = cases.map(input => calculateMotorStartCase(input, criteria));
    const zip = buildReportZip({
      analyses: { motorStart: { runAt: '2026-11-23T00:00:00Z', method: 'Thevenin screening', criteria, cases, results } },
      studyAssessments: { motorStart: assessmentFor('motorStart') },
    });
    const csv = csvFrom(zip, 'motorstart_analysis.csv');
    assert.deepEqual(csv.rows.map(row => row.label), ['P-101', 'P-102']);
    csv.rows.forEach((row, index) => {
      assert.equal(row.resultEligibility, 'eligible');
      assert.equal(row.inrushKA, String(results[index].inrushKA));
      assert.equal(row.voltageSagPct, String(results[index].voltageSagPct));
      assert.equal(row.fullLoadAmps, String(results[index].fullLoadAmps));
      assert.equal(row.status, results[index].status);
    });
  });

  it('exports one reliability row per component from componentStats', () => {
    const zip = buildReportZip({
      analyses: {
        reliability: {
          method: 'n-1',
          componentStats: { 'XFMR-1': { availability: 0.9999, downtime: 0.876 }, 'CB-1': { availability: 0.99995, downtime: 0.438 } },
          servicePoints: [{ id: 'SP-1' }],
          runMetadata: { ready: true },
        },
      },
    });
    const csv = csvFrom(zip, 'reliability_analysis.csv');
    assert.deepEqual(csv.rows.map(row => [row.id, row.availability, row.downtime]), [['XFMR-1', '0.9999', '0.876'], ['CB-1', '0.99995', '0.438']]);
  });

  it('keeps one row per id for map-shaped short-circuit, arc-flash and harmonics results', () => {
    const zip = buildReportZip({
      analyses: {
        shortCircuit: {
          BUS1: { threePhaseKA: 22.1, warnings: [] },
          MCC2: { threePhaseKA: null, requiredInputs: ['transformer impedance'], warnings: ['not evaluated - inputs incomplete'] },
          _meta: { method: 'ANSI', inputFingerprint: 'abc' },
        },
        arcFlash: {
          BUS1: { incidentEnergy: 4.2, ppeCategory: 1, details: { boxWidthMM: 508 } },
          _runMetadata: { resultCount: 1 },
        },
        harmonics: { BUS1: { ithd: 4.1, vthd: 2.2, limit: 5, warning: false } },
        _scenario: { name: 'base' },
      },
    });
    const sc = csvFrom(zip, 'shortcircuit_analysis.csv');
    assert.deepEqual(sc.rows.map(row => row.id), ['BUS1', 'MCC2']);
    assert.ok(sc.headers.includes('requiredInputs'), 'header union keeps per-bus required inputs');
    assert.equal(sc.rows[1].requiredInputs, '["transformer impedance"]');
    assert.equal(sc.rows[1].warnings, '["not evaluated - inputs incomplete"]');
    const af = csvFrom(zip, 'arcflash_analysis.csv');
    assert.deepEqual(af.rows.map(row => row.id), ['BUS1']);
    assert.equal(af.rows[0].details, '{"boxWidthMM":508}');
    const harmonics = csvFrom(zip, 'harmonics_analysis.csv');
    assert.deepEqual(harmonics.rows.map(row => [row.id, row.ithd, row.vthd]), [['BUS1', '4.1', '2.2']]);
    assert.ok(!Object.keys(zip.files).some(name => name.includes('scenario')));
  });

  it('withholds rows of a stale study instead of exporting them as current', () => {
    const zip = buildReportZip({
      analyses: {
        voltageDropStudy: { results: [{ id: 'C1', tag: 'CBL-1', dropPct: 4.21, status: 'fail' }] },
      },
      studyAssessments: {
        voltageDropStudy: assessmentFor('voltageDropStudy', { eligible: false, freshness: 'stale', label: 'Saved result is stale' }),
      },
    });
    const csv = csvFrom(zip, 'voltagedropstudy_analysis.csv');
    assert.equal(csv.rows.length, 1);
    const [row] = csv.rows;
    assert.equal(row.id, 'C1');
    assert.equal(row.tag, 'CBL-1', 'row identity survives withholding');
    assert.equal(row.dropPct, '—');
    assert.equal(row.status, 'not evaluated');
    assert.equal(row.resultEligibility, 'withheld');
  });

  it('uses the union of row keys for schedule headers', () => {
    const zip = buildReportZip({
      equipment: [{ id: 'E1', name: 'Motor' }, { id: 'E2', name: 'Pump', voltage: 480 }],
      cables: [{ tag: 'C1' }, { tag: 'C2', length: 95 }],
    });
    const equipment = csvFrom(zip, 'equipment_schedule.csv');
    assert.deepEqual(equipment.headers, ['id', 'name', 'voltage']);
    assert.deepEqual(equipment.rows.map(row => row.voltage), ['', '480']);
    const cables = csvFrom(zip, 'cable_schedule.csv');
    assert.deepEqual(cables.headers, ['tag', 'length']);
  });

  it('never overwrites an entry when two names sanitize to the same file', () => {
    const zip = buildReportZip({
      analyses: { 'a b': [{ id: 1 }], a_b: [{ id: 2 }] },
    });
    const files = Object.keys(zip.files);
    assert.ok(files.includes('a_b_analysis.csv'));
    assert.ok(files.includes('a_b_analysis_2.csv'));
  });
});
