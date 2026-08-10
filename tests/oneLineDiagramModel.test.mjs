import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createComponentGroup,
  getComponentBounds,
  getConnectedComponentIds,
  getEnergizedComponentIds,
  getGroupMembers
} from '../src/one-line/diagramModel.mjs';

describe('One-Line diagram model', () => {
  it('computes rotated component bounds without DOM state', () => {
    const bounds = getComponentBounds({ x: 100, y: 50, width: 80, height: 40, rotation: 90 });
    assert.equal(Math.round(bounds.left), 120);
    assert.equal(Math.round(bounds.top), 30);
    assert.equal(Math.round(bounds.right), 160);
    assert.equal(Math.round(bounds.bottom), 110);
  });

  it('finds a connected neighborhood through component and sheet-level connections', () => {
    const components = [
      { id: 'source', connections: [{ target: 'bus' }] },
      { id: 'bus', connections: [] },
      { id: 'load', connections: [] },
      { id: 'isolated', connections: [] }
    ];
    const connected = getConnectedComponentIds('source', components, [{ from: 'bus', to: 'load' }]);
    assert.deepEqual([...connected].sort(), ['bus', 'load', 'source']);
  });

  it('stops energized traversal at an open device', () => {
    const components = [
      { id: 'source', type: 'sources', ports: [{}], connections: [{ target: 'bus' }] },
      { id: 'bus', type: 'bus', ports: [{}, {}], connections: [{ target: 'breaker', sourcePort: 1 }] },
      { id: 'breaker', type: 'breaker', state: 'open', ports: [{}, {}], connections: [{ target: 'load', sourcePort: 1 }] },
      { id: 'load', type: 'static_load', ports: [{}], connections: [] }
    ];
    const energized = getEnergizedComponentIds(components, [], {
      isComponentOpen: component => component.state === 'open',
      isSourceComponent: component => component.type === 'sources'
    });
    assert.equal(energized.has('source'), true);
    assert.equal(energized.has('bus'), true);
    assert.equal(energized.has('breaker'), true);
    assert.equal(energized.has('load'), false);
  });

  it('routes an ATS only through the selected available source', () => {
    const components = [
      { id: 'normal', type: 'sources', connections: [{ target: 'ats', targetPort: 0 }] },
      { id: 'emergency', type: 'sources', connections: [{ target: 'ats', targetPort: 1 }] },
      {
        id: 'ats',
        subtype: 'ats',
        selected_source: 'emergency',
        ports: [{}, {}, {}],
        connections: [{ target: 'load', sourcePort: 2 }]
      },
      { id: 'load', ports: [{}], connections: [] }
    ];
    const energized = getEnergizedComponentIds(components, [], {
      isSourceComponent: component => component.type === 'sources'
    });
    assert.equal(energized.has('ats'), true);
    assert.equal(energized.has('load'), true);

    components[1].available = false;
    const withoutEmergency = getEnergizedComponentIds(components, [], {
      isSourceComponent: component => component.type === 'sources'
    });
    assert.equal(withoutEmergency.has('load'), false);
  });

  it('creates and resolves a group without mutating diagram state', () => {
    const members = [
      { id: 'a', type: 'breaker', x: 100, y: 100, width: 80, height: 40 },
      { id: 'b', type: 'bus', x: 200, y: 100, width: 80, height: 40 }
    ];
    const group = createComponentGroup(members, { id: 'group-1' });
    assert.deepEqual(group.memberIds, ['a', 'b']);
    assert.deepEqual(
      { x: group.x, y: group.y, width: group.width, height: group.height },
      { x: 92, y: 92, width: 196, height: 56 }
    );
    assert.deepEqual(getGroupMembers([...members, group], group.id), members);
  });
});
