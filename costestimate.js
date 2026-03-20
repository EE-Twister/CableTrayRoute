import {
  estimateCableCosts,
  estimateTrayCosts,
  estimateConduitCosts,
  summarizeCosts,
  DEFAULT_PRICES,
} from './analysis/costEstimate.mjs';
import { getCables, getTrays, getConduits, getStudies } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  document.getElementById('estimate-btn').addEventListener('click', runEstimate);
  document.getElementById('export-xlsx-btn').addEventListener('click', exportXlsx);

  let lastLineItems = [];

  function getPriceOverrides() {
    function numVal(id, fallback) {
      const v = parseFloat(document.getElementById(id).value);
      return Number.isFinite(v) ? v : fallback;
    }
    return {
      labor: {
        cableInstall: numVal('labor-cable-rate', DEFAULT_PRICES.labor.cableInstall),
        trayInstall: numVal('labor-tray-rate', DEFAULT_PRICES.labor.trayInstall),
        conduitInstall: numVal('labor-conduit-rate', DEFAULT_PRICES.labor.conduitInstall),
      },
      fitting: numVal('fitting-price', DEFAULT_PRICES.fitting),
    };
  }

  function getContingencyPct() {
    const v = parseFloat(document.getElementById('contingency-pct').value);
    return Number.isFinite(v) ? v / 100 : 0.15;
  }

  function runEstimate() {
    const cables = getCables();
    const trays = getTrays();
    const conduits = getConduits();
    const studies = getStudies();
    const routeResults = Array.isArray(studies.routeResults) ? studies.routeResults : [];

    const prices = getPriceOverrides();

    const cableItems = estimateCableCosts(cables, routeResults, prices);
    const trayItems = estimateTrayCosts(trays, prices);
    const conduitItems = estimateConduitCosts(conduits, prices);

    lastLineItems = [...cableItems, ...trayItems, ...conduitItems];

    if (!lastLineItems.length) {
      document.getElementById('results').innerHTML =
        '<p class="field-hint">No project data found. Add cables and raceways to the schedules first.</p>';
      return;
    }

    const summary = summarizeCosts(lastLineItems);
    const contingencyPct = getContingencyPct();
    const contingencyAmt = summary.grandTotal * contingencyPct;
    const totalWithContingency = summary.grandTotal + contingencyAmt;

    renderResults(summary, lastLineItems, contingencyPct, contingencyAmt, totalWithContingency);
  }

  function fmt(n) {
    return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderResults(summary, lineItems, contingencyPct, contingencyAmt, totalWithContingency) {
    const catRows = Object.entries(summary.categories).map(([cat, s]) => `
      <tr>
        <td><strong>${esc(cat)}</strong></td>
        <td>${fmt(s.materialCost)}</td>
        <td>${fmt(s.laborCost)}</td>
        <td><strong>${fmt(s.totalCost)}</strong></td>
      </tr>`).join('');

    // Detail rows
    const detailRows = lineItems.map(item => `
      <tr>
        <td>${esc(item.category)}</td>
        <td>${esc(item.id)}</td>
        <td>${esc(item.description)}</td>
        <td>${(item.quantity || 0).toFixed(0)} ${esc(item.unit)}</td>
        <td>${fmt(item.unitPrice)}</td>
        <td>${fmt(item.materialCost)}</td>
        <td>${fmt(item.laborCost)}</td>
        <td><strong>${fmt(item.totalCost)}</strong></td>
      </tr>`).join('');

    document.getElementById('results').innerHTML = `
      <h2>Cost Summary</h2>
      <table class="result-table" aria-label="Cost summary by category">
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Material</th>
            <th scope="col">Labor</th>
            <th scope="col">Subtotal</th>
          </tr>
        </thead>
        <tbody>${catRows}</tbody>
        <tfoot>
          <tr class="summary-subtotal">
            <th scope="row">Subtotal</th>
            <td>${fmt(summary.grandMaterial)}</td>
            <td>${fmt(summary.grandLabor)}</td>
            <td><strong>${fmt(summary.grandTotal)}</strong></td>
          </tr>
          <tr>
            <th scope="row">Contingency (${(contingencyPct * 100).toFixed(0)}%)</th>
            <td colspan="2"></td>
            <td>${fmt(contingencyAmt)}</td>
          </tr>
          <tr class="result-ok summary-grand-total">
            <th scope="row">Grand Total (incl. contingency)</th>
            <td colspan="2"></td>
            <td><strong>${fmt(totalWithContingency)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <details style="margin-top:1.5rem">
        <summary>Line Item Detail (${lineItems.length} items)</summary>
        <table class="result-table" aria-label="Line item cost detail">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">ID</th>
              <th scope="col">Description</th>
              <th scope="col">Quantity</th>
              <th scope="col">Unit Price</th>
              <th scope="col">Material</th>
              <th scope="col">Labor</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>
      </details>

      <p class="field-hint" style="margin-top:1rem">
        Prices based on mid-range 2024 USD contractor pricing. Adjust overrides for your region.
        Labor rates reflect union-scale journeyperson electrician wages. Contingency covers design
        changes, site conditions, and minor scope additions.
      </p>`;
  }

  function exportXlsx() {
    if (!lastLineItems.length) {
      showAlertModal('No Data', 'Run the estimate first before exporting.');
      return;
    }
    if (!window.XLSX) {
      showAlertModal('XLSX Not Available', 'XLSX export library is not loaded. Use Print to export as PDF.');
      return;
    }

    const summary = summarizeCosts(lastLineItems);
    const contingencyPct = getContingencyPct();
    const contingencyAmt = summary.grandTotal * contingencyPct;
    const totalWithContingency = summary.grandTotal + contingencyAmt;

    const wb = { SheetNames: [], Sheets: {} };

    function addSheet(name, data) {
      const ws = XLSX.utils.aoa_to_sheet(data);
      wb.SheetNames.push(name);
      wb.Sheets[name] = ws;
    }

    // Summary sheet
    const summaryData = [
      ['CableTrayRoute — Cost Estimate'],
      [],
      ['Category', 'Material ($)', 'Labor ($)', 'Total ($)'],
      ...Object.entries(summary.categories).map(([cat, s]) => [cat, s.materialCost.toFixed(0), s.laborCost.toFixed(0), s.totalCost.toFixed(0)]),
      [],
      ['Subtotal', summary.grandMaterial.toFixed(0), summary.grandLabor.toFixed(0), summary.grandTotal.toFixed(0)],
      [`Contingency (${(contingencyPct * 100).toFixed(0)}%)`, '', '', contingencyAmt.toFixed(0)],
      ['Grand Total', '', '', totalWithContingency.toFixed(0)],
    ];
    addSheet('Summary', summaryData);

    // Detail sheet
    const detailData = [
      ['Category', 'ID', 'Description', 'Quantity', 'Unit', 'Unit Price ($)', 'Material ($)', 'Labor ($)', 'Total ($)'],
      ...lastLineItems.map(i => [
        i.category, i.id, i.description,
        (i.quantity || 0).toFixed(0), i.unit,
        (i.unitPrice || 0).toFixed(2),
        (i.materialCost || 0).toFixed(0),
        (i.laborCost || 0).toFixed(0),
        (i.totalCost || 0).toFixed(0),
      ]),
    ];
    addSheet('Line Items', detailData);

    XLSX.writeFile(wb, 'cost_estimate.xlsx');
  }
});
