import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScheduleCollectionCache } from '../src/one-line/scheduleCollectionCache.js';

describe('One-Line schedule collection cache', () => {
  it('reads each schedule once per render and keys the resulting collections', () => {
    const calls = [];
    const reader = key => () => {
      calls.push(key);
      return [{ id: key }];
    };
    const cache = createScheduleCollectionCache({
      getEquipment: reader('equipment'),
      getPanels: reader('panel'),
      getLoads: reader('load'),
      getCables: reader('cable'),
    });
    assert.deepEqual(calls, ['equipment', 'panel', 'load', 'cable']);
    assert.deepEqual(cache.get('equipment'), [{ id: 'equipment' }]);
    assert.deepEqual(cache.get('cable'), [{ id: 'cable' }]);
  });
});
