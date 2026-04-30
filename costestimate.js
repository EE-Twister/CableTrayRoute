import {
  estimateCableCosts,
  estimateTrayCosts,
  estimateConduitCosts,
  summarizeCosts,
  DEFAULT_PRICES,
  parsePricingCSV,
  exportPricingCSV,
} from './analysis/costEstimate.mjs';
import {
  addPricingFeedRows,
  getCables,
  getTrays,
  getConduits,
  getPricingFeedDescriptors,
  getPricingFeedRows,
  getProductCatalogRows,
  getStudies,
  setPricingFeedRows,
  setStudies,
} from './dataStore.mjs';
import {
  buildPricingFeedGovernancePackage,
  buildPricingFeedImportTemplate,
  normalizePricingFeedRow,
  renderPricingFeedGovernanceHTML,
} from './analysis/pricingFeedGovernance.mjs';

// Intentionally unscoped — custom pricing is a user preference, not scenario-specific data.
const STORAGE_KEY = 'ctr-custom-prices';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // ── Custom pricing state ─────────────────────────────────────────────────
  let customPrices = null;          // null = use DEFAULT_PRICES
  let customPricingMeta = { source: '', date: '', rowCount: 0 };
  let pricingGovernanceRows = getPricingFeedRows();

  // Restore persisted custom pricing from localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.prices && typeof parsed.prices === 'object') {
        customPrices = parsed.prices;
        customPricingMeta = parsed.meta || {};
      }
    }
  } catch { /* ignore corrupt storage */ }

  renderPricingBasis();

  // ── Button wiring ────────────────────────────────────────────────────────
  document.getElementById('estimate-btn').addEventListener('click', runEstimate);
  document.getElementById('export-xlsx-btn').addEventListener('click', exportXlsx);

  document.getElementById('import-pricing-btn').addEventListener('click', () => {
    document.getElementById('pricing-csv-input').click();
  });

  document.getElementById('pricing-csv-input').addEventListener('change', handlePricingImport);

  document.getElementById('export-pricing-btn').addEventListener('click', handlePricingExport);

  document.getElementById('reset-pricing-btn').addEventListener('click', () => {
    customPrices = null;
    customPricingMeta = { source: '', date: '', rowCount: 0 };
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    renderPricingBasis();
    showAlertModal('Pricing Reset', 'Unit prices have been reset to default RS Means 2024 mid-range values.');
  });

  document.getElementById('pricing-governance-import-btn')?.addEventListener('click', () => {
    document.getElementById('pricing-governance-file')?.click();
  });
  document.getElementById('pricing-governance-file')?.addEventListener('change', handleGovernanceImport);
  document.getElementById('pricing-governance-template-btn')?.addEventListener('click', exportGovernanceTemplate);
  document.getElementById('pricing-governance-export-json-btn')?.addEventListener('click', exportGovernanceJson);
  document.getElementById('pricing-governance-print-btn')?.addEventListener('click', exportGovernanceHtml);
  document.getElementById('pricing-governance-apply-btn')?.addEventListener('click', applyApprovedGovernedPricing);
  document.getElementById('pricing-governance-save-btn')?.addEventListener('click', saveGovernancePackage);
  [
    'pricing-source-filter',
    'pricing-category-filter',
    'pricing-manufacturer-filter',
    'pricing-status-filter',
  ].forEach(id => document.getElementById(id)?.addEventListener('input', renderPricingGovernance));

  let lastLineItems = [];
  renderPricingGovernance();

  // ── Pricing helpers ──────────────────────────────────────────────────────

  function renderPricingBasis() {
    const el = document.getElementById('pricing-basis');
    if (!el) return;
    if (customPrices) {
      const src  = customPricingMeta.source ? `"${customPricingMeta.source}"` : 'custom source';
      const dt   = customPricingMeta.date   ? ` (${customPricingMeta.date})`  : '';
      const cnt  = customPricingMeta.rowCount != null ? ` — ${customPricingMeta.rowCount} entries` : '';
      el.textContent = `Custom pricing active: ${src}${dt}${cnt}`;
    } else {
      el.textContent = 'Using default RS Means 2024 mid-range pricing.';
    }
  }

  function handlePricingImport(e) {
    const file = e.target.files && e.target.files[0];
    // Reset so the same file can be re-imported after a reset
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target.result;
      const { prices, meta } = parsePricingCSV(text);
      if (meta.rowCount === 0) {
        showAlertModal('Import Failed', 'No valid pricing rows were found in the CSV. Check the format and try again.');
        return;
      }
      customPrices     = prices;
      customPricingMeta = meta;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ prices, meta }));
      } catch { /* storage quota — non-fatal */ }
      renderPricingBasis();
      let msg = `Loaded ${meta.rowCount} pricing entries.`;
      if (meta.source) msg += `\nSource: ${meta.source}`;
      if (meta.date)   msg += `\nDate: ${meta.date}`;
      if (meta.warnings && meta.warnings.length) {
        msg += `\n\nWarnings (${meta.warnings.length}):\n` + meta.warnings.slice(0, 5).join('\n');
        if (meta.warnings.length > 5) msg += `\n…and ${meta.warnings.length - 5} more`;
      }
      showAlertModal('Pricing Imported', msg);
    };
    reader.onerror = () => {
      showAlertModal('Import Error', 'Could not read the file. Please try again.');
    };
    reader.readAsText(file);
  }

  function handlePricingExport() {
    // Merge current custom prices (or defaults) with any manual UI overrides
    const merged = buildMergedPrices();
    const csv = exportPricingCSV(merged, customPricingMeta);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'pricing-book.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Price building ───────────────────────────────────────────────────────

  function downloadText(filename, content, mediaType = 'application/json') {
    const blob = new Blob([content], { type: mediaType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function parseGovernanceCsv(text = '') {
    const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
    if (lines.length < 2) return [];
    const split = line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    const headers = split(lines[0]);
    return lines.slice(1).map(line => {
      const cells = split(line);
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
    });
  }

  function filteredGovernanceRows() {
    const sourceType = document.getElementById('pricing-source-filter')?.value || '';
    const category = document.getElementById('pricing-category-filter')?.value || '';
    const manufacturer = (document.getElementById('pricing-manufacturer-filter')?.value || '').toLowerCase();
    const status = document.getElementById('pricing-status-filter')?.value || '';
    return pricingGovernanceRows.filter(row => {
      if (sourceType && row.sourceType !== sourceType) return false;
      if (category && row.category !== category) return false;
      if (manufacturer && !row.manufacturer.toLowerCase().includes(manufacturer)) return false;
      if (status === 'approved' && !row.approved && !/^approved$/i.test(row.approvalStatus || '')) return false;
      if (status === 'unapproved' && (row.approved || /^approved$/i.test(row.approvalStatus || ''))) return false;
      if (status === 'expired') {
        const expires = row.expiresAt ? new Date(row.expiresAt) : null;
        if (!expires || Number.isNaN(expires.getTime()) || expires.getTime() >= Date.now()) return false;
      }
      return true;
    });
  }

  function currentGovernancePackage(lineItems = lastLineItems) {
    return buildPricingFeedGovernancePackage({
      projectName: 'CableTrayRoute Project',
      feedDescriptors: getPricingFeedDescriptors(),
      pricingRows: pricingGovernanceRows,
      catalogRows: getProductCatalogRows(),
      estimateLineItems: lineItems,
    });
  }

  function renderPricingGovernance() {
    const summaryEl = document.getElementById('pricing-governance-summary');
    const tableEl = document.getElementById('pricing-governance-table');
    const coverageEl = document.getElementById('pricing-governance-coverage');
    if (!summaryEl || !tableEl) return;
    const pkg = currentGovernancePackage();
    const metrics = [
      ['Rows', pkg.summary.pricingRowCount],
      ['Approved', pkg.summary.approvedRowCount],
      ['Stale', pkg.summary.staleRowCount],
      ['Expired', pkg.summary.expiredRowCount],
      ['Unpriced lines', pkg.summary.unpricedLineCount],
      ['Status', pkg.summary.status],
    ];
    summaryEl.innerHTML = metrics.map(([label, value]) => `
      <div class="catalog-stat">
        <strong>${esc(value)}</strong>
        <span>${esc(label)}</span>
      </div>`).join('');
    const rows = filteredGovernanceRows();
    tableEl.innerHTML = `<table class="report-table">
      <thead><tr><th>Source</th><th>Quote</th><th>Manufacturer</th><th>Catalog #/Key</th><th>Category</th><th>UOM</th><th>Unit Price</th><th>Approval</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr>
        <td>${esc(row.sourceName)}</td>
        <td>${esc(row.quoteNumber || 'n/a')}</td>
        <td>${esc(row.manufacturer || 'generic')}</td>
        <td>${esc(row.catalogNumber || row.key || 'n/a')}</td>
        <td>${esc(row.category)}</td>
        <td>${esc(row.uom)}</td>
        <td>${esc(row.unitPrice ?? row.laborUnitPrice ?? '')} ${esc(row.currency)}</td>
        <td>${esc(row.approvalStatus)}</td>
        <td>
          <button type="button" class="btn secondary-btn" data-pricing-approve="${esc(row.id)}">Approve</button>
          <button type="button" class="btn secondary-btn" data-pricing-revoke="${esc(row.id)}">Revoke</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="9">No pricing feed rows match the current filters.</td></tr>'}</tbody>
    </table>`;
    tableEl.querySelectorAll('[data-pricing-approve]').forEach(button => {
      button.addEventListener('click', () => updatePricingApproval(button.dataset.pricingApprove, true));
    });
    tableEl.querySelectorAll('[data-pricing-revoke]').forEach(button => {
      button.addEventListener('click', () => updatePricingApproval(button.dataset.pricingRevoke, false));
    });
    if (coverageEl) {
      coverageEl.innerHTML = `<table class="report-table">
        <thead><tr><th>Line Item</th><th>Category</th><th>Pricing Source</th><th>Status</th><th>Warnings</th></tr></thead>
        <tbody>${pkg.estimateCoverageRows.length ? pkg.estimateCoverageRows.slice(0, 30).map(row => `<tr>
          <td>${esc(row.lineItemId || row.description)}</td>
          <td>${esc(row.category)}</td>
          <td>${esc(row.pricingSource || 'n/a')}</td>
          <td>${esc(row.status)}</td>
          <td>${esc((row.warnings || []).join('; '))}</td>
        </tr>`).join('') : '<tr><td colspan="5">Run the estimate to populate pricing coverage rows.</td></tr>'}</tbody>
      </table>`;
    }
  }

  function persistGovernanceRows(rows) {
    pricingGovernanceRows = setPricingFeedRows(rows);
    renderPricingGovernance();
  }

  function updatePricingApproval(id, approved) {
    const reviewer = window.prompt?.('Reviewer name for local pricing approval', '') || '';
    const today = new Date().toISOString().slice(0, 10);
    persistGovernanceRows(pricingGovernanceRows.map(row => row.id === id ? normalizePricingFeedRow({
      ...row,
      approved,
      approvalStatus: approved ? 'approved' : 'unreviewed',
      verifiedBy: approved ? reviewer : row.verifiedBy,
      lastVerified: approved ? today : row.lastVerified,
    }) : row));
  }

  function handleGovernanceImport(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target.result;
        const parsed = file.name.toLowerCase().endsWith('.json')
          ? JSON.parse(text)
          : parseGovernanceCsv(text);
        const rows = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.pricingRows)
            ? parsed.pricingRows
            : Array.isArray(parsed.rows)
              ? parsed.rows
              : [];
        if (!rows.length) {
          showAlertModal('Import Failed', 'No pricing governance rows were found in the selected file.');
          return;
        }
        const result = addPricingFeedRows(rows);
        pricingGovernanceRows = result.rows;
        renderPricingGovernance();
        showAlertModal('Pricing Governance Imported', `Loaded ${rows.length} row(s). ${result.conflicts.length} duplicate/conflict row(s) were detected.`);
      } catch (err) {
        showAlertModal('Import Error', 'Could not parse pricing governance file: ' + err.message);
      }
    };
    reader.onerror = () => showAlertModal('Import Error', 'Could not read the pricing governance file.');
    reader.readAsText(file);
  }

  function exportGovernanceTemplate() {
    const sourceType = document.getElementById('pricing-template-source')?.value || 'vendorQuote';
    const template = buildPricingFeedImportTemplate(sourceType);
    downloadText(`pricing-feed-${sourceType}-template.csv`, template.csv, 'text/csv');
  }

  function exportGovernanceJson() {
    const pkg = currentGovernancePackage();
    downloadText(`pricing-feed-governance-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(pkg, null, 2));
  }

  function exportGovernanceHtml() {
    const pkg = currentGovernancePackage();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pricing Feed Governance</title><link rel="stylesheet" href="style.css"></head><body>${renderPricingFeedGovernanceHTML(pkg)}</body></html>`;
    downloadText(`pricing-feed-governance-${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html');
  }

  function applyApprovedGovernedPricing() {
    const prices = {};
    let applied = 0;
    pricingGovernanceRows
      .filter(row => row.approved || /^approved$/i.test(row.approvalStatus || ''))
      .forEach(row => {
        const key = row.key || row.catalogNumber || row.description || 'default';
        if (row.unitPrice === null && row.laborUnitPrice === null) return;
        if (row.category === 'cableType' || row.category === 'cable') {
          prices.cable ||= {};
          prices.cable[key] = row.unitPrice;
          applied++;
        } else if (row.category === 'tray') {
          prices.tray ||= {};
          prices.tray[key] = row.unitPrice;
          applied++;
        } else if (row.category === 'conduit') {
          prices.conduit ||= {};
          prices.conduit[key] = row.unitPrice;
          applied++;
        } else if (row.category === 'fitting') {
          prices.fitting = row.unitPrice;
          applied++;
        } else if (row.category === 'labor') {
          prices.labor ||= {};
          prices.labor[key] = row.laborUnitPrice ?? row.unitPrice;
          applied++;
        } else if (row.category === 'productivity') {
          prices.laborProductivity ||= {};
          prices.laborProductivity[key] = row.unitPrice;
          applied++;
        }
      });
    if (!applied) {
      showAlertModal('No Approved Pricing', 'Approve pricing rows before applying governed pricing to the estimate.');
      return;
    }
    customPrices = prices;
    customPricingMeta = { source: 'Pricing Feed Governance', date: new Date().toISOString().slice(0, 10), rowCount: applied };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ prices, meta: customPricingMeta }));
    } catch { /* storage quota - non-fatal */ }
    renderPricingBasis();
    showAlertModal('Governed Pricing Applied', `${applied} approved pricing row(s) were applied to the estimator pricing book.`);
  }

  function saveGovernancePackage() {
    const studies = getStudies();
    const pkg = currentGovernancePackage();
    setStudies({ ...studies, pricingFeedGovernance: pkg });
    showAlertModal('Pricing Governance Saved', 'Saved pricing feed governance to studyResults.pricingFeedGovernance.');
  }

  /** Build the merged prices object used for the estimate. */
  function buildMergedPrices() {
    // Start from custom prices (if loaded) or defaults
    const base = customPrices
      ? {
          cable:             { ...DEFAULT_PRICES.cable,   ...(customPrices.cable   || {}) },
          tray:              { ...DEFAULT_PRICES.tray,    ...(customPrices.tray    || {}) },
          conduit:           { ...DEFAULT_PRICES.conduit, ...(customPrices.conduit || {}) },
          fitting:           customPrices.fitting ?? DEFAULT_PRICES.fitting,
          labor:             { ...DEFAULT_PRICES.labor,            ...(customPrices.labor            || {}) },
          laborProductivity: { ...DEFAULT_PRICES.laborProductivity, ...(customPrices.laborProductivity || {}) },
        }
      : {
          cable:             { ...DEFAULT_PRICES.cable   },
          tray:              { ...DEFAULT_PRICES.tray    },
          conduit:           { ...DEFAULT_PRICES.conduit },
          fitting:           DEFAULT_PRICES.fitting,
          labor:             { ...DEFAULT_PRICES.labor   },
          laborProductivity: { ...DEFAULT_PRICES.laborProductivity },
        };

    // Manual UI labor-rate fields always take precedence
    const manualCableLabor   = numVal('labor-cable-rate',   null);
    const manualTrayLabor    = numVal('labor-tray-rate',    null);
    const manualConduitLabor = numVal('labor-conduit-rate', null);
    const manualFitting      = numVal('fitting-price',      null);

    if (manualCableLabor   !== null) base.labor.cableInstall    = manualCableLabor;
    if (manualTrayLabor    !== null) base.labor.trayInstall     = manualTrayLabor;
    if (manualConduitLabor !== null) base.labor.conduitInstall  = manualConduitLabor;
    if (manualFitting      !== null) base.fitting               = manualFitting;

    return base;
  }

  function numVal(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  // ── Estimate execution ───────────────────────────────────────────────────

  function runEstimate() {
    const cables = getCables();
    const trays  = getTrays();
    const conduits = getConduits();
    const studies  = getStudies();
    const routeResults = Array.isArray(studies.routeResults) ? studies.routeResults : [];

    const prices = buildMergedPrices();

    const cableItems   = estimateCableCosts(cables, routeResults, prices);
    const trayItems    = estimateTrayCosts(trays, prices);
    const conduitItems = estimateConduitCosts(conduits, prices);

    lastLineItems = [...cableItems, ...trayItems, ...conduitItems];
    renderPricingGovernance();

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

  function getContingencyPct() {
    const v = parseFloat(document.getElementById('contingency-pct').value);
    return Number.isFinite(v) ? v / 100 : 0.15;
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  function fmt(n) {
    return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pricingSourceNote() {
    if (customPrices && customPricingMeta.source) {
      const dt = customPricingMeta.date ? ` (${customPricingMeta.date})` : '';
      return `Prices from custom pricing book: "${esc(customPricingMeta.source)}"${esc(dt)}.`;
    }
    return 'Prices based on mid-range 2024 USD contractor pricing (RS Means basis). Adjust overrides for your region.';
  }

  function renderResults(summary, lineItems, contingencyPct, contingencyAmt, totalWithContingency) {
    const catRows = Object.entries(summary.categories).map(([cat, s]) => `
      <tr>
        <td><strong>${esc(cat)}</strong></td>
        <td>${fmt(s.materialCost)}</td>
        <td>${fmt(s.laborCost)}</td>
        <td><strong>${fmt(s.totalCost)}</strong></td>
      </tr>`).join('');

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
        ${pricingSourceNote()}
        Labor rates reflect union-scale journeyperson electrician wages. Contingency covers design
        changes, site conditions, and minor scope additions.
      </p>`;
  }

  // ── XLSX export ──────────────────────────────────────────────────────────

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

    const srcNote = customPrices && customPricingMeta.source
      ? `Custom pricing: ${customPricingMeta.source}${customPricingMeta.date ? ' (' + customPricingMeta.date + ')' : ''}`
      : 'RS Means 2024 mid-range pricing';

    const summaryData = [
      ['CableTrayRoute — Cost Estimate'],
      [`Pricing basis: ${srcNote}`],
      [],
      ['Category', 'Material ($)', 'Labor ($)', 'Total ($)'],
      ...Object.entries(summary.categories).map(([cat, s]) => [cat, s.materialCost.toFixed(0), s.laborCost.toFixed(0), s.totalCost.toFixed(0)]),
      [],
      ['Subtotal', summary.grandMaterial.toFixed(0), summary.grandLabor.toFixed(0), summary.grandTotal.toFixed(0)],
      [`Contingency (${(contingencyPct * 100).toFixed(0)}%)`, '', '', contingencyAmt.toFixed(0)],
      ['Grand Total', '', '', totalWithContingency.toFixed(0)],
    ];
    addSheet('Summary', summaryData);

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
