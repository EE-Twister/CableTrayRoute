/**
 * Mobile Field View — Gap #21: Mobile-Optimized Field Access
 *
 * Shared field execution page for technicians scanning QR codes on pull cards
 * or tray hardware tags during cable installation.
 *
 * URL patterns:
 *   fieldview.html#cable=CABLETAG   — show cable detail card
 *   fieldview.html#tray=TRAYID      — show tray detail card
 *
 * Schedule data and execution records use the centralized project data store.
 */

import {
  getCables,
  getFieldExecutionRecords,
  getFieldObservationQueue,
  getFieldObservations,
  getTrays,
  setFieldExecutionRecords,
  setFieldObservationQueue,
  setFieldObservations,
} from './dataStore.mjs';
import {
  FIELD_EXECUTION_STATUSES,
  findFieldExecutionRecord,
  normalizeFieldExecutionRecord,
  summarizeFieldExecution,
  upsertFieldExecutionRecord,
} from './analysis/fieldExecution.mjs';
import {
  FIELD_OBSERVATION_STATUSES,
  FIELD_OBSERVATION_TYPES,
  enqueueFieldObservation,
  normalizeFieldObservation,
  summarizeFieldObservations,
  upsertFieldObservation,
} from './analysis/fieldObservations.mjs';

const MAX_FIELD_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const PREVIEW_CABLE = {
  tag: 'C-1042',
  cable_type: 'Power',
  from_tag: 'SWGR-01',
  to_tag: 'MCC-02',
  conductors: '3/C + G',
  conductor_size: '500 kcmil Cu',
  cable_od: '1.62',
  allowed_cable_group: '600 V Power',
  tray_ids: ['TR-101', 'TR-102', 'TR-203'],
  notes: 'Verify tray bend clearance before pull.'
};

const PREVIEW_TRAYS = [
  { tray_id: 'TR-101', label: 'Main electrical room' },
  { tray_id: 'TR-102', label: 'Pipe rack west' },
  { tray_id: 'TR-203', label: 'MCC mezzanine' }
];

// ---------------------------------------------------------------------------
// URL hash parsing
// ---------------------------------------------------------------------------

