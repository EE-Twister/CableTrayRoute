import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { buildLargeFacilityRoutingSample } from '../analysis/largeFacilityRoutingSample.mjs';

const code = readFileSync(new URL('../routeWorker.js', import.meta.url), 'utf8');
const appCode = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
assert.match(appCode, /routingAlgorithmVersion:\s*'ductbank-balanced-v1'/, 'routing cache key must change with the balanced ductbank algorithm');
const quietConsole = { ...console, warn() {} };
const sandbox = { console: quietConsole, self: { postMessage() {} }, globalThis };
createContext(sandbox);
runInContext(`${code}\nthis.CableRoutingSystem = CableRoutingSystem;`, sandbox);
const { CableRoutingSystem } = sandbox;

const conduitSegment = ({ id, ductbank = 'DB-1', group = 'HV', start = [0, 0, 0], end = [100, 0, 0], row = 1, column = 1, fill = 0 }) => ({
    tray_id: `${ductbank}-${id}`,
    ductbankTag: ductbank,
    conduit_id: id,
    start_x: start[0],
    start_y: start[1],
    start_z: start[2],
    end_x: end[0],
    end_y: end[1],
    end_z: end[2],
    width: 4,
    height: 4,
    row,
    column,
    current_fill: fill,
    allowed_cable_group: group,
    raceway_type: 'conduit'
});

{
    const system = new CableRoutingSystem({ fillLimit: 0.4 });
    const c1 = conduitSegment({ id: 'C01', row: 1, column: 1, fill: 2 });
    const c2 = conduitSegment({ id: 'C02', start: [0, 1, 1], end: [100, 1, 1], row: 1, column: 2 });
    const c3 = conduitSegment({ id: 'C03', group: 'LV', start: [0, 2, 2], end: [100, 2, 2], row: 1, column: 3 });
    [c1, c2, c3].forEach(conduit => system.addTraySegment(conduit));

    assert.equal(system._ductbankCorridorKey(system.trays.get(c1.tray_id)), system._ductbankCorridorKey(system.trays.get(c2.tray_id)), 'parallel offset conduits should share a corridor');
    const selections = system._selectDuctbankConduits(0.5, 'HV');
    assert.deepEqual([...selections.values()], [c2.tray_id], 'least-utilized eligible sibling should be selected');
}

{
    const system = new CableRoutingSystem({ fillLimit: 0.4 });
    const undersized = conduitSegment({ id: 'C01' });
    undersized.width = 1;
    undersized.height = 1;
    const available = conduitSegment({ id: 'C02', row: 1, column: 2, fill: 1 });
    [undersized, available].forEach(conduit => system.addTraySegment(conduit));
    const selections = system._selectDuctbankConduits(0.5, 'HV');
    assert.deepEqual([...selections.values()], [available.tray_id], 'a lower-fill sibling must still be rejected when the cable cannot fit');
}

{
    const system = new CableRoutingSystem({ fillLimit: 0.4, proximityThreshold: 72 });
    const c1 = conduitSegment({ id: 'C01', fill: 2 });
    const c2 = conduitSegment({ id: 'C02', row: 1, column: 2 });
    [c1, c2].forEach(conduit => system.addTraySegment(conduit));
    system.prepareBaseGraph();
    const manual = system.calculateRoute([0, 0, 0], [100, 0, 0], 0.5, 'HV', '', [c1.tray_id], 'CBL-MANUAL');
    assert.equal(manual.success, true);
    assert.deepEqual(Array.from(manual.tray_segments), [c1.tray_id], 'explicit raceway assignments must override automatic balancing');
}

{
    const system = new CableRoutingSystem({ fillLimit: 0.4, proximityThreshold: 72 });
    const c01 = conduitSegment({ id: 'C01', fill: 2 });
    const c010 = conduitSegment({ id: 'C010', row: 1, column: 2 });
    [c01, c010].forEach(conduit => system.addTraySegment(conduit));
    system.prepareBaseGraph();
    const result = system.calculateRoute([0, 0, 0], [100, 0, 0], 0.5, 'HV');
    assert.equal(result.success, true);
    assert.deepEqual(Array.from(result.tray_segments), [c010.tray_id], 'removing C01 must not remove similarly prefixed C010 graph nodes');
}

{
    const sample = buildLargeFacilityRoutingSample();
    const hvTrays = sample.manualTrays
        .filter(tray => tray.allowed_cable_group === 'HV')
        .map(tray => ({ ...tray }));
    const hvDuctbank = sample.ductbankData.ductbanks.find(ductbank => ductbank.tag === 'DB-HV-01');
    for (const conduit of hvDuctbank.conduits) {
        const start = conduit.path[0];
        const end = conduit.path.at(-1);
        hvTrays.push({
            ...conduitSegment({
                id: conduit.conduit_id,
                ductbank: hvDuctbank.tag,
                group: conduit.allowed_cable_group,
                start,
                end,
                row: conduit.row,
                column: conduit.column
            }),
            width: Math.sqrt((4 * 12.554) / Math.PI),
            height: Math.sqrt((4 * 12.554) / Math.PI)
        });
    }
    const riser = sample.conduitData.find(conduit => conduit.allowed_cable_group === 'HV');
    hvTrays.push({ ...riser, width: 4, height: 4, current_fill: 0, raceway_type: 'conduit' });

    const system = new CableRoutingSystem({
        fillLimit: 0.4,
        proximityThreshold: 72,
        fieldPenalty: 3,
        sharedPenalty: 0.5,
        maxFieldEdge: 1000,
        maxFieldNeighbors: 8
    });
    hvTrays.forEach(tray => system.addTraySegment(tray));
    system.prepareBaseGraph();

    const allocations = new Map(hvDuctbank.conduits.map(conduit => [`${hvDuctbank.tag}-${conduit.conduit_id}`, 0]));
    const hvCables = sample.cableList.filter(cable => cable.allowed_cable_group === 'HV');
    for (const cable of hvCables) {
        const cableArea = Math.PI * (cable.diameter / 2) ** 2;
        const result = system.calculateRoute(cable.start, cable.end, cableArea, cable.allowed_cable_group, '', [], cable.name);
        assert.equal(result.success, true, `${cable.name} should route`);
        const selectedConduits = result.tray_segments.filter(id => allocations.has(id));
        assert.equal(selectedConduits.length, 1, `${cable.name} should use exactly one conduit in DB-HV-01`);
        allocations.set(selectedConduits[0], allocations.get(selectedConduits[0]) + 1);
        system.updateTrayFill(result.tray_segments, cableArea, cable.allowed_cable_group);
    }

    const counts = [...allocations.values()];
    assert.equal(counts.reduce((sum, count) => sum + count, 0), hvCables.length);
    assert.ok(counts.every(count => count > 0), 'every eligible sibling conduit should be used');
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `expected balanced allocation, received ${JSON.stringify(Object.fromEntries(allocations))}`);
    assert.deepEqual(counts.slice().sort((left, right) => left - right), [8, 8, 8, 8, 9, 9]);

    const utilization = system.getTrayUtilization();
    const maximumUtilization = Math.max(...[...allocations.keys()].map(id => utilization[id].utilization_percentage));
    assert.ok(maximumUtilization < 80, `balanced sample should remain below review threshold, received ${maximumUtilization.toFixed(1)}%`);
}

console.log('ductbank conduit balancing verified');
