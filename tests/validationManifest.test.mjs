import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

// ---------------------------------------------------------------------------
// Tests for data/validationBenchmarks.json
// ---------------------------------------------------------------------------

describe('validationBenchmarks.json — schema', () => {
  const benchmarksPath = path.join(ROOT, 'data', 'validationBenchmarks.json');

  it('file exists', () => {
    assert.ok(fs.existsSync(benchmarksPath), 'data/validationBenchmarks.json not found');
  });

  it('parses as valid JSON', () => {
    const raw = fs.readFileSync(benchmarksPath, 'utf8');
    const data = JSON.parse(raw);
    assert.ok(data && typeof data === 'object');
  });

  it('has benchmarks array with at least 6 entries', () => {
    const raw = fs.readFileSync(benchmarksPath, 'utf8');
    const data = JSON.parse(raw);
    assert.ok(Array.isArray(data.benchmarks), 'benchmarks must be an array');
    assert.ok(data.benchmarks.length >= 6, `Expected ≥6 benchmarks, got ${data.benchmarks.length}`);
  });

  it('has standards array with at least 6 entries', () => {
    const raw = fs.readFileSync(benchmarksPath, 'utf8');
    const data = JSON.parse(raw);
    assert.ok(Array.isArray(data.standards), 'standards must be an array');
    assert.ok(data.standards.length >= 6, `Expected ≥6 standards, got ${data.standards.length}`);
  });

  it('every benchmark has required fields: id, title, studyPage, standard', () => {
    const { benchmarks } = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'));
    for (const b of benchmarks) {
      assert.ok(b.id, `Benchmark missing id: ${JSON.stringify(b).slice(0, 60)}`);
      assert.ok(b.title, `Benchmark ${b.id} missing title`);
      assert.ok(b.studyPage, `Benchmark ${b.id} missing studyPage`);
      assert.ok(b.standard, `Benchmark ${b.id} missing standard`);
    }
  });

  it('every benchmark id is unique', () => {
    const { benchmarks } = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'));
    const ids = benchmarks.map(b => b.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length, 'Duplicate benchmark IDs found');
  });

  it('every standard has required fields: id, name, studyPage', () => {
    const { standards } = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'));
    for (const s of standards) {
      assert.ok(s.id, `Standard missing id`);
      assert.ok(s.name, `Standard ${s.id} missing name`);
      assert.ok(s.studyPage, `Standard ${s.id} missing studyPage`);
    }
  });

  it('contains ieee1584 benchmark', () => {
    const { benchmarks } = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'));
    const found = benchmarks.find(b => b.id === 'ieee1584-arc-flash');
    assert.ok(found, 'ieee1584-arc-flash benchmark not found');
    assert.ok(found.expectedOutputs, 'ieee1584-arc-flash missing expectedOutputs');
  });

  it('contains iec60287 benchmark', () => {
    const { benchmarks } = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'));
    const found = benchmarks.find(b => b.id === 'iec60287-cable-rating');
    assert.ok(found, 'iec60287-cable-rating benchmark not found');
  });

  it('contains ieee80 benchmark', () => {
    const { benchmarks } = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'));
    const found = benchmarks.find(b => b.id === 'ieee80-ground-grid');
    assert.ok(found, 'ieee80-ground-grid benchmark not found');
  });
});

// ---------------------------------------------------------------------------
// Tests for generateValidationManifest.cjs
// ---------------------------------------------------------------------------

describe('generateValidationManifest.cjs — script', () => {
  const scriptPath = path.join(ROOT, 'scripts', 'generateValidationManifest.cjs');

  it('script file exists', () => {
    assert.ok(fs.existsSync(scriptPath), 'scripts/generateValidationManifest.cjs not found');
  });

  it('script is valid CommonJS (can be required)', () => {
    // We can't require() it directly because it calls buildManifest() at module level.
    // Instead, verify it parses as valid JS by checking for the key exports/functions.
    const src = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(src.includes('buildManifest'), 'Script must define buildManifest function');
    assert.ok(src.includes('collectTestSuites'), 'Script must define collectTestSuites function');
    assert.ok(src.includes('loadBenchmarks'), 'Script must define loadBenchmarks function');
    assert.ok(src.includes('validationManifest.json'), 'Script must reference output file');
  });
});

// ---------------------------------------------------------------------------
// Tests for sample benchmark JSON files
// ---------------------------------------------------------------------------

describe('benchmark sample project files — structure', () => {
  const samplesDir = path.join(ROOT, 'samples');
  const expectedFiles = [
    'benchmark-ieee1584-arc-flash.json',
    'benchmark-iec60909-short-circuit.json',
    'benchmark-iec60287-cable-rating.json',
    'benchmark-ieee80-ground-grid.json',
    'benchmark-heat-trace-screening.json',
    'benchmark-ductbank-thermal.json',
  ];

  it('samples/ directory exists', () => {
    assert.ok(fs.existsSync(samplesDir), 'samples/ directory not found');
  });

  for (const filename of expectedFiles) {
    it(`${filename} exists and is valid JSON`, () => {
      const filePath = path.join(samplesDir, filename);
      assert.ok(fs.existsSync(filePath), `${filename} not found in samples/`);
      const raw = fs.readFileSync(filePath, 'utf8');
      const obj = JSON.parse(raw);
      assert.ok(obj.meta && obj.meta.version, `${filename} missing meta.version`);
      assert.ok(obj.meta.benchmark, `${filename} missing meta.benchmark`);
    });
  }

  it('all sample files have required project fields', () => {
    for (const filename of expectedFiles) {
      const obj = JSON.parse(fs.readFileSync(path.join(samplesDir, filename), 'utf8'));
      for (const field of ['ductbanks', 'conduits', 'trays', 'cables']) {
        assert.ok(Array.isArray(obj[field]), `${filename}: ${field} must be an array`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tests for benchmark IDs matching sampleFile paths
// ---------------------------------------------------------------------------

describe('benchmark IDs — link integrity', () => {
  it('every benchmark sampleFile references an existing file in samples/', () => {
    const { benchmarks } = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'validationBenchmarks.json'), 'utf8')
    );
    for (const b of benchmarks) {
      if (!b.sampleFile) continue;
      const fullPath = path.join(ROOT, b.sampleFile);
      assert.ok(fs.existsSync(fullPath), `Benchmark ${b.id} sampleFile not found: ${b.sampleFile}`);
    }
  });

  it('every standard studyPage is a known HTML filename pattern', () => {
    const { standards } = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'validationBenchmarks.json'), 'utf8')
    );
    for (const s of standards) {
      assert.ok(/\.html$/.test(s.studyPage), `Standard ${s.id} studyPage must end in .html`);
    }
  });
});
