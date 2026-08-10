import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderComponentNodes } from '../src/one-line/componentNodeRenderController.mjs';

describe('One-Line component node render controller', () => {
  it('excludes dimension records and hidden-layer nodes before creating SVG elements', () => {
    const included = [];
    let created = 0;
    renderComponentNodes({
      documentRef: { createElementNS: () => { created += 1; return {}; } },
      components: [
        { id: 'dimension-1', type: 'dimension' },
        { id: 'hidden-1', type: 'panel', layer: 'hidden' }
      ],
      renderSurface: { appendChild() {} },
      svgNS: 'svg',
      includeComponentBounds: component => included.push(component.id),
      isHiddenByLayer: component => component.layer === 'hidden'
    });
    assert.deepEqual(included, ['hidden-1']);
    assert.equal(created, 0);
  });
});
