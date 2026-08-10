import assert from 'node:assert/strict';
import { renderOneLinePreviewView } from '../../analysis/tcc/oneLinePreviewView.mjs';

console.log('TCC one-line preview view');

{
  const svgClasses = new Set();
  const containerClasses = new Set();
  const emptyClasses = new Set(['hidden']);
  const noteClasses = new Set();
  let removed = 0;
  const state = {
    onelinePreviewSvgEl: { classList: { add: value => svgClasses.add(value) } },
    onelinePreviewTransform: { x: 1 }
  };
  const empty = {
    textContent: '',
    classList: { remove: value => emptyClasses.delete(value) }
  };
  renderOneLinePreviewView(null, {
    state,
    componentLookup: new Map(),
    onelinePreviewSvg: { selectAll: () => ({ remove: () => { removed += 1; } }) },
    onelinePreviewContainer: { classList: { add: value => containerClasses.add(value) } },
    onelinePreviewEmpty: empty,
    onelinePreviewNote: { classList: { add: value => noteClasses.add(value) } }
  });
  assert.equal(state.onelinePreviewTransform, null);
  assert.equal(removed, 1);
  assert.ok(svgClasses.has('hidden'));
  assert.ok(containerClasses.has('empty'));
  assert.equal(empty.textContent, 'Select a one-line component to see its connections.');
  assert.equal(emptyClasses.has('hidden'), false);
  assert.ok(noteClasses.has('hidden'));
  console.log('  ✓ preserves the no-context preview cleanup and accessible empty state');
}
