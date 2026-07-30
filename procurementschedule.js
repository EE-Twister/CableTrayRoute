import {
  calculateProcurement,
  exportProcurementCSV,
  normalizeProcurementRegister,
  PROCUREMENT_STATUSES,
  reconcileProcurementRegister,
  STANDARD_REEL_SIZES
} from './analysis/cableProcurement.mjs';
import {
  getCables,
  getProjectInputFingerprint,
  getProcurementRegister,
  getItem,
  setProcurementRegister,
  upsertDeliverableArtifact
} from './dataStore.mjs';
import { normalizeDeliverableArtifact } from './analysis/deliverableArtifacts.mjs';
import { normalizeRouteResults } from './analysis/deliverableWorkflow.mjs';
import { listAppSettingKeys, readAppSetting } from './projectStorage.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const generateBtn = document.getElementById('generateBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const noDataMsg = document.getElementById('noDataMsg');
  const summarySection = document.getElementById('summarySection');
  const summaryTbody = document.querySelector('#summaryTable tbody');
  const lineItemsSection = document.getElementById('lineItemsSection');
  const lineItemsTbody = document.querySelector('#lineItemsTable tbody');
  const coverageSection = document.getElementById('coverageSection');
  const coverageStatus = document.getElementById('coverageStatus');
  const coverageWarnings = document.getElementById('coverageWarnings');
  const registerSection = document.getElementById('registerSection');
  const registerTbody = document.querySelector('#registerTable tbody');
  const inactiveRegisterMsg = document.getElementById('inactiveRegisterMsg');

  let lastReport = null;
  let procurementRegister = normalizeProcurementRegister(getProcurementRegister());

  const reelGroup = document.getElementById('reelSizeGroup');
  if (reelGroup) {
    reelGroup.innerHTML = STANDARD_REEL_SIZES.map(rs =>
      `<label><input type="checkbox" class="reel-size-check" value="${rs.feet}" checked> ${rs.name}</label>`
    ).join('');
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(value) {
    return esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function loadRouteResults() {
    const latestRouteResults = normalizeRouteResults(getItem('latestRouteResults', null));
    if (latestRouteResults.length > 0) return latestRouteResults;

    for (const key of listAppSettingKeys()) {
      if (!key.includes('routeCache')) continue;
      try {
        const cached = JSON.parse(readAppSetting(key));
        const routeResults = normalizeRouteResults(cached);
        if (routeResults.length > 0) return routeResults;
      } catch {
        // Skip malformed route-cache entries and continue searching.
      }
    }
    return null;
  }

  function getSelectedReelSizes() {
    const checked = [...document.querySelectorAll('.reel-size-check:checked')];
    if (checked.length === 0) return STANDARD_REEL_SIZES;
    return checked.map(checkbox => {
      const feet = parseInt(checkbox.value, 10);
      return STANDARD_REEL_SIZES.find(reel => reel.feet === feet)
        ?? { name: `${feet} ft`, feet };
    });
  }

  function renderSummary(summary) {
    const rows = [
      ['Product specifications', summary.total_line_items],
      ['Total cable cuts', summary.total_cut_count],
      ['Total required (ft)', summary.total_required_ft],
      ['Total ordered (ft)', summary.total_ordered_ft],
      ['Total waste (ft)', summary.total_waste_ft],
      ['Average waste (%)', `${summary.avg_waste_pct} %`],
    ];
    summaryTbody.innerHTML = rows.map(([label, value]) =>
      `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`
    ).join('');
    summarySection.hidden = false;
  }

  function renderCoverage(report) {
    const coverage = report.coverage ?? {};
    const status = coverage.procurement_ready
      ? 'Ready for commercial review'
      : 'Schedule data needs attention';
    coverageStatus.textContent = `${status}: ${coverage.complete_spec_cables ?? 0} of `
      + `${coverage.routed_cables ?? 0} routed cables have complete purchasing specifications.`;
    coverageStatus.className = coverage.procurement_ready ? 'status-pass' : 'status-warn';

    const warnings = report.warnings ?? [];
    coverageWarnings.innerHTML = warnings.slice(0, 50).map(warning =>
      `<li><strong>${esc(warning.severity === 'error' ? 'Required' : 'Review')}:</strong> `
      + `${esc(warning.message)}</li>`
    ).join('');
    if (warnings.length > 50) {
      coverageWarnings.insertAdjacentHTML(
        'beforeend',
        `<li>${esc(warnings.length - 50)} additional warnings are included in the data-coverage count.</li>`
      );
    }
    coverageWarnings.hidden = warnings.length === 0;
    coverageSection.hidden = false;
  }

  function specLabel(record) {
    const insulation = [
      record.insulation_type,
      record.insulation_rating && `${record.insulation_rating} C`
    ].filter(Boolean).join(' ');
    const catalog = [record.manufacturer, record.model]
      .filter(value => value && value !== 'Unspecified')
      .join(' ');
    return [
      record.cable_type,
      record.conductors && `${record.conductors}C`,
      record.conductor_size,
      record.material,
      record.cable_rating && `${record.cable_rating} V`,
      insulation,
      catalog,
    ].filter(value => value && value !== 'Unspecified').join(' · ');
  }

  function registerInput(record, field, type = 'text', extra = '') {
    const value = record[field] ?? '';
    const displayedValue = type === 'number' && Number(value) === 0 ? '' : value;
    const label = `${field.replaceAll('_', ' ')} for ${specLabel(record) || record.spec_key}`;
    return `<input type="${type}" data-register-field="${escAttr(field)}" `
      + `value="${escAttr(displayedValue)}" aria-label="${escAttr(label)}" ${extra}>`;
  }

  function renderRegister() {
    const activeRecords = procurementRegister.filter(record => record.schedule_state !== 'inactive');
    const inactiveCount = procurementRegister.length - activeRecords.length;
    inactiveRegisterMsg.hidden = inactiveCount === 0;
    inactiveRegisterMsg.textContent = inactiveCount
      ? `${inactiveCount} prior line item${inactiveCount === 1 ? '' : 's'} is retained but not present in the current schedule.`
      : '';

    if (!activeRecords.length) {
      registerTbody.innerHTML = '';
      registerSection.hidden = true;
      return;
    }

    registerTbody.innerHTML = activeRecords.map(record => {
      const label = specLabel(record) || record.spec_key;
      const statusOptions = PROCUREMENT_STATUSES.map(status =>
        `<option value="${escAttr(status)}"${status === record.status ? ' selected' : ''}>${esc(status)}</option>`
      ).join('');
      return `<tr data-spec-key="${escAttr(record.spec_key)}">
        <th scope="row">${esc(label)}</th>
        <td>${esc(record.planned_order_ft)}</td>
        <td>${registerInput(record, 'vendor')}</td>
        <td>${registerInput(record, 'quote_number')}</td>
        <td>${registerInput(record, 'quote_date', 'date')}</td>
        <td>${registerInput(record, 'need_by_date', 'date')}</td>
        <td>${registerInput(record, 'lead_time_weeks', 'number', 'min="0" step="0.5"')}</td>
        <td>${registerInput(record, 'po_number')}</td>
        <td>${registerInput(record, 'po_date', 'date')}</td>
        <td><select data-register-field="status" aria-label="${escAttr(`status for ${label}`)}">${statusOptions}</select></td>
        <td>${registerInput(record, 'promised_delivery_date', 'date')}</td>
        <td>${registerInput(record, 'actual_delivery_date', 'date')}</td>
        <td>${registerInput(record, 'ordered_quantity_ft', 'number', 'min="0" step="1"')}</td>
        <td>${registerInput(record, 'received_quantity_ft', 'number', 'min="0" step="1"')}</td>
        <td>${registerInput(record, 'received_date', 'date')}</td>
        <td>${registerInput(record, 'notes')}</td>
      </tr>`;
    }).join('');
    registerSection.hidden = false;
  }

  function renderLineItems(lineItems) {
    if (!lineItems.length) {
      lineItemsTbody.innerHTML = '<tr><td colspan="16">No line items generated.</td></tr>';
      lineItemsSection.hidden = false;
      return;
    }

    lineItemsTbody.innerHTML = lineItems.map((lineItem, index) => {
      const tagCounts = new Map();
      lineItem.cuts.forEach(cut => {
        tagCounts.set(cut.cable_tag, (tagCounts.get(cut.cable_tag) ?? 0) + 1);
      });
      const cutsHtml = lineItem.cuts.map(cut =>
        `<li>Pull #${esc(cut.pull_number)} · ${esc(cut.cable_tag)}`
        + `${tagCounts.get(cut.cable_tag) > 1 ? ` · parallel ${esc(cut.parallel_run)}` : ''}`
        + ` · ${esc(cut.length_ft)} ft</li>`
      ).join('');
      const detailId = `cuts-${index + 1}`;
      const catalog = [lineItem.manufacturer, lineItem.model]
        .filter(value => value !== 'Unspecified')
        .join(' ') || 'Unspecified';
      return `<tr>
        <td title="${escAttr(lineItem.spec_key)}">${esc(specLabel(lineItem))}</td>
        <td>${esc(lineItem.cable_type)}</td>
        <td>${esc(lineItem.conductor_size)}</td>
        <td>${esc(lineItem.material)}</td>
        <td>${esc(lineItem.conductors)}</td>
        <td>${esc(lineItem.cable_rating)} V</td>
        <td>${esc(lineItem.insulation_type)} ${esc(lineItem.insulation_rating)} C</td>
        <td>${esc(catalog)}</td>
        <td>${esc(lineItem.cut_count)}</td>
        <td>${esc(lineItem.total_required_ft)}</td>
        <td>${esc(lineItem.selected_reel_size.name)}</td>
        <td>${esc(lineItem.num_reels)}</td>
        <td>${esc(lineItem.total_ordered_ft)}</td>
        <td>${esc(lineItem.waste_ft)}</td>
        <td>${esc(lineItem.waste_pct)} %</td>
        <td>
          <button type="button" class="btn btn-sm" aria-expanded="false"
            aria-controls="${escAttr(detailId)}" data-cut-toggle="${escAttr(detailId)}">Show</button>
          <ul id="${escAttr(detailId)}" class="cuts-list" hidden>${cutsHtml}</ul>
        </td>
      </tr>`;
    }).join('');

    lineItemsSection.hidden = false;
  }

  lineItemsTbody.addEventListener('click', event => {
    const button = event.target.closest('[data-cut-toggle]');
    if (!button) return;
    const detail = document.getElementById(button.dataset.cutToggle);
    if (!detail) return;
    const open = detail.hidden === false;
    detail.hidden = open;
    button.setAttribute('aria-expanded', String(!open));
    button.textContent = open ? 'Show' : 'Hide';
  });

  registerTbody.addEventListener('change', event => {
    const control = event.target.closest('[data-register-field]');
    const row = control?.closest('[data-spec-key]');
    if (!control || !row) return;
    const record = procurementRegister.find(item => item.spec_key === row.dataset.specKey);
    if (!record) return;
    const field = control.dataset.registerField;
    record[field] = control.type === 'number'
      ? (control.value === '' ? null : Math.max(0, Number(control.value) || 0))
      : control.value.trim();
    record.updated_at = new Date().toISOString();
    setProcurementRegister(procurementRegister);
  });

  generateBtn.addEventListener('click', () => {
    noDataMsg.hidden = true;
    summarySection.hidden = true;
    lineItemsSection.hidden = true;
    coverageSection.hidden = true;
    exportCsvBtn.disabled = true;
    lastReport = null;

    const routeResults = loadRouteResults();
    if (!routeResults) {
      noDataMsg.hidden = false;
      return;
    }

    const toleranceInput = Number(document.getElementById('tolerancePct').value);
    const tolerancePct = Number.isFinite(toleranceInput) ? toleranceInput : 3;
    const report = calculateProcurement(routeResults, getCables(), {
      tolerancePct,
      reelSizes: getSelectedReelSizes()
    });

    if (!report.lineItems.length) {
      noDataMsg.hidden = false;
      return;
    }

    lastReport = report;
    procurementRegister = reconcileProcurementRegister(report.lineItems, procurementRegister);
    setProcurementRegister(procurementRegister);
    upsertDeliverableArtifact(normalizeDeliverableArtifact({
      id: 'procurement-schedule-current',
      type: 'procurement-schedule',
      title: 'Current Cable Procurement Schedule',
      revision: 'current',
      status: 'draft',
      sourceFingerprint: getProjectInputFingerprint(),
      sourcePage: 'procurementschedule.html',
      includedSections: ['procurement'],
      summary: {
        lineItems: report.summary.total_line_items,
        cuts: report.summary.total_cut_count,
        requiredFt: report.summary.total_required_ft,
        orderedFt: report.summary.total_ordered_ft,
        wasteFt: report.summary.total_waste_ft,
        procurementReady: report.coverage.procurement_ready,
      },
    }));
    renderSummary(report.summary);
    renderCoverage(report);
    renderLineItems(report.lineItems);
    renderRegister();
    exportCsvBtn.disabled = false;
  });

  exportCsvBtn.addEventListener('click', () => {
    if (!lastReport) return;
    const csv = exportProcurementCSV(lastReport, procurementRegister);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'procurement_schedule.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });

  renderRegister();
});
