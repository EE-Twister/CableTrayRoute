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

import { getCables, getTrays } from './dataStore.mjs';

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

function fieldRow(label, value) {
  if (!value && value !== 0) return '';
  return `
    <div class="fv-row">
      <span class="fv-label">${label}</span>
      <span class="fv-value">${value}</span>
    </div>`;
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

  return `
    <article class="fv-card" aria-label="Cable detail: ${cable.tag}">
      <header class="fv-card-header">
        <div class="fv-tag">${cable.tag || '—'}</div>
        ${cable.cable_type ? `<span class="fv-type-badge ${typeClass}">${cable.cable_type}</span>` : ''}
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
        <a href="cableschedule.html#cable=${encodeURIComponent(cable.tag)}" class="fv-btn fv-btn-secondary">
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
  return `
    <article class="fv-card" aria-label="Tray detail: ${tray.tray_id || tray.id}">
      <header class="fv-card-header">
        <div class="fv-tag">${tray.tray_id || tray.id || '—'}</div>
        ${tray.label ? `<span class="fv-tray-label">${tray.label}</span>` : ''}
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

function renderNotFound(kind, id) {
  return `
    <div class="fv-message fv-message-warn" role="alert">
      <div class="fv-message-icon" aria-hidden="true">&#9888;</div>
      <h2>${kind === 'tray' ? 'Tray' : 'Cable'} Not Found</h2>
      <p><strong>${id}</strong> was not found in the loaded project.</p>
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
      <a href="index.html" class="fv-btn fv-btn-secondary">Go to Home</a>
    </div>`;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
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
  document.title = `${trayId} — CableTrayRoute Field View`;
});

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
