import assert from 'assert';
import { calculateTransformerImpedance } from '../utils/transformerImpedance.js';
import { normalizeVoltageToVolts } from '../utils/voltage.js';
import {
  computeTransformerBaseKV,
  deriveTransformerBaseKV,
  resolveTransformerKva,
  resolveTransformerPercentZ,
  resolveTransformerXrRatio,
  syncTransformerDefaults
} from '../utils/transformerProperties.js';

const approxEqual = (a, b, tolerance = 1e-9) => {
  assert(Number.isFinite(a), `Expected finite value for comparison: ${a}`);
  assert(Number.isFinite(b), `Expected finite value for comparison: ${b}`);
  assert(Math.abs(a - b) <= tolerance, `Expected ${a} to equal ${b} within ±${tolerance}`);
};

// Test impedance calculation matches expected ohmic values for a typical transformer
{
  const impedance = calculateTransformerImpedance({ kva: 2500, percentZ: 6, voltageKV: 0.48, xrRatio: 10 });
  assert(impedance, 'Impedance should be calculated');
  approxEqual(Number(impedance.r.toFixed(6)), 0.00055, 1e-6);
  approxEqual(Number(impedance.x.toFixed(6)), 0.0055, 1e-5);
}

// Test property resolution utilities
{
  const transformer = {
    type: 'transformer',
    subtype: 'two_winding',
    kva: 2500,
    percent_z: 6,
    xr_ratio: 10,
    volts_secondary: 480,
    props: { volts_primary: 13800 }
  };
  const kva = resolveTransformerKva(transformer);
  const percent = resolveTransformerPercentZ(transformer);
  const xr = resolveTransformerXrRatio(transformer);
  const derivedBase = deriveTransformerBaseKV(transformer);
  const explicitBase = computeTransformerBaseKV({ ...transformer, baseKV: 0.48 });
  approxEqual(kva, 2500, 1e-9);
  approxEqual(percent, 6, 1e-9);
  approxEqual(xr, 10, 1e-9);
  approxEqual(derivedBase, 0.48, 1e-9);
  approxEqual(explicitBase, 0.48, 1e-9);
}

// Test syncTransformerDefaults applies baseKV and impedance
{
  const transformer = {
    type: 'transformer',
    subtype: 'two_winding',
    kva: 2500,
    percent_z: 6,
    xr_ratio: 10,
    volts_secondary: 480,
    props: { volts_primary: 13800 }
  };
  const result = syncTransformerDefaults(transformer, { forceBase: true });
  assert(result.baseKV && result.baseKV > 0, 'Base kV should be resolved');
  assert(transformer.baseKV === result.baseKV, 'Base kV should be written to component');
  assert(transformer.kV === result.baseKV, 'kV mirror should be updated');
  assert(transformer.prefault_voltage === result.baseKV, 'prefault voltage should match base');
  assert(transformer.impedance && Number.isFinite(transformer.impedance.r), 'Impedance.r should be numeric');
  assert(transformer.impedance && Number.isFinite(transformer.impedance.x), 'Impedance.x should be numeric');
}


// Explicit baseKV fields must be interpreted as kV values, not volts
{
  const transformer = {
    type: 'transformer',
    kva: 2500,
    percent_z: 6,
    xr_ratio: 10,
    baseKV: 15
  };
  const baseKV = computeTransformerBaseKV(transformer);
  approxEqual(baseKV, 15, 1e-9);

  const impedance = calculateTransformerImpedance({
    kva: 2500,
    percentZ: 6,
    xrRatio: 10,
    baseKV: 15
  });
  assert(impedance, 'Impedance should be calculated for explicit baseKV');
  approxEqual(Number(impedance.r.toFixed(6)), 0.53732, 1e-6);
  approxEqual(Number(impedance.x.toFixed(6)), 5.373201, 1e-6);
}


// Explicit unit-suffixed baseKV/prefault_voltage fields must be parsed with units
{
  const baseKV = computeTransformerBaseKV({ baseKV: '480 V' });
  approxEqual(baseKV, 0.48, 1e-9);

  const impedanceFromBase = calculateTransformerImpedance({
    kva: 2500,
    percentZ: 6,
    xrRatio: 10,
    baseKV: '480 V'
  });
  const impedanceFromPrefault = calculateTransformerImpedance({
    kva: 2500,
    percentZ: 6,
    xrRatio: 10,
    prefault_voltage: '480 V'
  });

  assert(impedanceFromBase, 'Impedance should be calculated for unit-suffixed baseKV');
  assert(impedanceFromPrefault, 'Impedance should be calculated for unit-suffixed prefault voltage');
  approxEqual(Number(impedanceFromBase.r.toFixed(6)), 0.00055, 1e-6);
  approxEqual(Number(impedanceFromBase.x.toFixed(6)), 0.0055, 1e-5);
  approxEqual(Number(impedanceFromPrefault.r.toFixed(6)), 0.00055, 1e-6);
  approxEqual(Number(impedanceFromPrefault.x.toFixed(6)), 0.0055, 1e-5);
}

// Scientific-notation voltage strings should normalize correctly in volts.
{
  const volts = normalizeVoltageToVolts('4.16e3 V');
  approxEqual(volts, 4160, 1e-9);
}

// Scientific-notation explicit baseKV/prefault_voltage strings should parse as numeric kV.
{
  const baseFromKV = computeTransformerBaseKV({ baseKV: '4.8e-1' });
  const baseFromPrefault = computeTransformerBaseKV({ prefault_voltage: '1.5e1' });
  approxEqual(baseFromKV, 0.48, 1e-9);
  approxEqual(baseFromPrefault, 15, 1e-9);

  const impedanceSci = calculateTransformerImpedance({
    kva: 2500,
    percentZ: 6,
    xrRatio: 10,
    baseKV: '4.8e-1'
  });
  const impedanceNumeric = calculateTransformerImpedance({
    kva: 2500,
    percentZ: 6,
    xrRatio: 10,
    baseKV: 0.48
  });
  assert(impedanceSci, 'Impedance should be calculated for scientific-notation baseKV');
  assert(impedanceNumeric, 'Impedance should be calculated for numeric baseKV');
  approxEqual(impedanceSci.r, impedanceNumeric.r, 1e-12);
  approxEqual(impedanceSci.x, impedanceNumeric.x, 1e-12);
}

// Unit-bearing voltage field names must guide numeric normalization.
{
  approxEqual(normalizeVoltageToVolts({ voltage_kv: 115 }), 115000, 1e-9);
  approxEqual(normalizeVoltageToVolts({ voltage_v: 13.8 }), 13.8, 1e-9);
  approxEqual(normalizeVoltageToVolts({ volts: 13.8 }), 13.8, 1e-9);
}
