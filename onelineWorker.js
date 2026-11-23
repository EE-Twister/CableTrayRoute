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
import { normalizeOneLineStudyInput } from './src/workers/oneLineNormalization.mjs';

handleWorkerMessage(self, {
  runLoadFlow(oneLineData, opts) {
    const normalized = normalizeOneLineStudyInput(oneLineData, opts);
    const model = buildLoadFlowModel(normalized.oneLine);
    return runLoadFlowAnalysis(model, normalized.options);
  },
  runShortCircuit(oneLineData, opts) {
    const normalized = normalizeOneLineStudyInput(oneLineData, opts);
    return runShortCircuitAnalysis(normalized.components, normalized.options);
  },
  runReliability,
});
