/**
 * Study-level Engineer Review / PE Approval Panel
 *
 * Renders a persistent "Engineer Review" card on electrical study pages so a
 * Professional Engineer can stamp study results as Pending / Approved / Flagged
 * with their name, date, and an engineering rationale note.
 *
 * Usage:
 *   import { initStudyApprovalPanel } from './src/components/studyApproval.js';
 *   initStudyApprovalPanel('arcFlash');          // uses default container id
 *   initStudyApprovalPanel('loadFlow', 'my-id'); // custom container id
 */

import {
  getStudyApprovals,
  setStudyApproval,
  clearStudyApproval,
} from '../../dataStore.mjs';

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_LABELS = {
  pending:  'Pending Review',
  approved: 'Approved by PE',
  flagged:  'Flagged — Needs Attention',
};

const STATUS_BADGE_CLASS = {
  pending:  'approval-badge--pending',
  approved: 'approval-badge--approved',
  flagged:  'approval-badge--flagged',
};

/**
 * Escape a string for safe insertion into HTML text content.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the approval badge HTML for a given approval record.
 * Can be used by PDF/export code to embed a stamp in reports.
 *
 * @param {{status:string, reviewedBy:string, approvedAt:string, note:string}|null} approval
 * @returns {string} HTML string
 */
export function getApprovalBadgeHTML(approval) {
  if (!approval || approval.status === 'pending') {
    return '<span class="approval-badge approval-badge--pending">● Pending Review</span>';
  }
  const cls  = esc(STATUS_BADGE_CLASS[approval.status] ?? 'approval-badge--pending');
  const lbl  = esc(STATUS_LABELS[approval.status]      ?? approval.status);
  const by   = approval.reviewedBy ? ` — ${esc(approval.reviewedBy)}` : '';
  const date = approval.approvedAt ? `, ${esc(approval.approvedAt)}` : '';
  return `<span class="approval-badge ${cls}">● ${lbl}${by}${date}</span>`;
}

/**
 * Initialise the engineer review panel inside a container element.
 *
 * @param {string} studyKey   Storage key for this study (e.g. 'arcFlash').
 * @param {string} [containerId='study-review-panel']  ID of the host element.
 */
export function initStudyApprovalPanel(studyKey, containerId = 'study-review-panel') {
  if (typeof document === 'undefined') return;

  const container = document.getElementById(containerId);
  if (!container) return;

  // ── Build the panel DOM ───────────────────────────────────────────────────

  const headingId = `${containerId}-heading`;
  const statusId  = `${containerId}-status`;
  const byId      = `${containerId}-reviewed-by`;
  const dateId    = `${containerId}-date`;
  const noteId    = `${containerId}-note`;
  const badgeId   = `${containerId}-badge`;

  container.innerHTML = `
    <div class="study-review-panel">
      <h2 id="${headingId}" class="study-review-panel__heading">Engineer Review</h2>

      <div class="study-review-panel__current" aria-live="polite">
        <span id="${badgeId}" class="approval-badge approval-badge--pending">● Pending Review</span>
      </div>

      <form class="study-review-panel__form" novalidate aria-labelledby="${headingId}">
        <div class="auth-field">
          <label for="${statusId}">Status</label>
          <select id="${statusId}" name="status" aria-describedby="${statusId}-hint">
            <option value="pending">Pending Review</option>
            <option value="approved">Approved by PE</option>
            <option value="flagged">Flagged — Needs Attention</option>
          </select>
          <span id="${statusId}-hint" class="field-hint">
            Set to <em>Approved by PE</em> once the study results have been reviewed and accepted.
          </span>
        </div>

        <div class="auth-field">
          <label for="${byId}">Reviewed by</label>
          <input id="${byId}" name="reviewedBy" type="text"
                 placeholder="Name, title, or initials"
                 autocomplete="name"
                 aria-describedby="${byId}-hint">
          <span id="${byId}-hint" class="field-hint">PE name, initials, or licence number.</span>
        </div>

        <div class="auth-field">
          <label for="${dateId}">Date</label>
          <input id="${dateId}" name="approvedAt" type="date"
                 value="${TODAY}"
                 aria-describedby="${dateId}-hint">
          <span id="${dateId}-hint" class="field-hint">Date of review (defaults to today).</span>
        </div>

        <div class="auth-field">
          <label for="${noteId}">Engineering Notes</label>
          <textarea id="${noteId}" name="note" rows="3"
                    placeholder="Rationale, assumptions, or follow-up actions…"
                    aria-describedby="${noteId}-hint"></textarea>
          <span id="${noteId}-hint" class="field-hint">
            Document any assumptions, acceptance criteria, or actions required.
          </span>
        </div>

        <div class="study-review-panel__actions">
          <button type="submit" class="primary-btn">Save Review</button>
          <button type="button" id="${containerId}-clear-btn" class="btn">Clear</button>
        </div>
      </form>
    </div>`;

  // ── Element references ────────────────────────────────────────────────────

  const form       = container.querySelector('form');
  const statusSel  = container.querySelector(`#${statusId}`);
  const byInput    = container.querySelector(`#${byId}`);
  const dateInput  = container.querySelector(`#${dateId}`);
  const noteTA     = container.querySelector(`#${noteId}`);
  const badgeEl    = container.querySelector(`#${badgeId}`);
  const clearBtn   = container.querySelector(`#${containerId}-clear-btn`);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function renderBadge(approval) {
    badgeEl.innerHTML = getApprovalBadgeHTML(approval);
  }

  function populateForm(approval) {
    if (!approval) {
      statusSel.value  = 'pending';
      byInput.value    = '';
      dateInput.value  = TODAY;
      noteTA.value     = '';
      renderBadge(null);
      return;
    }
    statusSel.value = approval.status   ?? 'pending';
    byInput.value   = approval.reviewedBy ?? '';
    dateInput.value = approval.approvedAt ?? TODAY;
    noteTA.value    = approval.note       ?? '';
    renderBadge(approval);
  }

  // ── Load persisted data ───────────────────────────────────────────────────

  const existing = getStudyApprovals()[studyKey] ?? null;
  populateForm(existing);

  // ── Event handlers ────────────────────────────────────────────────────────

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const approval = {
      status:     statusSel.value  || 'pending',
      reviewedBy: byInput.value.trim(),
      approvedAt: dateInput.value  || TODAY,
      note:       noteTA.value.trim(),
    };
    setStudyApproval(studyKey, approval);
    renderBadge(approval);
  });

  clearBtn.addEventListener('click', () => {
    clearStudyApproval(studyKey);
    populateForm(null);
  });
}
