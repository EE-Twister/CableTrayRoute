import {
  calcCableFaultBracing,
  calcPeakFactor,
} from './analysis/cableFaultBracing.mjs';
import { getCables } from './dataStore.mjs';
import cableSizes from './data/cableSizes.json' assert { type: 'json' };

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // ── Element references ───────────────────────────────────────────────────
  const faultCurrentInput  = document.getElementById('faultCurrent');
  const xrRatioInput       = document.getElementById('xrRatio');
  const systemTypeSel      = document.getElementById('systemType');
  const arrangementSel     = document.getElementById('arrangement');
  const arrangementRow     = document.getElementById('arrangementRow');
  const spacingDirectRadio = document.getElementById('spacingDirect');
  const spacingFromODRadio = document.getElementById('spacingFromOD');
  const spacingDirectRow   = document.getElementById('spacingDirectRow');
  const spacingODRow       = document.getElementById('spacingODRow');
  const spacingInput       = document.getElementById('spacing');
  const cableODInput       = document.getElementById('cableOD');
  const derivedSpacingNote = document.getElementById('derivedSpacingNote');
  const cleatSpacingInput  = document.getElementById('cleatSpacing');
  const safetyFactorInput  = document.getElementById('safetyFactor');
  const cleatRatingInput   = document.getElementById('cleatRating');
  const singleModeRadio    = document.getElementById('modeSingle');
  const scheduleModeRadio  = document.getElementById('modeSchedule');
  const calcBtn            = document.getElementById('calcBtn');
  const loadScheduleBtn    = document.getElementById('loadScheduleBtn');
  const resultsDiv         = document.getElementById('results');
  const scheduleSection    = document.getElementById('scheduleSection');
  const scheduleResultsDiv = document.getElementById('scheduleResults');

  // Build a lookup map from cable size key → OD in mm (cableSizes OD is in inches)
  const odLookup = {};
  cableSizes.forEach(entry => {
    const key = `${entry.conductors}C-${entry.size}`;
    odLookup[key] = entry.OD * 25.4;  // convert inches → mm
  });

  // ── Arrangement row visibility ───────────────────────────────────────────
  function updateArrangementVisibility() {
    arrangementRow.hidden = systemTypeSel.value !== 'three-phase';
  }
  systemTypeSel.addEventListener('change', updateArrangementVisibility);
  updateArrangementVisibility();

  // ── Spacing mode toggle ──────────────────────────────────────────────────
  function updateSpacingMode() {
    const isOD = spacingFromODRadio.checked;
    spacingDirectRow.classList.toggle('hidden', isOD);
    spacingODRow.classList.toggle('hidden', !isOD);
    derivedSpacingNote.classList.toggle('hidden', !isOD);
    if (isOD) updateDerivedSpacing();
  }

  function updateDerivedSpacing() {
    const od = parseFloat(cableODInput.value);
    if (Number.isFinite(od) && od > 0) {
      derivedSpacingNote.textContent =
        `Derived centre-to-centre spacing: ${od.toFixed(1)} mm (touching cables, spacing = OD).`;
    } else {
      derivedSpacingNote.textContent = 'Enter a valid cable OD above.';
    }
  }

  spacingDirectRadio.addEventListener('change', updateSpacingMode);
  spacingFromODRadio.addEventListener('change', updateSpacingMode);
  cableODInput.addEventListener('input', updateDerivedSpacing);
  updateSpacingMode();

  // ── Live κ preview ───────────────────────────────────────────────────────
  function updateKappaPreview() {
    const xr = parseFloat(xrRatioInput.value);
    if (!Number.isFinite(xr) || xr < 0) return;
    let preview = document.getElementById('kappa-preview');
    if (!preview) {
      preview = document.createElement('p');
      preview.id = 'kappa-preview';
      preview.className = 'field-hint sdc-preview';
      xrRatioInput.closest('div').appendChild(preview);
    }
    const kappa = calcPeakFactor(xr);
    preview.textContent =
      `κ = ${kappa.toFixed(3)} — peak current = ${(kappa * Math.SQRT2).toFixed(3)} × I_sc`;
  }
  xrRatioInput.addEventListener('input', updateKappaPreview);
  updateKappaPreview();

  // ── Evaluation mode toggle ───────────────────────────────────────────────
  function updateMode() {
    const isSingle = singleModeRadio.checked;
    scheduleSection.hidden = isSingle;
    resultsDiv.innerHTML = '';
    scheduleResultsDiv.innerHTML = '';
  }
  singleModeRadio.addEventListener('change', updateMode);
  scheduleModeRadio.addEventListener('change', updateMode);
  updateMode();

  // ── Resolve spacing (mm) from current UI state ───────────────────────────
  function resolveSpacingMm() {
    if (spacingFromODRadio.checked) {
      return parseFloat(cableODInput.value);
    }
    return parseFloat(spacingInput.value);
  }

  // ── Single-cable calculation ─────────────────────────────────────────────
  calcBtn.addEventListener('click', () => {
    const iSc        = parseFloat(faultCurrentInput.value);
    const xr         = parseFloat(xrRatioInput.value);
    const sysType    = systemTypeSel.value;
    const arrg       = arrangementSel.value;
    const spacing    = resolveSpacingMm();
    const cleatSpan  = parseFloat(cleatSpacingInput.value);
    const sf         = parseFloat(safetyFactorInput.value);
    const knownRating = parseFloat(cleatRatingInput.value);

    if (!Number.isFinite(iSc) || iSc <= 0) {
      showAlertModal('Enter a positive fault current (kA).');
      return;
    }
    if (!Number.isFinite(xr) || xr < 0) {
      showAlertModal('Enter a non-negative X/R ratio.');
      return;
    }
    if (!Number.isFinite(spacing) || spacing <= 0) {
      showAlertModal('Enter a positive cable spacing (mm).');
      return;
    }
    if (!Number.isFinite(cleatSpan) || cleatSpan <= 0) {
      showAlertModal('Enter a positive cleat spacing (mm).');
      return;
    }
    if (!Number.isFinite(sf) || sf < 1) {
      showAlertModal('Safety factor must be ≥ 1.');
      return;
    }

    let result;
    try {
      result = calcCableFaultBracing({
        faultCurrent_kA: iSc,
        xrRatio:         xr,
        systemType:      sysType,
        arrangement:     arrg,
        spacing_mm:      spacing,
        cleatSpacing_mm: cleatSpan,
        safetyFactor:    sf,
      });
    } catch (err) {
      showAlertModal(`Calculation error: ${err.message}`);
      return;
    }

    const userRating = Number.isFinite(knownRating) && knownRating > 0
      ? knownRating : null;

    renderSingleResult(result, {
      iSc, xr, sysType, arrg, spacing, cleatSpan, sf, userRating,
    });
  });

  function renderSingleResult(r, params) {
    const adequate = params.userRating !== null
      ? params.userRating >= r.requiredStrength_kN
      : null;

    const passFail = adequate === null
      ? ''
      : adequate
        ? `<tr><th scope="row">Cleat adequacy check</th>
               <td class="status-badge result-ok">
                 PASS — ${params.userRating.toFixed(2)} kN rated ≥
                 ${r.requiredStrength_kN.toFixed(2)} kN required
               </td></tr>`
        : `<tr><th scope="row">Cleat adequacy check</th>
               <td class="status-badge result-fail">
                 FAIL — ${params.userRating.toFixed(2)} kN rated &lt;
                 ${r.requiredStrength_kN.toFixed(2)} kN required
               </td></tr>`;

    const cardClass = adequate === false ? 'result-fail' : 'result-ok';

    resultsDiv.innerHTML = `
      <div class="result-card ${cardClass}" role="status" aria-live="polite">
        <h2>Result</h2>
        <table class="result-table" aria-label="Fault bracing results">
          <tbody>
            <tr><th scope="row">Peak factor κ</th>
                <td>${r.peakFactor.toFixed(4)}</td></tr>
            <tr><th scope="row">Peak fault current i<sub>peak</sub></th>
                <td><strong>${r.iPeak_kA.toFixed(3)} kA</strong></td></tr>
            <tr><th scope="row">Electromagnetic force</th>
                <td>${r.forcePerMeter_Nm.toFixed(1)} N/m
                    &nbsp;<span class="unit-note">(${r.forcePerMeter_lbfFt.toFixed(1)} lbf/ft)</span></td></tr>
            <tr><th scope="row">Cleat tensile load (T = F × L)</th>
                <td>${r.cleatLoad_kN.toFixed(3)} kN
                    &nbsp;<span class="unit-note">(${(r.cleatLoad_N).toFixed(0)} N)</span></td></tr>
            <tr><th scope="row">Required rated cleat strength (T × SF)</th>
                <td class="status-badge result-ok">
                  <strong>≥ ${r.requiredStrength_kN.toFixed(2)} kN</strong>
                  &nbsp;(SF = ${r.safetyFactor})
                </td></tr>
            ${passFail}
          </tbody>
        </table>
        <div class="result-recommendation">${esc(r.recommendation)}</div>
        <details class="method-note">
          <summary>How this was calculated</summary>
          <p>IEC 60909-0 §4.3.1.1 peak factor:</p>
          <pre>κ = 1.02 + 0.98 × e^(−3/${params.xr.toFixed(1)}) = ${r.peakFactor.toFixed(4)}</pre>
          <p>Peak fault current:</p>
          <pre>i_peak = κ × √2 × ${params.iSc.toFixed(1)} kA = ${r.iPeak_kA.toFixed(3)} kA</pre>
          <p>Electromagnetic force per unit length (${params.sysType === 'three-phase' ? '√3' : '2'}×10⁻⁷ coefficient):</p>
          <pre>F = ${params.sysType === 'three-phase' ? '√3' : '2'}×10⁻⁷ × (${(r.iPeak_kA * 1000).toFixed(0)} A)² / ${params.spacing.toFixed(0)} mm
  = ${r.forcePerMeter_Nm.toFixed(1)} N/m</pre>
          <p>Cleat tensile load over ${params.cleatSpan.toFixed(0)} mm span:</p>
          <pre>T = ${r.forcePerMeter_Nm.toFixed(1)} N/m × ${(params.cleatSpan / 1000).toFixed(3)} m
  = ${r.cleatLoad_N.toFixed(0)} N  (${r.cleatLoad_kN.toFixed(3)} kN)</pre>
          <p>Required rated cleat strength (IEC 61914 SF = ${r.safetyFactor}):</p>
          <pre>T_req = ${r.cleatLoad_kN.toFixed(3)} kN × ${r.safetyFactor}
       = ${r.requiredStrength_kN.toFixed(2)} kN</pre>
        </details>
      </div>`;
  }

  // ── Schedule mode ────────────────────────────────────────────────────────
  loadScheduleBtn.addEventListener('click', () => {
    const cables = getCables();
    if (!cables.length) {
      showAlertModal('No cables found in the Cable Schedule.  Please add cables first.');
      return;
    }

    const iSc       = parseFloat(faultCurrentInput.value);
    const xr        = parseFloat(xrRatioInput.value);
    const cleatSpan = parseFloat(cleatSpacingInput.value);
    const sf        = parseFloat(safetyFactorInput.value);

    if (!Number.isFinite(iSc) || iSc <= 0) {
      showAlertModal('Enter a positive fault current (kA).');
      return;
    }
    if (!Number.isFinite(xr) || xr < 0) {
      showAlertModal('Enter a non-negative X/R ratio.');
      return;
    }
    if (!Number.isFinite(cleatSpan) || cleatSpan <= 0) {
      showAlertModal('Enter a positive cleat spacing (mm).');
      return;
    }
    if (!Number.isFinite(sf) || sf < 1) {
      showAlertModal('Safety factor must be ≥ 1.');
      return;
    }

    const rows = cables.map(cable => {
      // Resolve OD → spacing
      const conductors = cable.conductors != null ? String(cable.conductors) : '3';
      const size       = cable.conductor_size || cable.size || '';
      const key        = `${conductors}C-${size}`;
      let spacing_mm   = 0;

      if (cable.cable_od != null && parseFloat(cable.cable_od) > 0) {
        // Explicit OD on cable record (stored in inches in the schedule)
        spacing_mm = parseFloat(cable.cable_od) * 25.4;
      } else if (odLookup[key]) {
        spacing_mm = odLookup[key];
      } else {
        spacing_mm = 50;  // fallback 50 mm when OD unknown
      }

      const sysType = (parseInt(conductors, 10) === 2) ? 'single-phase' : 'three-phase';

      let result = null;
      let err    = null;
      try {
        result = calcCableFaultBracing({
          faultCurrent_kA: iSc,
          xrRatio:         xr,
          systemType:      sysType,
          arrangement:     'trefoil',
          spacing_mm,
          cleatSpacing_mm: cleatSpan,
          safetyFactor:    sf,
        });
      } catch (e) {
        err = e.message;
      }

      return { cable, spacing_mm, sysType, result, err };
    });

    renderScheduleResults(rows, { iSc, xr, cleatSpan, sf });
  });

  function renderScheduleResults(rows, params) {
    if (!rows.length) {
      scheduleResultsDiv.innerHTML = '<p>No cables to display.</p>';
      return;
    }

    const tableRows = rows.map(({ cable, spacing_mm, result, err }) => {
      const tag  = esc(cable.tag || cable.cable_tag || '—');
      const size = esc(cable.conductor_size || cable.size || '—');
      if (err || !result) {
        return `<tr>
          <td>${tag}</td><td>${size}</td>
          <td>${spacing_mm > 0 ? spacing_mm.toFixed(1) : '—'}</td>
          <td>—</td><td>—</td>
          <td class="status-badge result-fail">Error${err ? ': ' + esc(err) : ''}</td>
        </tr>`;
      }
      return `<tr>
        <td>${tag}</td>
        <td>${size}</td>
        <td>${spacing_mm.toFixed(1)}</td>
        <td>${result.forcePerMeter_Nm.toFixed(1)}</td>
        <td>${result.cleatLoad_kN.toFixed(3)}</td>
        <td class="status-badge result-ok">≥ ${result.requiredStrength_kN.toFixed(2)} kN</td>
      </tr>`;
    }).join('');

    scheduleResultsDiv.innerHTML = `
      <h2>Cable Schedule Results</h2>
      <p class="field-hint">
        I<sub>sc</sub> = ${params.iSc.toFixed(1)} kA, X/R = ${params.xr.toFixed(1)},
        cleat spacing = ${params.cleatSpan.toFixed(0)} mm, SF = ${params.sf}.
        Cable OD derived from conductor size where available; 50 mm assumed otherwise.
      </p>
      <table class="result-table schedule-result-table"
             aria-label="Cable fault bracing results">
        <thead>
          <tr>
            <th scope="col">Cable Tag</th>
            <th scope="col">Size</th>
            <th scope="col">Spacing (mm)</th>
            <th scope="col">Force (N/m)</th>
            <th scope="col">Cleat Load (kN)</th>
            <th scope="col">Required Strength</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="method-note">
        Forces per IEC 60909-0:2016 and Ampère's force law.
        Required strength includes IEC 61914 safety factor of ${params.sf}.
      </p>`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
