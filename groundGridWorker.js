// Module worker for IEEE 80-2013 ground grid analysis.
// Mirrors thermalWorker.js's shape: self.onmessage routes incoming messages
// and self.postMessage sends results back. The clean boundary is
// analysis/groundGrid.mjs, which is already pure — the worker just imports
// it and dispatches by op name. Each reply carries the request id so the
// client (src/workers/groundGridClient.js) can correlate concurrent calls.
import {
  analyzeGroundGrid,
  analyzeGroundGridWithSoil,
  analyzeIrregularGrid,
} from './analysis/groundGrid.mjs';
import { handleWorkerMessage } from './src/workers/createWorkerClient.js';

handleWorkerMessage(self, {
  analyzeGroundGrid,
  analyzeGroundGridWithSoil,
  analyzeIrregularGrid,
});
