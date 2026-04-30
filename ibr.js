import {
  pvArrayOutput,
  ibrPQCapability,
  ibrFaultContribution,
  bessDispatch,
  BESS_MODES,
  buildIbrPlantControllerPackage,
  renderIbrPlantControllerHTML,
} from './analysis/ibrModeling.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyApprovalPanel('ibr');

  initTabs();
  initPVForm();
  initBESSForm();
  initFaultForm();
  initVoltVarForm();
  initPlantControllerForm();
  initExportButtons();

  // --- Restore saved state ---
  const saved = getStudies().ibr;
  if (saved) {
    if (saved.pvInputs) restorePVForm(saved.pvInputs);
    if (saved.pvResult) renderPVResults(saved.pvResult);
    if (saved.bessInputs) restoreBESSForm(saved.bessInputs);
    if (saved.bessResult) renderBESSResults(saved.bessResult);
    if (saved.faultInputs) restoreFaultForm(saved.faultInputs);
    if (saved.faultResult) renderFaultResults(saved.faultResult);
    if (saved.voltVarInputs) restoreVoltVarForm(saved.voltVarInputs);
    if (saved.voltVarResult) renderVoltVarResults(saved.voltVarResult);
    if (saved.plantControllerPackage) restorePlantControllerPackage(saved.plantControllerPackage);
  }
  const plantController = getStudies().ibrPlantController;
  if (plantController) restorePlantControllerPackage(plantController);
});

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------

function initTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      panels.forEach(p => { p.hidden = true; });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`).hidden = false;
    });
  });
}

// ---------------------------------------------------------------------------
// PV Array Tab
// ---------------------------------------------------------------------------

function initPVForm() {
  const form = document.getElementById('pv-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readPVInputs();
    if (!inputs) return;
    let result;
    try {
      result = pvArrayOutput(inputs);
    } catch (err) {
      showModal('Calculation Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }
    renderPVResults(result);
    const studies = getStudies();
    if (!studies.ibr) studies.ibr = {};
    studies.ibr.pvInputs = inputs;
    studies.ibr.pvResult = result;
    setStudies(studies);
  });

  document.getElementById('pv-reset-btn').addEventListener('click', () => {
    form.reset();
    document.getElementById('pv-results').classList.add('hidden');
  });
}

function readPVInputs() {
  return {
    irradiance_W_m2: parseFloat(document.getElementById('pv-irradiance').value),
    temp_C: parseFloat(document.getElementById('pv-temp').value),
    Pstc_kW: parseFloat(document.getElementById('pv-pstc').value),
    tempCoeff_pct: parseFloat(document.getElementById('pv-tempcoeff').value),
    inverterEff: parseFloat(document.getElementById('pv-inveff').value) / 100,
    sRated_kVA: parseFloat(document.getElementById('pv-srated').value),
  };
}

function restorePVForm(inputs) {
  setValue('pv-irradiance', inputs.irradiance_W_m2);
  setValue('pv-temp', inputs.temp_C);
  setValue('pv-pstc', inputs.Pstc_kW);
  setValue('pv-tempcoeff', inputs.tempCoeff_pct);
  setValue('pv-inveff', (inputs.inverterEff * 100).toFixed(1));
  setValue('pv-srated', inputs.sRated_kVA);
}

function renderPVResults(r) {
  const panel = document.getElementById('pv-results');
  const cards = document.getElementById('pv-result-cards');
  cards.innerHTML = `
    <div class="result-card">
      <span class="result-label">DC Output (P<sub>DC</sub>)</span>
      <span class="result-value">${fmt(r.pDC_kW, 2)} kW</span>
    </div>
    <div class="result-card">
      <span class="result-label">AC Output (P<sub>AC</sub>)</span>
      <span class="result-value">${fmt(r.pAC_kW, 2)} kW</span>
    </div>
    <div class="result-card">
      <span class="result-label">Reactive Power (Q)</span>
      <span class="result-value">${fmt(r.qAC_kvar, 2)} kvar</span>
    </div>
    <div class="result-card">
      <span class="result-label">Apparent Power (S)</span>
      <span class="result-value">${fmt(r.sAC_kVA, 2)} kVA</span>
    </div>
    <div class="result-card">
      <span class="result-label">Power Factor</span>
      <span class="result-value">${fmt(r.pf, 3)}</span>
    </div>
    <div class="result-card">
      <span class="result-label">Irradiance Factor</span>
      <span class="result-value">${fmt(r.irradFactor * 100, 1)} %</span>
    </div>
    <div class="result-card">
      <span class="result-label">Temperature Factor</span>
      <span class="result-value">${fmt(r.tempFactor * 100, 2)} %</span>
    </div>
    <div class="result-card ${r.curtailed ? 'result-card--warn' : ''}">
      <span class="result-label">Inverter Clipping</span>
      <span class="result-value">${r.curtailed ? 'YES — output curtailed to S_rated' : 'No clipping'}</span>
    </div>
  `;
  panel.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// BESS Tab
// ---------------------------------------------------------------------------

function initBESSForm() {
  const form = document.getElementById('bess-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readBESSInputs();
    if (!inputs) return;
    let result;
    try {
      result = bessDispatch(inputs);
    } catch (err) {
      showModal('Calculation Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }
    renderBESSResults(result);
    const studies = getStudies();
    if (!studies.ibr) studies.ibr = {};
    studies.ibr.bessInputs = inputs;
    studies.ibr.bessResult = result;
    setStudies(studies);
  });

  document.getElementById('bess-reset-btn').addEventListener('click', () => {
    form.reset();
    document.getElementById('bess-results').classList.add('hidden');
  });
}

function readBESSInputs() {
  return {
    sRated_kW: parseFloat(document.getElementById('bess-kw').value),
    sRated_kVA: parseFloat(document.getElementById('bess-kva').value),
    soc_pct: parseFloat(document.getElementById('bess-soc').value),
    mode: document.getElementById('bess-mode').value,
    roundTripEff: parseFloat(document.getElementById('bess-eff').value) / 100,
    vBus_pu: parseFloat(document.getElementById('bess-vbus').value),
  };
}

function restoreBESSForm(inputs) {
  setValue('bess-kw', inputs.sRated_kW);
  setValue('bess-kva', inputs.sRated_kVA);
  setValue('bess-soc', inputs.soc_pct);
  setSelect('bess-mode', inputs.mode);
  setValue('bess-eff', (inputs.roundTripEff * 100).toFixed(1));
  setValue('bess-vbus', inputs.vBus_pu);
}

function renderBESSResults(r) {
  const panel = document.getElementById('bess-results');
  const cards = document.getElementById('bess-result-cards');
  const pLabel = r.pAC_kW >= 0 ? 'AC Injection (+) to Grid' : 'AC Draw (−) from Grid';
  cards.innerHTML = `
    <div class="result-card">
      <span class="result-label">Mode</span>
      <span class="result-value">${escHtml(r.mode)}</span>
    </div>
    <div class="result-card ${r.socLimited ? 'result-card--warn' : ''}">
      <span class="result-label">SOC Limited</span>
      <span class="result-value">${r.socLimited ? 'YES — dispatch blocked by SOC limit' : 'No'}</span>
    </div>
    <div class="result-card">
      <span class="result-label">${pLabel}</span>
      <span class="result-value">${fmt(Math.abs(r.pAC_kW), 2)} kW</span>
    </div>
    <div class="result-card">
      <span class="result-label">Reactive Power (Q)</span>
      <span class="result-value">${fmt(r.qAC_kvar, 2)} kvar</span>
    </div>
  `;
  panel.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Fault Contribution Tab
// ---------------------------------------------------------------------------

function initFaultForm() {
  const form = document.getElementById('fault-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFaultInputs();
    if (!inputs) return;
    let result;
    try {
      result = ibrFaultContribution(inputs);
    } catch (err) {
      showModal('Calculation Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }
    renderFaultResults(result);
    const studies = getStudies();
    if (!studies.ibr) studies.ibr = {};
    studies.ibr.faultInputs = inputs;
    studies.ibr.faultResult = result;
    setStudies(studies);
  });

  document.getElementById('fault-reset-btn').addEventListener('click', () => {
    form.reset();
    document.getElementById('fault-results').classList.add('hidden');
  });
}

function readFaultInputs() {
  return {
    sRated_kVA: parseFloat(document.getElementById('fault-srated').value),
    vLL_kV: parseFloat(document.getElementById('fault-vll').value),
    vBus_pu: parseFloat(document.getElementById('fault-vbus').value),
    limitFactor: parseFloat(document.getElementById('fault-limit').value),
    rideThrough: document.getElementById('fault-ridethrough').checked,
  };
}

function restoreFaultForm(inputs) {
  setValue('fault-srated', inputs.sRated_kVA);
  setValue('fault-vll', inputs.vLL_kV);
  setValue('fault-vbus', inputs.vBus_pu);
  setValue('fault-limit', inputs.limitFactor);
  document.getElementById('fault-ridethrough').checked = inputs.rideThrough !== false;
}

function renderFaultResults(r) {
  const panel = document.getElementById('fault-results');
  const cards = document.getElementById('fault-result-cards');
  cards.innerHTML = `
    <div class="result-card">
      <span class="result-label">Rated Current (I<sub>rated</sub>)</span>
      <span class="result-value">${fmt(r.Irated_A, 1)} A</span>
    </div>
    <div class="result-card ${r.tripped ? 'result-card--warn' : 'result-card--ok'}">
      <span class="result-label">Inverter Status</span>
      <span class="result-value">${r.tripped ? 'TRIPPED — zero fault contribution' : 'Riding through'}</span>
    </div>
    <div class="result-card">
      <span class="result-label">Fault Current (I<sub>fault</sub>)</span>
      <span class="result-value">${fmt(r.Ifault_A, 1)} A</span>
    </div>
    <div class="result-card">
      <span class="result-label">Fault Current (pu)</span>
      <span class="result-value">${fmt(r.Ifault_pu, 3)} pu</span>
    </div>
  `;
  panel.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Volt-VAR Tab
// ---------------------------------------------------------------------------

function initVoltVarForm() {
  const form = document.getElementById('voltvar-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readVoltVarInputs();
    if (!inputs) return;
    let result;
    try {
      result = ibrPQCapability(inputs);
    } catch (err) {
      showModal('Calculation Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }
    renderVoltVarResults(result);
    drawPQDiagram(inputs, result);
    const studies = getStudies();
    if (!studies.ibr) studies.ibr = {};
    studies.ibr.voltVarInputs = inputs;
    studies.ibr.voltVarResult = result;
    setStudies(studies);
  });

  document.getElementById('vv-reset-btn').addEventListener('click', () => {
    form.reset();
    document.getElementById('voltvar-results').classList.add('hidden');
  });
}

function readVoltVarInputs() {
  return {
    sRated_kVA: parseFloat(document.getElementById('vv-srated').value),
    pOutput_kW: parseFloat(document.getElementById('vv-pout').value),
    vBus_pu: parseFloat(document.getElementById('vv-vbus').value),
    voltVarEnabled: true,
    voltVarCategory: document.getElementById('vv-category').value,
  };
}

function restoreVoltVarForm(inputs) {
  setValue('vv-srated', inputs.sRated_kVA);
  setValue('vv-pout', inputs.pOutput_kW);
  setValue('vv-vbus', inputs.vBus_pu);
  setSelect('vv-category', inputs.voltVarCategory);
}

function renderVoltVarResults(r) {
  const panel = document.getElementById('voltvar-results');
  const cards = document.getElementById('vv-result-cards');
  const op = r.operatingPoint;
  cards.innerHTML = `
    <div class="result-card">
      <span class="result-label">Q<sub>max</sub> (capacitive)</span>
      <span class="result-value">${fmt(r.qMax_kvar, 2)} kvar</span>
    </div>
    <div class="result-card">
      <span class="result-label">Q<sub>min</sub> (inductive)</span>
      <span class="result-value">${fmt(r.qMin_kvar, 2)} kvar</span>
    </div>
    <div class="result-card">
      <span class="result-label">Volt-VAR Dispatch (Q<sub>droop</sub>)</span>
      <span class="result-value">${fmt(r.qDroop_kvar, 2)} kvar ${r.qDroop_kvar > 0 ? '(capacitive)' : r.qDroop_kvar < 0 ? '(inductive)' : '(deadband)'}</span>
    </div>
    <div class="result-card">
      <span class="result-label">Operating Apparent Power</span>
      <span class="result-value">${fmt(op.sApparent_kVA, 2)} kVA</span>
    </div>
    <div class="result-card">
      <span class="result-label">Operating Power Factor</span>
      <span class="result-value">${fmt(op.pf, 3)}</span>
    </div>
  `;
  panel.classList.remove('hidden');
}

function drawPQDiagram(inputs, result) {
  const canvas = document.getElementById('vv-chart');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const S = inputs.sRated_kVA;
  const P = inputs.pOutput_kW;
  const Q_droop = result.qDroop_kvar;

  canvas.style.display = 'block';
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const margin = 50;
  const plotW = W - 2 * margin;
  const plotH = H - 2 * margin;
  const cx = margin + plotW / 2;
  const cy = margin + plotH / 2;
  const scale = Math.min(plotW, plotH) / 2 / S;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    || window.matchMedia('(prefers-color-scheme: dark)').matches;
  const textColor = isDark ? '#e0e0e0' : '#333';
  const gridColor = isDark ? '#444' : '#ddd';
  const circleColor = isDark ? '#5588cc' : '#2266aa';
  const pointColor = '#ff6600';

  // Axes
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(margin, cy); ctx.lineTo(W - margin, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, margin); ctx.lineTo(cx, H - margin); ctx.stroke();

  // Labels
  ctx.fillStyle = textColor;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`P (kW) →`, W - margin, cy + 15);
  ctx.save();
  ctx.translate(margin - 15, cy);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`← Q (kvar) →`, 0, 0);
  ctx.restore();

  // Capability circle
  ctx.beginPath();
  ctx.arc(cx, cy, S * scale, 0, 2 * Math.PI);
  ctx.strokeStyle = circleColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Operating point
  const px = cx + P * scale;
  const py = cy - Q_droop * scale;
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, 2 * Math.PI);
  ctx.fillStyle = pointColor;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.fillText(`(${fmt(P, 0)}, ${fmt(Q_droop, 0)})`, px + 8, py - 8);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`S = ${S} kVA`, cx, margin - 5);
}

// ---------------------------------------------------------------------------
// Plant Controller / Grid-Code Scenarios Tab
// ---------------------------------------------------------------------------

function initPlantControllerForm() {
  const form = document.getElementById('plant-form');
  if (!form) return;
  let currentPackage = null;
  form.addEventListener('submit', e => {
    e.preventDefault();
    currentPackage = runPlantControllerFromForm();
  });
  document.getElementById('plant-save-btn')?.addEventListener('click', () => {
    if (!currentPackage) currentPackage = runPlantControllerFromForm();
    if (!currentPackage) return;
    const studies = getStudies();
    studies.ibrPlantController = currentPackage;
    if (!studies.ibr) studies.ibr = {};
    studies.ibr.plantControllerPackage = currentPackage;
    setStudies(studies);
    showModal('Plant Controller Study Saved', '<p>Saved to studyResults.ibrPlantController for reports and Design Coach.</p>', 'success');
  });
  document.getElementById('plant-json-btn')?.addEventListener('click', () => {
    if (!currentPackage) currentPackage = runPlantControllerFromForm();
    if (currentPackage) downloadText(JSON.stringify(currentPackage, null, 2), 'ibr-plant-controller-package.json', 'application/json');
  });
  document.getElementById('plant-html-btn')?.addEventListener('click', () => {
    if (!currentPackage) currentPackage = runPlantControllerFromForm();
    if (currentPackage) downloadText(renderIbrPlantControllerHTML(currentPackage), 'ibr-plant-controller-package.html', 'text/html');
  });
}

function runPlantControllerFromForm() {
  try {
    const pkg = buildIbrPlantControllerPackage(readPlantControllerInputs());
    renderPlantControllerResults(pkg);
    return pkg;
  } catch (err) {
    showModal('Plant Controller Error', `<p>${escHtml(err.message)}</p>`, 'error');
    return null;
  }
}

function readPlantControllerInputs() {
  return {
    projectName: document.getElementById('plant-name')?.value || 'IBR Plant Controller Case',
    plantCase: {
      name: document.getElementById('plant-name')?.value,
      pccTag: document.getElementById('plant-pcc')?.value,
      pccBus: document.getElementById('plant-pcc')?.value,
      plantMode: document.getElementById('plant-mode')?.value,
      controlMode: document.getElementById('plant-control')?.value,
      priorityMode: document.getElementById('plant-priority')?.value,
      shortCircuitRatio: parseFloat(document.getElementById('plant-scr')?.value),
      reviewNotes: document.getElementById('plant-notes')?.value,
    },
    resourceRows: parseJsonTextarea('plant-resources', []),
    curveRows: parseJsonTextarea('plant-curves', []),
    scenarioRows: parseJsonTextarea('plant-scenarios', []),
  };
}

function parseJsonTextarea(id, fallback) {
  const value = document.getElementById(id)?.value || '';
  if (!value.trim()) return fallback;
  return JSON.parse(value);
}

function restorePlantControllerPackage(pkg) {
  if (!pkg) return;
  setValue('plant-name', pkg.plantCase?.name || pkg.projectName);
  setValue('plant-pcc', pkg.plantCase?.pccTag || pkg.plantCase?.pccBus);
  setSelect('plant-mode', pkg.plantCase?.plantMode);
  setSelect('plant-control', pkg.plantCase?.controlMode);
  setSelect('plant-priority', pkg.plantCase?.priorityMode);
  setValue('plant-scr', pkg.plantCase?.shortCircuitRatio);
  setValue('plant-notes', pkg.plantCase?.reviewNotes);
  setValue('plant-resources', JSON.stringify(pkg.resourceRows || [], null, 2));
  setValue('plant-curves', JSON.stringify(pkg.curveRows || [], null, 2));
  setValue('plant-scenarios', JSON.stringify(pkg.scenarioRows || [], null, 2));
  renderPlantControllerResults(pkg);
}

function renderPlantControllerResults(pkg) {
  const panel = document.getElementById('plant-results');
  const cards = document.getElementById('plant-result-cards');
  const body = document.getElementById('plant-capability-body');
  const warnings = document.getElementById('plant-warning-body');
  if (!panel || !cards || !body || !warnings) return;
  const summary = pkg.summary || {};
  cards.innerHTML = `
    <div class="result-card">
      <span class="result-label">Enabled Resources</span>
      <span class="result-value">${fmt(summary.enabledResourceCount, 0)}</span>
    </div>
    <div class="result-card">
      <span class="result-label">Scenarios</span>
      <span class="result-value">${fmt(summary.scenarioCount, 0)}</span>
    </div>
    <div class="result-card ${summary.warn || summary.missingData ? 'result-card--warn' : ''}">
      <span class="result-label">Warnings / Missing Data</span>
      <span class="result-value">${fmt((summary.warn || 0) + (summary.missingData || 0), 0)}</span>
    </div>
    <div class="result-card ${summary.fail ? 'result-card--warn' : 'result-card--ok'}">
      <span class="result-label">Failures</span>
      <span class="result-value">${fmt(summary.fail || 0, 0)}</span>
    </div>
  `;
  body.innerHTML = (pkg.capabilityRows || []).map(row => `<tr>
    <td>${escHtml(row.scenarioLabel || row.scenarioId)}</td>
    <td>${escHtml(row.plantMode)}</td>
    <td>${escHtml(row.controlMode)}</td>
    <td>${fmt(Number(row.pTotalKw), 1)}</td>
    <td>${fmt(Number(row.qTotalKvar), 1)}</td>
    <td>${row.shortCircuitRatio ?? 'â€”'}</td>
    <td>${escHtml(row.status)}</td>
    <td>${escHtml(row.recommendation)}</td>
  </tr>`).join('') || '<tr><td colspan="8">No capability rows.</td></tr>';
  warnings.innerHTML = (pkg.warningRows || []).map(row => `<tr>
    <td>${escHtml(row.severity || 'warning')}</td>
    <td>${escHtml(row.code || 'warning')}</td>
    <td>${escHtml(row.sourceTag || row.sourceId || '')}</td>
    <td>${escHtml(row.message || '')}</td>
  </tr>`).join('') || '<tr><td colspan="4">No warnings.</td></tr>';
  const preview = document.getElementById('plant-json-preview');
  if (preview) preview.textContent = JSON.stringify(pkg, null, 2);
  panel.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Export buttons
// ---------------------------------------------------------------------------

function initExportButtons() {
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
  document.getElementById('export-pdf-btn').addEventListener('click', exportPDF);
}

function exportCSV() {
  const studies = getStudies().ibr || {};
  const rows = [['Section', 'Parameter', 'Value', 'Unit']];

  if (studies.pvResult) {
    const r = studies.pvResult;
    rows.push(['PV Array', 'DC Output', fmt(r.pDC_kW, 2), 'kW']);
    rows.push(['PV Array', 'AC Output', fmt(r.pAC_kW, 2), 'kW']);
    rows.push(['PV Array', 'Reactive Power', fmt(r.qAC_kvar, 2), 'kvar']);
    rows.push(['PV Array', 'Apparent Power', fmt(r.sAC_kVA, 2), 'kVA']);
    rows.push(['PV Array', 'Power Factor', fmt(r.pf, 3), '']);
    rows.push(['PV Array', 'Clipping', r.curtailed ? 'Yes' : 'No', '']);
  }
  if (studies.bessResult) {
    const r = studies.bessResult;
    rows.push(['BESS', 'Mode', r.mode, '']);
    rows.push(['BESS', 'SOC Limited', r.socLimited ? 'Yes' : 'No', '']);
    rows.push(['BESS', 'AC Power', fmt(r.pAC_kW, 2), 'kW']);
    rows.push(['BESS', 'Reactive Power', fmt(r.qAC_kvar, 2), 'kvar']);
  }
  if (studies.faultResult) {
    const r = studies.faultResult;
    rows.push(['Fault', 'Rated Current', fmt(r.Irated_A, 1), 'A']);
    rows.push(['Fault', 'Fault Current', fmt(r.Ifault_A, 1), 'A']);
    rows.push(['Fault', 'Fault Current (pu)', fmt(r.Ifault_pu, 3), 'pu']);
    rows.push(['Fault', 'Tripped', r.tripped ? 'Yes' : 'No', '']);
  }
  if (studies.voltVarResult) {
    const r = studies.voltVarResult;
    rows.push(['Volt-VAR', 'Q_max', fmt(r.qMax_kvar, 2), 'kvar']);
    rows.push(['Volt-VAR', 'Q_min', fmt(r.qMin_kvar, 2), 'kvar']);
    rows.push(['Volt-VAR', 'Q_droop', fmt(r.qDroop_kvar, 2), 'kvar']);
    rows.push(['Volt-VAR', 'Power Factor', fmt(r.operatingPoint.pf, 3), '']);
  }
  const plantPackage = getStudies().ibrPlantController || studies.plantControllerPackage;
  if (plantPackage) {
    (plantPackage.capabilityRows || []).forEach(row => {
      rows.push(['Plant Controller', `${row.scenarioLabel || row.scenarioId} kW`, row.pTotalKw ?? '', 'kW']);
      rows.push(['Plant Controller', `${row.scenarioLabel || row.scenarioId} kvar`, row.qTotalKvar ?? '', 'kvar']);
      rows.push(['Plant Controller', `${row.scenarioLabel || row.scenarioId} status`, row.status ?? '', '']);
    });
    (plantPackage.warningRows || []).forEach(row => {
      rows.push(['Plant Controller Warning', row.code || 'warning', row.message || '', row.severity || 'warning']);
    });
  }

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadText(csv, 'ibr-study.csv', 'text/csv');
}

function exportPDF() {
  window.print();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fmt(v, dec = 2) {
  return Number.isFinite(v) ? v.toFixed(dec) : '—';
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

function setSelect(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined) el.value = val;
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
