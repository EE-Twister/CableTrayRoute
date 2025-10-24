import assert from 'assert';
import { calculateTransformerImpedance } from '../utils/transformerImpedance.js';
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
