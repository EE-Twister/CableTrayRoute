const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

// Extract rebuildTrayData function body from app.js
const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const startMarker = 'const rebuildTrayData = () => {';
const startIdx = appCode.indexOf(startMarker) + startMarker.length;
let idx = startIdx;
let depth = 1;
while (idx < appCode.length && depth > 0) {
  const ch = appCode[idx++];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
}
const fnBody = appCode.slice(startIdx, idx - 1);
const rebuildTrayData = new Function('state', 'CONDUIT_SPECS', fnBody);

// Load CableRoutingSystem from routeWorker.js
const workerCode = fs.readFileSync(path.join(__dirname, '..', 'routeWorker.js'), 'utf8');
const sandbox = { console, self: { postMessage: () => {} } };
vm.createContext(sandbox);
vm.runInContext(workerCode + '\nthis.CableRoutingSystem = CableRoutingSystem;', sandbox);
const { CableRoutingSystem } = sandbox;

describe('rebuildTrayData', () => {
  it('skips conduits without paths and warns', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      ductbankData: {
        ductbanks: [
          {
            id: 'DB1',
            start_x: 0,
            start_y: 0,
            start_z: 0,
            end_x: 10,
            end_y: 0,
            end_z: 0,
            width: 12,
            height: 12,
            conduits: [
              { conduit_id: 'C1', type: 'RMC', trade_size: '1' },
            ],
          },
        ],
      },
      conduitData: [],
    };
    const CONDUIT_SPECS = { RMC: { '1': 0.887 } };
    let warned = false;
    const origWarn = console.warn;
    console.warn = () => { warned = true; };
    rebuildTrayData(state, CONDUIT_SPECS);
    console.warn = origWarn;
    assert.strictEqual(state.trayData.length, 0);
    assert(warned, 'warning not emitted');
  });

  it('routes through conduit segments when path provided', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      ductbankData: {
        ductbanks: [
          {
            id: 'DB1',
            start_x: 0,
            start_y: 0,
            start_z: 0,
            end_x: 10,
            end_y: 0,
            end_z: 0,
            width: 12,
            height: 12,
            conduits: [
              { conduit_id: 'C1', type: 'RMC', trade_size: '1', path: [[0,0,0],[10,0,0]] },
            ],
          },
        ],
      },
      conduitData: [],
    };
    const CONDUIT_SPECS = { RMC: { '1': 0.887 } };
    rebuildTrayData(state, CONDUIT_SPECS);
    const system = new CableRoutingSystem({});
    state.trayData.forEach(t => system.addTraySegment(t));
    const res = system._racewayRoute([0, 0, 0], [10, 0, 0], 0, null, ['C1']);
    assert(res && res.success, 'routing failed');
    assert.deepStrictEqual(Array.from(res.tray_segments), ['DB1-C1']);
  });

  it('omits ductbank outline segments when disabled', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      includeDuctbankOutlines: false,
      ductbankData: {
        ductbanks: [
          {
            id: 'DB1',
            start_x: 0,
            start_y: 0,
            start_z: 0,
            end_x: 10,
            end_y: 0,
            end_z: 0,
            width: 12,
            height: 12,
            conduits: [
              { conduit_id: 'C1', type: 'RMC', trade_size: '1', path: [[0,0,0],[10,0,0]] },
            ],
          },
        ],
      },
      conduitData: [],
    };
    const CONDUIT_SPECS = { RMC: { '1': 0.887 } };
    rebuildTrayData(state, CONDUIT_SPECS);
    assert.strictEqual(state.trayData.length, 1);
    assert.strictEqual(state.trayData[0].raceway_type, 'conduit');
  });

  it('includes ductbank outline segments when enabled', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      includeDuctbankOutlines: true,
      ductbankData: {
        ductbanks: [
          {
            id: 'DB1',
            start_x: 0,
            start_y: 0,
            start_z: 0,
            end_x: 10,
            end_y: 0,
            end_z: 0,
            width: 12,
            height: 12,
            conduits: [
              { conduit_id: 'C1', type: 'RMC', trade_size: '1', path: [[0,0,0],[10,0,0]] },
            ],
          },
        ],
      },
      conduitData: [],
    };
    const CONDUIT_SPECS = { RMC: { '1': 0.887 } };
    rebuildTrayData(state, CONDUIT_SPECS);
    const types = state.trayData.map(t => t.raceway_type);
    assert(types.includes('ductbank'), 'ductbank outline missing');
    assert(types.includes('conduit'), 'conduit segment missing');
  });

  it('reports conduit count after rebuild', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      includeDuctbankOutlines: true,
      ductbankData: {
        ductbanks: [
          {
            id: 'DB1',
            start_x: 0,
            start_y: 0,
            start_z: 0,
            end_x: 10,
            end_y: 0,
            end_z: 0,
            width: 12,
            height: 12,
            conduits: [ { conduit_id: 'C1', path: [[0,0,0],[10,0,0]] } ],
          },
          {
            id: 'DB2',
            conduits: [ { conduit_id: 'C2' } ],
          },
        ],
      },
      conduitData: [],
    };
    let captured = {};
    global.displayConduitCount = (count, hasSchedule) => { captured = { count, hasSchedule }; };
    rebuildTrayData(state, {});
    delete global.displayConduitCount;
    const expected = state.trayData.filter(t => t.raceway_type === 'ductbank').length;
    assert.strictEqual(captured.count, expected);
    assert.strictEqual(captured.hasSchedule, true);
  });

  it('warns when no conduits are added despite schedule', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      includeDuctbankOutlines: true,
      ductbankData: {
        ductbanks: [
          {
            id: 'DB1',
            conduits: [ { conduit_id: 'C1' } ],
          },
        ],
      },
      conduitData: [],
    };
    let captured = {};
    global.displayConduitCount = (count, hasSchedule) => { captured = { count, hasSchedule }; };
    rebuildTrayData(state, {});
    delete global.displayConduitCount;
    assert.strictEqual(captured.count, 0);
    assert.strictEqual(captured.hasSchedule, true);
  });
});

