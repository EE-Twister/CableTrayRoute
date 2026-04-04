/**
 * Tests for the studyApprovals data model functions in dataStore.mjs
 *
 * Covers:
 *   getStudyApprovals  — returns empty object by default
 *   setStudyApproval   — writes a keyed approval record
 *   setStudyApproval   — merges partial updates without destroying other fields
 *   clearStudyApproval — removes only the specified key
 *   Multiple studies   — stored independently under different keys
 *   getApprovalBadgeHTML — returns correct badge markup for each status
 */

import assert from 'assert';

// ── localStorage stub for Node.js ────────────────────────────────────────────

const store = {};
const localStorageStub = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: key => { delete store[key]; },
};
global.localStorage = localStorageStub;

// Import after stub is in place so dataStore picks it up
const {
  getStudyApprovals,
  setStudyApproval,
  clearStudyApproval,
} = await import('../dataStore.mjs');

// Import badge helper from component (no DOM needed — pure string function)
const { getApprovalBadgeHTML } = await import('../src/components/studyApproval.js');

// ── Test helpers ──────────────────────────────────────────────────────────────

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

function resetStore() {
  Object.keys(store).forEach(k => delete store[k]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getStudyApprovals', () => {
  it('returns an empty object when nothing has been stored', () => {
    resetStore();
    const approvals = getStudyApprovals();
    assert.deepStrictEqual(approvals, {});
  });
});

describe('setStudyApproval', () => {
  it('stores a full approval record under the correct key', () => {
    resetStore();
    const record = {
      status: 'approved',
      reviewedBy: 'J. Smith PE',
      approvedAt: '2026-04-04',
      note: 'Results verified.',
    };
    setStudyApproval('arcFlash', record);
    const all = getStudyApprovals();
    assert.deepStrictEqual(all['arcFlash'], record);
  });

  it('stores a second study independently from the first', () => {
    resetStore();
    setStudyApproval('arcFlash',    { status: 'approved', reviewedBy: 'A', approvedAt: '2026-04-01', note: '' });
    setStudyApproval('loadFlow',    { status: 'flagged',  reviewedBy: 'B', approvedAt: '2026-04-02', note: 'Check' });
    setStudyApproval('shortCircuit',{ status: 'pending',  reviewedBy: '',  approvedAt: '2026-04-03', note: '' });

    const all = getStudyApprovals();
    assert.strictEqual(all['arcFlash'].status,     'approved');
    assert.strictEqual(all['loadFlow'].status,      'flagged');
    assert.strictEqual(all['shortCircuit'].status,  'pending');
    assert.strictEqual(Object.keys(all).length, 3);
  });

  it('merges a partial update without destroying existing fields', () => {
    resetStore();
    setStudyApproval('tcc', { status: 'pending', reviewedBy: 'X', approvedAt: '2026-04-01', note: 'Initial' });
    // Update only note — other fields must survive
    setStudyApproval('tcc', { note: 'Updated note' });
    const all = getStudyApprovals();
    assert.strictEqual(all['tcc'].status,     'pending');
    assert.strictEqual(all['tcc'].reviewedBy, 'X');
    assert.strictEqual(all['tcc'].note,       'Updated note');
  });

  it('overwrites an existing record when given a full object', () => {
    resetStore();
    setStudyApproval('harmonics', { status: 'flagged', reviewedBy: 'Old', approvedAt: '2026-01-01', note: '' });
    setStudyApproval('harmonics', { status: 'approved', reviewedBy: 'New', approvedAt: '2026-04-04', note: 'OK' });
    const all = getStudyApprovals();
    assert.strictEqual(all['harmonics'].status,     'approved');
    assert.strictEqual(all['harmonics'].reviewedBy, 'New');
  });
});

describe('clearStudyApproval', () => {
  it('removes only the specified study key', () => {
    resetStore();
    setStudyApproval('arcFlash', { status: 'approved', reviewedBy: 'A', approvedAt: '2026-04-04', note: '' });
    setStudyApproval('loadFlow', { status: 'pending',  reviewedBy: '',  approvedAt: '2026-04-04', note: '' });

    clearStudyApproval('arcFlash');

    const all = getStudyApprovals();
    assert.ok(!('arcFlash' in all),  'arcFlash should be removed');
    assert.ok('loadFlow' in all,     'loadFlow should still exist');
  });

  it('is a no-op when the key does not exist', () => {
    resetStore();
    assert.doesNotThrow(() => clearStudyApproval('nonexistent'));
    // Nothing was stored, so approvals should still be empty
    const all = getStudyApprovals();
    assert.ok(!('nonexistent' in all), 'nonexistent key should not appear');
  });
});

describe('getApprovalBadgeHTML', () => {
  it('returns a pending badge when approval is null', () => {
    const html = getApprovalBadgeHTML(null);
    assert.ok(html.includes('approval-badge--pending'), 'Should have pending class');
    assert.ok(html.includes('Pending'), 'Should contain "Pending"');
  });

  it('returns a pending badge when status is pending', () => {
    const html = getApprovalBadgeHTML({ status: 'pending', reviewedBy: '', approvedAt: '', note: '' });
    assert.ok(html.includes('approval-badge--pending'));
  });

  it('returns an approved badge with reviewer name and date', () => {
    const html = getApprovalBadgeHTML({
      status: 'approved',
      reviewedBy: 'J. Smith PE',
      approvedAt: '2026-04-04',
      note: '',
    });
    assert.ok(html.includes('approval-badge--approved'), 'Should have approved class');
    assert.ok(html.includes('Approved by PE'),           'Should label as Approved by PE');
    assert.ok(html.includes('J. Smith PE'),              'Should include reviewer name');
    assert.ok(html.includes('2026-04-04'),               'Should include date');
  });

  it('returns a flagged badge', () => {
    const html = getApprovalBadgeHTML({ status: 'flagged', reviewedBy: 'B', approvedAt: '2026-04-04', note: '' });
    assert.ok(html.includes('approval-badge--flagged'));
    assert.ok(html.includes('Flagged'));
  });

  it('escapes HTML in reviewer name to prevent XSS', () => {
    const html = getApprovalBadgeHTML({
      status: 'approved',
      reviewedBy: '<script>alert(1)</script>',
      approvedAt: '2026-04-04',
      note: '',
    });
    assert.ok(!html.includes('<script>'), 'Raw <script> tag must not appear in output');
    assert.ok(html.includes('&lt;script&gt;'), 'Should be HTML-escaped');
  });
});
