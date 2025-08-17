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
  it('assigns ductbank coordinates to conduits without paths', () => {
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
    rebuildTrayData(state, CONDUIT_SPECS);
    const seg = state.trayData.find(t => t.tray_id === 'DB1-C1');
    assert(seg, 'conduit segment missing');
    assert.deepStrictEqual([seg.start_x, seg.start_y, seg.start_z], [0, 0, 0]);
    assert.deepStrictEqual([seg.end_x, seg.end_y, seg.end_z], [10, 0, 0]);
  });

  it('routes through generated conduit segments', () => {
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
              { conduit_id: 'C1', type: 'RMC', trade_size: '1' },
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
              { conduit_id: 'C1', type: 'RMC', trade_size: '1' },
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
});

