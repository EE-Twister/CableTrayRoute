import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROPERTY_CLIPBOARD_EXCLUDE_KEYS,
  applyPropertyClipboardToComponent,
  buildPropertyClipboardData,
  canPastePropertyClipboard,
  clonePropertyClipboardValue,
  createPropertyClipboardFromComponent,
  deepEqualValues,
  isDomNode
} from '../src/one-line/propertyClipboardModel.mjs';

const breaker = () => ({
  id: 'n1',
  label: 'CB-1',
  type: 'breaker',
  subtype: 'lv_breaker',
  x: 40,
  y: 80,
  rotation: 90,
  connections: [{ target: 'n2' }],
  ports: [{ x: 0, y: 0 }],
  trip_rating: 400,
  settings: { pickup: 1.1, curve: { id: 'curve-1', points: [[1, 2]] } },
  installedOn: new Date('2024-01-02T03:04:05Z'),
  onClick() {}
});

describe('One-Line property clipboard model', () => {
  it('copies engineering properties and skips identity, geometry, wiring and functions', () => {
    const data = buildPropertyClipboardData(breaker());
    assert.deepEqual(Object.keys(data).sort(), ['installedOn', 'settings', 'trip_rating']);
    ['id', 'label', 'x', 'y', 'rotation', 'connections', 'ports', 'type', 'subtype'].forEach(key => {
      assert.ok(PROPERTY_CLIPBOARD_EXCLUDE_KEYS.has(key), `${key} is excluded`);
    });
    assert.equal(data.trip_rating, 400);
    assert.ok(data.installedOn instanceof Date);
  });

  it('deep clones nested values and drops unique keys inside nested objects', () => {
    const source = breaker();
    const data = buildPropertyClipboardData(source);
    assert.deepEqual(data.settings, { pickup: 1.1, curve: { points: [[1, 2]] } });
    data.settings.curve.points[0][0] = 99;
    assert.equal(source.settings.curve.points[0][0], 1);
    assert.equal(clonePropertyClipboardValue(null), null);
    assert.deepEqual(clonePropertyClipboardValue([1, { id: 'x', v: 2 }]), [1, { v: 2 }]);
  });

  it('creates clipboard payloads only for real components with copyable data', () => {
    const payload = createPropertyClipboardFromComponent(breaker());
    assert.equal(payload.subtype, 'lv_breaker');
    assert.equal(payload.type, 'breaker');
    assert.equal(payload.data.trip_rating, 400);
    assert.equal(createPropertyClipboardFromComponent({ ...breaker(), isVirtualNode: true }), null);
    assert.equal(createPropertyClipboardFromComponent({ id: 'n9', label: 'only identity' }), null);
    assert.equal(createPropertyClipboardFromComponent(null), null);
  });

  it('allows pasting only between matching subtypes (or when either side is untyped)', () => {
    const payload = createPropertyClipboardFromComponent(breaker());
    assert.equal(canPastePropertyClipboard(payload, { subtype: 'lv_breaker' }), true);
    assert.equal(canPastePropertyClipboard(payload, { subtype: 'fuse' }), false);
    assert.equal(canPastePropertyClipboard({ data: {} }, { subtype: 'fuse' }), true);
    assert.equal(canPastePropertyClipboard(payload, { subtype: 'lv_breaker', isVirtualNode: true }), false);
    assert.equal(canPastePropertyClipboard(null, { subtype: 'lv_breaker' }), false);
  });

  it('applies clipboard data, removes stale properties, and keeps identity and geometry', () => {
    const payload = createPropertyClipboardFromComponent(breaker());
    const target = { id: 'n5', label: 'CB-5', type: 'breaker', subtype: 'lv_breaker', x: 10, y: 20, trip_rating: 225, stale_note: 'remove me' };
    assert.equal(applyPropertyClipboardToComponent(target, payload), true);
    assert.equal(target.id, 'n5');
    assert.equal(target.label, 'CB-5');
    assert.equal(target.x, 10);
    assert.equal(target.trip_rating, 400);
    assert.equal('stale_note' in target, false);
    assert.notEqual(target.settings, payload.data.settings);
    assert.equal(applyPropertyClipboardToComponent(target, payload), false, 'second paste is a no-op');
    assert.equal(applyPropertyClipboardToComponent(target, null), false);
  });

  it('compares nested values structurally, including NaN', () => {
    assert.equal(deepEqualValues({ a: [1, { b: NaN }] }, { a: [1, { b: NaN }] }), true);
    assert.equal(deepEqualValues({ a: 1 }, { a: 1, b: undefined }), false);
    assert.equal(deepEqualValues([1, 2], [1, 3]), false);
    assert.equal(deepEqualValues('1', 1), false);
  });

  it('treats non-DOM values as copyable outside the browser', () => {
    assert.equal(isDomNode({ nodeType: 1 }), false);
    assert.equal(isDomNode(null), false);
  });
});
