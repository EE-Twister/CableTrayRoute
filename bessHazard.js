import {
  runBessHazardStudy,
  CHEMISTRY_PARAMS,
  EXPOSURE_TYPES,
} from './analysis/bessHazard.mjs';
import { getStudies, setStudies, getEquipment, getProjectMeta } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';
import {
  buildBessHazardProjectInputs,
  createStudyInputSnapshot,
  withStudyProvenance,
} from './analysis/projectIntegration.mjs';
import {
  applyLinkedValue,
  attachProjectSourceBadge,
  bindProjectField,
  renderProjectInputPanel,
} from './src/components/projectInputBinding.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('bessHazard');

  const calculateBtn = document.getElementById('calculate-btn');
  const exportBtn    = document.getElementById('export-btn');
  const addExpBtn    = document.getElementById('add-exposure-btn');
  const projectOverrides = new Set();
  let projectInputModel = null;
  let exposureCount = 0;

  calculateBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);
  addExpBtn.addEventListener('click', () => addExposureRow());

  function readProjectInputModel() {
    return buildBessHazardProjectInputs({
      equipment: getEquipment(), studies: getStudies(), projectMeta: getProjectMeta(),
    });
  }

  function applyProjectInputs(force = false) {
    projectInputModel = readProjectInputModel();
    const fields = {
      ratedKwh: 'rated-kwh', chemistry: 'chemistry', cellsPerModule: 'cells-per-module',
      modulesPerRack: 'modules-per-rack', ambientC: 'ambient-c',
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

  projectInputModel = readProjectInputModel();
  renderProjectInputPanel({
    container: calculateBtn.closest('section') || calculateBtn.parentElement,
    title: 'BESS hazard inputs linked to this project',
    bindings: projectInputModel.bindings,
    missing: projectInputModel.missing,
    onRefresh: () => applyProjectInputs(true),
  });

  // Restore previously saved state
  const saved = getStudies().bessHazard;
  if (saved && saved._inputs) {
    (saved.projectLink?.overrides || []).forEach(field => projectOverrides.add(field));
    restoreInputs(saved._inputs);
    renderResults(saved);
    exportBtn.disabled = false;
  } else {
    applyProjectInputs(false);
    // Default: one occupied-building exposure row
    addExposureRow({ label: 'Occupied building', type: 'occupied_building', actualDistM: 3 });
  }

  // -------------------------------------------------------------------
  // Exposure table management
  // -------------------------------------------------------------------

  function addExposureRow(defaults = {}) {
    const container = document.getElementById('exposures-container');
    const id = ++exposureCount;

    const row = document.createElement('div');
    row.className = 'field-row-inline exposure-row';
    row.dataset.exposureId = id;

    const typeOptions = EXPOSURE_TYPES.map(t =>
      `<option value="${t.value}"${defaults.type === t.value ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
    ).join('');

    row.innerHTML = `
      <label>Label
        <input type="text" class="exp-label" value="${escapeHtml(defaults.label || '')}" placeholder="e.g. North wall building" aria-label="Exposure label">
      </label>
      <label>Type
        <select class="exp-type" aria-label="Exposure type">${typeOptions}</select>
      </label>
      <label>Distance (m)
        <input type="number" class="exp-dist" value="${defaults.actualDistM ?? ''}" min="0" step="0.1" aria-label="Actual distance to exposure in metres">
      </label>
      <button type="button" class="btn exp-remove-btn" aria-label="Remove this exposure" title="Remove">✕</button>`;

    row.querySelector('.exp-remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function readExposures() {
    return Array.from(document.querySelectorAll('.exposure-row')).map(row => ({
      label:       row.querySelector('.exp-label').value.trim(),
      type:        row.querySelector('.exp-type').value,
      actualDistM: parseFloat(row.querySelector('.exp-dist').value) || 0,
    })).filter(e => e.actualDistM > 0 || e.label);
  }

  // -------------------------------------------------------------------
  // Input reading / restoring
  // -------------------------------------------------------------------

  function readInputs() {
    return {
      ratedKwh:           parseFloat(document.getElementById('rated-kwh').value),
      chemistry:          document.getElementById('chemistry').value,
      cellsPerModule:     parseInt(document.getElementById('cells-per-module').value, 10),
      modulesPerRack:     parseInt(document.getElementById('modules-per-rack').value, 10),
      ambientC:           parseFloat(document.getElementById('ambient-c').value),
      volumeM3:           parseFloat(document.getElementById('volume-m3').value),
      pstatKpa:           parseFloat(document.getElementById('pstat-kpa').value),
      providedVentAreaM2: parseFloat(document.getElementById('provided-vent-m2').value),
      exposures:          readExposures(),
    };
  }

  function restoreInputs(inputs) {
    if (!inputs) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set('rated-kwh',          inputs.ratedKwh);
    set('chemistry',          inputs.chemistry);
    set('cells-per-module',   inputs.cellsPerModule);
    set('modules-per-rack',   inputs.modulesPerRack);
    set('ambient-c',          inputs.ambientC);
    set('volume-m3',          inputs.volumeM3);
    set('pstat-kpa',          inputs.pstatKpa);
    set('provided-vent-m2',   inputs.providedVentAreaM2);
    // Restore exposure rows
    const container = document.getElementById('exposures-container');
    container.innerHTML = '';
    exposureCount = 0;
    if (Array.isArray(inputs.exposures)) {
      for (const exp of inputs.exposures) addExposureRow(exp);
    }
  }

  // -------------------------------------------------------------------
  // Calculate
  // -------------------------------------------------------------------

  function calculate() {
    const inputs = readInputs();
    const result = runBessHazardStudy(inputs);

    const snapshot = createStudyInputSnapshot('bessHazard', inputs, projectInputModel.bindings, projectOverrides);
    const toStore = withStudyProvenance({ ...result, _inputs: inputs }, snapshot);
    const studies = getStudies();
    studies.bessHazard = toStore;
    setStudies(studies);

    renderResults(toStore);
    exportBtn.disabled = !result.valid;
    exportBtn.removeAttribute('aria-disabled');
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

  function statusBadge(status) {
    const map = {
      review: ['fill-warn', 'Engineering review'],
      'screening-alert': ['fill-over', 'Screening alert'],
      pass: ['fill-warn', 'Engineering review'],
      warn: ['fill-warn', 'Engineering review'],
      fail: ['fill-over', 'Screening alert'],
    };
    const [cls, label] = map[status] || ['fill-warn', status];
    return `<span class="fill-badge ${cls}">${label}</span>`;
  }

  function renderResults(result) {
    renderWarnings(result);

    const el = document.getElementById('results');
    if (!result.valid) {
      el.hidden = false;
      el.innerHTML = `<div class="error-msg" role="alert"><strong>Input errors:</strong><ul>${
        result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')
      }</ul></div>`;
      return;
    }

    const { summary, separationChecks, propagation, ventArea, providedVentAreaM2, chemistryName } = result;
    const ventProvided = providedVentAreaM2 > 0;
    const ventStatus = providedVentAreaM2 < ventArea.ventAreaM2
      ? 'screening-alert' : 'review';
    const propagationMeetsScreening = summary.meetsScreeningPropagationThreshold
      ?? propagation.moduleToRack_min >= 30;
    const separationStatus = check => {
      const meets = check.meetsScreeningDistance ?? check.actualDistM >= check.minDistM;
      return meets ? 'review' : 'screening-alert';
    };

    const overallCls = 'fill-warn';
    const overallLabel = 'Engineering review required';

    // Separation rows
    const sepRows = separationChecks.length
      ? separationChecks.map(c => `
          <tr>
            <td>${escapeHtml(c.label)}</td>
            <td>${escapeHtml(c.type.replace('_', ' '))}</td>
            <td>${c.actualDistM} m (${c.actualDistFt} ft)</td>
            <td>${c.minDistM} m (${c.minDistFt} ft)</td>
            <td>${statusBadge(separationStatus(c))}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" style="font-style:italic">No exposures entered — separation checks skipped.</td></tr>`;

    el.hidden = false;
    el.innerHTML = `
      <!-- Overall screening summary card -->
      <section class="field-group" aria-label="BESS screening status" style="margin-bottom:1.5rem">
        <h2>BESS Screening Status</h2>
        <p style="font-size:1.1rem">
          <span class="fill-badge ${overallCls}" style="font-size:1rem; padding:.4rem .9rem">${overallLabel}</span>
        </p>
        <p class="hint">This result is a preliminary screening only. It does not establish code compliance or approve a Hazard Mitigation Analysis.</p>
        <table class="results-table" aria-label="BESS screening summary">
          <tbody>
            <tr>
              <td>Separation screening</td>
              <td>${statusBadge(separationChecks.some(c => separationStatus(c) === 'screening-alert') ? 'screening-alert' : 'review')}</td>
            </tr>
            <tr>
              <td>Deflagration-vent screening</td>
              <td>${statusBadge(ventStatus)}</td>
            </tr>
            <tr>
              <td>Generic propagation estimate</td>
              <td>${statusBadge(propagationMeetsScreening ? 'review' : 'screening-alert')}</td>
            </tr>
            <tr>
              <td>Chemistry</td>
              <td>${escapeHtml(chemistryName)}</td>
            </tr>
            <tr>
              <td>Rated capacity</td>
              <td>${result.ratedKwh} kWh</td>
            </tr>
          </tbody>
        </table>
        ${summary.issues.length ? `
          <div class="warning-panel" role="alert" style="border-left:4px solid var(--color-warn,#e6a000);padding:.75rem 1rem;margin:1rem 0;background:var(--color-bg-warn,#fffbe6)">
            <strong>Engineering Review Notes</strong>
            <ul>${summary.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
          </div>` : ''}
      </section>

      <!-- Separation checks -->
      <section class="field-group" aria-label="Separation distance results" style="margin-bottom:1.5rem">
        <h2>Advisory Separation Screening</h2>
        <p class="hint">These generic distances are review triggers, not NFPA 855 minimum clearances. Establish the required separation from the adopted code, listing, UL 9540A report, protection features, and AHJ decisions.</p>
        <table class="results-table" aria-label="Advisory separation distance screening table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Exposure type</th>
              <th>Actual distance</th>
              <th>Screening reference</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${sepRows}</tbody>
        </table>
      </section>

      <!-- Propagation timing -->
      <section class="field-group" aria-label="Thermal runaway propagation results" style="margin-bottom:1.5rem">
        <h2>Generic Thermal Runaway Estimate</h2>
        <p class="hint">This sensitivity model is not a UL 9540A test result and cannot predict the listed system's propagation performance.</p>
        <table class="results-table" aria-label="Propagation timing table">
          <tbody>
            <tr>
              <td>Cell → adjacent cell</td>
              <td><strong>${propagation.cellToCell_min} min</strong></td>
              <td></td>
            </tr>
            <tr>
              <td>Cell → full module (${result.cellsPerModule} cells)</td>
              <td><strong>${propagation.cellToModule_min} min</strong></td>
              <td></td>
            </tr>
            <tr>
              <td>Module → full rack (${result.modulesPerRack} modules)</td>
              <td><strong>${propagation.moduleToRack_min} min</strong></td>
              <td>${statusBadge(propagationMeetsScreening ? 'review' : 'screening-alert')} ${propagationMeetsScreening ? '≥ 30 min screening threshold' : '&lt; 30 min screening threshold'}</td>
            </tr>
            <tr>
              <td>Ambient temperature</td>
              <td>${result.ambientC}°C</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <p class="hint" style="font-size:.8em">Use the listed system's UL 9540A report to evaluate propagation, suppression, barriers, gas release, and installation limitations.</p>
      </section>

      <!-- Deflagration vent -->
      <section class="field-group" aria-label="Deflagration vent sizing results" style="margin-bottom:1.5rem">
        <h2>Preliminary Deflagration-Vent Screening</h2>
        <p class="hint">The equation uses generic chemistry-wide K<sub>G</sub> and P<sub>max</sub> assumptions. Final NFPA 68 design requires project-specific gas data and engineering review.</p>
        <table class="results-table" aria-label="Vent area sizing table">
          <tbody>
            <tr>
              <td>Screening vent area (A<sub>v</sub>)</td>
              <td><strong>${ventArea.ventAreaM2} m² (${ventArea.ventAreaFt2} ft²)</strong></td>
              <td></td>
            </tr>
            <tr>
              <td>Installed vent area</td>
              <td><strong>${providedVentAreaM2} m²</strong></td>
              <td>${statusBadge(ventStatus)}${!ventProvided ? ' No vent panels entered' : ''}</td>
            </tr>
            <tr>
              <td>Deflagration index K<sub>G</sub></td>
              <td>${ventArea.kG_barMs} bar·m/s</td>
              <td></td>
            </tr>
            <tr>
              <td>Max unvented pressure P<sub>max</sub></td>
              <td>${ventArea.pMax_bar} bar</td>
              <td></td>
            </tr>
            <tr>
              <td>Vent opening pressure P<sub>stat</sub></td>
              <td>${(ventArea.pStat_bar * 100).toFixed(1)} kPa (${ventArea.pStat_bar} bar)</td>
              <td></td>
            </tr>
            <tr>
              <td>Room volume</td>
              <td>${result.volumeM3} m³</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <p class="hint" style="font-size:.8em">Vent panels must be located per NFPA 68 §7.3 (accessible, unobstructed, direct outdoor discharge). Verify panel weight, deflection, and discharge trajectory with the manufacturer.</p>
      </section>`;
  }

  function renderWarnings(result) {
    const el = document.getElementById('warnings-panel');
    const w = [];
    if (result.propagation) w.push(...(result.propagation.warnings || []));
    if (result.ventArea)    w.push(...(result.ventArea.warnings || []));
    if (w.length === 0) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `
      <div class="warning-panel" style="border-left:4px solid var(--color-warn,#e6a000);padding:.75rem 1rem;margin:1rem 0;background:var(--color-bg-warn,#fffbe6)">
        <strong>⚠ Calculation Notes</strong>
        <ul>${w.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      </div>`;
  }

  // -------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------

  function exportCsv() {
    const saved = getStudies().bessHazard;
    if (!saved || !saved.valid) return;

    const { separationChecks, propagation, ventArea, providedVentAreaM2, summary, ratedKwh, chemistryName } = saved;
    const rows = [
      ['Section', 'Parameter', 'Value', 'Unit', 'Status'],
      ['System', 'Chemistry', chemistryName, '', ''],
      ['System', 'Rated capacity', ratedKwh, 'kWh', ''],
      ['System', 'Cells per module', saved.cellsPerModule, '', ''],
      ['System', 'Modules per rack', saved.modulesPerRack, '', ''],
      ['System', 'Ambient temperature', saved.ambientC, '°C', ''],
      ['System', 'Room volume', saved.volumeM3, 'm³', ''],
      ['System', 'Screening status', summary.status.toUpperCase(), '', 'Engineering review required'],
    ];

    for (const c of separationChecks) {
      const meetsScreening = c.meetsScreeningDistance ?? c.actualDistM >= c.minDistM;
      rows.push(['Separation', c.label, c.actualDistM, 'm', meetsScreening ? 'REVIEW' : 'SCREENING ALERT']);
      rows.push(['Separation', `${c.label} — advisory screening reference`, c.minDistM, 'm', '']);
    }

    rows.push(
      ['Propagation', 'Cell-to-cell', propagation.cellToCell_min, 'min', ''],
      ['Propagation', 'Cell-to-module', propagation.cellToModule_min, 'min', ''],
      ['Propagation', 'Module-to-rack', propagation.moduleToRack_min, 'min', (summary.meetsScreeningPropagationThreshold ?? propagation.moduleToRack_min >= 30) ? 'REVIEW' : 'SCREENING ALERT'],
      ['Vent', 'Screening vent area', ventArea.ventAreaM2, 'm²', ''],
      ['Vent', 'Installed vent area', providedVentAreaM2, 'm²', providedVentAreaM2 >= ventArea.ventAreaM2 ? 'REVIEW' : 'SCREENING ALERT'],
      ['Vent', 'K_G', ventArea.kG_barMs, 'bar·m/s', ''],
      ['Vent', 'P_max', ventArea.pMax_bar, 'bar', ''],
      ['Vent', 'P_stat', saved.pstatKpa, 'kPa', ''],
    );

    for (const issue of summary.issues) {
      rows.push(['Issues', issue, '', '', '']);
    }

    const csv = rows.map(r =>
      r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a_el = Object.assign(document.createElement('a'), {
      href: url, download: 'bess-hazard-screening.csv',
    });
    a_el.click();
    URL.revokeObjectURL(url);
  }
});
