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
const ANALYSIS_DIR = path.join(ROOT, 'analysis');
const BENCHMARKS_FILE = path.join(ROOT, 'data', 'validationBenchmarks.json');
const OUTPUT_FILE = path.join(ROOT, 'dist', 'validationManifest.json');
const TEST_FILE_RE = /\.(?:test|spec)\.(?:mjs|cjs|js)$/;
const ANALYSIS_MODULE_RE = /\.(?:mjs|cjs|js)$/;
const ANALYSIS_INFRASTRUCTURE = new Set([
  'analysis/benchmarkLibrary.mjs',
  'analysis/benchmarkRunner.mjs',
]);

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

  if (!fs.existsSync(TESTS_DIR) && !fs.existsSync(ANALYSIS_DIR)) {
    console.warn('[manifest] no Node test roots found — skipping suite collection');
    return suites;
  }

  // Recursively collect Node test files from the same roots used by test:full.
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (TEST_FILE_RE.test(entry.name)) {
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

  if (fs.existsSync(TESTS_DIR)) {
    walk(TESTS_DIR);
  }

  if (fs.existsSync(ANALYSIS_DIR)) {
    walk(ANALYSIS_DIR);
  }

  return suites;
}

function collectAnalysisModules() {
  const modules = [];
  if (!fs.existsSync(ANALYSIS_DIR)) return modules;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
      } else if (ANALYSIS_MODULE_RE.test(entry.name) && !TEST_FILE_RE.test(entry.name)) {
        const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');
        if (!ANALYSIS_INFRASTRUCTURE.has(relativePath)) modules.push(relativePath);
      }
    }
  }

  walk(ANALYSIS_DIR);
  return modules.sort();
}

function buildEvidenceCoverage(benchmarks, evidenceLedger, evidenceMethodology) {
  const analysisModules = collectAnalysisModules();
  const publishedClasses = new Set(evidenceMethodology?.publishedEvidenceClasses || []);
  const evidenceByModule = new Map(analysisModules.map(module => [module, []]));

  for (const benchmark of benchmarks || []) {
    const evidence = evidenceLedger?.[benchmark.id];
    for (const module of evidence?.implementationModules || []) {
      if (!evidenceByModule.has(module)) evidenceByModule.set(module, []);
      evidenceByModule.get(module).push({
        benchmarkId: benchmark.id,
        evidenceClass: evidence.evidenceClass,
        evidenceStrength: evidence.evidenceStrength,
        published: publishedClasses.has(evidence.evidenceClass),
      });
    }
  }

  const moduleEvidence = analysisModules.map(module => ({
    module,
    evidence: evidenceByModule.get(module) || [],
  }));
  const modulesWithAnyEvidence = moduleEvidence.filter(item => item.evidence.length > 0).length;
  const modulesWithPublishedEvidence = moduleEvidence.filter(item =>
    item.evidence.some(evidence => evidence.published)
  ).length;
  const publishedBenchmarkCount = (benchmarks || []).filter(benchmark =>
    publishedClasses.has(evidenceLedger?.[benchmark.id]?.evidenceClass)
  ).length;

  return {
    analysisModuleCount: analysisModules.length,
    modulesWithAnyEvidence,
    modulesWithPublishedEvidence,
    modulesWithoutPublishedEvidence: analysisModules.length - modulesWithPublishedEvidence,
    publishedEvidencePercent: analysisModules.length
      ? Number((modulesWithPublishedEvidence / analysisModules.length * 100).toFixed(1))
      : 0,
    publishedBenchmarkCount,
    moduleEvidence,
  };
}

// ---------------------------------------------------------------------------
// Load benchmarks
// ---------------------------------------------------------------------------

function loadBenchmarks() {
  if (!fs.existsSync(BENCHMARKS_FILE)) {
    console.warn('[manifest] data/validationBenchmarks.json not found');
    return { benchmarks: [], standards: [], necComplianceMatrix: [], evidenceLedger: {}, evidenceMethodology: {} };
  }
  return JSON.parse(fs.readFileSync(BENCHMARKS_FILE, 'utf8'));
}

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

function buildManifest() {
  const suites = collectTestSuites();
  const {
    benchmarks,
    standards,
    necComplianceMatrix,
    evidenceLedger,
    evidenceMethodology,
  } = loadBenchmarks();

  const totalAssertions = suites.reduce((s, t) => s + t.assertionCount, 0);
  const evidenceCoverage = buildEvidenceCoverage(benchmarks, evidenceLedger, evidenceMethodology);
  const enrichedBenchmarks = (benchmarks || []).map(benchmark => ({
    ...benchmark,
    evidence: evidenceLedger?.[benchmark.id] || null,
  }));

  const manifest = {
    generatedAt: new Date().toISOString(),
    summary: {
      testSuiteCount: suites.length,
      totalAssertions,
      benchmarkCount: benchmarks ? benchmarks.length : 0,
      publishedBenchmarkCount: evidenceCoverage.publishedBenchmarkCount,
      analysisModuleCount: evidenceCoverage.analysisModuleCount,
      analysisModulesWithPublishedEvidence: evidenceCoverage.modulesWithPublishedEvidence,
      publishedEvidencePercent: evidenceCoverage.publishedEvidencePercent,
      standardCount: standards ? standards.length : 0,
      necComplianceCount: necComplianceMatrix ? necComplianceMatrix.length : 0,
    },
    testSuites: suites,
    benchmarks: enrichedBenchmarks,
    standards: standards || [],
    necComplianceMatrix: necComplianceMatrix || [],
    evidenceMethodology: evidenceMethodology || {},
    evidenceCoverage,
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
