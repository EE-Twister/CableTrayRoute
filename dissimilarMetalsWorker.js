// Module worker for dissimilar-metals galvanic corrosion screening.
// Clean boundary: the analysis primitives (estimateDissimilarMetalsRisk,
// buildCorrosionTimelineState, and the report-shape helpers) are exported
// from dissimilarmetals.js. That file guards its DOM bootstrap behind a
// `typeof document !== 'undefined'` check, so importing it from a worker
// loads the pure exports without touching the document.
import {
  estimateDissimilarMetalsRisk,
  buildCorrosionTimelineState,
  buildMitigationComparisonRows,
  buildInspectionMilestones,
  buildAssumptionRows,
  buildResultSummary,
  buildResultExportPayload,
} from './dissimilarmetals.js';
import { handleWorkerMessage } from './src/workers/createWorkerClient.js';

handleWorkerMessage(self, {
  estimateDissimilarMetalsRisk,
  buildCorrosionTimelineState,
  buildMitigationComparisonRows,
  buildInspectionMilestones,
  buildAssumptionRows,
  buildResultSummary,
  buildResultExportPayload,
});
