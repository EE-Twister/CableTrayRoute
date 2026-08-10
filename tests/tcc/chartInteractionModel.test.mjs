import assert from 'node:assert/strict';
import {
  buildEquipmentOverlayAriaLabel,
  entryInteractiveKey,
  findNearestCurvePoint,
  formatHoverSettings,
  getHoverClientPoint
} from '../../analysis/tcc/chartInteractionModel.mjs';

console.log('TCC chart interaction model');

{
  const summary = formatHoverSettings({
    scaled: {
      settings: {
        pickup: 100,
        time: 0.3,
        instantaneousPickup: 1000,
        instantaneous: 900,
        curveProfileLabel: 'Cold'
      }
    }
  });
  assert.equal(summary, 'Pickup: 100 A | Delay: 0.3 s | INST: 1000 A | Curve: Cold');
  assert.equal(formatHoverSettings({}), 'Using device library settings');
  console.log('  ✓ preserves concise hover-setting summaries and instantaneous de-duplication');
}

{
  const curve = [
    { current: 100, time: 10 },
    { current: 1000, time: 1 },
    { current: 10000, time: 0.1 }
  ];
  assert.equal(findNearestCurvePoint(curve, 800), curve[1]);
  assert.equal(findNearestCurvePoint(curve, 0), null);
  assert.equal(findNearestCurvePoint([], 100), null);
  console.log('  ✓ preserves nearest-point selection in logarithmic current space');
}

{
  assert.deepEqual(getHoverClientPoint({ type: 'mousemove', clientX: 10, clientY: 20 }), {
    clientX: 10, clientY: 20
  });
  assert.deepEqual(getHoverClientPoint({
    type: 'focus',
    currentTarget: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 40 }) }
  }), { clientX: 60, clientY: 40 });
  assert.equal(getHoverClientPoint(null), null);
  console.log('  ✓ preserves pointer and keyboard-focus tooltip anchoring');
}

{
  assert.equal(entryInteractiveKey({ selection: { uid: 'selection' }, uid: 'entry' }), 'selection');
  assert.equal(entryInteractiveKey({ name: 'Curve' }), 'Curve');
  const label = buildEquipmentOverlayAriaLabel({
    sourceLabel: 'XFMR-1',
    targetLabel: 'MCC-1',
    name: 'Cable'
  }, {
    title: () => 'Cable Damage',
    rows: () => [{ label: 'Ampacity', value: '200 A' }]
  });
  assert.equal(label, 'Cable Damage, XFMR-1 to MCC-1, Ampacity: 200 A');
  console.log('  ✓ preserves stable interaction keys and accessible overlay summaries');
}
