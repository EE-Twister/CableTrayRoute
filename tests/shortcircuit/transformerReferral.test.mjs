/**
 * Fault current through a transformer: the utility (primary side) impedance
 * must be referred to the secondary voltage before it is added to the
 * transformer impedance. Without the (V_sec / V_pri)^2 factor a 500 MVA,
 * 13.8 kV utility behind a 1500 kVA transformer produced 0.75 kA at 480 V
 * instead of about 31 kA.
 */
import assert from 'node:assert';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const { setOneLine } = await import('../../dataStore.mjs');
const { runShortCircuit } = await import('../../analysis/shortCircuit.mjs');

function buildModel(kva, percentZ = 5.75, utilityMva = 500) {
  return {
    activeSheet: 0,
    sheets: [{
      name: 'Referral',
      components: [
        { id: 'source', type: 'utility_source', voltage: 13800, thevenin_mva: utilityMva, connections: [{ target: 'xf1', sourcePort: 0, targetPort: 0 }] },
        { id: 'xf1', type: 'transformer', subtype: 'two_winding', percent_secondary: percentZ, kva_secondary: kva, volts_primary: 13800, volts_secondary: 480, connections: [{ target: 'bus480', sourcePort: 1, targetPort: 0 }] },
        { id: 'bus480', type: 'bus', subtype: 'Bus' }
      ]
    }]
  };
}

// Hand calculation in ohms at 480 V; ANSI mode uses the default 1.05 prefault factor.
function expectedKA(kva, percentZ, utilityMva) {
  const zXfmr = (percentZ / 100) * (0.48 ** 2) / (kva / 1000);
  const zUtility = (0.48 ** 2) / utilityMva; // 13.8 kV chain referred to 480 V
  return (480 * 1.05) / (Math.sqrt(3) * (zXfmr + zUtility)) / 1000;
}

for (const [kva, pct, mva] of [[1500, 5.75, 500], [750, 5.75, 500], [2500, 6, 250]]) {
  setOneLine(buildModel(kva, pct, mva));
  const result = runShortCircuit().bus480;
  const expected = expectedKA(kva, pct, mva);
  const error = Math.abs(result.threePhaseKA - expected) / expected;
  assert(error < 0.03, `${kva} kVA ${pct}% behind ${mva} MVA: got ${result.threePhaseKA} kA, expected about ${expected.toFixed(2)} kA`);
  console.log(`  ✓ ${kva} kVA, ${pct}%, ${mva} MVA utility -> ${result.threePhaseKA} kA (hand ${expected.toFixed(2)})`);
}

// Two transformers in cascade: 13.8 kV -> 4.16 kV -> 480 V. Both upstream
// impedances must be referred through their own turns ratio.
setOneLine({ activeSheet: 0, sheets: [{ name: 'Cascade', components: [
  { id: 'src', type: 'utility_source', voltage: 13800, thevenin_mva: 500, connections: [{ target: 't1', sourcePort: 0, targetPort: 0 }] },
  { id: 't1', type: 'transformer', subtype: 'two_winding', percent_secondary: 6.5, kva_secondary: 5000, volts_primary: 13800, volts_secondary: 4160, connections: [{ target: 'mv', sourcePort: 1, targetPort: 0 }] },
  { id: 'mv', type: 'bus', subtype: 'Bus', connections: [{ target: 't2', sourcePort: 0, targetPort: 0 }] },
  { id: 't2', type: 'transformer', subtype: 'two_winding', percent_secondary: 5.75, kva_secondary: 1500, volts_primary: 4160, volts_secondary: 480, connections: [{ target: 'lv', sourcePort: 1, targetPort: 0 }] },
  { id: 'lv', type: 'bus', subtype: 'Bus' }
] }] });
{
  const result = runShortCircuit();
  const zUtility = (0.48 ** 2) / 500;
  const zT1 = 0.065 * (4.16 ** 2) / 5 * (0.48 / 4.16) ** 2;
  const zT2 = 0.0575 * (0.48 ** 2) / 1.5;
  const expected = (480 * 1.05) / (Math.sqrt(3) * (zUtility + zT1 + zT2)) / 1000;
  assert(Math.abs(result.lv.threePhaseKA - expected) / expected < 0.02,
    `cascade: got ${result.lv.threePhaseKA} kA, expected about ${expected.toFixed(2)} kA`);
  console.log(`  ✓ two-transformer cascade -> ${result.lv.threePhaseKA} kA (hand ${expected.toFixed(2)})`);
}

// Provenance reports the source impedance on the same (secondary) base as the total.
setOneLine(buildModel(1500));
const provenance = runShortCircuit().bus480.impedanceProvenance;
const summed = provenance.segments.reduce((acc, s) => ({ r: acc.r + s.rOhm, x: acc.x + s.xOhm }), { r: 0, x: 0 });
assert(Math.abs(summed.x - provenance.totalX) / provenance.totalX < 0.01, 'provenance segments must sum to the total reactance');
assert(Math.abs(summed.r - provenance.totalR) / provenance.totalR < 0.01, 'provenance segments must sum to the total resistance');
console.log('  ✓ impedance provenance segments sum to the reported total');
console.log('transformerReferral tests passed');
