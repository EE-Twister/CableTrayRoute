import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ORIGINAL_ENTRYPOINT_BASELINES = Object.freeze({
  'oneline.js': 20852,
  'analysis/tcc.js': 11308,
  'app.mjs': 6734,
  'ductbankroute.js': 5377,
  'cableschedule.js': 3644,
  'cathodicprotection.js': 3401,
  'src/panelSchedule.js': 3234,
  'site.js': 2974
});

export const ENTRYPOINT_BUDGETS = Object.freeze({
  'oneline.js': 13175,
  'analysis/tcc.js': 4306,
  'app.mjs': 4453,
  'ductbankroute.js': 5230,
  'cableschedule.js': 3266,
  'cathodicprotection.js': 2764,
  'src/panelSchedule.js': 2725,
  'site.js': 2825
});

export const REQUIRED_BOUNDARIES = Object.freeze({
  'oneline.js': [
    './src/one-line/protectionZones.mjs',
    './src/one-line/protectionZonePanel.mjs',
    './src/one-line/renderPerformance.js',
    './src/one-line/diagramModel.mjs',
    './src/one-line/componentPropertyModel.mjs',
    './src/one-line/connectionRouting.mjs',
    './src/one-line/propertyEditorController.mjs',
    './src/one-line/connectionRenderController.mjs',
    './src/one-line/componentNodeRenderController.mjs',
    './src/one-line/propertyDetailView.mjs',
    './src/one-line/studyExecutionController.mjs',
    './src/one-line/eventBindingController.mjs',
    './src/protectiveDevices/catalogLoader.mjs'
  ],
  'analysis/tcc.js': [
    './tcc/viewModel.mjs',
    './tcc/customCurveModel.mjs',
    './tcc/plotDomainModel.mjs',
    './tcc/catalogSelectionModel.mjs',
    './tcc/equipmentConstraintModel.mjs',
    './tcc/equipmentOverlayModel.mjs',
    './tcc/persistenceModel.mjs',
    './tcc/chartRenderer.mjs',
    './tcc/customCurveBuilderView.mjs',
    './tcc/deviceSelectionModal.mjs',
    './tcc/componentBrowserModal.mjs',
    './tcc/oneLinePreviewView.mjs',
    '../src/protectiveDevices/catalogLoader.mjs',
    '../src/protectiveDevices/tccCatalogHydrator.mjs'
  ],
  'app.mjs': [
    './src/routing/routingState.mjs',
    './src/routing/routeReviewModel.mjs',
    './src/routing/routeReviewView.mjs',
    './src/routing/routeDetailView.mjs',
    './src/routing/racewaySizingModel.mjs',
    './src/routing/routingReadinessModel.mjs',
    './src/routing/routingProjectAdapter.mjs',
    './src/routing/routingSamples.mjs',
    './src/routing/routeVisualizationModel.mjs',
    './src/routing/plotlyRouteScene.mjs',
    './src/routing/pullReviewView.mjs',
    './src/routing/manualEntryView.mjs',
    './src/components/incrementalDom.js',
    './src/htmlSafety.mjs'
  ],
  'ductbankroute.js': [
    './src/ductbankProjectAdapter.mjs',
    './src/ductbank-route/thermalPrimitives.js',
    './src/ductbank-route/ampacityModel.js'
  ],
  'cableschedule.js': [
    './src/cable-schedule/io.js',
    './src/cable-schedule/printReport.js',
    './src/cable-schedule/optionModel.js',
    './src/cable-schedule/templateModel.js',
    './src/cable-schedule/tagModel.js',
    './src/cable-schedule/scheduleConfig.js'
  ],
  'cathodicprotection.js': [
    './src/studies/cp/distributionModel.js',
    './src/studies/cp/criteriaChecks.js',
    './src/studies/cp/interferenceAssessment.js',
    './src/studies/cp/coatingModel.js',
    './src/studies/cp/analysisEngine.js'
  ],
  'src/panelSchedule.js': [
    './panel-schedule/panelModel.js',
    './panel-schedule/phaseModel.js',
    './panel-schedule/breakerLayoutModel.js',
    './panel-schedule/phaseLoadModel.js'
  ],
  'site.js': [
    './src/projectFileCodec.js',
    './src/utils/domLifecycle.js',
    './src/homepageSummary.js',
    './src/autoSaveScheduler.js'
  ]
});

