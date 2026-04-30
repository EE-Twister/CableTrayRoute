import assert from 'node:assert/strict';
import { parsePricingCSV } from '../analysis/costEstimate.mjs';
import {
  PRICING_SOURCE_TYPES,
  buildPricingCoverageRows,
  buildPricingFeedGovernancePackage,
  buildPricingFeedImportTemplate,
  mapPricingRowsToCatalog,
  mergePricingFeedRows,
  normalizePricingFeedDescriptor,
  normalizePricingFeedPackage,
  normalizePricingFeedRow,
  renderPricingFeedGovernanceHTML,
  validatePricingFeedRow,
} from '../analysis/pricingFeedGovernance.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const catalogRows = [
  {
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
    description: 'Approved tray',
    approved: true,
    lastVerified: '2026-04-01',
  },
  {
    manufacturer: 'Acme',
    catalogNumber: 'CND-1',
    category: 'conduit',
    description: 'Unapproved conduit',
    approved: false,
  },
];

const quoteRows = [
  {
    sourceType: 'vendorQuote',
    sourceName: 'Supplier <A>',
    quoteNumber: 'Q-100',
    quoteDate: '2026-04-01',
    expiresAt: '2026-06-01',
    currency: 'usd',
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
    description: 'Tray <12>',
    key: 'TR-1',
    uom: 'ft',
    unitPrice: 12.5,
    approvalStatus: 'approved',
    notes: 'Use for <area A>',
  },
  {
    sourceType: 'distributorExport',
    sourceName: 'Distributor B',
    quoteNumber: 'D-200',
    quoteDate: '2025-01-01',
    expiresAt: '2025-02-01',
    currency: 'USD',
    manufacturer: 'Acme',
    catalogNumber: 'CND-1',
    category: 'conduit',
    key: 'CND-1',
    uom: 'ft',
    unitPrice: 3.4,
    approvalStatus: 'unreviewed',
  },
  {
    sourceType: 'rsMeansBook',
    sourceName: 'RS Means Local',
    category: 'cableType',
    key: 'default',
    description: 'Generic cable default',
    uom: 'ft',
    unitPrice: 2.25,
    approvalStatus: 'approved',
    lastVerified: '2026-04-01',
  },
];

