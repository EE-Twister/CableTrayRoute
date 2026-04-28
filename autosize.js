import {
  sizeFeeder,
  sizeFeederFromKw,
  sizeMotorBranch,
  sizeTransformer,
  motorFLC3Ph,
  motorFLC1Ph,
  trayFillFactor,
  minimizeCostConductors,
} from './analysis/autoSize.mjs';
import {
  buildTransformerFeederSizingPackage,
  renderTransformerFeederSizingHTML,
} from './analysis/transformerFeederSizingCase.mjs';
import { getStudies, setStudies } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  let currentSizingPackage = null;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => { t.setAttribute('aria-selected', 'false'); t.classList.remove('active'); });
      panels.forEach(p => { p.hidden = true; });
      tab.setAttribute('aria-selected', 'true');
      tab.classList.add('active');
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.hidden = false;
    });
  });

  const importDemandBtn = document.getElementById('import-governed-demand-btn');
  if (importDemandBtn) {
    importDemandBtn.addEventListener('click', () => {
      const pkg = getStudies().loadDemandGovernance;
      const summary = pkg?.summary;
      if (!summary || !summary.governedDemandKw) {
        renderError('feeder-results', 'No saved load demand-governance package was found. Save Demand Package from the Load List first.');
        return;
      }
      const kwRadio = document.querySelector('input[name="feeder-mode"][value="kw"]');
      if (kwRadio) kwRadio.checked = true;
      const ampsRow = document.getElementById('row-amps');
      const kwRow = document.getElementById('row-kw');
      const pfRow = document.getElementById('row-pf');
      const voltageRow = document.getElementById('row-voltage');
      const phaseRow = document.getElementById('row-phase');
      if (ampsRow) ampsRow.hidden = true;
      [kwRow, pfRow, voltageRow, phaseRow].forEach(row => { if (row) row.hidden = false; });
      const kwInput = document.getElementById('feeder-kw');
      if (kwInput) kwInput.value = summary.governedDemandKw;
      const sourceSelect = document.getElementById('sizing-load-source');
      if (sourceSelect) sourceSelect.value = 'loadDemandGovernance';
      const caseLoadKw = document.getElementById('sizing-load-kw');
      if (caseLoadKw) caseLoadKw.value = summary.governedDemandKw || '';
      const caseLoadKva = document.getElementById('sizing-load-kva');
      if (caseLoadKva) caseLoadKva.value = summary.governedDemandKva || '';
      const continuous = document.getElementById('feeder-continuous');
      if (continuous) continuous.checked = (summary.continuousCount || 0) > 0;
    });
  }

  const buildSizingBtn = document.getElementById('build-sizing-package-btn');
  const saveSizingBtn = document.getElementById('save-sizing-package-btn');
  const exportSizingJsonBtn = document.getElementById('export-sizing-json-btn');
  const exportSizingHtmlBtn = document.getElementById('export-sizing-html-btn');
  if (buildSizingBtn) buildSizingBtn.addEventListener('click', () => buildSizingPackage());
  if (saveSizingBtn) saveSizingBtn.addEventListener('click', () => {
    if (!currentSizingPackage) buildSizingPackage();
    if (!currentSizingPackage) return;
    const studies = getStudies();
    setStudies({ ...studies, transformerFeederSizing: currentSizingPackage });
    renderPackageNotice('Transformer/feeder sizing package saved to study results.');
  });
  if (exportSizingJsonBtn) exportSizingJsonBtn.addEventListener('click', () => {
    if (!currentSizingPackage) buildSizingPackage();
    if (currentSizingPackage) downloadText('transformer-feeder-sizing-package.json', JSON.stringify(currentSizingPackage, null, 2), 'application/json');
  });
  if (exportSizingHtmlBtn) exportSizingHtmlBtn.addEventListener('click', () => {
    if (!currentSizingPackage) buildSizingPackage();
    if (currentSizingPackage) downloadText('transformer-feeder-sizing-package.html', renderPrintableHtml(currentSizingPackage), 'text/html');
  });

  // -------------------------------------------------------------------------
  // Tab 1: Feeder / Branch Circuit
  // -------------------------------------------------------------------------
  document.getElementById('feeder-form').addEventListener('submit', e => {
    e.preventDefault();
    const mode = document.querySelector('input[name="feeder-mode"]:checked').value;
    const continuous = document.getElementById('feeder-continuous').checked;
    const material = document.getElementById('feeder-material').value;
    const tempRating = parseInt(document.getElementById('feeder-temp').value, 10);
    const ambientTempC = parseFloat(document.getElementById('feeder-ambient').value) || 30;
    const bundledConductors = parseInt(document.getElementById('feeder-bundled').value, 10) || 3;
    const installationType = document.getElementById('feeder-install').value;
    let result;
    try {
      if (mode === 'amps') {
        const loadAmps = parseFloat(document.getElementById('feeder-amps').value);
        result = sizeFeeder({ loadAmps, continuous, material, tempRating, ambientTempC, bundledConductors, installationType });
      } else {
        const kw = parseFloat(document.getElementById('feeder-kw').value);
        const pf = parseFloat(document.getElementById('feeder-pf').value);
        const voltage = parseFloat(document.getElementById('feeder-voltage').value);
        const phase = document.getElementById('feeder-phase').value;
        result = sizeFeederFromKw({ kw, pf, voltage, phase, continuous, material, tempRating, ambientTempC, bundledConductors, installationType });
      }
    } catch (err) {
      renderError('feeder-results', err.message);
      return;
    }
    renderFeederResult('feeder-results', result);

    if (!result.error && result.requiredAmps) {
      const costOptions = minimizeCostConductors(result.requiredAmps, tempRating, {
        ambientTempC,
        bundledConductors,
        installationType,
        allowAluminum: true,
        maxParallel: 4,
      });
      renderCostComparison('feeder-cost-comparison', costOptions, material, result.conductorSize);
    } else {
      document.getElementById('feeder-cost-comparison').hidden = true;
    }
  });

  // -------------------------------------------------------------------------
  // Tab 2: Motor Branch Circuit
  // -------------------------------------------------------------------------
  document.getElementById('motor-form').addEventListener('submit', e => {
    e.preventDefault();
    const hp = parseFloat(document.getElementById('motor-hp').value);
    const voltage = parseInt(document.getElementById('motor-voltage').value, 10);
    const phase = document.getElementById('motor-phase').value;
    const material = document.getElementById('motor-material').value;
    const highSF = document.getElementById('motor-highsf').checked;
    const ambientTempC = parseFloat(document.getElementById('motor-ambient').value) || 30;
    const bundledConductors = parseInt(document.getElementById('motor-bundled').value, 10) || 3;
    const installationType = document.getElementById('motor-install').value;
    let result;
    try {
      result = sizeMotorBranch({ hp, voltage, phase, material, highSF, ambientTempC, bundledConductors, installationType });
    } catch (err) {
      renderError('motor-results', err.message);
      return;
    }
    renderMotorResult('motor-results', result);
  });

  // FLC preview on input change
  ['motor-hp', 'motor-voltage', 'motor-phase'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateMotorFLCPreview);
  });

  function updateMotorFLCPreview() {
    const hp = parseFloat(document.getElementById('motor-hp').value);
    const voltage = parseInt(document.getElementById('motor-voltage').value, 10);
    const phase = document.getElementById('motor-phase').value;
    const preview = document.getElementById('motor-flc-preview');
    if (!preview || !hp || !voltage) return;
    const flc = phase === '1ph' ? motorFLC1Ph(hp, voltage) : motorFLC3Ph(hp, voltage);
    preview.textContent = flc !== null
      ? `NEC Table ${phase === '1ph' ? '430.248' : '430.250'} FLC = ${flc} A`
      : 'FLC not available for this combination';
  }

  // -------------------------------------------------------------------------
  // Tab 3: Transformer
  // -------------------------------------------------------------------------
  document.getElementById('xfmr-form').addEventListener('submit', e => {
    e.preventDefault();
    const loadKva = parseFloat(document.getElementById('xfmr-kva').value);
    const primaryVoltage = parseFloat(document.getElementById('xfmr-primary').value);
    const secondaryVoltage = parseFloat(document.getElementById('xfmr-secondary').value);
    const phase = document.getElementById('xfmr-phase').value;
    let result;
    try {
      result = sizeTransformer({ loadKva, primaryVoltage, secondaryVoltage, phase });
    } catch (err) {
      renderError('xfmr-results', err.message);
      return;
    }
    renderXfmrResult('xfmr-results', result);
  });

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  function renderError(containerId, message) {
    const div = document.getElementById(containerId);
    div.innerHTML = `<p class="alert-error" role="alert">Error: ${message}</p>`;
  }

  function buildSizingCaseInput() {
    const feederMode = document.querySelector('input[name="feeder-mode"]:checked')?.value || 'amps';
    const loadKw = parseFloat(document.getElementById('sizing-load-kw')?.value)
      || (feederMode === 'kw' ? parseFloat(document.getElementById('feeder-kw')?.value) : null);
    const loadKva = parseFloat(document.getElementById('sizing-load-kva')?.value)
      || parseFloat(document.getElementById('xfmr-kva')?.value)
      || null;
    const pf = parseFloat(document.getElementById('sizing-pf')?.value)
      || parseFloat(document.getElementById('feeder-pf')?.value)
      || 0.9;
    return {
      caseName: document.getElementById('sizing-case-name')?.value || 'Transformer / Feeder Sizing Case',
      loadSource: document.getElementById('sizing-load-source')?.value || 'manual',
      panelId: document.getElementById('sizing-panel-id')?.value || '',
      serviceGroup: document.getElementById('sizing-service-group')?.value || '',
      loadKw,
      loadKva,
      powerFactor: pf,
      voltage: parseFloat(document.getElementById('feeder-voltage')?.value) || parseFloat(document.getElementById('xfmr-secondary')?.value) || 480,
      phase: document.getElementById('xfmr-phase')?.value || document.getElementById('feeder-phase')?.value || '3ph',
      continuous: document.getElementById('feeder-continuous')?.checked ?? true,
      futureGrowthPct: parseFloat(document.getElementById('sizing-growth-pct')?.value) || 0,
      emergencyOverloadEnabled: document.getElementById('sizing-emergency-enabled')?.checked || false,
      emergencyOverloadPct: parseFloat(document.getElementById('sizing-emergency-pct')?.value) || 0,
      primaryVoltage: parseFloat(document.getElementById('xfmr-primary')?.value) || 480,
      secondaryVoltage: parseFloat(document.getElementById('xfmr-secondary')?.value) || parseFloat(document.getElementById('feeder-voltage')?.value) || 208,
      transformerPhase: document.getElementById('xfmr-phase')?.value || '3ph',
      impedancePct: parseFloat(document.getElementById('sizing-impedance-pct')?.value) || null,
      bilKv: parseFloat(document.getElementById('sizing-bil-kv')?.value) || null,
      temperatureRiseC: parseFloat(document.getElementById('sizing-temp-rise-c')?.value) || null,
      coolingClass: document.getElementById('sizing-cooling-class')?.value || '',
      tapRangePct: parseFloat(document.getElementById('sizing-tap-range-pct')?.value) || null,
      tapTargetVoltage: parseFloat(document.getElementById('sizing-tap-target-v')?.value) || null,
      material: document.getElementById('feeder-material')?.value || 'copper',
      tempRating: parseInt(document.getElementById('feeder-temp')?.value || '75', 10),
      ambientTempC: parseFloat(document.getElementById('feeder-ambient')?.value) || 30,
      bundledConductors: parseInt(document.getElementById('feeder-bundled')?.value || '3', 10),
      installationType: document.getElementById('feeder-install')?.value || 'conduit',
      maxParallel: parseInt(document.getElementById('sizing-max-parallel')?.value || '4', 10),
      protectionBasisNote: document.getElementById('sizing-protection-note')?.value || '',
      feederBasisNote: document.getElementById('sizing-feeder-note')?.value || '',
      transformerBasisNote: document.getElementById('sizing-transformer-note')?.value || '',
      notes: document.getElementById('sizing-notes')?.value || '',
    };
  }

  function buildSizingPackage() {
    try {
      currentSizingPackage = buildTransformerFeederSizingPackage({
        projectName: document.body?.dataset?.reportTitle || 'Auto-Size Equipment',
        studyCase: buildSizingCaseInput(),
        loadDemandGovernance: getStudies().loadDemandGovernance || null,
      });
      const container = document.getElementById('sizing-package-results');
      if (container) {
        container.innerHTML = `${renderTransformerFeederSizingHTML(currentSizingPackage)}
          <details class="method-panel"><summary>Package JSON</summary><pre>${escapeHtml(JSON.stringify(currentSizingPackage, null, 2))}</pre></details>`;
      }
    } catch (err) {
      currentSizingPackage = null;
      renderError('sizing-package-results', err.message || String(err));
    }
  }

  function renderPackageNotice(message) {
    const status = document.getElementById('sizing-package-status');
    if (status) status.textContent = message;
  }

  function downloadText(fileName, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function renderPrintableHtml(pkg) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Transformer and Feeder Sizing Basis</title><link rel="stylesheet" href="style.css"></head><body>${renderTransformerFeederSizingHTML(pkg)}</body></html>`;
  }

  function escapeHtml(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function row(label, value) {
    return `<tr><td>${label}</td><td><strong>${value}</strong></td></tr>`;
  }

  function renderFeederResult(containerId, r) {
    const div = document.getElementById(containerId);
    if (r.error) { div.innerHTML = `<p class="alert-error">${r.error}</p>`; return; }
    const installLabel = { conduit: 'Conduit / Raceway', tray_spaced: 'Cable tray (maintained spacing)', tray_touching: 'Cable tray (cables touching)' };
    div.innerHTML = `
      <section class="results-panel" aria-label="Feeder sizing results">
        <h3>Feeder / Branch Circuit Sizing</h3>
        <table class="results-table">
          <tbody>
            ${r.kw !== undefined ? row('Load (kW)', `${r.kw} kW @ PF ${r.pf}`) : ''}
            ${row('Load Current', `${(r.loadAmps).toFixed(1)} A`)}
            ${row('Continuous load', r.continuous ? 'Yes (125% factor applied)' : 'No')}
            ${row('Required ampacity', `${r.requiredAmps} A`)}
            ${r.ambientTempC !== 30 ? row('Ambient temperature', `${r.ambientTempC}°C (derating applied)`) : ''}
            ${r.bundledConductors > 3 ? row('Bundled conductors', `${r.bundledConductors} (derating applied)`) : ''}
            ${r.installationType !== 'conduit' ? row('Installation type', installLabel[r.installationType] || r.installationType) : ''}
            ${r.deratingFactor < 1 ? row('Combined derating factor', r.deratingFactor.toFixed(3)) : ''}
            ${row('Conductor size', `${r.conductorSize} (${r.material}, ${r.tempRating}°C)`)}
            ${row('Conductor ampacity', `${r.conductorAmpacity} A`)}
            ${r.deratingFactor < 1 ? row('Installed ampacity (derated)', `${r.installedAmpacity} A`) : ''}
            ${row('OCPD rating', `${r.ocpdRating} A`)}
          </tbody>
        </table>
        <details class="method-panel">
          <summary>NEC References</summary>
          <ul>
            ${Object.values(r.nec).filter(Boolean).map(ref => `<li>${ref}</li>`).join('')}
          </ul>
        </details>
      </section>`;
  }

  function renderMotorResult(containerId, r) {
    const div = document.getElementById(containerId);
    if (r.error) { div.innerHTML = `<p class="alert-error">${r.error}</p>`; return; }
    const installLabel = { conduit: 'Conduit / Raceway', tray_spaced: 'Cable tray (maintained spacing)', tray_touching: 'Cable tray (cables touching)' };
    div.innerHTML = `
      <section class="results-panel" aria-label="Motor branch circuit results">
        <h3>Motor Branch Circuit Sizing</h3>
        <table class="results-table">
          <tbody>
            ${row('Motor HP', `${r.hp} HP`)}
            ${row('Phase / Voltage', `${r.phase === '3ph' ? '3-Phase' : '1-Phase'} / ${r.voltage}V`)}
            ${row('Full Load Current (FLC)', `${r.flc} A`)}
            ${r.ambientTempC !== 30 ? row('Ambient temperature', `${r.ambientTempC}°C (derating applied)`) : ''}
            ${r.bundledConductors > 3 ? row('Bundled conductors', `${r.bundledConductors} (derating applied)`) : ''}
            ${r.installationType !== 'conduit' ? row('Installation type', installLabel[r.installationType] || r.installationType) : ''}
            ${r.deratingFactor < 1 ? row('Combined derating factor', r.deratingFactor.toFixed(3)) : ''}
            ${row('Branch circuit conductor', `${r.conductorSize || 'N/A'} (${r.material})`)}
            ${row('Conductor ampacity', r.conductorAmpacity ? `${r.conductorAmpacity} A` : 'N/A')}
            ${r.deratingFactor < 1 ? row('Installed ampacity (derated)', r.installedAmpacity ? `${r.installedAmpacity} A` : 'N/A') : ''}
            ${row('Branch circuit OCPD', `${r.ocpdRating} A ${r.ocpdType}`)}
            ${row('Overload relay setpoint', `${r.overloadSetpoint} A (${r.overloadPercent}% of FLC)`)}
          </tbody>
        </table>
        <details class="method-panel">
          <summary>NEC References</summary>
          <ul>
            ${Object.values(r.nec).filter(Boolean).map(ref => `<li>${ref}</li>`).join('')}
          </ul>
        </details>
      </section>`;
  }

  function renderXfmrResult(containerId, r) {
    const div = document.getElementById(containerId);
    if (r.error) { div.innerHTML = `<p class="alert-error">${r.error}</p>`; return; }
    div.innerHTML = `
      <section class="results-panel" aria-label="Transformer sizing results">
        <h3>Transformer Sizing</h3>
        <table class="results-table">
          <tbody>
            ${row('Required load', `${r.loadKva} kVA`)}
            ${row('Selected transformer', `${r.xfmrKva} kVA, ${r.phase === '3ph' ? '3-Phase' : '1-Phase'}`)}
            ${row('Primary voltage', `${r.primaryVoltage} V`)}
            ${row('Primary rated current', `${r.primaryRatedAmps} A`)}
            ${row('Primary OCPD', `${r.primaryOcpdRating} A (${r.primaryOcpdFactor} of rated)`)}
            ${row('Secondary voltage', `${r.secondaryVoltage} V`)}
            ${row('Secondary rated current', `${r.secondaryRatedAmps} A`)}
            ${row('Secondary OCPD', `${r.secondaryOcpdRating} A (125% of rated)`)}
            ${r.secondaryConductorSize ? row('Secondary conductors', `${r.secondaryConductorSize} (${r.secondaryConductorAmpacity} A)`) : ''}
          </tbody>
        </table>
        <details class="method-panel">
          <summary>NEC References</summary>
          <ul>
            ${Object.values(r.nec).map(ref => `<li>${ref}</li>`).join('')}
          </ul>
        </details>
      </section>`;
  }

  function renderCostComparison(containerId, options, baseMaterial, baseSize) {
    const div = document.getElementById(containerId);
    if (!options || options.length === 0) { div.hidden = true; return; }

    // Baseline = single conductor with the originally-selected material
    const baseOpt = options.find(o => o.nParallel === 1 && o.material === baseMaterial);
    const baseCost = baseOpt ? baseOpt.costPerFtPerPhase : null;

    const matAbbr = { copper: 'Cu', aluminum: 'Al' };

    const rows = options.map((opt, i) => {
      const config = `${opt.nParallel === 1 ? '1×' : opt.nParallel + '×'}${opt.size} ${matAbbr[opt.material] || opt.material}`;
      const ampLabel = `${opt.installedAmpacity} A`;
      const costLabel = opt.costPerFtPerPhase !== null ? `$${opt.costPerFtPerPhase.toFixed(2)}` : 'N/A';

      let vsLabel = '—';
      let vsClass = '';
      if (baseCost !== null && opt.costPerFtPerPhase !== null) {
        const pct = ((opt.costPerFtPerPhase - baseCost) / baseCost) * 100;
        if (Math.abs(pct) < 0.5) { vsLabel = 'baseline'; vsClass = 'cost-baseline'; }
        else if (pct < 0) { vsLabel = `−${Math.abs(pct).toFixed(0)}%`; vsClass = 'cost-cheaper'; }
        else { vsLabel = `+${pct.toFixed(0)}%`; vsClass = 'cost-pricier'; }
      }

      const isCheapest = i === 0;
      const isSelected = opt.nParallel === 1 && opt.material === baseMaterial && opt.size === baseSize;
      const rowClass = isSelected ? 'cost-row-selected' : isCheapest ? 'cost-row-best' : '';

      const badge = isSelected
        ? '<span class="cost-badge cost-badge-selected">selected</span>'
        : isCheapest ? '<span class="cost-badge cost-badge-best">cheapest</span>' : '';

      const notesHtml = opt.notes.length > 0
        ? `<small class="cost-notes">${opt.notes.join(' · ')}</small>`
        : '';

      return `<tr class="${rowClass}">
        <td>${config} ${badge}</td>
        <td>${ampLabel}</td>
        <td>${costLabel}</td>
        <td class="${vsClass}">${vsLabel}</td>
        <td>${notesHtml}</td>
      </tr>`;
    }).join('');

    div.innerHTML = `
      <section class="results-panel" aria-label="Conductor cost comparison">
        <h3>Conductor Cost Comparison
          <small class="cost-subtitle"> — est. $/ft per phase conductor</small>
        </h3>
        <p class="field-hint">Indicative pricing (RS Means-based).
          Verify with current supplier quotes before procurement.</p>
        <table class="results-table cost-comparison-table">
          <thead>
            <tr>
              <th>Configuration</th>
              <th>Installed Ampacity</th>
              <th>$/ft/phase</th>
              <th>vs. Selected</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <details class="method-panel">
          <summary>NEC References</summary>
          <ul>
            <li>NEC 310.10(H) — Parallel conductors ≥ 1/0 AWG; same size, material, length; separate conduit per set</li>
            <li>NEC 110.14 — Aluminum conductors require Al-rated terminals and connectors</li>
            <li>NEC 310.14(C) — Aluminum building wire ≥ #8 AWG for most applications</li>
          </ul>
        </details>
      </section>`;
    div.hidden = false;
  }

  // Activate first tab
  if (tabs.length > 0) tabs[0].click();
});
