import {
  runInsulationCoordinationStudy,
  IEC60071_RANGE_I,
  IEC60071_RANGE_II,
  TOV_FACTOR,
  MIN_PROTECTIVE_MARGIN_LI_PCT,
  MIN_PROTECTIVE_MARGIN_SI_PCT,
  SAFETY_FACTOR_DETERMINISTIC,
  SAFETY_FACTOR_STATISTICAL,
} from './analysis/insulationCoordination.mjs';
import { getStudies, setStudies, getEquipment, getLoads, getCables, getProjectMeta } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';
import { escapeHtml } from './src/htmlUtils.mjs';
import {
  buildInsulationCoordinationProjectInputs,
  buildProjectScopeOptions,
  createStudyInputSnapshot,
  resolveProjectScope,
  withStudyProvenance,
} from './analysis/projectIntegration.mjs';
import {
  applyLinkedValue,
  attachProjectSourceBadge,
  bindProjectField,
  renderProjectInputPanel,
  renderProjectScopeSelector,
} from './src/components/projectInputBinding.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyBasisPanel('insulationCoordination', {
    standard: 'IEC 60071-1 / IEC 60071-2:2023 / IEEE 1313.2',
    clause: 'Preliminary deterministic and simplified-statistical screening workflow',
    formulas: [
      'Ucw = Urp × Ks × Ka — coordination withstand voltage',
      'Ka = e^(m × H / 8150) — atmospheric correction (IEC 60071-2 §3.3)',
      'Mp (%) = (selected BIL or SIL / Ures − 1) × 100 — equipment-to-arrester protective margin',
      'R ≈ Φ((μs − U50) / √(σs² + σw²)) — statistical risk of failure (Gaussian convolution)',
    ],
    assumptions: [
      'Standard insulation levels from IEC 60071-1 Tables 2 (Range I, Um ≤ 245 kV) and 3 (Range II, Um > 245 kV)',
      'Deterministic safety factor Ks = 1.15; statistical Ks = 1.05',
      'Lightning Ka uses exponent m = 1.0 (self-restoring air gaps)',
      'Power-frequency Ka uses exponent m = 0.75 (non-self-restoring insulation)',
    ],
    limitations: [
      'Switching impulse PFWV not separately tabulated for Range II (governed by SIWV)',
      'Full statistical convolution integral requires site-measured overvoltage distributions',
      'Transferred overvoltages from transformer coupling not modeled',
      'Detailed simulation and the complete IEC 60071-2:2023 application workflow are not implemented',
    ],
    benchmarkId: 'iec60071',
  });
  initStudyApprovalPanel('insulationCoordination');

  // Populate Um selector from IEC tables
  populateUmSelector();

  const form = document.getElementById('inscoord-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv = document.getElementById('calc-errors');
  const projectOverrides = new Set();
  const projectData = () => ({ equipment: getEquipment(), loads: getLoads(), cables: getCables(), studies: getStudies() });
  const scopeOptions = buildProjectScopeOptions(projectData(), ['equipment', 'circuit']);
  let selectedScopeValue = getStudies().insulationCoordination?.projectLink?.scopeValue || scopeOptions[0]?.value || '';
  let projectInputModel = null;

  function applyProjectScope(scopeValue = selectedScopeValue, { force = false } = {}) {
    selectedScopeValue = scopeValue;
    projectInputModel = buildInsulationCoordinationProjectInputs(resolveProjectScope(scopeValue, projectData()), getProjectMeta());
    const fields = {
      studyLabel: 'study-label', nominalVoltageKv: 'nominal-kv', umKv: 'um-select',
      altitudeM: 'altitude-m', surgeArresterMcovKv: 'arrester-mcov',
    };
    Object.entries(fields).forEach(([fieldName, id]) => {
      const element = document.getElementById(id);
      const binding = projectInputModel.bindings[fieldName];
      bindProjectField(element, binding, projectOverrides, fieldName);
      if (applyLinkedValue(element, projectInputModel.inputs[fieldName], projectOverrides, fieldName, binding, { force })) {
        attachProjectSourceBadge(element, binding.sourceLabel);
      }
    });
  }

  renderProjectScopeSelector({
    container: form,
    title: 'Insulation coordination project scope',
    options: scopeOptions,
    selectedValue: selectedScopeValue,
    onSelect: applyProjectScope,
  });

  // Restore from saved state or set defaults
  const saved = getStudies().insulationCoordination;
  if (saved) {
    (saved.projectLink?.overrides || []).forEach(field => projectOverrides.add(field));
    restoreForm(saved.inputs);
    projectInputModel = buildInsulationCoordinationProjectInputs(resolveProjectScope(selectedScopeValue, projectData()), getProjectMeta());
    try {
      const restoredResult = runInsulationCoordinationStudy(readInputs());
      renderResults(restoredResult);
    } catch {
      // Ignore invalid/malformed persisted data and wait for a fresh user submission.
    }
  } else if (selectedScopeValue) {
    applyProjectScope(selectedScopeValue);
  } else {
    renderProjectInputPanel({
      container: form,
      title: 'Equipment input required',
      missing: ['Add equipment or a circuit with a nominal voltage.'],
    });
  }

  // Toggle statistical panel visibility
  document.getElementById('approach-select').addEventListener('change', updateApproachVisibility);
  updateApproachVisibility();

  form.addEventListener('submit', e => {
    e.preventDefault();
    let result;
    try {
      const inputs = readInputs();
      result = runInsulationCoordinationStudy(inputs);
      const snapshot = createStudyInputSnapshot('insulationCoordination', inputs, projectInputModel?.bindings || {}, projectOverrides);
      snapshot.scopeValue = selectedScopeValue;
      result = withStudyProvenance(result, snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run insulation coordination study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      return;
    }
    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.insulationCoordination = result;
    setStudies(studies);

    renderResults(result);
  });

  // -----------------------------------------------------------------------
  // Populate Um dropdown from IEC 60071-1 standard table
  // -----------------------------------------------------------------------
  function populateUmSelector() {
    const sel = document.getElementById('um-select');
    if (!sel) return;
    const all = [
      ...IEC60071_RANGE_I.map(e => ({ um: e.um, range: 'I' })),
      ...IEC60071_RANGE_II.map(e => ({ um: e.um, range: 'II' })),
    ];
    all.forEach(({ um, range }) => {
      const opt = document.createElement('option');
      opt.value = um;
      opt.textContent = `${um} kV (Range ${range})`;
      if (um === 145) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function updateApproachVisibility() {
    const approach = document.getElementById('approach-select').value;
    const statPanel = document.getElementById('statistical-panel');
    if (statPanel) statPanel.hidden = approach !== 'statistical';
  }

  // -----------------------------------------------------------------------
  // Form reading
  // -----------------------------------------------------------------------
  function readInputs() {
    const flt = id => parseFloat(document.getElementById(id).value);
    const str = id => document.getElementById(id).value;

    const hasLI = document.getElementById('li-enabled').checked;
    const hasSI = document.getElementById('si-enabled').checked;
    const hasStat = str('approach-select') === 'statistical';

    return {
      studyLabel: document.getElementById('study-label').value.trim(),
      nominalVoltageKv: flt('nominal-kv'),
      umKv: parseFloat(str('um-select')),
      altitudeM: flt('altitude-m'),
      groundingType: str('grounding-type'),
      approach: str('approach-select'),

      lightningImpulse: hasLI ? {
        representativeKvPeak: flt('li-urp'),
        arresterResidualKvPeak: flt('li-ures'),
      } : undefined,

      switchingImpulse: hasSI ? {
        representativeKvPeak: flt('si-urp'),
        arresterResidualKvPeak: flt('si-ures'),
      } : undefined,

      surgeArresterMcovKv: Number.isFinite(flt('arrester-mcov')) ? flt('arrester-mcov') : undefined,

      statisticalLI: (hasStat && hasLI) ? {
        meanKvPeak: flt('stat-li-mean'),
        cov: flt('stat-li-cov'),
      } : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Form restoration
  // -----------------------------------------------------------------------
  function restoreForm(inputs) {
    if (!inputs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('study-label', inputs.studyLabel);
    set('nominal-kv', inputs.nominalVoltageKv);
    set('altitude-m', inputs.altitudeM);
    set('arrester-mcov', inputs.surgeArresterMcovKv);

    const umSel = document.getElementById('um-select');
    if (umSel && inputs.umKv) {
      const opt = Array.from(umSel.options).find(o => parseFloat(o.value) === inputs.umKv);
      if (opt) umSel.value = opt.value;
    }

    const gSel = document.getElementById('grounding-type');
    if (gSel && inputs.groundingType) gSel.value = inputs.groundingType;

    const aSel = document.getElementById('approach-select');
    if (aSel && inputs.approach) aSel.value = inputs.approach;

    updateApproachVisibility();
  }

  // -----------------------------------------------------------------------
  // Results rendering
  // -----------------------------------------------------------------------
  function renderResults(result) {
    const { standardRow, atmosphericCorrection, safetyFactor, mcovCheck, tovResult, liResult, siResult, allPassed, warnings } = result;

    const ok = v => `<span class="result-ok">${v}</span>`;
    const fail = v => `<span class="result-fail">${v}</span>`;
    const warn = v => `<span class="result-warn">${v}</span>`;
    const badge = pass => pass ? ok('PASS') : fail('FAIL');

    const warningHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '<p class="field-hint">No warnings.</p>';

    // Standard insulation level table
    const bilList = (standardRow.liwv || []).map(v => `${v} kV`).join(' / ');
    const pfwvList = standardRow.pfwv ? standardRow.pfwv.map(v => `${v} kV rms`).join(' / ') : '—';
    const siwvList = standardRow.siwv ? standardRow.siwv.map(v => `${v} kV`).join(' / ') : '—';

    // MCOV card
    const mcovHtml = mcovCheck
      ? `<div class="result-card">
           <div class="result-card-label">Arrester MCOV</div>
           <div class="result-card-value">${mcovCheck.providedMcovKv} kV</div>
           <div class="result-card-sub">Required ≥ ${mcovCheck.requiredMcovKv} kV — ${badge(mcovCheck.pass)}</div>
         </div>`
      : '';

    // LI result card
    const liHtml = liResult
      ? `<div class="result-card">
           <div class="result-card-label">BIL (LI Withstand)</div>
           <div class="result-card-value ${liResult.selectedBilKv ? '' : 'result-fail'}">${liResult.selectedBilKv ? liResult.selectedBilKv + ' kV' : 'None found'}</div>
           <div class="result-card-sub">Ucw = ${liResult.ucwKvPeak} kV peak</div>
           ${liResult.protectiveMargin ? `<div class="result-card-sub">Arrester margin: ${liResult.protectiveMargin.marginPct}% — ${badge(liResult.protectiveMargin.pass)}</div>` : ''}
         </div>`
      : '';

    // SI result card
    const siHtml = siResult
      ? `<div class="result-card">
           <div class="result-card-label">SIL (SI Withstand)</div>
           <div class="result-card-value ${siResult.selectedSilKv ? '' : (siResult.availableSiwv.length ? 'result-fail' : 'result-warn')}">${siResult.selectedSilKv ? siResult.selectedSilKv + ' kV' : siResult.availableSiwv.length ? 'None found' : 'N/A'}</div>
           <div class="result-card-sub">Ucw = ${siResult.ucwKvPeak} kV peak</div>
           ${siResult.protectiveMargin ? `<div class="result-card-sub">Arrester margin: ${siResult.protectiveMargin.marginPct}% — ${badge(siResult.protectiveMargin.pass)}</div>` : ''}
         </div>`
      : '';

    // TOV result card
    const tovHtml = tovResult
      ? `<div class="result-card">
           <div class="result-card-label">PFWV Required</div>
           <div class="result-card-value">${tovResult.ucwTovKvRms} kV rms</div>
           <div class="result-card-sub">TOV = ${tovResult.tovKvRms} kV rms (factor ${tovResult.tovFactor}×)</div>
           <div class="result-card-sub">Selected PFWV: ${tovResult.selectedPfwvKv ? tovResult.selectedPfwvKv + ' kV rms' : warn('None found')}</div>
         </div>`
      : '';

    // Statistical risk
    const statHtml = liResult && liResult.risk
      ? `<div class="result-group">
           <h3>Statistical Risk of Failure (LI)</h3>
           <div class="result-cards">
             <div class="result-card">
               <div class="result-card-label">Risk per Event</div>
               <div class="result-card-value ${liResult.risk.riskOfFailure < 1e-4 ? 'result-ok' : liResult.risk.riskOfFailure < 1e-3 ? 'result-warn' : 'result-fail'}">${liResult.risk.riskOfFailure.toExponential(2)}</div>
               <div class="result-card-sub">z = ${liResult.risk.z}, U₅₀ = ${liResult.risk.u50} kV</div>
             </div>
           </div>
           <p class="field-hint">Target per IEC 60071-2 Annex A: risk per overvoltage event ≤ 10⁻⁴ for transmission, ≤ 10⁻³ for distribution.</p>
         </div>`
      : '';

    // Ka section
    const kaHtml = `<div class="result-group">
      <h3>Atmospheric Correction</h3>
      <table class="data-table" aria-label="Atmospheric correction factors">
        <thead><tr><th>Type</th><th>Exponent m</th><th>Ka</th></tr></thead>
        <tbody>
          <tr><td>Lightning impulse (self-restoring)</td><td>1.0</td><td>${atmosphericCorrection.kaLI}</td></tr>
          <tr><td>Power frequency (non-self-restoring)</td><td>0.75</td><td>${atmosphericCorrection.kaPF}</td></tr>
        </tbody>
      </table>
    </div>`;

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Insulation Coordination Results</h2>
        <div class="alert warning"><strong>Preliminary screening only.</strong> Confirm representative stresses, arrester data, and selected insulation levels using the current project insulation-coordination study.</div>

        <div class="result-group">
          <h3>Overall Result</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">Overall Status</div>
              <div class="result-card-value ${allPassed ? 'result-ok' : 'result-fail'}">${allPassed ? 'PASS' : 'FAIL'}</div>
              <div class="result-card-sub">${result.approach === 'deterministic' ? 'Deterministic' : 'Statistical'} approach — Ks = ${safetyFactor}</div>
            </div>
            ${mcovHtml}
            ${liHtml}
            ${siHtml}
            ${tovHtml}
          </div>
        </div>

        <div class="result-group">
          <h3>IEC 60071-1 Standard Insulation Levels — Um = ${standardRow.um} kV</h3>
          <table class="data-table" aria-label="Standard insulation levels">
            <thead>
              <tr><th>Voltage Class</th><th>Standard BIL / LIWV (kV peak)</th><th>PFWV (kV rms)</th><th>SIWV (kV peak)</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Um = ${standardRow.um} kV (Range ${standardRow.rangeII ? 'II' : 'I'})</td>
                <td>${bilList}</td>
                <td>${pfwvList}</td>
                <td>${siwvList}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${kaHtml}

        ${statHtml}

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;
  }
});
