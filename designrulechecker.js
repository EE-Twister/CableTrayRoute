/**
 * Design Rule Checker (DRC) — Page logic
 *
 * Runs NEC/IEEE design validation rules against the project's cable and
 * raceway data and displays findings grouped by severity.
 */
import { runDRC, formatDrcReport, DRC_SEVERITY } from './analysis/designRuleChecker.mjs';
import { getTrays, getCables } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn        = document.getElementById('drc-run-btn');
  const exportBtn     = document.getElementById('drc-export-btn');
  const fillLimitIn   = document.getElementById('drc-fill-limit');
  const skipGndChk    = document.getElementById('drc-skip-grounding');
  const skipAmpChk    = document.getElementById('drc-skip-ampacity');
  const resultsDiv    = document.getElementById('drc-results');
  const summaryDiv    = document.getElementById('drc-summary');

  let lastResult = null;

  runBtn.addEventListener('click', runCheck);
  exportBtn.addEventListener('click', exportReport);

  function runCheck() {
    const trays  = getTrays()  || [];
    const cables = getCables() || [];

    // Retrieve trayCableMap from localStorage cache (written by optimalRoute page)
    let trayCableMap = {};
    let routedCableNames = new Set();
    try {
      const cached = JSON.parse(localStorage.getItem('routeCache') || '{}');
      if (cached && cached.trayCableMap) {
        trayCableMap = cached.trayCableMap;
      }
      // Also check latestRouteData for field-routed cables
      const latestRoutes = JSON.parse(localStorage.getItem('latestRouteData') || '[]');
      latestRoutes.forEach(r => {
        if (r.cable && r.status && r.status.includes('Routed')) routedCableNames.add(r.cable);
      });
    } catch (e) {
      console.warn('DRC: could not read route cache', e);
    }

    const fillLimit = parseFloat(fillLimitIn.value) / 100;
    if (!Number.isFinite(fillLimit) || fillLimit <= 0 || fillLimit > 1) {
      showAlertModal('Invalid Input', 'Fill limit must be between 1 and 100 %.');
      return;
    }

    let result;
    try {
      result = runDRC(
        { trays, cables, trayCableMap, routedCableNames },
        {
          fillLimit,
          skipGrounding: skipGndChk.checked,
          skipAmpacity:  skipAmpChk.checked,
        }
      );
    } catch (err) {
      showAlertModal('DRC Error', err.message);
      console.error('DRC run failed', err);
      return;
    }

    lastResult = result;
    renderSummary(result.summary);
    renderFindings(result.findings);
    exportBtn.disabled = false;
  }

  function renderSummary(summary) {
    const statusClass = summary.passed ? 'result-ok' : 'result-fail';
    const statusText  = summary.passed ? 'PASSED' : 'FAILED';
    summaryDiv.innerHTML = `
      <div class="drc-status ${statusClass}">
        <strong>${statusText}</strong>
        &mdash; ${summary.errors} error${summary.errors !== 1 ? 's' : ''},
                ${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''},
                ${summary.info} info
      </div>`;
  }

  function renderFindings(findings) {
    if (findings.length === 0) {
      resultsDiv.innerHTML = '<p class="drc-no-findings">No findings. All checks passed.</p>';
      return;
    }

    const severityOrder = { error: 0, warning: 1, info: 2 };
    const sorted = [...findings].sort(
      (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
    );

    const rows = sorted.map(f => {
      const badgeClass = f.severity === DRC_SEVERITY.ERROR   ? 'badge-error'
                       : f.severity === DRC_SEVERITY.WARNING ? 'badge-warn'
                       : 'badge-info';
      const badge = `<span class="drc-badge ${badgeClass}">${f.severity.toUpperCase()}</span>`;
      const ref   = f.reference
        ? `<span class="drc-ref">${escapeHtml(f.reference)}</span>`
        : '';
      const detail = f.detail
        ? `<p class="drc-detail">${escapeHtml(f.detail)}</p>`
        : '';
      const remediation = f.remediation
        ? `<p class="drc-remediation"><strong>How to fix:</strong> ${escapeHtml(f.remediation)}</p>`
        : '';
      return `
        <div class="drc-finding drc-finding--${f.severity}">
          <div class="drc-finding-header">
            ${badge}
            <span class="drc-rule-id">${escapeHtml(f.ruleId)}</span>
            <span class="drc-location">${escapeHtml(f.location)}</span>
            ${ref}
          </div>
          <p class="drc-message">${escapeHtml(f.message)}</p>
          ${detail}
          ${remediation}
        </div>`;
    }).join('');

    resultsDiv.innerHTML = rows;
  }

  function exportReport() {
    if (!lastResult) return;
    const text = formatDrcReport(lastResult);
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'drc-report.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
