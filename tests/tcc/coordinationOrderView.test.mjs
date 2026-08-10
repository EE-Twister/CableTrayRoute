import assert from 'node:assert/strict';
import { renderCoordinationOrderView } from '../../analysis/tcc/coordinationOrderView.mjs';

console.log('TCC coordination order view');

{
  const state = { coordOrderIds: ['stale'] };
  const list = { innerHTML: 'old' };
  renderCoordinationOrderView({
    state,
    activePlotted: [{ selection: { uid: 'overlay', baseDevice: { type: 'cable' } } }],
    coordOrderList: list,
    isProtectiveType: () => false
  });
  assert.equal(list.innerHTML, '');
  assert.deepEqual(state.coordOrderIds, ['stale']);
  console.log('  ✓ clears the view without rewriting order when no protective curves are plotted');
}

{
  const state = { coordOrderIds: ['kept'] };
  renderCoordinationOrderView({ state, coordOrderList: null });
  assert.deepEqual(state.coordOrderIds, ['kept']);
  console.log('  ✓ tolerates an unavailable coordination-order container');
}
