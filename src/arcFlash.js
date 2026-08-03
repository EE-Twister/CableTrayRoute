import '../site.js';
import './projectManager.js';
import '../studies/arcFlash.js';
import './workflowStatus.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';
import { initStudyBasisPanel } from './components/studyBasis.js';

document.addEventListener('DOMContentLoaded', () => {
  initStudyBasisPanel('arcFlash', {
    standard: 'IEEE 1584-2018',
    clause: 'Section 4 - Arcing current and incident energy',
    formulas: [
      'I_af = f(Ibf, V_oc, G, config) - empirical arcing current model',
      'E = 4.184 Cf En (t/0.2) (610^x / D^x) - incident energy (cal/cm2)',
      'AFB = (4.184 Cf En t / E_limit)^(1/x) x 610 - arc flash boundary (mm)',
    ],
    assumptions: [
      'Bolted fault current from the system short-circuit model',
      'Person perpendicular to arc source at stated working distance',
      'Three-phase balanced system; single-phase not covered',
    ],
    limitations: [
      'Validated for 208 V - 15 kV only (outside this range is extrapolation)',
      'Does not cover DC arc flash - use NFPA 70E Annex D.8',
      'Incident energy assumes no arc in a box for open-air configurations',
    ],
    benchmarkId: 'ieee1584-arc-flash',
  });
  initStudyApprovalPanel('arcFlash');
});
