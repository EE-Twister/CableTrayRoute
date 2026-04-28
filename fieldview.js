/**
 * Mobile Field View — Gap #21: Mobile-Optimized Field Access
 *
 * Read-only, mobile-first page for field technicians scanning QR codes on
 * pull cards or tray hardware tags during cable installation.
 *
 * URL patterns:
 *   fieldview.html#cable=CABLETAG   — show cable detail card
 *   fieldview.html#tray=TRAYID      — show tray detail card
 *
 * Data is read from localStorage (project loaded in this browser session).
 * If no project data is present the page prompts the user to load one.
 */

import {
  addFieldObservation,
  getCables,
  getEquipment,
  getFieldObservations,
  getOpenFieldObservations,
  getTrays,
  updateFieldObservation,
} from './dataStore.mjs';
import {
  MAX_FIELD_ATTACHMENT_BYTES,
  createFieldObservation,
} from './analysis/fieldCommissioning.mjs';

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

function targetKey(target = {}) {
  return `${target.elementType || ''}:${target.elementId || ''}`;
}

function observationsForTarget(target = {}) {
  const key = targetKey(target);
  return getFieldObservations().filter(row => targetKey(row) === key);
}

function renderObservationHistory(target = {}) {
  const rows = observationsForTarget(target)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!rows.length) {
    return '<p class="field-hint">No field observations have been captured for this target.</p>';
  }
  return `<div class="fv-fields">${rows.map(row => `
    <div class="fv-row">
      <span class="fv-label">${esc(row.status)} / ${esc(row.priority)}</span>
      <span class="fv-value">${esc(row.observationType)} - ${esc(row.comments || 'No comment')} ${row.attachments.length ? `(${row.attachments.length} attachment${row.attachments.length === 1 ? '' : 's'})` : ''}
        ${['open', 'pendingReview', 'rejected'].includes(row.status) ? `<button class="fv-btn fv-btn-secondary" data-resolve-observation="${esc(row.id)}" type="button">Resolve</button>` : ''}
      </span>
    </div>`).join('')}</div>`;
}

function renderOpenProjectItems() {
  const rows = getOpenFieldObservations().slice(0, 8);
  if (!rows.length) return '<p class="field-hint">No unresolved project-wide field items.</p>';
  return `<div class="fv-fields">${rows.map(row => `
    <div class="fv-row">
      <span class="fv-label">${esc(row.priority)}</span>
      <span class="fv-value"><a href="fieldview.html#${row.elementType === 'tray' ? 'tray' : row.elementType === 'cable' ? 'cable' : 'target'}=${encodeURIComponent(row.elementId)}">${esc(row.elementTag || row.elementId)}</a> - ${esc(row.comments || row.observationType)}</span>
    </div>`).join('')}</div>`;
}

function renderInspectionWorkspace(target = {}) {
  return `
    <section class="fv-card" aria-label="Field observation capture" style="margin-top:1rem;">
      <header class="fv-card-header">
        <div>
          <div class="fv-tag" style="font-size:1.15rem;">Field Verification</div>
          <div class="fv-tray-label">${esc(target.elementType)} ${esc(target.elementTag || target.elementId)}</div>
        </div>
      </header>
      <form id="field-observation-form" class="fv-fields">
        <input type="hidden" name="elementType" value="${esc(target.elementType)}">
        <input type="hidden" name="elementId" value="${esc(target.elementId)}">
        <input type="hidden" name="elementTag" value="${esc(target.elementTag || target.elementId)}">
        <div class="fv-row">
          <label class="fv-label" for="field-observation-type">Type</label>
          <select id="field-observation-type" name="observationType" class="fv-value">
            <option value="verification">Verification</option>
            <option value="punch">Punch Item</option>
            <option value="asBuilt">As-Built Note</option>
            <option value="photo">Photo</option>
            <option value="qrScan">QR Scan</option>
            <option value="commissioningNote">Commissioning Note</option>
          </select>
        </div>
        <div class="fv-row">
          <label class="fv-label" for="field-observation-status">Status</label>
          <select id="field-observation-status" name="status" class="fv-value">
            <option value="open">Open</option>
            <option value="pendingReview">Pending Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <div class="fv-row">
          <label class="fv-label" for="field-observation-priority">Priority</label>
          <select id="field-observation-priority" name="priority" class="fv-value">
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="fv-row">
          <span class="fv-label">Checklist</span>
          <span class="fv-value">
            <label><input type="checkbox" name="check-installed"> Installed matches schedule</label><br>
            <label><input type="checkbox" name="check-label"> Tag/label verified</label><br>
            <label><input type="checkbox" name="check-condition"> Condition acceptable</label>
          </span>
        </div>
        <div class="fv-row">
          <label class="fv-label" for="field-observation-author">Author</label>
          <input id="field-observation-author" name="author" class="fv-value" autocomplete="name">
        </div>
        <div class="fv-row">
          <label class="fv-label" for="field-observation-comments">Comments</label>
          <textarea id="field-observation-comments" name="comments" class="fv-value" rows="4" placeholder="Punch item, verification note, or as-built discrepancy"></textarea>
        </div>
        <div class="fv-row">
          <label class="fv-label" for="field-observation-files">Attachments</label>
          <input id="field-observation-files" name="attachments" class="fv-value" type="file" accept="image/*,.pdf" multiple>
        </div>
        <div class="fv-actions">
          <button type="submit" class="fv-btn fv-btn-primary">Save Observation</button>
          <span id="field-observation-status-message" class="field-hint" role="status" aria-live="polite"></span>
        </div>
      </form>
    </section>
    <section class="fv-card" aria-label="Field observation history" style="margin-top:1rem;">
      <header class="fv-card-header"><div class="fv-tag" style="font-size:1.15rem;">Target History</div></header>
      <div id="field-observation-history">${renderObservationHistory(target)}</div>
    </section>
    <section class="fv-card" aria-label="Open project field items" style="margin-top:1rem;">
      <header class="fv-card-header"><div class="fv-tag" style="font-size:1.15rem;">Open Project Items</div></header>
      <div id="field-open-project-items">${renderOpenProjectItems()}</div>
    </section>`;
}

