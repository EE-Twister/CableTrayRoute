// Module worker for heat-trace circuit sizing and reporting.
// Clean boundary: analysis/heatTraceSizing.mjs + analysis/heatTraceReport.mjs
// are pure ES modules with no DOM dependencies. The worker imports them
// directly and routes each incoming request id back on its reply so the
// client (src/workers/heatTraceClient.js) can correlate concurrent calls.
import {
  runHeatTraceSizingAnalysis,
  selectHeatTraceProduct,
  buildLineList,
  buildHeatTraceBOM,
  buildControllerSchedule,
} from './analysis/heatTraceSizing.mjs';
import {
  buildHeatTraceBranchSchedule,
  buildHeatTraceReport,
} from './analysis/heatTraceReport.mjs';
import { handleWorkerMessage } from './src/workers/createWorkerClient.js';

handleWorkerMessage(self, {
  runHeatTraceSizingAnalysis,
  selectHeatTraceProduct,
  buildLineList,
  buildHeatTraceBOM,
  buildControllerSchedule,
  buildHeatTraceBranchSchedule,
  buildHeatTraceReport,
});
