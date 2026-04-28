import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRODUCT_CATALOG_TYPES,
  buildProductCatalogGovernancePackage,
  buildProductCatalogImportTemplate,
  filterApprovedCatalogRows,
  mergeProductCatalogRows,
  normalizeProductCatalog,
  normalizeProductCatalogRow,
  renderProductCatalogGovernanceHTML,
  validateProductCatalogRow,
} from '../analysis/productCatalog.mjs';

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

const legacyCatalog = JSON.parse(fs.readFileSync(new URL('../data/manufacturer_catalog.json', import.meta.url), 'utf8'));

describe('product catalog governance', () => {
  it('normalizes legacy manufacturer catalog rows without losing legacy fields', () => {
    const catalog = normalizeProductCatalog(legacyCatalog);
    assert(catalog.rows.length > 0);
    const first = catalog.rows[0];
    assert.equal(first.catalogNumber, first.id);
    assert.equal(first.manufacturer, 'Eaton B-Line');
    assert.equal(first.dimensions.widthIn, 12);
    assert.equal(first.ratings.loadClass, '20A');
    assert.equal(first.list_price_usd, 142);
  });

  it('validates required fields and preserves product-grade metadata', () => {
    const row = normalizeProductCatalogRow({
      manufacturer: 'Example <Mfr>',
      catalogNumber: 'TR-24',
      category: 'tray',
      description: 'Tray <24>',
      standards: 'UL; NEC',
      approved: true,
      approvedBy: 'Reviewer',
      lastVerified: '2026-04-26',
      ratings: { loadClass: '20A' },
      dimensions: { widthIn: 24 },
      bimRef: 'families/tray.rfa',
      datasheetUrl: 'https://example.test/tray.pdf',
    });
    const result = validateProductCatalogRow(row);
    assert.equal(result.valid, true);
    assert.deepEqual(row.standards, ['NEC', 'UL']);
    assert.equal(row.bimRef, 'families/tray.rfa');
    assert.equal(row.datasheetUrl, 'https://example.test/tray.pdf');
  });

  it('rejects invalid sample rows with missing required fields', () => {
    const result = validateProductCatalogRow({ category: 'tray', description: 'No manufacturer' });
    assert.equal(result.valid, false);
    assert(result.errors.some(error => error.includes('manufacturer')));
    assert(result.errors.some(error => error.includes('catalogNumber')));
  });

  it('builds deterministic templates for every required product type', () => {
    assert.deepEqual(PRODUCT_CATALOG_TYPES, ['tray', 'conduit', 'fitting', 'heatTraceComponent', 'protectiveDevice', 'cableType']);
    PRODUCT_CATALOG_TYPES.forEach(type => {
      const template = buildProductCatalogImportTemplate(type);
      assert.equal(template.productType, type);
      assert(template.csvHeaders.includes('manufacturer'));
      assert(template.csvHeaders.includes('catalogNumber'));
      assert.equal(template.jsonRows[0].category, type);
    });
  });

  it('merges duplicate manufacturer/catalog/category rows deterministically', () => {
    const existing = [{
      manufacturer: 'Acme',
      catalogNumber: 'A-1',
      category: 'tray',
      description: 'Old row',
      approved: false,
    }];
    const imported = [{
      manufacturer: 'Acme',
      catalogNumber: 'A-1',
      category: 'tray',
      description: 'New row',
      approved: true,
      approvedBy: 'D. Engineer',
      lastVerified: '2026-04-26',
    }];
    const result = mergeProductCatalogRows(existing, imported);
    assert.equal(result.rows.length, 1);
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.rows[0].description, 'New row');
    assert.equal(result.rows[0].approved, true);
    assert(result.warnings[0].includes('changed fields'));
  });

  it('filters approved, source, standard, and stale catalog rows', () => {
    const rows = [
      {
        manufacturer: 'Acme',
        catalogNumber: 'A-1',
        category: 'tray',
        description: 'Approved tray',
        approved: true,
        standards: ['UL'],
        source: 'submittal',
        lastVerified: '2020-01-01',
      },
      {
        manufacturer: 'Acme',
        catalogNumber: 'A-2',
        category: 'tray',
        description: 'Unapproved tray',
        approved: false,
        standards: ['IEC'],
        source: 'draft',
      },
    ];
    assert.equal(filterApprovedCatalogRows(rows, { approvedOnly: true }).length, 1);
    assert.equal(filterApprovedCatalogRows(rows, { standard: 'UL' }).length, 1);
    assert.equal(filterApprovedCatalogRows(rows, { source: 'submittal' }).length, 1);
    assert.equal(filterApprovedCatalogRows(rows, { staleOnly: true }).length, 1);
  });

  it('builds governance packages with usage warnings and escaped HTML', () => {
    const pkg = buildProductCatalogGovernancePackage({
      catalog: [{
        manufacturer: 'Acme',
        catalogNumber: 'A-1',
        category: 'tray',
        description: 'Approved <tray>',
        approved: false,
        verificationNotes: '<script>alert(1)</script>',
      }],
      projectUsage: [
        { label: 'TR-1 <main>', category: 'tray' },
        { label: 'TR-2', manufacturer: 'Acme', catalogNumber: 'A-1', category: 'tray' },
      ],
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    assert.equal(pkg.summary.total, 1);
    assert.equal(pkg.summary.unapprovedUsage, 2);
    assert(pkg.warnings.some(warning => warning.includes('generic product data')));
    const html = renderProductCatalogGovernanceHTML(pkg);
    assert(html.includes('TR-1 &lt;main&gt;'));
    assert(!html.includes('TR-1 <main>'));
    assert(html.includes('Approved &lt;tray&gt;'));
  });
});
