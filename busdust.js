import {
  runBusDuctStudy,
  STANDARD_BUSWAY_RATINGS,
  BUSWAY_LIBRARY,
} from './analysis/busDuctSizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('busDuctSizing');

  const calculateBtn = document.getElementById('calculate-btn');
  const exportBtn    = document.getElementById('export-btn');

  calculateBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);

  // Restore previously saved state
  const saved = getStudies().busDuctSizing;
  if (saved && saved._inputs) {
    restoreInputs(saved._inputs);
    renderResults(saved);
    exportBtn.disabled = false;
  }

  // -------------------------------------------------------------------
  // Calculate
  // -------------------------------------------------------------------

  function calculate() {
    const inputs = readInputs();
    const result = runBusDuctStudy(inputs);

    const toStore = { ...result, _inputs: inputs };
    const studies = getStudies();
    studies.busDuctSizing = toStore;
    setStudies(studies);

    renderResults(toStore);
    exportBtn.disabled = !result.valid;
  }

  // -------------------------------------------------------------------
  // Input reading
  // -------------------------------------------------------------------

  function readInputs() {
    return {
      label:              document.getElementById('run-label').value.trim() || 'Bus Duct Run',
      material:           document.getElementById('material').value,
      phases:             parseInt(document.getElementById('phases').value, 10),
      systemVoltageV:     parseFloat(document.getElementById('system-voltage').value),
      currentA:           parseFloat(document.getElementById('current-a').value),
      lengthFt:           parseFloat(document.getElementById('length-ft').value),
      orientation:        document.getElementById('orientation').value,
      ambientC:           parseFloat(document.getElementById('ambient-c').value),
      stackedRuns:        parseInt(document.getElementById('stacked-runs').value, 10),
      faultCurrentKA:     parseFloat(document.getElementById('fault-ka').value),
      conductorSpacingIn: parseFloat(document.getElementById('spacing-in').value),
      supportSpanFt:      parseFloat(document.getElementById('span-ft').value),
    };
  }

  function restoreInputs(inputs) {
    if (!inputs) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set('run-label',     inputs.label);
    set('material',      inputs.material);
    set('phases',        inputs.phases);
    set('system-voltage', inputs.systemVoltageV);
    set('current-a',     inputs.currentA);
    set('length-ft',     inputs.lengthFt);
    set('orientation',   inputs.orientation);
    set('ambient-c',     inputs.ambientC);
    set('stacked-runs',  inputs.stackedRuns);
    set('fault-ka',      inputs.faultCurrentKA);
    set('spacing-in',    inputs.conductorSpacingIn);
    set('span-ft',       inputs.supportSpanFt);
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

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

    const a  = result.ampacity;
    const sb = result.selectedBusway;
    const vd = result.voltageDrop;
    const fs = result.faultStress;

    const utilClass = a.utilizationPct > 100 ? 'fill-over' : a.utilizationPct > 80 ? 'fill-warn' : 'fill-ok';
    const vdClass   = vd.passNec ? 'fill-ok' : 'fill-over';
    const spanClass = fs.spanPass ? 'fill-ok' : 'fill-over';

    el.hidden = false;
    el.innerHTML = `
      <h2>${escapeHtml(result.label)}</h2>

      <!-- Ampacity card -->
      <section class="field-group" aria-label="Ampacity results" style="margin-bottom:1.5rem">
        <h3>Ampacity (NEC 368)</h3>
        <table class="results-table" aria-label="Ampacity summary">
          <tbody>
            <tr>
              <td>Selected busway</td>
              <td><strong>${sb.rating} A ${escapeHtml(sb.material)} busway</strong></td>
              <td><span class="fill-badge ${utilClass}">Utilization ${a.utilizationPct}%</span></td>
            </tr>
            <tr><td>Load current</td><td>${a.requestedCurrentA} A</td><td></td></tr>
            <tr><td>Base (rated) ampacity</td><td>${a.baseAmpacity} A</td><td></td></tr>
            <tr><td>Derated ampacity</td><td><strong>${a.deratedAmpacity} A</strong></td><td></td></tr>
            <tr><td>Orientation factor</td><td>${a.orientationFactor.toFixed(2)}</td><td></td></tr>
            <tr><td>Ambient temperature factor</td><td>${a.ambientFactor.toFixed(4)}</td><td></td></tr>
            <tr><td>Stacking factor</td><td>${a.stackingFactor.toFixed(2)}</td><td></td></tr>
            <tr><td>Combined derating factor</td><td><strong>${a.combinedFactor.toFixed(4)}</strong></td><td></td></tr>
            <tr><td>Resistance (selected)</td><td>${sb.rMohmPerFt} mΩ/ft</td><td></td></tr>
            <tr><td>Reactance (selected)</td><td>${sb.xMohmPerFt} mΩ/ft</td><td></td></tr>
            <tr><td>Weight (indicative)</td><td>${sb.weightLbPerFt} lb/ft</td><td></td></tr>
          </tbody>
        </table>
      </section>

      <!-- Voltage drop card -->
      <section class="field-group" aria-label="Voltage drop results" style="margin-bottom:1.5rem">
        <h3>Voltage Drop (NEC 215.2)</h3>
        <table class="results-table" aria-label="Voltage drop summary">
          <tbody>
            <tr>
              <td>Voltage drop (%)</td>
              <td><strong>${vd.vdPercent}%</strong></td>
              <td><span class="fill-badge ${vdClass}">${vd.passNec ? `✓ Pass ≤ ${vd.necThresholdPct}%` : `✗ Exceeds ${vd.necThresholdPct}% limit`}</span></td>
            </tr>
            <tr><td>Voltage drop (V, L–L)</td><td>${vd.vdLineToLineV} V</td><td></td></tr>
            <tr><td>Voltage drop (V, L–N)</td><td>${vd.vdLineToNeutralV} V</td><td></td></tr>
            <tr><td>Total run resistance</td><td>${vd.rOhmTotal} Ω</td><td></td></tr>
            <tr><td>Total run reactance</td><td>${vd.xOhmTotal} Ω</td><td></td></tr>
          </tbody>
        </table>
      </section>

      <!-- Fault stress card -->
      <section class="field-group" aria-label="Fault stress results" style="margin-bottom:1.5rem">
        <h3>Fault Stress (IEEE 605)</h3>
        <table class="results-table" aria-label="Fault stress summary">
          <tbody>
            <tr>
              <td>Support span check</td>
              <td>${fs.installedSpanFt} ft installed vs. ${fs.maxSupportSpanFt} ft max</td>
              <td><span class="fill-badge ${spanClass}">${fs.spanPass ? '✓ Pass' : '✗ Exceeds max span'}</span></td>
            </tr>
            <tr><td>Fault current</td><td>${fs.faultCurrentKA} kA (sym. RMS)</td><td></td></tr>
            <tr><td>Conductor spacing</td><td>${fs.conductorSpacingIn} in</td><td></td></tr>
            <tr><td>Force per foot</td><td>${fs.forcePerFt} lbf/ft</td><td></td></tr>
            <tr><td>Allowable stress</td><td>${fs.allowableStressPsi.toLocaleString()} psi (${escapeHtml(sb.material)})</td><td></td></tr>
            <tr><td>Section modulus Z</td><td>${fs.sectionModulusIn3} in³</td><td></td></tr>
            <tr><td>Max support span (IEEE 605)</td><td>${fs.maxSupportSpanFt} ft</td><td></td></tr>
          </tbody>
        </table>
        <p class="hint" style="font-size:.8em">Factory-assembled busway enclosures typically withstand higher structural loads than bare conductors alone. Verify the selected product's short-time withstand and support span ratings with the manufacturer.</p>
      </section>`;
  }

  function renderWarnings(result) {
    const el = document.getElementById('warnings-panel');
    const warnings = result.warnings || [];
    if (warnings.length === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <div class="warning-panel" style="border-left:4px solid var(--color-warn,#e6a000);padding:.75rem 1rem;margin:1rem 0;background:var(--color-bg-warn,#fffbe6)">
        <strong>⚠ Sizing Warnings</strong>
        <ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      </div>`;
  }

  // -------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------

  function exportCsv() {
    const saved = getStudies().busDuctSizing;
    if (!saved || !saved.valid) return;

    const a  = saved.ampacity;
    const sb = saved.selectedBusway;
    const vd = saved.voltageDrop;
    const fs = saved.faultStress;

    const rows = [
      ['Section', 'Parameter', 'Value', 'Unit', 'Status'],
      // Ampacity
      ['Ampacity', 'Run label',             escapeHtml(saved.label),     '',      ''],
      ['Ampacity', 'Conductor material',    sb.material,                 '',      ''],
      ['Ampacity', 'Selected busway rating', sb.rating,                  'A',     ''],
      ['Ampacity', 'Load current',          a.requestedCurrentA,         'A',     ''],
      ['Ampacity', 'Base ampacity',         a.baseAmpacity,              'A',     ''],
      ['Ampacity', 'Orientation factor',    a.orientationFactor,         '',      ''],
      ['Ampacity', 'Ambient temp factor',   a.ambientFactor,             '',      ''],
      ['Ampacity', 'Stacking factor',       a.stackingFactor,            '',      ''],
      ['Ampacity', 'Combined factor',       a.combinedFactor,            '',      ''],
      ['Ampacity', 'Derated ampacity',      a.deratedAmpacity,           'A',     ''],
      ['Ampacity', 'Utilization',           a.utilizationPct,            '%',     a.utilizationPct <= 100 ? 'Pass' : 'FAIL'],
      ['Ampacity', 'Resistance (selected)', sb.rMohmPerFt,               'mΩ/ft', ''],
      ['Ampacity', 'Reactance (selected)',  sb.xMohmPerFt,               'mΩ/ft', ''],
      // Voltage drop
      ['Voltage Drop', 'VD line-to-line',   vd.vdLineToLineV,   'V',   ''],
      ['Voltage Drop', 'VD percent',        vd.vdPercent,       '%',   vd.passNec ? 'Pass' : 'FAIL'],
      ['Voltage Drop', 'NEC threshold',     vd.necThresholdPct, '%',   ''],
      ['Voltage Drop', 'Run resistance',    vd.rOhmTotal,       'Ω',   ''],
      ['Voltage Drop', 'Run reactance',     vd.xOhmTotal,       'Ω',   ''],
      // Fault stress
      ['Fault Stress', 'Fault current',        fs.faultCurrentKA,     'kA',   ''],
      ['Fault Stress', 'Conductor spacing',    fs.conductorSpacingIn, 'in',   ''],
      ['Fault Stress', 'Force per foot',       fs.forcePerFt,         'lbf/ft', ''],
      ['Fault Stress', 'Allowable stress',     fs.allowableStressPsi, 'psi',  ''],
      ['Fault Stress', 'Section modulus Z',    fs.sectionModulusIn3,  'in³',  ''],
      ['Fault Stress', 'Max support span',     fs.maxSupportSpanFt,   'ft',   ''],
      ['Fault Stress', 'Installed span',       fs.installedSpanFt,    'ft',   fs.spanPass ? 'Pass' : 'FAIL'],
    ];

    if (saved.warnings && saved.warnings.length) {
      rows.push(['Warnings', '', '', '', '']);
      for (const w of saved.warnings) {
        rows.push(['Warnings', w, '', '', '']);
      }
    }

    const csv = rows.map(r =>
      r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a_el = Object.assign(document.createElement('a'), {
      href: url, download: 'bus-duct-sizing.csv',
    });
    a_el.click();
    URL.revokeObjectURL(url);
  }
});
