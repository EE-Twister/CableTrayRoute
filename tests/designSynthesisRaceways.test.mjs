import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDesignSynthesisRaceways, SOUTHWIRE_SPEC45301 } from '../analysis/designSynthesisRaceways.mjs';

const corridors = { nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 10, y: 0, z: 0 }], edges: [{ id: 'E1', from: 'N1', to: 'N2', widthIn: 6, depthIn: 4 }] };
const routeResults = { batchResults: [{ cable: 'C1', route_segments: [{ tray_id: 'E1' }] }, { cable: 'C2', route_segments: [{ tray_id: 'E1' }] }] };
const cable = (id, od = 0.821) => ({ id, tag: id, conductor_size: '#8 AWG', conductor_count: 3, cable_od: od, cable_rating: 600 });

describe('design synthesis raceway capacity', () => {
  it('uses sourced area arithmetic and canonical edge geometry', () => {
    const result = evaluateDesignSynthesisRaceways({ corridors, cables: [cable('C1')], routeResults });
    assert.equal(result.status, 'proposal');
    assert.equal(result.trays[0].width, 2);
    assert.ok(Math.abs(result.evaluations[0].used.smallCableAreaIn2 - (Math.PI * 0.821 ** 2 / 4)) < 1e-9);
    assert.deepEqual(result.trays[0].start, [0, 0, 0]);
    assert.equal(result.cables[0].cableConstructionSource, undefined);
  });
  it('resizes congested edge within allowance and blocks when max is too small', () => {
    const many = Array.from({ length: 5 }, (_, i) => cable(`C${i}`, 1.2));
    const routes = { batchResults: many.map(c => ({ cable: c.id, route_segments: [{ tray_id: 'E1' }] })) };
    const resized = evaluateDesignSynthesisRaceways({ corridors, cables: many, routeResults: routes });
    assert.equal(resized.trays[0].width, 6);
    const blocked = evaluateDesignSynthesisRaceways({ corridors: { ...corridors, edges: [{ ...corridors.edges[0], widthIn: 2 }] }, cables: many, routeResults: routes });
    assert.equal(blocked.status, 'blocked');
  });
  it('blocks missing geometry and preserves explicit OD source without mislabeling it', () => {
    const result = evaluateDesignSynthesisRaceways({ corridors: { nodes: corridors.nodes, edges: [{ id: 'E1', from: 'N1', to: 'N2', widthIn: 6 }] }, cables: [{ ...cable('C1', 0.8), cableConstructionSource: 'user-catalog' }], routeResults });
    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some(issue => issue.code === 'RACEWAY-GEOMETRY-BLOCKED'));
    assert.equal(result.cables[0].cableConstructionSource, 'user-catalog');
  });
  it('blocks unknown tray edges, deduplicates repeated edge segments, and does not infer unknown catalog ratings', () => {
    const unknownEdge = evaluateDesignSynthesisRaceways({ corridors, cables: [cable('C1')], routeResults: { batchResults: [{ cable: 'C1', route_segments: [{ type: 'tray', tray_id: 'MISSING' }] }] } });
    assert.ok(unknownEdge.issues.some(issue => issue.code === 'RACEWAY-EDGE-MISSING'));
    const duplicate = evaluateDesignSynthesisRaceways({ corridors, cables: [cable('C1')], routeResults: { batchResults: [{ cable: 'C1', route_segments: [{ type: 'tray', tray_id: 'E1' }, { type: 'tray', tray_id: 'E1' }] }] } });
    assert.equal(duplicate.evaluations[0].cableCount, 1);
    const unknownCatalog = evaluateDesignSynthesisRaceways({ corridors, cables: [{ id: 'U', conductor_size: '#14 AWG', cable_od: 0.2 }], routeResults: { batchResults: [{ cable: 'U', route_segments: [{ type: 'tray', tray_id: 'E1' }] }] } });
    assert.equal(unknownCatalog.cables[0].conductor_count, undefined);
    assert.equal(unknownCatalog.cables[0].cable_rating, undefined);
  });
  it('does not pass installation coverage for an explicitly blocked route with usable geometry', () => {
    const result = evaluateDesignSynthesisRaceways({
      corridors,
      cables: [cable('C1')],
      routeResults: { batchResults: [{ cable: 'C1', status: 'blocked', route_segments: [{ type: 'tray', tray_id: 'E1' }] }] },
    });
    assert.equal(result.installationCoverage[0].status, 'blocked');
    assert.equal(result.installationComplete, false);
    assert.ok(result.issues.every(issue => issue.code !== 'RACEWAY-ASSIGNMENT-MISSING'));
  });
  it('keeps missing route rows unevaluated instead of treating them as no installation needed', () => {
    const result = evaluateDesignSynthesisRaceways({ corridors, cables: [cable('C1')], routeResults: { batchResults: [] } });
    assert.equal(result.installationCoverage.length, 0);
    assert.equal(result.installationComplete, false);
  });
});
