import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildDesignSynthesisOneLinePreview } from '../src/design-synthesis/oneLinePreview.mjs';

function fixture(count, { motor = false, mixedVoltage = false } = {}) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `LOAD-${index}`, tag: `LOAD-${index}`, voltage: mixedVoltage && index < count * 0.8 ? 208 : 480, kw: mixedVoltage && index < count * 0.8 ? 1 : 2, phases: 3, powerFactor: 0.9 }));
  if (motor) {
    input.equipment[0] = { ...input.equipment[0], kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
      ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic motor design current' }, nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol',
    } };
    input.supply.voltageSystem = { connection: 'wye', grounding: 'solid', lineToGroundVoltageV: 277, reference: 'Synthetic source basis' };
    input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source impedance' };
    input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
    input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', enclosureMm: { height: 610, width: 305, depth: 205 } };
  }
  return input;
}

for (const count of [25, 50]) for (const options of [{}, { motor: true }, { mixedVoltage: true }]) {
  test(`${count}-load ${options.motor ? 'motor' : options.mixedVoltage ? 'mixed-voltage' : 'nonmotor'} drawing retains every generated component and cable`, () => {
    const proposal = generateDesignProposal(fixture(count, options));
    const result = buildDesignSynthesisOneLinePreview(proposal);
    assert.equal(result.ok, true, result.message);
    assert.equal(result.nodeCount, proposal.oneLine.sheets[0].components.length);
    assert.equal(result.cableCount, proposal.cables.length);
    for (const component of proposal.oneLine.sheets[0].components) assert.ok(result.svg.includes(`data-node-id="${component.id}"`), component.id);
    for (const cable of proposal.cables) assert.ok(result.svg.includes(`${cable.id} ·`), cable.id);
    assert.match(result.svg, /PRELIMINARY ONE-LINE/);
    assert.match(result.svg, /protection are not approved/);
    if (options.motor) {
      assert.equal(proposal.status, 'blocked');
      assert.match(result.svg, /PRELIMINARY ONE-LINE — BLOCKED/);
      assert.match(result.svg, /Motor protection unresolved/);
      assert.match(result.svg, /Starter candidate 3RT2025-1BB40 \+ 3RU2126-4AB0 \+ 3RV2021-4AA10/);
    }
    if (options.mixedVoltage) {
      assert.ok(proposal.transformer);
      assert.match(result.svg, /primary winding/);
      assert.match(result.svg, /secondary winding/);
    }
  });
}

test('missing, inconsistent, disconnected and ambiguous topology does not produce a misleading drawing', () => {
  const base = generateDesignProposal(fixture(25));
  const variants = [
    value => value.oneLine.sheets[0].connections.pop(),
    value => { value.oneLine.sheets[0].connections[0].to = 'missing'; },
    value => { value.oneLine.sheets[0].connections[1].to = value.oneLine.sheets[0].connections[0].to; },
    value => { value.oneLine.sheets[0].components[1].id = value.oneLine.sheets[0].components[0].id; },
    value => { value.loads.push({ id: 'missing' }); },
  ];
  for (const mutate of variants) {
    const proposal = structuredClone(base); mutate(proposal);
    const result = buildDesignSynthesisOneLinePreview(proposal);
    assert.equal(result.ok, false);
    assert.equal(result.svg, null);
  }
});

test('drawing escapes user-controlled labels instead of creating markup', () => {
  const proposal = generateDesignProposal(fixture(25));
  proposal.oneLine.sheets[0].components.find(row => row.type === 'load').tag = '<script>alert(1)</script>';
  const result = buildDesignSynthesisOneLinePreview(proposal);
  assert.equal(result.ok, true);
  assert.ok(result.svg.includes('&lt;script&gt;'));
  assert.ok(!result.svg.includes('<script>'));
});

for (const count of [25, 50]) test(`${count} load drawing shows complete selected device and motor starter identities in visible text`, () => {
  const proposal = generateDesignProposal(fixture(count, { motor: true }));
  const result = buildDesignSynthesisOneLinePreview(proposal);
  assert.equal(result.ok, true);
  const visibleText = cableId => {
    const group = result.svg.match(new RegExp(`<g data-cable-id="${cableId}">([\\s\\S]*?)</g>`));
    assert.ok(group, `No drawing group for ${cableId}`);
    return [...group[1].matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map(match => match[1]).join(' ');
  };
  const feeder = proposal.cables.find(cable => !cable.motor && cable.protectiveDevice?.catalogNumber);
  const motor = proposal.cables.find(cable => cable.motor);
  const starter = proposal.motorStarterCandidates.cases.find(row => row.motorId === motor.loadId).candidate;
  const feederText = visibleText(feeder.id);
  const motorText = visibleText(motor.id);
  assert.ok(feederText.includes(feeder.protectiveDevice.catalogNumber));
  assert.ok(feederText.includes(`${feeder.protectiveDevice.continuousCurrentA} A`));
  assert.ok(feederText.includes(`${feeder.protectiveDevice.interruptingRatingKA} kA at ${feeder.protectiveDevice.interruptingRatingVoltageVac} V`));
  assert.ok(motorText.includes('Motor protection unresolved'));
  assert.ok(motorText.includes(starter.contactor.catalogNumber));
  assert.ok(motorText.includes(starter.overloadRelay.catalogNumber));
  assert.ok(motorText.includes(starter.shortCircuitController.catalogNumber));
  assert.ok(!feederText.includes('…') && !motorText.includes('…'));
});

test('long equipment tags are wrapped into visible text without replacing their characters', () => {
  const proposal = generateDesignProposal(fixture(25));
  const node = proposal.oneLine.sheets[0].components.find(item => item.type === 'load');
  node.tag = 'VERY-LONG-INDUSTRIAL-EQUIPMENT-IDENTIFIER-001';
  const result = buildDesignSynthesisOneLinePreview(proposal);
  const group = result.svg.match(new RegExp(`<g data-node-id="${node.id}">([\\s\\S]*?)</g>`));
  assert.ok(group);
  const visible = [...group[1].matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map(match => match[1]).join('');
  assert.ok(visible.includes(node.tag));
  assert.ok(!visible.includes('…'));
});
