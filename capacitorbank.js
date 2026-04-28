import {
  buildCapacitorBankDutyPackage,
  renderCapacitorBankDutyHTML,
  runCapacitorBankAnalysis,
} from './analysis/capacitorBank.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { downloadCSV } from './reports/reporting.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('cap-bank-form');
  const resultsDiv = document.getElementById('results');
  const saveBtn = document.getElementById('cap-save-btn');
  const exportJsonBtn = document.getElementById('cap-export-json-btn');
  const exportCsvBtn = document.getElementById('cap-export-csv-btn');
  const exportHtmlBtn = document.getElementById('cap-export-html-btn');
  let lastPackage = null;

  initStudyApprovalPanel('capacitorBank');

  // --- Restore previous results from project store ---
  const saved = getStudies().capacitorBank;
  if (saved) {
    renderResults(saved);
    lastPackage = saved.version ? saved : null;
    setExportEnabled(Boolean(lastPackage));
  }

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      const baseResult = runCapacitorBankAnalysis(inputs);
      result = buildCapacitorBankDutyPackage({
        projectName: document.body.dataset.reportTitle || 'Capacitor Bank Sizing',
        baseResult,
        dutyCase: readDutyCase(baseResult),
        stageRows: readStageRows(),
        frequencyScan: getStudies().frequencyScan,
        harmonicStudy: getStudies().harmonicStudyCase || getStudies().harmonics,
      });
    } catch (err) {
      showModal('Analysis Error', `<p>${err.message}</p>`, 'error');
      return;
    }

    // Persist
    const studies = getStudies();
    studies.capacitorBank = result;
    setStudies(studies);
    lastPackage = result;
    setExportEnabled(true);

    renderResults(result);
  });

  saveBtn?.addEventListener('click', () => {
    if (!lastPackage) return;
    setStudies({ ...getStudies(), capacitorBank: lastPackage });
    showModal('Study Saved', '<p>Capacitor bank duty package saved to project studies.</p>', 'success');
  });
  exportJsonBtn?.addEventListener('click', () => {
    if (!lastPackage) return;
    downloadText('capacitor-bank-duty-package.json', JSON.stringify(lastPackage, null, 2), 'application/json');
  });
  exportHtmlBtn?.addEventListener('click', () => {
    if (!lastPackage) return;
    downloadText('capacitor-bank-duty-package.html', renderCapacitorBankDutyHTML(lastPackage), 'text/html');
  });
  exportCsvBtn?.addEventListener('click', () => {
    if (!lastPackage) return;
    const rows = [
      ...lastPackage.stageRows.map(row => ({ recordType: 'stage', ...row })),
      ...lastPackage.dutyRows.map(row => ({ recordType: 'duty', ...row })),
      ...lastPackage.protectionRows.map(row => ({ recordType: 'protection', ...row })),
      ...lastPackage.switchingRows.map(row => ({ recordType: 'switching', ...row })),
      ...lastPackage.warningRows.map(row => ({ recordType: 'warning', ...row })),
    ];
    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
    downloadCSV(headers, rows.map(row => headers.map(header => row[header] ?? '')), 'capacitor-bank-duty.csv');
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

  function readDutyCase(baseResult) {
    const get = id => document.getElementById(id);
    const getFloat = id => {
      const value = parseFloat(get(id)?.value || '');
      return Number.isFinite(value) ? value : undefined;
    };
    return {
      busLabel: baseResult.busLabel,
      voltageKv: baseResult.voltageKv,
      targetPowerFactor: baseResult.pfTarget,
      controllerDeadband: getFloat('cap-deadband'),
      controllerTimeDelaySec: getFloat('cap-time-delay'),
      minimumStepKvar: getFloat('cap-min-step'),
      controlMode: get('cap-control-mode')?.value || 'automatic',
      topology: get('cap-topology')?.value || 'plain',
      reactorPercent: getFloat('cap-reactor-percent'),
      tunedOrder: getFloat('cap-tuned-order'),
      targetHarmonics: String(get('cap-target-harmonics')?.value || '').split(',').map(v => Number(v.trim())).filter(Number.isFinite),
      linkedFilterAlternativeId: get('cap-filter-id')?.value || '',
      breakerTag: get('cap-breaker-tag')?.value || '',
      contactorTag: get('cap-contactor-tag')?.value || '',
      fuseTag: get('cap-fuse-tag')?.value || '',
      ctRatio: get('cap-ct-ratio')?.value || '',
      inrushLimitA: getFloat('cap-inrush-limit'),
      outrushLimitA: getFloat('cap-outrush-limit'),
      dischargeLimitSec: getFloat('cap-discharge-limit'),
      unbalanceProtection: Boolean(get('cap-unbalance-protection')?.checked),
    };
  }

  function readStageRows() {
    const raw = document.getElementById('cap-stage-rows')?.value.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Stage rows JSON must be an array.');
    return parsed;
  }

  function setExportEnabled(enabled) {
    [saveBtn, exportJsonBtn, exportCsvBtn, exportHtmlBtn].forEach(button => {
      if (button) button.disabled = !enabled;
    });
  }

  function renderResults(savedResult) {
    const isPackage = savedResult?.version;
    const r = isPackage ? savedResult.baseResult : savedResult;
    resultsDiv.innerHTML = '';

    if (r.kvarRequired === 0) {
      resultsDiv.innerHTML = `
        <section class="results-panel">
          <div class="result-badge result-badge--pass" role="status">
            ✓ Power factor is already at or above target — no capacitor bank required.
          </div>
          <p class="field-hint">Existing PF: ${r.pfExisting} &nbsp;|&nbsp; Target PF: ${r.pfTarget}</p>
        </section>`;
      if (isPackage) {
        resultsDiv.insertAdjacentHTML('beforeend', renderCapacitorBankDutyHTML(savedResult));
      }
      return;
    }

    const riskColors = { safe: 'result-badge--pass', caution: 'result-badge--warn', danger: 'result-badge--fail' };
    const riskIcons  = { safe: '✓', caution: '⚠', danger: '✗' };

    const resonanceHtml = r.resonance
      ? `<div class="result-badge ${riskColors[r.resonance.riskLevel]}" role="status">
           ${riskIcons[r.resonance.riskLevel]} Resonance order h<sub>r</sub> = ${r.resonance.harmonicOrder}
           — <strong>${r.resonance.riskLevel.toUpperCase()}</strong>
           ${r.resonance.nearestDominant ? `(near h=${r.resonance.nearestDominant})` : ''}
         </div>`
      : `<p class="field-hint">Resonance check skipped — short-circuit MVA not provided.</p>`;

    const detuningHtml = r.detuning.needed
      ? `<div class="alert-warn" role="note">
           <strong>Detuned reactor recommended:</strong>
           ${r.detuning.detuningPct}% detuning factor
           (series resonant order h = ${r.detuning.tunedToOrder}).<br>
           <span class="field-hint">${r.detuning.rationale}</span>
         </div>`
      : `<p class="field-hint">${r.detuning.rationale}</p>`;

    const warningsHtml = r.warnings.length
      ? `<ul class="drc-findings">${r.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${w}</span></li>`).join('')}</ul>`
      : '';

    const sizeOptionsHtml = r.standardSizes.map(s =>
      `<span class="tag${s === r.bankSize ? ' tag--primary' : ''}">${s} kVAR</span>`
    ).join(' ');

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Capacitor Bank Sizing Results</h2>
        ${r.busLabel ? `<p class="field-hint">Bus / Node: <strong>${escHtml(r.busLabel)}</strong></p>` : ''}

        <div class="result-group">
          <div class="result-row">
            <span class="result-label">Required reactive compensation</span>
            <span class="result-value">${r.kvarRequired} kVAR</span>
          </div>
          <p class="field-hint result-formula">
            Q<sub>cap</sub> = P × (tan(cos⁻¹(${r.pfExisting})) − tan(cos⁻¹(${r.pfTarget})))
            = ${r.pKw} × (${r.tanDeltaExisting} − ${r.tanDeltaTarget}) = ${r.kvarRequired} kVAR
          </p>
        </div>

        <div class="result-group">
          <div class="result-row">
            <span class="result-label">Recommended standard bank size</span>
            <span class="result-value">${r.bankSize} kVAR</span>
          </div>
          <div class="result-row">
            <span class="result-label">2-stage switched option</span>
            <span class="result-value">2 × ${r.stageKvar} kVAR</span>
          </div>
          <p class="field-hint">Standard sizes near required: ${sizeOptionsHtml}</p>
        </div>

        <div class="result-group">
          <h3>Harmonic Resonance Check</h3>
          ${resonanceHtml}
          ${detuningHtml}
        </div>

        ${warningsHtml}

        <p class="field-hint result-timestamp">Analysis run: ${new Date(r.timestamp).toLocaleString()}</p>
      </section>
      ${isPackage ? renderCapacitorBankDutyHTML(savedResult) : ''}`;
  }

  function downloadText(fileName, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
});
