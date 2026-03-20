import { getCables, getTrays, getConduits, getEquipment, getDuctbanks } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // Set today's date as default submittal date
  const dateInput = document.getElementById('sub-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  document.getElementById('preview-btn').addEventListener('click', generatePreview);
  document.getElementById('print-btn').addEventListener('click', () => {
    generatePreview();
    setTimeout(() => window.print(), 300);
  });
  document.getElementById('export-xlsx-btn').addEventListener('click', exportXlsx);
});

function getProjectInfo() {
  return {
    projectName: document.getElementById('sub-project-name').value.trim() || '(Untitled Project)',
    projectNumber: document.getElementById('sub-project-number').value.trim() || '—',
    client: document.getElementById('sub-client').value.trim() || '—',
    engineer: document.getElementById('sub-engineer').value.trim() || '—',
    date: document.getElementById('sub-date').value || new Date().toISOString().slice(0, 10),
    necEdition: document.getElementById('sub-nec-edition').value,
    revision: document.getElementById('sub-revision').value.trim() || '0',
  };
}

function sectionEnabled(id) {
  return document.getElementById(id).checked;
}

function esc(s) {
  return String(s ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generatePreview() {
  const info = getProjectInfo();
  const cables = getCables();
  const trays = getTrays();
  const conduits = getConduits();
  const equipment = getEquipment();
  const ductbanks = getDuctbanks();

  let html = '';

  // Cover page
  html += buildCoverPage(info);

  // Equipment Schedule
  if (sectionEnabled('sec-equipment')) {
    html += buildEquipmentSection(equipment);
  }

  // Cable Schedule
  if (sectionEnabled('sec-cables')) {
    html += buildCableSection(cables);
  }

  // Raceway Schedule
  if (sectionEnabled('sec-raceways')) {
    html += buildRacewaySection(trays, conduits, ductbanks);
  }

  // Tray Fill Summary
  if (sectionEnabled('sec-tray-fill')) {
    html += buildTrayFillSection(trays, cables);
  }

  // Code Compliance Statement
  if (sectionEnabled('sec-compliance')) {
    html += buildComplianceSection(info);
  }

  // Signature Block
  if (sectionEnabled('sec-signature')) {
    html += buildSignatureSection(info);
  }

  document.getElementById('submittal-preview').innerHTML = html;
}

function buildCoverPage(info) {
  return `
    <section class="submittal-cover" aria-label="Cover page">
      <div class="submittal-logo-row">
        <img src="icons/route.svg" alt="CableTrayRoute" class="submittal-logo" width="48" height="48">
        <span class="submittal-brand">CableTrayRoute</span>
      </div>
      <h2 class="submittal-title">Engineering Submittal Package</h2>
      <table class="submittal-cover-table" aria-label="Project information">
        <tbody>
          <tr><th scope="row">Project Name</th><td>${esc(info.projectName)}</td></tr>
          <tr><th scope="row">Project Number</th><td>${esc(info.projectNumber)}</td></tr>
          <tr><th scope="row">Client / Owner</th><td>${esc(info.client)}</td></tr>
          <tr><th scope="row">Engineer of Record</th><td>${esc(info.engineer)}</td></tr>
          <tr><th scope="row">Submittal Date</th><td>${esc(info.date)}</td></tr>
          <tr><th scope="row">NEC Edition</th><td>NEC ${esc(info.necEdition)}</td></tr>
          <tr><th scope="row">Revision</th><td>${esc(info.revision)}</td></tr>
        </tbody>
      </table>
    </section>`;
}

function buildEquipmentSection(equipment) {
  if (!equipment.length) {
    return `<section class="submittal-section" aria-label="Equipment schedule">
      <h2>Equipment Schedule</h2>
      <p class="field-hint">No equipment found. Add equipment in the <a href="equipmentlist.html">Equipment List</a>.</p>
    </section>`;
  }

  const rows = equipment.map(e => `
    <tr>
      <td>${esc(e.tag || e.id)}</td>
      <td>${esc(e.description || e.name)}</td>
      <td>${esc(e.voltage || '—')}</td>
      <td>${esc(e.kva || e.kw || '—')}</td>
      <td>${esc(e.phase || '—')}</td>
      <td>${esc(e.location || '—')}</td>
    </tr>`).join('');

  return `
    <section class="submittal-section" aria-label="Equipment schedule">
      <h2>Equipment Schedule</h2>
      <table class="result-table submittal-table" aria-label="Equipment schedule">
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">Description</th>
            <th scope="col">Voltage (V)</th>
            <th scope="col">Rating (kVA/kW)</th>
            <th scope="col">Phase</th>
            <th scope="col">Location</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildCableSection(cables) {
  if (!cables.length) {
    return `<section class="submittal-section" aria-label="Cable schedule">
      <h2>Cable Schedule</h2>
      <p class="field-hint">No cables found. Add cables in the <a href="cableschedule.html">Cable Schedule</a>.</p>
    </section>`;
  }

  const rows = cables.map(c => `
    <tr>
      <td>${esc(c.cable_tag || c.tag)}</td>
      <td>${esc(c.from_device || c.from)}</td>
      <td>${esc(c.to_device || c.to)}</td>
      <td>${esc(c.voltage_rating || c.voltage || '—')}</td>
      <td>${esc(c.conductors)}</td>
      <td>${esc(c.conductor_size || c.size || '—')}</td>
      <td>${esc(c.insulation || '—')}</td>
      <td>${esc(c.cable_group || c.group || '—')}</td>
    </tr>`).join('');

  return `
    <section class="submittal-section" aria-label="Cable schedule">
      <h2>Cable Schedule</h2>
      <table class="result-table submittal-table" aria-label="Cable schedule">
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Voltage (V)</th>
            <th scope="col">Conductors</th>
            <th scope="col">Size</th>
            <th scope="col">Insulation</th>
            <th scope="col">Group</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildRacewaySection(trays, conduits, ductbanks) {
  let html = `<section class="submittal-section" aria-label="Raceway schedule"><h2>Raceway Schedule</h2>`;

  if (trays.length) {
    const rows = trays.map(t => `
      <tr>
        <td>${esc(t.tray_id)}</td>
        <td>${esc(t.tray_type || '—')}</td>
        <td>${esc(t.inside_width || '—')}</td>
        <td>${esc(t.depth || '—')}</td>
        <td>${esc(t.material || '—')}</td>
        <td>${esc(t.length_ft || '—')}</td>
      </tr>`).join('');
    html += `
      <h3>Cable Trays (${trays.length})</h3>
      <table class="result-table submittal-table" aria-label="Tray schedule">
        <thead>
          <tr>
            <th scope="col">Tray ID</th>
            <th scope="col">Type</th>
            <th scope="col">Width (in)</th>
            <th scope="col">Depth (in)</th>
            <th scope="col">Material</th>
            <th scope="col">Length (ft)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  if (conduits.length) {
    const rows = conduits.map(c => `
      <tr>
        <td>${esc(c.conduit_id)}</td>
        <td>${esc(c.conduit_type || '—')}</td>
        <td>${esc(c.trade_size || c.diameter || '—')}</td>
        <td>${esc(c.length_ft || '—')}</td>
      </tr>`).join('');
    html += `
      <h3>Conduits (${conduits.length})</h3>
      <table class="result-table submittal-table" aria-label="Conduit schedule">
        <thead>
          <tr>
            <th scope="col">Conduit ID</th>
            <th scope="col">Type</th>
            <th scope="col">Trade Size (in)</th>
            <th scope="col">Length (ft)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  if (ductbanks.length) {
    html += `<h3>Ductbanks (${ductbanks.length})</h3>
      <p>${ductbanks.map(d => esc(d.tag || d.id)).join(', ')}</p>`;
  }

  if (!trays.length && !conduits.length && !ductbanks.length) {
    html += `<p class="field-hint">No raceways found. Add raceways in the <a href="racewayschedule.html">Raceway Schedule</a>.</p>`;
  }

  html += `</section>`;
  return html;
}

function buildTrayFillSection(trays, cables) {
  if (!trays.length) {
    return `<section class="submittal-section" aria-label="Tray fill summary">
      <h2>Tray Fill Summary</h2>
      <p class="field-hint">No trays found.</p>
    </section>`;
  }

  // Compute fill: sum OD² of cables assigned to each tray
  const trayFill = {};
  trays.forEach(t => { trayFill[t.tray_id] = { totalOdSq: 0, cableCount: 0, width: parseFloat(t.inside_width) || 0 }; });
  cables.forEach(c => {
    const trayId = c.route_preference;
    if (trayId && trayFill[trayId] !== undefined) {
      const od = parseFloat(c.od || c.outer_diameter || 0);
      trayFill[trayId].totalOdSq += od * od;
      trayFill[trayId].cableCount += 1;
    }
  });

  const rows = trays.map(t => {
    const fill = trayFill[t.tray_id] || { totalOdSq: 0, cableCount: 0, width: 0 };
    const trayWidth = parseFloat(t.inside_width) || 0;
    // NEC 392.22: fill area = tray_width × 6 in for ladder/ventilated trough
    const allowedArea = trayWidth * 6;
    const actualArea = fill.totalOdSq;
    const fillPct = allowedArea > 0 ? ((actualArea / allowedArea) * 100).toFixed(1) : '—';
    const status = allowedArea > 0
      ? (actualArea <= allowedArea * 0.4 ? 'result-ok' : actualArea <= allowedArea ? 'result-warn' : 'result-fail')
      : '';
    return `<tr class="${status}">
      <td>${esc(t.tray_id)}</td>
      <td>${esc(t.inside_width || '—')}</td>
      <td>${fill.cableCount}</td>
      <td>${actualArea.toFixed(2)}</td>
      <td>${allowedArea > 0 ? allowedArea.toFixed(2) : '—'}</td>
      <td class="status-badge ${status}">${fillPct}${fillPct !== '—' ? '%' : ''}</td>
    </tr>`;
  }).join('');

  return `
    <section class="submittal-section" aria-label="Tray fill summary">
      <h2>Tray Fill Summary</h2>
      <p class="field-hint">Fill calculated per NEC 392.22 (40% fill limit for combinations of cables).
      Cables matched to trays via Route Preference field.</p>
      <table class="result-table submittal-table" aria-label="Tray fill summary">
        <thead>
          <tr>
            <th scope="col">Tray ID</th>
            <th scope="col">Width (in)</th>
            <th scope="col">Cables</th>
            <th scope="col">OD² Area (in²)</th>
            <th scope="col">Allowed Area (in²)</th>
            <th scope="col">Fill %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildComplianceSection(info) {
  return `
    <section class="submittal-section submittal-compliance" aria-label="Code compliance statement">
      <h2>Code Compliance Statement</h2>
      <p>This submittal package has been prepared in accordance with the following codes and standards:</p>
      <ul>
        <li><strong>NFPA 70 NEC ${esc(info.necEdition)}</strong> — National Electrical Code</li>
        <li><strong>NEMA VE 1-2017</strong> — Cable Tray Systems (load class, fill, support span)</li>
        <li><strong>IEEE Std 835</strong> — Standard Power Cable Ampacity Tables</li>
        <li><strong>NFPA 70E</strong> — Standard for Electrical Safety in the Workplace</li>
      </ul>
      <p>Cable tray fill does not exceed 40% of the usable cross-section per NEC 392.22.
      Conduit fill does not exceed the maximum percentage per NEC Chapter 9, Table 1.
      Support spans comply with NEMA VE 1 deflection limits (L/100).</p>
      <p>All cables are selected for the applicable ambient temperature, voltage rating,
      and installation conditions per NEC Article 310.</p>
    </section>`;
}

function buildSignatureSection(info) {
  return `
    <section class="submittal-section submittal-signatures" aria-label="Signature block">
      <h2>Approval &amp; Signature</h2>
      <table class="submittal-signature-table" aria-label="Signature block">
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Name / Title</th>
            <th scope="col">Signature</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Prepared by</td>
            <td>${esc(info.engineer)}</td>
            <td class="sig-line"></td>
            <td class="sig-line"></td>
          </tr>
          <tr>
            <td>Reviewed by</td>
            <td></td>
            <td class="sig-line"></td>
            <td class="sig-line"></td>
          </tr>
          <tr>
            <td>Approved by (EOR)</td>
            <td></td>
            <td class="sig-line"></td>
            <td class="sig-line"></td>
          </tr>
          <tr>
            <td>Client Acceptance</td>
            <td>${esc(info.client)}</td>
            <td class="sig-line"></td>
            <td class="sig-line"></td>
          </tr>
        </tbody>
      </table>
      <p class="field-hint" style="margin-top:1rem">
        Generated by CableTrayRoute on ${esc(info.date)}. Project: ${esc(info.projectName)} (Rev. ${esc(info.revision)})
      </p>
    </section>`;
}

function exportXlsx() {
  const info = getProjectInfo();
  const cables = getCables();
  const trays = getTrays();
  const conduits = getConduits();
  const equipment = getEquipment();

  const wb = { SheetNames: [], Sheets: {} };

  // Helper: array of arrays → sheet
  function arrayToSheet(data) {
    if (typeof XLSX !== 'undefined') return XLSX.utils.aoa_to_sheet(data);
    return null;
  }

  function addSheet(name, data) {
    if (!window.XLSX) return;
    const ws = XLSX.utils.aoa_to_sheet(data);
    wb.SheetNames.push(name);
    wb.Sheets[name] = ws;
  }

  if (!window.XLSX) {
    showAlertModal('XLSX Export', 'XLSX library not available. Use Print / Save as PDF instead.');
    return;
  }

  // Cover sheet
  addSheet('Cover', [
    ['CableTrayRoute — Submittal Package'],
    ['Project Name', info.projectName],
    ['Project Number', info.projectNumber],
    ['Client', info.client],
    ['Engineer', info.engineer],
    ['Date', info.date],
    ['NEC Edition', `NEC ${info.necEdition}`],
    ['Revision', info.revision],
  ]);

  // Equipment
  if (equipment.length) {
    const rows = [['Tag', 'Description', 'Voltage (V)', 'Rating (kVA/kW)', 'Phase', 'Location']];
    equipment.forEach(e => rows.push([
      e.tag || e.id || '', e.description || e.name || '',
      e.voltage || '', e.kva || e.kw || '', e.phase || '', e.location || '',
    ]));
    addSheet('Equipment', rows);
  }

  // Cables
  if (cables.length) {
    const rows = [['Tag', 'From', 'To', 'Voltage (V)', 'Conductors', 'Size', 'Insulation', 'Group']];
    cables.forEach(c => rows.push([
      c.cable_tag || c.tag || '', c.from_device || c.from || '',
      c.to_device || c.to || '', c.voltage_rating || c.voltage || '',
      c.conductors || '', c.conductor_size || c.size || '',
      c.insulation || '', c.cable_group || c.group || '',
    ]));
    addSheet('Cables', rows);
  }

  // Trays
  if (trays.length) {
    const rows = [['Tray ID', 'Type', 'Width (in)', 'Depth (in)', 'Material', 'Length (ft)']];
    trays.forEach(t => rows.push([
      t.tray_id || '', t.tray_type || '', t.inside_width || '',
      t.depth || '', t.material || '', t.length_ft || '',
    ]));
    addSheet('Trays', rows);
  }

  // Conduits
  if (conduits.length) {
    const rows = [['Conduit ID', 'Type', 'Trade Size (in)', 'Length (ft)']];
    conduits.forEach(c => rows.push([
      c.conduit_id || '', c.conduit_type || '', c.trade_size || c.diameter || '', c.length_ft || '',
    ]));
    addSheet('Conduits', rows);
  }

  const filename = `submittal_${info.projectNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}_Rev${info.revision}.xlsx`;
  XLSX.writeFile(wb, filename);
}
