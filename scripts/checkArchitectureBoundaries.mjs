import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ENTRYPOINT_BUDGETS = Object.freeze({
  'oneline.js': 20854,
  'analysis/tcc.js': 11361,
  'app.mjs': 6743
});

export const REQUIRED_BOUNDARIES = Object.freeze({
  'oneline.js': [
    './src/one-line/protectionZones.mjs',
    './src/one-line/protectionZonePanel.mjs'
  ],
  'analysis/tcc.js': [
    './tcc/viewModel.mjs',
    './tcc/customCurveModel.mjs'
  ],
  'app.mjs': [
    './src/routing/routingState.mjs',
    './src/routing/routeReviewModel.mjs',
    './src/routing/routeReviewView.mjs',
    './src/htmlSafety.mjs'
  ]
});

export const EXTRACTED_MODULE_BUDGETS = Object.freeze({
  'src/one-line/protectionZones.mjs': 160,
  'src/one-line/protectionZonePanel.mjs': 160,
  'analysis/tcc/viewModel.mjs': 220,
  'analysis/tcc/customCurveModel.mjs': 320,
  'src/routing/routingState.mjs': 80,
  'src/routing/routeReviewModel.mjs': 180,
  'src/routing/routeReviewView.mjs': 160,
  'src/htmlSafety.mjs': 80
});

export function countSourceLines(source) {
  const normalized = String(source || '').trimEnd();
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

export async function inspectArchitectureBoundaries(baseDir = root) {
  const failures = [];
  const measurements = {};
  const allBudgets = { ...ENTRYPOINT_BUDGETS, ...EXTRACTED_MODULE_BUDGETS };

  for (const [relativePath, budget] of Object.entries(allBudgets)) {
    const absolutePath = path.join(baseDir, relativePath);
    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      failures.push(`${relativePath}: unable to read (${error.code || error.message})`);
      continue;
    }
    const lines = countSourceLines(source);
    measurements[relativePath] = { lines, budget };
    if (lines > budget) failures.push(`${relativePath}: ${lines} lines exceeds the ${budget}-line budget`);

    const requiredImports = REQUIRED_BOUNDARIES[relativePath] || [];
    requiredImports.forEach(specifier => {
      const importPattern = new RegExp(`from\\s+['"]${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
      if (!importPattern.test(source)) failures.push(`${relativePath}: missing boundary import ${specifier}`);
    });
  }

  return { failures, measurements };
}

async function main() {
  const result = await inspectArchitectureBoundaries();
  Object.entries(result.measurements).forEach(([relativePath, { lines, budget }]) => {
    console.log(`[architecture] ${relativePath}: ${lines}/${budget} lines`);
  });
  if (result.failures.length) {
    result.failures.forEach(failure => console.error(`[architecture] ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log('[architecture] Entrypoint budgets and required module boundaries pass.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