export const EXTRACTED_MODULE_BUDGETS = Object.freeze({
  'analysis/dissimilarMetalsModel.mjs': 833,
  'src/one-line/protectionZones.mjs': 122,
  'src/one-line/protectionZonePanel.mjs': 110,
  'src/one-line/renderPerformance.js': 80,
  'src/one-line/scheduleCollectionCache.js': 8,
  'src/one-line/builtInComponentCatalog.mjs': 115,
  'src/one-line/componentAttributes.mjs': 135,
  'src/one-line/componentGeometry.mjs': 212,
  'src/one-line/componentNodeRenderController.mjs': 548,
  'src/one-line/componentPropertyModel.mjs': 96,
  'src/one-line/connectionRenderController.mjs': 234,
  'src/one-line/connectionRouting.mjs': 310,
  'src/one-line/datablockLayout.mjs': 119,
  'src/one-line/diagramFileController.mjs': 182,
  'src/one-line/diagramModel.mjs': 220,
  'src/one-line/eventBindingController.mjs': 2155,
  'src/one-line/harmonicProfiles.mjs': 190,
  'src/one-line/historyController.mjs': 66,
  'src/one-line/liveTelemetryViewController.mjs': 237,
  'src/one-line/paletteController.mjs': 329,
  'src/one-line/propertyDetailView.mjs': 2332,
  'src/one-line/propertyEditorController.mjs': 252,
  'src/one-line/propertyEditorModel.mjs': 254,
  'src/one-line/sheetLinks.mjs': 56,
  'src/one-line/sheetPersistenceController.mjs': 147,
  'src/one-line/studyExecutionController.mjs': 217,
  'src/one-line/studyInputModel.mjs': 123,
  'src/one-line/studyPanelController.mjs': 155,
  'src/protectiveDevices/catalogLoader.mjs': 129,
  'src/protectiveDevices/tccCatalogHydrator.mjs': 48,
  'analysis/tcc/annotationModel.mjs': 93,
  'analysis/tcc/catalogPresentationModel.mjs': 219,
  'analysis/tcc/catalogSelectionModel.mjs': 43,
  'analysis/tcc/chartInteractionModel.mjs': 71,
  'analysis/tcc/chartRenderer.mjs': 1342,
  'analysis/tcc/componentBrowserModal.mjs': 578,
  'analysis/tcc/componentDetailModel.mjs': 208,
  'analysis/tcc/coordinationOrderView.mjs': 98,
  'analysis/tcc/customCurveBuilderView.mjs': 1629,
  'analysis/tcc/customCurveModel.mjs': 247,
  'analysis/tcc/deviceDetailView.mjs': 411,
  'analysis/tcc/deviceSelectionModal.mjs': 563,
  'analysis/tcc/equipmentConstraintModel.mjs': 167,
  'analysis/tcc/equipmentOverlayModel.mjs': 582,
  'analysis/tcc/oneLinePreviewView.mjs': 936,
  'analysis/tcc/persistenceModel.mjs': 69,
  'analysis/tcc/plotDomainModel.mjs': 77,
  'analysis/tcc/reportMarkupModel.mjs': 106,
  'analysis/tcc/settingModel.mjs': 227,
  'analysis/tcc/settingsView.mjs': 73,
  'analysis/tcc/viewModel.mjs': 155,
  'analysis/tcc/viewOptionsModal.mjs': 96,
  'src/routing/routingState.mjs': 37,
  'src/routing/routeReviewModel.mjs': 107,
  'src/routing/routeReviewView.mjs': 78,
  'src/routing/routeDetailView.mjs': 58,
  'src/routing/racewaySizingModel.mjs': 80,
  'src/routing/routingReadinessModel.mjs': 100,
  'src/routing/routingProjectAdapter.mjs': 332,
  'src/routing/routingSamples.mjs': 155,
  'src/routing/routeVisualizationModel.mjs': 134,
  'src/routing/plotlyRouteScene.mjs': 326,
  'src/routing/pullReviewView.mjs': 189,
  'src/routing/manualEntryView.mjs': 164,
  'src/components/incrementalDom.js': 26,
  'src/htmlSafety.mjs': 22,
  'src/projectFileCodec.js': 84,
  'src/homepageSummary.js': 145,
  'src/autoSaveScheduler.js': 45,
  'src/panel-schedule/panelModel.js': 93,
  'src/panel-schedule/phaseModel.js': 91,
  'src/panel-schedule/breakerLayoutModel.js': 360,
  'src/panel-schedule/phaseLoadModel.js': 176,
  'src/cable-schedule/optionModel.js': 36,
  'src/cable-schedule/templateModel.js': 155,
  'src/cable-schedule/tagModel.js': 60,
  'src/cable-schedule/scheduleConfig.js': 206,
  'src/ductbank-route/thermalPrimitives.js': 71,
  'src/ductbank-route/ampacityModel.js': 239,
  'src/studies/cp/analysisEngine.js': 652
});

