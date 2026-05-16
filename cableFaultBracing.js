import {
  calcCableFaultBracing,
  calcPeakFactor,
} from './analysis/cableFaultBracing.mjs';
import { getCables } from './dataStore.mjs';
import { showAlertModal } from './src/components/modal.js';
import cableSizes from './data/cableSizes.json' assert { type: 'json' };

document.addEventListener('DOMContentLoaded', () => {
  if (typeof initSettings === 'function' && !document.getElementById('project-name-input')) {
    initSettings();
  }
  if (typeof initDarkMode === 'function' && !document.body.dataset.themeBound) {
    initDarkMode();
    document.body.dataset.themeBound = 'true';
  }
  if (typeof initCompactMode === 'function' && !document.body.dataset.compactBound) {
    initCompactMode();
    document.body.dataset.compactBound = 'true';
  }
  if (typeof initHelpModal === 'function') {
    initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  }
  if (typeof initNavToggle === 'function') {
    initNavToggle();
  }

  // ── Element references ───────────────────────────────────────────────────
  const faultCurrentInput  = document.getElementById('faultCurrent');
  const xrRatioInput       = document.getElementById('xrRatio');
  const systemTypeSel      = document.getElementById('systemType');
  const arrangementSel     = document.getElementById('arrangement');
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
  const reviewModeBadge    = document.getElementById('reviewModeBadge');
  const reviewPeakMultiplier = document.getElementById('reviewPeakMultiplier');
  const reviewSpacingSource  = document.getElementById('reviewSpacingSource');
  const reviewCleatInterval  = document.getElementById('reviewCleatInterval');
  const reviewSafetyFactor   = document.getElementById('reviewSafetyFactor');
  const reviewGuidance       = document.getElementById('reviewGuidance');
  const actionStatus         = document.getElementById('faultBracingActionStatus');
  const faultPresetButtons   = Array.from(document.querySelectorAll('[data-fault-preset]'));

  // Build a lookup map from cable size key → OD in mm (cableSizes OD is in inches)
  const odLookup = {};
  cableSizes.forEach(entry => {
    const key = `${entry.conductors}C-${entry.size}`;
    odLookup[key] = entry.OD * 25.4;  // convert inches → mm
  });

  let unitSystem = 'metric';
  let latestSingleResult = null;
  let latestSingleParams = null;
  let latestScheduleRows = [];
  let latestScheduleParams = null;

  function mmToIn(mm) {
    return mm / 25.4;
  }

  function inToMm(inches) {
    return inches * 25.4;
  }

  function formatLength(mm, metricDigits = 1, imperialDigits = 2) {
    return unitSystem === 'metric'
      ? `${mm.toFixed(metricDigits)} mm`
      : `${mmToIn(mm).toFixed(imperialDigits)} in`;
  }

  function showInputAlert(message) {
    showAlertModal('Check Inputs', message);
  }

  function showCalculationError(message) {
    showAlertModal('Calculation Error', message);
  }

  function setActionStatus(message) {
    if (!actionStatus) return;
    actionStatus.textContent = message;
  }

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const copyArea = document.createElement('textarea');
        copyArea.value = text;
        copyArea.setAttribute('readonly', '');
        copyArea.style.position = 'fixed';
        copyArea.style.opacity = '0';
        document.body.appendChild(copyArea);
        copyArea.select();
        document.execCommand('copy');
        copyArea.remove();
      }
      setActionStatus(successMessage);
    } catch (err) {
      console.error('Copy failed', err);
      showAlertModal('Copy Failed', 'The result summary could not be copied. Select and copy the result text manually.');
    }
  }

  function downloadText(filename, text, mimeType = 'text/plain') {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
    updateInputReview();
  }

  unitsImperialBtn.addEventListener('click', () => toggleUnits('imperial'));
  unitsMetricBtn.addEventListener('click', () => toggleUnits('metric'));
  unitsImperialBtn.setAttribute('aria-pressed', 'false');
  unitsMetricBtn.setAttribute('aria-pressed', 'true');
  setLengthLabels();

  faultPresetButtons.forEach(button => {
    button.addEventListener('click', () => {
      faultCurrentInput.value = button.dataset.faultCurrent || faultCurrentInput.value;
      xrRatioInput.value = button.dataset.xrRatio || xrRatioInput.value;
      resultsDiv.innerHTML = '';
      scheduleResultsDiv.innerHTML = '';
      forceVectorsPanel.classList.add('hidden');
      latestSingleResult = null;
      latestSingleParams = null;
      latestScheduleRows = [];
      latestScheduleParams = null;
      updateKappaPreview();
      updateInputReview();
      setActionStatus(`${button.textContent.trim()} preset applied.`);
      calcBtn.focus();
    });
  });

  // ── Arrangement row visibility ───────────────────────────────────────────
  function updateArrangementVisibility() {
    const isThreePhase = systemTypeSel.value === 'three-phase';
    arrangementRow.hidden = !isThreePhase;
    forceVectorsPanel.classList.toggle('hidden', !isThreePhase || !resultsDiv.innerHTML);
    updateInputReview();
  }
  function setArrangement(arrangement) {
    arrangementSel.value = arrangement;
    arrangementCards.forEach(card => {
      const active = card.dataset.arrangement === arrangement;
      card.classList.toggle('active', active);
      card.setAttribute('aria-checked', String(active));
      card.setAttribute('aria-pressed', String(active));
      card.tabIndex = active ? 0 : -1;
    });
    updateInputReview();
  }
  arrangementCards.forEach((card, index) => {
    card.addEventListener('click', () => {
      setArrangement(card.dataset.arrangement);
    });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setArrangement(card.dataset.arrangement);
        return;
      }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const lastIndex = arrangementCards.length - 1;
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? lastIndex
            : ['ArrowRight', 'ArrowDown'].includes(event.key)
              ? (index + 1) % arrangementCards.length
              : (index - 1 + arrangementCards.length) % arrangementCards.length;
        const nextCard = arrangementCards[nextIndex];
        setArrangement(nextCard.dataset.arrangement);
        nextCard.focus();
      }
    });
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
    updateInputReview();
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
    updateInputReview();
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

  [faultCurrentInput, xrRatioInput, spacingInput, cleatSpacingInput, safetyFactorInput, cleatRatingInput].forEach(input => {
    input.addEventListener('input', updateInputReview);
  });

  function updateInputReview() {
    const iSc = parseFloat(faultCurrentInput.value);
    const xr = parseFloat(xrRatioInput.value);
    const cleatSpan = parseFloat(cleatSpacingInput.value) * (unitSystem === 'metric' ? 1 : 25.4);
    const sf = parseFloat(safetyFactorInput.value);
    const issues = [];
    const isSchedule = scheduleModeRadio.checked;

    reviewModeBadge.textContent = isSchedule ? 'Cable Schedule' : 'Single Cable';

    if (Number.isFinite(iSc) && iSc > 0 && Number.isFinite(xr) && xr >= 0) {
      const kappa = calcPeakFactor(xr);
      const peakMultiplier = kappa * Math.SQRT2;
      reviewPeakMultiplier.textContent = `${peakMultiplier.toFixed(2)}x RMS (${(iSc * peakMultiplier).toFixed(2)} kA peak)`;
    } else {
      reviewPeakMultiplier.textContent = '-';
      issues.push('fault current and X/R');
    }

    if (isSchedule) {
      reviewSpacingSource.textContent = 'Cable Schedule OD or size lookup';
    } else if (spacingFromODRadio.checked) {
      const od = parseFloat(cableODInput.value);
      if (Number.isFinite(od) && od > 0) {
        const spacingMm = unitSystem === 'metric' ? od : inToMm(od);
        reviewSpacingSource.textContent = `Cable OD (${formatLength(spacingMm)})`;
      } else {
        reviewSpacingSource.textContent = '-';
        issues.push('cable OD');
      }
    } else {
      const spacing = parseFloat(spacingInput.value);
      if (Number.isFinite(spacing) && spacing > 0) {
        const spacingMm = unitSystem === 'metric' ? spacing : inToMm(spacing);
        reviewSpacingSource.textContent = `Direct entry (${formatLength(spacingMm)})`;
      } else {
        reviewSpacingSource.textContent = '-';
        issues.push('cable spacing');
      }
    }

    if (Number.isFinite(cleatSpan) && cleatSpan > 0) {
      reviewCleatInterval.textContent = formatLength(cleatSpan, 0, 2);
    } else {
      reviewCleatInterval.textContent = '-';
      issues.push('cleat interval');
    }

    if (Number.isFinite(sf) && sf >= 1) {
      reviewSafetyFactor.textContent = `${sf.toFixed(1)}x`;
    } else {
      reviewSafetyFactor.textContent = '-';
      issues.push('safety factor');
    }

    if (issues.length) {
      reviewGuidance.textContent = `Resolve ${issues.join(', ')} before calculating.`;
    } else if (isSchedule) {
      reviewGuidance.textContent = 'Ready to evaluate the Cable Schedule. Rows without cable OD will use the size lookup first, then a flagged 50 mm assumption.';
    } else if (cleatRatingInput.value && Number.isFinite(parseFloat(cleatRatingInput.value))) {
      reviewGuidance.textContent = 'Ready to calculate and compare the selected cleat rating against the required IEC 61914 strength.';
    } else {
      reviewGuidance.textContent = 'Ready to calculate the required IEC 61914 rated cleat strength. Enter a known cleat rating if you want a pass/fail check.';
    }
  }

  // ── Evaluation mode toggle ───────────────────────────────────────────────
  function updateMode() {
    const isSingle = singleModeRadio.checked;
    scheduleSection.hidden = isSingle;
    calcBtn.textContent = isSingle
      ? 'Calculate Required Cleat Strength'
      : 'Evaluate Cable Schedule';
    calcBtn.setAttribute('aria-label', calcBtn.textContent);
    if (loadScheduleBtn) loadScheduleBtn.hidden = true;
    resultsDiv.innerHTML = '';
    scheduleResultsDiv.innerHTML = '';
    forceVectorsPanel.classList.add('hidden');
    latestSingleResult = null;
    latestSingleParams = null;
    latestScheduleRows = [];
    latestScheduleParams = null;
    setActionStatus('');
    updateInputReview();
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
    if (scheduleModeRadio.checked) {
      runScheduleEvaluation();
      return;
    }
    const iSc        = parseFloat(faultCurrentInput.value);
    const xr         = parseFloat(xrRatioInput.value);
    const sysType    = systemTypeSel.value;
    const arrg       = arrangementSel.value;
    const spacing    = resolveSpacingMm();
    const cleatSpan  = parseFloat(cleatSpacingInput.value) * (unitSystem === 'metric' ? 1 : 25.4);
    const sf         = parseFloat(safetyFactorInput.value);
    const knownRating = parseFloat(cleatRatingInput.value);

    if (!Number.isFinite(iSc) || iSc <= 0) {
      showInputAlert('Enter a positive fault current (kA).');
      return;
    }
    if (!Number.isFinite(xr) || xr < 0) {
      showInputAlert('Enter a non-negative X/R ratio.');
      return;
    }
    if (!Number.isFinite(spacing) || spacing <= 0) {
      showInputAlert('Enter a positive cable spacing.');
      return;
    }
    if (!Number.isFinite(cleatSpan) || cleatSpan <= 0) {
      showInputAlert('Enter a positive cleat spacing.');
      return;
    }
    if (!Number.isFinite(sf) || sf < 1) {
      showInputAlert('Safety factor must be at least 1.0.');
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
      showCalculationError(err.message);
      return;
    }

    const userRating = Number.isFinite(knownRating) && knownRating > 0
      ? knownRating : null;
    latestSingleResult = result;
    latestSingleParams = {
      iSc, xr, sysType, arrg, spacing, cleatSpan, sf, userRating,
    };
    latestScheduleRows = [];
    latestScheduleParams = null;

    renderSingleResult(result, latestSingleParams);
    renderForceVectors(result, { sysType, arrg });
    setActionStatus('Single-cable result updated.');
  });

  function renderForceVectors(result, params) {
    if (params.sysType !== 'three-phase') {
      forceVectorsPanel.classList.add('hidden');
      return;
    }
    const f = result.forcePerMeter_Nm;
    const forceA = f.toFixed(1);
    const forceB = (params.arrg === 'flat' ? 0 : f).toFixed(1);
    const forceC = f.toFixed(1);
    const toLbfFt = f * 0.0685218;
    vectorLegend.textContent = `Vector magnitudes shown per phase. Base force: ${f.toFixed(1)} N/m (${toLbfFt.toFixed(2)} lbf/ft).`;
    if (params.arrg === 'trefoil') {
      forceVectorSvg.innerHTML = `
      <defs><marker id="vArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#2563eb"></path></marker></defs>
      <circle cx="210" cy="70" r="26" fill="#dbeafe" stroke="#1d4ed8"></circle><circle cx="184" cy="115" r="26" fill="#dcfce7" stroke="#15803d"></circle><circle cx="236" cy="115" r="26" fill="#fee2e2" stroke="#dc2626"></circle>
      <text x="210" y="77" text-anchor="middle" class="phase-label">A</text><text x="184" y="122" text-anchor="middle" class="phase-label">B</text><text x="236" y="122" text-anchor="middle" class="phase-label">C</text>
      <line x1="210" y1="70" x2="210" y2="28" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow)"></line>
      <line x1="184" y1="115" x2="146" y2="143" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow)"></line>
      <line x1="236" y1="115" x2="274" y2="143" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow)"></line>
      <text x="218" y="24">A ↑ ${forceA} N/m</text><text x="89" y="145">B ↙ ${forceB} N/m</text><text x="274" y="145">C ↘ ${forceC} N/m</text>`;
    } else {
      forceVectorSvg.innerHTML = `
      <defs><marker id="vArrow2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#2563eb"></path></marker></defs>
      <circle cx="122" cy="120" r="24" fill="#dbeafe" stroke="#1d4ed8"></circle><circle cx="170" cy="120" r="24" fill="#dcfce7" stroke="#15803d"></circle><circle cx="218" cy="120" r="24" fill="#fee2e2" stroke="#dc2626"></circle>
      <text x="122" y="126" text-anchor="middle" class="phase-label">A</text><text x="170" y="126" text-anchor="middle" class="phase-label">B</text><text x="218" y="126" text-anchor="middle" class="phase-label">C</text>
      <line x1="122" y1="120" x2="78" y2="120" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow2)"></line>
      <line x1="170" y1="120" x2="170" y2="120" stroke="#2563eb" stroke-width="0"></line>
      <line x1="218" y1="120" x2="262" y2="120" stroke="#2563eb" stroke-width="3" marker-end="url(#vArrow2)"></line>
      <text x="26" y="116">A ← ${forceA} N/m</text><text x="150" y="84">B net ${forceB} N/m</text><text x="268" y="116">C → ${forceC} N/m</text>`;
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

    const cardClass = adequate === false
      ? 'fault-bracing-result fault-bracing-result--fail'
      : 'fault-bracing-result fault-bracing-result--ok';
    const configurationSvg = buildResultConfigurationSvg(r, params);
    const decisionClass = adequate === false
      ? 'fault-bracing-decision--fail'
      : adequate === true
        ? 'fault-bracing-decision--pass'
        : 'fault-bracing-decision--info';
    const decisionTitle = adequate === false
      ? 'Cleat selection is undersized'
      : adequate === true
        ? 'Cleat selection is adequate'
        : 'Specify this minimum cleat rating';
    const decisionBody = adequate === false
      ? `Select a cleat rated at least ${r.requiredStrength_kN.toFixed(2)} kN, or reduce the cleat spacing and recalculate.`
      : adequate === true
        ? `${params.userRating.toFixed(2)} kN rated strength meets the ${r.requiredStrength_kN.toFixed(2)} kN requirement.`
        : `Use a cleat with an IEC 61914 rated tensile strength of at least ${r.requiredStrength_kN.toFixed(2)} kN.`;

    resultsDiv.innerHTML = `
      <div class="result-card ${cardClass}" role="status" aria-live="polite">
        <h2>Result</h2>
        <div class="fault-bracing-decision ${decisionClass}">
          <span>Decision</span>
          <strong>${decisionTitle}</strong>
          <p>${decisionBody}</p>
        </div>
        <div class="fault-bracing-kpi-grid" aria-label="Fault bracing calculation summary">
          <div class="fault-bracing-kpi">
            <span>Required Strength</span>
            <strong>${r.requiredStrength_kN.toFixed(2)} kN</strong>
          </div>
          <div class="fault-bracing-kpi">
            <span>Cleat Load</span>
            <strong>${r.cleatLoad_kN.toFixed(3)} kN</strong>
          </div>
          <div class="fault-bracing-kpi">
            <span>Force</span>
            <strong>${forceDisplay}</strong>
          </div>
          <div class="fault-bracing-kpi">
            <span>Peak Current</span>
            <strong>${r.iPeak_kA.toFixed(3)} kA</strong>
          </div>
        </div>
        <div class="fault-bracing-result-actions" aria-label="Result actions">
          <button type="button" class="fault-bracing-ghost-btn" data-copy-single-result>Copy Summary</button>
        </div>
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
        <figure class="result-configuration-diagram">
          <figcaption>Selected cable configuration and force direction.</figcaption>
          ${configurationSvg}
        </figure>
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

  function buildResultConfigurationSvg(result, params) {
    const force = result.forcePerMeter_Nm.toFixed(1);
    if (params.sysType !== 'three-phase') {
      return `
      <svg viewBox="0 0 360 220" role="img" aria-label="Single-phase force direction configuration">
        <defs><marker id="calcArrowSingle" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#2563eb"></path></marker></defs>
        <circle cx="130" cy="110" r="34" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"></circle>
        <circle cx="198" cy="110" r="34" fill="#fee2e2" stroke="#dc2626" stroke-width="2"></circle>
        <text x="130" y="118" text-anchor="middle" class="phase-label">+</text>
        <text x="198" y="118" text-anchor="middle" class="phase-label">−</text>
        <line x1="130" y1="110" x2="84" y2="110" stroke="#2563eb" stroke-width="4" marker-end="url(#calcArrowSingle)"></line>
        <line x1="198" y1="110" x2="244" y2="110" stroke="#2563eb" stroke-width="4" marker-end="url(#calcArrowSingle)"></line>
        <text x="20" y="92">Conductor 1 ← ${force} N/m</text>
        <text x="230" y="92">Conductor 2 → ${force} N/m</text>
      </svg>`;
    }
    if (params.arrg === 'flat') {
      return `
      <svg viewBox="0 0 420 230" role="img" aria-label="Flat cable configuration with force vectors">
        <defs><marker id="calcArrowFlat" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#2563eb"></path></marker></defs>
        <circle cx="132" cy="122" r="30" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"></circle>
        <circle cx="192" cy="122" r="30" fill="#dcfce7" stroke="#15803d" stroke-width="2"></circle>
        <circle cx="252" cy="122" r="30" fill="#fee2e2" stroke="#dc2626" stroke-width="2"></circle>
        <text x="132" y="130" text-anchor="middle" class="phase-label">A</text>
        <text x="192" y="130" text-anchor="middle" class="phase-label">B</text>
        <text x="252" y="130" text-anchor="middle" class="phase-label">C</text>
        <line x1="132" y1="122" x2="82" y2="122" stroke="#2563eb" stroke-width="4" marker-end="url(#calcArrowFlat)"></line>
        <line x1="252" y1="122" x2="302" y2="122" stroke="#2563eb" stroke-width="4" marker-end="url(#calcArrowFlat)"></line>
        <text x="20" y="88">A ← ${force} N/m</text>
        <text x="328" y="88">C → ${force} N/m</text>
      </svg>`;
    }
    return `
    <svg viewBox="0 0 420 230" role="img" aria-label="Trefoil cable configuration with force vectors">
      <defs><marker id="calcArrowTrefoil" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#2563eb"></path></marker></defs>
      <circle cx="210" cy="68" r="30" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"></circle>
      <circle cx="180" cy="120" r="30" fill="#dcfce7" stroke="#15803d" stroke-width="2"></circle>
      <circle cx="240" cy="120" r="30" fill="#fee2e2" stroke="#dc2626" stroke-width="2"></circle>
      <text x="210" y="76" text-anchor="middle" class="phase-label">A</text>
      <text x="180" y="128" text-anchor="middle" class="phase-label">B</text>
      <text x="240" y="128" text-anchor="middle" class="phase-label">C</text>
      <line x1="210" y1="68" x2="210" y2="24" stroke="#2563eb" stroke-width="4" marker-end="url(#calcArrowTrefoil)"></line>
      <line x1="180" y1="120" x2="142" y2="148" stroke="#2563eb" stroke-width="4" marker-end="url(#calcArrowTrefoil)"></line>
      <line x1="240" y1="120" x2="278" y2="148" stroke="#2563eb" stroke-width="4" marker-end="url(#calcArrowTrefoil)"></line>
      <text x="218" y="20">A ↑ ${force} N/m</text>
      <text x="66" y="170">B ↙ ${force} N/m</text>
      <text x="286" y="170">C ↘ ${force} N/m</text>
    </svg>`;
  }

  // ── Schedule mode ────────────────────────────────────────────────────────
  function parsePositiveNumber(value) {
    const number = parseFloat(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function resolveCableSpacingFromSchedule(cable, conductors, size) {
    const key = `${conductors}C-${size}`;
    const explicitOd = parsePositiveNumber(cable.cable_od ?? cable.OD ?? cable.od ?? cable.diameter);
    if (explicitOd) {
      return {
        spacing_mm: explicitOd * 25.4,
        spacingSource: 'Schedule OD',
        spacingQuality: 'schedule',
      };
    }
    if (odLookup[key]) {
      return {
        spacing_mm: odLookup[key],
        spacingSource: 'Size lookup',
        spacingQuality: 'lookup',
      };
    }
    return {
      spacing_mm: 50,
      spacingSource: 'Assumed 50 mm',
      spacingQuality: 'assumed',
    };
  }

  function runScheduleEvaluation() {
    const cables = getCables();
    if (!cables.length) {
      showAlertModal('No Cables Found', 'No cables found in the Cable Schedule. Add cables first, then return here to evaluate cleat strength.');
      return;
    }

    const iSc       = parseFloat(faultCurrentInput.value);
    const xr        = parseFloat(xrRatioInput.value);
    const cleatSpan = parseFloat(cleatSpacingInput.value) * (unitSystem === 'metric' ? 1 : 25.4);
    const sf        = parseFloat(safetyFactorInput.value);

    if (!Number.isFinite(iSc) || iSc <= 0) {
      showInputAlert('Enter a positive fault current (kA).');
      return;
    }
    if (!Number.isFinite(xr) || xr < 0) {
      showInputAlert('Enter a non-negative X/R ratio.');
      return;
    }
    if (!Number.isFinite(cleatSpan) || cleatSpan <= 0) {
      showInputAlert('Enter a positive cleat spacing.');
      return;
    }
    if (!Number.isFinite(sf) || sf < 1) {
      showInputAlert('Safety factor must be at least 1.0.');
      return;
    }

    const rows = cables.map(cable => {
      const conductors = cable.conductors != null ? String(cable.conductors) : '3';
      const size       = cable.conductor_size || cable.size || '';
      const spacing = resolveCableSpacingFromSchedule(cable, conductors, size);
      const sysType = (parseInt(conductors, 10) === 2) ? 'single-phase' : 'three-phase';

      let result = null;
      let err    = null;
      try {
        result = calcCableFaultBracing({
          faultCurrent_kA: iSc,
          xrRatio:         xr,
          systemType:      sysType,
          arrangement:     'trefoil',
          spacing_mm:      spacing.spacing_mm,
          cleatSpacing_mm: cleatSpan,
          safetyFactor:    sf,
        });
      } catch (e) {
        err = e.message;
      }

      return { cable, conductors, size, sysType, result, err, ...spacing };
    });

    rows.sort((a, b) => {
      const aError = a.err || !a.result ? 1 : 0;
      const bError = b.err || !b.result ? 1 : 0;
      if (aError !== bError) return bError - aError;
      return (b.result?.requiredStrength_kN ?? -Infinity) - (a.result?.requiredStrength_kN ?? -Infinity);
    });

    latestScheduleRows = rows;
    latestScheduleParams = { iSc, xr, cleatSpan, sf };
    latestSingleResult = null;
    latestSingleParams = null;

    renderScheduleResultsV2(rows, latestScheduleParams);
    setActionStatus('Cable Schedule results updated.');
  }
  loadScheduleBtn.addEventListener('click', runScheduleEvaluation);

  function renderScheduleResultsV2(rows, params) {
    if (!rows.length) {
      scheduleResultsDiv.innerHTML = '<p>No cables to display.</p>';
      return;
    }

    const validRows = rows.filter(row => row.result && !row.err);
    const errorCount = rows.length - validRows.length;
    const assumedCount = rows.filter(row => row.spacingQuality === 'assumed').length;
    const lookupCount = rows.filter(row => row.spacingQuality === 'lookup').length;
    const maxRow = validRows[0] || null;
    const averageRequired = validRows.length
      ? validRows.reduce((sum, row) => sum + row.result.requiredStrength_kN, 0) / validRows.length
      : 0;

    const tableRows = rows.map(({ cable, conductors, spacing_mm, spacingSource, spacingQuality, sysType, result, err }) => {
      const tag = esc(cable.tag || cable.cable_tag || cable.id || '-');
      const size = esc(cable.conductor_size || cable.size || '-');
      const spacingDisplay = unitSystem === 'metric' ? spacing_mm.toFixed(1) : mmToIn(spacing_mm).toFixed(2);
      const forceDisplay = result
        ? (unitSystem === 'metric' ? result.forcePerMeter_Nm.toFixed(1) : result.forcePerMeter_lbfFt.toFixed(1))
        : '-';
      const rowClass = err || !result
        ? 'schedule-row--error'
        : spacingQuality === 'assumed'
          ? 'schedule-row--assumed'
          : '';
      const sourceClass = err || !result
        ? 'schedule-source--error'
        : spacingQuality === 'assumed'
          ? 'schedule-source--assumed'
          : spacingQuality === 'lookup'
            ? 'schedule-source--lookup'
            : '';
      const systemLabel = sysType === 'single-phase'
        ? `${esc(conductors)} conductor`
        : `${esc(conductors)} conductor`;

      if (err || !result) {
        return `<tr class="${rowClass}">
          <td>${tag}</td>
          <td>${size}</td>
          <td>${systemLabel}</td>
          <td>${spacing_mm > 0 ? spacingDisplay : '-'}</td>
          <td><span class="schedule-source ${sourceClass}">${esc(spacingSource)}</span></td>
          <td>-</td>
          <td>-</td>
          <td class="status-badge result-fail">Error${err ? ': ' + esc(err) : ''}</td>
        </tr>`;
      }

      return `<tr class="${rowClass}">
        <td>${tag}</td>
        <td>${size}</td>
        <td>${systemLabel}</td>
        <td>${spacingDisplay}</td>
        <td><span class="schedule-source ${sourceClass}">${esc(spacingSource)}</span></td>
        <td>${forceDisplay}</td>
        <td>${result.cleatLoad_kN.toFixed(3)}</td>
        <td class="status-badge result-ok">&ge; ${result.requiredStrength_kN.toFixed(2)} kN</td>
      </tr>`;
    }).join('');

    const assumedWarning = assumedCount
      ? `<p class="report-alert report-alert--warning">${assumedCount} cable${assumedCount === 1 ? '' : 's'} used the 50 mm fallback spacing because no Cable Schedule OD or size-library OD was available. Add cable OD values for a more defensible result.</p>`
      : '';
    const errorWarning = errorCount
      ? `<p class="report-alert report-alert--error">${errorCount} cable${errorCount === 1 ? '' : 's'} could not be evaluated. Review the error row${errorCount === 1 ? '' : 's'} below.</p>`
      : '';

    scheduleResultsDiv.innerHTML = `
      <h2>Cable Schedule Results</h2>
      <div class="fault-bracing-schedule-summary" aria-label="Cable schedule bracing summary">
        <div>
          <span>Cables Evaluated</span>
          <strong>${validRows.length} of ${rows.length}</strong>
        </div>
        <div>
          <span>Highest Requirement</span>
          <strong>${maxRow ? `${maxRow.result.requiredStrength_kN.toFixed(2)} kN` : '-'}</strong>
        </div>
        <div>
          <span>Average Requirement</span>
          <strong>${validRows.length ? `${averageRequired.toFixed(2)} kN` : '-'}</strong>
        </div>
        <div>
          <span>OD Lookup / Fallback</span>
          <strong>${lookupCount} / ${assumedCount}</strong>
        </div>
      </div>
      <p class="field-hint">
        I<sub>sc</sub> = ${params.iSc.toFixed(1)} kA, X/R = ${params.xr.toFixed(1)},
        cleat spacing = ${unitSystem === 'metric' ? `${params.cleatSpan.toFixed(0)} mm` : `${mmToIn(params.cleatSpan).toFixed(2)} in`}, SF = ${params.sf}.
        Results are sorted by required strength, highest first.
      </p>
      <div class="fault-bracing-result-actions" aria-label="Schedule result actions">
        <button type="button" class="fault-bracing-ghost-btn" data-copy-schedule-results>Copy Summary</button>
        <button type="button" class="fault-bracing-ghost-btn" data-export-schedule-csv>Export CSV</button>
      </div>
      ${assumedWarning}
      ${errorWarning}
      <div class="fault-bracing-table-wrap">
        <table class="result-table schedule-result-table"
               aria-label="Cable fault bracing results">
          <thead>
            <tr>
              <th scope="col">Cable Tag</th>
              <th scope="col">Size</th>
              <th scope="col">System</th>
              <th scope="col">Spacing (${unitSystem === 'metric' ? 'mm' : 'in'})</th>
              <th scope="col">Spacing Source</th>
              <th scope="col">Force (${unitSystem === 'metric' ? 'N/m' : 'lbf/ft'})</th>
              <th scope="col">Cleat Load (kN)</th>
              <th scope="col">Required Strength</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <p class="method-note">
        Forces per IEC 60909-0:2016 and Ampere's force law.
        Required strength includes IEC 61914 safety factor of ${params.sf}.
      </p>`;
  }

  function formatSingleResultSummary(result, params) {
    const ratingLine = params.userRating
      ? `Known cleat rating: ${params.userRating.toFixed(2)} kN (${params.userRating >= result.requiredStrength_kN ? 'PASS' : 'FAIL'})`
      : 'Known cleat rating: not entered';
    return [
      'Cable Fault Bracing Summary',
      `Fault current: ${params.iSc.toFixed(1)} kA RMS`,
      `X/R ratio: ${params.xr.toFixed(1)}`,
      `Peak factor: ${result.peakFactor.toFixed(4)}`,
      `Peak fault current: ${result.iPeak_kA.toFixed(3)} kA`,
      `System: ${params.sysType === 'three-phase' ? `three-phase ${params.arrg}` : 'single-phase / DC'}`,
      `Cable spacing: ${formatLength(params.spacing)}`,
      `Cleat interval: ${formatLength(params.cleatSpan, 0, 2)}`,
      `Electromagnetic force: ${result.forcePerMeter_Nm.toFixed(1)} N/m (${result.forcePerMeter_lbfFt.toFixed(1)} lbf/ft)`,
      `Cleat load: ${result.cleatLoad_kN.toFixed(3)} kN`,
      `Required rated cleat strength: ${result.requiredStrength_kN.toFixed(2)} kN (SF ${result.safetyFactor})`,
      ratingLine,
    ].join('\n');
  }

  function formatScheduleSummary(rows, params) {
    const validRows = rows.filter(row => row.result && !row.err);
    const assumedCount = rows.filter(row => row.spacingQuality === 'assumed').length;
    const topRows = validRows.slice(0, 5).map((row, index) => {
      const tag = row.cable.tag || row.cable.cable_tag || row.cable.id || '-';
      return `${index + 1}. ${tag}: ${row.result.requiredStrength_kN.toFixed(2)} kN required (${row.spacingSource})`;
    });
    return [
      'Cable Fault Bracing Schedule Summary',
      `Fault current: ${params.iSc.toFixed(1)} kA RMS`,
      `X/R ratio: ${params.xr.toFixed(1)}`,
      `Cleat interval: ${formatLength(params.cleatSpan, 0, 2)}`,
      `Safety factor: ${params.sf}`,
      `Cables evaluated: ${validRows.length} of ${rows.length}`,
      `Rows using assumed 50 mm spacing: ${assumedCount}`,
      'Highest required strengths:',
      ...(topRows.length ? topRows : ['No valid cable rows.']),
    ].join('\n');
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function csvSpreadsheetSafe(value) {
    const text = String(value ?? '');
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  }

  function buildScheduleCsv(rows) {
    const header = [
      'Cable Tag',
      'Size',
      'Conductors',
      'System',
      'Spacing mm',
      'Spacing Source',
      'Force N/m',
      'Force lbf/ft',
      'Cleat Load kN',
      'Required Strength kN',
      'Status',
    ];
    const lines = rows.map(row => {
      const tag = row.cable.tag || row.cable.cable_tag || row.cable.id || '';
      const size = row.cable.conductor_size || row.cable.size || '';
      const status = row.err || !row.result ? `Error${row.err ? `: ${row.err}` : ''}` : 'OK';
      return [
        csvSpreadsheetSafe(tag),
        csvSpreadsheetSafe(size),
        row.conductors,
        row.sysType,
        row.spacing_mm.toFixed(1),
        row.spacingSource,
        row.result ? row.result.forcePerMeter_Nm.toFixed(1) : '',
        row.result ? row.result.forcePerMeter_lbfFt.toFixed(1) : '',
        row.result ? row.result.cleatLoad_kN.toFixed(3) : '',
        row.result ? row.result.requiredStrength_kN.toFixed(2) : '',
        status,
      ].map(csvCell).join(',');
    });
    return [header.map(csvCell).join(','), ...lines].join('\n');
  }

  resultsDiv.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-copy-single-result]')) return;
    if (!latestSingleResult || !latestSingleParams) return;
    copyText(formatSingleResultSummary(latestSingleResult, latestSingleParams), 'Fault bracing summary copied.');
  });

  scheduleResultsDiv.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-copy-schedule-results]')) {
      if (!latestScheduleRows.length || !latestScheduleParams) return;
      copyText(formatScheduleSummary(latestScheduleRows, latestScheduleParams), 'Schedule summary copied.');
      return;
    }
    if (target.closest('[data-export-schedule-csv]')) {
      if (!latestScheduleRows.length) return;
      downloadText('cable-fault-bracing-results.csv', buildScheduleCsv(latestScheduleRows), 'text/csv');
      setActionStatus('Schedule CSV exported.');
    }
  });

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
