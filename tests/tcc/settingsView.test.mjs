import assert from 'node:assert/strict';
import { renderTccSettings } from '../../analysis/tcc/settingsView.mjs';

function createElement(tagName) {
  return {
    tagName: tagName.toUpperCase(),
    className: '',
    dataset: {},
    children: [],
    textContent: '',
    value: '',
    placeholder: '',
    type: '',
    appendChild(child) { this.children.push(child); }
  };
}

const documentRef = { createElement };

console.log('TCC settings view');

{
  const container = createElement('section');
  container.innerHTML = 'stale';
  const deviceMap = new Map([
    ['component:CB-1', {
      kind: 'component',
      componentId: 'CB-1',
      baseDeviceId: 'breaker-1',
      name: 'Main Breaker',
      baseDevice: {
        settings: { pickup: 100, time: 0.3 },
        settingOptions: { pickup: [100, 200, 400] }
      },
      overrideSource: { pickup: 190, time: 0.5 }
    }],
    ['overlay', { kind: 'inrush' }]
  ]);
  renderTccSettings({
    container,
    documentRef,
    selectedIds: ['component:CB-1', 'overlay'],
    deviceMap
  });
  assert.equal(container.innerHTML, '');
  assert.equal(container.children.length, 1);
  const settings = container.children[0];
  assert.equal(settings.className, 'device-settings');
  assert.equal(settings.dataset.componentId, 'CB-1');
  assert.equal(settings.children[0].textContent, 'Main Breaker');
  const pickupSelect = settings.children[1].children[0];
  assert.equal(pickupSelect.tagName, 'SELECT');
  assert.equal(pickupSelect.value, '200');
  assert.deepEqual(pickupSelect.children.map(option => option.value), ['100', '200', '400']);
  const timeInput = settings.children[2].children[0];
  assert.equal(timeInput.tagName, 'INPUT');
  assert.equal(timeInput.value, '0.5');
  assert.equal(timeInput.placeholder, '0.3');
  console.log('  ✓ renders selected component settings, snaps options, and excludes overlays');
}

{
  assert.doesNotThrow(() => renderTccSettings({
    container: null,
    documentRef,
    selectedIds: [],
    deviceMap: new Map()
  }));
  console.log('  ✓ tolerates an unavailable settings container');
}
