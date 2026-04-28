import assert from 'node:assert/strict';
import {
  MAX_FIELD_ATTACHMENT_BYTES,
  buildFieldCommissioningPackage,
  createFieldObservation,
  normalizeFieldObservation,
  renderFieldCommissioningHTML,
  summarizeFieldObservations,
  updateFieldObservationStatus,
} from '../analysis/fieldCommissioning.mjs';

function makeStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key(index) { return [...store.keys()][index] || null; },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

global.localStorage = makeStorage();
const dataStore = await import('../dataStore.mjs');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('field commissioning helpers', () => {
  it('normalizes legacy storage to empty field observation arrays', () => {
    assert.deepEqual(dataStore.getFieldObservations(), []);
    assert.deepEqual(dataStore.getOpenFieldObservations(), []);
  });

  it('normalizes observations with target metadata and defaults', () => {
    const row = normalizeFieldObservation({
      elementType: 'cable',
      elementId: 'C-101',
      elementTag: 'C-101 <main>',
      observationType: 'punch',
      comments: 'Label missing',
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    assert.equal(row.version, 'field-commissioning-v1');
    assert.equal(row.elementType, 'cable');
    assert.equal(row.elementId, 'C-101');
    assert.equal(row.status, 'open');
    assert.equal(row.priority, 'medium');
    assert.equal(row.comments, 'Label missing');
  });

  it('creates field observations from target/checklist/attachment inputs', () => {
    const observation = createFieldObservation({
      target: { elementType: 'tray', elementId: 'TR-1', elementTag: 'Tray <1>' },
      observationType: 'verification',
      status: 'verified',
      priority: 'low',
      author: 'F. Tech',
      checklist: [{ label: 'Installed matches schedule', checked: true }],
      attachments: [{ name: 'photo.jpg', type: 'image/jpeg', sizeBytes: 1024 }],
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    assert.equal(observation.elementType, 'tray');
    assert.equal(observation.status, 'verified');
    assert.equal(observation.checklist[0].checked, true);
    assert.equal(observation.attachments[0].name, 'photo.jpg');
    assert.equal(observation.resolvedAt, '2026-04-27T10:00:00.000Z');
  });

  it('updates status deterministically without mutating the original record', () => {
    const original = createFieldObservation({
      target: { elementType: 'equipment', elementId: 'MCC-1' },
      status: 'open',
      comments: 'Door label damaged',
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const updated = updateFieldObservationStatus(original, {
      status: 'resolved',
      updatedAt: '2026-04-27T11:00:00.000Z',
    });
    assert.equal(original.status, 'open');
    assert.equal(updated.status, 'resolved');
    assert.equal(updated.resolvedAt, '2026-04-27T11:00:00.000Z');
  });

  it('summarizes open, verified, rejected, pending review, priority, and attachment counts', () => {
    const rows = [
      createFieldObservation({ target: { elementType: 'cable', elementId: 'C-1' }, status: 'open', priority: 'high' }),
      createFieldObservation({ target: { elementType: 'cable', elementId: 'C-2' }, status: 'pendingReview' }),
      createFieldObservation({ target: { elementType: 'tray', elementId: 'TR-1' }, status: 'verified', attachments: [{ name: 'a.jpg', sizeBytes: 10 }] }),
      createFieldObservation({ target: { elementType: 'equipment', elementId: 'MCC-1' }, status: 'rejected', priority: 'critical' }),
    ];
    const summary = summarizeFieldObservations(rows);
    assert.equal(summary.total, 4);
    assert.equal(summary.open, 1);
    assert.equal(summary.pendingReview, 1);
    assert.equal(summary.verified, 1);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.highPriority, 2);
    assert.equal(summary.attachmentCount, 1);
  });

  it('builds packages with open items, warnings, assumptions, and escaped HTML', () => {
    const pkg = buildFieldCommissioningPackage({
      projectName: 'North Unit',
      generatedAt: '2026-04-27T12:00:00.000Z',
      observations: [
        createFieldObservation({
          target: { elementType: 'cable', elementId: 'C-1', elementTag: 'Cable <1>' },
          observationType: 'punch',
          status: 'open',
          priority: 'high',
          comments: 'Damaged tag <replace>',
          createdAt: '2026-04-27T10:00:00.000Z',
        }),
      ],
    });
    assert.equal(pkg.summary.openItems, 1);
    assert.equal(pkg.openItems.length, 1);
    assert(pkg.warnings[0].includes('high field item'));
    assert(pkg.assumptions.length > 0);
    const html = renderFieldCommissioningHTML(pkg);
    assert(html.includes('Cable &lt;1&gt;'));
    assert(html.includes('Damaged tag &lt;replace&gt;'));
    assert(!html.includes('Cable <1>'));
  });

  it('rejects oversized attachment payloads', () => {
    assert.throws(() => createFieldObservation({
      target: { elementType: 'cable', elementId: 'C-1' },
      attachments: [{ name: 'large.jpg', sizeBytes: MAX_FIELD_ATTACHMENT_BYTES + 1 }],
    }), /local storage guard/);
  });

  it('persists observations through dataStore helpers', () => {
    const observation = createFieldObservation({
      target: { elementType: 'cable', elementId: 'C-201' },
      observationType: 'asBuilt',
      status: 'open',
    });
    dataStore.addFieldObservation(observation);
    assert.equal(dataStore.getFieldObservations().length, 1);
    assert.equal(dataStore.getOpenFieldObservations()[0].elementId, 'C-201');
    const updated = dataStore.updateFieldObservation(observation.id, { status: 'resolved' });
    assert.equal(updated.status, 'resolved');
    assert.equal(dataStore.getOpenFieldObservations().length, 0);
  });
});
