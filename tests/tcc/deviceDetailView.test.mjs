import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderDeviceDetailsView } from '../../analysis/tcc/deviceDetailView.mjs';

console.log('TCC device detail view');

{
  const appended = [];
  const doc = {
    createElement(tagName) {
      return { tagName, className: '', textContent: '' };
    }
  };
  const container = {
    innerHTML: 'stale',
    ownerDocument: doc,
    appendChild(node) { appended.push(node); }
  };
  renderDeviceDetailsView(null, container, doc);
  assert.equal(container.innerHTML, '');
  assert.equal(appended.length, 1);
  assert.equal(appended[0].className, 'device-detail-empty');
  assert.equal(appended[0].textContent, 'Select a device to view its properties.');
  console.log('  ✓ preserves the empty device-detail state');
}

{
  assert.doesNotThrow(() => renderDeviceDetailsView(null, null, null));
  const source = await readFile(new URL('../../analysis/tcc/deviceDetailView.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('getAssignmentOptions'));
  assert.ok(source.includes('onOverrideControlChange'));
  assert.doesNotMatch(source, /\bbuildComponentAssignmentOptions\b|\bupdateEntryOverrideFromControl\b/);
  console.log('  ✓ isolates controller callbacks behind explicit view dependencies');
}
