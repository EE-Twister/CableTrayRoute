import assert from 'node:assert/strict';
import {
  EQUIPMENT_SCREENING_CAVEAT,
  formatEquipmentConstraintCheck
} from '../../analysis/tcc/equipmentConstraintPresentationModel.mjs';

const formatSeconds = value => Number.isFinite(value) ? value.toFixed(2) : 'unknown';
const formatCurrent = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'unknown';
const format = evaluation => formatEquipmentConstraintCheck(evaluation, { formatSeconds, formatCurrent });

console.log('TCC equipment constraint presentation model');

{
  const check = format({
    kind: 'rideThrough',
    status: 'review',
    screeningStatus: 'unknown',
    reason: 'curve-domain-incomplete',
    tripTime: null,
    margin: null,
    coverage: {
      requiredCurrentRangeA: { minimumCurrentA: 100, maximumCurrentA: 2000 },
      availableCurrentRangeA: { minimumCurrentA: 100, maximumCurrentA: 1000 },
      evaluatedCurrentRangeA: null
    },
    overlay: { kind: 'motorStart', sourceLabel: 'M-1' }
  });
  assert.equal(check.status, 'warning');
  assert.equal(check.screeningStatus, 'unknown');
  assert.equal(check.reason, 'curve-domain-incomplete');
  assert.match(check.detail, /Available protective-curve range: 100–1,000 A\./);
  assert.match(check.detail, /No current interval was evaluated\./);
  assert.match(check.detail, /No trip time or margin is reported\./);
  assert.doesNotMatch(check.detail, /(?:trip time|margin)\s+(?:unknown|NaN)/i);
  console.log('  ✓ reports unknown coverage without inventing trip time or margin');
}

{
  const check = format({
    kind: 'damageLimit',
    status: 'review',
    screeningStatus: 'unknown',
    associationReason: 'ambiguous_nearest_upstream_devices',
    overlay: { kind: 'cable', sourceLabel: 'Cable A' }
  });
  assert.equal(check.screeningStatus, 'unknown');
  assert.match(check.detail, /more than one nearest-upstream device/);
  assert.doesNotMatch(check.detail, /clears before|worst margin/i);
  console.log('  ✓ keeps ambiguous equipment association in review');
}

{
  const check = format({
    kind: 'damageLimit',
    status: 'ok',
    screeningStatus: 'evaluated',
    margin: 0.25,
    point: { current: 1000 },
    overlay: { kind: 'cable' }
  });
  assert.match(check.detail, /Plotted upper protective curve is at or below the cable damage reference/);
  assert.match(check.detail, /0\.25 s/);
  assert.match(EQUIPMENT_SCREENING_CAVEAT, /do not verify device clearing time or complete protection/);
  console.log('  ✓ describes the upper curve reference comparison without claiming device clearing');
}

{
  const check = format({
    kind: 'damageLimit',
    status: 'ok',
    screeningStatus: 'evaluated',
    margin: 0,
    point: { current: 1000 },
    overlay: { kind: 'cable' }
  });
  assert.match(check.detail, /is at or below the cable damage reference; margin 0\.00 s/);
  assert.doesNotMatch(check.detail, /stays below/i);
  console.log('  ✓ describes zero margin as meeting the inclusive reference boundary');
}
