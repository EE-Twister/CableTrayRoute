import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ENTRYPOINT_BUDGETS = Object.freeze({
  'oneline.js': 20852,
  'analysis/tcc.js': 11308,
  'app.mjs': 6734,
  'ductbankroute.js': 5377,
  'cableschedule.js': 3644,
  'cathodicprotection.js': 3401,
  'src/panelSchedule.js': 3234,
  'site.js': 2974
});

export const REQUIRED_BOUNDARIES = Object.freeze({
  'oneline.js': [
    './src/one-line/protectionZones.mjs',
    './src/one-line/protectionZonePanel.mjs',
    './src/one-line/renderPerformance.js',
    './src/protectiveDevices/catalogLoader.mjs'
  ],
  'analysis/tcc.js': [
    './tcc/viewModel.mjs',
    './tcc/customCurveModel.mjs',
    './tcc/plotDomainModel.mjs',
    './tcc/catalogSelectionModel.mjs',
    '../src/protectiveDevices/catalogLoader.mjs',
    '../src/protectiveDevices/tccCatalogHydrator.mjs'
  ],
  'app.mjs': [
    './src/routing/routingState.mjs',
    './src/routing/routeReviewModel.mjs',
    './src/routing/routeReviewView.mjs',
    './src/routing/routeDetailView.mjs',
    './src/components/incrementalDom.js',
    './src/htmlSafety.mjs'
  ],
  'ductbankroute.js': [
    './src/ductbankProjectAdapter.mjs',
    './src/ductbank-route/thermalPrimitives.js'
  ],
  'cableschedule.js': [
    './src/cable-schedule/io.js',
    './src/cable-schedule/printReport.js',
    './src/cable-schedule/optionModel.js'
  ],
  'cathodicprotection.js': [
    './src/studies/cp/distributionModel.js',
    './src/studies/cp/criteriaChecks.js',
    './src/studies/cp/interferenceAssessment.js',
    './src/studies/cp/coatingModel.js'
  ],
  'src/panelSchedule.js': [
    './panel-schedule/panelModel.js',
    './panel-schedule/phaseModel.js'
  ],
  'site.js': [
    './src/projectFileCodec.js',
    './src/utils/domLifecycle.js'
  ]
});

export const EXTRACTED_MODULE_BUDGETS = Object.freeze({
  'src/one-line/protectionZones.mjs': 160,
  'src/one-line/protectionZonePanel.mjs': 160,
  'src/one-line/renderPerformance.js': 80,
  'src/one-line/scheduleCollectionCache.js': 40,
  'src/protectiveDevices/catalogLoader.mjs': 150,
  'src/protectiveDevices/tccCatalogHydrator.mjs': 60,
  'analysis/tcc/viewModel.mjs': 220,
  'analysis/tcc/customCurveModel.mjs': 320,
  'analysis/tcc/plotDomainModel.mjs': 120,
  'analysis/tcc/catalogSelectionModel.mjs': 80,
  'src/routing/routingState.mjs': 80,
  'src/routing/routeReviewModel.mjs': 180,
  'src/routing/routeReviewView.mjs': 160,
  'src/routing/routeDetailView.mjs': 120,
  'src/components/incrementalDom.js': 60,
  'src/htmlSafety.mjs': 80,
  'src/projectFileCodec.js': 110,
  'src/panel-schedule/panelModel.js': 120,
  'src/panel-schedule/phaseModel.js': 120,
  'src/cable-schedule/optionModel.js': 70,
  'src/ductbank-route/thermalPrimitives.js': 100
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
