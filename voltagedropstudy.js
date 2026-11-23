import { runVoltageDropStudy } from './analysis/voltageDropStudy.mjs';
import {
  getCables,
  getLoads,
  getStudies,
  setCables,
  captureStudyRunContext,
  saveStudyResult,
  getStudyProvenance,
  getStudyAssessments,
  getProjectInputFingerprint,
} from './dataStore.mjs';
import {
  createStudyRunMetadata,
  fingerprintStudySource,
  isStudyResultStale,
} from './analysis/studyResultReadiness.mjs';
import { downloadCSV } from './reports/reporting.mjs';
import { studyExportMetadata } from './analysis/studyExportMetadata.mjs';
import { openModal, showAlertModal } from './src/components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn = document.getElementById('run-btn');
  const exportBtn = document.getElementById('export-btn');
  const applyBtn = document.getElementById('apply-recommendations-btn');
  const resultsEl = document.getElementById('results');
  const summaryEl = document.getElementById('summary');
  const readinessEl = document.getElementById('voltage-drop-readiness');
  let lastStudy = null;
  let lastStudyStale = false;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentSource() {
    const studies = getStudies();
    const provenance = getStudyProvenance()?.loadFlow || {};
    const loadFlow = studies.loadFlow?.converged === true
      && provenance.inputHash
      && provenance.inputHash === getProjectInputFingerprint()
      ? { ...studies.loadFlow, inputHash: provenance.inputHash }
      : null;
    const source = {
      cables: getCables(),
      loads: getLoads(),
      loadFlow,
      studyProvenance: provenance,
      inputHash: getProjectInputFingerprint(),
    };
    return {
      ...source,
      sourceFingerprint: fingerprintStudySource(source),
    };
  }

  function setReadiness(kind, title, message, details = '') {
    if (!readinessEl) return;
    readinessEl.innerHTML = `
      <div class="result-card result-${kind}">
        <strong>${esc(title)}</strong>
        <p>${esc(message)}</p>
        ${details ? `<p class="field-hint">${esc(details)}</p>` : ''}
      </div>`;
  }

  function resultUsable(study) {
    return study?.runMetadata?.valid === true && !lastStudyStale;
  }

  function updateActions() {
    const usable = resultUsable(lastStudy);
    exportBtn.disabled = !usable;
    const selected = resultsEl.querySelectorAll('.vd-recommendation-check:checked').length;
    applyBtn.disabled = selected === 0;
  }

  function renderSummary(summary, sourceCounts = {}) {
    const totalWithData = summary.evaluated || 0;
    summaryEl.hidden = false;
    summaryEl.innerHTML = `
      <div class="result-grid">
        <div class="result-card"><span class="result-label">Evaluated</span><span class="result-value">${summary.evaluated} / ${summary.total}</span></div>
        <div class="result-card result-pass"><span class="result-label">Within Recommendation</span><span class="result-value">${summary.pass}</span></div>
        <div class="result-card result-warn"><span class="result-label">Near Recommendation</span><span class="result-value">${summary.warn}</span></div>
        <div class="result-card result-fail"><span class="result-label">Individual Failures</span><span class="result-value">${summary.fail}</span></div>
        <div class="result-card result-fail"><span class="result-label">Combined Path Failures</span><span class="result-value">${summary.combinedFail}</span></div>
        <div class="result-card"><span class="result-label">Not Evaluated</span><span class="result-value">${summary.notEvaluated}</span></div>
        <div class="result-card"><span class="result-label">Max Individual Drop</span><span class="result-value">${summary.maxDropPct.toFixed(2)} %</span></div>
        <div class="result-card"><span class="result-label">Max Combined Drop</span><span class="result-value">${summary.maxCombinedDropPct.toFixed(2)} %</span></div>
        <div class="result-card"><span class="result-label">Average Drop</span><span class="result-value">${totalWithData ? summary.avgDropPct.toFixed(2) : '—'} %</span></div>
      </div>
      <p class="field-hint">Current sources: ${Object.entries(sourceCounts).map(([source, count]) => `${esc(source)} ${count}`).join(' · ') || 'none'}.</p>`;
  }

  function statusClass(status) {
    if (status === 'fail') return 'row-fail';
    if (status === 'warn') return 'row-warn';
    return '';
  }

  function renderTable(results) {
    if (!results.length) {
      resultsEl.innerHTML = '<p>No cables to display.</p>';
      updateActions();
      return;
    }

    const rows = results
      .slice()
      .sort((a, b) => b.combinedDropPct - a.combinedDropPct)
      .map(result => {
        const recommendation = result.recommendation;
        const recommendationHtml = recommendation
          ? `<label class="vd-recommendation">
              <input type="checkbox" class="vd-recommendation-check" data-cable-tag="${esc(result.tag)}">
              ${esc(recommendation.conductorSize)} (${recommendation.expectedDropPct.toFixed(2)}%)
            </label>`
          : '—';
        return `
          <tr class="${statusClass(result.combinedStatus === 'fail' ? 'fail' : result.status)}">
            <td>${esc(result.tag)}</td>
            <td>${esc(result.from)}</td>
            <td>${esc(result.to)}</td>
            <td>${esc(result.conductorSize)} ${esc(result.material)}</td>
            <td class="num">${result.lengthFt > 0 ? result.lengthFt.toFixed(0) : '—'}</td>
            <td class="num">${result.currentA > 0 ? result.currentA.toFixed(1) : '—'}</td>
            <td>${esc(result.inputSource?.current || 'missing')}</td>
            <td class="num">${result.voltageV > 0 ? result.voltageV.toFixed(0) : '—'}</td>
            <td class="num">${result.evaluated ? result.dropPct.toFixed(2) : '—'}</td>
            <td class="status-cell status-${result.status}">${result.status.toUpperCase()}</td>
            <td>${result.pathTags.map(esc).join(' → ') || '—'}</td>
            <td class="num">${result.pathEvaluated ? result.combinedDropPct.toFixed(2) : '—'}</td>
            <td class="num">${result.combinedLimitPct.toFixed(1)}</td>
            <td class="status-cell status-${result.combinedStatus}">${result.combinedStatus.toUpperCase()}</td>
            <td>${recommendationHtml}</td>
          </tr>`;
      }).join('');

    resultsEl.innerHTML = `
      <div class="table-scroll">
        <table class="results-table" aria-label="Voltage drop recommendation results">
          <thead><tr>
            <th scope="col">Cable</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Conductor</th>
            <th scope="col" class="num">Length (ft)</th>
            <th scope="col" class="num">Current (A)</th>
            <th scope="col">Current Source</th>
            <th scope="col" class="num">Voltage (V)</th>
            <th scope="col" class="num">Individual Drop (%)</th>
            <th scope="col">Individual Status</th>
            <th scope="col">Connected Path</th>
            <th scope="col" class="num">Combined Drop (%)</th>
            <th scope="col" class="num">Combined Limit (%)</th>
            <th scope="col">Combined Status</th>
            <th scope="col">Recommendation</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    resultsEl.querySelectorAll('.vd-recommendation-check').forEach(input => {
      input.addEventListener('change', updateActions);
    });
    updateActions();
  }

  function renderStudy(study, options = {}) {
    lastStudy = study;
    lastStudyStale = Boolean(options.stale);
    renderSummary(study.summary, study.sourceCounts);
    renderTable(study.results);
    if (options.stale) {
      setReadiness('warn', 'Saved result is stale', 'Cable, load, or Load Flow inputs changed after this result was saved.', 'Rerun before export or report use.');
    } else if (study.runMetadata?.valid === true) {
      setReadiness('ok', 'Complete current result', 'All cables were evaluated. The result is saved and available to Scenario Comparison and Project Report.');
    } else {
      setReadiness('warn', 'Input review required', 'The partial result is shown but was not saved.', study.warnings?.join(' ') || 'Complete every cable input and rerun.');
    }
    updateActions();
  }

  function runStudy() {
    const source = currentSource();
    if (!source.cables.length) {
      showAlertModal('No Data', 'No cables found in the Cable Schedule. Add cables first.');
      return;
    }

    let study;
    try {
      study = runVoltageDropStudy(source.cables, {
        loads: source.loads,
        loadFlow: source.loadFlow,
      });
    } catch (error) {
      showAlertModal('Study Error', error.message);
      return;
    }

    const complete = study.summary.total > 0
      && study.summary.evaluated === study.summary.total
      && study.results.every(result => result.pathEvaluated);
    const coverage = {
      valid: complete,
      status: complete ? 'valid' : 'incomplete',
      convergedCount: study.summary.evaluated,
      totalCount: study.summary.total,
      coveragePct: study.summary.coveragePct,
      message: `${study.summary.evaluated} of ${study.summary.total} cables evaluated.`,
    };
    study = {
      ...study,
      generatedAt: new Date().toISOString(),
      runMetadata: createStudyRunMetadata(
        'voltageDropStudy',
        {
          ready: complete,
          sourceFingerprint: source.sourceFingerprint,
          counts: {
            cables: source.cables.length,
            loads: source.loads.length,
            loadFlowBuses: source.loadFlow?.buses?.length || 0,
          },
        },
        coverage,
        {
          source: source.loadFlow
            ? 'Cable Schedule + Load Flow + Load List'
            : 'Cable Schedule + Load List',
        },
      ),
    };
    if (complete) {
      saveStudyResult('voltageDropStudy', study, captureStudyRunContext('voltageDropStudy', { inputs: study.inputs || {}, options: {} }));
    }
    renderStudy(study);
  }

  async function applyRecommendations() {
    if (!lastStudy) return;
    const selectedTags = [...resultsEl.querySelectorAll('.vd-recommendation-check:checked')]
      .map(input => input.dataset.cableTag);
    const selected = lastStudy.results.filter(result => selectedTags.includes(result.tag) && result.recommendation);
    if (!selected.length) return;

    const accepted = await openModal({
      title: 'Apply Voltage Drop Recommendations',
      message: `<p>Update ${selected.length} Cable Schedule row(s), then rerun the study?</p>
        <ul>${selected.map(result => `<li>${esc(result.tag)}: ${esc(result.conductorSize)} → ${esc(result.recommendation.conductorSize)}</li>`).join('')}</ul>`,
      primaryText: 'Apply & Rerun',
      secondaryText: 'Cancel',
      variant: 'wide',
    });
    if (!accepted) return;

    const recommendationByTag = new Map(selected.map(result => [result.tag, result.recommendation.conductorSize]));
    const updated = getCables().map(cable => {
      const tag = cable.cable_tag || cable.tag || cable.id || '';
      const conductorSize = recommendationByTag.get(tag);
      return conductorSize ? { ...cable, conductor_size: conductorSize } : cable;
    });
    setCables(updated);
    runStudy();
  }

  function exportCSV() {
    if (!resultUsable(lastStudy)) return;
    const headers = [
      'Cable', 'From', 'To', 'Conductor', 'Length (ft)', 'Current (A)', 'Current Source',
      'Voltage (V)', 'Individual Drop (%)', 'Individual Limit (%)', 'Individual Status',
      'Connected Path', 'Combined Drop (%)', 'Combined Limit (%)', 'Combined Status',
      'Recommended Conductor', 'Recommended Drop (%)', 'Basis', 'Validity', 'Units',
      'Input Sources', 'Assumptions', 'Model Limits', 'Warnings', 'Input Fingerprint',
      'Freshness', 'Eligibility', 'Result Status', 'Calculation Version', 'Calculated At',
      'Limitations', 'Study Options', 'Provenance',
    ];
    const lifecycle = studyExportMetadata(lastStudy, { assessment: getStudyAssessments().voltageDropStudy });
    const rows = lastStudy.results.map(result => ({
      Cable: result.tag,
      From: result.from,
      To: result.to,
      Conductor: `${result.conductorSize} ${result.material}`,
      'Length (ft)': result.lengthFt || '',
      'Current (A)': result.currentA || '',
      'Current Source': result.inputSource?.current || '',
      'Voltage (V)': result.voltageV || '',
      'Individual Drop (%)': result.evaluated ? result.dropPct.toFixed(3) : '',
      'Individual Limit (%)': result.limit,
      'Individual Status': result.status,
      'Connected Path': result.pathTags.join(' -> '),
      'Combined Drop (%)': result.pathEvaluated ? result.combinedDropPct.toFixed(3) : '',
      'Combined Limit (%)': result.combinedLimitPct,
      'Combined Status': result.combinedStatus,
      'Recommended Conductor': result.recommendation?.conductorSize || '',
      'Recommended Drop (%)': result.recommendation?.expectedDropPct?.toFixed(3) || '',
      Basis: result.basis,
      Validity: result.resultContract?.validity || 'unevaluated',
      Units: result.resultContract?.units || '%',
      'Input Sources': JSON.stringify(result.resultContract?.inputSources || {}),
      Assumptions: JSON.stringify(result.resultContract?.assumptions || {}),
      'Model Limits': JSON.stringify(result.resultContract?.modelLimits || {}),
      Warnings: JSON.stringify(result.resultContract?.warnings || []),
      'Input Fingerprint': result.resultContract?.inputFingerprint || '',
      Freshness: lifecycle.freshness,
      Eligibility: lifecycle.resultEligibility,
      'Result Status': lifecycle.resultStatus,
      'Calculation Version': lifecycle.calculationVersion,
      'Calculated At': lifecycle.calculatedAt,
      Limitations: lifecycle.limitations,
      'Study Options': lifecycle.studyOptions,
      Provenance: lifecycle.provenance,
    }));
    downloadCSV(headers, rows, 'voltage-drop-study.csv');
  }

  runBtn.addEventListener('click', runStudy);
  exportBtn.addEventListener('click', exportCSV);
  applyBtn.addEventListener('click', applyRecommendations);

  const saved = getStudies().voltageDropStudy;
  if (saved?.results?.length) {
    const source = currentSource();
    renderStudy(saved, {
      stale: isStudyResultStale(saved, source.sourceFingerprint),
    });
  } else {
    setReadiness('info', 'Ready to evaluate', 'Run the study after completing cable lengths and conductor sizes.', 'Current and voltage can be resolved from Load Flow or the Load List.');
  }
});
