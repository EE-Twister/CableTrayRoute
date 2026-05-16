import { runCapacitorBankAnalysis } from './analysis/capacitorBank.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('cap-bank-form');
  const resultsDiv = document.getElementById('results');

  initStudyApprovalPanel('capacitorBank');

  // --- Restore previous results from project store ---
  const saved = getStudies().capacitorBank;
  if (saved) {
    renderResults(saved);
  }

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runCapacitorBankAnalysis(inputs);
    } catch (err) {
      showModal('Analysis Error', `<p>${err.message}</p>`, 'error');
      return;
    }

    // Persist
    const studies = getStudies();
    studies.capacitorBank = result;
    setStudies(studies);

    renderResults(result);
  });

  // --------------------------------------------------------------------------

  function readFormInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    const pKw = getFloat('p-kw');
    const pfExisting = getFloat('pf-existing');
    const pfTarget = getFloat('pf-target');
    const voltageKv = getFloat('voltage-kv');
    const kvaScMva = getFloat('kva-sc-mva') || 0;
    const busLabel = get('bus-label').value.trim();

    if (!pKw || pKw <= 0) {
      showModal('Input Error', '<p>Real power P (kW) must be greater than zero.</p>', 'error');
      return null;
    }
    if (pfExisting <= 0 || pfExisting > 1) {
      showModal('Input Error', '<p>Existing power factor must be between 0 (exclusive) and 1.0.</p>', 'error');
      return null;
    }
    if (pfTarget <= 0 || pfTarget > 1) {
      showModal('Input Error', '<p>Target power factor must be between 0 (exclusive) and 1.0.</p>', 'error');
      return null;
    }

    const dominantHarmonics = [];
    document.querySelectorAll('.harmonic-cb:checked').forEach(cb => {
      dominantHarmonics.push(parseInt(cb.value, 10));
    });
    if (dominantHarmonics.length === 0) dominantHarmonics.push(5, 7);

    return { busLabel, pKw, pfExisting, pfTarget, voltageKv, kvaScMva, dominantHarmonics };
  }

  function renderResults(r) {
    const safe = normalizeResult(r);
    resultsDiv.innerHTML = '';

    if (safe.kvarRequired === 0) {
      resultsDiv.innerHTML = `
        <section class="results-panel">
          <div class="result-badge result-badge--pass" role="status">
            ✓ Power factor is already at or above target — no capacitor bank required.
          </div>
          <p class="field-hint">Existing PF: ${safe.pfExisting} &nbsp;|&nbsp; Target PF: ${safe.pfTarget}</p>
        </section>`;
      return;
    }

    const riskColors = { safe: 'result-badge--pass', caution: 'result-badge--warn', danger: 'result-badge--fail' };
    const riskIcons  = { safe: '✓', caution: '⚠', danger: '✗' };

    const resonanceHtml = safe.resonance
      ? `<div class="result-badge ${riskColors[safe.resonance.riskLevel]}" role="status">
           ${riskIcons[safe.resonance.riskLevel]} Resonance order h<sub>r</sub> = ${safe.resonance.harmonicOrder}
           — <strong>${safe.resonance.riskLevel.toUpperCase()}</strong>
           ${safe.resonance.nearestDominant ? `(near h=${safe.resonance.nearestDominant})` : ''}
         </div>`
      : `<p class="field-hint">Resonance check skipped — short-circuit MVA not provided.</p>`;

    const detuningHtml = safe.detuning.needed
      ? `<div class="alert-warn" role="note">
           <strong>Detuned reactor recommended:</strong>
           ${safe.detuning.detuningPct}% detuning factor
           (series resonant order h = ${safe.detuning.tunedToOrder}).<br>
           <span class="field-hint">${safe.detuning.rationale}</span>
         </div>`
      : `<p class="field-hint">${safe.detuning.rationale}</p>`;

    const warningsHtml = safe.warnings.length
      ? `<ul class="drc-findings">${safe.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${w}</span></li>`).join('')}</ul>`
      : '';

    const sizeOptionsHtml = safe.standardSizes.map(s =>
      `<span class="tag${s === safe.bankSize ? ' tag--primary' : ''}">${s} kVAR</span>`
    ).join(' ');

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Capacitor Bank Sizing Results</h2>
        ${safe.busLabel ? `<p class="field-hint">Bus / Node: <strong>${safe.busLabel}</strong></p>` : ''}

        <div class="result-group">
          <div class="result-row">
            <span class="result-label">Required reactive compensation</span>
            <span class="result-value">${safe.kvarRequired} kVAR</span>
          </div>
          <p class="field-hint result-formula">
            Q<sub>cap</sub> = P × (tan(cos⁻¹(${safe.pfExisting})) − tan(cos⁻¹(${safe.pfTarget})))
            = ${safe.pKw} × (${safe.tanDeltaExisting} − ${safe.tanDeltaTarget}) = ${safe.kvarRequired} kVAR
          </p>
        </div>

        <div class="result-group">
          <div class="result-row">
            <span class="result-label">Recommended standard bank size</span>
            <span class="result-value">${safe.bankSize} kVAR</span>
          </div>
          <div class="result-row">
            <span class="result-label">2-stage switched option</span>
            <span class="result-value">2 × ${safe.stageKvar} kVAR</span>
          </div>
          <p class="field-hint">Standard sizes near required: ${sizeOptionsHtml}</p>
        </div>

        <div class="result-group">
          <h3>Harmonic Resonance Check</h3>
          ${resonanceHtml}
          ${detuningHtml}
        </div>

        ${warningsHtml}

        <p class="field-hint result-timestamp">Analysis run: ${new Date(safe.timestamp).toLocaleString()}</p>
      </section>`;
  }


  function normalizeResult(result) {
    const safeWarnings = Array.isArray(result.warnings) ? result.warnings.map(w => escHtml(String(w))) : [];
    const safeSizes = Array.isArray(result.standardSizes)
      ? result.standardSizes.map(s => Number(s)).filter(Number.isFinite)
      : [];

    const safeResonance = result.resonance
      ? {
          riskLevel: ['safe', 'caution', 'danger'].includes(result.resonance.riskLevel) ? result.resonance.riskLevel : 'safe',
          harmonicOrder: Number(result.resonance.harmonicOrder),
          nearestDominant: Number.isFinite(Number(result.resonance.nearestDominant)) ? Number(result.resonance.nearestDominant) : null
        }
      : null;

    return {
      busLabel: escHtml(String(result.busLabel || '')),
      pfExisting: Number(result.pfExisting),
      pfTarget: Number(result.pfTarget),
      pKw: Number(result.pKw),
      tanDeltaExisting: Number(result.tanDeltaExisting),
      tanDeltaTarget: Number(result.tanDeltaTarget),
      kvarRequired: Number(result.kvarRequired),
      bankSize: Number(result.bankSize),
      stageKvar: Number(result.stageKvar),
      timestamp: result.timestamp,
      detuning: {
        needed: Boolean(result.detuning?.needed),
        detuningPct: Number(result.detuning?.detuningPct),
        tunedToOrder: Number(result.detuning?.tunedToOrder),
        rationale: escHtml(String(result.detuning?.rationale || ''))
      },
      warnings: safeWarnings,
      standardSizes: safeSizes,
      resonance: safeResonance
    };
  }

  function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
});
