/**
 * Design Rule Checker (DRC) — Page logic
 *
 * Runs NEC/IEEE design validation rules against the project's cable and
 * raceway data and displays findings grouped by severity.
 */
import { runDRC, formatDrcReport, DRC_SEVERITY } from './analysis/designRuleChecker.mjs';
import { getTrays, getCables, getDrcAcceptedFindings, setDrcAcceptedFindings } from './dataStore.mjs';
import { openModal } from './src/components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn            = document.getElementById('drc-run-btn');
  const exportBtn         = document.getElementById('drc-export-btn');
  const clearAcceptedBtn  = document.getElementById('drc-clear-accepted-btn');
  const fillLimitIn       = document.getElementById('drc-fill-limit');
  const skipGndChk    = document.getElementById('drc-skip-grounding');
  const skipAmpChk    = document.getElementById('drc-skip-ampacity');
  const resultsDiv    = document.getElementById('drc-results');
  const summaryDiv    = document.getElementById('drc-summary');

  let lastResult       = null;
  let acceptedFindings = getDrcAcceptedFindings();

  runBtn.addEventListener('click', runAndRender);
  exportBtn.addEventListener('click', exportReport);
  clearAcceptedBtn.addEventListener('click', async () => {
    if (!acceptedFindings.length) return;
    const confirmed = await openModal({
      title: 'Clear All Accepted Risks',
      primaryText: 'Clear',
      secondaryText: 'Cancel',
      render(body) {
        const p = document.createElement('p');
        p.textContent = `This will remove all ${acceptedFindings.length} accepted risk record(s). Are you sure?`;
        body.appendChild(p);
      },
      onSubmit() { return true; },
    });
    if (!confirmed) return;
    acceptedFindings = [];
    setDrcAcceptedFindings(acceptedFindings);
    if (lastResult) runAndRender();
  });

  // Event delegation: "Accept Risk" and "Revoke" buttons inside findings
  resultsDiv.addEventListener('click', async e => {
    const acceptBtn = e.target.closest('.drc-accept-btn');
    const revokeBtn = e.target.closest('.drc-revoke-btn');

    if (acceptBtn && lastResult) {
      const key     = acceptBtn.dataset.key;
      const finding = lastResult.findings.find(f => f.acceptedKey === key);
      if (!finding) return;

      // Open modal to collect engineering note and reviewer name
      let noteEl, reviewerEl;
      const result = await openModal({
        title: 'Accept Risk',
        primaryText: 'Accept',
        secondaryText: 'Cancel',
        render(body) {
          const p = document.createElement('p');
          p.textContent = 'Document the engineering basis for accepting this violation:';
          body.appendChild(p);

          const msgP = document.createElement('p');
          msgP.className = 'drc-accept-modal-msg';
          msgP.textContent = finding.message;
          body.appendChild(msgP);

          const noteLabel = document.createElement('label');
          noteLabel.textContent = 'Engineering note (required):';
          noteLabel.style.display = 'block';
          noteLabel.style.marginTop = '0.75rem';

          noteEl = document.createElement('textarea');
          noteEl.rows = 3;
          noteEl.style.width = '100%';
          noteEl.style.marginTop = '0.25rem';
          noteEl.id = 'drc-accept-note';
          noteEl.setAttribute('required', '');
          noteLabel.appendChild(noteEl);
          body.appendChild(noteLabel);

          const reviewerLabel = document.createElement('label');
          reviewerLabel.textContent = 'Reviewed by (optional):';
          reviewerLabel.style.display = 'block';
          reviewerLabel.style.marginTop = '0.5rem';

          reviewerEl = document.createElement('input');
          reviewerEl.type = 'text';
          reviewerEl.style.width = '100%';
          reviewerEl.style.marginTop = '0.25rem';
          reviewerEl.id = 'drc-accept-reviewer';
          reviewerEl.placeholder = 'e.g. J. Smith, PE';
          reviewerLabel.appendChild(reviewerEl);
          body.appendChild(reviewerLabel);

          return noteEl; // initial focus
        },
        onSubmit() {
          const note = noteEl ? noteEl.value.trim() : '';
          if (!note) {
            if (noteEl) noteEl.focus();
            return false; // prevent close — note is required
          }
          return {
            note,
            reviewedBy: reviewerEl ? reviewerEl.value.trim() : '',
          };
        },
      });

      if (!result) return; // cancelled

      const acceptance = {
        key,
        ruleId:     finding.ruleId,
        location:   finding.location,
        note:       result.note,
        reviewedBy: result.reviewedBy,
        acceptedAt: new Date().toISOString(),
      };

      acceptedFindings = [...acceptedFindings.filter(a => a.key !== key), acceptance];
      setDrcAcceptedFindings(acceptedFindings);
      runAndRender();
    }

    if (revokeBtn && lastResult) {
      const key = revokeBtn.dataset.key;
      acceptedFindings = acceptedFindings.filter(a => a.key !== key);
      setDrcAcceptedFindings(acceptedFindings);
      runAndRender();
    }
  });

  function runAndRender() {
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
          skipGrounding:   skipGndChk.checked,
          skipAmpacity:    skipAmpChk.checked,
          acceptedFindings,
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
    clearAcceptedBtn.disabled = acceptedFindings.length === 0;
  }

  function renderSummary(summary) {
    const accepted   = summary.accepted ?? 0;
    const statusClass = summary.passed ? 'result-ok' : 'result-fail';
    const statusText  = summary.passed ? 'PASSED' : 'FAILED';
    const acceptedText = accepted > 0
      ? `, ${accepted} accepted risk${accepted !== 1 ? 's' : ''}`
      : '';
    summaryDiv.innerHTML = `
      <div class="drc-status ${statusClass}">
        <strong>${statusText}</strong>
        &mdash; ${summary.errors} error${summary.errors !== 1 ? 's' : ''},
                ${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''},
                ${summary.info} info${acceptedText}
      </div>`;
  }

  function renderFindings(findings) {
    if (findings.length === 0) {
      resultsDiv.innerHTML = '<p class="drc-no-findings">No findings. All checks passed.</p>';
      return;
    }

    // Sort: accepted last, then by severity within each group
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const sorted = [...findings].sort((a, b) => {
      if (a.isAccepted !== b.isAccepted) return a.isAccepted ? 1 : -1;
      return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    });

    const rows = sorted.map(f => {
      if (f.isAccepted) {
        // Render accepted finding with amber badge and note
        const ref = f.reference
          ? `<span class="drc-ref">${escapeHtml(f.reference)}</span>`
          : '';
        return `
          <div class="drc-finding drc-finding--accepted">
            <div class="drc-finding-header">
              <span class="drc-badge badge-accepted">ACCEPTED RISK</span>
              <span class="drc-rule-id">${escapeHtml(f.ruleId)}</span>
              <span class="drc-location">${escapeHtml(f.location)}</span>
              ${ref}
            </div>
            <p class="drc-message">${escapeHtml(f.message)}</p>
            <div class="drc-accepted-block">
              <p class="drc-acceptance-note">${escapeHtml(f.acceptanceNote)}</p>
              ${f.acceptedBy ? `<p class="drc-accepted-by">Reviewed by: ${escapeHtml(f.acceptedBy)}</p>` : ''}
              <button class="drc-revoke-btn" data-key="${escapeHtml(f.acceptedKey)}"
                      type="button" aria-label="Revoke acceptance for ${escapeHtml(f.ruleId)} at ${escapeHtml(f.location)}">
                Revoke
              </button>
            </div>
          </div>`;
      }

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
          <button class="drc-accept-btn" data-key="${escapeHtml(f.acceptedKey)}"
                  type="button" aria-label="Accept risk for ${escapeHtml(f.ruleId)} at ${escapeHtml(f.location)}">
            Accept Risk
          </button>
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
