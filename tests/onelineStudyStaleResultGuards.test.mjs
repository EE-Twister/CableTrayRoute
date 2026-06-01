import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'oneline.js'), 'utf8');

function getFunctionBody(name) {
  const start = source.indexOf(`async function ${name}()`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, i);
  }
  assert.fail(`Unable to parse ${name}`);
}

function getFunctionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`Unable to parse ${name}`);
}

function getNestedValue(sourceValue, segments = []) {
  let current = sourceValue;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

const resolveComponentAttribute = new Function(
  'getNestedValue',
  'studyAttributeResolvers',
  `return ${getFunctionSource('resolveComponentAttribute')};`
)(getNestedValue, {
  arcFlash: comp => comp.studyResults?.arcFlash?.[comp.id] || null,
  shortCircuit: comp => comp.studyResults?.shortCircuit?.[comp.id] || null,
  reliability: comp => comp.studyResults?.reliability?.componentStats?.[comp.id] || null,
});

const importedComponent = {
  id: 'PANEL-1',
  reliability: { availability: 0.001, downtime: 8760 },
  shortCircuit: { threePhaseKA: 0.02 },
  arcFlash: { incidentEnergy: 0.03 },
  props: {
    reliability: { availability: 0.002 },
    shortCircuit: { threePhaseKA: 0.04 },
    arcFlash: { incidentEnergy: 0.05 },
  },
  studyResults: {
    reliability: { componentStats: { 'PANEL-1': { availability: 0.990099, downtime: 87.6 } } },
    shortCircuit: { 'PANEL-1': { threePhaseKA: 42.5 } },
    arcFlash: { 'PANEL-1': { incidentEnergy: 18.7 } },
  },
};

assert.equal(
  resolveComponentAttribute(importedComponent, 'reliability.availability'),
  0.990099,
  'calculated reliability results should take precedence over imported component reliability fields',
);
assert.equal(
  resolveComponentAttribute(importedComponent, 'shortCircuit.threePhaseKA'),
  42.5,
  'calculated short-circuit results should take precedence over imported component shortCircuit fields',
);
assert.equal(
  resolveComponentAttribute(importedComponent, 'arcFlash.incidentEnergy'),
  18.7,
  'calculated arc-flash results should take precedence over imported component arcFlash fields',
);
assert.equal(
  resolveComponentAttribute({ custom: { value: 12 } }, 'custom.value'),
  12,
  'non-study dotted component fields should still resolve from the component object',
);

assert.ok(source.includes('function assertOneLineSheetsUnchanged'), 'one-line study stale-result guard should exist');

[
  ['runLoadFlowFromButton', 'runLoadFlowOffMain', 'setOneLine'],
  ['runShortCircuitFromButton', 'runShortCircuitOffMain', 'setOneLine'],
  ['runReliabilityFromButton', 'runReliabilityOffMain', 'setStudies'],
].forEach(([name, awaitedCall, writeCall]) => {
  const body = getFunctionBody(name);
  const revisionIndex = body.indexOf('const oneLineRevision = getOneLineSheetsRevision(oneLineData);');
  const awaitIndex = body.indexOf(`await ${awaitedCall}`);
  const guardIndex = body.indexOf('assertOneLineSheetsUnchanged(oneLineRevision');
  const writeIndex = body.indexOf(writeCall);
  assert.ok(revisionIndex !== -1 && revisionIndex < awaitIndex, `${name} should capture the one-line revision before awaiting worker results`);
  assert.ok(guardIndex !== -1 && awaitIndex < guardIndex, `${name} should validate the one-line revision after worker results resolve`);
  assert.ok(writeIndex !== -1 && guardIndex < writeIndex, `${name} should validate the one-line revision before writing results`);
});
