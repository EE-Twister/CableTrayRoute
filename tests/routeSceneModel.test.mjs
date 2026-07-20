import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRouteMetrics,
  buildRouteDecisionScore,
  buildRouteSceneModel
} from '../src/routing/routeSceneModel.mjs';

describe('route scene model', () => {
  it('normalizes tray, standalone conduit, and ductbank-contained conduit geometry', () => {
    const model = buildRouteSceneModel({
      raceways: [
        { tray_id: 'TR-1', raceway_type: 'tray', allowed_cable_group: 'hv', start_x: 0, start_y: 0, start_z: 18, end_x: 20, end_y: 0, end_z: 18 },
        { tray_id: 'C-1', conduit_id: 'C-1', raceway_type: 'conduit', voltage_class: 'lv', start_x: 20, start_y: 0, start_z: 18, end_x: 30, end_y: 0, end_z: 18 }
      ],
      ductbanks: [{
        tag: 'DB-1',
        start_x: 30,
        start_y: 0,
        start_z: 0,
        end_x: 50,
        end_y: 0,
        end_z: 0,
        width: 36,
        height: 30,
        conduits: [
          { conduit_id: 'C04', trade_size: '4"', row: 1, column: 1, allowed_cable_group: 'control' },
          { conduit_id: 'C05', trade_size: '3/4"', row: 1, column: 2, allowed_cable_group: 'control' }
        ]
      }]
    });

    assert.equal(model.raceways.length, 5);
    assert.equal(model.racewayMap.get('TR-1').kind, 'tray');
    assert.equal(model.racewayMap.get('TR-1').allowedGroup, 'HV');
    assert.equal(model.racewayMap.get('C-1').kind, 'conduit');
    assert.equal(model.racewayMap.get('C-1').allowedGroup, 'LV');
    assert.equal(model.racewayMap.get('DB-1').kind, 'ductbank');
    assert.equal(model.racewayMap.get('DB-1').allowedGroup, 'CONTROL');
    assert.equal(model.racewayMap.get('C04').parentId, 'DB-1');
    assert.equal(model.racewayMap.get('C04').diameterIn, 4);
    assert.equal(model.racewayMap.get('C05').diameterIn, 0.75);
    assert.equal(model.racewayMap.get('C04').geometrySource, 'inferred-arrangement');
    assert.notDeepEqual(model.racewayMap.get('C04').path, model.racewayMap.get('C05').path);
  });

  it('calculates containment-specific route metrics and bends', () => {
    const raceways = buildRouteSceneModel({
      raceways: [
        { tray_id: 'TR-1', raceway_type: 'tray', start_x: 0, start_y: 0, start_z: 18, end_x: 20, end_y: 0, end_z: 18, current_fill: 50, maxFill: 100 },
        { tray_id: 'C-1', conduit_id: 'C-1', raceway_type: 'conduit', start_x: 20, start_y: 0, start_z: 18, end_x: 20, end_y: 10, end_z: 18 }
      ],
      ductbanks: [{
        tag: 'DB-1',
        start_x: 20,
        start_y: 10,
        start_z: 0,
        end_x: 40,
        end_y: 10,
        end_z: 0,
        conduits: [{ conduit_id: 'C04', trade_size: 4 }]
      }]
    }).raceways;
    const metrics = buildRouteMetrics({
      route_segments: [
        { type: 'tray', tray_id: 'TR-1', start: [0, 0, 18], end: [20, 0, 18], length: 20 },
        { type: 'tray', tray_id: 'C-1', conduit_id: 'C-1', start: [20, 0, 18], end: [20, 10, 18], length: 10 },
        { type: 'tray', tray_id: 'C04', conduit_id: 'C04', ductbankTag: 'DB-1', start: [20, 10, 0], end: [40, 10, 0], length: 20 },
        { type: 'field', start: [40, 10, 0], end: [45, 10, 0], length: 5 }
      ]
    }, raceways);

    assert.equal(metrics.total, 55);
    assert.equal(metrics.tray, 20);
    assert.equal(metrics.conduit, 10);
    assert.equal(metrics.ductbank, 20);
    assert.equal(metrics.field, 5);
    assert.equal(metrics.bends, 2);
    assert.equal(metrics.racewayCount, 3);
    assert.equal(metrics.maxUtilizationPct, 50);
    assert.equal(Math.round(metrics.inRacewayPct), 91);
  });

  it('scores a route from length efficiency, containment, capacity, and bends', () => {
    const raceways = buildRouteSceneModel({
      raceways: [{
        tray_id: 'TR-1', raceway_type: 'tray', start_x: 0, start_y: 0, start_z: 10,
        end_x: 100, end_y: 0, end_z: 10, utilizationPct: 40, maxFill: 100
      }]
    }).raceways;
    const score = buildRouteDecisionScore({
      route_segments: [{ type: 'tray', tray_id: 'TR-1', start: [0, 0, 10], end: [100, 0, 10], length: 100 }]
    }, raceways);
    assert.equal(score.overall, 90);
    assert.equal(score.grade, 'Excellent');
    assert.equal(score.length, 100);
    assert.equal(score.containment, 100);
    assert.equal(score.capacity, 60);
  });
});
