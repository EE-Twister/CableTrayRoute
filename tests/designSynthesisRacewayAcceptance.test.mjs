import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisRaceways } from '../analysis/designSynthesisRaceways.mjs';
import { evaluateTrayFill } from '../analysis/trayFill.mjs';

const sample = JSON.parse(await readFile(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

describe('industrial proposal raceway acceptance', () => {
  it('checks every generated tray segment against its own route assignment', () => {
    const proposal = generateDesignProposal(sample);
    assert.equal(proposal.status, 'proposal');
    const result = evaluateDesignSynthesisRaceways({ corridors: sample.corridors, cables: proposal.cables, routeResults: proposal.routeResults, criteria: sample.criteria });
    assert.equal(result.status, 'proposal');
    assert.equal(result.installationComplete, true);
    const routeRows = proposal.routeResults.batchResults;
    for (const cable of result.cables) {
      const row = routeRows.find(item => item.cable === (cable.tag || cable.id));
      const expected = [...new Set((row?.route_segments || [])
        .filter(segment => ['tray', 'conduit'].includes(segment.type))
        .map(segment => segment.raceway_id || segment.conduit_id || segment.tray_id))];
      assert.deepEqual([...cable.raceway_ids].sort(), expected.sort());
    }
    assert.ok(result.trays.every(tray => sample.corridors.edges.some(edge => edge.id === tray.tray_id)));
    for (const tray of result.trays) {
      const assigned = result.cables.filter(cable => cable.raceway_ids.includes(tray.tray_id));
      assert.equal(evaluateTrayFill(tray, assigned).status, 'pass');
    }
    const originalConduits = new Map((proposal.conduits || []).map(conduit => [conduit.conduit_id, conduit.trade_size]));
    assert.deepEqual(new Map(result.conduits.map(conduit => [conduit.conduit_id, conduit.trade_size])), originalConduits);
  });

  it('blocks when every corridor edge is physically limited to 2 inches', () => {
    const corridors = { ...sample.corridors, edges: sample.corridors.edges.map(edge => ({ ...edge, widthIn: 2 })) };
    const proposal = generateDesignProposal({ ...sample, corridors });
    assert.equal(proposal.status, 'blocked');
    const result = evaluateDesignSynthesisRaceways({ corridors, cables: proposal.cables, routeResults: proposal.routeResults, criteria: sample.criteria });
    assert.ok(proposal.routeResults.batchResults.some(row => (row.route_segments || []).some(segment => segment.type === 'tray')));
    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some(issue => issue.code === 'RACEWAY-CAPACITY-BLOCKED'));
  });
});
