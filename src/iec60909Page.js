import { initStudyApprovalPanel } from './components/studyApproval.js';
import { initStudyBasisPanel } from './components/studyBasis.js';
import { runShortCircuit } from '../analysis/shortCircuit.mjs';
import { getOneLine, getStudies, captureStudyRunContext, saveStudyResult, getProjectInputFingerprint } from '../dataStore.mjs';
import { downloadIEC60909PDF } from '../reports/iec60909Report.mjs';
import { loadReferencedProtectiveDevices } from './protectiveDevices/calculationCatalog.mjs';

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
let lastObservedFingerprint = '';

function buildInputFingerprint(options = {}) {
  return `${getProjectInputFingerprint()}|iec60909:${JSON.stringify({
    cMode: options.cMode ?? form?.cMode?.value ?? 'max',
    lvTolerancePct: options.lvTolerancePct ?? Number(form?.lvTolerancePct?.value),
    faultDurationS: options.faultDurationS ?? Number(form?.faultDurationS?.value),
    freqHz: options.freqHz ?? Number(form?.freqHz?.value),
    minTimeDelayS: options.minTimeDelayS ?? Number(form?.minTimeDelayS?.value),
  })}`;
}

const csvCell = value => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function resultFreshness(result) {
  if (!result?.inputFingerprint) return 'unknown';
  return result.inputFingerprint === buildInputFingerprint() ? 'fresh' : 'stale';
}

const isFaultResult = value => value && typeof value === 'object' && !Array.isArray(value)
  && ['threePhaseKA', 'lineToGroundKA', 'lineToLineKA', 'doubleLineGroundKA', 'validity', 'calculationStatus', 'requiredInputs'].some(key => Object.prototype.hasOwnProperty.call(value, key));

function buildModel() {
  const { sheets } = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  let buses = comps.filter(c => c.subtype === 'Bus');
  if (buses.length === 0) buses = comps;
  return { buses, components: comps };
}

function renderResults(res) {
  tbody.innerHTML = '';
  const entries = Object.entries(res).filter(([id, value]) => !id.startsWith('_') && isFaultResult(value));
  if (!entries.length) {
    metaEl.textContent = 'No bus components found in the current project.';
    return;
  }

  const sampleEntry = entries[0][1];
  metaEl.textContent =
    `Method: IEC 60909-0:2016 | c = ${sampleEntry.cFactor} | ` +
    `Voltage factor mode: ${sampleEntry.studyOptions?.cMode === 'max' ? 'Maximum (c_max)' : 'Minimum (c_min)'} | ` +
    `Status: ${sampleEntry.calculationStatus || 'screening-only'} | Freshness: ${resultFreshness(sampleEntry)}${sampleEntry.inputFingerprint && sampleEntry.inputFingerprint !== buildInputFingerprint() ? ' | STALE INPUTS' : ''}`;

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
      r.doubleLineGroundKA,
      r.doubleLineGroundPhaseBKA,
      r.doubleLineGroundPhaseCKA,
      r.doubleLineGroundEarthKA,
      r.ip,
      r.mu == null ? '' : r.mu,
      r.Ib,
      r.Ith,
      r.validity,
      r.calculationStatus,
      resultFreshness(r),
    ];
    values.forEach(value => {
      const td = document.createElement('td');
      td.textContent = value == null ? '' : String(value);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
    const detail = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 18;
    cell.textContent = `Details — required inputs: ${(r.requiredInputs || []).join('; ') || 'none'} | warnings: ${(r.warnings || []).join('; ') || 'none'} | provenance: ${JSON.stringify(r.provenance || r.inputSources || {})} | model limits: ${JSON.stringify(r.modelLimits || {})} | saved options: ${JSON.stringify(r.studyOptions || {})}`;
    detail.appendChild(cell);
    tbody.appendChild(detail);
  }
  resultsSection.hidden = false;
  lastObservedFingerprint = buildInputFingerprint();
}

