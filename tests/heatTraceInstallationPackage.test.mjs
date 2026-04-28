import assert from 'assert';
import { runHeatTraceSizingAnalysis } from '../analysis/heatTraceSizing.mjs';
import {
  buildHeatTraceBOM,
  buildHeatTraceControllerSchedule,
  buildHeatTraceInstallationPackage,
  buildHeatTraceLineList,
  renderHeatTraceInstallationPackageHTML,
  selectHeatTraceProductFamily,
} from '../analysis/heatTraceInstallationPackage.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const baseInputs = {
  pipeNps: '1',
  insulationThicknessIn: 1,
  insulationType: 'mineralWool',
  lineLengthFt: 150,
  maintainTempC: 4.4,
  ambientTempC: -23.3,
  windSpeedMph: 5,
  safetyMarginPct: 15,
  maxCircuitLengthFt: 300,
  pipeMaterial: 'carbonSteel',
  environment: 'outdoor-sheltered',
  voltageV: 240,
  heatTraceCableType: 'selfRegulating',
};

function makeCase(name, inputOverrides = {}, metadata = {}) {
  const inputs = { ...baseInputs, ...inputOverrides };
  const result = runHeatTraceSizingAnalysis(inputs);
  return {
    id: name.toLowerCase(),
    name,
    unitSystem: 'imperial',
    inputs,
    result,
    loadAmps: result.installedLoadAmps,
    createdAt: '2026-04-26T12:00:00.000Z',
    updatedAt: '2026-04-26T12:30:00.000Z',
    ...metadata,
  };
}

describe('heat trace product selection', () => {
  it('matches cable type, voltage, and watt density to a vendor-neutral family', () => {
    const selection = selectHeatTraceProductFamily({
      heatTraceCableType: 'selfRegulating',
      voltageV: 240,
      selectedWPerFt: 8,
      effectiveTraceLengthFt: 100,
      environment: 'outdoor-sheltered',
    });
    assert.strictEqual(selection.familyId, 'sr-industrial');
    assert.strictEqual(selection.status, 'compatible');
    assert.strictEqual(selection.selectedRatingWPerFt, 8);
  });

  it('flags incompatible voltage, unsupported type, over length, and hazardous verification', () => {
    const badVoltage = selectHeatTraceProductFamily({
      heatTraceCableType: 'powerLimiting',
      voltageV: 480,
      selectedWPerFt: 10,
      effectiveTraceLengthFt: 100,
      environment: 'outdoor-sheltered',
    });
    assert.strictEqual(badVoltage.status, 'verify');
    assert.ok(badVoltage.warnings.some(item => item.includes('480 V')));

    const unsupported = selectHeatTraceProductFamily({
      heatTraceCableType: 'steamTrace',
      voltageV: 120,
      selectedWPerFt: 10,
      effectiveTraceLengthFt: 100,
    });
    assert.strictEqual(unsupported.status, 'incompatible');

    const overLengthHazard = selectHeatTraceProductFamily({
      heatTraceCableType: 'constantWattage',
      voltageV: 240,
      selectedWPerFt: 10,
      effectiveTraceLengthFt: 600,
      environment: 'hazardous-area',
    });
    assert.strictEqual(overLengthHazard.status, 'verify');
    assert.ok(overLengthHazard.warnings.some(item => item.includes('exceeds')));
    assert.ok(overLengthHazard.warnings.some(item => item.includes('Hazardous-area')));
  });
});

describe('heat trace installation package', () => {
  it('normalizes legacy branches with blank construction metadata', () => {
    const lineList = buildHeatTraceLineList([makeCase('HT-1')]);
    assert.strictEqual(lineList.rows.length, 1);
    assert.strictEqual(lineList.rows[0].pipeTag, 'HT-1');
    assert.strictEqual(lineList.rows[0].sourcePanel, 'Unassigned');
    assert.strictEqual(lineList.rows[0].controllerTag, 'Unassigned');
  });

  it('builds controller schedule totals grouped by source and controller', () => {
    const first = makeCase('HT-1', {}, {
      pipeTag: 'P-101',
      sourcePanel: 'HTP-1',
      controllerTag: 'HTC-1',
      circuitNumber: '1',
    });
    const second = makeCase('HT-2', { lineLengthFt: 75 }, {
      pipeTag: 'P-102',
      sourcePanel: 'HTP-1',
      controllerTag: 'HTC-1',
      circuitNumber: '2',
    });
    const lineList = buildHeatTraceLineList([first, second]);
    const schedule = buildHeatTraceControllerSchedule(lineList.rows);
    assert.strictEqual(schedule.rows.length, 1);
    assert.strictEqual(schedule.rows[0].branchCount, 2);
    assert.strictEqual(schedule.rows[0].sourcePanel, 'HTP-1');
    assert.strictEqual(schedule.rows[0].controllerTag, 'HTC-1');
    assert.strictEqual(schedule.rows[0].circuitNumbers, '1, 2');
  });

  it('counts branch accessories, component kits, labels, controllers, and overrides', () => {
    const branch = makeCase('HT-Components', {
      componentAllowances: [
        { type: 'valve', label: 'Valve', quantity: 2, equivalentLengthFtEach: 5 },
        { type: 'instrumentTap', label: 'Analyzer tap', quantity: 1, equivalentLengthFtEach: 2 },
      ],
    }, {
      pipeTag: 'P-201',
      sourcePanel: 'HTP-2',
      controllerTag: 'HTC-2',
      accessoryOverrides: { spliceKit: 1 },
    });
    const lineList = buildHeatTraceLineList([branch]);
    const bom = buildHeatTraceBOM(lineList.rows);
    const byId = Object.fromEntries(bom.rows.map(row => [row.itemId, row]));
    assert.strictEqual(byId.powerConnection.quantity, 1);
    assert.strictEqual(byId.endSeal.quantity, 1);
    assert.strictEqual(byId.labelTag.quantity, 1);
    assert.strictEqual(byId.controller.quantity, 1);
    assert.strictEqual(byId.rtdSensor.quantity, 1);
    assert.strictEqual(byId.valveKit.quantity, 2);
    assert.strictEqual(byId.teeKit.quantity, 1);
    assert.strictEqual(byId.spliceKit.quantity, 1);
  });

  it('builds package JSON payload and escapes user content in HTML', () => {
    const branch = makeCase('<img src=x onerror=alert(1)>', {}, {
      pipeTag: '<script>alert(1)</script>',
      service: '<b>Freeze</b>',
      sourcePanel: 'HTP<&>',
      controllerTag: 'HTC<&>',
      installationNotes: '<svg onload=alert(2)>',
    });
    const pkg = buildHeatTraceInstallationPackage({
      circuitCases: [branch],
      approval: { status: 'approved', reviewedBy: 'PE-1' },
      projectName: '<b>Demo</b>',
    });
    assert.strictEqual(pkg.version, 'heat-trace-installation-package-v1');
    assert.strictEqual(pkg.lineList.rows.length, 1);
    assert.strictEqual(pkg.controllerSchedule.rows.length, 1);
    assert.ok(pkg.bom.rows.length >= 5);
    assert.ok(pkg.assumptions.some(item => item.includes('Vendor-neutral')));
    assert.strictEqual(pkg.approval.status, 'approved');

    const html = renderHeatTraceInstallationPackageHTML(pkg);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<b>Demo</b>'));
    assert.ok(!html.includes('<svg onload=alert(2)>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;b&gt;Demo&lt;/b&gt;'));
    assert.ok(html.includes('&lt;svg onload=alert(2)&gt;'));
  });
});
