import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { downloadPDF } from '../reports/reporting.mjs';

/**
 * Run a Newton–Raphson power flow using network data from dataStore.
 * Results are stored in the global studies object and a PDF report is generated.
 * @param {{baseMVA?:number, balanced?:boolean}} opts
 * @returns {Object}
 */
export function buildModel() {
  const oneLine = getOneLine();
  return buildLoadFlowModel(oneLine);
}

export function runLoadFlowStudy(opts = {}) {
  const model = buildModel();
  const res = runLoadFlow(model, opts);
  const studies = getStudies();
  studies.loadFlow = res;
  setStudies(studies);
  const headers = ['bus', 'Vm', 'Va'];
  const rows = res.buses.map(b => ({
    bus: b.id,
    Vm: Number(b.Vm.toFixed(4)),
    Va: Number(b.Va.toFixed(2))
  }));
  if (rows.length) {
    downloadPDF('Load Flow Report', headers, rows, 'loadflow.pdf');
  }
  return res;
}

// Browser hook: wire up form submission
if (typeof document !== 'undefined') {
  const form = document.getElementById('loadflow-form');
  const out = document.getElementById('loadflow-output');
  if (form && out) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const baseMVA = Number(form.baseMVA.value) || 100;
      const balanced = form.balanced.checked;
      const res = runLoadFlowStudy({ baseMVA, balanced });
      out.textContent = JSON.stringify(res, null, 2);
    });
  }
}
