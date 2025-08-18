const assert = require('assert');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
  }
}

(async () => {
  const { buildSegmentRows, buildSummaryRows } = await import('../resultsExport.mjs');

  describe('buildSegmentRows', () => {
    it('creates rows with cumulative length and reasons', () => {
      const results = [{
        cable: 'C1',
        total_length: 10,
        field_length: 4,
        segments_count: 2,
        breakdown: [
          { length: 3, tray_id: 'T1', type: 'tray' },
          { length: 7, conduit_id: '1', ductbankTag: 'DB1', type: 'field' }
        ],
        exclusions: [{ reason: 'over_capacity' }, { reason: 'group_mismatch' }]
      }];
      const rows = buildSegmentRows(results);
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].cumulative_length, 3);
      assert.strictEqual(rows[1].cumulative_length, 10);
      assert.strictEqual(rows[0].reason_codes, 'over_capacity; group_mismatch');
      assert.strictEqual(rows[1].element_type, 'conduit');
      assert.strictEqual(rows[1].element_id, 'DB1:1');
    });
  });

  describe('buildSummaryRows', () => {
    it('summarizes cables', () => {
      const results = [{
        cable: 'C1',
        total_length: 10,
        field_length: 4,
        segments_count: 2,
        exclusions: [{ reason: 'over_capacity' }]
      }];
      const rows = buildSummaryRows(results);
      assert.deepStrictEqual(rows[0], {
        cable_tag: 'C1',
        total_length: 10,
        field_length: 4,
        segments_count: 2,
        reason_codes: 'over_capacity'
      });
    });
  });
})();
