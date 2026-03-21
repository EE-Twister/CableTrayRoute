import {
  configure,
  NEMA_LOAD_CLASSES,
  MATERIALS,
  TRAY_TYPES,
  STANDARD_WIDTHS_IN,
  STANDARD_DEPTHS_IN,
  selectMinWidth,
  requiredRatedLoad,
} from './analysis/productConfig.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // Populate depth select based on tray type selection
  const trayTypeSelect = document.getElementById('tray-type');
  const depthSelect    = document.getElementById('depth');

  function updateDepthOptions() {
    const type = trayTypeSelect.value || 'ladder';
    const depths = STANDARD_DEPTHS_IN[type] || [3, 4, 6];
    const prev = depthSelect.value;
    depthSelect.innerHTML = depths.map(d =>
      `<option value="${d}"${String(d) === prev ? ' selected' : ''}>${d} in</option>`
    ).join('');
    if (!depths.includes(Number(prev))) depthSelect.value = depths[1] || depths[0];
  }

  trayTypeSelect.addEventListener('change', updateDepthOptions);
  updateDepthOptions();

  document.getElementById('configure-btn').addEventListener('click', runConfigure);
  document.getElementById('copy-spec-btn').addEventListener('click', copySpec);
  document.getElementById('print-btn').addEventListener('click', () => window.print());

  function getInputs() {
    return {
      cableWeightLbFt:  parseFloat(document.getElementById('cable-weight').value)  || 0,
      spanFt:           parseFloat(document.getElementById('span').value)           || 10,
      totalCableCsaIn2: parseFloat(document.getElementById('cable-csa').value)      || 0,
      environment:      document.getElementById('environment').value,
      application:      document.getElementById('application').value,
      depthIn:          parseFloat(document.getElementById('depth').value)           || 4,
      fillFraction:     (parseFloat(document.getElementById('fill-pct').value) || 50) / 100,
      trayTypeHint:     trayTypeSelect.value || '',
    };
  }

  function runConfigure() {
    const inp = getInputs();

    if (inp.cableWeightLbFt <= 0) {
      showAlertModal('Input Error', 'Cable weight per linear foot must be greater than zero.');
      return;
    }
    if (inp.spanFt <= 0) {
      showAlertModal('Input Error', 'Support span must be greater than zero.');
      return;
    }
    if (inp.totalCableCsaIn2 <= 0) {
      showAlertModal('Input Error', 'Total cable cross-sectional area must be greater than zero.');
      return;
    }

    let result;
    try {
      // If user selected a specific tray type, honour it; otherwise let the engine pick.
      const configInputs = {
        cableWeightLbFt:  inp.cableWeightLbFt,
        spanFt:           inp.spanFt,
        totalCableCsaIn2: inp.totalCableCsaIn2,
        environment:      inp.environment,
        application:      inp.application,
        depthIn:          inp.depthIn,
        fillFraction:     inp.fillFraction,
      };
      result = configure(configInputs);
    } catch (err) {
      showAlertModal('Calculation Error', esc(err.message));
      return;
    }

    renderResults(result);
    document.getElementById('results-section').hidden = false;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function renderResults(r) {
    const lc = r.loadClass;
    const geo = r.geometry;
    const tray = r.trayType.primary;
    const mat = r.material.primary;

    const loadStatus = lc.exceeded
      ? `<span class="result-fail">EXCEEDS all standard NEMA classes — custom fabrication required</span>`
      : `<span class="result-ok">${esc(lc.id)} — ${esc(lc.def.label)}</span>`;

    const widthStatus = geo.widthInsufficient
      ? `<span class="result-fail">No standard width sufficient — consider splitting into multiple trays</span>`
      : `<span class="result-ok">${geo.widthIn} in</span>`;

    document.getElementById('results').innerHTML = `
      <div class="result-card" role="status">
        <h2>Tray Configuration Recommendation</h2>

        <h3>Structural / Load Class</h3>
        <table class="result-table" aria-label="Load class results">
          <tbody>
            <tr>
              <th scope="row">Required Effective Load</th>
              <td>${lc.requiredRatedLoad.toFixed(2)} lbs/ft (at ${r.inputs.spanFt} ft span)</td>
            </tr>
            <tr>
              <th scope="row">Minimum NEMA Load Class</th>
              <td>${loadStatus}</td>
            </tr>
          </tbody>
        </table>

        <h3>Geometry</h3>
        <table class="result-table" aria-label="Geometry results">
          <tbody>
            <tr>
              <th scope="row">Minimum Inside Width</th>
              <td>${widthStatus}</td>
            </tr>
            <tr>
              <th scope="row">Tray Depth</th>
              <td>${geo.depthIn} in</td>
            </tr>
            <tr>
              <th scope="row">Allowed Cable Fill Area</th>
              <td>${geo.allowedFillIn2} in² (${(geo.fillFraction * 100).toFixed(0)}% of ${geo.widthIn > 0 ? geo.widthIn : '–'} × ${geo.depthIn} in)</td>
            </tr>
            <tr>
              <th scope="row">Total Cable CSA</th>
              <td>${r.inputs.totalCableCsaIn2.toFixed(2)} in²</td>
            </tr>
          </tbody>
        </table>

        <h3>Tray Type</h3>
        <table class="result-table" aria-label="Tray type">
          <tbody>
            <tr>
              <th scope="row">Recommended</th>
              <td><strong>${esc(tray.label)}</strong></td>
            </tr>
            <tr>
              <th scope="row">Description</th>
              <td>${esc(tray.description)}</td>
            </tr>
            <tr>
              <th scope="row">NEC Reference</th>
              <td>${esc(tray.necArticle)}</td>
            </tr>
            <tr>
              <th scope="row">Advantages</th>
              <td><ul>${tray.advantages.map(a => `<li>${esc(a)}</li>`).join('')}</ul></td>
            </tr>
          </tbody>
        </table>
        ${r.trayType.alternates.length ? `<p class="field-hint">Alternates: ${r.trayType.alternates.map(t => esc(t.label)).join(', ')}</p>` : ''}

        <h3>Material</h3>
        <table class="result-table" aria-label="Material">
          <tbody>
            <tr>
              <th scope="row">Recommended</th>
              <td><strong>${esc(mat.label)}</strong></td>
            </tr>
            <tr>
              <th scope="row">Notes</th>
              <td>${esc(mat.notes)}</td>
            </tr>
            <tr>
              <th scope="row">Available Finishes</th>
              <td>${mat.finishes.map(f => esc(f)).join(', ')}</td>
            </tr>
          </tbody>
        </table>
        ${r.material.alternates.length ? `<p class="field-hint">Alternates: ${r.material.alternates.map(m => esc(m.label)).join(', ')}</p>` : ''}

        <h3>Specification Text</h3>
        <div class="spec-box" id="spec-text" aria-label="Generated specification text">${esc(r.specificationText)}</div>
      </div>`;
  }

  function copySpec() {
    const el = document.getElementById('spec-text');
    if (!el) return;
    const text = el.textContent || '';
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showAlertModal('Copied', 'Specification text copied to clipboard.');
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
