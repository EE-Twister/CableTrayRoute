import './projectManager.js';
import '../studies/loadFlow.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => initStudyApprovalPanel('loadFlow'));
