// Module worker for the one-line diagram study analyses.
// Clean boundary: analysis/loadFlow.js, analysis/loadFlowModel.js,
// analysis/shortCircuit.mjs, and analysis/reliability.js are pure ES
// modules (their dataStore imports are defensively guarded so the worker
// scope can load them without a localStorage shim). The main thread reads
// the active diagram with getOneLine() and ships it through, so the worker
// never depends on browser storage state.
import { runLoadFlow as runLoadFlowAnalysis } from './analysis/loadFlow.js';
import { buildLoadFlowModel } from './analysis/loadFlowModel.js';
import { runShortCircuit as runShortCircuitAnalysis } from './analysis/shortCircuit.mjs';
import { runReliability } from './analysis/reliability.js';
import { handleWorkerMessage } from './src/workers/createWorkerClient.js';

function extractDiagramComponents(oneLineData) {
  const sheets = Array.isArray(oneLineData?.sheets) ? oneLineData.sheets : [];
  const hasNestedComponents = Array.isArray(sheets[0]?.components);
  const components = hasNestedComponents
    ? sheets.flatMap(sheet => (Array.isArray(sheet?.components) ? sheet.components : []))
    : sheets;
  return components.filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
}

handleWorkerMessage(self, {
  runLoadFlow(oneLineData, opts) {
    const model = buildLoadFlowModel(oneLineData || {});
    return runLoadFlowAnalysis(model, opts || {});
  },
  runShortCircuit(oneLineData, opts) {
    const comps = extractDiagramComponents(oneLineData);
    return runShortCircuitAnalysis(comps, opts || {});
  },
  runReliability,
});