form.addEventListener('submit', async ev => {
  ev.preventDefault();
  runBtn.disabled = true;
  try {
    const readRequiredNumber = key => {
      const raw = String(form.elements.namedItem(key)?.value ?? '').trim();
      const value = Number(raw);
      if (!raw || !Number.isFinite(value)) throw new Error(`${key} is required and must be finite.`);
      return value;
    };
    const opts = {
      method: 'IEC',
      cMode: form.cMode.value,
      lvTolerancePct: readRequiredNumber('lvTolerancePct'),
      faultDurationS: readRequiredNumber('faultDurationS'),
      freqHz: readRequiredNumber('freqHz'),
      minTimeDelayS: readRequiredNumber('minTimeDelayS'),
    };
    if (!['max', 'min'].includes(opts.cMode) || ![opts.lvTolerancePct, opts.faultDurationS, opts.freqHz, opts.minTimeDelayS].every(Number.isFinite)
      || opts.lvTolerancePct < 0 || opts.faultDurationS <= 0 || opts.freqHz <= 0 || opts.minTimeDelayS <= 0) {
      throw new Error('Study options must be finite and positive (LV tolerance may be zero).');
    }
    const model = buildModel();
    const runContext = captureStudyRunContext('iec60909', {
      inputs: opts,
      options: opts,
      assumptions: ['Equivalent voltage source and the selected IEC 60909 correction factors are applied to the active One-Line model.'],
    });
    const deviceCatalog = await loadReferencedProtectiveDevices(model);
    const res = runShortCircuit(model, { ...opts, deviceCatalog });
    const inputFingerprint = buildInputFingerprint(opts);
    Object.values(res).forEach(result => {
      result.inputFingerprint = inputFingerprint;
      result.studyOptions = { ...opts };
      result.calculatedAt = new Date().toISOString();
      result.validity = result.validity || (result.warnings?.some(w => /missing|invalid/i.test(w)) ? 'unevaluated' : 'evaluated');
      result.calculationStatus = result.calculationStatus || (result.validity === 'unevaluated' ? 'incomplete' : 'screening-only');
      if (!Array.isArray(result.warnings)) result.warnings = [];
      if (result.impedanceProvenance) result.inputSources = { impedanceProvenance: result.impedanceProvenance };
    });
    lastResults = res;
    saveStudyResult('iec60909', res, runContext);
    renderResults(res);
  } catch (error) {
    metaEl.textContent = `IEC 60909 calculation failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    runBtn.disabled = false;
  }
});

const savedResults = getStudies().iec60909;
if (savedResults && typeof savedResults === 'object') {
  const savedOptions = Object.values(savedResults).find(isFaultResult)?.studyOptions;
  const optionKeys = ['cMode', 'lvTolerancePct', 'faultDurationS', 'freqHz', 'minTimeDelayS'];
  if (savedOptions) optionKeys.forEach(key => {
    const control = form.elements.namedItem(key);
    if (control && savedOptions[key] != null) control.value = savedOptions[key];
  });
  lastResults = savedResults;
  renderResults(savedResults);
}

['cMode', 'lvTolerancePct', 'faultDurationS', 'freqHz', 'minTimeDelayS'].forEach(key => {
  const refreshFreshness = () => { if (lastResults) renderResults(lastResults); };
  form[key]?.addEventListener('input', refreshFreshness);
  form[key]?.addEventListener('change', refreshFreshness);
});

document.addEventListener('ctr:project-saved', () => { if (lastResults) renderResults(lastResults); });
document.addEventListener('ctr:remote-applied', () => { if (lastResults) renderResults(lastResults); });
window.addEventListener('storage', () => { if (lastResults) renderResults(lastResults); });
setInterval(() => {
  if (!lastResults) return;
  const fingerprint = buildInputFingerprint();
  if (fingerprint !== lastObservedFingerprint) renderResults(lastResults);
}, 750);

pdfBtn.addEventListener('click', () => {
  if (!lastResults) return;
  const exportResults = Object.fromEntries(Object.entries(lastResults).filter(([id, result]) => !id.startsWith('_') && isFaultResult(result)).map(([id, result]) => [id, { ...result, currentInputFingerprint: buildInputFingerprint(), freshness: resultFreshness(result) }]));
  downloadIEC60909PDF(exportResults).catch(error => { metaEl.textContent = `IEC 60909 PDF export failed: ${error.message}`; });
});

csvBtn.addEventListener('click', () => {
  if (!lastResults) return;
  const cols = ['bus', 'prefaultKV', 'cFactor', 'kappa', 'threePhaseKA_kA', 'lineToGroundKA_kA', 'lineToLineKA_kA', 'doubleLineGroundKA_kA', 'doubleLineGroundPhaseBKA_kA', 'doubleLineGroundPhaseCKA_kA', 'doubleLineGroundEarthKA_kA', 'ip_kA', 'mu', 'Ib_kA', 'Ith_kA', 'validity', 'calculationStatus', 'requiredInputs', 'warnings', 'provenance', 'modelLimits', 'studyOptions', 'inputFingerprint', 'currentInputFingerprint', 'freshness', 'calculatedAt'];
  const lines = [cols.map(csvCell).join(',')];
  for (const [id, r] of Object.entries(lastResults).filter(([key, value]) => !key.startsWith('_') && isFaultResult(value))) {
    lines.push([id, r.prefaultKV, r.cFactor, r.kappa,
                r.threePhaseKA, r.lineToGroundKA, r.lineToLineKA, r.doubleLineGroundKA,
                r.doubleLineGroundPhaseBKA, r.doubleLineGroundPhaseCKA, r.doubleLineGroundEarthKA,
                r.ip, r.mu, r.Ib, r.Ith, r.validity, r.calculationStatus,
                (r.requiredInputs || []).join('; '), (r.warnings || []).join('; '), JSON.stringify(r.provenance || {}), JSON.stringify(r.modelLimits || {}), JSON.stringify(r.studyOptions || {}), r.inputFingerprint, buildInputFingerprint(), resultFreshness(r), r.calculatedAt].map(csvCell).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'iec60909.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

