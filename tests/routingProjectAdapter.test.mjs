import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildRoutingRacewayData,
    expandScheduledRaceways,
    getConduitAliases,
    normalizeCableSchedule,
    normalizeDuctbankSchedule,
    normalizeTraySchedule,
    parseCableThickness
} from '../src/routing/routingProjectAdapter.mjs';

describe('routing project adapter', () => {
    it('deduplicates nested and top-level conduits through canonical aliases', () => {
        const ductbanks = [{
            tag: 'DB-1',
            conduits: [
                { conduit_id: 'C01', type: 'PVC Sch 40', trade_size: '4' },
                { conduit_id: 'C02', type: 'PVC Sch 40', trade_size: '4' }
            ]
        }];
        const topLevel = [{
            conduit_id: 'DB-1-C01',
            ductbankTag: 'DB-1',
            type: 'PVC Sch 40',
            trade_size: '4'
        }];

        const result = expandScheduledRaceways(ductbanks, topLevel);

        assert.equal(result.ductbanks.length, 1);
        assert.equal('conduits' in result.ductbanks[0], false);
        assert.deepEqual(result.conduits.map(conduit => conduit.conduit_id), ['DB-1-C01', 'C02']);
        assert.ok(getConduitAliases(topLevel[0]).includes('DB-1:C01'));
        assert.equal(ductbanks[0].conduits.length, 2, 'source project records remain intact');
    });

    it('normalizes tray schedule dimensions and slot metadata without persistence access', () => {
        const result = normalizeTraySchedule([{
            tray_id: 'TR-1',
            start_x: '0', start_y: '1', start_z: '2',
            end_x: '10', end_y: '11', end_z: '12',
            inside_width: '18', tray_depth: '6',
            num_slots: '2', slot_groups: '{"0":"LV","1":"HV"}',
            allowed_cable_group: 'POWER'
        }]);

        assert.deepEqual(result[0], {
            tray_id: 'TR-1',
            start_x: 0, start_y: 1, start_z: 2,
            end_x: 10, end_y: 11, end_z: 12,
            width: 18, height: 6,
            num_slots: 2,
            slot_groups: '{"0":"LV","1":"HV"}',
            current_fill: 0,
            shape: 'STR',
            allowed_cable_group: 'POWER',
            raceway_type: 'tray'
        });
    });

    it('preserves cable interchange fields and derives missing physical properties', () => {
        const warnings = [];
        const conductorProps = {
            '#12 AWG': { area_cm: 6530, insulation_thickness: 0.04 }
        };
        const result = normalizeCableSchedule([{
            tag: 'C-1', from_tag: 'MCC-1', to_tag: 'LOAD-1',
            start_x: '0', start_y: '1', start_z: '2',
            end_x: '3', end_y: '4', end_z: '5',
            conductor_size: '#12 AWG', conductors: 3,
            conductor_material: 'copper', shielding_jacket: '1 mm',
            raceway_ids: ['TR-1'], manual_path: 'TR-1>TR-2', locked: true
        }], conductorProps, { warningLog: message => warnings.push(message) });

        assert.equal(parseCableThickness('2.54 cm'), 1);
        assert.equal(parseCableThickness('25.4 mm'), 1);
        assert.equal(result[0].name, 'C-1');
        assert.deepEqual(result[0].start, [0, 1, 2]);
        assert.deepEqual(result[0].end, [3, 4, 5]);
        assert.deepEqual(result[0].raceway_ids, ['TR-1']);
        assert.equal(result[0].manual_path, 'TR-1>TR-2');
        assert.equal(result[0].locked, true);
        assert.deepEqual(result[0].route_segments, []);
        assert.ok(result[0].diameter > 0.1);
        assert.ok(result[0].weight > 0);
        assert.deepEqual(warnings, []);
    });

    it('normalizes ductbank hierarchy and identifies missing conduits', () => {
        const result = normalizeDuctbankSchedule([
            { tag: 'DB-1', start_x: 0, start_y: 0, start_z: -3, end_x: 100, end_y: 0, end_z: -3, width: 30, height: 24 },
            { tag: 'DB-EMPTY', start_x: 0, start_y: 5, start_z: -3, end_x: 100, end_y: 5, end_z: -3 }
        ], [
            { conduit_id: 'C01', ductbankTag: 'db-1', type: 'PVC Sch 40', trade_size: '4', row: 1, col: 2, start_x: 0, start_y: 0, start_z: -3, end_x: 100, end_y: 0, end_z: -3 },
            { conduit_id: 'STANDALONE', type: 'RMC', trade_size: '2', start_x: 0, start_y: 10, start_z: 0, end_x: 20, end_y: 10, end_z: 0 }
        ]);

        assert.equal(result.ductbankData.ductbanks[0].conduits.length, 1);
        assert.equal(result.ductbankData.ductbanks[0].conduits[0].tray_id, 'DB-1-C01');
        assert.equal(result.ductbankData.ductbanks[0].conduits[0].column, 2);
        assert.deepEqual(result.ductbanksWithoutConduits, ['DB-EMPTY']);
        assert.equal(result.standaloneConduits[0].conduit_id, 'STANDALONE');
    });

    it('builds tray, ductbank, and standalone-conduit routing geometry with diagnostics', () => {
        const warnings = [];
        const result = buildRoutingRacewayData({
            manualTrays: [{ tray_id: 'TR-1', raceway_type: 'tray' }],
            includeDuctbankOutlines: true,
            conduitSpecs: { 'PVC Sch 40': { '4': 12.554 }, RMC: { '2': 3.408 } },
            ductbankData: { ductbanks: [
                {
                    id: 'DB-1', tag: 'DB-1', width: 30, height: 24,
                    outline: [[0, 0, -3], [100, 0, -3]],
                    conduits: [
                        { conduit_id: 'C01', ductbankTag: 'DB-1', type: 'PVC Sch 40', trade_size: '4', path: [[0, 0, -3], [100, 0, -3]], row: 1, column: 1 },
                        { conduit_id: 'C02', ductbankTag: 'DB-1', type: 'PVC Sch 40', trade_size: '4' }
                    ]
                },
                { id: 'DB-BAD', conduits: [] }
            ] },
            conduitData: [{
                conduit_id: 'ST-1', type: 'RMC', trade_size: '2',
                start_x: 0, start_y: 10, start_z: 0,
                end_x: 20, end_y: 10, end_z: 0
            }],
            warningLog: message => warnings.push(message)
        });

        assert.deepEqual(result.trayData.map(row => row.tray_id), ['TR-1', 'DB-1', 'DB-1-C01', 'ST-1']);
        assert.equal(result.geometryWarnings.ductbanks[0], 'DB-BAD');
        assert.equal(result.geometryWarnings.conduits[0], 'C02');
        assert.equal(result.conduitCount, 2);
        assert.equal(result.hasSchedule, true);
        assert.equal(warnings.length, 2);
        assert.ok(Math.abs(result.trayData[2].width - Math.sqrt((4 * 12.554) / Math.PI)) < 1e-9);
    });
});
