import { runGeneratorSizingAnalysis, NFPA110_TYPES } from './analysis/generatorSizing.mjs';
import { getStudies, setStudies, getLoads, getEquipment, getProjectMeta } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import {
  buildGeneratorProjectInputs,
  createStudyInputSnapshot,
  getStudyStaleness,
  withStudyProvenance,
} from './analysis/projectIntegration.mjs';
import {
  applyLinkedValue,
  bindProjectField,
  renderProjectInputPanel,
  renderStudyStaleBanner,
} from './src/components/projectInputBinding.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('gen-sizing-form');
  const resultsDiv = document.getElementById('results');
  const loadTableBody = document.getElementById('load-table-body');
  const addLoadBtn = document.getElementById('add-load-btn');
  const projectOverrides = new Set();
  let projectInputModel = null;

  initStudyApprovalPanel('generatorSizing');

  function readProjectInputModel() {
    return buildGeneratorProjectInputs({
      loads: getLoads(),
      equipment: getEquipment(),
      projectMeta: getProjectMeta(),
    });
  }

  function bindLoadRow(row) {
    row.querySelectorAll('input').forEach(input => {
      bindProjectField(input, projectInputModel.bindings.loads, projectOverrides, 'loads');
    });
  }

  function applyProjectInputs(force = false) {
    projectInputModel = readProjectInputModel();
    const fieldIds = {
      projectLabel: 'project-label',
      altitudeFt: 'altitude-ft',
      ambientC: 'ambient-c',
      motorHp: 'motor-hp',
      motorPf: 'motor-pf',
      motorEff: 'motor-eff',
    };
    Object.entries(fieldIds).forEach(([fieldName, id]) => {
      const element = document.getElementById(id);
      const binding = projectInputModel.bindings[fieldName];
      bindProjectField(element, binding, projectOverrides, fieldName);
      applyLinkedValue(element, projectInputModel.inputs[fieldName], projectOverrides, fieldName, binding, { force });
    });
    if ((!projectOverrides.has('loads') || force) && projectInputModel.inputs.loads.length) {
      if (force) projectOverrides.delete('loads');
      loadTableBody.innerHTML = '';
      projectInputModel.inputs.loads.forEach(load => addLoadRow(load.label, load.kw, load.demandFactor));
    }
  }

  projectInputModel = readProjectInputModel();
  renderProjectInputPanel({
    container: form,
    title: 'Generator inputs linked to this project',
    bindings: projectInputModel.bindings,
    missing: projectInputModel.missing,
    onRefresh: () => applyProjectInputs(true),
  });

  // --- Restore previous results ---
  const saved = getStudies().generatorSizing;
  if (saved) {
    (saved.projectLink?.overrides || []).forEach(field => projectOverrides.add(field));
    restoreForm(saved);
    applyProjectInputs(false);
    renderResults(saved);
    const currentInputs = readFormInputs();
    if (currentInputs) {
      const currentSnapshot = createStudyInputSnapshot('generatorSizing', currentInputs, projectInputModel.bindings, projectOverrides);
      renderStudyStaleBanner(resultsDiv, getStudyStaleness(saved, currentSnapshot), () => applyProjectInputs(true));
    }
  } else {
    applyProjectInputs(false);
  }

  // --- Add / remove load rows ---
  addLoadBtn.addEventListener('click', () => {
    addLoadRow();
  });

  loadTableBody.addEventListener('click', e => {
    if (e.target.closest('.remove-load-btn')) {
      const row = e.target.closest('tr');
      if (loadTableBody.querySelectorAll('tr').length > 1) {
        row.remove();
      }
    }
  });

  // Keep a single blank row only when the project has no usable load records.
  if (loadTableBody.querySelectorAll('tr').length === 0) {
    addLoadRow();
  }

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runGeneratorSizingAnalysis(inputs);
      result.motorHp = inputs.motorHp;
      result.motorPf = inputs.motorPf;
      result.motorEff = inputs.motorEff;
      const snapshot = createStudyInputSnapshot('generatorSizing', inputs, projectInputModel.bindings, projectOverrides);
      result = withStudyProvenance(result, snapshot);
    } catch (err) {
      showModal('Analysis Error', `<p>${err.message}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.generatorSizing = result;
    setStudies(studies);

    renderResults(result);
  });

  // --------------------------------------------------------------------------

  function addLoadRow(label = '', kw = '', demandFactor = '1.0') {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="load-label" value="${escHtml(String(label))}"
          placeholder="Load description" aria-label="Load label"></td>
      <td><input type="number" class="load-kw" min="0" step="0.1"
          value="${escHtml(String(kw))}" required aria-label="Load kW"></td>
      <td><input type="number" class="load-df" min="0" max="1" step="0.01"
          value="${escHtml(String(demandFactor))}" aria-label="Demand factor"></td>
      <td><button type="button" class="remove-load-btn btn-icon"
          aria-label="Remove row" title="Remove row">×</button></td>`;
    loadTableBody.appendChild(tr);
    bindLoadRow(tr);
  }

  function readFormInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    // Collect load rows
    const loads = [];
    loadTableBody.querySelectorAll('tr').forEach(row => {
      const label = row.querySelector('.load-label').value.trim();
      const kw = parseFloat(row.querySelector('.load-kw').value) || 0;
      const df = parseFloat(row.querySelector('.load-df').value);
      const demandFactor = Number.isFinite(df) ? df : 1.0;
      if (kw > 0) {
        loads.push({ label, kw, demandFactor });
      }
    });

    if (loads.length === 0) {
      showModal('Input Error', '<p>At least one load with kW > 0 must be entered.</p>', 'error');
      return null;
    }

    const altitudeFt = getFloat('altitude-ft') || 0;
    const ambientC = getFloat('ambient-c');
    if (!Number.isFinite(ambientC)) {
      showModal('Input Error', '<p>Ambient temperature (°C) is required.</p>', 'error');
      return null;
    }

    const aspiration = get('aspiration').value;
    const nfpa110Type = get('nfpa110-type').value;
    const motorHp = getFloat('motor-hp') || 0;
    const motorPf = getFloat('motor-pf') || 0.85;
    const motorEff = getFloat('motor-eff') || 0.92;
    const lrcMultiplier = getFloat('lrc-multiplier') || 6;
    const xdPrimePct = getFloat('xd-prime') || 25;
    const voltageDipLimitPct = getFloat('voltage-dip-limit') || 35;
    const fuelCapGal = getFloat('fuel-cap-gal') || 0;
    const sfcLbPerHpHr = getFloat('sfc') || 0.38;
    const projectLabel = get('project-label').value.trim();

    return {
      projectLabel,
      loads,
      altitudeFt,
      ambientC,
      aspiration,
      nfpa110Type,
      motorHp,
      motorPf,
      motorEff,
      lrcMultiplier,
      xdPrimePct,
      voltageDipLimitPct,
      fuelCapGal,
      sfcLbPerHpHr,
    };
  }

  function restoreForm(r) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val != null) el.value = val;
    };
    set('project-label', r.projectLabel);
    set('altitude-ft', r.altitudeFt);
    set('ambient-c', r.ambientC);
    set('aspiration', r.aspiration);
    set('nfpa110-type', r.nfpa110Type);
    set('motor-hp', r.motorHp);
    set('motor-pf', r.motorPf);
    set('motor-eff', r.motorEff);
    set('voltage-dip-limit', r.voltageDip?.limit);
    set('fuel-cap-gal', r.fuelCapGal || '');

    // Restore load rows
    if (r.loads && r.loads.length > 0) {
      loadTableBody.innerHTML = '';
      r.loads.forEach(l => addLoadRow(l.label, l.kw, l.demandFactor));
    }
  }

  function renderResults(r) {
    resultsDiv.innerHTML = '';

    const safe = value => escHtml(String(value ?? '—'));
    const num = value => value !== null && value !== '' && Number.isFinite(Number(value))
      ? String(Number(value))
      : '—';

    const dipHtml = r.voltageDip
      ? `<div class="result-badge ${r.voltageDip.acceptable ? 'result-badge--pass' : 'result-badge--fail'}" role="status">
           ${r.voltageDip.acceptable ? '✓' : '✗'} Motor start voltage dip: ${safe(num(r.voltageDip.dipPct))}%
           (limit ${safe(num(r.voltageDip.limit))}%)
         </div>`
      : '';

    const fuelHtml = r.fuelRuntime
      ? `<div class="result-row">
           <span class="result-label">Fuel consumption rate</span>
           <span class="result-value">${safe(num(r.fuelRuntime.fuelRateGalPerHr))} gal/hr</span>
         </div>
         <div class="result-row">
           <span class="result-label">Estimated runtime (${safe(num(r.fuelCapGal))} gal tank)</span>
           <span class="result-value">${safe(num(r.fuelRuntime.runtimeHours))} hours</span>
         </div>`
      : `<p class="field-hint">Enter fuel tank capacity to calculate runtime.</p>`;

    const warningsHtml = r.warnings.length
      ? `<ul class="drc-findings">
           ${r.warnings.map(w =>
             `<li class="drc-finding drc-warn"><span class="drc-msg">${escHtml(w)}</span></li>`
           ).join('')}
         </ul>`
      : '';

    const requiredInputsHtml = Array.isArray(r.requiredInputs) && r.requiredInputs.length
      ? `<div class="alert warning"><strong>Required before final selection:</strong><ul>${r.requiredInputs
          .map(item => `<li>${escHtml(item)}</li>`).join('')}</ul></div>`
      : '';

    const loadRowsHtml = r.loads.map(l =>
      `<tr>
         <td>${escHtml(l.label || '—')}</td>
         <td>${safe(num(l.kw))} kW</td>
         <td>${safe(num(l.demandFactor))}</td>
         <td>${safe(num(l.contributionKw))} kW</td>
       </tr>`
    ).join('');

    const typeInfo = r.nfpa110Info;
    const typeBadge = typeInfo
      ? `<span class="tag tag--primary">${safe(typeInfo.label)}</span> — ${escHtml(typeInfo.description)} ` +
        `(transfer ≤ ${safe(num(typeInfo.responseTimeSec))} s)`
      : '';

    const sizeOptionsHtml = r.standardSizeOptions.map(s =>
      `<span class="tag${s === r.selectedSizeKw ? ' tag--primary' : ''}">${safe(num(s))} kW</span>`
    ).join(' ');

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Generator Sizing Results</h2>
        <div class="alert warning"><strong>Preliminary screening only.</strong> Confirm the selected package with manufacturer performance data and the project design basis.</div>
        ${r.projectLabel ? `<p class="field-hint">Project / Location: <strong>${escHtml(r.projectLabel)}</strong></p>` : ''}
        ${typeBadge ? `<p class="field-hint">${typeBadge}</p>` : ''}

        <div class="result-group">
          <h3>Load Summary</h3>
          <table class="data-table" aria-label="Continuous load details">
            <thead>
              <tr><th>Load</th><th>Installed kW</th><th>Demand Factor</th><th>Contribution</th></tr>
            </thead>
            <tbody>${loadRowsHtml}</tbody>
            <tfoot>
              <tr><td colspan="3"><strong>Total continuous load</strong></td>
                  <td><strong>${safe(num(r.continuousKw))} kW</strong></td></tr>
            </tfoot>
          </table>
        </div>

        <div class="result-group">
          <h3>Site Derating</h3>
          <div class="result-row">
            <span class="result-label">Altitude factor (${safe(num(r.altitudeFt))} ft, ${safe(r.aspiration)})</span>
            <span class="result-value">${(r.altitudeFactor * 100).toFixed(1)}%</span>
          </div>
          <p class="field-hint">${escHtml(r.altitudeNote)}</p>
          <div class="result-row">
            <span class="result-label">Temperature factor (${safe(num(r.ambientC))} °C ambient)</span>
            <span class="result-value">${(r.tempFactor * 100).toFixed(1)}%</span>
          </div>
          <p class="field-hint">${escHtml(r.tempNote)}</p>
          <div class="result-row result-row--total">
            <span class="result-label">Required standard-condition nameplate for continuous load</span>
            <span class="result-value">${safe(num(r.siteDeratedKw))} kW</span>
          </div>
        </div>

        ${r.stepLoad ? `
        <div class="result-group">
          <h3>Largest Motor Step Load</h3>
          <div class="result-row">
            <span class="result-label">Motor starting demand</span>
            <span class="result-value">${safe(num(r.stepLoad.startingKva))} kVA / ${safe(num(r.stepLoad.startingKw))} kW</span>
          </div>
          <div class="result-row">
            <span class="result-label">Site-adjusted nameplate screen for motor start</span>
            <span class="result-value">${safe(num(r.stepRequiredKw))} kW</span>
          </div>
          ${dipHtml}
        </div>` : ''}

        <div class="result-group">
          <h3>Selected Generator Size</h3>
          <div class="result-row result-row--total">
            <span class="result-label">Minimum required</span>
            <span class="result-value">${safe(num(r.requiredKw))} kW</span>
          </div>
          <div class="result-row result-row--total">
            <span class="result-label">Selected standard size</span>
            <span class="result-value">${r.selectedSizeKw === null ? 'Above built-in range' : `${safe(num(r.selectedSizeKw))} kW`}</span>
          </div>
          <p class="field-hint">Nearby standard sizes: ${sizeOptionsHtml}</p>
        </div>

        <div class="result-group">
          <h3>Fuel Runtime</h3>
          ${fuelHtml}
        </div>

        ${warningsHtml}
        ${requiredInputsHtml}

        <p class="field-hint result-timestamp">Analysis run: ${safe(new Date(r.timestamp).toLocaleString())}</p>
      </section>`;
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
});
