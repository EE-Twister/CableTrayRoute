import './projectManager.js';
import '../studies/loadFlow.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';
import { initStudyLifecycle } from './components/studyLifecycle.js';

document.addEventListener('DOMContentLoaded', () => initStudyApprovalPanel('loadFlow'));
document.addEventListener('DOMContentLoaded', initStudyLifecycle);
