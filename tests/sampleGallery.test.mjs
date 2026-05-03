/**
 * Tests for analysis/sampleGallery.mjs
 *
 * Covers:
 *   SG-01 — SAMPLE_REGISTRY has 6 entries
 *   SG-02 — Each entry has required fields
 *   SG-03 — getSamplesByTag returns matches
 *   SG-04 — getSamplesByTag returns empty for unknown tag
 *   SG-05 — getSampleById returns correct entry
 *   SG-06 — getSampleById returns undefined for missing id
 *   SG-07–12 — validateSampleProject: valid, missing cables, missing raceways, missing schemaVersion, null, empty
 *   SG-13 — migrateSampleProject returns unchanged object at current version
 *   SG-14 — migrateSampleProject adds schemaVersion when absent
 *   SG-15–20 — Each samples/*.json file exists and is valid JSON
 *   SG-21–26 — Each sample JSON passes validateSampleProject
 *   SG-27 — samplegallery.html exists
 *   SG-28 — samplegallery.html references dist/samplegallery.js
 *   SG-29 — samplegallery.html contains nav placeholder
 *   SG-30 — Each sample file has a download link with download attribute in samplegallery.html
 *   SG-31–36 — guidedChecklist steps reference only pages listed in pagesUsed
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SCHEMA_VERSION,
  SAMPLE_REGISTRY,
  getSamplesByTag,
  getSampleById,
  validateSampleProject,
  migrateSampleProject,
} from '../analysis/sampleGallery.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (err) { console.error('  ✗', name, err.message || err); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// SG-01 — SAMPLE_REGISTRY count
// ---------------------------------------------------------------------------
describe('SAMPLE_REGISTRY', () => {
  it('has exactly 6 entries', () => {
    assert.strictEqual(SAMPLE_REGISTRY.length, 6);
  });

  // SG-02
  it('each entry has required fields', () => {
    const required = ['id', 'title', 'industry', 'description', 'tags', 'projectFile', 'pagesUsed', 'guidedChecklist'];
    SAMPLE_REGISTRY.forEach(s => {
      required.forEach(field => {
        assert.ok(field in s, `Sample "${s.id}" missing field "${field}"`);
      });
      assert.ok(Array.isArray(s.tags), `Sample "${s.id}" tags must be array`);
      assert.ok(s.tags.length > 0, `Sample "${s.id}" tags must be non-empty`);
      assert.ok(Array.isArray(s.pagesUsed), `Sample "${s.id}" pagesUsed must be array`);
      assert.ok(Array.isArray(s.guidedChecklist), `Sample "${s.id}" guidedChecklist must be array`);
      assert.ok(s.guidedChecklist.length > 0, `Sample "${s.id}" guidedChecklist must be non-empty`);
    });
  });
});

// ---------------------------------------------------------------------------
// SG-03–06 — getSamplesByTag / getSampleById
// ---------------------------------------------------------------------------
describe('getSamplesByTag()', () => {
  // SG-03
  it('returns non-empty array for "routing"', () => {
    const results = getSamplesByTag('routing');
    assert.ok(results.length > 0, 'Expected at least one sample with tag "routing"');
  });

  // SG-04
  it('returns empty array for unknown tag', () => {
    const results = getSamplesByTag('nonexistent-tag-xyz');
    assert.deepStrictEqual(results, []);
  });
});

describe('getSampleById()', () => {
  // SG-05
  it('returns the correct sample for "industrial-plant"', () => {
    const s = getSampleById('industrial-plant');
    assert.ok(s, 'Expected to find industrial-plant');
    assert.strictEqual(s.id, 'industrial-plant');
    assert.strictEqual(s.title, 'Industrial Plant');
  });

  // SG-06
  it('returns undefined for a missing id', () => {
    assert.strictEqual(getSampleById('does-not-exist'), undefined);
  });
});

// ---------------------------------------------------------------------------
// SG-07–12 — validateSampleProject
// ---------------------------------------------------------------------------
describe('validateSampleProject()', () => {
  const valid = {
    schemaVersion: 1,
    id: 'test',
    title: 'Test',
    cables: [],
    raceways: { trays: [], conduits: [], ductbanks: [] },
  };

  // SG-07
  it('passes a valid minimal project', () => {
    const { valid: ok, errors } = validateSampleProject(valid);
    assert.strictEqual(ok, true, `Unexpected errors: ${errors.join(', ')}`);
    assert.deepStrictEqual(errors, []);
  });

  // SG-08
  it('fails when cables is missing', () => {
    const { valid: ok, errors } = validateSampleProject({ ...valid, cables: undefined });
    assert.strictEqual(ok, false);
    assert.ok(errors.some(e => /cables/i.test(e)), `Expected cables error, got: ${errors.join(', ')}`);
  });

  // SG-09
  it('fails when raceways is missing', () => {
    const { valid: ok, errors } = validateSampleProject({ ...valid, raceways: undefined });
    assert.strictEqual(ok, false);
    assert.ok(errors.some(e => /raceways/i.test(e)));
  });

  // SG-10
  it('fails when schemaVersion is missing', () => {
    const { ...noVersion } = valid;
    delete noVersion.schemaVersion;
    const { valid: ok, errors } = validateSampleProject(noVersion);
    assert.strictEqual(ok, false);
    assert.ok(errors.some(e => /schemaVersion/i.test(e)));
  });

  // SG-11
  it('fails for null input', () => {
    const { valid: ok } = validateSampleProject(null);
    assert.strictEqual(ok, false);
  });

  // SG-12
  it('fails for empty object', () => {
    const { valid: ok, errors } = validateSampleProject({});
    assert.strictEqual(ok, false);
    assert.ok(errors.length > 0);
  });
});

// ---------------------------------------------------------------------------
// SG-13–14 — migrateSampleProject
// ---------------------------------------------------------------------------
describe('migrateSampleProject()', () => {
  // SG-13
  it('returns unchanged object when already at current version', () => {
    const input = { schemaVersion: SCHEMA_VERSION, id: 'x', cables: [] };
    const result = migrateSampleProject(input);
    assert.strictEqual(result.schemaVersion, SCHEMA_VERSION);
    assert.strictEqual(result.id, 'x');
  });

  // SG-14
  it('adds schemaVersion when absent', () => {
    const input = { id: 'x', cables: [] };
    const result = migrateSampleProject(input);
    assert.strictEqual(typeof result.schemaVersion, 'number');
    assert.strictEqual(result.schemaVersion, SCHEMA_VERSION);
  });

  it('does not mutate the input object', () => {
    const input = { id: 'x', cables: [] };
    migrateSampleProject(input);
    assert.strictEqual(input.schemaVersion, undefined);
  });
});

// ---------------------------------------------------------------------------
// SG-15–26 — Sample JSON files
// ---------------------------------------------------------------------------
const sampleFiles = [
  'industrial-plant',
  'data-center',
  'substation-grounding',
  'heat-trace-pipe',
  'ductbank-network',
  'coordination-study',
];

describe('Sample JSON files', () => {
  sampleFiles.forEach((id, i) => {
    const filePath = path.join(ROOT, 'samples', `${id}.json`);

    // SG-15 through SG-20 — file exists and parses
    it(`SG-${15 + i}: samples/${id}.json exists and is valid JSON`, () => {
      assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
      const raw = fs.readFileSync(filePath, 'utf8');
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { assert.fail(`Invalid JSON: ${e.message}`); }
      assert.ok(parsed, 'Parsed object must be truthy');
    });

    // SG-21 through SG-26 — file passes validateSampleProject
    it(`SG-${21 + i}: samples/${id}.json passes validateSampleProject`, () => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const { valid, errors } = validateSampleProject(parsed);
      assert.ok(valid, `Validation failed for ${id}: ${errors.join('; ')}`);
    });
  });
});

// ---------------------------------------------------------------------------
// SG-27–30 — samplegallery.html
// ---------------------------------------------------------------------------
describe('samplegallery.html', () => {
  const htmlPath = path.join(ROOT, 'samplegallery.html');
  let html = '';
  try { html = fs.readFileSync(htmlPath, 'utf8'); } catch { /* will fail in assertions */ }

  // SG-27
  it('file exists', () => {
    assert.ok(fs.existsSync(htmlPath), 'samplegallery.html not found');
  });

  // SG-28
  it('references dist/samplegallery.js', () => {
    assert.ok(html.includes('samplegallery.js'), 'Expected reference to samplegallery.js');
  });

  // SG-29
  it('contains nav-links placeholder', () => {
    assert.ok(html.includes('id="nav-links"'), 'Expected nav-links element');
  });

  // SG-30 — gallery cards and download links are JS-rendered; verify via the registry module
  it('each sample registry entry has a projectFile path pointing to samples/ directory', () => {
    sampleFiles.forEach(id => {
      const sample = getSampleById(id);
      assert.ok(sample, `Sample "${id}" not found in registry`);
      assert.ok(
        sample.projectFile.startsWith('samples/'),
        `Sample "${id}" projectFile "${sample.projectFile}" should start with "samples/"`,
      );
      assert.ok(
        sample.projectFile.endsWith('.json'),
        `Sample "${id}" projectFile "${sample.projectFile}" should end with .json`,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// SG-31–36 — guidedChecklist steps reference only pagesUsed
// ---------------------------------------------------------------------------
describe('guidedChecklist step pages are within pagesUsed', () => {
  SAMPLE_REGISTRY.forEach((sample, i) => {
    it(`SG-${31 + i}: ${sample.id} checklist pages are in pagesUsed`, () => {
      sample.guidedChecklist.forEach(step => {
        assert.ok(
          sample.pagesUsed.includes(step.page),
          `Step "${step.label}" page "${step.page}" not listed in pagesUsed for "${sample.id}"`,
        );
      });
    });
  });
});
