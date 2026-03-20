import { buildTrayHardwareBOM } from '../analysis/trayHardware.mjs';
import { getTrays } from '../dataStore.mjs';
import { showAlertModal } from './components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const loadClassSel      = document.getElementById('loadClass');
  const cableLoadInput    = document.getElementById('cableLoadPerFt');
  const sectionLenInput   = document.getElementById('sectionLength');
  const includeCoversChk  = document.getElementById('includeCovers');
  const generateBtn       = document.getElementById('generateBtn');
  const exportXlsxBtn     = document.getElementById('exportXlsxBtn');
  const resultsDiv        = document.getElementById('results');

  let lastBOM = null;

  generateBtn.addEventListener('click', () => {
    const trays = getTrays();
    if (!trays || trays.length === 0) {
      showAlertModal('No Tray Data', 'No trays found in the Raceway Schedule. Add trays first.');
      return;
    }

    const loadClass     = loadClassSel.value;
    const cableLoad     = parseFloat(cableLoadInput.value) || 0;
    const sectionLen    = parseFloat(sectionLenInput.value) || 12;
    const includeCovers = includeCoversChk.checked;

    if (!Number.isFinite(sectionLen) || sectionLen <= 0) {
      showAlertModal('Invalid Input', 'Standard section length must be a positive number.');
      return;
    }

    let bom;
    try {
      bom = buildTrayHardwareBOM(trays, {
        loadClass,
        cableLoadPerFt: cableLoad,
        includeCoverSections: includeCovers,
        standardSectionLength: sectionLen,
      });
    } catch (err) {
      showAlertModal('Calculation Error', err.message);
      return;
    }

    lastBOM = bom;
    renderBOM(bom, resultsDiv);
    exportXlsxBtn.disabled = false;
  });

  exportXlsxBtn.addEventListener('click', () => {
    if (!lastBOM) return;
    if (typeof XLSX === 'undefined') {
      showAlertModal('Library Error', 'XLSX library not loaded.');
      return;
    }
    exportBOMtoXlsx(lastBOM);
  });

  function renderBOM(bom, container) {
    container.innerHTML = '';

    if (bom.summary.length === 0) {
      container.innerHTML = '<p>No hardware items calculated. Verify that trays have valid coordinates in the Raceway Schedule.</p>';
      return;
    }

    // Summary table
    const summarySection = document.createElement('section');
    summarySection.innerHTML = '<h2>Hardware Summary (Procurement View)</h2>';
    summarySection.appendChild(buildTable(
      ['Category', 'Item Description', 'Width (in)', 'Qty', 'Unit'],
      bom.summary.map(r => [r.category, r.item, r.width_in || '—', r.qty, r.unit])
    ));
    container.appendChild(summarySection);

    // Fittings detail
    if (bom.fittings.length > 0) {
      const fitSection = document.createElement('section');
      fitSection.innerHTML = '<h2>Fittings Detail</h2>';
      fitSection.appendChild(buildTable(
        ['Type', 'Tray IDs', 'Width(s) (in)', 'Angle (°)'],
        bom.fittings.map(f => [
          formatFittingLabel(f.type),
          (f.tray_ids || []).join(', '),
          (f.widths || []).join(' / '),
          f.angle != null ? f.angle : '—',
        ])
      ));
      container.appendChild(fitSection);
    }

    // Supports detail
    if (bom.supports.length > 0) {
      const supSection = document.createElement('section');
      supSection.innerHTML = '<h2>Support Brackets Detail</h2>';
      supSection.appendChild(buildTable(
        ['Tray ID', 'Type', 'Width (in)', 'Depth (in)', 'Length (ft)', 'Max Span (ft)', 'Brackets'],
        bom.supports.map(s => [
          s.tray_id,
          s.tray_type || '—',
          s.width,
          s.depth,
          s.length_ft,
          s.max_span_ft,
          s.bracket_qty,
        ])
      ));
      container.appendChild(supSection);
    }

    // Sections detail
    if (bom.sections.length > 0) {
      const secSection = document.createElement('section');
      secSection.innerHTML = '<h2>Straight Sections &amp; Covers Detail</h2>';
      secSection.appendChild(buildTable(
        ['Tray ID', 'Type', 'Width (in)', 'Length (ft)', 'Sections', 'Cover Sections'],
        bom.sections.map(s => [
          s.tray_id,
          s.tray_type || '—',
          s.width,
          s.length_ft,
          s.straight_sections,
          s.cover_sections,
        ])
      ));
      container.appendChild(secSection);
    }
  }

  function buildTable(headers, rows) {
    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(cells => {
      const tr = document.createElement('tr');
      cells.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = cell != null ? String(cell) : '—';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function formatFittingLabel(type) {
    const labels = {
      elbow: 'Elbow',
      tee: 'Tee',
      cross: 'Cross',
      reducer: 'Reducer',
      splice_plate: 'Splice Plate',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function exportBOMtoXlsx(bom) {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [['Category', 'Item Description', 'Width (in)', 'Qty', 'Unit'],
      ...bom.summary.map(r => [r.category, r.item, r.width_in || '', r.qty, r.unit])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

    // Fittings sheet
    if (bom.fittings.length > 0) {
      const fitData = [['Type', 'Tray IDs', 'Widths (in)', 'Angle (deg)'],
        ...bom.fittings.map(f => [
          formatFittingLabel(f.type),
          (f.tray_ids || []).join(', '),
          (f.widths || []).join(' / '),
          f.angle != null ? f.angle : '',
        ])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fitData), 'Fittings');
    }

    // Supports sheet
    if (bom.supports.length > 0) {
      const supData = [['Tray ID', 'Type', 'Width (in)', 'Depth (in)', 'Length (ft)', 'Max Span (ft)', 'Brackets'],
        ...bom.supports.map(s => [s.tray_id, s.tray_type, s.width, s.depth, s.length_ft, s.max_span_ft, s.bracket_qty])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(supData), 'Supports');
    }

    // Sections sheet
    if (bom.sections.length > 0) {
      const secData = [['Tray ID', 'Type', 'Width (in)', 'Length (ft)', 'Straight Sections', 'Cover Sections'],
        ...bom.sections.map(s => [s.tray_id, s.tray_type, s.width, s.length_ft, s.straight_sections, s.cover_sections])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(secData), 'Sections');
    }

    const stamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `tray-hardware-bom-${stamp}.xlsx`);
  }
});
