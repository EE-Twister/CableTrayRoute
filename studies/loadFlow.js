import { runLoadFlow } from '../analysis/loadFlow.js';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { downloadPDF } from '../reports/reporting.mjs';

/**
 * Run a Newton–Raphson power flow using network data from dataStore.
 * Results are stored in the global studies object and a PDF report is generated.
 * @param {{baseMVA?:number, balanced?:boolean}} opts
 * @returns {Object}
 */
function buildModel() {
  const { sheets } = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components || [])
    : sheets;
  let buses = comps.filter(c => c.subtype === 'Bus');
  if (buses.length === 0) buses = comps;
  const busIds = buses.map(b => b.id);
  const branches = [];
  buses.forEach(b => {
    (b.connections || []).forEach(conn => {
      if (!busIds.includes(conn.target)) return;
      branches.push({
        from: b.id,
        to: conn.target,
        impedance: conn.impedance || conn.cable || {},
        rating: conn.rating
      });
    });
  });
  return { buses, branches };
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
