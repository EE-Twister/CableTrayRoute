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

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

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
