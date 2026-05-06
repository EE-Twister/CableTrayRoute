import {
  runBessHazardStudy,
  CHEMISTRY_PARAMS,
  EXPOSURE_TYPES,
} from './analysis/bessHazard.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

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

  calculateBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);
  addExpBtn.addEventListener('click', () => addExposureRow());

  // Restore previously saved state
  const saved = getStudies().bessHazard;
  if (saved && saved._inputs) {
    restoreInputs(saved._inputs);
    renderResults(saved);
    exportBtn.disabled = false;
  } else {
    // Default: one occupied-building exposure row
    addExposureRow({ label: 'Occupied building', type: 'occupied_building', actualDistM: 3 });
  }

  // -------------------------------------------------------------------
  // Exposure table management
  // -------------------------------------------------------------------

  let exposureCount = 0;

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

    const toStore = { ...result, _inputs: inputs };
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
    const map = { pass: ['fill-ok', '✓ Pass'], warn: ['fill-warn', '⚠ Warning'], fail: ['fill-over', '✗ Fail'] };
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
    const ventPass = providedVentAreaM2 >= ventArea.ventAreaM2;
    const ventProvided = providedVentAreaM2 > 0;

    // Overall HMA card
    const overallCls = summary.status === 'pass' ? 'fill-ok'
      : summary.status === 'warn' ? 'fill-warn' : 'fill-over';
    const overallLabel = summary.status === 'pass' ? '✓ HMA: All checks pass'
      : summary.status === 'warn' ? '⚠ HMA: Warnings present'
      : '✗ HMA: One or more checks fail';

    // Separation rows
    const sepRows = separationChecks.length
      ? separationChecks.map(c => `
          <tr>
            <td>${escapeHtml(c.label)}</td>
            <td>${escapeHtml(c.type.replace('_', ' '))}</td>
            <td>${c.actualDistM} m (${c.actualDistFt} ft)</td>
            <td>${c.minDistM} m (${c.minDistFt} ft)</td>
            <td>${statusBadge(c.status)}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" style="font-style:italic">No exposures entered — separation checks skipped.</td></tr>`;

    el.hidden = false;
    el.innerHTML = `
      <!-- Overall HMA summary card -->
      <section class="field-group" aria-label="HMA overall status" style="margin-bottom:1.5rem">
        <h2>HMA Overall Status</h2>
        <p style="font-size:1.1rem">
          <span class="fill-badge ${overallCls}" style="font-size:1rem; padding:.4rem .9rem">${overallLabel}</span>
        </p>
        <table class="results-table" aria-label="HMA check summary">
          <tbody>
            <tr>
              <td>Separation checks</td>
              <td>${statusBadge(summary.separationOk ? (separationChecks.some(c => c.status === 'warn') ? 'warn' : 'pass') : 'fail')}</td>
            </tr>
            <tr>
              <td>Deflagration vent</td>
              <td>${statusBadge(!ventProvided ? 'warn' : ventPass ? 'pass' : 'fail')}</td>
            </tr>
            <tr>
              <td>Propagation timing</td>
              <td>${statusBadge(summary.propagationOk ? 'pass' : 'fail')}</td>
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
            <strong>Issues &amp; Warnings</strong>
            <ul>${summary.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
          </div>` : ''}
      </section>

      <!-- Separation checks -->
      <section class="field-group" aria-label="Separation distance results" style="margin-bottom:1.5rem">
        <h2>Separation Checks (NFPA 855 §15.3)</h2>
        <table class="results-table" aria-label="Separation distance check table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Exposure type</th>
              <th>Actual distance</th>
              <th>Required (NFPA 855)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${sepRows}</tbody>
        </table>
      </section>

      <!-- Propagation timing -->
      <section class="field-group" aria-label="Thermal runaway propagation results" style="margin-bottom:1.5rem">
        <h2>Thermal Runaway Propagation (UL 9540A)</h2>
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
              <td>${statusBadge(summary.propagationOk ? 'pass' : 'fail')} ${!summary.propagationOk ? '&lt; 30 min — suppression recommended' : '≥ 30 min'}</td>
            </tr>
            <tr>
              <td>Ambient temperature</td>
              <td>${result.ambientC}°C</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <p class="hint" style="font-size:.8em">NFPA 855 §15.9 recommends automatic suppression for installations where thermal runaway can propagate to the full rack in less than 30 minutes.</p>
      </section>

      <!-- Deflagration vent -->
      <section class="field-group" aria-label="Deflagration vent sizing results" style="margin-bottom:1.5rem">
        <h2>Deflagration Vent Sizing (NFPA 68 §7.4.3)</h2>
        <table class="results-table" aria-label="Vent area sizing table">
          <tbody>
            <tr>
              <td>Required vent area (A<sub>v</sub>)</td>
              <td><strong>${ventArea.ventAreaM2} m² (${ventArea.ventAreaFt2} ft²)</strong></td>
              <td></td>
            </tr>
            <tr>
              <td>Installed vent area</td>
              <td><strong>${providedVentAreaM2} m²</strong></td>
              <td>${statusBadge(!ventProvided ? 'warn' : ventPass ? 'pass' : 'fail')}${!ventProvided ? ' No vent panels entered' : ''}</td>
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
      ['System', 'HMA overall status', summary.status.toUpperCase(), '', ''],
    ];

    for (const c of separationChecks) {
      rows.push(['Separation', c.label, c.actualDistM, 'm', c.status.toUpperCase()]);
      rows.push(['Separation', `${c.label} — required`, c.minDistM, 'm', '']);
    }

    rows.push(
      ['Propagation', 'Cell-to-cell', propagation.cellToCell_min, 'min', ''],
      ['Propagation', 'Cell-to-module', propagation.cellToModule_min, 'min', ''],
      ['Propagation', 'Module-to-rack', propagation.moduleToRack_min, 'min', summary.propagationOk ? 'PASS' : 'FAIL'],
      ['Vent', 'Required vent area', ventArea.ventAreaM2, 'm²', ''],
      ['Vent', 'Installed vent area', providedVentAreaM2, 'm²', (providedVentAreaM2 >= ventArea.ventAreaM2) ? 'PASS' : 'FAIL'],
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
      href: url, download: 'bess-hazard-hma.csv',
    });
    a_el.click();
    URL.revokeObjectURL(url);
  }
});
