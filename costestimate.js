import {
  estimateCableCosts,
  estimateTrayCosts,
  estimateConduitCosts,
  summarizeCosts,
  DEFAULT_PRICES,
  DEFAULT_ESTIMATE_BASIS,
  COST_SOURCE_URLS,
  buildEstimateBasis,
  applyEstimateBasis,
  parsePricingCSV,
  exportPricingCSV,
} from './analysis/costEstimate.mjs';
import {
  getCables,
  getConduits,
  getProjectInputFingerprint,
  getStudies,
  getTrays,
  migrateLegacyItem,
  removeItem,
  setItem,
  upsertDeliverableArtifact,
} from './dataStore.mjs';
import { showAlertModal } from './src/components/modal.js';
import { normalizeDeliverableArtifact } from './analysis/deliverableArtifacts.mjs';

const CUSTOM_PRICING_KEY = 'customPricing';
const COST_ESTIMATE_BASIS_KEY = 'costEstimateBasis';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // ── Custom pricing state ─────────────────────────────────────────────────
  let customPrices = null;          // null = use DEFAULT_PRICES
  let customPricingMeta = { source: '', date: '', rowCount: 0 };
  let lastEstimateBasis = buildEstimateBasis();

  // Restore persisted custom pricing from project settings.
  try {
    const parsed = migrateLegacyItem('ctr-custom-prices', CUSTOM_PRICING_KEY, null);
    if (parsed && parsed.prices && typeof parsed.prices === 'object') {
      customPrices = parsed.prices;
      customPricingMeta = parsed.meta || {};
    }
  } catch { /* ignore corrupt project settings */ }

  try {
    const savedBasis = migrateLegacyItem('ctr-cost-estimate-basis', COST_ESTIMATE_BASIS_KEY, null);
    if (savedBasis && typeof savedBasis === 'object') restoreEstimateBasis(savedBasis);
  } catch { /* ignore corrupt project settings */ }

  renderPricingBasis();
  updateEscalationPreview();

  // ── Button wiring ────────────────────────────────────────────────────────
  document.getElementById('estimate-btn').addEventListener('click', runEstimate);
  document.getElementById('export-xlsx-btn').addEventListener('click', exportXlsx);

  document.getElementById('import-pricing-btn').addEventListener('click', () => {
    document.getElementById('pricing-csv-input').click();
  });

  document.getElementById('pricing-csv-input').addEventListener('change', handlePricingImport);

  document.getElementById('export-pricing-btn').addEventListener('click', handlePricingExport);

  [
    'estimate-class',
    'pricing-base-date',
    'estimate-date',
    'labor-region',
    'national-electrician-wage',
    'local-electrician-wage',
    'material-base-index',
    'material-current-index',
    'material-series-id',
    'material-series-name',
    'labor-base-index',
    'labor-current-index',
    'labor-series-id',
    'labor-series-name',
  ].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateEscalationPreview);
    document.getElementById(id)?.addEventListener('change', updateEscalationPreview);
  });

  document.getElementById('reset-pricing-btn').addEventListener('click', () => {
    customPrices = null;
    customPricingMeta = { source: '', date: '', rowCount: 0 };
    removeItem(CUSTOM_PRICING_KEY);
    renderPricingBasis();
    showAlertModal('Pricing Reset', 'Unit prices have been reset to the built-in 2024 conceptual allowances.');
  });

  let lastLineItems = [];

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
      el.textContent = 'Using built-in 2024 conceptual pricing allowances.';
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
        setItem(CUSTOM_PRICING_KEY, { prices, meta });
      } catch { /* project storage quota is handled centrally */ }
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
    const merged = buildMergedPrices(false);
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

  /** Build the merged prices object used for the estimate. */
  function buildMergedPrices(applyBasis = true) {
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

    const estimateBasis = buildEstimateBasis(readEstimateBasis());
    const adjusted = applyBasis ? applyEstimateBasis(base, estimateBasis) : base;
    if (applyBasis) {
      lastEstimateBasis = estimateBasis;
      try {
        setItem(COST_ESTIMATE_BASIS_KEY, estimateBasis);
      } catch { /* project storage quota is handled centrally */ }
    }

    // Manual UI labor-rate fields always take precedence as final rates.
    const manualCableLabor   = numVal('labor-cable-rate',   null);
    const manualTrayLabor    = numVal('labor-tray-rate',    null);
    const manualConduitLabor = numVal('labor-conduit-rate', null);
    const manualFitting      = numVal('fitting-price',      null);

    if (manualCableLabor   !== null) adjusted.labor.cableInstall    = manualCableLabor;
    if (manualTrayLabor    !== null) adjusted.labor.trayInstall     = manualTrayLabor;
    if (manualConduitLabor !== null) adjusted.labor.conduitInstall  = manualConduitLabor;
    if (manualFitting      !== null) adjusted.fitting               = manualFitting;

    return adjusted;
  }

  function textVal(id, fallback = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() : fallback;
  }

  function readEstimateBasis() {
    return {
      estimateClass: textVal('estimate-class', DEFAULT_ESTIMATE_BASIS.estimateClass),
      baseDate: textVal('pricing-base-date', DEFAULT_ESTIMATE_BASIS.baseDate),
      estimateDate: textVal('estimate-date'),
      laborRegion: textVal('labor-region', DEFAULT_ESTIMATE_BASIS.laborRegion),
      nationalElectricianHourlyWage: numVal('national-electrician-wage', DEFAULT_ESTIMATE_BASIS.nationalElectricianHourlyWage),
      localElectricianHourlyWage: numVal('local-electrician-wage', DEFAULT_ESTIMATE_BASIS.localElectricianHourlyWage),
      wageDataDate: 'May 2024',
      wageSource: DEFAULT_ESTIMATE_BASIS.wageSource,
      wageSourceUrl: COST_SOURCE_URLS.oewsElectricians,
      materialBaseIndex: numVal('material-base-index', 100),
      materialCurrentIndex: numVal('material-current-index', 100),
      materialSeriesId: textVal('material-series-id'),
      materialSeriesName: textVal('material-series-name', DEFAULT_ESTIMATE_BASIS.materialSeriesName),
      materialSourceUrl: COST_SOURCE_URLS.ppiData,
      laborBaseIndex: numVal('labor-base-index', 100),
      laborCurrentIndex: numVal('labor-current-index', 100),
      laborSeriesId: textVal('labor-series-id'),
      laborSeriesName: textVal('labor-series-name', DEFAULT_ESTIMATE_BASIS.laborSeriesName),
      laborSourceUrl: COST_SOURCE_URLS.eciEscalation,
    };
  }

  function restoreEstimateBasis(basis) {
    const values = {
      'estimate-class': basis.estimateClass,
      'pricing-base-date': basis.baseDate,
      'estimate-date': basis.estimateDate,
      'labor-region': basis.laborRegion,
      'national-electrician-wage': basis.nationalElectricianHourlyWage,
      'local-electrician-wage': basis.localElectricianHourlyWage,
      'material-base-index': basis.materialBaseIndex,
      'material-current-index': basis.materialCurrentIndex,
      'material-series-id': basis.materialSeriesId,
      'material-series-name': basis.materialSeriesName,
      'labor-base-index': basis.laborBaseIndex,
      'labor-current-index': basis.laborCurrentIndex,
      'labor-series-id': basis.laborSeriesId,
      'labor-series-name': basis.laborSeriesName,
    };
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el && value != null) el.value = value;
    });
  }

  function updateEscalationPreview() {
    const basis = buildEstimateBasis(readEstimateBasis());
    lastEstimateBasis = basis;
    const el = document.getElementById('escalation-preview');
    if (el) {
      el.innerHTML = `<strong>Applied factors:</strong> materials ×${basis.materialFactor.toFixed(3)};
        regional labor ×${basis.regionalLaborFactor.toFixed(3)};
        labor escalation ×${basis.laborEscalationFactor.toFixed(3)};
        combined labor ×${basis.combinedLaborFactor.toFixed(3)}.
        ${basis.materialIndexDocumented ? '' : ' Add a PPI series ID to complete material provenance.'}
        ${basis.laborIndexDocumented ? '' : ' Add an ECI series ID to complete labor provenance.'}`;
    }
    try {
      setItem(COST_ESTIMATE_BASIS_KEY, basis);
    } catch { /* project storage quota is handled centrally */ }
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

    if (!lastLineItems.length) {
      document.getElementById('results').innerHTML =
        '<p class="field-hint">No project data found. Add cables and raceways to the schedules first.</p>';
      return;
    }

    const summary = summarizeCosts(lastLineItems);
    const contingencyPct = getContingencyPct();
    const contingencyAmt = summary.grandTotal * contingencyPct;
    const totalWithContingency = summary.grandTotal + contingencyAmt;

    const generatedAt = new Date().toISOString();
    const savedEstimate = {
      generatedAt,
      basis: lastEstimateBasis,
      summary: {
        material: summary.grandMaterial,
        labor: summary.grandLabor,
        subtotal: summary.grandTotal,
        contingencyPct: contingencyPct * 100,
        contingency: contingencyAmt,
        total: totalWithContingency,
      },
      rows: lastLineItems,
    };
    setItem('costEstimateArtifact', savedEstimate);
    upsertDeliverableArtifact(normalizeDeliverableArtifact({
      id: 'cost-estimate-current',
      type: 'cost-estimate',
      title: 'Current Cost Estimate',
      revision: lastEstimateBasis.estimateDate || lastEstimateBasis.baseDate || '0',
      status: 'draft',
      generatedAt,
      sourceFingerprint: getProjectInputFingerprint(),
      sourcePage: 'costestimate.html',
      includedSections: ['costEstimate'],
      summary: savedEstimate.summary,
    }));

    renderResults(summary, lastLineItems, contingencyPct, contingencyAmt, totalWithContingency, lastEstimateBasis);
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
    return 'Prices based on built-in 2024 USD conceptual allowances. Replace them with a licensed cost source or supplier quote for issued estimates.';
  }

  function renderResults(summary, lineItems, contingencyPct, contingencyAmt, totalWithContingency, basis) {
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
        <td>${esc(item.manufacturer || '')}</td>
        <td>${esc(item.catalogNumber || '')}</td>
        <td>${item.approvedPart ? 'Approved' : 'Unreviewed'}</td>
        <td>${(item.quantity || 0).toFixed(0)} ${esc(item.unit)}</td>
        <td>${fmt(item.unitPrice)}</td>
        <td>${fmt(item.materialCost)}</td>
        <td>${fmt(item.laborCost)}</td>
        <td><strong>${fmt(item.totalCost)}</strong></td>
      </tr>`).join('');

    document.getElementById('results').innerHTML = `
      <h2>Cost Summary</h2>
      <section class="field-group" aria-label="Estimate basis summary" style="margin-bottom:1.5rem">
        <h3>Estimate Basis</h3>
        <table class="result-table" aria-label="Estimate escalation basis">
          <tbody>
            <tr><td>Classification</td><td><strong>${esc(basis.estimateClass)}</strong></td></tr>
            <tr><td>Pricing period</td><td>${esc(basis.baseDate || 'not recorded')} → ${esc(basis.estimateDate || 'estimate date not recorded')}</td></tr>
            <tr><td>Material escalation</td><td>×${basis.materialFactor.toFixed(3)} from ${esc(basis.materialSeriesId || 'undocumented PPI series')} (${basis.materialBaseIndex} → ${basis.materialCurrentIndex}) — <a href="${COST_SOURCE_URLS.ppiData}" target="_blank" rel="noopener">BLS PPI data</a></td></tr>
            <tr><td>Regional labor</td><td>×${basis.regionalLaborFactor.toFixed(3)} for ${esc(basis.laborRegion)} (${basis.localElectricianHourlyWage.toFixed(2)} ÷ ${basis.nationalElectricianHourlyWage.toFixed(2)}) — <a href="${COST_SOURCE_URLS.oewsElectricians}" target="_blank" rel="noopener">BLS OEWS basis</a></td></tr>
            <tr><td>Labor escalation</td><td>×${basis.laborEscalationFactor.toFixed(3)} from ${esc(basis.laborSeriesId || 'undocumented ECI series')} (${basis.laborBaseIndex} → ${basis.laborCurrentIndex}) — <a href="${COST_SOURCE_URLS.eciEscalation}" target="_blank" rel="noopener">BLS escalation guidance</a></td></tr>
            <tr><td>Combined labor adjustment</td><td><strong>×${basis.combinedLaborFactor.toFixed(3)}</strong></td></tr>
          </tbody>
        </table>
        ${!basis.materialIndexDocumented || !basis.laborIndexDocumented
          ? '<p class="field-hint"><strong>Source gap:</strong> add the selected BLS series IDs before treating this as a traceable escalated estimate.</p>'
          : ''}
      </section>
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
          <tr class="summary-contingency">
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
              <th scope="col">Manufacturer</th>
              <th scope="col">Catalog No.</th>
              <th scope="col">Approval</th>
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
        Regional and labor-index factors scale contractor labor rates; employee wage data is used only as a geographic index.
        Contingency covers design changes, site conditions, and minor scope additions.
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
      : 'Built-in 2024 conceptual pricing allowances';

    const summaryData = [
      ['CableTrayRoute — Cost Estimate'],
      [`Pricing basis: ${srcNote}`],
      [`Estimate class: ${lastEstimateBasis.estimateClass}`],
      [`Pricing period: ${lastEstimateBasis.baseDate || 'not recorded'} to ${lastEstimateBasis.estimateDate || 'not recorded'}`],
      [`Material factor: ${lastEstimateBasis.materialFactor.toFixed(6)}`],
      [`Combined labor factor: ${lastEstimateBasis.combinedLaborFactor.toFixed(6)}`],
      [],
      ['Category', 'Material ($)', 'Labor ($)', 'Total ($)'],
      ...Object.entries(summary.categories).map(([cat, s]) => [cat, s.materialCost.toFixed(0), s.laborCost.toFixed(0), s.totalCost.toFixed(0)]),
      [],
      ['Subtotal', summary.grandMaterial.toFixed(0), summary.grandLabor.toFixed(0), summary.grandTotal.toFixed(0)],
      [`Contingency (${(contingencyPct * 100).toFixed(0)}%)`, '', '', contingencyAmt.toFixed(0)],
      ['Grand Total', '', '', totalWithContingency.toFixed(0)],
    ];
    addSheet('Summary', summaryData);

    addSheet('Estimate Basis', [
      ['Field', 'Value', 'Source / note'],
      ['Estimate classification', lastEstimateBasis.estimateClass, ''],
      ['Currency', lastEstimateBasis.currency, ''],
      ['Pricing base date', lastEstimateBasis.baseDate, ''],
      ['Estimate date', lastEstimateBasis.estimateDate, ''],
      ['Material series ID', lastEstimateBasis.materialSeriesId, lastEstimateBasis.materialSeriesName],
      ['Material base index', lastEstimateBasis.materialBaseIndex, ''],
      ['Material current index', lastEstimateBasis.materialCurrentIndex, ''],
      ['Material escalation factor', lastEstimateBasis.materialFactor, lastEstimateBasis.materialSourceUrl],
      ['Labor region', lastEstimateBasis.laborRegion, ''],
      ['National electrician wage ($/hr)', lastEstimateBasis.nationalElectricianHourlyWage, lastEstimateBasis.wageSource],
      ['Local electrician wage ($/hr)', lastEstimateBasis.localElectricianHourlyWage, 'Comparable local OEWS value supplied by estimator'],
      ['Regional labor factor', lastEstimateBasis.regionalLaborFactor, lastEstimateBasis.wageSourceUrl],
      ['Labor series ID', lastEstimateBasis.laborSeriesId, lastEstimateBasis.laborSeriesName],
      ['Labor base index', lastEstimateBasis.laborBaseIndex, ''],
      ['Labor current index', lastEstimateBasis.laborCurrentIndex, ''],
      ['Labor escalation factor', lastEstimateBasis.laborEscalationFactor, lastEstimateBasis.laborSourceUrl],
      ['Combined labor factor', lastEstimateBasis.combinedLaborFactor, 'Regional factor × labor escalation factor'],
    ]);

    const detailData = [
      ['Category', 'ID', 'Description', 'Manufacturer', 'Catalog No.', 'Approval', 'Quantity', 'Unit', 'Unit Price ($)', 'Material ($)', 'Labor ($)', 'Total ($)'],
      ...lastLineItems.map(i => [
        i.category, i.id, i.description,
        i.manufacturer || '',
        i.catalogNumber || '',
        i.approvedPart ? 'Approved' : 'Unreviewed',
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
