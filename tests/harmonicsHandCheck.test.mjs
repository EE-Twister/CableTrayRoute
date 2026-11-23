/**
 * Harmonic distortion screening checked against hand calculations, plus the
 * spectrum-entry problems that used to produce a misleading 0% distortion.
 */
import assert from 'assert';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const { estimateHarmonicDistortion, parseSpectrum, runHarmonicsUnbalanced, runHarmonics } = await import('../analysis/harmonics.js');
const { parseHarmonicSpectrum } = await import('../analysis/harmonicNetwork.mjs');
const { setOneLine } = await import('../dataStore.mjs');

function it(name, fn) { fn(); console.log('  ✓', name); }

const V = 480;
const scMva = (Math.sqrt(3) * V * 30000) / 1e6; // 30 kA bus
const I1 = 500e3 / (Math.sqrt(3) * V * 0.9);
const spectrum = '5:20,7:14,11:9,13:7';
const orders = [[5, 0.2], [7, 0.14], [11, 0.09], [13, 0.07]];

it('current THD is the root-sum-square of the harmonic magnitudes', () => {
  const r = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum, shortCircuitMva: scMva });
  const expected = Math.sqrt(orders.reduce((s, [, p]) => s + p * p, 0)) * 100;
  assert(Math.abs(r.ithd - expected) < 0.01, `${r.ithd} vs ${expected}`);
});

it('voltage THD equals sum of (I_h x |R + j h X|) over the phase voltage', () => {
  const r = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum, shortCircuitMva: scMva, xrRatio: 10 });
  const z = (V * V) / (scMva * 1e6);
  const rs = z / Math.sqrt(101);
  const xs = 10 * rs;
  const sumSq = orders.reduce((s, [h, p]) => s + (I1 * p * Math.hypot(rs, h * xs)) ** 2, 0);
  const expected = (Math.sqrt(sumSq) / (V / Math.sqrt(3))) * 100;
  assert(Math.abs(r.vthd - expected) < 0.02, `${r.vthd} vs ${expected}`);
});

it('a capacitor near a characteristic harmonic amplifies voltage distortion', () => {
  const none = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum, shortCircuitMva: scMva }).vthd;
  const cap = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum, shortCircuitMva: scMva, capacitorBanks: [{ kvar: 300 }] }).vthd;
  assert(cap > 1.5 * none, `${cap} vs ${none}`);
});

it('percent signs and alternative separators are read, not silently dropped', () => {
  assert.deepStrictEqual(parseSpectrum('5:20%,7:14%'), { 5: 20, 7: 14 });
  assert.deepStrictEqual(parseSpectrum('5=20; 7=14'), { 5: 20, 7: 14 });
  assert.deepStrictEqual(parseHarmonicSpectrum('5:20%,7:14%'), { 5: 20, 7: 14 });
});

it('an empty or unreadable spectrum is flagged instead of reported as clean', () => {
  const empty = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum: '', shortCircuitMva: scMva });
  assert(empty.warnings?.some(w => /No harmonic spectrum/.test(w)));
  const garbled = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum: 'five twenty', shortCircuitMva: scMva });
  assert(garbled.warnings?.some(w => /could not be read/.test(w)));
});

it('fraction-style values (0.2 for 20%) are flagged', () => {
  const r = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum: '5:0.2,7:0.14', shortCircuitMva: scMva });
  assert(r.warnings?.some(w => /percent of the fundamental/.test(w)));
});

it('a valid spectrum produces no warnings', () => {
  const r = estimateHarmonicDistortion({ lineVoltageV: V, fundamentalCurrentA: I1, spectrum, shortCircuitMva: scMva });
  assert.strictEqual(r.warnings, undefined);
});

it('runHarmonics surfaces a spectrum problem as a required input', () => {
  setOneLine({ activeSheet: 0, sheets: [{ name: 'H', components: [
    { id: 'DRV', type: 'load', harmonicSource: true, voltage: 480, kw: 100, pf: 0.9, scMVA: 25, harmonics: '5:20%' },
    { id: 'BAD', type: 'load', harmonicSource: true, voltage: 480, kw: 100, pf: 0.9, scMVA: 25, harmonics: '' }
  ] }] });
  const r = runHarmonics();
  assert(r.DRV.ithd === 20, `percent-sign spectrum read as ${r.DRV.ithd}`);
  assert(r.DRV.requiredInputs.length === 0);
  assert(r.BAD.requiredInputs.some(m => /No harmonic spectrum/.test(m)));
});

it('triplen harmonics add arithmetically in the neutral (3 x 60% = 180% of phase current)', () => {
  setOneLine({ activeSheet: 0, sheets: [{ name: 'N', components: [
    { id: 'PC', type: 'load', harmonicSource: true, voltage: 480, kw: 100, pf: 0.9, scMVA: 25, harmonics: '3:60' }
  ] }] });
  const n = runHarmonicsUnbalanced().PC.neutral;
  assert(Math.abs(n.ithd_pct_of_phase - 180) < 0.1, `${n.ithd_pct_of_phase}`);
  assert.strictEqual(n.overload_warning, true);
  assert.strictEqual(n.dominant_order, 3);
});

console.log('harmonicsHandCheck tests passed');
