import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CableRoutingSystem } from '../src/routing/cableRoutingSystem.mjs';
import { buildRoutingRacewayData } from '../src/routing/routingProjectAdapter.mjs';

const ductbank = ({ conduits, ...overrides } = {}) => ({
    tag: 'DB1',
    start_x: 0,
    start_y: 0,
    start_z: 0,
    end_x: 10,
    end_y: 0,
    end_z: 0,
    width: 12,
    height: 12,
    conduits: conduits || [],
    ...overrides
});

const conduit = (overrides = {}) => ({
    conduit_id: 'C1',
    type: 'RMC',
    trade_size: '1',
    ...overrides
});

const build = ({ ductbanks, includeDuctbankOutlines = false, warningLog = () => {} } = {}) =>
    buildRoutingRacewayData({
        ductbankData: { ductbanks: ductbanks || [] },
        includeDuctbankOutlines,
        conduitSpecs: { RMC: { 1: 0.887 } },
        warningLog
    });

describe('buildRoutingRacewayData', () => {
    it('skips conduits without paths and warns', () => {
        const warnings = [];
        const model = build({
            ductbanks: [ductbank({ conduits: [conduit()] })],
            warningLog: message => warnings.push(message)
        });

        assert.deepEqual(model.trayData, []);
        assert.equal(warnings.length, 1);
    });

    it('routes through conduit segments when a path is provided', () => {
        const model = build({
            ductbanks: [ductbank({
                conduits: [conduit({ path: [[0, 0, 0], [10, 0, 0]] })]
            })]
        });
        const system = new CableRoutingSystem({});
        model.trayData.forEach(segment => system.addTraySegment(segment));

        const result = system.calculateRoute([0, 0, 0], [10, 0, 0], 0, null);

        assert.equal(result.success, true);
        assert.deepEqual(result.tray_segments, ['DB1-C1']);
    });

    it('omits ductbank outline segments when disabled', () => {
        const model = build({
            ductbanks: [ductbank({
                conduits: [conduit({ path: [[0, 0, 0], [10, 0, 0]] })]
            })]
        });

        assert.equal(model.trayData.length, 1);
        assert.equal(model.trayData[0].raceway_type, 'conduit');
    });

    it('includes ductbank outline segments when enabled', () => {
        const model = build({
            includeDuctbankOutlines: true,
            ductbanks: [ductbank({
                conduits: [conduit({ path: [[0, 0, 0], [10, 0, 0]] })]
            })]
        });
        const types = model.trayData.map(segment => segment.raceway_type);

        assert.equal(types.includes('ductbank'), true);
        assert.equal(types.includes('conduit'), true);
    });

    it('reports the actual number of conduit segments after rebuilding', () => {
        const model = build({
            includeDuctbankOutlines: true,
            ductbanks: [
                ductbank({
                    conduits: [conduit({ path: [[0, 0, 0], [10, 0, 0]] })]
                }),
                ductbank({
                    tag: 'DB2',
                    conduits: [conduit({ conduit_id: 'C2' })]
                })
            ]
        });

        assert.equal(model.conduitCount, 1);
        assert.equal(model.hasSchedule, true);
    });

    it('reports an existing schedule when geometry prevents all conduits from being added', () => {
        const model = build({
            includeDuctbankOutlines: true,
            ductbanks: [ductbank({
                start_x: undefined,
                end_x: undefined,
                conduits: [conduit()]
            })]
        });

        assert.equal(model.conduitCount, 0);
        assert.equal(model.hasSchedule, true);
    });
});
