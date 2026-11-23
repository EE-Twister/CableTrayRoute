import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BUNDLE_BUDGETS = Object.freeze({
  'workflowdashboard.js': 1_000_000,
  'shortCircuit.js': 675_000,
  'iec60909.js': 670_000,
  'arcFlash.js': 665_000,
  'tcc.js': 1_020_000,
  'library.js': 200_000,
  // Lossless storage and its preservation guards add roughly 10 kB to these
  // entries; keeping the codec inline preserves their single startup request.
  'harmonics.js': 215_000,
  'loadFlow.js': 345_000,
  'motorStart.js': 225_000,
  'contingency.js': 340_000,
  'transientstability.js': 650_000,
  'equipmentevaluation.js': 1_000_000,
});

export function evaluateBundleSizes(sizes, budgets = BUNDLE_BUDGETS) {
  return Object.entries(budgets).flatMap(([file, budget]) => {
    const bytes = sizes[file];
    if (!Number.isFinite(bytes)) return [`${file} is missing`];
    if (bytes > budget) return [`${file} is ${bytes} bytes; budget is ${budget} bytes`];
    return [];
  });
}

export function inspectBundleBudgets(distDirectory = path.join(root, 'dist')) {
  const sizes = Object.fromEntries(Object.keys(BUNDLE_BUDGETS).map(file => {
    const filePath = path.join(distDirectory, file);
    return [file, fs.existsSync(filePath) ? fs.statSync(filePath).size : null];
  }));
  return { sizes, failures: evaluateBundleSizes(sizes) };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = inspectBundleBudgets();
  Object.entries(BUNDLE_BUDGETS).forEach(([file, budget]) => {
    const bytes = result.sizes[file];
    console.log(`[bundle-budget] ${file}: ${bytes ?? 'missing'}/${budget} bytes`);
  });
  if (result.failures.length) {
    result.failures.forEach(failure => console.error(`[bundle-budget] ${failure}`));
    process.exitCode = 1;
  } else {
    console.log('[bundle-budget] Protected entry bundles pass.');
  }
}