describe('pricing feed governance', () => {
  it('keeps legacy pricing CSV parsing unchanged', () => {
    const { prices, meta } = parsePricingCSV(`category,key,unit_price,unit,source,date
cable,4 AWG,1.40,$/ft,Local Supplier,2026-01-01
tray,12,8.00,$/ft,Local Supplier,2026-01-01
`);
    assert.equal(prices.cable['4 AWG'], 1.4);
    assert.equal(prices.tray['12'], 8);
    assert.equal(meta.rowCount, 2);
  });

  it('normalizes source descriptors and rows deterministically', () => {
    assert.deepEqual(PRICING_SOURCE_TYPES, ['vendorQuote', 'distributorExport', 'rsMeansBook', 'manualBook', 'genericDefault']);
    const descriptor = normalizePricingFeedDescriptor({
      type: 'vendor',
      name: 'Supplier <A>',
      currency: 'usd',
      quoteDate: '2026-04-01T12:00:00Z',
    });
    assert.equal(descriptor.sourceType, 'vendorQuote');
    assert.equal(descriptor.currency, 'USD');
    assert.equal(descriptor.quoteDate, '2026-04-01');
    const row = normalizePricingFeedRow({ ...quoteRows[0], source_type: 'vendor_quote' });
    assert.equal(row.sourceType, 'vendorQuote');
    assert.equal(row.category, 'tray');
    assert.equal(row.unitPrice, 12.5);
    assert.equal(row.approved, true);
  });

  it('normalizes packages for vendor, distributor, RS Means, manual, and generic rows', () => {
    const pkg = normalizePricingFeedPackage({
      rows: [
        ...quoteRows,
        { sourceType: 'manualBook', sourceName: 'Estimator', category: 'labor', key: 'trayInstall', laborUnitPrice: 100, currency: 'USD' },
        { sourceType: 'genericDefault', sourceName: 'Defaults', category: 'fitting', key: 'default', unitPrice: 35, currency: 'USD' },
      ],
    }, { asOf: '2026-04-28T00:00:00.000Z' });
    assert.equal(pkg.summary.rowCount, 5);
    assert(pkg.summary.sourceTypes.includes('vendorQuote'));
    assert(pkg.summary.sourceTypes.includes('genericDefault'));
  });

  it('validates required pricing fields, expired quotes, stale verification, and catalog mapping', () => {
    const invalid = validatePricingFeedRow({ sourceType: 'vendorQuote', category: 'tray' }, catalogRows, { asOf: '2026-04-28T00:00:00.000Z' });
    assert.equal(invalid.valid, false);
    assert(invalid.errors.some(error => error.includes('sourceName')));
    assert(invalid.errors.some(error => error.includes('currency')));
    const expired = validatePricingFeedRow(quoteRows[1], catalogRows, { asOf: '2026-04-28T00:00:00.000Z' });
    assert.equal(expired.valid, true);
    assert(expired.warnings.some(warning => warning.includes('expired')));
    assert(expired.warnings.some(warning => warning.includes('unapproved product catalog')));
  });

  it('maps pricing rows to product catalog rows with deterministic statuses', () => {
    const mapping = mapPricingRowsToCatalog({ pricingRows: quoteRows, catalogRows });
    assert.equal(mapping.summary.ready, 1);
    assert.equal(mapping.summary.unapprovedCatalog, 1);
    assert.equal(mapping.summary.unmapped, 1);
    assert.equal(mapping.rows[0].matchType, 'manufacturerCatalogCategory');
  });

  it('builds estimate coverage rows and detects generic, approved, and unpriced basis', () => {
    const rows = buildPricingCoverageRows({
      estimateLineItems: [
        { category: 'Tray', id: 'TR-1', description: 'Tray run', quantity: 10, unit: 'ft', unitPrice: 7 },
        { category: 'Cable', id: 'C-1', description: 'Cable run', quantity: 20, unit: 'ft', unitPrice: 1 },
        { category: 'Conduit', id: 'CND-2', description: 'Conduit run', quantity: 5, unit: 'ft', unitPrice: 0 },
      ],
      pricingRows: quoteRows,
      catalogRows,
    }, { asOf: '2026-04-28T00:00:00.000Z' });
    assert.equal(rows[0].status, 'approvedQuote');
    assert.equal(rows[1].status, 'approvedQuote');
    assert.equal(rows[2].status, 'unpriced');
  });

  it('merges duplicate quote rows and reports changed fields', () => {
    const result = mergePricingFeedRows([quoteRows[0]], [{ ...quoteRows[0], unitPrice: 13.1 }]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.conflicts.length, 1);
    assert(result.conflicts[0].changedFields.includes('unitPrice'));
    assert.equal(result.rows[0].unitPrice, 13.1);
  });

  it('builds deterministic import templates for every source type', () => {
    PRICING_SOURCE_TYPES.forEach(type => {
      const template = buildPricingFeedImportTemplate(type);
      assert.equal(template.sourceType, type);
      assert(template.csvHeaders.includes('sourceType'));
      assert(template.csvHeaders.includes('unitPrice'));
      assert.equal(template.jsonRows[0].sourceType, type);
    });
  });

  it('builds governance package output with escaped HTML', () => {
    const pkg = buildPricingFeedGovernancePackage({
      projectName: 'Cost <Basis>',
      pricingRows: quoteRows,
      catalogRows,
      estimateLineItems: [{ category: 'Tray', id: 'TR-1', description: 'Tray <run>', quantity: 10, unit: 'ft', unitPrice: 7 }],
      generatedAt: '2026-04-28T00:00:00.000Z',
      asOf: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(pkg.summary.pricingRowCount, 3);
    assert.equal(pkg.summary.expiredRowCount, 1);
    assert(pkg.warningRows.length > 0);
    const html = renderPricingFeedGovernanceHTML(pkg);
    assert(html.includes('Supplier &lt;A&gt;'));
    assert(html.includes('Tray &lt;12&gt;'));
    assert(!html.includes('Supplier <A>'));
  });
});
