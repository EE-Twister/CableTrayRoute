import './projectManager.js';
import '../studies/contingency.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';
import { initStudyLifecycle } from './components/studyLifecycle.js';

document.addEventListener('DOMContentLoaded', () => initStudyApprovalPanel('contingency'));
document.addEventListener('DOMContentLoaded', initStudyLifecycle);
