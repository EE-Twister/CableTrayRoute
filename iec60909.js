import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';
import { runShortCircuit } from './analysis/shortCircuit.mjs';
import { getOneLine, getStudies, setStudies } from './dataStore.mjs';
import { downloadPDF } from './reports/reporting.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initStudyBasisPanel('iec60909', {
    standard: 'IEC 60909-0:2016',
    clause: '§4 — Short-circuit current calculation',
    formulas: [
      'I″k3 = c × Un / (√3 × Zk) — initial symmetrical fault current',
      'ip = κ × √2 × I″k3 — peak current; κ = 1.02 + 0.98 e^(−3/(X/R))',
      'Ib = μ × I″kG + (I″k − I″kG) — symmetrical breaking current (§8)',
      'μ = a + b e^(−k · I″kG/I_rG) — decay factor, tabulated by t_min (§8.1.5.2)',
      'K_G = (Un/U_rG) · c_max / (1 + x″d · sin φ_rG) — generator correction (§6.6.1)',
      'K_T = 0.95 · c_max / (1 + 0.6 · x_T) — transformer correction (§6.3.3)',
      'Ith = I″k3 × √(m + n) — thermal equivalent short-time current',
    ],
    assumptions: [
      'Equivalent voltage source at fault location (no pre-fault load currents)',
      'Voltage factor c applied to nominal voltage per IEC 60909-0 Table 1',
      'K_G and K_T correct each element impedance before the cascade; they apply only when the IEC method is selected',
      'μ decays the synchronous-machine share of I″k; other infeed is carried through undecayed',
      'Minimum time delay t_min defaults to 0.05 s and is interpolated between the tabulated μ curves',
    ],
    limitations: [
      'Radial cascade: for a bus fed only by a synchronous machine the whole I″k is treated as the generator contribution. Meshed networks with several machines are not apportioned per source, so μ = 1 (conservative) unless one terminal machine dominates',
      'K_G assumes a generator connected without a unit transformer (no K_S / K_SO power-station-unit correction)',
      'Asynchronous (induction) generators are left uncorrected',
      'Unbalanced faults use simplified symmetrical-component method',
    ],
    benchmarkId: 'iec60909-short-circuit',
  });
  initStudyApprovalPanel('shortCircuit');
});

const form           = document.getElementById('iec60909-form');
const runBtn         = document.getElementById('run-btn');
const resultsSection = document.getElementById('results-section');
const tbody          = document.getElementById('results-tbody');
const metaEl         = document.getElementById('study-meta');
const pdfBtn         = document.getElementById('download-pdf-btn');
const csvBtn         = document.getElementById('download-csv-btn');

let lastResults = null;

function buildModel() {
  const { sheets } = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  let buses = comps.filter(c => c.subtype === 'Bus');
  if (buses.length === 0) buses = comps;
  return { buses };
}

function renderResults(res) {
  tbody.innerHTML = '';
  const entries = Object.entries(res);
  if (!entries.length) {
    metaEl.textContent = 'No bus components found in the current project.';
    return;
  }

  const sampleEntry = entries[0][1];
  metaEl.textContent =
    `Method: IEC 60909-0:2016 | c = ${sampleEntry.cFactor} | ` +
    `Voltage factor mode: ${form.cMode.value === 'max' ? 'Maximum (c_max)' : 'Minimum (c_min)'}`;

  for (const [id, r] of entries) {
    const tr = document.createElement('tr');
    const values = [
      id,
      r.prefaultKV,
      r.cFactor,
      r.kappa,
      r.threePhaseKA,
      r.lineToGroundKA,
      r.lineToLineKA,
      r.ip,
      r.mu == null ? '' : r.mu,
      r.Ib,
      r.Ith,
    ];
    values.forEach(value => {
      const td = document.createElement('td');
      td.textContent = value == null ? '' : String(value);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  resultsSection.hidden = false;
}

form.addEventListener('submit', ev => {
  ev.preventDefault();
  runBtn.disabled = true;
  try {
    const opts = {
      method: 'IEC',
      cMode: form.cMode.value,
      lvTolerancePct: Number(form.lvTolerancePct.value),
      faultDurationS: Number(form.faultDurationS.value),
      freqHz: Number(form.freqHz.value),
      minTimeDelayS: Number(form.minTimeDelayS.value),
    };
    const model = buildModel();
    const res = runShortCircuit(model, opts);
    lastResults = res;
    const studies = getStudies();
    studies.iec60909 = res;
    setStudies(studies);
    renderResults(res);
  } finally {
    runBtn.disabled = false;
  }
});

pdfBtn.addEventListener('click', () => {
  if (!lastResults) return;
  const headers = ['bus', 'prefaultKV', 'cFactor', 'kappa',
                   'threePhaseKA', 'lineToGroundKA', 'lineToLineKA',
                   'ip', 'mu', 'Ib', 'Ith'];
  const rows = Object.entries(lastResults).map(([id, r]) => ({
    bus: id, prefaultKV: r.prefaultKV, cFactor: r.cFactor, kappa: r.kappa,
    threePhaseKA: r.threePhaseKA, lineToGroundKA: r.lineToGroundKA,
    lineToLineKA: r.lineToLineKA, ip: r.ip, mu: r.mu, Ib: r.Ib, Ith: r.Ith,
  }));
  downloadPDF('IEC 60909-0:2016 Short-Circuit Report', headers, rows, 'iec60909.pdf');
});

csvBtn.addEventListener('click', () => {
  if (!lastResults) return;
  const cols = ['bus', 'prefaultKV', 'cFactor', 'kappa',
                'threePhaseKA_kA', 'lineToGroundKA_kA', 'lineToLineKA_kA',
                'ip_kA', 'mu', 'Ib_kA', 'Ith_kA'];
  const lines = [cols.join(',')];
  for (const [id, r] of Object.entries(lastResults)) {
    lines.push([id, r.prefaultKV, r.cFactor, r.kappa,
                r.threePhaseKA, r.lineToGroundKA, r.lineToLineKA,
                r.ip, r.mu, r.Ib, r.Ith].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'iec60909.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});