function renderCableCard(cable, trays) {
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

  return `
    <article class="fv-card" aria-label="Cable detail: ${esc(cableTag)}">
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
        <a href="cableschedule.html#cable=${encodedCableTag}" class="fv-btn fv-btn-secondary">
          Open Full Schedule
        </a>
        <a href="pullcards.html" class="fv-btn fv-btn-secondary">
          Pull Cards
        </a>
        <button class="fv-btn fv-btn-print" onclick="window.print()">
          Print
        </button>
      </div>
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
    </article>`;
}

function renderEquipmentCard(equipment) {
  const tag = equipment.tag || equipment.id || equipment.ref || '-';
  return `
    <article class="fv-card" aria-label="Equipment detail: ${esc(tag)}">
      <header class="fv-card-header">
        <div class="fv-tag">${esc(tag)}</div>
        ${equipment.category ? `<span class="fv-tray-label">${esc(equipment.category)}</span>` : ''}
      </header>
      <div class="fv-fields">
        ${fieldRow('Description', equipment.description || equipment.name || '')}
        ${fieldRow('Voltage', equipment.voltage || '')}
        ${fieldRow('Manufacturer', equipment.manufacturer || '')}
        ${fieldRow('Model', equipment.model || equipment.catalogNumber || '')}
        ${fieldRow('Location', [equipment.x, equipment.y, equipment.z].filter(v => v !== '' && v != null).join(', '))}
        ${fieldRow('Notes', equipment.notes || '')}
      </div>
      <div class="fv-actions">
        <a href="equipmentlist.html" class="fv-btn fv-btn-secondary">
          Open Equipment List
        </a>
        <button class="fv-btn fv-btn-print" onclick="window.print()">
          Print
        </button>
      </div>
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

function renderNoHash() {
  return `
    <div class="fv-message fv-message-info" role="status">
      <div class="fv-message-icon" aria-hidden="true">&#8505;</div>
      <h2>Field View</h2>
      <p>Scan a QR code from a pull card or tray hardware tag to see cable or tray details here.</p>
      <form id="field-target-form" class="fv-fields" style="text-align:left;">
        <div class="fv-row">
          <label class="fv-label" for="field-target-type">Target Type</label>
          <select id="field-target-type" name="type" class="fv-value">
            <option value="cable">Cable</option>
            <option value="tray">Tray</option>
            <option value="equipment">Equipment</option>
          </select>
        </div>
        <div class="fv-row">
          <label class="fv-label" for="field-target-id">Tag / ID</label>
          <input id="field-target-id" name="id" class="fv-value" placeholder="Scan or type tag">
        </div>
        <div class="fv-actions">
          <button class="fv-btn fv-btn-primary" type="submit">Open Target</button>
        </div>
      </form>
      <a href="index.html" class="fv-btn fv-btn-secondary">Go to Home</a>
    </div>`;
}

function targetForCable(cable = {}) {
  const tag = cable.tag || cable.name || cable.cable_tag || cable.id || '';
  return { elementType: 'cable', elementId: tag, elementTag: tag, sourcePage: 'fieldview.html' };
}

function targetForTray(tray = {}) {
  const tag = tray.tray_id || tray.id || '';
  return { elementType: 'tray', elementId: tag, elementTag: tray.label || tag, sourcePage: 'fieldview.html' };
}

function targetForEquipment(equipment = {}) {
  const tag = equipment.tag || equipment.id || equipment.ref || '';
  return { elementType: 'equipment', elementId: tag, elementTag: tag, sourcePage: 'fieldview.html' };
}

async function attachmentMetadata(files = []) {
  const rows = [];
  for (const file of Array.from(files || [])) {
    if (file.size > MAX_FIELD_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} exceeds the ${Math.round(MAX_FIELD_ATTACHMENT_BYTES / 1024)} KB local attachment limit.`);
    }
    let thumbnailDataUrl = '';
    if (file.type.startsWith('image/') && file.size <= MAX_FIELD_ATTACHMENT_BYTES) {
      thumbnailDataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }
    rows.push({
      name: file.name,
      type: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      capturedAt: new Date().toISOString(),
      thumbnailDataUrl,
    });
  }
  return rows;
}

