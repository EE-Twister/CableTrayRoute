import {
  runLightningProtection,
  LOCATION_FACTORS,
} from './analysis/lightningProtection.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';
import { escapeHtml } from './src/htmlUtils.mjs';
import { downloadLightningProtectionPdf } from './src/lightningProtectionPdf.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyBasisPanel('lightningProtection', {
    standard: 'NFPA 780; UL 96A; IEC 62305-1/-2/-3:2024; IEEE Std 998-2026; IEEE C62.22; IEC 60099-5:2018',
    clause: 'NFPA/UL design checks, screening-level LPL selection, rolling-sphere geometry, and >1 kV surge-arrester MCOV',
    formulas: [
      'NSG = 0.04 · Td^1.25  — legacy keraunic screening estimate (strike points/km²/yr)',
      'Ad = Af + (3H)P + π·(3H)²  — footprint area Af expanded by 3H',
      'Nd = NSG · Ad · Cd · 1e-6  — expected direct strikes/yr',
      'Efficiency E = 1 − Nc/Nd → LPL I/II/III/IV',
      'rp = √(h(2R−h)) − √(hx(2R−hx))  — single-mast protective radius',
      'rp = √(p(2R−p))  — roof-terminal radius for protrusion p above the protected plane',
      'Uc ≥ 1.05·VLL/√3 (solid) or 1.05·VLL (ungrounded)  — arrester MCOV',
    ],
    assumptions: [
      'Rectangular, circular, or entered custom footprint area and perimeter',
      'LPL selection uses each class declared interception capability',
      'Single centered mast or regular coordinate-based roof terminal array',
      'Plan and elevation coverage views use equal-axis rolling-sphere geometry',
    ],
    limitations: [
      'Screening-level proxy, not the full IEC 62305-2:2024 risk and damage-frequency assessment',
      'Roof arrays use a regular grid; final coordinates, roof obstructions, and shield wires require project-specific engineering',
      'IEEE C62.22 / IEC 60099-5 arrester screening applies only above 1 kV',
      'Verify against a full IEC 62305-2 risk study before final design',
    ],
  });

  initStudyApprovalPanel('lightningProtection');

  const form       = document.getElementById('lp-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv  = document.getElementById('calc-errors');
  const exportBtn  = document.getElementById('export-csv-btn');
  const exportBomBtn = document.getElementById('export-bom-btn');
  const exportPdfBtn = document.getElementById('export-pdf-btn');
  const exportStatus = document.getElementById('lp-export-status');
  const ngModeSel  = document.getElementById('ng-mode');
  const shapeSel   = document.getElementById('structure-shape');
  const methodSel  = document.getElementById('protection-method');
  const designStandardSel = document.getElementById('design-standard');
  const autoLayoutInput = document.getElementById('nfpa-auto-layout');
  const previewSvg = document.getElementById('lp-protection-preview');
  const previewStatus = document.getElementById('lp-preview-status');
  const studyStatus = document.getElementById('lp-study-status');
  const unitButtons = Array.from(document.querySelectorAll('[data-lp-unit]'));
  const METERS_TO_FEET = 3.280839895;
  const SQUARE_METERS_TO_SQUARE_FEET = 10.763910417;
  const SQUARE_KILOMETERS_PER_SQUARE_MILE = 2.58998811;
  let unitSystem = 'metric';
  let liveAssessment = null;

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

  function syncStructureShape(options = {}) {
    const shape = ['rectangle', 'circle', 'custom'].includes(shapeSel.value)
      ? shapeSel.value
      : 'rectangle';
    document.querySelectorAll('[data-shape-fields]').forEach(group => {
      group.hidden = group.dataset.shapeFields !== shape;
    });
    const roofArrayOption = methodSel.querySelector('option[value="roof-array"]');
    roofArrayOption.disabled = shape === 'custom';
    if (shape === 'custom' && methodSel.value === 'roof-array') {
      methodSel.value = 'single';
    }
    if (designStandardSel.value === 'nfpa-ul' && shape !== 'rectangle') {
      autoLayoutInput.checked = false;
    }
    syncProtectionMethod({ update: false });
    if (options.update !== false) updateLiveAssessment();
  }
  shapeSel.addEventListener('change', syncStructureShape);

  function syncDesignStandard(options = {}) {
    const isNfpaUl = designStandardSel.value === 'nfpa-ul';
    autoLayoutInput.closest('.lp-check-row').hidden = !isNfpaUl;
    if (isNfpaUl && shapeSel.value === 'custom') {
      shapeSel.value = 'rectangle';
      syncStructureShape({ update: false });
    }
    if (isNfpaUl) methodSel.value = 'roof-array';
    syncProtectionMethod({ update: false });
    if (options.update !== false) updateLiveAssessment();
  }
  designStandardSel.addEventListener('change', syncDesignStandard);
  autoLayoutInput.addEventListener('change', () => syncProtectionMethod());

  function syncProtectionMethod(options = {}) {
    const isArray = methodSel.value === 'roof-array';
    const automatic = isArray && designStandardSel.value === 'nfpa-ul' && autoLayoutInput.checked;
    document.getElementById('row-terminal-array').hidden = !isArray;
    ['terminal-rows', 'terminal-columns', 'terminal-edge-setback'].forEach(id => {
      document.getElementById(id).disabled = automatic;
    });
    const rows = Math.max(1, Number.parseInt(document.getElementById('terminal-rows').value, 10) || 1);
    const columns = Math.max(1, Number.parseInt(document.getElementById('terminal-columns').value, 10) || 1);
    document.getElementById('terminal-count-preview').textContent = `${rows * columns} terminal${rows * columns === 1 ? '' : 's'}`;
    if (options.update !== false) updateLiveAssessment();
  }
  methodSel.addEventListener('change', syncProtectionMethod);
  ['terminal-rows', 'terminal-columns'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      syncProtectionMethod({ update: false });
    });
  });

  const saved = getStudies().lightningProtection;
  if (saved && saved.inputs) {
    restoreForm(saved.inputs);
    renderResults(saved);
    exportBtn.hidden = false;
    setStudyStatus('saved');
  } else {
    setUnitSystem('metric', { convertValues: false, update: false });
    syncStructureShape({ update: false });
    syncDesignStandard({ update: false });
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

  exportBomBtn.addEventListener('click', () => {
    if (liveAssessment?.bom?.ready) {
      download('lightning-protection-bom.csv', bomToCsv(liveAssessment), 'text/csv');
    }
  });

  exportPdfBtn.addEventListener('click', async () => {
    const originalLabel = exportPdfBtn.textContent;
    exportPdfBtn.disabled = true;
    exportPdfBtn.textContent = 'Building PDF...';
    exportStatus.textContent = 'Rendering the current plan/elevation graphic and engineering values...';
    try {
      const result = runLightningProtection(readConfig());
      result.inputs._formState = { ngMode: ngModeSel.value, unitSystem };
      updateLiveVisual(result);
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      const report = await downloadLightningProtectionPdf({
        result,
        svgElement: previewSvg,
        unitSystem,
      });
      exportStatus.textContent = `Downloaded ${report.filename} (${report.pageCount} pages).`;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create the PDF report.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = message;
      exportStatus.textContent = 'PDF export failed. Review the input message and try again.';
      showModal('PDF Export Error', `<p>${escapeHtml(message)}</p>`, 'error');
    } finally {
      exportPdfBtn.disabled = false;
      exportPdfBtn.textContent = originalLabel;
    }
  });

  function restoreForm(inputs) {
    if (!inputs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    unitSystem = 'metric';
    set('structure-shape', inputs.structureShape || 'rectangle');
    set('design-standard', inputs.designStandard || 'iec-screening');
    set('protection-method', inputs.protectionMethod || 'single');
    autoLayoutInput.checked = inputs.autoTerminalLayout !== false;
    set('terminal-rows', inputs.terminalRows ?? 2);
    set('terminal-columns', inputs.terminalColumns ?? 4);
    set('terminal-edge-setback', inputs.terminalEdgeSetback ?? 1);
    set('bom-waste-percent', inputs.bomAssumptions?.conductorWastePercent ?? 10);
    set('bom-roof-support-spacing', inputs.bomAssumptions?.roofSupportSpacingM ?? 0.9);
    set('bom-down-support-spacing', inputs.bomAssumptions?.downConductorSupportSpacingM ?? 0.9);
    set('bom-down-route-allowance', inputs.bomAssumptions?.downConductorRouteAllowanceM ?? 2);
    const perimeterRing = document.getElementById('bom-include-perimeter-ring');
    perimeterRing.checked = inputs.bomAssumptions?.includePerimeterRing !== false;
    set('length', inputs.length); set('width', inputs.width);
    set('diameter', inputs.diameter);
    set('footprint-area', inputs.footprintArea);
    set('footprint-perimeter', inputs.footprintPerimeter);
    set('farthest-point-radius', inputs.farthestPointRadius);
    set('height', inputs.height);
    set('location', inputs.location); set('nc', inputs.tolerableFrequency);
    const restoredTerminalHeight = Number.isFinite(inputs.airTerminalHeight)
      ? inputs.airTerminalHeight
      : Number(inputs.height) + 5;
    set('air-terminal-height', restoredTerminalHeight);
    set('protected-height', inputs.protectedHeight); set('down-material', inputs.downConductorMaterial);
    if (Number.isFinite(inputs.systemKvLL)) { set('system-kv', inputs.systemKvLL); set('grounding', inputs.grounding); }
    if (inputs._formState && inputs._formState.ngMode) { ngModeSel.value = inputs._formState.ngMode; }
    if (ngModeSel.value === 'direct') set('ng', inputs.groundFlashDensity);
    else set('td', inputs.thunderstormDays);
    setUnitSystem(inputs._formState?.unitSystem || 'metric', { convertValues: true, update: false });
    syncStructureShape({ update: false });
    syncDesignStandard({ update: false });
    syncProtectionMethod({ update: false });
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
      [
        'length',
        'width',
        'diameter',
        'height',
        'footprint-perimeter',
        'farthest-point-radius',
        'terminal-edge-setback',
        'air-terminal-height',
        'protected-height',
        'bom-roof-support-spacing',
        'bom-down-support-spacing',
        'bom-down-route-allowance',
      ].forEach(id => {
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

      const footprintAreaInput = document.getElementById('footprint-area');
      const currentArea = parseFloat(footprintAreaInput.value);
      if (Number.isFinite(currentArea)) {
        const squareMeters = previous === 'imperial'
          ? currentArea / SQUARE_METERS_TO_SQUARE_FEET
          : currentArea;
        footprintAreaInput.value = formatInputNumber(next === 'imperial'
          ? squareMeters * SQUARE_METERS_TO_SQUARE_FEET
          : squareMeters);
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
    document.querySelectorAll('[data-lp-area-unit]').forEach(element => {
      element.textContent = unitSystem === 'imperial' ? 'ft²' : 'm²';
    });
    document.getElementById('lp-density-input-unit').textContent = unitSystem === 'imperial' ? '/mi²/yr' : '/km²/yr';
    document.getElementById('lp-kpi-ng-unit').textContent = unitSystem === 'imperial'
      ? 'ground strike points / mi² / year'
      : 'ground strike points / km² / year';
    document.getElementById('lp-unit-note').textContent = unitSystem === 'imperial'
      ? 'Enter dimensions in feet and direct strike-point density per mi².'
      : 'Enter dimensions in metres and direct strike-point density per km².';

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

  function measurementTextForDisplay(value) {
    const text = String(value ?? '');
    if (unitSystem !== 'imperial') return text;
    return text
      .replace(/203 mm\s*\(8 in\)/gi, '8 in')
      .replace(/(-?\d+(?:\.\d+)?)\s*m\b/g, (_, raw) => {
        const feet = Number(raw) * METERS_TO_FEET;
        const decimals = Math.abs(feet) >= 100 ? 1 : 2;
        return `${feet.toFixed(decimals)} ft`;
      });
  }

  function areaForDisplay(value) {
    return unitSystem === 'imperial' ? value * SQUARE_METERS_TO_SQUARE_FEET : value;
  }

  function areaFromDisplay(value) {
    return unitSystem === 'imperial' ? value / SQUARE_METERS_TO_SQUARE_FEET : value;
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
      designStandard: designStandardSel.value,
      autoTerminalLayout: autoLayoutInput.checked,
      structureShape: shapeSel.value,
      height: lengthFromDisplay(num('height')),
      location: document.getElementById('location').value,
      tolerableFrequency: num('nc'),
      airTerminalHeight: lengthFromDisplay(num('air-terminal-height')),
      protectedHeight: lengthFromDisplay(num('protected-height')),
      protectionMethod: methodSel.value,
      downConductorMaterial: document.getElementById('down-material').value,
    };
    if (methodSel.value === 'roof-array') {
      config.terminalRows = num('terminal-rows');
      config.terminalColumns = num('terminal-columns');
      config.terminalEdgeSetback = lengthFromDisplay(num('terminal-edge-setback'));
      config.bomAssumptions = {
        conductorWastePercent: num('bom-waste-percent'),
        roofSupportSpacingM: lengthFromDisplay(num('bom-roof-support-spacing')),
        downConductorSupportSpacingM: lengthFromDisplay(num('bom-down-support-spacing')),
        downConductorRouteAllowanceM: lengthFromDisplay(num('bom-down-route-allowance')),
        includePerimeterRing: document.getElementById('bom-include-perimeter-ring').checked,
      };
    }
    if (shapeSel.value === 'circle') {
      config.diameter = lengthFromDisplay(num('diameter'));
    } else if (shapeSel.value === 'custom') {
      config.footprintArea = areaFromDisplay(num('footprint-area'));
      config.footprintPerimeter = lengthFromDisplay(num('footprint-perimeter'));
      config.farthestPointRadius = lengthFromDisplay(num('farthest-point-radius'));
    } else {
      config.length = lengthFromDisplay(num('length'));
      config.width = lengthFromDisplay(num('width'));
    }
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
      liveAssessment = result;
      updateLiveVisual(result);
      setStudyStatus('editing');
    } catch (err) {
      liveAssessment = null;
      exportBomBtn.disabled = true;
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
    liveAssessment = r;
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
    updateCompliancePanel(r);
    updateBomPanel(r);
    if (r.inputs.autoTerminalLayout && r.terminalArray) {
      document.getElementById('terminal-rows').value = r.terminalArray.rows;
      document.getElementById('terminal-columns').value = r.terminalArray.columns;
      document.getElementById('terminal-edge-setback').value = formatInputNumber(
        lengthForDisplay(r.terminalArray.edgeSetbackM),
      );
      document.getElementById('terminal-count-preview').textContent = `${r.terminalArray.terminals.length} terminals · auto`;
    }
    drawProtectionPreview(r);
  }

  function updateCompliancePanel(r) {
    const status = document.getElementById('lp-compliance-status');
    const intro = document.getElementById('lp-compliance-intro');
    const content = document.getElementById('lp-compliance-content');
    const compliance = r.designCompliance;
    if (!status || !intro || !content || !compliance) return;
    if (compliance.status === 'screening-only') {
      status.className = 'lp-status-pill lp-status-pill--pending';
      status.textContent = 'Screening only';
      intro.textContent = 'IEC/IEEE mode does not claim NFPA 780 or UL 96A design conformance.';
      content.innerHTML = `
        <div class="lp-compliance-callout">
          <strong>Change the Design workflow to NFPA 780 + UL 96A design checks.</strong>
          <p>The final inspection and certification remain outside the study.</p>
        </div>`;
      return;
    }
    const pass = compliance.designReady;
    status.className = `lp-status-pill lp-status-pill--${pass ? 'safe' : 'danger'}`;
    status.textContent = compliance.label;
    intro.textContent = pass
      ? `All calculable checks pass for ${compliance.componentClass} components. Assumptions still require project confirmation.`
      : 'Resolve the failed checks below before treating the package as ready for detailed design.';
    const criteria = compliance.criteria.map(item => `
      <li class="${item.pass ? 'is-pass' : 'is-fail'}">
        <span aria-hidden="true">${item.pass ? '✓' : '!'}</span>
        <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(measurementTextForDisplay(item.detail))}</small></div>
      </li>`).join('');
    content.innerHTML = `
      <div class="lp-compliance-callout ${pass ? 'is-ready' : 'is-action'}">
        <strong>${pass ? 'Design criteria satisfied — inspection excluded' : 'Design changes required'}</strong>
        <p>${pass
          ? 'This status applies to the checked geometry and entered assumptions. It is not a UL Master Label or field certification.'
          : 'The BOM and report remain preliminary until every calculable item passes.'}</p>
      </div>
      <ul class="lp-compliance-checks">${criteria}</ul>
      <details class="lp-bom-notes" open>
        <summary>Required project assumptions (${compliance.assumptions.length})</summary>
        <ul>${compliance.assumptions.map(item => `<li>${escapeHtml(measurementTextForDisplay(item))}</li>`).join('')}</ul>
      </details>
      <details class="lp-bom-notes">
        <summary>Excluded from this study (${compliance.exclusions.length})</summary>
        <ul>${compliance.exclusions.map(item => `<li>${escapeHtml(measurementTextForDisplay(item))}</li>`).join('')}</ul>
      </details>`;
  }

  function updateBomPanel(r) {
    const panel = document.getElementById('lp-bom-panel');
    const content = document.getElementById('lp-bom-content');
    const status = document.getElementById('lp-bom-status');
    const intro = document.getElementById('lp-bom-intro');
    const bom = r.bom;
    if (!panel || !content || !status || !intro) return;

    exportBomBtn.disabled = !bom?.ready;
    if (!bom?.ready) {
      status.className = 'lp-status-pill lp-status-pill--pending';
      status.textContent = r.lpl.required ? 'Select roof array' : 'LPS not indicated';
      intro.textContent = bom?.warnings?.[0]
        || 'Choose a roof air-terminal array to generate a quantity-driven preliminary BOM.';
      content.innerHTML = '';
      return;
    }

    const unit = lengthUnit();
    const quantity = row => row.unit === 'm'
      ? `${lengthForDisplay(row.quantity).toFixed(1)} ${unit}`
      : `${Math.ceil(row.quantity)} ${row.unit}`;
    const pass = bom.procurementReady;
    const standardsWorkflow = r.designCompliance?.standard?.startsWith('NFPA');
    status.className = `lp-status-pill lp-status-pill--${pass ? 'safe' : 'danger'}`;
    status.textContent = pass
      ? standardsWorkflow ? 'Design checks pass' : 'Coverage passes'
      : standardsWorkflow && !r.designCompliance.designReady ? 'Design action required' : 'Coverage incomplete';
    intro.textContent = pass
      ? standardsWorkflow
        ? 'Calculated NFPA/UL design checks pass subject to the required assumptions; final product selection and field inspection are excluded.'
        : 'Live preliminary quantities for the entered terminal grid, roof network, down paths, and grounding interfaces.'
      : standardsWorkflow && !r.designCompliance.designReady
        ? 'Resolve the failed standards checks before using these quantities for procurement planning.'
        : 'This BOM follows the current geometry, but coverage must pass before quantities are considered for procurement planning.';

    const summary = bom.summary;
    const warningHtml = bom.warnings.length
      ? `<div class="lp-bom-notes lp-bom-notes--warning"><strong>Design checks</strong><ul>${bom.warnings.map(item => `<li>${escapeHtml(measurementTextForDisplay(item))}</li>`).join('')}</ul></div>`
      : '';
    const installationNotes = Array.isArray(bom.installationNotes) ? bom.installationNotes : [];
    const downPathCount = summary.downConductorCount ?? r.downConductorCount;
    content.innerHTML = `
      <div class="lp-bom-basis">
        <strong>Design basis</strong>
        <span>${escapeHtml(bom.designBasis || 'Interconnected roof air-termination network with distributed down paths.')}</span>
      </div>
      <div class="lp-bom-topology" aria-label="Lightning protection system topology">
        <div><span>1</span><strong>${summary.terminalCount} air terminals</strong><small>strike interception</small></div>
        <i aria-hidden="true">→</i>
        <div><span>2</span><strong>Common roof grid</strong><small>all terminals bonded</small></div>
        <i aria-hidden="true">→</i>
        <div><span>3</span><strong>${downPathCount} down paths</strong><small>corners, then perimeter</small></div>
        <i aria-hidden="true">→</i>
        <div><span>4</span><strong>Earth network</strong><small>ring / electrodes by study</small></div>
      </div>
      ${installationNotes.length ? `
        <div class="lp-bom-installation-notes">
          ${installationNotes.map((item, index) => `
            <div>
              <span aria-hidden="true">${index === 2 ? 'R' : index + 1}</span>
              <p>${escapeHtml(measurementTextForDisplay(item))}</p>
            </div>`).join('')}
        </div>` : ''}
      <div class="lp-bom-summary">
        <div><span>Point terminals</span><strong>${summary.terminalCount}</strong></div>
        <div><span>Roof conductor</span><strong>${lengthForDisplay(summary.gridConductorM + summary.perimeterConductorM).toFixed(1)} ${unit}</strong></div>
        <div><span>Down paths</span><strong>${downPathCount} · ${lengthForDisplay(summary.downConductorM).toFixed(1)} ${unit}</strong></div>
        <div><span>Total conductor</span><strong>${lengthForDisplay(summary.totalConductorM).toFixed(1)} ${unit}</strong></div>
      </div>
      <div class="lp-bom-table-wrap">
        <table class="lp-bom-table">
          <thead><tr><th>Category</th><th>Material / item</th><th>Specification</th><th>Quantity</th><th>Quantity basis</th></tr></thead>
          <tbody>${bom.rows.map(row => `
            <tr>
              <td>${escapeHtml(row.category)}</td>
              <td><strong>${escapeHtml(row.item)}</strong></td>
              <td>${escapeHtml(row.specification)}</td>
              <td class="lp-bom-quantity">${escapeHtml(quantity(row))}</td>
              <td>${escapeHtml(row.basis)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
      ${warningHtml}
      <details class="lp-bom-notes">
        <summary>Scope exclusions (${bom.exclusions.length})</summary>
        <ul>${bom.exclusions.map(item => `<li>${escapeHtml(measurementTextForDisplay(item))}</li>`).join('')}</ul>
      </details>`;
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
    const coverageWarning = r.lpl.required && !r.coverageComplete;
    const isArray = r.protectionMethod === 'roof-array' && r.terminalArray;
    const terminalCount = isArray ? r.terminalArray.terminals.length : 1;
    const downLayout = r.downConductorLayout;
    const conductorBasis = r.designCompliance?.standard?.startsWith('NFPA')
      ? `Use UL 96 Listed ${r.designCompliance.componentClass} ${r.downConductorMaterial} main lightning conductor and compatible listed fittings.`
      : `Minimum conductor area is ${formatConductorArea(r.downConductorMinAreaMm2)}.`;
    const downPlacement = downLayout
      ? `${downLayout.cornerCount ? `${downLayout.cornerCount} corner routes plus ${downLayout.intermediateCount} intermediate routes` : `${downLayout.count} uniformly distributed routes`}; achieved maximum spacing ${f(lengthForDisplay(downLayout.achievedMaxSpacingM), 1)} ${unit}.`
      : `Distribute routes around the ${f(lengthForDisplay(r.perimeterM), 0)} ${unit} perimeter.`;
    const bendRadius = lengthForDisplay(r.lightningConductorMinBendRadiusM || 0.2032);
    let arrester = '<strong>Surge protection not evaluated</strong><p>Add a system voltage when an incoming-line protection review is needed.</p>';
    if (r.arrester && !r.arrester.applicable) {
      arrester = '<strong>Low-voltage SPD review</strong><p>This voltage is at or below 1 kV. Select and coordinate an SPD using the low-voltage workflow; no medium-voltage arrester rating is reported.</p>';
    } else if (r.arrester) {
      arrester = `<strong>Coordinate the surge arrester</strong><p>Preliminary MCOV is ${f(r.arrester.mcov, 1)} kV; the nearest built-in duty-cycle rating is ${r.arrester.ratedStandard != null ? `${f(r.arrester.ratedStandard, 0)} kV` : 'above the table'}. Verify TOV duty and insulation coordination.</p>`;
    }

    document.getElementById('lp-guidance-list').innerHTML = `
      <article class="lp-guidance-item ${r.lpl.required ? 'lp-guidance-item--warning' : 'lp-guidance-item--safe'}">
        <span aria-hidden="true">1</span>
        <div><strong>${r.lpl.required ? `${levelText} air termination` : 'No structural LPS indicated'}</strong><p>${r.lpl.required ? `A ${f(lengthForDisplay(r.rollingSphereRadius), 0)} ${unit} rolling sphere represents strokes at or above ${f(r.minStrikeCurrentKa, 0)} kA.` : 'Expected direct strikes are below the entered tolerable frequency. No LPL geometry is generated by this screening.'}</p></div>
      </article>
      <article class="lp-guidance-item ${coverageWarning ? 'lp-guidance-item--warning' : 'lp-guidance-item--safe'}">
        <span aria-hidden="true">2</span>
        <div><strong>${!r.lpl.required ? 'Coverage geometry not generated' : isArray ? coverageWarning ? `${terminalCount}-terminal array leaves exposed roof points` : `${terminalCount}-terminal array covers the reference plane` : coverageWarning ? 'Centered mast does not reach the full footprint' : `${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit} coverage reaches the footprint`}</strong><p>${!r.lpl.required ? 'Enter a more conservative tolerable frequency if an optional reference LPS is desired.' : !(r.mastProtectiveRadiusM > 0) ? 'The protected surface is at or above the entered air-terminal tip height. Increase terminal height.' : isArray ? `At the ${f(lengthForDisplay(r.referencePlaneHeightM), 1)} ${unit} reference plane, each terminal reaches ${f(lengthForDisplay(r.terminalProtectiveRadiusM), 1)} ${unit}; the worst point is ${f(lengthForDisplay(r.requiredCoverageRadiusM), 1)} ${unit} from its nearest terminal, leaving ${r.coverageComplete ? '+' : '−'}${f(lengthForDisplay(Math.abs(r.coverageMarginM)), 1)} ${unit} margin.` : `At ${f(lengthForDisplay(r.inputs.protectedHeight), 1)} ${unit} elevation, the rolling-sphere coverage radius is ${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit}; the farthest protected point is ${f(lengthForDisplay(r.requiredCoverageRadiusM), 1)} ${unit} from the assumed centered mast.`}</p></div>
      </article>
      <article class="lp-guidance-item">
        <span aria-hidden="true">3</span>
        <div><strong>${r.lpl.required ? `${r.downConductorCount} independent downconductors` : 'No down-conductor layout generated'}</strong><p>${r.lpl.required ? `The air terminals share one roof grid; there is not one downconductor per terminal. ${downPlacement} ${conductorBasis} Keep routes short and direct; the UL-style bend reference is ${f(bendRadius, unit === 'ft' ? 2 : 3)} ${unit} (8 in) minimum radius with no turn sharper than 90°.` : 'Bonding and surge protection still require project-specific review.'}</p></div>
      </article>
      <article class="lp-guidance-item">
        <span aria-hidden="true">4</span>
        <div>${arrester}</div>
      </article>`;
  }

  function drawProtectionPreview(r) {
    if (r.protectionMethod === 'roof-array' && r.terminalArray) {
      drawRoofArrayPreview(r);
      return;
    }
    const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const unit = lengthUnit();
    const areaLabel = areaUnit();
    const shape = r.footprint?.shape || 'rectangle';
    const shapeLabel = r.footprint?.label || 'Rectangular';
    const hasLpsGeometry = r.lpl.required
      && Number.isFinite(r.rollingSphereRadius)
      && Number.isFinite(r.mastProtectiveRadiusM);
    const requiredRadius = Math.max(r.requiredCoverageRadiusM || 0, 0.1);
    const footprintSpanX = Math.max(r.footprint?.spanXM || requiredRadius * 2, 0.1);
    const footprintSpanY = Math.max(r.footprint?.spanYM || requiredRadius * 2, 0.1);
    const planCenterX = 196;
    const planCenterY = 244;
    const planWorldRadius = Math.max(
      hasLpsGeometry ? r.mastProtectiveRadiusM : 0,
      requiredRadius,
      1,
    ) * 1.25;
    const planScale = Math.min(142 / planWorldRadius, 3.5);
    const footprintHalfX = footprintSpanX * planScale / 2;
    const footprintHalfY = footprintSpanY * planScale / 2;
    const coverageRadiusPx = hasLpsGeometry ? r.mastProtectiveRadiusM * planScale : 0;

    let footprintSvg;
    let requiredEndX;
    let requiredEndY;
    if (shape === 'circle') {
      footprintSvg = `<circle cx="${planCenterX}" cy="${planCenterY}" r="${requiredRadius * planScale}" class="lp-svg-footprint"></circle>`;
      requiredEndX = planCenterX + requiredRadius * planScale;
      requiredEndY = planCenterY;
    } else if (shape === 'custom') {
      const customPoints = [
        [-0.92, -0.16], [-0.55, -0.82], [0.18, -0.98], [0.86, -0.50],
        [0.78, 0.48], [0.08, 0.92], [-0.72, 0.62],
      ].map(([x, y]) => `${planCenterX + x * requiredRadius * planScale},${planCenterY + y * requiredRadius * planScale}`).join(' ');
      footprintSvg = `<polygon points="${customPoints}" class="lp-svg-footprint"></polygon>`;
      requiredEndX = planCenterX + 0.8 * requiredRadius * planScale;
      requiredEndY = planCenterY - 0.6 * requiredRadius * planScale;
    } else {
      footprintSvg = `<rect x="${planCenterX - footprintHalfX}" y="${planCenterY - footprintHalfY}" width="${footprintHalfX * 2}" height="${footprintHalfY * 2}" rx="5" class="lp-svg-footprint"></rect>`;
      requiredEndX = planCenterX + footprintHalfX;
      requiredEndY = planCenterY - footprintHalfY;
    }

    const planCoverageSvg = hasLpsGeometry ? `
      <circle cx="${planCenterX}" cy="${planCenterY}" r="${coverageRadiusPx}" class="lp-svg-protection ${r.coverageComplete ? 'lp-svg-protection--pass' : 'lp-svg-protection--short'}"></circle>
      <line x1="${planCenterX}" y1="${planCenterY}" x2="${planCenterX + coverageRadiusPx}" y2="${planCenterY}" class="lp-svg-radius-line"></line>
      <text x="${planCenterX + coverageRadiusPx / 2}" y="${planCenterY - 8}" class="lp-svg-dimension-text">rp ${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit}</text>` : '';

    const sphereRadius = hasLpsGeometry ? r.rollingSphereRadius : 1;
    const effectiveTipHeight = Math.min(r.inputs.airTerminalHeight, sphereRadius);
    const sphereCenterOffset = hasLpsGeometry
      ? Math.sqrt(Math.max(0, effectiveTipHeight * (2 * sphereRadius - effectiveTipHeight)))
      : 0;
    const elevationCenterX = 572;
    const elevationGroundY = 362;
    const elevationMaxX = Math.max(
      sphereCenterOffset,
      requiredRadius,
      footprintSpanX / 2,
      hasLpsGeometry ? r.mastProtectiveRadiusM : 0,
      1,
    );
    const elevationMaxZ = Math.max(r.inputs.airTerminalHeight, r.inputs.height, r.inputs.protectedHeight, 1);
    const elevationScale = Math.min(145 / (elevationMaxX * 1.08), 245 / (elevationMaxZ * 1.08), 4);
    const elevationX = value => elevationCenterX + value * elevationScale;
    const elevationY = value => elevationGroundY - value * elevationScale;
    const structureWidthPx = Math.min(footprintSpanX * elevationScale, 270);
    const structureHeightPx = r.inputs.height * elevationScale;
    const protectedY = elevationY(r.inputs.protectedHeight);
    const tipY = elevationY(r.inputs.airTerminalHeight);

    let envelopeFillSvg = '';
    let envelopeArcSvg = '';
    let coverageDimensionSvg = '';
    if (hasLpsGeometry) {
      const leftArcPoints = [];
      const rightArcPoints = [];
      const samples = 28;
      for (let index = 0; index <= samples; index += 1) {
        const z = effectiveTipHeight * index / samples;
        const boundary = sphereCenterOffset - Math.sqrt(Math.max(0, 2 * sphereRadius * z - z * z));
        leftArcPoints.push([elevationX(-boundary), elevationY(z)]);
        rightArcPoints.push([elevationX(boundary), elevationY(z)]);
      }
      const toPath = points => points
        .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
        .join(' ');
      const protectionPath = toPath([...leftArcPoints, ...rightArcPoints.slice().reverse()]);
      envelopeFillSvg = `
        <path d="${protectionPath} Z" class="lp-svg-envelope-fill ${r.coverageComplete ? 'lp-svg-envelope-fill--pass' : 'lp-svg-envelope-fill--short'}"></path>`;
      envelopeArcSvg = `
        <path d="${toPath(leftArcPoints)}" class="lp-svg-envelope"></path>
        <path d="${toPath(rightArcPoints)}" class="lp-svg-envelope"></path>`;
      coverageDimensionSvg = `
        <line x1="${elevationCenterX}" y1="${protectedY}" x2="${elevationX(r.mastProtectiveRadiusM)}" y2="${protectedY}" class="lp-svg-radius-line"></line>
        <circle cx="${elevationX(r.mastProtectiveRadiusM)}" cy="${protectedY}" r="4" class="lp-svg-coverage-point"></circle>
        <text x="${(elevationCenterX + elevationX(r.mastProtectiveRadiusM)) / 2}" y="${protectedY - 8}" class="lp-svg-dimension-text">rp ${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit}</text>`;
    }

    const coverageText = !r.lpl.required
      ? 'No LPL geometry'
      : r.coverageComplete
        ? `Coverage margin +${f(lengthForDisplay(r.coverageMarginM), 1)} ${unit}`
        : `Coverage shortfall ${f(lengthForDisplay(Math.abs(r.coverageMarginM)), 1)} ${unit}`;
    const footprintName = shape === 'custom' ? shapeLabel : `${shapeLabel} footprint`;
    const description = `${footprintName}, ${f(areaForDisplay(r.footprintAreaM2), 0)} ${areaLabel} plan area, ${f(lengthForDisplay(r.inputs.height), 1)} ${unit} high. ${r.lpl.required ? `The scaled plan and elevation views compare LPL ${r.lpl.level} rolling-sphere coverage with the farthest protected point.` : 'No LPL geometry is generated because expected strikes are below the tolerable frequency.'}`;

    previewSvg.innerHTML = `
      <title id="lp-preview-title">Scaled rolling-sphere coverage</title>
      <desc id="lp-preview-desc">${escapeHtml(description)}</desc>
      <defs>
        <marker id="lp-arrow-start" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M7,0 L0,3.5 L7,7" fill="none" stroke="currentColor"></path></marker>
        <marker id="lp-arrow-end" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="currentColor"></path></marker>
        <pattern id="lp-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" class="lp-svg-grid"></path></pattern>
        <clipPath id="lp-elevation-clip"><rect x="396" y="68" width="352" height="296" rx="12"></rect></clipPath>
      </defs>
      <rect x="10" y="42" width="362" height="366" rx="16" class="lp-svg-panel"></rect>
      <rect x="388" y="42" width="362" height="366" rx="16" class="lp-svg-panel"></rect>
      <text x="28" y="70" class="lp-svg-panel-title">PLAN · ${escapeHtml(shapeLabel.toUpperCase())}</text>
      <text x="406" y="70" class="lp-svg-panel-title">ELEVATION · ROLLING-SPHERE ENVELOPE</text>
      <text x="28" y="91" class="lp-svg-sub-label">Centered mast assumption · footprint and coverage radius are to scale</text>
      <text x="406" y="91" class="lp-svg-sub-label">Radius-R boundary arcs · equal horizontal / vertical scale · R = ${hasLpsGeometry ? `${f(lengthForDisplay(sphereRadius), 0)} ${unit}` : 'not generated'}</text>

      <rect x="18" y="102" width="346" height="294" fill="url(#lp-grid)" opacity="0.55"></rect>
      ${footprintSvg}
      ${planCoverageSvg}
      <line x1="${planCenterX}" y1="${planCenterY}" x2="${requiredEndX}" y2="${requiredEndY}" class="lp-svg-target-line"></line>
      <circle cx="${requiredEndX}" cy="${requiredEndY}" r="4" class="lp-svg-target-point"></circle>
      <circle cx="${planCenterX}" cy="${planCenterY}" r="6" class="lp-svg-mast-tip"></circle>
      <text x="28" y="386" class="lp-svg-label">Farthest point ${f(lengthForDisplay(requiredRadius), 1)} ${unit} · footprint ${f(areaForDisplay(r.footprintAreaM2), 0)} ${areaLabel}</text>

      <rect x="396" y="102" width="346" height="294" fill="url(#lp-grid)" opacity="0.55"></rect>
      ${envelopeFillSvg}
      <line x1="406" y1="${elevationGroundY}" x2="734" y2="${elevationGroundY}" class="lp-svg-axis"></line>
      <rect x="${elevationCenterX - structureWidthPx / 2}" y="${elevationY(r.inputs.height)}" width="${structureWidthPx}" height="${structureHeightPx}" rx="${shape === 'circle' ? 18 : 4}" class="lp-svg-structure-front lp-svg-elevation-structure"></rect>
      <line x1="${elevationCenterX}" y1="${elevationGroundY}" x2="${elevationCenterX}" y2="${tipY}" class="lp-svg-mast"></line>
      <circle cx="${elevationCenterX}" cy="${tipY}" r="6" class="lp-svg-mast-tip"></circle>
      ${envelopeArcSvg}
      ${coverageDimensionSvg}
      <line x1="412" y1="${protectedY}" x2="732" y2="${protectedY}" class="lp-svg-protected-plane"></line>
      <text x="412" y="${protectedY - 7}" class="lp-svg-sub-label">protected plane ${f(lengthForDisplay(r.inputs.protectedHeight), 1)} ${unit}</text>
      <text x="406" y="386" class="lp-svg-label">${escapeHtml(coverageText)}</text>
      <text x="28" y="431" class="lp-svg-sub-label">${shape === 'custom' ? 'Custom outline is schematic; area, perimeter, and farthest-point values drive the calculation.' : `Collection area ${f(areaForDisplay(r.collectionAreaM2), 0)} ${areaLabel} is reported separately; this view prioritizes coverage.`}</text>
      <text x="406" y="431" class="lp-svg-sub-label">${r.lpl.required ? effectiveTipHeight < r.inputs.airTerminalHeight ? 'Envelope contact height is capped at R; mast height above R does not expand this model.' : 'Cyan arcs trace the radius-R envelope; full sphere positions are omitted for clarity.' : 'Expected direct strikes are below the entered tolerable frequency.'}</text>`;
  }

  function drawRoofArrayPreview(r) {
    const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const unit = lengthUnit();
    const areaLabel = areaUnit();
    const array = r.terminalArray;
    const terminals = array.terminals;
    const hasLpsGeometry = r.lpl.required
      && Number.isFinite(r.rollingSphereRadius)
      && Number.isFinite(r.terminalProtectiveRadiusM);
    const footprintSpanX = r.footprint.spanXM;
    const footprintSpanY = r.footprint.spanYM;
    const planCenterX = 196;
    const planCenterY = 244;
    const planScale = Math.min(
      142 / Math.max(footprintSpanX / 2, 0.1),
      116 / Math.max(footprintSpanY / 2, 0.1),
      6,
    );
    const footprintHalfX = footprintSpanX * planScale / 2;
    const footprintHalfY = footprintSpanY * planScale / 2;
    const planX = value => planCenterX + value * planScale;
    const planY = value => planCenterY - value * planScale;
    const coverageRadiusPx = hasLpsGeometry ? r.terminalProtectiveRadiusM * planScale : 0;
    const isCircle = r.footprint.shape === 'circle';
    const footprintShape = isCircle
      ? `<circle cx="${planCenterX}" cy="${planCenterY}" r="${footprintHalfX}" class="lp-svg-footprint"></circle>`
      : `<rect x="${planCenterX - footprintHalfX}" y="${planCenterY - footprintHalfY}" width="${footprintHalfX * 2}" height="${footprintHalfY * 2}" rx="5" class="lp-svg-footprint"></rect>`;
    const footprintOutline = isCircle
      ? `<circle cx="${planCenterX}" cy="${planCenterY}" r="${footprintHalfX}" class="lp-svg-footprint-outline"></circle>`
      : `<rect x="${planCenterX - footprintHalfX}" y="${planCenterY - footprintHalfY}" width="${footprintHalfX * 2}" height="${footprintHalfY * 2}" rx="5" class="lp-svg-footprint-outline"></rect>`;
    const footprintClip = isCircle
      ? `<circle cx="${planCenterX}" cy="${planCenterY}" r="${footprintHalfX}"></circle>`
      : `<rect x="${planCenterX - footprintHalfX}" y="${planCenterY - footprintHalfY}" width="${footprintHalfX * 2}" height="${footprintHalfY * 2}" rx="5"></rect>`;
    const coverageClass = r.coverageComplete
      ? 'lp-svg-array-coverage lp-svg-array-coverage--pass'
      : 'lp-svg-array-coverage lp-svg-array-coverage--short';
    const planCoverage = hasLpsGeometry ? terminals.map(terminal => `
      <circle cx="${planX(terminal.xM)}" cy="${planY(terminal.yM)}" r="${coverageRadiusPx}" class="${coverageClass}"></circle>`).join('') : '';
    const terminalMarkers = terminals.map((terminal, index) => `
      <g>
        <circle cx="${planX(terminal.xM)}" cy="${planY(terminal.yM)}" r="5" class="lp-svg-array-terminal"></circle>
        ${terminals.length <= 16 ? `<text x="${planX(terminal.xM) + 7}" y="${planY(terminal.yM) - 7}" class="lp-svg-terminal-number">${index + 1}</text>` : ''}
      </g>`).join('');
    const terminalMap = new Map(
      terminals.map(terminal => [`${terminal.row}:${terminal.column}`, terminal]),
    );
    const roofGridSegments = [];
    terminals.forEach(terminal => {
      const right = terminalMap.get(`${terminal.row}:${terminal.column + 1}`);
      const below = terminalMap.get(`${terminal.row + 1}:${terminal.column}`);
      if (right) roofGridSegments.push([terminal, right]);
      if (below) roofGridSegments.push([terminal, below]);
    });
    const roofGridSvg = roofGridSegments.map(segment => `
      <line x1="${planX(segment[0].xM)}" y1="${planY(segment[0].yM)}" x2="${planX(segment[1].xM)}" y2="${planY(segment[1].yM)}" class="lp-svg-roof-grid"></line>`).join('');
    const includePerimeterRing = r.bom?.assumptions?.includePerimeterRing !== false;
    const roofRingSvg = includePerimeterRing
      ? isCircle
        ? `<circle cx="${planCenterX}" cy="${planCenterY}" r="${footprintHalfX}" class="lp-svg-roof-ring"></circle>`
        : `<rect x="${planCenterX - footprintHalfX}" y="${planCenterY - footprintHalfY}" width="${footprintHalfX * 2}" height="${footprintHalfY * 2}" rx="5" class="lp-svg-roof-ring"></rect>`
      : '';
    const ringConnectorSvg = includePerimeterRing ? terminals.flatMap(terminal => {
      const connectors = [];
      if (isCircle) {
        const magnitude = Math.hypot(terminal.xM, terminal.yM);
        if (magnitude > 1e-9 && (
          terminal.row === 0
          || terminal.row === array.rows - 1
          || terminal.column === 0
          || terminal.column === array.columns - 1
        )) {
          const radius = footprintSpanX / 2;
          connectors.push({
            xM: terminal.xM * radius / magnitude,
            yM: terminal.yM * radius / magnitude,
          });
        }
      } else {
        if (terminal.row === 0) connectors.push({ xM: terminal.xM, yM: footprintSpanY / 2 });
        if (terminal.row === array.rows - 1) connectors.push({ xM: terminal.xM, yM: -footprintSpanY / 2 });
        if (terminal.column === 0) connectors.push({ xM: -footprintSpanX / 2, yM: terminal.yM });
        if (terminal.column === array.columns - 1) connectors.push({ xM: footprintSpanX / 2, yM: terminal.yM });
      }
      return connectors.map(connector => `
        <line x1="${planX(terminal.xM)}" y1="${planY(terminal.yM)}" x2="${planX(connector.xM)}" y2="${planY(connector.yM)}" class="lp-svg-grid-connector"></line>`);
    }).join('') : '';
    const downPoints = r.downConductorLayout?.points || [];
    const downConductorMarkers = downPoints.map(point => point.isCorner
      ? `<rect x="${planX(point.xM) - 4.5}" y="${planY(point.yM) - 4.5}" width="9" height="9" transform="rotate(45 ${planX(point.xM)} ${planY(point.yM)})" class="lp-svg-down-point lp-svg-down-point--corner"></rect>`
      : `<circle cx="${planX(point.xM)}" cy="${planY(point.yM)}" r="4" class="lp-svg-down-point"></circle>`).join('');

    const critical = array.coverage?.criticalPoint || { xM: 0, yM: 0 };
    const nearest = array.coverage?.nearestTerminal || terminals[0];
    const criticalSvg = hasLpsGeometry && nearest ? `
      <line x1="${planX(nearest.xM)}" y1="${planY(nearest.yM)}" x2="${planX(critical.xM)}" y2="${planY(critical.yM)}" class="lp-svg-target-line"></line>
      <circle cx="${planX(critical.xM)}" cy="${planY(critical.yM)}" r="5" class="${r.coverageComplete ? 'lp-svg-coverage-point' : 'lp-svg-target-point'}"></circle>` : '';

    const sphereRadius = hasLpsGeometry ? r.rollingSphereRadius : 1;
    const referenceHeight = r.referencePlaneHeightM;
    const effectiveRise = hasLpsGeometry
      ? Math.min(Math.max(r.inputs.airTerminalHeight - referenceHeight, 0), sphereRadius)
      : 0;
    const representativeRow = Math.floor((array.rows - 1) / 2);
    const sectionTerminals = terminals.filter(terminal => terminal.row === representativeRow);
    const elevationCenterX = 572;
    const elevationGroundY = 362;
    const outerTerminalX = sectionTerminals.reduce(
      (maximum, terminal) => Math.max(maximum, Math.abs(terminal.xM)),
      0,
    );
    const elevationMaxX = Math.max(
      footprintSpanX / 2,
      outerTerminalX + (hasLpsGeometry ? r.terminalProtectiveRadiusM : 0),
      1,
    );
    const elevationMaxZ = Math.max(r.inputs.airTerminalHeight, referenceHeight, r.inputs.height, 1);
    const elevationScale = Math.min(145 / (elevationMaxX * 1.06), 242 / (elevationMaxZ * 1.06), 6);
    const elevationX = value => elevationCenterX + value * elevationScale;
    const elevationY = value => elevationGroundY - value * elevationScale;
    const structureWidthPx = footprintSpanX * elevationScale;
    const structureHeightPx = r.inputs.height * elevationScale;
    const roofY = elevationY(r.inputs.height);
    const tipY = elevationY(r.inputs.airTerminalHeight);
    const referenceY = elevationY(referenceHeight);

    let elevationArcs = '';
    if (hasLpsGeometry && effectiveRise > 0) {
      const samples = 28;
      const toPath = points => points
        .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
        .join(' ');
      elevationArcs = sectionTerminals.map(terminal => {
        const left = [];
        const right = [];
        for (let index = 0; index <= samples; index += 1) {
          const localZ = effectiveRise * index / samples;
          const boundary = r.terminalProtectiveRadiusM
            - Math.sqrt(Math.max(0, 2 * sphereRadius * localZ - localZ * localZ));
          left.push([elevationX(terminal.xM - boundary), elevationY(referenceHeight + localZ)]);
          right.push([elevationX(terminal.xM + boundary), elevationY(referenceHeight + localZ)]);
        }
        return `
          <path d="${toPath(left)}" class="lp-svg-envelope"></path>
          <path d="${toPath(right)}" class="lp-svg-envelope"></path>`;
      }).join('');
    }
    const elevationTerminals = sectionTerminals.map(terminal => `
      <line x1="${elevationX(terminal.xM)}" y1="${roofY}" x2="${elevationX(terminal.xM)}" y2="${tipY}" class="lp-svg-mast"></line>
      <circle cx="${elevationX(terminal.xM)}" cy="${tipY}" r="5" class="lp-svg-mast-tip"></circle>`).join('');
    const downLeadInset = Math.min(10, Math.max(4, structureWidthPx * 0.025));
    const downLeadSvg = r.lpl.required ? `
      <path d="M ${elevationCenterX - structureWidthPx / 2 + 16} ${roofY} Q ${elevationCenterX - structureWidthPx / 2 + downLeadInset} ${roofY} ${elevationCenterX - structureWidthPx / 2 + downLeadInset} ${roofY + 12} L ${elevationCenterX - structureWidthPx / 2 + downLeadInset} ${elevationGroundY}" class="lp-svg-down-lead"></path>
      <path d="M ${elevationCenterX + structureWidthPx / 2 - 16} ${roofY} Q ${elevationCenterX + structureWidthPx / 2 - downLeadInset} ${roofY} ${elevationCenterX + structureWidthPx / 2 - downLeadInset} ${roofY + 12} L ${elevationCenterX + structureWidthPx / 2 - downLeadInset} ${elevationGroundY}" class="lp-svg-down-lead"></path>` : '';

    const coverageText = !r.lpl.required
      ? 'No LPL geometry'
      : r.coverageComplete
        ? `Complete roof coverage · margin +${f(lengthForDisplay(r.coverageMarginM), 1)} ${unit}`
        : `Exposed roof point · shortfall ${f(lengthForDisplay(Math.abs(r.coverageMarginM)), 1)} ${unit}`;
    const description = `${terminals.length} roof air terminals in a regular ${array.columns} by ${array.rows} grid on a ${r.footprint.label.toLowerCase()} footprint. ${r.lpl.required ? `Each terminal has ${f(lengthForDisplay(r.terminalProtectiveRadiusM), 1)} ${unit} radius-R coverage at the ${f(lengthForDisplay(referenceHeight), 1)} ${unit} reference plane.` : 'No LPL geometry is generated because expected strikes are below the tolerable frequency.'}`;

    previewSvg.innerHTML = `
      <title id="lp-preview-title">Multi-terminal roof protection coverage</title>
      <desc id="lp-preview-desc">${escapeHtml(description)}</desc>
      <defs>
        <pattern id="lp-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" class="lp-svg-grid"></path></pattern>
        <clipPath id="lp-array-footprint-clip">${footprintClip}</clipPath>
        <clipPath id="lp-array-elevation-clip"><rect x="396" y="102" width="346" height="294" rx="12"></rect></clipPath>
      </defs>
      <rect x="10" y="42" width="362" height="366" rx="16" class="lp-svg-panel"></rect>
      <rect x="388" y="42" width="362" height="366" rx="16" class="lp-svg-panel"></rect>
      <text x="28" y="70" class="lp-svg-panel-title">PLAN · ${array.columns} × ${array.rows} ARRAY · ${r.downConductorCount} DOWN PATHS</text>
      <text x="406" y="70" class="lp-svg-panel-title">ELEVATION · ARRAY ENVELOPE</text>
      <text x="28" y="91" class="lp-svg-sub-label">${terminals.length} terminals · common tip ${f(lengthForDisplay(r.inputs.airTerminalHeight), 1)} ${unit} · setback ${f(lengthForDisplay(array.edgeSetbackM), 1)} ${unit}</text>
      <text x="406" y="91" class="lp-svg-sub-label">Representative row · equal scales · R = ${hasLpsGeometry ? `${f(lengthForDisplay(sphereRadius), 0)} ${unit}` : 'not generated'}</text>

      <rect x="18" y="102" width="346" height="294" fill="url(#lp-grid)" opacity="0.55"></rect>
      ${footprintShape}
      <g clip-path="url(#lp-array-footprint-clip)">${planCoverage}</g>
      ${roofGridSvg}
      ${ringConnectorSvg}
      ${roofRingSvg}
      ${footprintOutline}
      ${downConductorMarkers}
      ${terminalMarkers}
      ${criticalSvg}
      <text x="28" y="386" class="lp-svg-label">${hasLpsGeometry ? `Worst point ${f(lengthForDisplay(r.requiredCoverageRadiusM), 1)} ${unit} to nearest terminal · rp ${f(lengthForDisplay(r.terminalProtectiveRadiusM), 1)} ${unit}` : 'Coverage geometry not generated'}</text>

      <rect x="396" y="102" width="346" height="294" fill="url(#lp-grid)" opacity="0.55"></rect>
      <g clip-path="url(#lp-array-elevation-clip)">
        <rect x="${elevationCenterX - structureWidthPx / 2}" y="${roofY}" width="${structureWidthPx}" height="${structureHeightPx}" rx="${isCircle ? 18 : 4}" class="lp-svg-structure-front lp-svg-elevation-structure"></rect>
        <line x1="406" y1="${elevationGroundY}" x2="734" y2="${elevationGroundY}" class="lp-svg-axis"></line>
        ${downLeadSvg}
        ${elevationTerminals}
        ${elevationArcs}
      </g>
      <line x1="412" y1="${referenceY}" x2="732" y2="${referenceY}" class="lp-svg-protected-plane"></line>
      <text x="416" y="${referenceY + 17}" class="lp-svg-sub-label">roof / equipment plane ${f(lengthForDisplay(referenceHeight), 1)} ${unit}</text>
      <text x="406" y="386" class="lp-svg-label">${escapeHtml(coverageText)}</text>
      <text x="28" y="431" class="lp-svg-sub-label">Blue = roof grid · diamonds = corners · dots = intermediate down paths.</text>
      <text x="406" y="431" class="lp-svg-sub-label">Radius-R arcs · rounded down leads shown at visible walls.</text>`;
  }

  function drawProtectionPreviewPerspective(r) {
    const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const unit = lengthUnit();
    const areaLabel = areaUnit();
    const hasLpsGeometry = r.lpl.required
      && Number.isFinite(r.rollingSphereRadius)
      && Number.isFinite(r.mastProtectiveRadiusM);
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
    const heightScale = structureHeight / Math.max(r.inputs.height, 1);
    const terminalExtension = Math.max(10, Math.min(110, (r.inputs.airTerminalHeight - r.inputs.height) * heightScale));
    const mastTipY = Math.max(50, roofY - terminalExtension);
    const coverageHalf = hasLpsGeometry
      ? Math.max(22, Math.min(205, (r.mastProtectiveRadiusM / maxPlan) * 390))
      : 0;
    const collectionExpansion = Math.max(55, Math.min(150, (3 * r.inputs.height / maxPlan) * 105));
    const collectionRx = frontWidth / 2 + depthX * 0.7 + collectionExpansion;
    const collectionRy = 55 + collectionExpansion * 0.42;
    const protectedLeft = Math.max(70, mastX - coverageHalf);
    const protectedRight = Math.min(690, mastX + coverageHalf);
    const equipmentHeight = Math.max(14, Math.min(64, (r.inputs.protectedHeight / Math.max(r.inputs.height, 1)) * structureHeight));
    const equipmentX = Math.min(protectedRight - 28, frontRight + depthX + 42);
    const windows = Array.from({ length: 6 }, (_, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = frontLeft + 24 + column * ((frontWidth - 64) / 2);
      const y = roofY + 34 + row * ((structureHeight - 70) / 2);
      return `<rect x="${x}" y="${y}" width="${Math.max(28, (frontWidth - 92) / 3)}" height="32" rx="3" class="lp-svg-window"></rect>`;
    }).join('');
    const lpsGeometry = hasLpsGeometry ? `
      <path d="M ${protectedLeft} ${groundY + 8} Q ${mastX} ${mastTipY - 24} ${protectedRight} ${groundY + 8} Z" class="lp-svg-protection"></path>
      <path d="M ${Math.max(32, mastX - r.rollingSphereRadius * 4.7)} ${groundY + 4} Q ${mastX} ${mastTipY - 65} ${Math.min(728, mastX + r.rollingSphereRadius * 4.7)} ${groundY + 4}" class="lp-svg-sphere"></path>
      <line x1="${mastX}" y1="${roofY - depthY * 0.4}" x2="${mastX}" y2="${mastTipY}" class="lp-svg-mast"></line>
      <circle cx="${mastX}" cy="${mastTipY}" r="6" class="lp-svg-mast-tip"></circle>
      <path d="M ${mastX} ${mastTipY} L ${mastX} ${roofY - depthY * 0.4} L ${frontRight - 8} ${roofY + 8} L ${frontRight - 8} ${groundY}" class="lp-svg-conductor"></path>
      <ellipse cx="380" cy="${groundY + 31}" rx="${frontWidth / 2 + depthX + 15}" ry="46" class="lp-svg-ground-ring"></ellipse>
      <circle cx="${frontRight - 8}" cy="${groundY + 12}" r="6" class="lp-svg-ground-point"></circle>` : '';
    const lpsLabels = hasLpsGeometry ? `
      <g transform="translate(570 72)">
        <rect width="158" height="70" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="22" class="lp-svg-label">Rolling sphere</text>
        <text x="12" y="41" class="lp-svg-sub-label">R = ${f(lengthForDisplay(r.rollingSphereRadius), 0)} ${unit} · LPL ${r.lpl.level}</text>
        <text x="12" y="57" class="lp-svg-sub-label">captures ≥ ${f(r.minStrikeCurrentKa, 0)} kA</text>
      </g>
      <g transform="translate(574 214)">
        <rect width="154" height="84" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="22" class="lp-svg-label">Protected equipment</text>
        <text x="12" y="41" class="lp-svg-sub-label">tip height ${f(lengthForDisplay(r.inputs.airTerminalHeight), 1)} ${unit}</text>
        <text x="12" y="58" class="lp-svg-sub-label">equipment ${f(lengthForDisplay(r.inputs.protectedHeight), 1)} ${unit}</text>
        <text x="12" y="75" class="lp-svg-sub-label">coverage ${f(lengthForDisplay(r.mastProtectiveRadiusM), 1)} ${unit}</text>
      </g>
      <g transform="translate(38 326)">
        <rect width="158" height="54" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="22" class="lp-svg-label">${r.downConductorCount} down-conductors</text>
        <text x="12" y="40" class="lp-svg-sub-label">${escapeHtml(r.downConductorMaterial)} · ${formatConductorArea(r.downConductorMinAreaMm2)} min</text>
      </g>` : `
      <g transform="translate(548 82)">
        <rect width="180" height="58" rx="10" class="lp-svg-label-box"></rect>
        <text x="12" y="24" class="lp-svg-label">No structural LPS indicated</text>
        <text x="12" y="43" class="lp-svg-sub-label">no LPL geometry generated</text>
      </g>`;

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
      ${lpsGeometry}

      <path d="M 112 54 l 18 28 -12 0 11 31 -29 -39 13 0 z" class="lp-svg-strike"></path>
      <path d="M 121 111 Q 170 148 ${mastX - 8} ${mastTipY + 5}" class="lp-svg-strike" style="stroke-width:2;stroke-dasharray:5 5"></path>

      <polygon points="${frontLeft},${roofY} ${frontRight},${roofY} ${frontRight + depthX},${roofY - depthY} ${frontLeft + depthX},${roofY - depthY}" class="lp-svg-structure-roof"></polygon>
      <rect x="${frontLeft}" y="${roofY}" width="${frontWidth}" height="${structureHeight}" class="lp-svg-structure-front"></rect>
      <polygon points="${frontRight},${roofY} ${frontRight + depthX},${roofY - depthY} ${frontRight + depthX},${groundY - depthY} ${frontRight},${groundY}" class="lp-svg-structure-side"></polygon>
      ${windows}

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
      ${lpsLabels}`;
  }

  // -------------------------------------------------------------------------
  // Saved result rendering
  // -------------------------------------------------------------------------
  function renderResults(r) {
    const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const unit = lengthUnit();
    const isArray = r.protectionMethod === 'roof-array' && r.terminalArray;
    const terminalCount = isArray ? r.terminalArray.terminals.length : 1;
    const arresterHtml = r.arrester && !r.arrester.applicable ? `
      <div class="result-group">
        <h3>Surge-protection voltage path</h3>
        <div class="lp-arrester-flow lp-arrester-flow--review" aria-label="Low-voltage SPD review">
          <div class="lp-arrester-step"><span>System</span><strong>${f(r.arrester.systemKvLL, 3)} kV</strong><small>${escapeHtml(r.arrester.grounding)} grounding</small></div>
          <div class="lp-arrester-step"><span>Required workflow</span><strong>Low-voltage SPD</strong><small>No medium-voltage arrester rating reported</small></div>
        </div>
      </div>` : r.arrester ? `
      <div class="result-group">
        <h3>Surge-arrester voltage path</h3>
        <div class="lp-arrester-flow" aria-label="Surge arrester selection">
          <div class="lp-arrester-step"><span>System</span><strong>${f(r.arrester.systemKvLL, 1)} kV</strong><small>${escapeHtml(r.arrester.grounding)} grounding</small></div>
          <div class="lp-arrester-step"><span>Minimum MCOV</span><strong>${f(r.arrester.mcov, 1)} kV</strong><small>continuous operating voltage</small></div>
          <div class="lp-arrester-step"><span>Standard rating</span><strong>${r.arrester.ratedStandard != null ? `${f(r.arrester.ratedStandard, 0)} kV` : 'Review'}</strong><small>required duty-cycle ≥ ${f(r.arrester.ratedRequired, 1)} kV</small></div>
        </div>
      </div>` : '';

    const warningHtml = r.warnings.length
      ? `<ul class="lp-warning-list">${r.warnings.map(w => `<li>${escapeHtml(measurementTextForDisplay(w))}</li>`).join('')}</ul>`
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
            <div class="lp-result-card"><span>Footprint</span><strong>${escapeHtml(r.footprint?.label || 'Rectangular')}</strong><small>${f(areaForDisplay(r.footprintAreaM2 ?? (r.inputs.length * r.inputs.width)), 0)} ${areaUnit()} plan area · ${f(lengthForDisplay(r.perimeterM), 1)} ${unit} perimeter</small></div>
            <div class="lp-result-card"><span>Air termination</span><strong>${r.lpl.required ? isArray ? `${terminalCount} terminals · LPL ${r.lpl.level}` : `LPL ${r.lpl.level}` : 'Not required'}</strong><small>${r.lpl.required ? `${f(lengthForDisplay(r.rollingSphereRadius), 0)} ${unit} rolling sphere · ${f(lengthForDisplay(r.terminalProtectiveRadiusM ?? r.mastProtectiveRadiusM), 1)} ${unit} ${isArray ? 'per-terminal' : 'single-mast'} radius` : 'No LPL geometry generated'}</small></div>
            <div class="lp-result-card"><span>${isArray ? 'Roof-array coverage' : 'Plan coverage'}</span><strong>${!r.lpl.required ? 'Not generated' : r.coverageComplete == null ? 'Update required' : r.coverageComplete ? isArray ? 'Complete reference plane' : 'Reaches footprint' : isArray ? 'Exposed points remain' : 'Short of footprint'}</strong><small>${r.lpl.required && Number.isFinite(r.requiredCoverageRadiusM) ? `${f(lengthForDisplay(r.requiredCoverageRadiusM), 1)} ${unit} ${isArray ? 'worst nearest-terminal distance' : 'to farthest point'} · ${r.coverageComplete ? '+' : '−'}${f(lengthForDisplay(Math.abs(r.coverageMarginM)), 1)} ${unit} margin` : 'Save the updated study to run the footprint check'}</small></div>
            <div class="lp-result-card"><span>Down path</span><strong>${r.lpl.required ? `${r.downConductorCount} conductors` : 'Not generated'}</strong><small>${r.lpl.required ? r.designCompliance?.standard?.startsWith('NFPA') ? `UL 96 Listed ${escapeHtml(r.designCompliance.componentClass)} ${escapeHtml(r.downConductorMaterial)} component basis · ${f(lengthForDisplay(r.perimeterM), 0)} ${unit} perimeter` : `${escapeHtml(r.downConductorMaterial)} · minimum ${formatConductorArea(r.downConductorMinAreaMm2)} · ${f(lengthForDisplay(r.perimeterM), 0)} ${unit} perimeter` : 'Bonding still requires project review'}</small></div>
            <div class="lp-result-card"><span>Stroke model</span><strong>${r.lpl.required ? `≥ ${f(r.minStrikeCurrentKa, 0)} kA` : 'Not applicable'}</strong><small>${r.lpl.required ? `${f(lengthForDisplay(r.minStrikeDistanceM), 1)} ${unit} minimum striking distance` : 'Screening is below the tolerable frequency'}</small></div>
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
  function bomToCsv(r) {
    const bom = r.bom;
    if (!bom?.ready) return '';
    const imperial = unitSystem === 'imperial';
    const csvLengthUnit = imperial ? 'ft' : 'm';
    const csvCell = value => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const lines = [
      ['# Lightning Protection Preliminary BOM'],
      ['Display unit system', imperial ? 'imperial' : 'metric'],
      ['Design standard', r.designCompliance?.standard || 'IEC screening'],
      ['Design-check status', r.designCompliance?.label || 'screening only'],
      ['Coverage / planning status', bom.procurementReady ? 'design checks pass subject to assumptions' : 'incomplete - do not procure'],
      ['Conductor allowance', `${bom.assumptions.conductorWastePercent}%`],
      ['Roof support spacing', lengthForDisplay(bom.assumptions.roofSupportSpacingM).toFixed(2), csvLengthUnit],
      ['Down-lead clip spacing', lengthForDisplay(bom.assumptions.downConductorSupportSpacingM).toFixed(2), csvLengthUnit],
      ['Extra route per down lead', lengthForDisplay(bom.assumptions.downConductorRouteAllowanceM).toFixed(2), csvLengthUnit],
      ['Roof perimeter ring included', bom.assumptions.includePerimeterRing ? 'yes' : 'no'],
      [],
      ['Category', 'Material / item', 'Specification', 'Quantity', 'Unit', 'Quantity basis'],
      ...bom.rows.map(row => [
        row.category,
        row.item,
        row.specification,
        row.unit === 'm' ? lengthForDisplay(row.quantity).toFixed(2) : Math.ceil(row.quantity),
        row.unit === 'm' ? csvLengthUnit : row.unit,
        row.basis,
      ]),
      [],
      ['Warnings'],
      ...bom.warnings.map(item => [measurementTextForDisplay(item)]),
      [],
      ['Required assumptions'],
      ...(r.designCompliance?.assumptions || []).map(item => [measurementTextForDisplay(item)]),
      [],
      ['Scope exclusions'],
      ...bom.exclusions.map(item => [measurementTextForDisplay(item)]),
    ];
    return lines.map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  function resultToCsv(r) {
    const imperial = unitSystem === 'imperial';
    const csvLengthUnit = imperial ? 'ft' : 'm';
    const csvAreaUnit = imperial ? 'ft2' : 'm2';
    const csvDensityUnit = imperial ? 'mi2' : 'km2';
    const lines = [];
    lines.push('# Lightning & Surge Protection Assessment');
    lines.push(`Display unit system,${imperial ? 'imperial' : 'metric'}`);
    lines.push(`Design standard,${r.designCompliance?.standard || 'IEC screening'}`);
    lines.push(`Design-check status,${r.designCompliance?.label || 'screening only'}`);
    lines.push(`Footprint shape,${r.footprint?.label || 'Rectangular'}`);
    lines.push(`Footprint area (${csvAreaUnit}),${areaForDisplay(r.footprintAreaM2 ?? (r.inputs.length * r.inputs.width)).toFixed(1)}`);
    lines.push(`Footprint perimeter (${csvLengthUnit}),${lengthForDisplay(r.perimeterM).toFixed(2)}`);
    lines.push(`Ground strike-point density (per ${csvDensityUnit}/yr),${densityForDisplay(r.groundFlashDensity).toFixed(3)}`);
    lines.push(`Collection area (${csvAreaUnit}),${areaForDisplay(r.collectionAreaM2).toFixed(1)}`);
    lines.push(`Location factor Cd,${r.locationFactor}`);
    lines.push(`Expected strikes Nd (per yr),${r.expectedStrikesPerYear.toExponential(3)}`);
    lines.push(`Tolerable frequency Nc (per yr),${r.tolerableFrequency.toExponential(3)}`);
    lines.push(`Required LPL,${r.lpl.level || 'none'}`);
    lines.push(`Protection efficiency,${(r.lpl.efficiency * 100).toFixed(2)}%`);
    lines.push(`Air-terminal arrangement,${r.protectionMethod === 'roof-array' ? 'roof array' : 'single centered mast'}`);
    lines.push(`Air-terminal tip height (${csvLengthUnit}),${lengthForDisplay(r.inputs.airTerminalHeight).toFixed(2)}`);
    if (r.lpl.required) {
      lines.push(`Rolling sphere radius (${csvLengthUnit}),${lengthForDisplay(r.rollingSphereRadius).toFixed(2)}`);
      if (r.protectionMethod === 'roof-array' && r.terminalArray) {
        lines.push(`Roof-array rows,${r.terminalArray.rows}`);
        lines.push(`Roof-array columns,${r.terminalArray.columns}`);
        lines.push(`Roof-array terminal count,${r.terminalArray.terminals.length}`);
        lines.push(`Terminal edge setback (${csvLengthUnit}),${lengthForDisplay(r.terminalArray.edgeSetbackM).toFixed(2)}`);
        lines.push(`Reference plane elevation (${csvLengthUnit}),${lengthForDisplay(r.referencePlaneHeightM).toFixed(2)}`);
        lines.push(`Per-terminal protective radius (${csvLengthUnit}),${lengthForDisplay(r.terminalProtectiveRadiusM).toFixed(2)}`);
        lines.push(`Worst nearest-terminal distance (${csvLengthUnit}),${lengthForDisplay(r.requiredCoverageRadiusM).toFixed(2)}`);
      } else {
        lines.push(`Single-mast protective radius (${csvLengthUnit}),${lengthForDisplay(r.mastProtectiveRadiusM).toFixed(2)}`);
        lines.push(`Farthest protected point (${csvLengthUnit}),${lengthForDisplay(r.requiredCoverageRadiusM).toFixed(2)}`);
      }
      lines.push(`Coverage margin (${csvLengthUnit}),${lengthForDisplay(r.coverageMarginM).toFixed(2)}`);
      lines.push(`${r.protectionMethod === 'roof-array' ? 'Roof-array reference-plane coverage' : 'Centered single-mast footprint coverage'},${r.coverageComplete ? 'reaches footprint' : 'short of footprint'}`);
      lines.push(`Down-conductors,${r.downConductorCount}`);
      lines.push(`Down-conductor min area (mm2),${r.downConductorMinAreaMm2}`);
    } else {
      lines.push('Structural LPS,not indicated by screening');
      lines.push(`Rolling sphere radius (${csvLengthUnit}),n/a`);
      lines.push(`${r.protectionMethod === 'roof-array' ? 'Per-terminal protective radius' : 'Single-mast protective radius'} (${csvLengthUnit}),n/a`);
      lines.push('Down-conductors,n/a');
    }
    if (r.arrester) {
      if (r.arrester.applicable) {
        lines.push(`Arrester MCOV (kV),${r.arrester.mcov.toFixed(2)}`);
        lines.push(`Arrester rated standard (kV),${r.arrester.ratedStandard ?? 'n/a'}`);
      } else {
        lines.push('Surge protection workflow,low-voltage SPD review');
        lines.push('Arrester MCOV (kV),n/a');
        lines.push('Arrester rated standard (kV),n/a');
      }
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
