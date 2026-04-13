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
  const arrangementGallery = document.getElementById('arrangementGallery');
  const arrangementCards   = Array.from(document.querySelectorAll('.arrangement-card'));
  const arrangementRow     = document.getElementById('arrangementRow');
  const unitsImperialBtn   = document.getElementById('unitsImperial');
  const unitsMetricBtn     = document.getElementById('unitsMetric');
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
  const forceVectorsPanel  = document.getElementById('forceVectorsPanel');
  const forceVectorSvg     = document.getElementById('forceVectorSvg');
  const vectorLegend       = document.getElementById('vectorLegend');

  // Build a lookup map from cable size key → OD in mm (cableSizes OD is in inches)
  const odLookup = {};
  cableSizes.forEach(entry => {
    const key = `${entry.conductors}C-${entry.size}`;
    odLookup[key] = entry.OD * 25.4;  // convert inches → mm
  });

  let unitSystem = 'metric';

  function mmToIn(mm) {
    return mm / 25.4;
  }

  function inToMm(inches) {
    return inches * 25.4;
  }

  function setLengthLabels() {
    document.getElementById('spacingUnitLabel').textContent = unitSystem === 'metric' ? 'mm' : 'in';
    document.getElementById('odUnitLabel').textContent = unitSystem === 'metric' ? 'mm' : 'in';
    document.getElementById('cleatUnitLabel').textContent = unitSystem === 'metric' ? 'mm' : 'in';
  }

  function toggleUnits(next) {
    if (next === unitSystem) return;
    if (next === 'metric' && unitSystem === 'imperial') {
      spacingInput.value = inToMm(parseFloat(spacingInput.value || '0')).toFixed(1);
      cableODInput.value = inToMm(parseFloat(cableODInput.value || '0')).toFixed(1);
      cleatSpacingInput.value = inToMm(parseFloat(cleatSpacingInput.value || '0')).toFixed(1);
    } else if (next === 'imperial' && unitSystem === 'metric') {
      spacingInput.value = mmToIn(parseFloat(spacingInput.value || '0')).toFixed(2);
      cableODInput.value = mmToIn(parseFloat(cableODInput.value || '0')).toFixed(2);
      cleatSpacingInput.value = mmToIn(parseFloat(cleatSpacingInput.value || '0')).toFixed(2);
    }
    unitSystem = next;
    unitsImperialBtn.setAttribute('aria-pressed', String(unitSystem === 'imperial'));
    unitsMetricBtn.setAttribute('aria-pressed', String(unitSystem === 'metric'));
    setLengthLabels();
    updateDerivedSpacing();
  }

  unitsImperialBtn.addEventListener('click', () => toggleUnits('imperial'));
  unitsMetricBtn.addEventListener('click', () => toggleUnits('metric'));
  unitsImperialBtn.setAttribute('aria-pressed', 'false');
  unitsMetricBtn.setAttribute('aria-pressed', 'true');
  setLengthLabels();

  // ── Arrangement row visibility ───────────────────────────────────────────
  function updateArrangementVisibility() {
    const isThreePhase = systemTypeSel.value === 'three-phase';
    arrangementRow.hidden = !isThreePhase;
    forceVectorsPanel.classList.toggle('hidden', !isThreePhase || !resultsDiv.innerHTML);
  }
  function setArrangement(arrangement) {
    arrangementSel.value = arrangement;
    arrangementCards.forEach(card => {
      const active = card.dataset.arrangement === arrangement;
      card.classList.toggle('active', active);
      card.setAttribute('aria-checked', String(active));
    });
  }
  arrangementGallery.addEventListener('click', event => {
    const card = event.target.closest('.arrangement-card');
    if (!card) return;
    setArrangement(card.dataset.arrangement);
  });
  systemTypeSel.addEventListener('change', updateArrangementVisibility);
  setArrangement('trefoil');
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
      const odMm = unitSystem === 'metric' ? od : inToMm(od);
      derivedSpacingNote.textContent =
        `Derived centre-to-centre spacing: ${unitSystem === 'metric' ? `${odMm.toFixed(1)} mm` : `${mmToIn(odMm).toFixed(2)} in`} (${odMm.toFixed(1)} mm physical).`;
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
    forceVectorsPanel.classList.add('hidden');
  }
  singleModeRadio.addEventListener('change', updateMode);
  scheduleModeRadio.addEventListener('change', updateMode);
  updateMode();

  // ── Resolve spacing (mm) from current UI state ───────────────────────────
  function resolveSpacingMm() {
    const factor = unitSystem === 'metric' ? 1 : 25.4;
    if (spacingFromODRadio.checked) {
      return parseFloat(cableODInput.value) * factor;
    }
    return parseFloat(spacingInput.value) * factor;
  }

  // ── Single-cable calculation ─────────────────────────────────────────────
  calcBtn.addEventListener('click', () => {
    const iSc        = parseFloat(faultCurrentInput.value);
    const xr         = parseFloat(xrRatioInput.value);
    const sysType    = systemTypeSel.value;
    const arrg       = arrangementSel.value;
    const spacing    = resolveSpacingMm();
    const cleatSpan  = parseFloat(cleatSpacingInput.value) * (unitSystem === 'metric' ? 1 : 25.4);
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
    renderForceVectors(result, { sysType, arrg });
  });

  function renderForceVectors(result, params) {
    if (params.sysType !== 'three-phase') {
      forceVectorsPanel.classList.add('hidden');
      return;
    }
    const f = result.forcePerMeter_Nm;
    const toLbfFt = f * 0.0685218;
    vectorLegend.textContent = `Vector magnitude reference: ${f.toFixed(1)} N/m (${toLbfFt.toFixed(2)} lbf/ft).`;
    if (params.arrg === 'trefoil') {
      forceVectorSvg.innerHTML = `
      <defs><marker id="vArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#2563eb"></path></marker></defs>
      <circle cx="210" cy="60" r="24" fill="#dbeafe" stroke="#1d4ed8"></circle><circle cx="155" cy="154" r="24" fill="#dcfce7" stroke="#15803d"></circle><circle cx="265" cy="154" r="24" fill="#fee2e2" stroke="#dc2626"></circle>
      <text x="210" y="66" text-anchor="middle" class="phase-label">A</text><text x="155" y="160" text-anchor="middle" class="phase-label">B</text><text x="265" y="160" text-anchor="middle" class="phase-label">C</text>
      <line x1="210" y1="60" x2="210" y2="20" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow)"></line>
      <line x1="155" y1="154" x2="118" y2="181" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow)"></line>
      <line x1="265" y1="154" x2="302" y2="181" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow)"></line>
      <text x="222" y="18">${f.toFixed(1)} N/m</text><text x="74" y="186">${f.toFixed(1)} N/m</text><text x="304" y="186">${f.toFixed(1)} N/m</text>`;
    } else {
      forceVectorSvg.innerHTML = `
      <defs><marker id="vArrow2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#2563eb"></path></marker></defs>
      <circle cx="100" cy="120" r="24" fill="#dbeafe" stroke="#1d4ed8"></circle><circle cx="210" cy="120" r="24" fill="#dcfce7" stroke="#15803d"></circle><circle cx="320" cy="120" r="24" fill="#fee2e2" stroke="#dc2626"></circle>
      <text x="100" y="126" text-anchor="middle" class="phase-label">A</text><text x="210" y="126" text-anchor="middle" class="phase-label">B</text><text x="320" y="126" text-anchor="middle" class="phase-label">C</text>
      <line x1="100" y1="120" x2="58" y2="120" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow2)"></line>
      <line x1="210" y1="120" x2="210" y2="80" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow2)"></line>
      <line x1="320" y1="120" x2="362" y2="120" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow2)"></line>
      <text x="14" y="115">${f.toFixed(1)} N/m</text><text x="184" y="72">${(f * 0.25).toFixed(1)} N/m</text><text x="366" y="115">${f.toFixed(1)} N/m</text>`;
    }
    forceVectorsPanel.classList.remove('hidden');
  }

  function renderSingleResult(r, params) {
    const spacingDisplay = unitSystem === 'metric'
      ? `${params.spacing.toFixed(1)} mm`
      : `${mmToIn(params.spacing).toFixed(2)} in`;
    const cleatSpanDisplay = unitSystem === 'metric'
      ? `${params.cleatSpan.toFixed(0)} mm`
      : `${mmToIn(params.cleatSpan).toFixed(2)} in`;
    const forceDisplay = unitSystem === 'metric'
      ? `${r.forcePerMeter_Nm.toFixed(1)} N/m (${r.forcePerMeter_lbfFt.toFixed(1)} lbf/ft)`
      : `${r.forcePerMeter_lbfFt.toFixed(1)} lbf/ft (${r.forcePerMeter_Nm.toFixed(1)} N/m)`;
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
            <tr><th scope="row">Cable spacing (d)</th>
                <td>${spacingDisplay}</td></tr>
            <tr><th scope="row">Electromagnetic force</th>
                <td>${forceDisplay}</td></tr>
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
          <p>Electromagnetic force per unit length (${params.sysType === 'three-phase' ? '√3' : '2'}×10⁻⁷ coefficient, d = ${spacingDisplay}):</p>
          <pre>F = ${params.sysType === 'three-phase' ? '√3' : '2'}×10⁻⁷ × (${(r.iPeak_kA * 1000).toFixed(0)} A)² / ${params.spacing.toFixed(0)} mm
  = ${r.forcePerMeter_Nm.toFixed(1)} N/m</pre>
          <p>Cleat tensile load over ${cleatSpanDisplay} span:</p>
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
    const cleatSpan = parseFloat(cleatSpacingInput.value) * (unitSystem === 'metric' ? 1 : 25.4);
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
      const spacingDisplay = unitSystem === 'metric' ? spacing_mm.toFixed(1) : mmToIn(spacing_mm).toFixed(2);
      const forceDisplay = result
        ? (unitSystem === 'metric' ? result.forcePerMeter_Nm.toFixed(1) : result.forcePerMeter_lbfFt.toFixed(1))
        : '—';
      if (err || !result) {
        return `<tr>
          <td>${tag}</td><td>${size}</td>
          <td>${spacing_mm > 0 ? spacingDisplay : '—'}</td>
          <td>—</td><td>—</td>
          <td class="status-badge result-fail">Error${err ? ': ' + esc(err) : ''}</td>
        </tr>`;
      }
      return `<tr>
        <td>${tag}</td>
        <td>${size}</td>
        <td>${spacingDisplay}</td>
        <td>${forceDisplay}</td>
        <td>${result.cleatLoad_kN.toFixed(3)}</td>
        <td class="status-badge result-ok">≥ ${result.requiredStrength_kN.toFixed(2)} kN</td>
      </tr>`;
    }).join('');

    scheduleResultsDiv.innerHTML = `
      <h2>Cable Schedule Results</h2>
      <p class="field-hint">
        I<sub>sc</sub> = ${params.iSc.toFixed(1)} kA, X/R = ${params.xr.toFixed(1)},
        cleat spacing = ${unitSystem === 'metric' ? `${params.cleatSpan.toFixed(0)} mm` : `${mmToIn(params.cleatSpan).toFixed(2)} in`}, SF = ${params.sf}.
        Cable OD derived from conductor size where available; 50 mm assumed otherwise.
      </p>
      <table class="result-table schedule-result-table"
             aria-label="Cable fault bracing results">
        <thead>
          <tr>
            <th scope="col">Cable Tag</th>
            <th scope="col">Size</th>
            <th scope="col">Spacing (${unitSystem === 'metric' ? 'mm' : 'in'})</th>
            <th scope="col">Force (${unitSystem === 'metric' ? 'N/m' : 'lbf/ft'})</th>
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