function refreshFieldPanels(target) {
  const history = document.getElementById('field-observation-history');
  if (history) history.innerHTML = renderObservationHistory(target);
  const openItems = document.getElementById('field-open-project-items');
  if (openItems) openItems.innerHTML = renderOpenProjectItems();
}

function wireFieldWorkspace(target) {
  document.getElementById('field-target-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const type = String(formData.get('type') || 'cable');
    const id = String(formData.get('id') || '').trim();
    if (!id) return;
    window.location.hash = `${type === 'tray' ? 'tray' : type === 'equipment' ? 'equipment' : 'cable'}=${encodeURIComponent(id)}`;
  });
  const form = document.getElementById('field-observation-form');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const statusEl = document.getElementById('field-observation-status-message');
    try {
      const formData = new FormData(form);
      const observation = createFieldObservation({
        target,
        observationType: formData.get('observationType'),
        status: formData.get('status'),
        priority: formData.get('priority'),
        author: formData.get('author'),
        comments: formData.get('comments'),
        checklist: [
          { id: 'installed', label: 'Installed matches schedule', checked: Boolean(formData.get('check-installed')) },
          { id: 'label', label: 'Tag/label verified', checked: Boolean(formData.get('check-label')) },
          { id: 'condition', label: 'Condition acceptable', checked: Boolean(formData.get('check-condition')) },
        ],
        attachments: await attachmentMetadata(formData.getAll('attachments').filter(file => file && file.name)),
      });
      addFieldObservation(observation);
      form.reset();
      if (statusEl) statusEl.textContent = 'Observation saved locally.';
      refreshFieldPanels(target);
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || 'Failed to save observation.';
    }
  });
  document.querySelectorAll('[data-resolve-observation]').forEach(button => {
    button.addEventListener('click', () => {
      updateFieldObservation(button.dataset.resolveObservation, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
      });
      refreshFieldPanels(target);
      wireFieldWorkspace(target);
    });
  });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

function renderCurrentTarget() {
  const container = document.getElementById('fv-content');
  if (!container) return;

  const cableTag = getHashParam('cable');
  const trayId   = getHashParam('tray');
  const equipmentId = getHashParam('equipment');

  if (!cableTag && !trayId && !equipmentId) {
    container.innerHTML = renderNoHash();
    wireFieldWorkspace(null);
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
    const target = targetForCable(cable);
    container.innerHTML = renderCableCard(cable, trays) + renderInspectionWorkspace(target);
    wireFieldWorkspace(target);
    // Update page title to cable tag for easy identification
    document.title = `${cableTag} — CableTrayRoute Field View`;
    return;
  }

  if (trayId) {
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
    const target = targetForTray(tray);
    container.innerHTML = renderTrayCard(tray) + renderInspectionWorkspace(target);
    wireFieldWorkspace(target);
  document.title = `${trayId} — CableTrayRoute Field View`;
    return;
  }

  const equipment = getEquipment();
  if (!equipment.length) {
    container.innerHTML = renderNoData('equipment');
    return;
  }
  const row = equipment.find(item => String(item.tag || item.id || item.ref) === String(equipmentId));
  if (!row) {
    container.innerHTML = renderNotFound('equipment', equipmentId);
    return;
  }
  const target = targetForEquipment(row);
  container.innerHTML = renderEquipmentCard(row) + renderInspectionWorkspace(target);
  wireFieldWorkspace(target);
  document.title = `${equipmentId} - CableTrayRoute Field View`;
}

document.addEventListener('DOMContentLoaded', renderCurrentTarget);

// Re-render if the user navigates to a different hash without reloading
window.addEventListener('hashchange', () => {
  renderCurrentTarget();
  return;
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
    if (cable) document.title = `${cableTag} — CableTrayRoute Field View`;
    return;
  }

  const trays = getTrays();
  if (!trays.length) { container.innerHTML = renderNoData('tray'); return; }
  const tray = trays.find(t => String(t.tray_id || t.id) === String(trayId));
  container.innerHTML = tray
    ? renderTrayCard(tray)
    : renderNotFound('tray', trayId);
  if (tray) document.title = `${trayId} — CableTrayRoute Field View`;
});