export const DOM_FREE_MODULES = Object.freeze([
  'analysis/dissimilarMetalsModel.mjs',
  'analysis/tcc/catalogSelectionModel.mjs',
  'analysis/tcc/annotationModel.mjs',
  'analysis/tcc/catalogPresentationModel.mjs',
  'analysis/tcc/chartInteractionModel.mjs',
  'analysis/tcc/componentDetailModel.mjs',
  'analysis/tcc/customCurveModel.mjs',
  'analysis/tcc/equipmentConstraintModel.mjs',
  'analysis/tcc/equipmentOverlayModel.mjs',
  'analysis/tcc/persistenceModel.mjs',
  'analysis/tcc/plotDomainModel.mjs',
  'analysis/tcc/settingModel.mjs',
  'analysis/tcc/viewModel.mjs',
  'src/autoSaveScheduler.js',
  'src/studies/cp/analysisEngine.js',
  'src/studies/cp/coatingModel.js',
  'src/studies/cp/criteriaChecks.js',
  'src/studies/cp/distributionModel.js',
  'src/studies/cp/interferenceAssessment.js',
  'src/ductbank-route/ampacityModel.js',
  'src/ductbank-route/thermalPrimitives.js',
  'src/homepageSummary.js',
  'src/cable-schedule/optionModel.js',
  'src/cable-schedule/scheduleConfig.js',
  'src/cable-schedule/tagModel.js',
  'src/cable-schedule/templateModel.js',
  'src/panel-schedule/breakerLayoutModel.js',
  'src/panel-schedule/panelModel.js',
  'src/panel-schedule/phaseLoadModel.js',
  'src/panel-schedule/phaseModel.js',
  'src/one-line/builtInComponentCatalog.mjs',
  'src/one-line/componentAttributes.mjs',
  'src/one-line/componentGeometry.mjs',
  'src/one-line/componentPropertyModel.mjs',
  'src/one-line/connectionRouting.mjs',
  'src/one-line/datablockLayout.mjs',
  'src/one-line/diagramModel.mjs',
  'src/one-line/harmonicProfiles.mjs',
  'src/one-line/historyController.mjs',
  'src/one-line/propertyEditorModel.mjs',
  'src/one-line/protectionZones.mjs',
  'src/one-line/sheetLinks.mjs',
  'src/one-line/studyInputModel.mjs',
  'src/routing/projectHash.mjs',
  'src/routing/racewaySizingModel.mjs',
  'src/routing/routeBreakdown.mjs',
  'src/routing/routeReviewModel.mjs',
  'src/routing/routeSceneModel.mjs',
  'src/routing/routeVisualizationModel.mjs',
  'src/routing/routingProjectAdapter.mjs',
  'src/routing/routingReadinessModel.mjs',
  'src/routing/routingSamples.mjs',
  'src/routing/routingState.mjs'
]);

const FORBIDDEN_MODEL_GLOBALS = Object.freeze([
  ['document', /\bdocument\s*(?:\.|\[)/],
  ['window', /\bwindow\s*(?:\.|\[)/],
  ['DOM creation', /\.\s*createElement(?:NS)?\s*\(/],
  ['ownerDocument', /\.\s*ownerDocument\b/],
  ['animation frame', /\b(?:requestAnimationFrame|cancelAnimationFrame)\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/]
]);

const FORBIDDEN_MODEL_IMPORTS = Object.freeze([
  'dataStore.mjs',
  'projectStorage.js',
  'site.js',
  'oneline.js',
  'analysis/tcc.js'
]);

export function countSourceLines(source) {
  const normalized = String(source || '').trimEnd();
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

export async function inspectArchitectureBoundaries(baseDir = root) {
  const failures = [];
  const measurements = {};
  const allBudgets = { ...ENTRYPOINT_BUDGETS, ...EXTRACTED_MODULE_BUDGETS };

  Object.entries(ORIGINAL_ENTRYPOINT_BASELINES).forEach(([relativePath, baseline]) => {
    const budget = ENTRYPOINT_BUDGETS[relativePath];
    if (!Number.isFinite(budget)) failures.push(`${relativePath}: missing entrypoint budget`);
    else if (budget >= baseline) failures.push(`${relativePath}: ${budget}-line budget must remain below the immutable ${baseline}-line baseline`);
  });

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

  for (const relativePath of DOM_FREE_MODULES) {
    const absolutePath = path.join(baseDir, relativePath);
    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      failures.push(`${relativePath}: unable to inspect DOM-free boundary (${error.code || error.message})`);
      continue;
    }
    FORBIDDEN_MODEL_GLOBALS.forEach(([label, pattern]) => {
      if (pattern.test(source)) failures.push(`${relativePath}: DOM-free model references ${label}`);
    });
    const importSpecifiers = [...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
    importSpecifiers.forEach(specifier => {
      const normalizedSpecifier = specifier.replace(/\\/g, '/');
      const forbiddenTarget = FORBIDDEN_MODEL_IMPORTS.find(target => normalizedSpecifier.endsWith(target));
      if (forbiddenTarget) failures.push(`${relativePath}: DOM-free model imports forbidden runtime module ${forbiddenTarget}`);
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
