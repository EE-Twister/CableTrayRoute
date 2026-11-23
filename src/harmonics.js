import './components/navigation.js';
import '../analysis/harmonics.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';
import { initFrequencyScanPanel } from './components/frequencyScanPanel.js';
import { initStudyLifecycle } from './components/studyLifecycle.js';

export {
  getOneLine,
  getStudies,
  getProjectMeta,
  setProjectMeta,
  setStudies,
  captureStudyRunContext,
  saveStudyResult,
} from '../dataStore.mjs';
export { frequencyScan, runHarmonicsUnbalanced } from '../analysis/harmonics.js';

document.addEventListener('DOMContentLoaded', () => initStudyApprovalPanel('harmonics'));
document.addEventListener('DOMContentLoaded', () => initFrequencyScanPanel());
document.addEventListener('DOMContentLoaded', initStudyLifecycle);
