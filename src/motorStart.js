import './projectManager.js';
import '../analysis/motorStart.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';
import { initStudyLifecycle } from './components/studyLifecycle.js';

document.addEventListener('DOMContentLoaded', () => initStudyApprovalPanel('motorStart'));
document.addEventListener('DOMContentLoaded', initStudyLifecycle);
