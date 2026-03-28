import { calculateProcurement, exportProcurementCSV, STANDARD_REEL_SIZES } from './analysis/cableProcurement.mjs';
import { getCables } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const generateBtn      = document.getElementById('generateBtn');
  const exportCsvBtn     = document.getElementById('exportCsvBtn');
  const noDataMsg        = document.getElementById('noDataMsg');
  const summarySection   = document.getElementById('summarySection');
  const summaryTbody     = document.querySelector('#summaryTable tbody');
  const lineItemsSection = document.getElementById('lineItemsSection');
  const lineItemsTbody   = document.querySelector('#lineItemsTable tbody');

  let lastReport = null;

  // ---------------------------------------------------------------------------
  // Reel-size checkboxes — populated from STANDARD_REEL_SIZES
  // ---------------------------------------------------------------------------

  const reelGroup = document.getElementById('reelSizeGroup');
  if (reelGroup) {
    reelGroup.innerHTML = STANDARD_REEL_SIZES.map(rs =>
      `<label><input type="checkbox" class="reel-size-check" value="${rs.feet}" checked> ${rs.name}</label>`
    ).join('');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function loadRouteResults() {
    // Check sessionStorage first, then localStorage — same pattern as pullcards.js
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.endsWith('routeCache') || key.includes('routeCache')) {
          try {
            const cached = JSON.parse(storage.getItem(key));
            if (cached && Array.isArray(cached.batchResults) && cached.batchResults.length > 0) {
              return cached.batchResults;
            }
          } catch { /* skip malformed entries */ }
        }
      }
    }
    return null;
  }

  function getSelectedReelSizes() {
    const checked = [...document.querySelectorAll('.reel-size-check:checked')];
    if (checked.length === 0) return STANDARD_REEL_SIZES;
    return checked.map(cb => {
      const feet = parseInt(cb.value, 10);
      return STANDARD_REEL_SIZES.find(rs => rs.feet === feet) ?? { name: `${feet} ft`, feet };
    });
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderSummary(summary) {
    const rows = [
      ['Spec types',           summary.total_line_items],
      ['Total cable cuts',     summary.total_cut_count],
      ['Total required (ft)',  summary.total_required_ft],
      ['Total ordered (ft)',   summary.total_ordered_ft],
      ['Total waste (ft)',     summary.total_waste_ft],
      ['Average waste (%)',    summary.avg_waste_pct + ' %'],
    ];
    summaryTbody.innerHTML = rows.map(([label, value]) =>
      `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`
    ).join('');
    summarySection.hidden = false;
  }

  function renderLineItems(lineItems) {
    if (!lineItems.length) {
      lineItemsTbody.innerHTML = '<tr><td colspan="12">No line items generated.</td></tr>';
      lineItemsSection.hidden = false;
      return;
    }

    lineItemsTbody.innerHTML = lineItems.map(li => {
      const cutsHtml = li.cuts.map(c =>
        `<li>Pull #${esc(c.pull_number)} · ${esc(c.cable_tag)} · ${esc(c.length_ft)} ft</li>`
      ).join('');
      const detailId = `cuts-${CSS.escape(li.spec_key)}`;
      return `<tr>
        <td>${esc(li.spec_key)}</td>
        <td>${esc(li.cable_type)}</td>
        <td>${esc(li.conductor_size)}</td>
        <td>${esc(li.conductors)}</td>
        <td>${esc(li.cut_count)}</td>
        <td>${esc(li.total_required_ft)}</td>
        <td>${esc(li.selected_reel_size.name)}</td>
        <td>${esc(li.num_reels)}</td>
        <td>${esc(li.total_ordered_ft)}</td>
        <td>${esc(li.waste_ft)}</td>
        <td>${esc(li.waste_pct)} %</td>
        <td>
          <button type="button" class="btn btn-sm"
            aria-expanded="false"
            aria-controls="${esc(detailId)}"
            onclick="
              const el = document.getElementById('${esc(detailId)}');
              const open = el.hidden === false;
              el.hidden = open;
              this.setAttribute('aria-expanded', !open);
              this.textContent = open ? 'Show' : 'Hide';
            ">Show</button>
          <ul id="${esc(detailId)}" class="cuts-list" hidden>${cutsHtml}</ul>
        </td>
      </tr>`;
    }).join('');

    lineItemsSection.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Generate button
  // ---------------------------------------------------------------------------

  generateBtn.addEventListener('click', () => {
    noDataMsg.hidden = true;
    summarySection.hidden = true;
    lineItemsSection.hidden = true;
    exportCsvBtn.disabled = true;
    lastReport = null;

    const routeResults = loadRouteResults();
    if (!routeResults) {
      noDataMsg.hidden = false;
      return;
    }

    const tolerancePct = parseFloat(document.getElementById('tolerancePct').value) || 3;
    const reelSizes    = getSelectedReelSizes();
    const cableList    = getCables();

    const report = calculateProcurement(routeResults, cableList, { tolerancePct, reelSizes });

    if (!report.lineItems.length) {
      noDataMsg.hidden = false;
      return;
    }

    lastReport = report;
    renderSummary(report.summary);
    renderLineItems(report.lineItems);
    exportCsvBtn.disabled = false;
  });

  // ---------------------------------------------------------------------------
  // Export CSV button
  // ---------------------------------------------------------------------------

  exportCsvBtn.addEventListener('click', () => {
    if (!lastReport) return;
    const csv = exportProcurementCSV(lastReport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'procurement_schedule.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
