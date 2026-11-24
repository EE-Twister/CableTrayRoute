import assert from 'node:assert/strict';
import { computeApproachDistances } from '../analysis/arcFlash.mjs';
import { buildArcFlashLabelData, withUnitHeaders } from '../reports/arcFlashReport.mjs';
import { generateArcFlashLabel } from '../reports/labels.mjs';

// NFPA 70E-2024 Table 130.4(E)(a): limited (exposed fixed part) and
// restricted approach boundaries, in mm from the printed ft/in values.
const expected = [
  [120, 1067, null],
  [480, 1067, 305],
  [4160, 1067, 635],
  [12470, 1524, 660],
  [34500, 1829, 787],
  [46000, 2438, 864],
  [69000, 2438, 1016],
];
for (const [volts, limited, restricted] of expected) {
  assert.deepEqual(computeApproachDistances(volts), { limited, restricted }, `${volts} V`);
}
assert.deepEqual(computeApproachDistances(5000.5), { limited: 1524, restricted: 660 }, 'fractional volts fall in a row');
assert.deepEqual(computeApproachDistances(100000), { limited: null, restricted: null }, 'above the modelled range');
assert.deepEqual(computeApproachDistances(48), { limited: null, restricted: null });

const base = {
  equipmentTag: 'SWGR-1', incidentEnergy: 8.5, boundary: 1218.5, workingDistance: 914,
  clearingTime: 0.1, upstreamDevice: 'BKR-1', limitedApproach: 1524, restrictedApproach: 660,
};
const at12kV = buildArcFlashLabelData('swgr-1', { ...base, nominalVoltage: 12470 });
assert.equal(at12kV.voltage, '12.47 kV', 'exact system voltage, not 12.5 kV');
assert.equal(buildArcFlashLabelData('x', { ...base, nominalVoltage: 24940 }).voltage, '24.94 kV');
assert.equal(buildArcFlashLabelData('x', { ...base, nominalVoltage: 480 }).voltage, '480 V');
assert.equal(at12kV.workingDistance, '3 ft (914 mm)', '914 mm is 36.0 in, not "2 ft 12 in"');
assert.equal(at12kV.arcFlashBoundary, '4 ft (1219 mm)', '1218.5 mm rounds to 48.0 in = 4 ft');
assert.doesNotMatch(JSON.stringify(at12kV), /12 in\b/, 'no "12 in" carry anywhere on the label');

const svg = generateArcFlashLabel({ equipmentTag: 'PNL-$$1' });
assert.ok(svg.includes('PNL-$$1'), '"$$" in a tag is printed literally, not collapsed to "$"');
assert.ok(!svg.includes('{{equipmentTag}}'), 'the placeholder is replaced');

const unitTable = withUnitHeaders(['bus', 'incidentEnergy', 'boundary', 'clearingTime'], [{ bus: 'B1', incidentEnergy: 3.8, boundary: 1067, clearingTime: 0.1 }]);
assert.deepEqual(unitTable.headers, ['bus', 'incidentEnergy (cal/cm²)', 'boundary (mm)', 'clearingTime (s)']);
assert.deepEqual(unitTable.rows, [{ bus: 'B1', 'incidentEnergy (cal/cm²)': 3.8, 'boundary (mm)': 1067, 'clearingTime (s)': 0.1 }]);

console.log('arc flash label formatting tests passed');
