import {
  calcDcFaultCurrent,
  calcDcArcFlash,
  selectDcProtection,
  runDcShortCircuitStudy,
  openCircuitVoltage,
  ppeCategoryForEnergy,
  CELL_VOLTAGE,
} from './analysis/dcShortCircuit.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('dc-sc-form');
  const resultsDiv = document.getElementById('results');
  const arcFlashToggle = document.getElementById('run-arc-flash');
  const arcFlashSection = document.getElementById('arc-flash-section');
  const addDeviceBtn = document.getElementById('add-device-btn');
  const deviceTableBody = document.getElementById('device-table-body');
  const voltageInput = document.getElementById('battery-voltage');
  const cellCountInput = document.getElementById('cell-count');
  const chemistrySelect = document.getElementById('chemistry');

  initStudyApprovalPanel('dcShortCircuit');

  // --- Restore saved results ---
  const saved = getStudies().dcShortCircuit;
  if (saved) {
    restoreForm(saved);
    renderResults(saved);
  }

  // --- Toggle arc flash section visibility ---
  arcFlashToggle.addEventListener('change', () => {
    arcFlashSection.hidden = !arcFlashToggle.checked;
  });

  // --- Auto-compute voltage from cells × chemistry ---
  function updateVoltageFromCells() {
    const cells = parseInt(cellCountInput.value, 10);
    const chem = chemistrySelect.value;
    const vPerCell = CELL_VOLTAGE[chem] || 2.0;
    if (Number.isFinite(cells) && cells > 0) {
      voltageInput.value = (cells * vPerCell).toFixed(0);
    }
  }
  cellCountInput.addEventListener('input', updateVoltageFromCells);
  chemistrySelect.addEventListener('change', updateVoltageFromCells);

  // --- Add/remove protection device rows ---
  addDeviceBtn.addEventListener('click', () => addDeviceRow());

  deviceTableBody.addEventListener('click', e => {
    if (e.target.closest('.remove-device-btn')) {
      e.target.closest('tr').remove();
    }
  });

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runDcShortCircuitStudy(inputs);
    } catch (err) {
      showModal('Analysis Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.dcShortCircuit = { inputs, result };
    setStudies(studies);

    renderResults({ inputs, result });
  });

  // --------------------------------------------------------------------------

  function addDeviceRow(tag = '', type = 'fuse', ratedA = '', interruptA = '', clearMs = '') {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="dev-tag" value="${escHtml(String(tag))}"
          placeholder="F1 / CB1" aria-label="Device tag"></td>
      <td>
        <select class="dev-type" aria-label="Device type">
          <option value="fuse"${type === 'fuse' ? ' selected' : ''}>Fuse</option>
          <option value="breaker"${type === 'breaker' ? ' selected' : ''}>Breaker</option>
          <option value="disconnect"${type === 'disconnect' ? ' selected' : ''}>Disconnect</option>
        </select>
      </td>
      <td><input type="number" class="dev-rated" min="1" step="1"
          value="${escHtml(String(ratedA))}" placeholder="100" aria-label="Rated current A"></td>
      <td><input type="number" class="dev-interrupt" min="1" step="100"
          value="${escHtml(String(interruptA))}" placeholder="10000" required aria-label="Interrupt rating A"></td>
      <td><input type="number" class="dev-clear" min="1" step="1"
          value="${escHtml(String(clearMs))}" placeholder="50" aria-label="Clearing time ms"></td>
      <td><button type="button" class="remove-device-btn btn-icon"
          aria-label="Remove device" title="Remove">×</button></td>`;
    deviceTableBody.appendChild(tr);
  }

  function readFormInputs() {
    const getEl = id => document.getElementById(id);
    const getFloat = id => parseFloat(getEl(id).value);

    const batteryVoltageV = getFloat('battery-voltage');
    const batteryInternalResistanceOhm = getFloat('battery-resistance') / 1000; // mΩ → Ω
    const cableResistanceOhm = (getFloat('cable-resistance') || 0) / 1000;
    const busbarResistanceOhm = (getFloat('bus-resistance') || 0) / 1000;
    const inductanceMH = getFloat('inductance') || 0;
    const studyLabel = getEl('study-label').value.trim();

    if (!Number.isFinite(batteryVoltageV) || batteryVoltageV <= 0) {
      showModal('Input Error', '<p>DC system voltage must be a positive number.</p>', 'error');
      return null;
    }
    if (!Number.isFinite(batteryInternalResistanceOhm) || batteryInternalResistanceOhm <= 0) {
      showModal('Input Error', '<p>Battery internal resistance must be a positive number.</p>', 'error');
      return null;
    }

    const runArcFlash = arcFlashToggle.checked;
    let arcDurationMs, gapMm, workingDistanceMm, enclosureType;
    if (runArcFlash) {
      arcDurationMs = getFloat('arc-duration');
      gapMm = getFloat('gap-mm') || 25;
      workingDistanceMm = getFloat('working-distance') || 455;
      enclosureType = getEl('enclosure-type').value;
      if (!Number.isFinite(arcDurationMs) || arcDurationMs <= 0) {
        showModal('Input Error', '<p>Arc duration (clearing time) must be a positive number.</p>', 'error');
        return null;
      }
    }

    // Collect protection devices
    const devices = [];
    deviceTableBody.querySelectorAll('tr').forEach(row => {
      const tag = row.querySelector('.dev-tag').value.trim();
      const type = row.querySelector('.dev-type').value;
      const ratedCurrentA = parseFloat(row.querySelector('.dev-rated').value) || null;
      const interruptRatingA = parseFloat(row.querySelector('.dev-interrupt').value);
      const clearingTimeMs = parseFloat(row.querySelector('.dev-clear').value) || null;
      if (Number.isFinite(interruptRatingA) && interruptRatingA > 0) {
        devices.push({ tag: tag || type, type, ratedCurrentA, interruptRatingA, clearingTimeMs });
      }
    });

    return {
      batteryVoltageV,
      batteryInternalResistanceOhm,
      cableResistanceOhm,
      busbarResistanceOhm,
      inductanceMH,
      runArcFlash,
      arcDurationMs,
      gapMm,
      workingDistanceMm,
      enclosureType,
      devices,
      studyLabel,
    };
  }

  function restoreForm(saved) {
    const inputs = saved?.inputs;
    if (!inputs) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };
    set('study-label', inputs.studyLabel);
    set('battery-voltage', inputs.batteryVoltageV);
    set('battery-resistance', (inputs.batteryInternalResistanceOhm * 1000).toFixed(2));
    set('cable-resistance', ((inputs.cableResistanceOhm || 0) * 1000).toFixed(2));
    set('bus-resistance', ((inputs.busbarResistanceOhm || 0) * 1000).toFixed(2));
    set('inductance', inputs.inductanceMH || 0);
    if (inputs.runArcFlash) {
      arcFlashToggle.checked = true;
      arcFlashSection.hidden = false;
      set('arc-duration', inputs.arcDurationMs);
      set('gap-mm', inputs.gapMm);
      set('working-distance', inputs.workingDistanceMm);
      set('enclosure-type', inputs.enclosureType);
    }
    if (Array.isArray(inputs.devices)) {
      inputs.devices.forEach(d => addDeviceRow(d.tag, d.type, d.ratedCurrentA, d.interruptRatingA, d.clearingTimeMs));
    }
  }

  function renderResults(saved) {
    const { inputs, result } = saved;
    if (!result) return;

    const fc = result.faultCurrent;
    const af = result.arcFlash;
    const pc = result.protectionCheck;

    let html = `<section class="results-card" aria-label="DC short-circuit results">`;
    html += `<h2>Results${inputs?.studyLabel ? ` — ${escHtml(inputs.studyLabel)}` : ''}</h2>`;

    // Fault current
    html += `<h3>Fault Current (IEEE 946 / IEC 61660)</h3>`;
    html += `<table class="results-table">
      <tbody>
        <tr><th>DC System Voltage</th><td>${fc.openCircuitVoltageV.toFixed(0)} V</td></tr>
        <tr><th>Total Circuit Resistance</th><td>${(fc.totalResistanceOhm * 1000).toFixed(2)} mΩ</td></tr>
        <tr><th>Bolted Fault Current (I<sub>bf</sub>)</th><td><strong>${fc.boltedFaultCurrentA.toLocaleString()} A</strong></td></tr>
        ${fc.timeConstantMs > 0 ? `<tr><th>L/R Time Constant</th><td>${fc.timeConstantMs.toFixed(1)} ms</td></tr>` : ''}
      </tbody>
    </table>`;

    // Arc flash
    if (af) {
      const ppeBadgeClass = af.ppeCategory >= 4 ? 'ppe-danger' : af.ppeCategory >= 3 ? 'ppe-high' : af.ppeCategory >= 2 ? 'ppe-medium' : af.ppeCategory >= 1 ? 'ppe-low' : 'ppe-none';
      html += `<h3>DC Arc Flash (NFPA 70E Annex D.8.1 — Ammerman Method)</h3>`;
      html += `<table class="results-table">
        <tbody>
          <tr><th>Arcing Current (I<sub>arc</sub>)</th><td>${af.arcCurrentA.toLocaleString()} A</td></tr>
          <tr><th>Arc Voltage</th><td>${af.arcVoltageV.toFixed(1)} V</td></tr>
          <tr><th>Arc Power</th><td>${(af.arcPowerW / 1000).toFixed(1)} kW</td></tr>
          <tr><th>Arc Duration</th><td>${af.arcDurationMs.toFixed(0)} ms</td></tr>
          <tr><th>Working Distance</th><td>${af.workingDistanceMm} mm (${(af.workingDistanceMm / 25.4).toFixed(1)} in)</td></tr>
          <tr><th>Incident Energy</th><td><strong>${af.incidentEnergyCalCm2.toFixed(2)} cal/cm²</strong></td></tr>
          <tr><th>Arc Flash Boundary</th><td>${af.arcFlashBoundaryMm.toFixed(0)} mm (${(af.arcFlashBoundaryMm / 25.4).toFixed(1)} in)</td></tr>
          <tr><th>PPE Category</th><td><span class="ppe-badge ${ppeBadgeClass}">${af.ppeCategory === 5 ? 'Dangerous' : `Category ${af.ppeCategory}`}</span></td></tr>
          <tr><th>PPE Requirement</th><td>${escHtml(af.ppeCategoryLabel)}</td></tr>
        </tbody>
      </table>`;
      if (af.notes && af.notes.length) {
        html += `<ul class="notes-list">${af.notes.map(n => `<li class="note-warning">${escHtml(n)}</li>`).join('')}</ul>`;
      }
    }

    // Protection check
    if (pc && pc.length) {
      html += `<h3>Protection Device Assessment</h3>`;
      html += `<table class="results-table data-table">
        <thead>
          <tr><th>Tag</th><th>Type</th><th>Rated (A)</th><th>Interrupt Rating (A)</th><th>Status</th><th>Notes</th></tr>
        </thead>
        <tbody>`;
      pc.forEach(dev => {
        const statusClass = dev.pass === true ? 'status-pass' : dev.pass === false ? 'status-fail' : 'status-unknown';
        const statusLabel = dev.pass === true ? '✓ Pass' : dev.pass === false ? '✗ Fail' : 'Unknown';
        html += `<tr>
          <td>${escHtml(dev.tag)}</td>
          <td>${escHtml(dev.type)}</td>
          <td>${dev.ratedCurrentA != null ? dev.ratedCurrentA.toLocaleString() : '—'}</td>
          <td>${dev.interruptRatingA != null ? dev.interruptRatingA.toLocaleString() : '—'}</td>
          <td class="${statusClass}">${statusLabel}</td>
          <td>${dev.note ? escHtml(dev.note) : '—'}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    html += `</section>`;
    resultsDiv.innerHTML = html;
  }
});
