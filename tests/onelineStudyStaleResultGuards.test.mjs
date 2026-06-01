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
