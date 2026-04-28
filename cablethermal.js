import {
  buildCableTemperatureTimeline,
  buildCableThermalEnvironmentPackage,
  renderCableThermalEnvironmentHTML,
} from './analysis/cableThermalEnvironment.mjs';
import { getCables, getStudies, setStudies } from './dataStore.mjs';
import { getProjectState } from './projectStorage.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('thermal-form');
  const cableSelect = document.getElementById('thermal-cables');
  const results = document.getElementById('thermal-results');
  const summary = document.getElementById('thermal-summary');
  const timeline = document.getElementById('thermal-timeline');
  const advancedDetails = document.getElementById('thermal-advanced-details');
  const manualRows = document.getElementById('manual-cables');
  const jsonBtn = document.getElementById('export-thermal-json');
  const htmlBtn = document.getElementById('export-thermal-html');
  let latestPackage = null;

  function esc(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }

  function populateCableSelect() {
    const cables = getCables();
    cableSelect.innerHTML = cables.map(cable => {
      const tag = cable.tag || cable.id || cable.cable_id || cable.name || 'Cable';
      return `<option value="${esc(tag)}" selected>${esc(tag)} - ${esc(cable.conductor_size || cable.size || '')}</option>`;
    }).join('');
  }

  function parseManualRows() {
    return String(manualRows.value || '')
      .split(/\r?\n/)
      .map(row => row.trim())
      .filter(Boolean)
      .map((row, index) => {
        const [tag, size, amps, insulation = 'XLPE', material = 'Cu', voltage = '600 V'] = row.split(',').map(part => part.trim());
        return {
          tag: tag || `Manual-${index + 1}`,
          conductor_size: size || '',
          loadAmps: Number.parseFloat(amps),
          insulation_type: insulation,
          conductor_material: material,
          voltage_rating: voltage,
        };
      });
  }

  function selectedCables() {
    const selected = new Set([...cableSelect.selectedOptions].map(option => option.value));
    const fromSchedule = getCables()
      .filter(cable => selected.has(cable.tag || cable.id || cable.cable_id || cable.name || 'Cable'))
      .map(cable => ({
        ...cable,
        loadAmps: cable.loadAmps || cable.currentA || cable.est_load || cable.fla || cable.ampacity,
      }));
    return [...fromSchedule, ...parseManualRows()];
  }

  function selectedMethods() {
    return [...document.querySelectorAll('[name="thermal-method"]:checked')].map(input => input.value);
  }

  function readLoadProfile() {
    return String(document.getElementById('load-profile').value || '')
      .split(/\r?\n/)
      .map(row => row.trim())
      .filter(Boolean)
      .map((row, index) => {
        const [hour, loadPct] = row.split(',').map(part => Number.parseFloat(part.trim()));
        return { hour: Number.isFinite(hour) ? hour : index, loadPct: Number.isFinite(loadPct) ? loadPct : 100 };
      });
  }

  function readCsvRows(id, mapper) {
    return String(document.getElementById(id)?.value || '')
      .split(/\r?\n/)
      .map(row => row.trim())
      .filter(Boolean)
      .map((row, index) => mapper(row.split(',').map(part => part.trim()), index));
  }

  function readOptionalNumber(id) {
    const raw = document.getElementById(id)?.value;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  }

  function readAdvancedInputs() {
    const backfillZones = readCsvRows('backfill-zones', ([name, thicknessMm, thermalResistivity, moisture = '', notes = ''], index) => ({
      id: `backfill-${index + 1}`,
      name: name || `Backfill ${index + 1}`,
      thicknessMm: Number.parseFloat(thicknessMm),
      thermalResistivity: Number.parseFloat(thermalResistivity),
      moisture,
      notes,
    }));
    const adjacentInfluences = readCsvRows('adjacent-influences', ([label, type = 'heatSource', distanceMm, heatWm, loadCurrentA, notes = ''], index) => ({
      id: `adjacent-${index + 1}`,
      label: label || `Adjacent ${index + 1}`,
      type,
      distanceMm: Number.parseFloat(distanceMm),
      heatWm: Number.parseFloat(heatWm),
      loadCurrentA: Number.parseFloat(loadCurrentA),
      notes,
    }));
    const emergencyOverloadProfile = readCsvRows('emergency-profile', ([hour, durationHours, loadPct, notes = ''], index) => ({
      hour: Number.isFinite(Number.parseFloat(hour)) ? Number.parseFloat(hour) : index,
      durationHours: Number.parseFloat(durationHours),
      loadPct: Number.parseFloat(loadPct),
      notes,
    }));
    return {
      enabled: document.getElementById('advanced-enabled')?.checked
        || document.getElementById('solar-enabled')?.checked
        || document.getElementById('dryout-enabled')?.checked
        || backfillZones.length > 0
        || adjacentInfluences.length > 0
        || emergencyOverloadProfile.length > 0,
      exposureMode: document.getElementById('exposure-mode')?.value || 'standard',
      solar: {
        enabled: document.getElementById('solar-enabled')?.checked || false,
        solarRadiationWm2: Number.parseFloat(document.getElementById('solar-radiation')?.value) || 0,
        absorptivity: Number.parseFloat(document.getElementById('solar-absorptivity')?.value) || 0.7,
        windSpeedMs: Number.parseFloat(document.getElementById('wind-speed-ms')?.value) || 0,
      },
      dryOut: {
        enabled: document.getElementById('dryout-enabled')?.checked || false,
        moistSoilResistivity: readOptionalNumber('moist-rho'),
        drySoilResistivity: readOptionalNumber('dry-rho'),
        criticalTempC: readOptionalNumber('dryout-temp'),
      },
      backfillZones,
      adjacentInfluences,
      emergencyOverloadProfile,
      sheathBondingLossMode: document.getElementById('sheath-bonding-mode')?.value || 'screeningDefault',
      cyclicRatingMode: document.getElementById('cyclic-rating-mode')?.value || 'screeningDefault',
      notes: document.getElementById('advanced-notes')?.value || '',
    };
  }

  function buildContext() {
    const projectName = getProjectState()?.name || 'Untitled Project';
    return {
      projectName,
      cables: selectedCables(),
      installationMethods: selectedMethods(),
      ambientTempC: Number.parseFloat(document.getElementById('ambient-temp').value) || 30,
      earthTempC: Number.parseFloat(document.getElementById('earth-temp').value) || 20,
      soilResistivity: Number.parseFloat(document.getElementById('soil-resistivity').value) || 1.2,
      burialDepthMm: Number.parseFloat(document.getElementById('burial-depth-mm').value) || 800,
      conduitOD_mm: Number.parseFloat(document.getElementById('conduit-od-mm').value) || 80,
      nCables: Number.parseFloat(document.getElementById('group-count').value) || 1,
      groupArrangement: document.getElementById('group-arrangement').value || 'flat',
      frequencyHz: Number.parseFloat(document.getElementById('frequency-hz').value) || 60,
      loadProfile: readLoadProfile(),
      advancedInputs: readAdvancedInputs(),
    };
  }

  function renderPackage(pkg) {
    const s = pkg.summary || {};
    summary.innerHTML = `
      <article class="thermal-card thermal-card--${s.fail ? 'fail' : s.warn ? 'warn' : 'pass'}">
        <span>Total Rows</span><strong>${esc(s.total || 0)}</strong><small>${esc(s.pass || 0)} pass, ${esc(s.warn || 0)} warning, ${esc(s.fail || 0)} fail</small>
      </article>
      <article class="thermal-card">
        <span>Worst Loading</span><strong>${esc(s.worstLoadPct ?? '--')}%</strong><small>Maximum evaluated load percentage</small>
      </article>
      <article class="thermal-card">
        <span>Max Temp</span><strong>${esc(s.maxEstimatedTempC ?? '--')} C</strong><small>Estimated conductor temperature</small>
      </article>
      <article class="thermal-card thermal-card--${s.missingData ? 'warn' : 'pass'}">
        <span>Missing Data</span><strong>${esc(s.missingData || 0)}</strong><small>Rows needing inputs</small>
      </article>
    `;

    results.innerHTML = `
      <table class="results-table">
        <thead><tr><th>Cable</th><th>Method</th><th>Load A</th><th>Allowable A</th><th>Load %</th><th>Temp C</th><th>Status</th><th>Limiting Factor</th><th>Recommendation</th></tr></thead>
        <tbody>${pkg.evaluations.map(row => `<tr class="row-${esc(row.status)}">
          <td>${esc(row.cableTag)}</td>
          <td>${esc(row.installationMethod)}</td>
          <td>${esc(row.designCurrentA ?? '--')}</td>
          <td>${esc(row.allowableAmpacityA ?? '--')}</td>
          <td>${esc(row.loadPct ?? '--')}</td>
          <td>${esc(row.estimatedConductorTempC ?? '--')}</td>
          <td>${esc(row.status)}</td>
          <td>${esc(row.limitingFactor)}</td>
          <td>${esc(row.recommendation)}</td>
        </tr>`).join('')}</tbody>
      </table>
    `;

    const first = pkg.evaluations.find(row => row.status !== 'missingData');
    const points = first ? buildCableTemperatureTimeline(first, pkg.environment.loadProfile) : [];
    timeline.innerHTML = points.length ? `
      <h3>${esc(first.cableTag)} ${esc(first.installationMethod)} Timeline</h3>
      <div class="thermal-timeline-bars">
        ${points.map(point => `<div class="thermal-timeline-point thermal-timeline-point--${esc(point.status)}" style="height:${Math.max(8, Math.min(100, point.estimatedConductorTempC))}%">
          <span>${esc(point.hour)}h</span><strong>${esc(point.estimatedConductorTempC)} C</strong>
        </div>`).join('')}
      </div>
    ` : '<p class="field-hint">No temperature timeline is available until at least one row has complete thermal inputs.</p>';

    const advancedWarnings = pkg.advancedWarnings || [];
    const emergencyRows = (pkg.emergencyProfiles || []).flatMap(profile => (profile.points || []).map(point => ({
      ...point,
      cableTag: profile.cableTag,
      installationMethod: profile.installationMethod,
    })));
    advancedDetails.innerHTML = `
      <div class="thermal-summary-grid">
        <article class="thermal-card thermal-card--${advancedWarnings.length ? 'warn' : 'pass'}">
          <span>Advanced Warnings</span><strong>${esc(advancedWarnings.length)}</strong><small>Screening modifier notices</small>
        </article>
        <article class="thermal-card">
          <span>Backfill Zones</span><strong>${esc((pkg.backfillZones || []).length)}</strong><small>Weighted screening zones</small>
        </article>
        <article class="thermal-card">
          <span>Adjacent Sources</span><strong>${esc((pkg.adjacentInfluences || []).length)}</strong><small>Thermal influence rows</small>
        </article>
        <article class="thermal-card thermal-card--${emergencyRows.some(row => row.status === 'fail') ? 'fail' : emergencyRows.some(row => row.status === 'warn') ? 'warn' : 'pass'}">
          <span>Emergency Rows</span><strong>${esc(emergencyRows.length)}</strong><small>Cyclic/emergency profile points</small>
        </article>
      </div>
      ${advancedWarnings.length ? `<ul>${advancedWarnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul>` : '<p class="field-hint">No advanced warnings.</p>'}
      ${emergencyRows.length ? `<table class="results-table">
        <thead><tr><th>Cable</th><th>Method</th><th>Hour</th><th>Duration</th><th>Load %</th><th>Temp C</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>${emergencyRows.map(row => `<tr class="row-${esc(row.status)}">
          <td>${esc(row.cableTag)}</td>
          <td>${esc(row.installationMethod)}</td>
          <td>${esc(row.hour)}</td>
          <td>${esc(row.durationHours)}</td>
          <td>${esc(row.loadPct)}</td>
          <td>${esc(row.estimatedConductorTempC)}</td>
          <td>${esc(row.status)}</td>
          <td>${esc(row.notes)}</td>
        </tr>`).join('')}</tbody>
      </table>` : ''}
    `;
  }

  function runAnalysis() {
    latestPackage = buildCableThermalEnvironmentPackage(buildContext());
    const studies = getStudies();
    studies.cableThermalEnvironment = latestPackage;
    setStudies(studies);
    renderPackage(latestPackage);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    runAnalysis();
  });

  jsonBtn.addEventListener('click', () => {
    if (latestPackage) downloadText('cable-thermal-environment-package.json', JSON.stringify(latestPackage, null, 2), 'application/json');
  });

  htmlBtn.addEventListener('click', () => {
    if (latestPackage) downloadText('cable-thermal-environment-package.html', `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Cable Thermal Environment</title></head><body>${renderCableThermalEnvironmentHTML(latestPackage)}</body></html>`, 'text/html');
  });

  populateCableSelect();
  const saved = getStudies().cableThermalEnvironment;
  if (saved) {
    latestPackage = saved;
    renderPackage(saved);
  }
});
