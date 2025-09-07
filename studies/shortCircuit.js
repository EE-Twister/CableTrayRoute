import { runShortCircuit } from '../analysis/shortCircuit.js';
import { getStudies, setStudies } from '../dataStore.mjs';
import { downloadPDF } from '../reports/reporting.mjs';

/**
 * Execute an ANSI/IEC short‑circuit study using data from dataStore.
 * Results are saved and a PDF report is produced.
 * @param {{method?:string}} opts
 * @returns {Object}
 */
export function runShortCircuitStudy(opts = {}) {
  const res = runShortCircuit(opts);
  const studies = getStudies();
  studies.shortCircuit = res;
  setStudies(studies);
  const headers = ['bus', 'threePhaseKA', 'lineToGroundKA', 'lineToLineKA', 'doubleLineGroundKA'];
  const rows = Object.entries(res).map(([id, r]) => ({
    bus: id,
    threePhaseKA: r.threePhaseKA,
    lineToGroundKA: r.lineToGroundKA,
    lineToLineKA: r.lineToLineKA,
    doubleLineGroundKA: r.doubleLineGroundKA
  }));
  if (rows.length) {
    downloadPDF('Short Circuit Report', headers, rows, 'shortcircuit.pdf');
  }
  return res;
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('shortcircuit-form');
  const out = document.getElementById('shortcircuit-output');
  if (form && out) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const method = form.method.value;
      const res = runShortCircuitStudy({ method });
      out.textContent = JSON.stringify(res, null, 2);
    });
  }
}
