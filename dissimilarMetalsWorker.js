// Module worker for dissimilar-metals galvanic corrosion screening.
// Clean boundary: workers import only the DOM-free analysis model. The page
// controller and its persistence/rendering dependencies stay out of the
// worker dependency graph.
import { DISSIMILAR_METALS_WORKER_OPERATIONS } from './analysis/dissimilarMetalsModel.mjs';
import { handleWorkerMessage } from './src/workers/createWorkerClient.js';

handleWorkerMessage(self, DISSIMILAR_METALS_WORKER_OPERATIONS);