function getHashParam(name) {
  const hash = window.location.hash.slice(1); // strip leading '#'
  const params = new URLSearchParams(hash);
  return params.get(name) ?? null;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fieldRow(label, value) {
  if (!value && value !== 0) return '';
  return `
    <div class="fv-row">
      <span class="fv-label">${esc(label)}</span>
      <span class="fv-value">${esc(value)}</span>
    </div>`;
}

function statusLabel(status) {
  return String(status || 'not-started')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function renderExecutionPanel(recordType, sourceId, options = {}) {
  if (options.preview) return '';
  const record = findFieldExecutionRecord(getFieldExecutionRecords(), recordType, sourceId)
    || normalizeFieldExecutionRecord({ recordType, sourceId });
  const statusOptions = FIELD_EXECUTION_STATUSES
    .map(status => `<option value="${status}"${record.status === status ? ' selected' : ''}>${esc(statusLabel(status))}</option>`)
    .join('');
  return `
    <section class="fv-execution" aria-label="Field execution record">
      <div class="fv-execution-heading">
        <div>
          <span class="fv-label">Shared project record</span>
          <h2>Installation status</h2>
        </div>
        <span class="fv-status-badge fv-status-${esc(record.status)}">${esc(statusLabel(record.status))}</span>
      </div>
      <div class="fv-execution-grid">
        <label>Status
          <select data-field-execution="status">${statusOptions}</select>
        </label>
        <label>Quantity complete
          <input data-field-execution="quantityComplete" type="number" min="0" step="0.1" value="${esc(record.quantityComplete)}">
        </label>
        <label>Crew
          <input data-field-execution="crew" type="text" value="${esc(record.crew)}" autocomplete="off">
        </label>
        <label>Updated by
          <input data-field-execution="updatedBy" type="text" value="${esc(record.updatedBy)}" autocomplete="off">
        </label>
      </div>
      <label class="fv-execution-wide">Field notes
        <textarea data-field-execution="notes" rows="2">${esc(record.notes)}</textarea>
      </label>
      <label class="fv-execution-check">
        <input data-field-execution="punchOpen" type="checkbox"${record.punchOpen ? ' checked' : ''}>
        Open punch item
      </label>
      <label class="fv-execution-wide">Punch description
        <textarea data-field-execution="punchDescription" rows="2">${esc(record.punchDescription)}</textarea>
      </label>
      <label class="fv-execution-wide">As-built deviation
        <textarea data-field-execution="asBuiltDeviation" rows="2">${esc(record.asBuiltDeviation)}</textarea>
      </label>
      <label class="fv-execution-wide">Evidence references
        <input data-field-execution="evidenceReferences" type="text" value="${esc(record.evidenceReferences.join(', '))}" placeholder="Photo ID, test report, attachment reference">
      </label>
      <div class="fv-actions">
        <button type="button" class="fv-btn fv-btn-primary" data-save-field-record data-record-type="${esc(recordType)}" data-source-id="${esc(sourceId)}">Save field record</button>
        <span class="fv-save-status" role="status" aria-live="polite"></span>
      </div>
    </section>`;
}

function formatObservationType(type) {
  return String(type || 'installation').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function renderObservationPanel(sourceType, sourceId, options = {}) {
  if (options.preview) return '';
  const observations = getFieldObservations()
    .map(item => normalizeFieldObservation(item))
    .filter(item => item.sourceType === sourceType && item.sourceId === sourceId);
  const summary = summarizeFieldObservations(getFieldObservations(), getFieldObservationQueue());
  const typeOptions = FIELD_OBSERVATION_TYPES
    .map(type => `<option value="${type}">${esc(formatObservationType(type))}</option>`)
    .join('');
  const statusOptions = FIELD_OBSERVATION_STATUSES
    .map(status => `<option value="${status}">${esc(formatObservationType(status))}</option>`)
    .join('');
  const recent = observations.slice(0, 3).map(item => `
    <li class="fv-observation-item">
      <strong>${esc(formatObservationType(item.type))}: ${esc(item.summary)}</strong>
      <span>${esc(formatObservationType(item.status))}${item.attachments.length ? ` · ${item.attachments.length} attachment(s)` : ''}</span>
    </li>`).join('');
  return `
    <section class="fv-execution fv-observation" aria-label="Field observations">
      <div class="fv-execution-heading">
        <div>
          <span class="fv-label">Offline-first project record</span>
          <h2>Field observation / punch item</h2>
        </div>
        <span class="fv-status-badge">${summary.open} open</span>
      </div>
      ${recent ? `<ul class="fv-observation-list">${recent}</ul>` : '<p class="fv-observation-empty">No observations logged for this target.</p>'}
      <div class="fv-execution-grid">
        <label>Type
          <select data-field-observation="type">${typeOptions}</select>
        </label>
        <label>Status
          <select data-field-observation="status">${statusOptions}</select>
        </label>
        <label>Observed by
          <input data-field-observation="observedBy" type="text" autocomplete="off">
        </label>
        <label>Study package ID
          <input data-field-observation="studyPackageId" type="text" autocomplete="off" placeholder="Optional release package">
        </label>
      </div>
      <label class="fv-execution-wide">Summary
        <input data-field-observation="summary" type="text" required placeholder="What needs review or verification?">
      </label>
      <label class="fv-execution-wide">Comment
        <textarea data-field-observation="comment" rows="2" placeholder="Location, condition, or test result"></textarea>
      </label>
      <label class="fv-execution-wide">As-built change
        <textarea data-field-observation="asBuiltChange" rows="2" placeholder="Describe any installed condition differing from the model"></textarea>
      </label>
      <label class="fv-execution-wide">Photo attachment (max 2 MB)
        <input data-field-observation="attachment" type="file" accept="image/*" capture="environment">
      </label>
      <div class="fv-actions">
        <button type="button" class="fv-btn fv-btn-primary" data-save-field-observation data-source-type="${esc(sourceType)}" data-source-id="${esc(sourceId)}">Save observation</button>
        <span class="fv-save-status" role="status" aria-live="polite"></span>
      </div>
    </section>`;
}

function renderCableCard(cable, trays, options = {}) {
  const trayList = Array.isArray(cable.tray_ids) && cable.tray_ids.length
    ? cable.tray_ids.join(' → ')
    : (cable.tray_id || '—');

  // Attempt to resolve tray labels from schedule
  let trayDisplay = trayList;
  if (trays.length && Array.isArray(cable.tray_ids) && cable.tray_ids.length) {
    const labels = cable.tray_ids.map(id => {
      const t = trays.find(tr => String(tr.tray_id || tr.id) === String(id));
      return t ? (t.label || t.tray_id || id) : id;
    });
    trayDisplay = labels.join(' → ');
  }

  const typeClass = {
    Power: 'fv-type-power',
    Control: 'fv-type-control',
    Signal: 'fv-type-signal',
  }[cable.cable_type] || 'fv-type-power';

  const cableTag = cable.tag || '-';
  const encodedCableTag = encodeURIComponent(cableTag);
  const cardLabel = options.preview
    ? `Sample cable preview: ${cableTag}`
    : `Cable detail: ${cableTag}`;
  const actions = options.preview
    ? `
        <a href="cableschedule.html" class="fv-btn fv-btn-secondary">
          Open Cable Schedule
        </a>
        <a href="pullcards.html" class="fv-btn fv-btn-secondary">
          Pull Cards
        </a>`
    : `
        <a href="cableschedule.html#cable=${encodedCableTag}" class="fv-btn fv-btn-secondary">
          Open Full Schedule
        </a>
        <a href="pullcards.html" class="fv-btn fv-btn-secondary">
          Pull Cards
        </a>
        <button class="fv-btn fv-btn-print" onclick="window.print()">
          Print
        </button>`;

  return `
    <article class="fv-card" aria-label="${esc(cardLabel)}">
      <header class="fv-card-header">
        <div class="fv-tag">${esc(cableTag)}</div>
        ${cable.cable_type ? `<span class="fv-type-badge ${typeClass}">${esc(cable.cable_type)}</span>` : ''}
      </header>
      <div class="fv-fields">
        ${fieldRow('From', cable.from_tag || cable.from || '')}
        ${fieldRow('To', cable.to_tag || cable.to || '')}
        ${fieldRow('Conductors', cable.conductors)}
        ${fieldRow('Conductor Size', cable.conductor_size)}
        ${fieldRow('Cable OD', cable.cable_od ? `${cable.cable_od} in` : '')}
        ${fieldRow('Voltage Group', cable.allowed_cable_group)}
        ${fieldRow('Tray Path', trayDisplay)}
        ${fieldRow('Notes', cable.notes || cable.note || '')}
      </div>
      <div class="fv-actions">
        ${actions}
      </div>
      ${renderExecutionPanel('cable', cableTag, options)}
      ${renderObservationPanel('cable', cableTag, options)}
    </article>`;
}

function renderTrayCard(tray) {
  const trayTag = tray.tray_id || tray.id || '-';
  return `
    <article class="fv-card" aria-label="Tray detail: ${esc(trayTag)}">
      <header class="fv-card-header">
        <div class="fv-tag">${esc(trayTag)}</div>
        ${tray.label ? `<span class="fv-tray-label">${esc(tray.label)}</span>` : ''}
      </header>
      <div class="fv-fields">
        ${fieldRow('Type', tray.type)}
        ${fieldRow('Width', tray.width ? `${tray.width} in` : '')}
        ${fieldRow('Depth', tray.depth ? `${tray.depth} in` : '')}
        ${fieldRow('Material', tray.material)}
        ${fieldRow('From', tray.from || tray.start || '')}
        ${fieldRow('To', tray.to || tray.end || '')}
        ${fieldRow('Length', tray.length ? `${tray.length} ft` : '')}
        ${fieldRow('Notes', tray.notes || '')}
      </div>
      <div class="fv-actions">
        <a href="racewayschedule.html" class="fv-btn fv-btn-secondary">
          Open Raceway Schedule
        </a>
        <a href="trayhardwarebom.html" class="fv-btn fv-btn-secondary">
          Hardware BOM
        </a>
        <button class="fv-btn fv-btn-print" onclick="window.print()">
          Print
        </button>
      </div>
      ${renderExecutionPanel('tray', trayTag)}
      ${renderObservationPanel('tray', trayTag)}
    </article>`;
}

function renderNotFound(kind, id) {
  return `
    <div class="fv-message fv-message-warn" role="alert">
      <div class="fv-message-icon" aria-hidden="true">&#9888;</div>
      <h2>${kind === 'tray' ? 'Tray' : 'Cable'} Not Found</h2>
      <p><strong>${esc(id)}</strong> was not found in the loaded project.</p>
      <p>Make sure the correct project is loaded on this device, then try again.</p>
      <a href="${kind === 'tray' ? 'racewayschedule.html' : 'cableschedule.html'}" class="fv-btn fv-btn-secondary">
        Open ${kind === 'tray' ? 'Raceway Schedule' : 'Cable Schedule'}
      </a>
    </div>`;
}

function renderNoData(kind) {
  return `
    <div class="fv-message fv-message-info" role="status">
      <div class="fv-message-icon" aria-hidden="true">&#8505;</div>
      <h2>No Project Loaded</h2>
      <p>Open the project on this device first, then scan the QR code again.</p>
      <a href="${kind === 'tray' ? 'racewayschedule.html' : 'cableschedule.html'}" class="fv-btn fv-btn-primary">
        Load Project
      </a>
    </div>`;
}

function renderDesktopPreview() {
  return `
    <div class="fv-desktop-only">
      <div class="fv-preview-note" role="status">
        <span class="fv-label">Sample preview</span>
        <span class="fv-preview-note-copy">This sample card appears on desktop when no cable or tray QR target is selected.</span>
      </div>
      ${renderCableCard(PREVIEW_CABLE, PREVIEW_TRAYS, { preview: true })}
    </div>`;
}

function renderNoHash() {
  const summary = summarizeFieldExecution(getFieldExecutionRecords());
  return `
    ${renderDesktopPreview()}
    <div class="fv-desktop-only">
      <div class="fv-message fv-message-info" role="status">
        <h2>Field execution summary</h2>
        <p>${summary.total} tracked record(s), ${summary.complete} accepted, ${summary.blocked} blocked, and ${summary.punchOpen} with an open punch item.</p>
        <p>Open a cable or tray QR link to update its shared installation record.</p>
      </div>
    </div>
    <div class="fv-mobile-only">
      <div class="fv-message fv-message-info" role="status">
        <div class="fv-message-icon" aria-hidden="true">&#8505;</div>
        <h2>Field View</h2>
        <p>Scan a QR code from a pull card or tray hardware tag to see cable or tray details here.</p>
        <a href="index.html" class="fv-btn fv-btn-secondary">Go to Home</a>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

function readExecutionForm(container) {
  const value = name => container.querySelector(`[data-field-execution="${name}"]`)?.value ?? '';
  return {
    status: value('status'),
    quantityComplete: value('quantityComplete'),
    crew: value('crew'),
    updatedBy: value('updatedBy'),
    notes: value('notes'),
    punchOpen: Boolean(container.querySelector('[data-field-execution="punchOpen"]')?.checked),
    punchDescription: value('punchDescription'),
    asBuiltDeviation: value('asBuiltDeviation'),
    evidenceReferences: value('evidenceReferences').split(',').map(item => item.trim()).filter(Boolean),
  };
}

function bindExecutionActions(container) {
  const button = container.querySelector('[data-save-field-record]');
  if (!button) return;
  button.addEventListener('click', () => {
    const panel = button.closest('.fv-execution');
    const record = {
      recordType: button.dataset.recordType,
      sourceId: button.dataset.sourceId,
      ...readExecutionForm(panel),
      updatedAt: new Date().toISOString(),
    };
    setFieldExecutionRecords(upsertFieldExecutionRecord(getFieldExecutionRecords(), record));
    const saveStatus = panel.querySelector('.fv-save-status');
    if (saveStatus) saveStatus.textContent = `Saved ${statusLabel(record.status)} at ${new Date().toLocaleTimeString()}.`;
    const badge = panel.querySelector('.fv-status-badge');
    if (badge) {
      badge.className = `fv-status-badge fv-status-${record.status}`;
      badge.textContent = statusLabel(record.status);
    }
  });
}

function readFieldAttachment(input) {
  const file = input?.files?.[0];
  if (!file) return Promise.resolve([]);
  if (file.size > MAX_FIELD_ATTACHMENT_BYTES) {
    return Promise.reject(new Error('Photo is larger than 2 MB. Choose a smaller image before saving.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve([{
      name: file.name,
      mediaType: file.type || 'image/*',
      sizeBytes: file.size,
      dataUrl: String(reader.result || ''),
      capturedAt: new Date().toISOString(),
    }]));
    reader.addEventListener('error', () => reject(new Error('The selected photo could not be read on this device.')));
    reader.readAsDataURL(file);
  });
}

function bindObservationActions(container) {
  const button = container.querySelector('[data-save-field-observation]');
  if (!button) return;
  button.addEventListener('click', async () => {
    const panel = button.closest('.fv-observation');
    const value = name => panel.querySelector(`[data-field-observation="${name}"]`)?.value ?? '';
    const saveStatus = panel.querySelector('.fv-save-status');
    button.disabled = true;
    try {
      const attachments = await readFieldAttachment(panel.querySelector('[data-field-observation="attachment"]'));
      const result = upsertFieldObservation(getFieldObservations(), {
        type: value('type'),
        status: value('status'),
        sourceType: button.dataset.sourceType,
        sourceId: button.dataset.sourceId,
        observedBy: value('observedBy'),
        studyPackageId: value('studyPackageId'),
        summary: value('summary'),
        comment: value('comment'),
        asBuiltChange: value('asBuiltChange'),
        attachments,
      });
      if (result.errors.length) {
        if (saveStatus) saveStatus.textContent = result.errors[0];
        return;
      }
      setFieldObservations(result.observations);
      setFieldObservationQueue(enqueueFieldObservation(getFieldObservationQueue(), result.observation.id));
      if (saveStatus) saveStatus.textContent = 'Saved locally and queued for the next project save.';
      window.setTimeout(renderCurrentTarget, 500);
    } catch (error) {
      if (saveStatus) saveStatus.textContent = error.message || 'Unable to save the field observation.';
    } finally {
      button.disabled = false;
    }
  });
}

function renderCurrentTarget() {
  const container = document.getElementById('fv-content');
  if (!container) return;

  const cableTag = getHashParam('cable');
  const trayId   = getHashParam('tray');

  if (!cableTag && !trayId) {
    container.innerHTML = renderNoHash();
    return;
  }

  if (cableTag) {
    const cables = getCables();
    if (!cables.length) {
      container.innerHTML = renderNoData('cable');
      return;
    }
    const cable = cables.find(c => (c.tag || c.name || c.cable_tag) === cableTag);
    if (!cable) {
      container.innerHTML = renderNotFound('cable', cableTag);
      return;
    }
    const trays = getTrays();
    container.innerHTML = renderCableCard(cable, trays);
    bindExecutionActions(container);
    bindObservationActions(container);
    // Update page title to cable tag for easy identification
    document.title = `${cableTag} — CableTrayRoute Field View`;
    return;
  }

  // trayId path
  const trays = getTrays();
  if (!trays.length) {
    container.innerHTML = renderNoData('tray');
    return;
  }
  const tray = trays.find(t => String(t.tray_id || t.id) === String(trayId));
  if (!tray) {
    container.innerHTML = renderNotFound('tray', trayId);
    return;
  }
  container.innerHTML = renderTrayCard(tray);
  bindExecutionActions(container);
  bindObservationActions(container);
  document.title = `${trayId} — CableTrayRoute Field View`;
}

document.addEventListener('DOMContentLoaded', renderCurrentTarget);

// Re-render if the user navigates to a different hash without reloading
window.addEventListener('hashchange', () => {
  const container = document.getElementById('fv-content');
  if (!container) return;
  // Trigger a soft reload of the content by re-dispatching DOMContentLoaded logic
  const cableTag = getHashParam('cable');
  const trayId   = getHashParam('tray');

  if (!cableTag && !trayId) {
    container.innerHTML = renderNoHash();
    return;
  }

  if (cableTag) {
    const cables = getCables();
    if (!cables.length) { container.innerHTML = renderNoData('cable'); return; }
    const cable = cables.find(c => (c.tag || c.name || c.cable_tag) === cableTag);
    container.innerHTML = cable
      ? renderCableCard(cable, getTrays())
      : renderNotFound('cable', cableTag);
    if (cable) bindExecutionActions(container);
    if (cable) bindObservationActions(container);
    if (cable) document.title = `${cableTag} — CableTrayRoute Field View`;
    return;
  }

  const trays = getTrays();
  if (!trays.length) { container.innerHTML = renderNoData('tray'); return; }
  const tray = trays.find(t => String(t.tray_id || t.id) === String(trayId));
  container.innerHTML = tray
    ? renderTrayCard(tray)
    : renderNotFound('tray', trayId);
  if (tray) bindExecutionActions(container);
  if (tray) bindObservationActions(container);
  if (tray) document.title = `${trayId} — CableTrayRoute Field View`;
});
