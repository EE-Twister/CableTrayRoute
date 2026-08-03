import '../site.js';
import './projectManager.js';
import '../studies/shortCircuit.js';
import './workflowStatus.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';
import { initStudyBasisPanel } from './components/studyBasis.js';

document.addEventListener('DOMContentLoaded', () => {
  initStudyBasisPanel('shortCircuit', {
    standard: 'ANSI C37 / IEC 60909',
    clause: 'Fault-current calculation at modeled buses',
    assumptions: [
      'Uses the active project One-Line model',
      'Results are saved to the active project',
      'Export occurs only when explicitly requested',
    ],
    limitations: ['Missing source or impedance data produces assumed inputs that require review'],
    benchmarkId: 'short-circuit-project-model',
  });
  initStudyApprovalPanel('shortCircuit');
});
