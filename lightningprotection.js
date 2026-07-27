import {
  runLightningProtection,
  LOCATION_FACTORS,
} from './analysis/lightningProtection.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyBasisPanel('lightningProtection', {
    standard: 'IEC 62305-1/-2/-3 (lightning protection); IEEE Std 998 (substation shielding); IEEE C62.22 (arresters)',
    clause: 'Risk-based LPL selection, rolling-sphere protective radius, and surge-arrester MCOV',
    formulas: [
      'Ng = 0.04 · Td^1.25  — ground flash density (per km²/yr)',
      'Ad = L·W + 2·(3H)(L+W) + π·(3H)²  — collection area',
      'Nd = Ng · Ad · Cd · 1e-6  — expected direct strikes/yr',
      'Efficiency E = 1 − Nc/Nd → LPL I/II/III/IV',
      'rp = √(h(2R−h)) − √(hx(2R−hx))  — single-mast protective radius',
      'Uc ≥ 1.05·VLL/√3 (solid) or 1.05·VLL (ungrounded)  — arrester MCOV',
    ],
    assumptions: [
      'Isolated rectangular structure collection area (IEC 62305-2 Annex A)',
      'IEC 61024-1 protection-efficiency table for LPL selection',
      'Electrogeometric / rolling-sphere model for protective radius',
    ],
    limitations: [
      'Screening-level: simplified single-component risk, not the full R1–R4 assessment',
      'Single-mast protection only (no multi-mast or shield-wire optimisation)',
      'Verify against a full IEC 62305-2 risk study before final design',
    ],
  });

  initStudyApprovalPanel('lightningProtection');

  const form       = document.getElementById('lp-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv  = document.getElementById('calc-errors');
  const exportBtn  = document.getElementById('export-csv-btn');
  const ngModeSel  = document.getElementById('ng-mode');
  const previewSvg = document.getElementById('lp-protection-preview');
  const previewStatus = document.getElementById('lp-preview-status');
  const studyStatus = document.getElementById('lp-study-status');
  const unitButtons = Array.from(document.querySelectorAll('[data-lp-unit]'));
  const METERS_TO_FEET = 3.280839895;
  const SQUARE_METERS_TO_SQUARE_FEET = 10.763910417;
  const SQUARE_KILOMETERS_PER_SQUARE_MILE = 2.58998811;
  let unitSystem = 'metric';

  unitButtons.forEach(button => {
    button.addEventListener('click', () => {
      setUnitSystem(button.dataset.lpUnit);
    });
  });

  // Toggle Td vs direct-Ng inputs
  function syncNgMode() {
    const direct = ngModeSel.value === 'direct';
    document.getElementById('row-td').hidden = direct;
    document.getElementById('row-ng').hidden = !direct;
    updateLiveAssessment();
  }
  ngModeSel.addEventListener('change', syncNgMode);

  const saved = getStudies().lightningProtection;
  if (saved && saved.inputs) {
    restoreForm(saved.inputs);
    renderResults(saved);
    exportBtn.hidden = false;
    setStudyStatus('saved');
  } else {
    setUnitSystem('metric', { convertValues: false, update: false });
    syncNgMode();
  }

  form.addEventListener('input', updateLiveAssessment);
  form.addEventListener('change', updateLiveAssessment);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Saving…';

    let result;
    try {
      result = runLightningProtection(readConfig());
      result.inputs._formState = { ngMode: ngModeSel.value, unitSystem };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run the lightning study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      runBtn.disabled = false;
      runBtn.textContent = 'Save Assessment';
      return;
    }

    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.lightningProtection = result;
    setStudies(studies);

    renderResults(result);
    updateLiveVisual(result);
    setStudyStatus('saved');
    exportBtn.hidden = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Save Assessment';
  });

  exportBtn.addEventListener('click', () => {
    const s = getStudies().lightningProtection;
    if (s) download('lightning-protection.csv', resultToCsv(s), 'text/csv');
  });

  function restoreForm(inputs) {
    if (!inputs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    unitSystem = 'metric';
    set('length', inputs.length); set('width', inputs.width); set('height', inputs.height);
    set('location', inputs.location); set('nc', inputs.tolerableFrequency);
    set('protected-height', inputs.protectedHeight); set('down-material', inputs.downConductorMaterial);
    if (Number.isFinite(inputs.systemKvLL)) { set('system-kv', inputs.systemKvLL); set('grounding', inputs.grounding); }
    if (inputs._formState && inputs._formState.ngMode) { ngModeSel.value = inputs._formState.ngMode; }
    if (ngModeSel.value === 'direct') set('ng', inputs.groundFlashDensity);
    else set('td', inputs.thunderstormDays);
    setUnitSystem(inputs._formState?.unitSystem || 'metric', { convertValues: true, update: false });
    syncNgMode();
  }

  // -------------------------------------------------------------------------
  // Live visual rendering
  // -------------------------------------------------------------------------
  function setUnitSystem(nextUnit, options = {}) {
    const next = nextUnit === 'imperial' ? 'imperial' : 'metric';
    const previous = unitSystem;
    const shouldConvert = options.convertValues !== false && next !== previous;

    if (shouldConvert) {
      ['length', 'width', 'height', 'protected-height'].forEach(id => {
        const input = document.getElementById(id);
        const current = parseFloat(input.value);
        if (!Number.isFinite(current)) return;
        const meters = previous === 'imperial' ? current / METERS_TO_FEET : current;
        input.value = formatInputNumber(next === 'imperial' ? meters * METERS_TO_FEET : meters);
      });

      const densityInput = document.getElementById('ng');
      const currentDensity = parseFloat(densityInput.value);
      if (Number.isFinite(currentDensity)) {
        const perSquareKilometer = previous === 'imperial'
          ? currentDensity / SQUARE_KILOMETERS_PER_SQUARE_MILE
          : currentDensity;
        densityInput.value = formatInputNumber(next === 'imperial'
          ? perSquareKilometer * SQUARE_KILOMETERS_PER_SQUARE_MILE
          : perSquareKilometer);
      }
    }

    unitSystem = next;
    unitButtons.forEach(button => {
      const active = button.dataset.lpUnit === unitSystem;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const lengthUnit = unitSystem === 'imperial' ? 'ft' : 'm';
    document.querySelectorAll('[data-lp-length-unit]').forEach(element => {
      element.textContent = lengthUnit;
    });
    document.getElementById('lp-density-input-unit').textContent = unitSystem === 'imperial' ? '/mi²/yr' : '/km²/yr';
    document.getElementById('lp-kpi-ng-unit').textContent = unitSystem === 'imperial'
      ? 'ground flashes / mi² / year'
      : 'ground flashes / km² / year';
    document.getElementById('lp-unit-note').textContent = unitSystem === 'imperial'
      ? 'Enter dimensions in feet and direct flash density per mi².'
      : 'Enter dimensions in metres and direct flash density per km².';

    if (options.update !== false) {
      updateLiveAssessment();
      const savedStudy = getStudies().lightningProtection;
      if (savedStudy) renderResults(savedStudy);
    }
  }

  function formatInputNumber(value) {
    if (!Number.isFinite(value)) return '';
    return String(Number(value.toFixed(3)));
  }

  function lengthFromDisplay(value) {
    return unitSystem === 'imperial' ? value / METERS_TO_FEET : value;
  }

  function densityFromDisplay(value) {
    return unitSystem === 'imperial' ? value / SQUARE_KILOMETERS_PER_SQUARE_MILE : value;
  }

  function lengthForDisplay(value) {
    return unitSystem === 'imperial' ? value * METERS_TO_FEET : value;
  }

  function areaForDisplay(value) {
    return unitSystem === 'imperial' ? value * SQUARE_METERS_TO_SQUARE_FEET : value;
  }

  function densityForDisplay(value) {
    return unitSystem === 'imperial' ? value * SQUARE_KILOMETERS_PER_SQUARE_MILE : value;
  }

  function lengthUnit() {
    return unitSystem === 'imperial' ? 'ft' : 'm';
  }

  function areaUnit() {
    return unitSystem === 'imperial' ? 'ft²' : 'm²';
  }

  function formatConductorArea(areaMm2) {
    if (unitSystem === 'metric') return `${areaMm2} mm²`;
    return `${areaMm2} mm² (${(areaMm2 / 645.16).toFixed(3)} in²)`;
  }

  function readConfig() {
    const num = id => parseFloat(document.getElementById(id).value);
    const config = {
      length: lengthFromDisplay(num('length')),
      width: lengthFromDisplay(num('width')),
      height: lengthFromDisplay(num('height')),
      location: document.getElementById('location').value,
      tolerableFrequency: num('nc'),
      protectedHeight: lengthFromDisplay(num('protected-height')),
      downConductorMaterial: document.getElementById('down-material').value,
    };
    if (ngModeSel.value === 'direct') config.groundFlashDensity = densityFromDisplay(num('ng'));
    else config.thunderstormDays = num('td');

    const kv = num('system-kv');
    if (Number.isFinite(kv) && kv > 0) {
      config.systemKvLL = kv;
      config.grounding = document.getElementById('grounding').value;
    }
    return config;
  }

  function updateLiveAssessment() {
    try {
      const result = runLightningProtection(readConfig());
      updateLiveVisual(result);
      setStudyStatus('editing');
    } catch (err) {
      renderPreviewPlaceholder(err instanceof Error ? err.message : 'Complete the inputs to see the protection concept.');
    }
  }

  function setStudyStatus(state) {
    if (!studyStatus) return;
    if (state === 'saved') {
      studyStatus.innerHTML = `
        <span class="lp-status-icon" aria-hidden="true">✓</span>
        <div><strong>Assessment saved</strong><span>The project contains the current lightning-protection study.</span></div>`;
      return;
    }
    studyStatus.innerHTML = `
      <span class="lp-status-icon" aria-hidden="true">↗</span>
      <div><strong>Live design preview</strong><span>Preview changed. Save when the protection concept is ready.</span></div>`;
  }

  function renderPreviewPlaceholder(message) {
    if (!previewSvg) return;
    previewStatus.className = 'lp-status-pill lp-status-pill--pending';
    previewStatus.textContent = 'Check inputs';
    previewSvg.innerHTML = `
      <title id="lp-preview-title">Lightning protection concept preview</title>
      <desc id="lp-preview-desc">${escapeHtml(message)}</desc>
      <rect x="176" y="126" width="408" height="192" rx="22" class="lp-svg-label-box"></rect>
      <circle cx="380" cy="190" r="28" fill="rgba(18,104,216,.10)"></circle>
      <text x="380" y="199" text-anchor="middle" class="lp-svg-label" style="font-size:28px">ϟ</text>
      <text x="380" y="246" text-anchor="middle" class="lp-svg-label">Preview needs valid study inputs</text>
      <text x="380" y="272" text-anchor="middle" class="lp-svg-sub-label">${escapeHtml(message)}</text>`;
    document.getElementById('lp-kpi-ng').textContent = '—';
    document.getElementById('lp-kpi-area').textContent = '—';
    document.getElementById('lp-kpi-strikes').textContent = '—';
    document.getElementById('lp-kpi-return').textContent = 'annual frequency';
    document.getElementById('lp-kpi-lpl').textContent = '—';
    document.getElementById('lp-kpi-lpl-note').textContent = 'recommended class';
    document.getElementById('lp-risk-ratio').textContent = '—';
    document.getElementById('lp-risk-message').textContent = 'Complete the inputs to compare the site risk with your tolerable threshold.';
    document.getElementById('lp-guidance-list').innerHTML = '';
  }

  function updateLiveVisual(r) {
    if (!previewSvg) return;
    const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const compact = x => Number.isFinite(x)
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, notation: x >= 100000 ? 'compact' : 'standard' }).format(x)
      : '—';
    const ratio = r.expectedStrikesPerYear / r.tolerableFrequency;
    const returnYears = r.expectedStrikesPerYear > 0 ? 1 / r.expectedStrikesPerYear : Infinity;
    const riskState = ratio <= 1 ? 'safe' : ratio <= 10 ? 'warning' : 'danger';
    const levelText = r.lpl.required ? `LPL ${r.lpl.level}` : 'Not required';

    previewStatus.className = `lp-status-pill lp-status-pill--${riskState}`;
    previewStatus.textContent = ratio <= 1 ? 'Below tolerable frequency' : `${levelText} recommended`;

    document.getElementById('lp-kpi-ng').textContent = f(densityForDisplay(r.groundFlashDensity), 2);
    document.getElementById('lp-kpi-area').textContent = `${compact(areaForDisplay(r.collectionAreaM2))} ${areaUnit()}`;
    document.getElementById('lp-kpi-strikes').textContent = r.expectedStrikesPerYear.toExponential(2);
    document.getElementById('lp-kpi-return').textContent = Number.isFinite(returnYears)
      ? `about one strike every ${returnYears >= 10 ? f(returnYears, 0) : f(returnYears, 1)} years`
      : 'annual frequency';
    document.getElementById('lp-kpi-lpl').textContent = levelText;
    document.getElementById('lp-kpi-lpl-note').textContent = r.lpl.required
      ? `${f(r.lpl.efficiency * 100, 1)}% interception efficiency needed`
      : 'risk is already below the threshold';

    updateLocationMarker(r.inputs.location);
    updateRiskMeter(ratio, r);
    updateGuidance(r);
    drawProtectionPreview(r);
  }

  function updateLocationMarker(location) {
    const positions = { surroundedTaller: 8, surroundedEqual: 31, isolated: 62, hilltop: 92 };
    const marker = document.getElementById('lp-location-marker');
    if (marker) marker.style.left = `${positions[location] ?? 62}%`;
  }

  function updateRiskMeter(ratio, r) {
    const marker = document.getElementById('lp-risk-marker');
    const position = Math.max(2, Math.min(98, ((Math.log10(Math.max(ratio, 0.01)) + 2) / 5) * 100));
    marker.style.left = `${position}%`;

    const ratioText = ratio >= 1000 ? `${ratio.toExponential(1)}×`
      : ratio >= 10 ? `${ratio.toFixed(0)}×`
        : `${ratio.toFixed(2)}×`;
    document.getElementById('lp-risk-ratio').textContent = ratioText;

    const message = ratio <= 1
      ? `Expected direct strikes are below the tolerable frequency. A dedicated structural LPS is not indicated by this screening, but bonding and surge protection still need review.`
      : `Expected direct strikes are ${ratioText} the tolerable frequency. ${r.lpl.note} The class sets the rolling-sphere radius and down-conductor spacing shown below.`;
    document.getElementById('lp-risk-message').textContent = message;
  }

  function updateGuidance(r) {
    const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const unit = lengthUnit();
    const levelText = r.lpl.required ? `LPL ${r.lpl.level}` : 'LPL not required';
    const coverageWarning = r.mastProtectiveRadiusM <= 0;
    const arrester = r.arrester
      ? `<strong>Coordinate the surge arrester</strong><p>Minimum MCOV is ${f(r.arrester.mcov, 1)} kV; the selected standard duty-cycle rating is ${r.arrester.ratedStandard != null ? `${f(r.arrester.ratedStandard, 0)} kV` : 'above the built-in table'}.</p>`
      : '<strong>Surge protection not evaluated</strong><p>Add a system voltage when an incoming-line arrester selection is needed.</p>';

    document.getElementById('lp-guidance-list').innerHTML = `
      <article class="lp-guidance-item ${r.lpl.required ? 'lp-guidance-item--warning' : 'lp-guidance-item--safe'}">
        <span aria-hidden="true">1</span>
        <div><strong>${levelText} air termination</strong><p>A ${f(lengthForDisplay(r.rollingSphereRadius), 0)} ${unit} rolling sphere represents strokes at or above ${f(r.minStrikeCurrentKa, 0)} kA.</p></div>
      </article>
      <article class="lp-guidance-item ${coverageWarning ? 'lp-guidance-item--warning' : 'lp-guidance-item--safe'}">
        <span aria-hidden="true">2</span>
        <div><strong>${coverageWarning ? 'Coverage needs another arrangement' : `${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit} mast coverage radius`}</strong><p>${coverageWarning ? 'The protected equipment is at or above the reference mast height. Add taller masts or shield wires.' : `At ${f(lengthForDisplay(r.inputs.protectedHeight), 1)} ${unit} equipment height, keep equipment inside this radius.`}</p></div>
      </article>
      <article class="lp-guidance-item">
        <span aria-hidden="true">3</span>
        <div><strong>${r.downConductorCount} down-conductors</strong><p>Distribute ${escapeHtml(r.downConductorMaterial)} conductors around the ${f(lengthForDisplay(r.perimeterM), 0)} ${unit} perimeter; minimum area is ${formatConductorArea(r.downConductorMinAreaMm2)}.</p></div>
      </article>
      <article class="lp-guidance-item">
        <span aria-hidden="true">4</span>
        <div>${arrester}</div>
      </article>`;
  }

  function drawProtectionPreview(r) {
    const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const unit = lengthUnit();
    const areaLabel = areaUnit();
    const maxPlan = Math.max(r.inputs.length, r.inputs.width, 1);
    const frontWidth = 205 + (r.inputs.length / maxPlan) * 95;
    const depthX = 42 + (r.inputs.width / maxPlan) * 50;
    const depthY = depthX * 0.45;
    const structureHeight = 115 + (r.inputs.height / (r.inputs.height + 22)) * 95;
    const groundY = 350;
    const roofY = groundY - structureHeight;
    const centerX = 374;
    const frontLeft = centerX - frontWidth / 2;
    const frontRight = centerX + frontWidth / 2;
    const mastX = centerX + depthX * 0.25;
    const mastTipY = Math.max(50, roofY - 55);
    const coverageHalf = Math.max(22, Math.min(205, (r.mastProtectiveRadiusM / maxPlan) * 390));
    const collectionExpansion = Math.max(55, Math.min(150, (3 * r.inputs.height / maxPlan) * 105));
    const collectionRx = frontWidth / 2 + depthX * 0.7 + collectionExpansion;
    const collectionRy = 55 + collectionExpansion * 0.42;
    const protectedLeft = Math.max(70, mastX - coverageHalf);
    const protectedRight = Math.min(690, mastX + coverageHalf);
    const equipmentHeight = Math.max(14, Math.min(64, (r.inputs.protectedHeight / Math.max(r.inputs.height, 1)) * structureHeight));
    const equipmentX = Math.min(protectedRight - 28, frontRight + depthX + 42);
    const protectedClass = r.mastProtectiveRadiusM > 0 ? 'lp-svg-protection' : 'lp-svg-protection';
    const windows = Array.from({ length: 6 }, (_, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = frontLeft + 24 + column * ((frontWidth - 64) / 2);
      const y = roofY + 34 + row * ((structureHeight - 70) / 2);
      return `<rect x="${x}" y="${y}" width="${Math.max(28, (frontWidth - 92) / 3)}" height="32" rx="3" class="lp-svg-window"></rect>`;
    }).join('');

    const description = `Structure ${f(lengthForDisplay(r.inputs.length))} ${unit} long, ${f(lengthForDisplay(r.inputs.width))} ${unit} wide, and ${f(lengthForDisplay(r.inputs.height))} ${unit} high. Collection area ${f(areaForDisplay(r.collectionAreaM2), 0)} ${areaLabel}. ${r.lpl.required ? `Lightning Protection Level ${r.lpl.level} is recommended.` : 'A dedicated lightning protection system is not indicated by the screening.'}`;
    previewSvg.innerHTML = `
      <title id="lp-preview-title">Lightning protection concept preview</title>
      <desc id="lp-preview-desc">${escapeHtml(description)}</desc>
      <defs>
        <marker id="lp-arrow-start" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M7,0 L0,3.5 L7,7" fill="none" stroke="currentColor"></path></marker>
        <marker id="lp-arrow-end" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="currentColor"></path></marker>
        <pattern id="lp-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" class="lp-svg-grid"></path></pattern>
      </defs>
      <rect x="0" y="285" width="760" height="175" fill="url(#lp-grid)"></rect>
      <ellipse cx="380" cy="${groundY + 18}" rx="${collectionRx}" ry="${collectionRy}" class="lp-svg-collection"></ellipse>
      <ellipse cx="380" cy="${groundY + 14}" rx="${frontWidth / 2 + depthX + 36}" ry="64" class="lp-svg-ground"></ellipse>
      <path d="M ${protectedLeft} ${groundY + 8} Q ${mastX} ${mastTipY - 24} ${protectedRight} ${groundY + 8} Z" class="${protectedClass}"></path>
      <path d="M ${Math.max(32, mastX - r.rollingSphereRadius * 4.7)} ${groundY + 4} Q ${mastX} ${mastTipY - 65} ${Math.min(728, mastX + r.rollingSphereRadius * 4.7)} ${groundY + 4}" class="lp-svg-sphere"></path>

      <path d="M 112 54 l 18 28 -12 0 11 31 -29 -39 13 0 z" class="lp-svg-strike"></path>
      <path d="M 121 111 Q 170 148 ${mastX - 8} ${mastTipY + 5}" class="lp-svg-strike" style="stroke-width:2;stroke-dasharray:5 5"></path>

      <polygon points="${frontLeft},${roofY} ${frontRight},${roofY} ${frontRight + depthX},${roofY - depthY} ${frontLeft + depthX},${roofY - depthY}" class="lp-svg-structure-roof"></polygon>
      <rect x="${frontLeft}" y="${roofY}" width="${frontWidth}" height="${structureHeight}" class="lp-svg-structure-front"></rect>
      <polygon points="${frontRight},${roofY} ${frontRight + depthX},${roofY - depthY} ${frontRight + depthX},${groundY - depthY} ${frontRight},${groundY}" class="lp-svg-structure-side"></polygon>
      ${windows}

      <line x1="${mastX}" y1="${roofY - depthY * 0.4}" x2="${mastX}" y2="${mastTipY}" class="lp-svg-mast"></line>
      <circle cx="${mastX}" cy="${mastTipY}" r="6" class="lp-svg-mast-tip"></circle>
      <path d="M ${mastX} ${mastTipY} L ${mastX} ${roofY - depthY * 0.4} L ${frontRight - 8} ${roofY + 8} L ${frontRight - 8} ${groundY}" class="lp-svg-conductor"></path>
      <ellipse cx="380" cy="${groundY + 31}" rx="${frontWidth / 2 + depthX + 15}" ry="46" class="lp-svg-ground-ring"></ellipse>
      <circle cx="${frontRight - 8}" cy="${groundY + 12}" r="6" class="lp-svg-ground-point"></circle>

      <rect x="${equipmentX}" y="${groundY - equipmentHeight}" width="38" height="${equipmentHeight}" rx="4" class="lp-svg-equipment"></rect>
      <path d="M ${equipmentX + 6} ${groundY - equipmentHeight} v-9 h26 v9" fill="none" stroke="#875a00" stroke-width="2"></path>

      <line x1="${frontLeft}" y1="${groundY + 66}" x2="${frontRight}" y2="${groundY + 66}" class="lp-svg-dimension"></line>
      <text x="${(frontLeft + frontRight) / 2}" y="${groundY + 84}" class="lp-svg-dimension-text">Length ${f(lengthForDisplay(r.inputs.length))} ${unit}</text>
      <line x1="${frontLeft - 26}" y1="${roofY}" x2="${frontLeft - 26}" y2="${groundY}" class="lp-svg-dimension"></line>
      <text x="${frontLeft - 35}" y="${(roofY + groundY) / 2}" class="lp-svg-dimension-text" transform="rotate(-90 ${frontLeft - 35} ${(roofY + groundY) / 2})">Height ${f(lengthForDisplay(r.inputs.height))} ${unit}</text>

      <g transform="translate(36 142)">
        <rect width="150" height="56" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="22" class="lp-svg-label">Collection zone</text>
        <text x="12" y="40" class="lp-svg-sub-label">${f(areaForDisplay(r.collectionAreaM2), 0)} ${areaLabel} effective area</text>
      </g>
      <g transform="translate(570 72)">
        <rect width="158" height="70" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="22" class="lp-svg-label">Rolling sphere</text>
        <text x="12" y="41" class="lp-svg-sub-label">R = ${f(lengthForDisplay(r.rollingSphereRadius), 0)} ${unit} · LPL ${r.lpl.level || 'III'}</text>
        <text x="12" y="57" class="lp-svg-sub-label">captures ≥ ${f(r.minStrikeCurrentKa, 0)} kA</text>
      </g>
      <g transform="translate(574 214)">
        <rect width="154" height="70" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="22" class="lp-svg-label">Protected equipment</text>
        <text x="12" y="41" class="lp-svg-sub-label">height ${f(lengthForDisplay(r.inputs.protectedHeight), 1)} ${unit}</text>
        <text x="12" y="57" class="lp-svg-sub-label">coverage radius ${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit}</text>
      </g>
      <g transform="translate(38 326)">
        <rect width="158" height="54" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="22" class="lp-svg-label">${r.downConductorCount} down-conductors</text>
        <text x="12" y="40" class="lp-svg-sub-label">${escapeHtml(r.downConductorMaterial)} · ${formatConductorArea(r.downConductorMinAreaMm2)} min</text>
      </g>`;
  }

  // -------------------------------------------------------------------------
  // Saved result rendering
  // -------------------------------------------------------------------------
  function renderResults(r) {
    const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const unit = lengthUnit();
    const arresterHtml = r.arrester ? `
      <div class="result-group">
        <h3>Surge-arrester voltage path</h3>
        <div class="lp-arrester-flow" aria-label="Surge arrester selection">
          <div class="lp-arrester-step"><span>System</span><strong>${f(r.arrester.systemKvLL, 1)} kV</strong><small>${escapeHtml(r.arrester.grounding)} grounding</small></div>
          <div class="lp-arrester-step"><span>Minimum MCOV</span><strong>${f(r.arrester.mcov, 1)} kV</strong><small>continuous operating voltage</small></div>
          <div class="lp-arrester-step"><span>Standard rating</span><strong>${r.arrester.ratedStandard != null ? `${f(r.arrester.ratedStandard, 0)} kV` : 'Review'}</strong><small>required duty-cycle ≥ ${f(r.arrester.ratedRequired, 1)} kV</small></div>
        </div>
      </div>` : '';

    const warningHtml = r.warnings.length
      ? `<ul class="lp-warning-list">${r.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
      : '<p class="field-hint">No study warnings.</p>';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Saved assessment details</h2>
        <div class="lp-saved-banner">
          <span aria-hidden="true">✓</span>
          <div><strong>Protection concept saved to the project</strong><p>The live preview and these design values now represent the saved study state.</p></div>
        </div>
        <div class="result-group">
          <div class="lp-result-grid">
            <div class="lp-result-card"><span>Air termination</span><strong>${r.lpl.required ? `LPL ${r.lpl.level}` : 'Not required'}</strong><small>${f(lengthForDisplay(r.rollingSphereRadius), 0)} ${unit} rolling sphere · ${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit} coverage radius</small></div>
            <div class="lp-result-card"><span>Down path</span><strong>${r.downConductorCount} conductors</strong><small>${escapeHtml(r.downConductorMaterial)} · minimum ${formatConductorArea(r.downConductorMinAreaMm2)} · ${f(lengthForDisplay(r.perimeterM), 0)} ${unit} perimeter</small></div>
            <div class="lp-result-card"><span>Stroke model</span><strong>≥ ${f(r.minStrikeCurrentKa, 0)} kA</strong><small>${f(lengthForDisplay(r.minStrikeDistanceM), 1)} ${unit} minimum striking distance</small></div>
          </div>
        </div>
        ${arresterHtml}
        <div class="result-group">
          <h3>Design checks</h3>
          ${warningHtml}
        </div>
      </section>`;
  }

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  function resultToCsv(r) {
    const imperial = unitSystem === 'imperial';
    const csvLengthUnit = imperial ? 'ft' : 'm';
    const csvAreaUnit = imperial ? 'ft2' : 'm2';
    const csvDensityUnit = imperial ? 'mi2' : 'km2';
    const lines = [];
    lines.push('# Lightning & Surge Protection Assessment');
    lines.push(`Display unit system,${imperial ? 'imperial' : 'metric'}`);
    lines.push(`Ground flash density (per ${csvDensityUnit}/yr),${densityForDisplay(r.groundFlashDensity).toFixed(3)}`);
    lines.push(`Collection area (${csvAreaUnit}),${areaForDisplay(r.collectionAreaM2).toFixed(1)}`);
    lines.push(`Location factor Cd,${r.locationFactor}`);
    lines.push(`Expected strikes Nd (per yr),${r.expectedStrikesPerYear.toExponential(3)}`);
    lines.push(`Tolerable frequency Nc (per yr),${r.tolerableFrequency.toExponential(3)}`);
    lines.push(`Required LPL,${r.lpl.level || 'none'}`);
    lines.push(`Protection efficiency,${(r.lpl.efficiency * 100).toFixed(2)}%`);
    lines.push(`Rolling sphere radius (${csvLengthUnit}),${lengthForDisplay(r.rollingSphereRadius).toFixed(2)}`);
    lines.push(`Single-mast protective radius (${csvLengthUnit}),${lengthForDisplay(r.mastProtectiveRadiusM).toFixed(2)}`);
    lines.push(`Down-conductors,${r.downConductorCount}`);
    lines.push(`Down-conductor min area (mm2),${r.downConductorMinAreaMm2}`);
    if (r.arrester) {
      lines.push(`Arrester MCOV (kV),${r.arrester.mcov.toFixed(2)}`);
      lines.push(`Arrester rated standard (kV),${r.arrester.ratedStandard ?? 'n/a'}`);
    }
    return lines.join('\n');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  void LOCATION_FACTORS;
});
