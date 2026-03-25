import {
  STANDARDS,
  INSTALLATION_METHODS,
  CABLE_SIZES_MM2,
  lookupAmpacity,
  getTempCorrectionFactor,
  getGroupingFactor,
  sizeCable,
  checkCableAdequacy,
} from './analysis/intlCableSize.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const standardSel    = document.getElementById('standard');
  const methodSel      = document.getElementById('method');
  const phasesSel      = document.getElementById('phases');
  const materialSel    = document.getElementById('material');
  const insulationSel  = document.getElementById('insulation');
  const loadAmpsInput  = document.getElementById('loadAmps');
  const ambientInput   = document.getElementById('ambientTemp');
  const numGroupsInput = document.getElementById('numGroups');
  const modeSelect     = document.getElementById('sizingMode');
  const checkSizeRow   = document.getElementById('checkSizeRow');
  const checkSizeSel   = document.getElementById('checkSize');
  const calcBtn        = document.getElementById('calcBtn');
  const resultsDiv     = document.getElementById('results');
  const refAmbientHint = document.getElementById('refAmbientHint');

  // ---------------------------------------------------------------------------
  // Populate selects
  // ---------------------------------------------------------------------------

  Object.entries(STANDARDS).forEach(([key, s]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = s.name;
    standardSel.appendChild(opt);
  });

  Object.entries(INSTALLATION_METHODS).forEach(([key, m]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${m.label} — ${m.description}`;
    methodSel.appendChild(opt);
  });

  CABLE_SIZES_MM2.forEach(sz => {
    const opt = document.createElement('option');
    opt.value = sz;
    opt.textContent = `${sz} mm²`;
    checkSizeSel.appendChild(opt);
  });

  // ---------------------------------------------------------------------------
  // Reactive UI helpers
  // ---------------------------------------------------------------------------

  function updateRefAmbientHint() {
    const std = STANDARDS[standardSel.value];
    if (std) {
      refAmbientHint.textContent =
        `Reference ambient for ${std.name} is ${std.refAmbient} °C. ` +
        'Leave blank to use the reference temperature (no derating).';
      if (ambientInput.placeholder !== undefined) {
        ambientInput.placeholder = String(std.refAmbient);
      }
    }
  }

  function updateModeUI() {
    const isCheck = modeSelect.value === 'check';
    checkSizeRow.hidden = !isCheck;
    calcBtn.textContent = isCheck ? 'Check Adequacy' : 'Size Cable';
  }

  standardSel.addEventListener('change', updateRefAmbientHint);
  modeSelect.addEventListener('change', updateModeUI);

  updateRefAmbientHint();
  updateModeUI();

  // ---------------------------------------------------------------------------
  // Calculate
  // ---------------------------------------------------------------------------

  calcBtn.addEventListener('click', () => {
    const standard   = standardSel.value;
    const method     = methodSel.value;
    const phases     = parseInt(phasesSel.value, 10);
    const material   = materialSel.value;
    const insulation = insulationSel.value;
    const loadAmps   = parseFloat(loadAmpsInput.value);
    const ambientRaw = ambientInput.value.trim();
    const ambientTemp = ambientRaw === ''
      ? STANDARDS[standard].refAmbient
      : parseFloat(ambientRaw);
    const numGroups  = parseInt(numGroupsInput.value, 10) || 1;
    const mode       = modeSelect.value;

    if (!Number.isFinite(loadAmps) || loadAmps <= 0) {
      showAlertModal('Enter a positive design current in amperes.');
      return;
    }
    if (!Number.isFinite(ambientTemp)) {
      showAlertModal('Enter a valid ambient temperature in °C, or leave blank for the reference temperature.');
      return;
    }
    if (numGroups < 1) {
      showAlertModal('Number of grouped circuits must be at least 1.');
      return;
    }

    const baseParams = { standard, method, phases, material, insulation, loadAmps, ambientTemp, numGroups };

    let result;
    try {
      if (mode === 'check') {
        const size = parseFloat(checkSizeSel.value);
        result = checkCableAdequacy({ ...baseParams, size });
      } else {
        result = sizeCable(baseParams);
      }
    } catch (err) {
      showAlertModal(`Calculation error: ${err.message}`);
      return;
    }

    renderResult(result, baseParams, mode);
  });

  // ---------------------------------------------------------------------------
  // Result rendering
  // ---------------------------------------------------------------------------

  function renderResult(r, params, mode) {
    const statusClass = r.status === 'PASS' ? 'result-ok' : 'result-fail';
    const statusLabel = r.status === 'PASS'
      ? (mode === 'check' ? 'ADEQUATE' : 'SIZED')
      : r.status === 'UNDERSIZED'
        ? 'UNDERSIZED'
        : 'NO STANDARD SIZE';

    const sizeDisplay = r.size != null ? `${r.size} mm²` : '—';
    const baseDisplay = r.baseAmpacity != null ? `${r.baseAmpacity} A` : '—';
    const corrDisplay = r.correctedAmpacity != null ? `${r.correctedAmpacity} A` : '—';

    const stdName = esc(STANDARDS[params.standard]?.name ?? params.standard);

    let skippedWarning = '';
    if (r.skippedSizes && r.skippedSizes.length > 0) {
      const items = r.skippedSizes
        .map(s => `<li><strong>${esc(String(s.sizeMm2))} mm²</strong> — ${esc(s.reason)}</li>`)
        .join('');
      skippedWarning = `
      <div class="result-warn" role="alert">
        <strong>Warning: ${r.skippedSizes.length} size(s) not evaluated</strong>
        <p>The following candidate size(s) were skipped because no ampacity data exists for the selected combination of standard, method, conductor, and insulation:</p>
        <ul>${items}</ul>
        <p>The result above reflects only the sizes that were evaluated. Consider selecting a different installation method or conductor material if these sizes are required.</p>
      </div>`;
    }

    resultsDiv.innerHTML = `
      <div class="result-card ${statusClass}" role="status">
        <h2>${mode === 'check' ? 'Adequacy Check' : 'Cable Sizing'} Result</h2>
        <table class="result-table" aria-label="Cable sizing results">
          <tbody>
            <tr><th scope="row">Standard</th>
                <td>${stdName}</td></tr>
            <tr><th scope="row">Installation Method</th>
                <td>${esc(params.method)} — ${esc(INSTALLATION_METHODS[params.method]?.description ?? '')}</td></tr>
            <tr><th scope="row">Configuration</th>
                <td>${params.phases === 2 ? 'Single-phase (2 loaded conductors)' : 'Three-phase (3 loaded conductors)'}</td></tr>
            <tr><th scope="row">Conductor</th>
                <td>${esc(params.material)} / ${esc(params.insulation)}</td></tr>
            <tr><th scope="row">Design Current (I<sub>b</sub>)</th>
                <td>${params.loadAmps.toFixed(1)} A</td></tr>
            <tr><th scope="row">Ambient Temperature</th>
                <td>${params.ambientTemp} °C</td></tr>
            <tr><th scope="row">Grouped Circuits</th>
                <td>${params.numGroups}</td></tr>
            <tr class="result-divider"><td colspan="2"></td></tr>
            <tr><th scope="row">Recommended Size</th>
                <td><strong>${esc(sizeDisplay)}</strong></td></tr>
            <tr><th scope="row">Base Ampacity (I<sub>z</sub>)</th>
                <td>${esc(baseDisplay)}</td></tr>
            <tr><th scope="row">Temperature Factor (C<sub>a</sub>)</th>
                <td>${r.tempFactor}</td></tr>
            <tr><th scope="row">Grouping Factor (C<sub>g</sub>)</th>
                <td>${r.groupFactor}</td></tr>
            <tr><th scope="row">Total Derating Factor</th>
                <td>${r.totalFactor}</td></tr>
            <tr><th scope="row">Derated Ampacity (I<sub>z</sub>′)</th>
                <td><strong>${esc(corrDisplay)}</strong></td></tr>
            <tr><th scope="row">Status</th>
                <td class="status-badge ${statusClass}">${esc(statusLabel)}</td></tr>
          </tbody>
        </table>
        <div class="result-recommendation">${esc(r.recommendation)}</div>
        <details class="method-note">
          <summary>How this was calculated</summary>
          <p>Per ${stdName}, the derated ampacity is:</p>
          <pre>I\u2082\u2032 = I\u2082 \u00D7 C\u2090 \u00D7 C\u1D4D
     = ${esc(baseDisplay)} \u00D7 ${r.tempFactor} \u00D7 ${r.groupFactor}
     = ${esc(corrDisplay)}</pre>
          <p>Where C\u2090 is the ambient temperature correction factor and
          C\u1D4D is the grouping (bunching) derating factor.</p>
          <p>The design current I\u1D47 = ${params.loadAmps.toFixed(1)} A must satisfy
          I\u1D47 \u2264 I\u2082\u2032.</p>
        </details>
      </div>
      ${skippedWarning}`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
