import './projectManager.js';
import '../analysis/harmonics.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';

export { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
export { frequencyScan, runHarmonicsUnbalanced } from '../analysis/harmonics.js';

document.addEventListener('DOMContentLoaded', () => initStudyApprovalPanel('harmonics'));
