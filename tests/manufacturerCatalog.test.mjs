import assert from 'assert';
import fs from 'node:fs';
import {
  buildBomCatalogFields,
  buildCatalogWarnings,
  filterCatalogProducts,
  mergeCatalogProducts,
  normalizeCatalogProduct,
  validateCatalog,
  validateCatalogProduct
} from '../analysis/manufacturerCatalog.mjs';
import { validateLibraryPayload } from '../src/validation/librarySchema.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('manufacturer catalog normalization', () => {
  it('normalizes legacy catalog rows into governed fields', () => {
    const row = normalizeCatalogProduct({
      id: 'BL-VCT-12-4',
      manufacturer: 'Eaton B-Line',
      category: 'tray',
      description: 'Tray',
      width_in: 12,
      depth_in: 4,
      list_price_usd: 142,
      load_class: '20A',
      nec_listed: true,
      ul_classified: true,
      approved: true,
      source: 'Approved list',
      lastVerified: '2026-05-22'
    });
    assert.equal(row.catalogNumber, 'BL-VCT-12-4');
    assert.equal(row.dimensions.widthIn, 12);
    assert.equal(row.ratings.loadClass, '20A');
    assert.equal(row.commercial.listPriceUsd, 142);
    assert.equal(row.approval.status, 'approved');
    assert.ok(row.standards.includes('UL classified'));
  });

  it('requires evidence for approved catalog rows', () => {
    const result = validateCatalogProduct({
      id: 'X',
      manufacturer: 'Example',
      catalogNumber: 'X',
      category: 'tray',
      description: 'Example tray',
      unit: 'EA',
      approved: true
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.path === 'source'));
    assert.ok(result.errors.some(error => error.path === 'lastVerified'));
  });

  it('validates the seed manufacturer catalog', () => {
    const catalog = JSON.parse(fs.readFileSync('data/manufacturer_catalog.json', 'utf8'));
    const result = validateCatalog(catalog.products, { requireApprovalAuthority: false });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.products.length >= 20);
    assert.ok(result.products.every(product => product.approved));
  });
});

describe('manufacturer catalog merge and filters', () => {
  it('merges duplicate manufacturer/catalog numbers with project overrides', () => {
    const merged = mergeCatalogProducts([
      {
        id: 'base-1',
        manufacturer: 'ACME',
        catalogNumber: 'TRAY-12',
        category: 'tray',
        description: 'Base tray',
        unit: 'EA',
        list_price_usd: 100
      }
    ], [
      {
        id: 'custom-1',
        manufacturer: 'ACME',
        catalog_number: 'TRAY-12',
        category: 'tray',
        description: 'Approved tray',
        unit: 'EA',
        list_price_usd: 125,
        approved: true,
        source: 'Project approved list',
        lastVerified: '2026-05-22'
      }
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'custom-1');
    assert.equal(merged[0].commercial.listPriceUsd, 125);
    assert.equal(merged[0].approved, true);
  });

  it('filters approved products only', () => {
    const rows = filterCatalogProducts([
      { id: 'A', manufacturer: 'M', category: 'tray', description: 'A', approved: true, source: 'S', lastVerified: '2026-05-22' },
      { id: 'B', manufacturer: 'M', category: 'tray', description: 'B', approved: false }
    ], { approvedOnly: true });
    assert.deepEqual(rows.map(row => row.id), ['A']);
  });
});

describe('catalog warnings and downstream fields', () => {
  it('warns for missing, unknown, and unapproved catalog selections', () => {
    const catalog = [
      {
        id: 'OK',
        manufacturer: 'ACME',
        catalogNumber: 'OK',
        category: 'tray',
        description: 'Approved',
        approved: true,
        source: 'Approved list',
        lastVerified: '2026-05-22'
      },
      {
        id: 'HOLD',
        manufacturer: 'ACME',
        catalogNumber: 'HOLD',
        category: 'tray',
        description: 'Hold',
        approved: false
      }
    ];
    const warnings = buildCatalogWarnings([
      { tag: 'EQ-1', manufacturer: 'Generic', model: '' },
      { tag: 'EQ-2', manufacturer: 'ACME', catalogNumber: 'MISSING' },
      { tag: 'EQ-3', manufacturer: 'ACME', catalogNumber: 'HOLD' },
      { tag: 'EQ-4', manufacturer: 'ACME', catalogNumber: 'OK', approved_part: true, catalog_last_verified: '2026-05-22' }
    ], catalog);
    assert.ok(warnings.some(warning => warning.code === 'missing-catalog-selection'));
    assert.ok(warnings.some(warning => warning.code === 'unknown-catalog-selection'));
    assert.ok(warnings.some(warning => warning.code === 'unapproved-catalog-selection'));
    assert.equal(warnings.some(warning => warning.id === 'EQ-4'), false);
  });

  it('builds BOM/submittal catalog fields from schedule records', () => {
    const fields = buildBomCatalogFields({
      manufacturer: 'ACME',
      catalog_number: 'P-100',
      approved_part: true,
      catalog_source: 'Approved list',
      catalog_last_verified: '2026-05-22'
    });
    assert.equal(fields.manufacturer, 'ACME');
    assert.equal(fields.catalogNumber, 'P-100');
    assert.equal(fields.approvedPart, true);
    assert.equal(fields.lastVerified, '2026-05-22');
  });
});

describe('component library catalog validation', () => {
  function payload(props) {
    return {
      categories: ['equipment'],
      icons: { mcc: 'icons/components/MCC.svg' },
      components: [{
        subtype: 'mcc',
        label: 'MCC',
        icon: 'icons/components/MCC.svg',
        category: 'equipment',
        props: {
          tag: 'MCC-1',
          description: 'Motor control center',
          manufacturer: 'ACME',
          model: 'MCC',
          main_device_type: 'mccb',
          form_type: 'form_2b',
          rated_voltage_kv: 0.48,
          bus_rating_a: 1600,
          sccr_ka: 65,
          bucket_count: 6,
          spare_bucket_count: 1,
          ...props
        }
      }]
    };
  }

  it('rejects approved component catalog metadata without source/date evidence', () => {
    const result = validateLibraryPayload(payload({
      catalog_number: 'MCC-1600',
      approved_part: true
    }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.path.includes('catalog_last_verified') || error.message.includes('lastVerified')));
  });

  it('accepts approved component catalog metadata with governance evidence', () => {
    const result = validateLibraryPayload(payload({
      catalog_number: 'MCC-1600',
      approved_part: true,
      catalog_source: 'Approved list',
      catalog_last_verified: '2026-05-22'
    }));
    assert.equal(result.valid, true);
  });
});
