import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arcingCurrents, incidentEnergy, withinModelRange } from '../analysis/ieee1584.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a} (tol ${tol})`);

// IEEE 1584-2018 Annex D.1 — medium-voltage worked example (4.16 kV, VCB).
test('Annex D.1 medium-voltage example', () => {
  const params = { EC: 'VCB', Voc_kV: 4.16, Ibf_kA: 15, G_mm: 104, D_mm: 914.4 };
  const ac = arcingCurrents({ ...params, height_mm: 1143, width_mm: 762, depth_mm: 508 });

  close(ac.VarCF, 0.047, 5e-4, 'VarCF (D.43)');
  close(ac.EES, 36.316, 1e-2, 'EES (D.21)');
  close(ac.CF, 1.284, 1e-3, 'CF (D.22)');
  close(ac.full.perV[0.6], 11.117, 1e-2, 'I_arc_600 (D.9)');
  close(ac.full.perV[2.7], 12.816, 1e-2, 'I_arc_2700 (D.11)');
  close(ac.full.perV[14.3], 14.116, 1e-2, 'I_arc_14300 (D.13)');
  close(ac.full.iArc, 12.979, 1e-2, 'I_arc full (D.17)');
  close(ac.reduced.iArc, 12.675, 1e-2, 'I_arc reduced (D.51)');

  const full = incidentEnergy(params, ac, 'full', 0.197);
  close(full.E_J, 12.152, 1e-2, 'E full J/cm² (D.32)');
  close(full.AFB_mm, 1606, 2, 'AFB full mm (D.42)');

  const reduced = incidentEnergy(params, ac, 'reduced', 0.223);
  close(reduced.E_J, 13.343, 1e-2, 'E reduced J/cm² (D.62)');
  close(reduced.AFB_mm, 1704, 2, 'AFB reduced mm (D.72)');
});

// IEEE 1584-2018 Annex D.2 — low-voltage worked example (0.48 kV, VCB).
test('Annex D.2 low-voltage example', () => {
  const params = { EC: 'VCB', Voc_kV: 0.48, Ibf_kA: 45, G_mm: 32, D_mm: 609.6 };
  const ac = arcingCurrents({ ...params, height_mm: 610, width_mm: 610, depth_mm: 254 });

  close(ac.iArc600Full, 32.449, 1e-2, 'I_arc_600 (D.82)');
  close(ac.full.iArc, 28.793, 1e-2, 'I_arc full (D.84)');
  close(ac.EES, 24.016, 1e-2, 'EES (D.88)');
  close(ac.CF, 1.085, 1e-3, 'CF (D.89)');
  close(ac.VarCF, 0.247, 5e-4, 'VarCF (D.96)');
  close(ac.reduced.iArc, 25.244, 1e-2, 'I_arc reduced (D.99)');

  const full = incidentEnergy(params, ac, 'full', 0.0613);
  close(full.E_J, 11.585, 1e-2, 'E full J/cm² (D.91)');
  close(full.AFB_mm, 1029, 2, 'AFB full mm (D.95)');

  const reduced = incidentEnergy(params, ac, 'reduced', 0.319);
  close(reduced.E_J, 53.156, 2e-2, 'E reduced J/cm² (D.103)');
  close(reduced.AFB_mm, 2669, 3, 'AFB reduced mm (D.106)');

  // cal/cm² conversion sanity (53.156 J/cm² = 12.705 cal/cm²)
  close(reduced.E_cal, 12.705, 1e-2, 'E reduced cal/cm²');
});

test('withinModelRange flags out-of-range inputs', () => {
  assert.ok(withinModelRange({ Voc_kV: 0.48, Ibf_kA: 45, G_mm: 32, D_mm: 609.6 }).ok);
  assert.ok(!withinModelRange({ Voc_kV: 25, Ibf_kA: 45, G_mm: 32, D_mm: 609.6 }).ok);
  assert.ok(!withinModelRange({ Voc_kV: 0.48, Ibf_kA: 45, G_mm: 32, D_mm: 100 }).ok);
});
