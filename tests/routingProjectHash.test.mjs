import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRoutingProjectHash } from '../src/routing/projectHash.mjs';

test('routing project hashes ignore derived route outputs', () => {
  const input = { cables: [{ name: 'C-1', start: [0, 0, 0], route_segments: [] }] };
  const routed = { cables: [{ voltage_drop_pct: 1.2, route_segments: [{ length: 20 }], start: [0, 0, 0], name: 'C-1' }] };

  assert.equal(computeRoutingProjectHash(input), computeRoutingProjectHash(routed));
});

test('routing project hashes change when a true input changes', () => {
  const first = { options: { fillLimit: 0.4 }, cables: [{ name: 'C-1' }] };
  const second = { cables: [{ name: 'C-1' }], options: { fillLimit: 0.5 } };

  assert.notEqual(computeRoutingProjectHash(first), computeRoutingProjectHash(second));
});
