import {
  runHazAreaStudy,
  checkAllEquipment,
  NEC_CLASSES,
  NEC_DIVISIONS,
  NEC_GAS_GROUPS,
  NEC_DUST_GROUPS,
  IEC_GAS_ZONES,
  IEC_DUST_ZONES,
  IEC_EQUIPMENT_GROUPS,
  EX_PROTECTION_TYPES,
  T_RATINGS,
} from './analysis/hazAreaClassification.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('hazAreaClassification');

  // Tab switching
  const tabAreas   = document.getElementById('tab-areas');
  const tabEquip   = document.getElementById('tab-equipment');
  const panelAreas = document.getElementById('panel-areas');
  const panelEquip = document.getElementById('panel-equipment');

  function activateTab(tab) {
    const isAreas = tab === 'areas';
    tabAreas.setAttribute('aria-selected', isAreas ? 'true' : 'false');
    tabEquip.setAttribute('aria-selected', isAreas ? 'false' : 'true');
    tabAreas.classList.toggle('tab-btn--active', isAreas);
    tabEquip.classList.toggle('tab-btn--active', !isAreas);
    panelAreas.hidden = !isAreas;
    panelEquip.hidden = isAreas;
  }

  tabAreas.addEventListener('click', () => activateTab('areas'));
  tabEquip.addEventListener('click', () => activateTab('equipment'));

  // Button bindings
  document.getElementById('add-area-btn').addEventListener('click',  () => addAreaRow());
  document.getElementById('add-equip-btn').addEventListener('click', () => addEquipRow());
  document.getElementById('run-study-btn').addEventListener('click', runStudy);
  document.getElementById('check-equip-btn').addEventListener('click', checkEquipment);
  document.getElementById('export-csv-btn').addEventListener('click', exportCsv);

  // Restore persisted state
  const saved = getStudies().hazAreaClassification;
  if (saved && saved._inputs) {
    restoreState(saved._inputs);
    renderAreaResults(saved);
    renderEquipResults(saved);
    document.getElementById('export-csv-btn').disabled = false;
    document.getElementById('export-csv-btn').removeAttribute('aria-disabled');
  } else {
    addAreaRow({ id: 'zone-1', label: 'Pump Room', standard: 'IEC', iecZone: '1', gasGroup: 'IIB', tRating: 'T3' });
    addEquipRow({ id: 'e1', label: 'Junction Box', hazAreaId: 'zone-1', exProtection: 'e', exGroup: 'IIB', tRating: 'T3' });
  }

  // -------------------------------------------------------------------------
  // Area rows
  // -------------------------------------------------------------------------

  let areaCount = 0;

  function addAreaRow(defaults = {}) {
    const container = document.getElementById('areas-container');
    const id = ++areaCount;
    const row = document.createElement('div');
    row.className = 'field-group field-group--bordered area-row';
    row.dataset.rowId = id;

    const necClassOpts = NEC_CLASSES.map(c =>
      `<option value="${c.value}"${defaults.necClass === c.value ? ' selected' : ''}>${escapeHtml(c.label)}</option>`
    ).join('');
    const necDivOpts = NEC_DIVISIONS.map(d =>
      `<option value="${d.value}"${defaults.necDivision === d.value ? ' selected' : ''}>${escapeHtml(d.label)}</option>`
    ).join('');
    const gasGroupOpts = ['', ...NEC_GAS_GROUPS.map(g => g.value)].map(v =>
      `<option value="${v}"${(defaults.gasGroup || '') === v ? ' selected' : ''}>${v ? escapeHtml(NEC_GAS_GROUPS.find(g=>g.value===v)?.label||v) : '— Not specified —'}</option>`
    ).join('');
    const dustGroupOpts = ['', ...NEC_DUST_GROUPS.map(g => g.value)].map(v =>
      `<option value="${v}"${(defaults.dustGroup || '') === v ? ' selected' : ''}>${v ? escapeHtml(NEC_DUST_GROUPS.find(g=>g.value===v)?.label||v) : '— Not specified —'}</option>`
    ).join('');
    const iecGasOpts = ['', ...IEC_GAS_ZONES.map(z => z.value)].map(v =>
      `<option value="${v}"${(defaults.iecZone || '') === v ? ' selected' : ''}>${v ? escapeHtml(IEC_GAS_ZONES.find(z=>z.value===v)?.label||v) : '— None —'}</option>`
    ).join('');
    const iecDustOpts = ['', ...IEC_DUST_ZONES.map(z => z.value)].map(v =>
      `<option value="${v}"${(defaults.dustZone || '') === v ? ' selected' : ''}>${v ? escapeHtml(IEC_DUST_ZONES.find(z=>z.value===v)?.label||v) : '— None —'}</option>`
    ).join('');
    const iecGroupOpts = ['', ...IEC_EQUIPMENT_GROUPS.map(g => g.value)].map(v =>
      `<option value="${v}"${(defaults.gasGroup || defaults.dustGroup || '') === v ? ' selected' : ''}>${v ? escapeHtml(IEC_EQUIPMENT_GROUPS.find(g=>g.value===v)?.label||v) : '— Not specified —'}</option>`
    ).join('');
    const tRatingOpts = ['', ...T_RATINGS.map(t => t.value)].map(v =>
      `<option value="${v}"${(defaults.tRating || '') === v ? ' selected' : ''}>${v ? escapeHtml(T_RATINGS.find(t=>t.value===v)?.label||v) : '— Not specified —'}</option>`
    ).join('');

    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem">
        <strong class="area-row-title">Area ${id}</strong>
        <button type="button" class="btn area-remove-btn" aria-label="Remove area ${id}" title="Remove">✕</button>
      </div>
      <div class="field-row-inline">
        <label>Area ID <input type="text" class="area-id" value="${escapeHtml(defaults.id || `area-${id}`)}" placeholder="e.g. pump-room" aria-label="Area ID"></label>
        <label>Label <input type="text" class="area-label" value="${escapeHtml(defaults.label || '')}" placeholder="e.g. Pump Room" aria-label="Area label"></label>
        <label>Standard
          <select class="area-standard" aria-label="Classification standard">
            <option value="NEC"${defaults.standard !== 'IEC' ? ' selected' : ''}>NEC (Class/Division)</option>
            <option value="IEC"${defaults.standard === 'IEC' ? ' selected' : ''}>IEC 60079 (Zone)</option>
          </select>
        </label>
      </div>
      <div class="area-nec-fields field-row-inline"${defaults.standard === 'IEC' ? ' hidden' : ''}>
        <label>NEC Class <select class="area-nec-class" aria-label="NEC class">${necClassOpts}</select></label>
        <label>Division <select class="area-nec-div" aria-label="NEC division">${necDivOpts}</select></label>
        <label>Gas Group (Class I) <select class="area-gas-group-nec" aria-label="NEC gas group">${gasGroupOpts}</select></label>
        <label>Dust Group (Class II) <select class="area-dust-group-nec" aria-label="NEC dust group">${dustGroupOpts}</select></label>
      </div>
      <div class="area-iec-fields field-row-inline"${defaults.standard !== 'IEC' ? ' hidden' : ''}>
        <label>Gas Zone <select class="area-iec-zone" aria-label="IEC gas zone">${iecGasOpts}</select></label>
        <label>Dust Zone <select class="area-dust-zone" aria-label="IEC dust zone">${iecDustOpts}</select></label>
        <label>Equipment Group <select class="area-iec-group" aria-label="IEC equipment group">${iecGroupOpts}</select></label>
      </div>
      <div class="field-row-inline">
        <label>Minimum T-Rating <select class="area-t-rating" aria-label="Minimum T-rating required">${tRatingOpts}</select></label>
        <label style="flex:2">Area Description / Notes <input type="text" class="area-notes" value="${escapeHtml(defaults.notes || '')}" placeholder="Optional notes" aria-label="Notes"></label>
      </div>`;

    const stdSelect = row.querySelector('.area-standard');
    const necFields = row.querySelector('.area-nec-fields');
    const iecFields = row.querySelector('.area-iec-fields');
    stdSelect.addEventListener('change', () => {
      const isIec = stdSelect.value === 'IEC';
      necFields.hidden = isIec;
      iecFields.hidden = !isIec;
    });

    row.querySelector('.area-remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function readAreas() {
    return Array.from(document.querySelectorAll('.area-row')).map(row => {
      const std = row.querySelector('.area-standard').value;
      const obj = {
        id:       row.querySelector('.area-id').value.trim(),
        label:    row.querySelector('.area-label').value.trim(),
        standard: std,
        tRating:  row.querySelector('.area-t-rating').value || undefined,
        notes:    row.querySelector('.area-notes').value.trim(),
      };
      if (std === 'NEC') {
        obj.necClass    = row.querySelector('.area-nec-class').value;
        obj.necDivision = row.querySelector('.area-nec-div').value;
        obj.gasGroup    = row.querySelector('.area-gas-group-nec').value || undefined;
        obj.dustGroup   = row.querySelector('.area-dust-group-nec').value || undefined;
      } else {
        obj.iecZone  = row.querySelector('.area-iec-zone').value   || undefined;
        obj.dustZone = row.querySelector('.area-dust-zone').value  || undefined;
        obj.gasGroup = row.querySelector('.area-iec-group').value  || undefined;
      }
      return obj;
    });
  }

  // -------------------------------------------------------------------------
  // Equipment rows
  // -------------------------------------------------------------------------

  let equipCount = 0;

  function addEquipRow(defaults = {}) {
    const container = document.getElementById('equipment-container');
    const id = ++equipCount;
    const row = document.createElement('div');
    row.className = 'field-group field-group--bordered equip-row';
    row.dataset.rowId = id;

    const protOpts = ['', ...EX_PROTECTION_TYPES.map(p => p.value)].map(v =>
      `<option value="${v}"${(defaults.exProtection || '') === v ? ' selected' : ''}>${v ? escapeHtml(EX_PROTECTION_TYPES.find(p=>p.value===v)?.label||v) : '— Not specified —'}</option>`
    ).join('');
    const groupOpts = ['', ...IEC_EQUIPMENT_GROUPS.map(g => g.value)].map(v =>
      `<option value="${v}"${(defaults.exGroup || '') === v ? ' selected' : ''}>${v ? escapeHtml(IEC_EQUIPMENT_GROUPS.find(g=>g.value===v)?.label||v) : '— Not specified —'}</option>`
    ).join('');
    const tOpts = ['', ...T_RATINGS.map(t => t.value)].map(v =>
      `<option value="${v}"${(defaults.tRating || '') === v ? ' selected' : ''}>${v ? escapeHtml(T_RATINGS.find(t=>t.value===v)?.label||v) : '— Not specified —'}</option>`
    ).join('');

    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem">
        <strong>Equipment ${id}</strong>
        <button type="button" class="btn equip-remove-btn" aria-label="Remove equipment ${id}" title="Remove">✕</button>
      </div>
      <div class="field-row-inline">
        <label>Equipment ID <input type="text" class="equip-id" value="${escapeHtml(defaults.id || `equip-${id}`)}" placeholder="e.g. JB-101" aria-label="Equipment ID"></label>
        <label>Label / Description <input type="text" class="equip-label" value="${escapeHtml(defaults.label || '')}" placeholder="e.g. Junction Box" aria-label="Equipment label"></label>
        <label>Assigned Area ID <input type="text" class="equip-area-id" value="${escapeHtml(defaults.hazAreaId || '')}" placeholder="e.g. pump-room" aria-label="Assigned area ID"></label>
      </div>
      <div class="field-row-inline">
        <label>Ex Protection Type <select class="equip-protection" aria-label="Ex protection type">${protOpts}</select></label>
        <label>Equipment Group <select class="equip-group" aria-label="Equipment group">${groupOpts}</select></label>
        <label>T-Rating <select class="equip-t-rating" aria-label="Equipment T-rating">${tOpts}</select></label>
        <label>Cert Number <input type="text" class="equip-cert" value="${escapeHtml(defaults.certNumber || '')}" placeholder="e.g. IECEx UL 22.0001" aria-label="Certification number"></label>
      </div>`;

    row.querySelector('.equip-remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function readEquipment() {
    return Array.from(document.querySelectorAll('.equip-row')).map(row => ({
      id:           row.querySelector('.equip-id').value.trim(),
      label:        row.querySelector('.equip-label').value.trim(),
      hazAreaId:    row.querySelector('.equip-area-id').value.trim(),
      exProtection: row.querySelector('.equip-protection').value || undefined,
      exGroup:      row.querySelector('.equip-group').value      || undefined,
      tRating:      row.querySelector('.equip-t-rating').value   || undefined,
      certNumber:   row.querySelector('.equip-cert').value.trim()|| undefined,
    })).filter(e => e.id || e.label);
  }

  // -------------------------------------------------------------------------
  // Run study
  // -------------------------------------------------------------------------

  function runStudy() {
    const areas = readAreas();
    const equipment = readEquipment();
    const inputs = { areas, equipment };

    const warnPanel = document.getElementById('warnings-panel');
    const areaRes   = document.getElementById('area-results');

    const { valid, errors, result } = runHazAreaStudy(inputs);

    if (!valid) {
      warnPanel.hidden = false;
      warnPanel.innerHTML = `<div class="drc-error"><strong>Input errors:</strong><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
      areaRes.hidden = true;
      return;
    }

    warnPanel.hidden = true;
    renderAreaResults(result);

    const exportBtn = document.getElementById('export-csv-btn');
    exportBtn.disabled = false;
    exportBtn.removeAttribute('aria-disabled');

    setStudies({ ...getStudies(), hazAreaClassification: result });
  }

  function checkEquipment() {
    const areas = readAreas();
    const equipment = readEquipment();

    // Need at least areas to be valid for checking
    const { valid, errors, result } = runHazAreaStudy({ areas, equipment });
    if (!valid) {
      const equipRes = document.getElementById('equipment-results');
      equipRes.hidden = false;
      equipRes.innerHTML = `<div class="drc-error"><strong>Fix classified areas first:</strong><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
      return;
    }
    renderEquipResults(result);
    setStudies({ ...getStudies(), hazAreaClassification: result });
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function statusBadge(status) {
    const cls = status === 'PASS' ? 'drc-pass' : status === 'FAIL' ? 'drc-error' : 'drc-warning';
    return `<span class="${cls}">${escapeHtml(status)}</span>`;
  }

  function renderAreaResults(result) {
    const el = document.getElementById('area-results');
    if (!result || !result.areas) return;

    const { summary, areas } = result;
    const areaRows = areas.map(a => `
      <tr>
        <td>${escapeHtml(a.label)}</td>
        <td><code>${escapeHtml(a.standard)}</code></td>
        <td>${escapeHtml(a.designation)}</td>
        <td>${escapeHtml(a.gasGroup)}</td>
        <td>${escapeHtml(a.tRating)}</td>
        <td>${a.equipCount}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>`).join('');

    el.hidden = false;
    el.innerHTML = `
      <h2>Classification Summary</h2>
      <p>Overall status: ${statusBadge(summary.status)} — ${summary.totalAreas} areas, ${summary.totalEquipment} equipment items checked (${summary.passCount} pass, ${summary.failCount} fail, ${summary.warnCount} warnings)</p>
      <table class="results-table" aria-label="Classified area summary">
        <thead>
          <tr>
            <th>Area</th><th>Standard</th><th>Designation</th>
            <th>Group</th><th>T-Rating</th><th>Equipment</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${areaRows}</tbody>
      </table>`;
  }

  function renderEquipResults(result) {
    const el = document.getElementById('equipment-results');
    if (!result || !result.equipment) return;

    const rows = result.equipment.map(r => {
      const status = r.pass === null ? 'WARN' : r.pass ? 'PASS' : 'FAIL';
      const issues = [...(r.failures || []), ...(r.warnings || [])];
      return `
        <tr>
          <td>${escapeHtml(r.label || r.equipId)}</td>
          <td><code>${escapeHtml(r.areaLabel || r.areaId || '—')}</code></td>
          <td>${statusBadge(status)}</td>
          <td>${issues.length > 0
              ? `<ul class="compact-list">${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
              : '—'}</td>
        </tr>`;
    }).join('');

    el.hidden = false;
    el.innerHTML = `
      <h2>Equipment Compatibility Results</h2>
      <table class="results-table" aria-label="Equipment compatibility results">
        <thead><tr><th>Equipment</th><th>Area</th><th>Status</th><th>Issues</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No equipment to check.</td></tr>'}</tbody>
      </table>`;
  }

  // -------------------------------------------------------------------------
  // CSV Export
  // -------------------------------------------------------------------------

  function exportCsv() {
    const saved = getStudies().hazAreaClassification;
    if (!saved) return;

    const areaLines = [
      'Area ID,Label,Standard,Designation,Gas/Dust Group,T-Rating,Equipment Count,Status',
      ...(saved.areas || []).map(a =>
        [a.id, a.label, a.standard, a.designation, a.gasGroup, a.tRating, a.equipCount, a.status]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];

    const equipLines = [
      '',
      'Equipment ID,Label,Area,Status,Issues',
      ...(saved.equipment || []).map(r => {
        const status = r.pass === null ? 'WARN' : r.pass ? 'PASS' : 'FAIL';
        const issues = [...(r.failures || []), ...(r.warnings || [])].join('; ');
        return [r.equipId, r.label, r.areaId, status, issues]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',');
      }),
    ];

    const csv = [...areaLines, ...equipLines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'haz-area-classification.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // -------------------------------------------------------------------------
  // Restore persisted state
  // -------------------------------------------------------------------------

  function restoreState(inputs) {
    if (!inputs) return;
    document.getElementById('areas-container').innerHTML = '';
    document.getElementById('equipment-container').innerHTML = '';
    areaCount = 0;
    equipCount = 0;
    for (const area of (inputs.areas || [])) addAreaRow(area);
    for (const equip of (inputs.equipment || [])) addEquipRow(equip);
  }
});
