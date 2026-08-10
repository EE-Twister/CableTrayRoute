import assert from 'node:assert/strict';
import {
  buildCustomCurveProfilesPayload,
  defaultCustomCurveVariantName,
  normalizeCustomCurveVariantRole,
  resolveCustomCurvePointHighlight
} from '../../analysis/tcc/customCurvePointEditorModel.mjs';

console.log('TCC custom curve point editor model');

{
  assert.equal(normalizeCustomCurveVariantRole(' CLEARING '), 'clearing');
  assert.equal(normalizeCustomCurveVariantRole('unknown'), 'standard');
  assert.equal(defaultCustomCurveVariantName(0, 'melting'), 'Melting curve');
  const profiles = buildCustomCurveProfilesPayload([{
    id: 'melt', role: 'melting', name: '', points: [{ current: 10, time: 1 }, { current: 20, time: 0.5 }]
  }]);
  assert.equal(profiles[0].name, 'Melting curve');
  assert.equal(profiles[0].role, 'melting');
  console.log('  ✓ preserves role normalization and profile labels');
}

{
  const resolved = resolveCustomCurvePointHighlight([
    { current: 20, time: 0.5 },
    { current: 10, time: 1 },
    { current: -1, time: 3 }
  ], { current: 20.0000001, time: 0.5 }, null);
  assert.deepEqual(resolved.points, [{ current: 10, time: 1 }, { current: 20, time: 0.5 }]);
  assert.deepEqual(resolved.lastCapturedPoint, { current: 20, time: 0.5 });
  console.log('  ✓ sanitizes, orders, and resolves the active point highlight');
}
