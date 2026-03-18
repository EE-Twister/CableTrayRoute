import { buildTrayHardwareBOM } from './analysis/trayHardware.mjs';
import { getTrays } from './dataStore.mjs';
import { NEMA_LOAD_CLASSES } from './analysis/supportSpan.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const loadProjectBtn = document.getElementById('loadProjectBtn');
  const importXlsxBtn = document.getElementById('importXlsxBtn');
  const xlsxFileInput = document.getElementById('xlsxFileInput');
  const loadClassSel = document.getElementById('loadClassSel');
  const sectionLenInput = document.getElementById('sectionLenInput');
  const includeCoversCb = document.getElementById('includeCoversCb');
  const summarySection = document.getElementById('summarySection');
  const summaryCards = document.getElementById('summaryCards');
  const procurementSection = document.getElementById('procurementSection');
  const procurementBody = document.querySelector('#procurementTable tbody');
  const fittingsSection = document.getElementById('fittingsSection');
  const fittingsBody = document.querySelector('#fittingsTable tbody');
  const sectionsSection = document.getElementById('sectionsSection');
  const sectionsBody = document.querySelector('#sectionsTable tbody');
  const supportsSection = document.getElementById('supportsSection');
  const supportsBody = document.querySelector('#supportsTable tbody');
  const exportBomBtn = document.getElementById('exportBomBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  let currentBOM = null;

  // ---- Populate NEMA load class selector ----

  Object.entries(NEMA_LOAD_CLASSES).forEach(([cls, info]) => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = `Class ${cls} — ${info.ratedLoad} lbs/ft`;
    if (cls === '16A') opt.selected = true;
    loadClassSel.appendChild(opt);
  });

  // ---- Load from project ----

  loadProjectBtn.addEventListener('click', () => {
    const trays = getTrays();
    if (!trays || trays.length === 0) {
      showAlertModal('No tray data found in the current project. Please add trays in the Raceway Schedule first.');
      return;
    }
    generateBOM(trays);
  });

  // ---- Import from XLSX ----

  importXlsxBtn.addEventListener('click', () => xlsxFileInput.click());

  xlsxFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded. Please refresh and try again.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const trays = parseRacewayXLSX(wb);
        if (!trays.length) {
          showAlertModal('No tray data found in the file. Make sure you are importing the Raceway Schedule XLSX file with start_x, start_y, start_z, end_x, end_y, end_z columns.');
          return;
        }
        generateBOM(trays);
      } catch (err) {
        showAlertModal(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    xlsxFileInput.value = '';
  });

  // ---- Parse raceway XLSX ----

  function parseRacewayXLSX(wb) {
    // Try common sheet names
    const sheetName = wb.SheetNames.find(n =>
      /raceway|tray|segment/i.test(n)
    ) || wb.SheetNames[0];

    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

    return rows
      .filter(r => r.tray_id || r['Tray ID'] || r['tray id'])
      .map(r => ({
        tray_id: r.tray_id || r['Tray ID'] || r['tray id'] || '',
        tray_type: r.tray_type || r['Tray Type'] || r['Type'] || '',
        inside_width: parseFloat(r.inside_width || r['Width (in)'] || r['inside width'] || 0),
        tray_depth: parseFloat(r.tray_depth || r['Depth (in)'] || r['tray depth'] || 0),
        start_x: parseFloat(r.start_x || r['Start X'] || 0),
        start_y: parseFloat(r.start_y || r['Start Y'] || 0),
        start_z: parseFloat(r.start_z || r['Start Z'] || 0),
        end_x: parseFloat(r.end_x || r['End X'] || 0),
        end_y: parseFloat(r.end_y || r['End Y'] || 0),
        end_z: parseFloat(r.end_z || r['End Z'] || 0),
      }))
      .filter(t => t.tray_id);
  }

  // ---- Generate BOM ----

  function generateBOM(trays) {
    const loadClass = loadClassSel.value;
    const standardSectionLength = parseFloat(sectionLenInput.value) || 12;
    const includeCoverSections = includeCoversCb.checked;

    const bom = buildTrayHardwareBOM(trays, {
      loadClass,
      includeCoverSections,
      standardSectionLength,
    });

    currentBOM = bom;
    renderBOM(bom, trays.length);
  }

  // ---- Render BOM ----

  function renderBOM(bom, trayCount) {
    const { fittings, supports, sections, summary } = bom;

    // Summary stats
    const totalFittings = fittings.length;
    const totalBrackets = supports.reduce((s, r) => s + r.bracket_qty, 0);
    const totalStraight = sections.reduce((s, r) => s + r.straight_sections, 0);
    const totalCovers = sections.reduce((s, r) => s + r.cover_sections, 0);
    const totalLength = sections.reduce((s, r) => s + r.length_ft, 0);

    summaryCards.innerHTML = `
      <div class="summary-stat">
        <span class="stat-value">${trayCount}</span>
        <span class="stat-label">Tray Segments</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${Math.round(totalLength * 10) / 10}</span>
        <span class="stat-label">Total Length (ft)</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${totalStraight}</span>
        <span class="stat-label">Straight Sections</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${totalCovers}</span>
        <span class="stat-label">Cover Sections</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${totalFittings}</span>
        <span class="stat-label">Fittings</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${totalBrackets}</span>
        <span class="stat-label">Support Brackets</span>
      </div>`;

    summarySection.hidden = false;

    // Procurement summary
    procurementBody.innerHTML = summary.map(item => `<tr>
      <td>${esc(item.category)}</td>
      <td>${esc(item.item)}</td>
      <td>${item.width_in || '—'}</td>
      <td>${item.qty}</td>
      <td>${esc(item.unit)}</td>
    </tr>`).join('');
    procurementSection.hidden = false;

    // Fittings detail
    fittingsBody.innerHTML = fittings.length
      ? fittings.map(f => `<tr>
          <td>${esc(formatFittingName(f.type))}</td>
          <td>${f.angle != null ? f.angle : '—'}</td>
          <td>${esc((f.tray_ids || []).join(', '))}</td>
          <td>${(f.widths || []).join(', ')}</td>
        </tr>`).join('')
      : '<tr><td colspan="4">No fittings detected</td></tr>';
    fittingsSection.hidden = false;

    // Sections detail
    sectionsBody.innerHTML = sections.length
      ? sections.map(s => `<tr>
          <td>${esc(s.tray_id)}</td>
          <td>${esc(s.tray_type || '—')}</td>
          <td>${s.width}</td>
          <td>${s.length_ft}</td>
          <td>${s.straight_sections}</td>
          <td>${s.cover_sections}</td>
        </tr>`).join('')
      : '<tr><td colspan="6">No sections</td></tr>';
    sectionsSection.hidden = false;

    // Supports detail
    supportsBody.innerHTML = supports.length
      ? supports.map(s => `<tr>
          <td>${esc(s.tray_id)}</td>
          <td>${esc(s.tray_type || '—')}</td>
          <td>${s.width}</td>
          <td>${s.length_ft}</td>
          <td>${s.max_span_ft}</td>
          <td>${s.bracket_qty}</td>
        </tr>`).join('')
      : '<tr><td colspan="6">No supports</td></tr>';
    supportsSection.hidden = false;
  }

  // ---- Export XLSX ----

  exportBomBtn.addEventListener('click', () => {
    if (!currentBOM) {
      showAlertModal('No BOM data to export. Generate the BOM first.');
      return;
    }
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Procurement Summary
    const summaryRows = currentBOM.summary.map(item => ({
      'Category': item.category,
      'Item': item.item,
      'Width (in)': item.width_in || '',
      'Qty': item.qty,
      'Unit': item.unit,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Procurement Summary');

    // Sheet 2: Fittings
    const fittingRows = currentBOM.fittings.map(f => ({
      'Type': formatFittingName(f.type),
      'Angle (deg)': f.angle != null ? f.angle : '',
      'Tray IDs': (f.tray_ids || []).join(', '),
      'Widths (in)': (f.widths || []).join(', '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fittingRows.length ? fittingRows : [{}]), 'Fittings');

    // Sheet 3: Sections
    const sectionRows = currentBOM.sections.map(s => ({
      'Tray ID': s.tray_id,
      'Type': s.tray_type || '',
      'Width (in)': s.width,
      'Length (ft)': s.length_ft,
      'Straight Sections': s.straight_sections,
      'Section Length (ft)': s.section_length_ft,
      'Cover Sections': s.cover_sections,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sectionRows.length ? sectionRows : [{}]), 'Sections');

    // Sheet 4: Supports
    const supportRows = currentBOM.supports.map(s => ({
      'Tray ID': s.tray_id,
      'Type': s.tray_type || '',
      'Width (in)': s.width,
      'Depth (in)': s.depth,
      'Length (ft)': s.length_ft,
      'Max Span (ft)': s.max_span_ft,
      'Brackets': s.bracket_qty,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supportRows.length ? supportRows : [{}]), 'Supports');

    XLSX.writeFile(wb, 'tray_hardware_bom.xlsx');
  });

  // ---- Export CSV ----

  exportCsvBtn.addEventListener('click', () => {
    if (!currentBOM) {
      showAlertModal('No BOM data to export. Generate the BOM first.');
      return;
    }

    const lines = [
      'Category,Item,Width (in),Qty,Unit',
      ...currentBOM.summary.map(item =>
        [item.category, item.item, item.width_in || '', item.qty, item.unit]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tray_hardware_bom.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---- Helpers ----

  function formatFittingName(type) {
    const names = {
      elbow: 'Elbow',
      tee: 'Tee',
      cross: 'Cross',
      reducer: 'Reducer',
      splice_plate: 'Splice Plate',
    };
    return names[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
