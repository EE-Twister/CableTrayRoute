/**
 * Cross-Study Design Coach — Page orchestration (Gap #79)
 *
 * Loads project data, runs the coach engine, renders recommendations,
 * and persists accept/dismiss audit trail via dataStore.
 */
import './workflowStatus.js';
import '../site.js';

import { runDesignCoach, SEVERITY_ORDER } from '../analysis/designCoach.mjs';
import {
  getCables,
  getTrays,
  getStudies,
  getCoachAuditTrail,
  setCoachAuditTrail,
} from '../dataStore.mjs';
import { openModal } from './components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn            = document.getElementById('coach-run-btn');
  const severityFilter    = document.getElementById('coach-severity-filter');
  const clearDismissedBtn = document.getElementById('coach-clear-dismissed-btn');
  const resultsSection    = document.getElementById('coach-results');

  let lastResult   = null;
  let auditTrail   = getCoachAuditTrail();

  runBtn.addEventListener('click', runAndRender);
  severityFilter.addEventListener('change', () => { if (lastResult) renderResults(lastResult); });
  clearDismissedBtn.addEventListener('click', async () => {
    const dismissed = auditTrail.filter(e => e.action === 'dismiss');
    if (!dismissed.length) return;
    const confirmed = await openModal({
      title: 'Clear Dismissed Items',
      primaryText: 'Clear',
      secondaryText: 'Cancel',
      render(body) {
        const p = document.createElement('p');
        p.textContent = `This will restore ${dismissed.length} dismissed recommendation(s). Continue?`;
        body.appendChild(p);
      },
      onSubmit() { return true; },
    });
    if (!confirmed) return;
    auditTrail = auditTrail.filter(e => e.action !== 'dismiss');
    setCoachAuditTrail(auditTrail);
    if (lastResult) renderResults(lastResult);
  });

  // Accept / Dismiss via event delegation
  resultsSection.addEventListener('click', async e => {
    const dismissBtn = e.target.closest('.coach-dismiss-btn');
    const acceptBtn  = e.target.closest('.coach-accept-btn');
    const revokeBtn  = e.target.closest('.coach-revoke-btn');

    if (dismissBtn) {
      const id = dismissBtn.dataset.id;
      auditTrail = [...auditTrail.filter(x => x.id !== id), {
        id,
        action: 'dismiss',
        note: '',
        reviewedBy: '',
        decidedAt: new Date().toISOString(),
      }];
      setCoachAuditTrail(auditTrail);
      if (lastResult) renderResults(lastResult);
    }

    if (acceptBtn && lastResult) {
      const id  = acceptBtn.dataset.id;
      const rec = lastResult.recommendations.find(r => r.id === id);
      if (!rec) return;

      let noteEl, reviewerEl;
      const result = await openModal({
        title: 'Accept Recommendation',
        primaryText: 'Accept',
        secondaryText: 'Cancel',
        render(body) {
          const p = document.createElement('p');
          p.textContent = 'Document the engineering basis for accepting this item:';
          body.appendChild(p);

          const msgP = document.createElement('p');
          msgP.style.fontWeight = '600';
          msgP.style.marginTop = '0.5rem';
          msgP.textContent = rec.title;
          body.appendChild(msgP);

          const noteLabel = document.createElement('label');
          noteLabel.textContent = 'Engineering note (required):';
          noteLabel.style.display = 'block';
          noteLabel.style.marginTop = '0.75rem';

          noteEl = document.createElement('textarea');
          noteEl.rows = 3;
          noteEl.style.width = '100%';
          noteEl.style.marginTop = '0.25rem';
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
          reviewerEl.placeholder = 'e.g. J. Smith, PE';
          reviewerLabel.appendChild(reviewerEl);
          body.appendChild(reviewerLabel);

          return noteEl;
        },
        onSubmit() {
          const note = noteEl ? noteEl.value.trim() : '';
          if (!note) { if (noteEl) noteEl.focus(); return false; }
          return { note, reviewedBy: reviewerEl ? reviewerEl.value.trim() : '' };
        },
      });

      if (!result) return;

      auditTrail = [...auditTrail.filter(x => x.id !== id), {
        id,
        action: 'accept',
        note: result.note,
        reviewedBy: result.reviewedBy,
        decidedAt: new Date().toISOString(),
      }];
      setCoachAuditTrail(auditTrail);
      if (lastResult) renderResults(lastResult);
    }

    if (revokeBtn) {
      const id = revokeBtn.dataset.id;
      auditTrail = auditTrail.filter(x => x.id !== id);
      setCoachAuditTrail(auditTrail);
      if (lastResult) renderResults(lastResult);
    }
  });

  function runAndRender() {
    const cables  = getCables()  || [];
    const trays   = getTrays()   || [];
    const studies = getStudies() || {};

    lastResult = runDesignCoach({ cables, trays, studies });
    renderKpi(lastResult.summary);
    renderResults(lastResult);
  }

  function renderKpi(summary) {
    document.getElementById('kpi-safety').textContent     = summary.safety;
    document.getElementById('kpi-compliance').textContent = summary.compliance;
    document.getElementById('kpi-efficiency').textContent = summary.efficiency;
    document.getElementById('kpi-missing').textContent    = summary.missing_data;
  }

  function renderResults({ recommendations }) {
    const filterVal   = severityFilter.value;
    const auditMap    = new Map(auditTrail.map(e => [e.id, e]));

    const filtered = filterVal === 'all'
      ? recommendations
      : recommendations.filter(r => r.severity === filterVal);

    resultsSection.innerHTML = '';

    if (!filtered.length) {
      const div = document.createElement('div');
      div.className = 'coach-empty';
      div.textContent = recommendations.length
        ? 'No recommendations match the current filter.'
        : 'No recommendations found. Run studies and refresh to check your project.';
      resultsSection.appendChild(div);
      return;
    }

    for (const rec of filtered) {
      const entry      = auditMap.get(rec.id);
      const isDismissed = entry?.action === 'dismiss';
      const isAccepted  = entry?.action === 'accept';

      const article = document.createElement('article');
      article.className = `coach-rec coach-rec--${rec.severity}${isDismissed ? ' coach-rec--dismissed' : ''}`;
      article.dataset.id = rec.id;

      const severityLabels = {
        safety: 'Safety', compliance: 'Compliance',
        efficiency: 'Efficiency', missing_data: 'Missing Data',
      };

      article.innerHTML = `
        <div class="coach-rec-header">
          <span class="result-badge result-badge--${rec.severity === 'missing_data' ? 'info' : rec.severity === 'efficiency' ? 'warn' : rec.severity}">${severityLabels[rec.severity] ?? rec.severity}</span>
          <span class="coach-rec-source">Study: <a href="${escHtml(rec.studyPage)}">${escHtml(rec.sourceStudy)}</a></span>
          <span class="coach-rec-location">${escHtml(rec.location)}</span>
        </div>
        <h3 class="coach-rec-title">${escHtml(rec.title)}</h3>
        <p class="coach-rec-detail">${escHtml(rec.detail)}</p>
        ${rec.tradeoffs ? `<p class="coach-rec-tradeoffs">Trade-off: ${escHtml(rec.tradeoffs)}</p>` : ''}
        <div class="coach-rec-actions">
          ${isAccepted
            ? `<span class="coach-accepted-note">Accepted${entry.reviewedBy ? ` by ${escHtml(entry.reviewedBy)}` : ''} on ${new Date(entry.decidedAt).toLocaleDateString()}: ${escHtml(entry.note)}</span>
               <button class="coach-revoke-btn btn" data-id="${escHtml(rec.id)}">Revoke</button>`
            : isDismissed
              ? `<span class="coach-accepted-note">Dismissed</span>`
              : `<button class="coach-accept-btn btn" data-id="${escHtml(rec.id)}">Accept</button>
                 <button class="coach-dismiss-btn btn" data-id="${escHtml(rec.id)}">Dismiss</button>`
          }
        </div>
      `;

      resultsSection.appendChild(article);
    }
  }

  // Run on load if project data exists
  runAndRender();
});

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
