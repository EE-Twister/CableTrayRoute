import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  buildReportBody,
  computeCoverage
} from '../scripts/componentCoverageAudit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_FILE = path.join(ROOT, 'docs', 'component-gap-analysis.md');
const LIBRARY_FILE = path.join(ROOT, 'componentLibrary.json');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
const coverage = computeCoverage(library);
const rowsByType = new Map(coverage.attributeRows.map((row) => [row.type, row]));

// The committed report carries a `Generated on <date>` line that changes on
// every regeneration. Strip it so the comparison is about content drift, not
// the day the script last ran.
function reportBodyOf(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## Missing Common Component Types'));
  assert.notStrictEqual(start, -1, 'report is missing its first section heading');
  return lines.slice(start).join('\n').trimEnd();
}

describe('component coverage audit — report freshness', () => {
  it('docs/component-gap-analysis.md exists', () => {
    assert.ok(fs.existsSync(REPORT_FILE), 'docs/component-gap-analysis.md not found');
  });

  it('committed report matches a fresh regeneration', () => {
    const committed = reportBodyOf(fs.readFileSync(REPORT_FILE, 'utf8'));
    const regenerated = buildReportBody(coverage).join('\n').trimEnd();
    assert.strictEqual(
      committed,
      regenerated,
      'docs/component-gap-analysis.md is stale — run `npm run audit:components` and commit the result'
    );
  });
});

describe('component coverage audit — attribute coverage', () => {
  it('discovers every component type in the library', () => {
    assert.ok(
      coverage.attributeRows.length >= 30,
      `expected >=30 component types, got ${coverage.attributeRows.length}`
    );
  });

  it('no component type is missing baseline attributes', () => {
    const gaps = coverage.attributeRows
      .filter((row) => row.missing.length > 0)
      .map((row) => `${row.type}: ${row.missing.join(', ')}`);
    assert.deepStrictEqual(gaps, [], `component types with missing attributes:\n  ${gaps.join('\n  ')}`);
  });

  it('no common baseline component type is absent', () => {
    assert.deepStrictEqual(coverage.missingComponents, []);
  });
});

describe('component coverage audit — relay classification', () => {
  it('keeps overcurrent_relay and relay_87 as distinct rows', () => {
    // Collapsing both subtypes onto a single `relay` row merges their props, so
    // a field absent from one is masked by the other.
    assert.ok(rowsByType.has('overcurrent_relay'), 'missing overcurrent_relay row');
    assert.ok(rowsByType.has('relay_87'), 'missing relay_87 row');
    assert.ok(!rowsByType.has('relay'), 'relay_87 and overcurrent_relay must not collapse into `relay`');
  });

  it('holds overcurrent relays to the time-overcurrent baseline', () => {
    const { expected } = rowsByType.get('overcurrent_relay');
    assert.ok(expected.includes('time_dial'), 'overcurrent relay should require a time dial');
    assert.ok(expected.includes('pickup_amps'), 'overcurrent relay should require a pickup');
  });

  it('holds differential relays to the restraint-characteristic baseline', () => {
    // An 87 element is a percentage-slope sensing device: no time dial, and the
    // breaker it trips carries the interrupting duty, not the relay.
    const { expected } = rowsByType.get('relay_87');
    assert.ok(expected.includes('slope1_pct'), 'differential relay should require a restraint slope');
    assert.ok(expected.includes('protected_zone_type'), 'differential relay should require a protected zone');
    assert.ok(!expected.includes('time_dial'), 'differential relay must not require a time dial');
    assert.ok(
      !expected.includes('interrupting_rating_ka'),
      'differential relay must not require an interrupting rating'
    );
  });
});
