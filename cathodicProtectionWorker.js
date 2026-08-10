// Module worker for cathodic protection analysis. Worker dispatch and the
// synchronous fallback share one frozen operation map.
import { CP_WORKER_OPERATIONS } from './src/studies/cp/workerOperations.js';
import { handleWorkerMessage } from './src/workers/createWorkerClient.js';

handleWorkerMessage(self, CP_WORKER_OPERATIONS);
