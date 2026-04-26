/**
 * generateValidationManifest.cjs
 *
 * Build-time script that:
 * 1. Reads tests/ directory to enumerate test suites (file name + describe blocks + assertion counts)
 * 2. Reads data/validationBenchmarks.json for benchmark definitions
 * 3. Writes dist/validationManifest.json with combined evidence for the public Trust Center
 *
 * Run: node scripts/generateValidationManifest.cjs
 * Output: dist/validationManifest.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const BENCHMARKS_FILE = path.join(ROOT, 'data', 'validationBenchmarks.json');
const OUTPUT_FILE = path.join(ROOT, 'dist', 'validationManifest.json');

// ---------------------------------------------------------------------------
// Parse test files for group names and assertion counts
// ---------------------------------------------------------------------------

/**
 * Count approximate assertion occurrences in test source.
 * Matches assert(), assertEqual(), ok(), throws(), strictEqual(), deepEqual() etc.
 */
function countAssertions(src) {
  const matches = src.match(/\bassert\s*[\.(]/g) || [];
  return matches.length;
}

/**
 * Extract describe() block labels from test source.
 */
function extractGroups(src) {
  const groups = [];
  const re = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    groups.push(m[1]);
  }
  return groups;
}

function collectTestSuites() {
  const suites = [];

  if (!fs.existsSync(TESTS_DIR)) {
    console.warn('[manifest] tests/ directory not found — skipping suite collection');
    return suites;
  }

  // Recursively collect .test.mjs and .test.cjs files
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (/\.test\.(mjs|cjs)$/.test(entry.name)) {
        const filePath = path.join(dir, entry.name);
        const src = fs.readFileSync(filePath, 'utf8');
        suites.push({
          file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
          groups: extractGroups(src),
          assertionCount: countAssertions(src),
        });
      }
    }
  }

  walk(TESTS_DIR);

  // Also collect analysis-level tests sitting in analysis/ directory
  const analysisDir = path.join(ROOT, 'analysis');
  if (fs.existsSync(analysisDir)) {
    for (const entry of fs.readdirSync(analysisDir)) {
      if (/\.test\.(mjs|cjs)$/.test(entry)) {
        const filePath = path.join(analysisDir, entry);
        const src = fs.readFileSync(filePath, 'utf8');
        suites.push({
          file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
          groups: extractGroups(src),
          assertionCount: countAssertions(src),
        });
      }
    }
  }

  return suites;
}

// ---------------------------------------------------------------------------
// Load benchmarks
// ---------------------------------------------------------------------------

function loadBenchmarks() {
  if (!fs.existsSync(BENCHMARKS_FILE)) {
    console.warn('[manifest] data/validationBenchmarks.json not found');
    return { benchmarks: [], standards: [] };
  }
  return JSON.parse(fs.readFileSync(BENCHMARKS_FILE, 'utf8'));
}

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

function buildManifest() {
  const suites = collectTestSuites();
  const { benchmarks, standards } = loadBenchmarks();

  const totalAssertions = suites.reduce((s, t) => s + t.assertionCount, 0);

  const manifest = {
    generatedAt: new Date().toISOString(),
    summary: {
      testSuiteCount: suites.length,
      totalAssertions,
      benchmarkCount: benchmarks ? benchmarks.length : 0,
      standardCount: standards ? standards.length : 0,
    },
    testSuites: suites,
    benchmarks: benchmarks || [],
    standards: standards || [],
  };

  // Ensure dist/ exists
  const distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(
    `[manifest] Written ${OUTPUT_FILE} — ${suites.length} suites, ` +
    `${totalAssertions} assertions, ${manifest.summary.benchmarkCount} benchmarks`
  );

  return manifest;
}

buildManifest();
