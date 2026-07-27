import assert from 'assert';
import fs from 'node:fs';
import {
  buildCatalogConfidence,
  buildCatalogTraceabilityReport,
  buildBomCatalogFields,
  buildCatalogWarnings,
  CATALOG_CONFIDENCE_STATUS,
  catalogIdentity,
  findCatalogProductForRecord,
  filterCatalogProducts,
  mergeCatalogProducts,
  normalizeCatalogProduct,
  validateCatalog,
  validateCatalogProduct
} from '../analysis/manufacturerCatalog.mjs';
import {
  CATALOG_IMPORT_COLUMNS,
  buildCatalogExportCsv,
  buildCatalogExportRows,
  buildCatalogTemplateCsv,
  buildCatalogTemplateRows,
  importCatalogRows,
  parseCatalogCsv
} from '../analysis/catalogImport.mjs';
import {
  removeCatalogProduct,
  summarizeCatalogQuality,
  upsertCatalogProduct
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

  it('normalizes BIM and EPD evidence fields', () => {
    const row = normalizeCatalogProduct({
      id: 'EPD-1',
      manufacturer: 'ACME',
      catalogNumber: 'EPD-1',
      category: 'tray',
      description: 'Tray with evidence',
      approved: true,
      source: 'Approved list',
      lastVerified: '2026-05-22',
      datasheet_url: 'https://example.com/datasheet.pdf',
      bim_ref: { familyName: 'ACME Tray', typeName: 'EPD-1' },
      co2eKgPerUnit: 4.2,
      epdSource: 'ACME EPD 2026',
      epdValidUntil: '2027-12-31'
    });
    assert.equal(row.datasheetUrl, 'https://example.com/datasheet.pdf');
    assert.equal(row.bimRef.familyName, 'ACME Tray');
    assert.equal(row.co2eKgPerUnit, 4.2);
    assert.equal(row.epd.source, 'ACME EPD 2026');
    assert.equal(row.epdValidUntil, '2027-12-31');
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

  it('rejects impossible calendar dates and does not coerce blank numbers to zero', () => {
    const invalidDate = validateCatalogProduct({
      id: 'BAD-DATE',
      manufacturer: 'Example',
      catalogNumber: 'BAD-DATE',
      category: 'tray',
      description: 'Invalid verification date',
      approved: true,
      source: 'Approved list',
      lastVerified: '2026-99-99'
    });
    assert.equal(invalidDate.valid, false);
    assert.ok(invalidDate.errors.some(error => error.path === 'lastVerified'));

    const blankCarbon = normalizeCatalogProduct({
      id: 'BLANK-CARBON',
      manufacturer: 'Example',
      catalogNumber: 'BLANK-CARBON',
      category: 'tray',
      description: 'Blank carbon value',
      co2eKgPerUnit: ''
    });
    assert.equal(blankCarbon.co2eKgPerUnit, undefined);
  });

  it('validates the seed manufacturer catalog', () => {
    const catalog = JSON.parse(fs.readFileSync('data/manufacturer_catalog.json', 'utf8'));
    const result = validateCatalog(catalog.products, { requireApprovalAuthority: false });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.products.length >= 20);
    assert.ok(result.products.every(product => !product.approved));
    assert.ok(result.products.every(product => product.approval.status === 'unreviewed'));
  });
});

describe('manufacturer catalog merge and filters', () => {
  const baseProduct = {
    id: 'base-1',
    manufacturer: 'ACME',
    catalogNumber: 'TRAY-12',
    category: 'tray',
    description: 'Base tray',
    unit: 'EA',
    list_price_usd: 100,
    approved: true,
    source: 'Manufacturer datasheet',
    lastVerified: '2026-05-22'
  };
  const projectProduct = {
    id: 'custom-1',
    manufacturer: 'ACME',
    catalog_number: 'TRAY-12',
    category: 'tray',
    description: 'Project tray',
    unit: 'EA',
    list_price_usd: 125,
    approved: false
  };

  it('protects base identities from project catalog overrides by default', () => {
    const merged = mergeCatalogProducts([
      baseProduct
    ], [projectProduct]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'base-1');
    assert.equal(merged[0].commercial.listPriceUsd, 100);
    assert.equal(merged[0].approved, true);
  });

  it('allows explicit overrides when merging project-owned rows', () => {
    const merged = mergeCatalogProducts(
      [baseProduct],
      [{ ...projectProduct, approved: true, source: 'Project approved list', lastVerified: '2026-05-22' }],
      { allowProjectOverrides: true }
    );
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

describe('project catalog editing helpers', () => {
  const base = {
    id: 'TRAY-12',
    manufacturer: 'ACME',
    catalogNumber: 'TRAY-12',
    category: 'tray',
    description: 'Base tray',
    unit: 'EA',
    list_price_usd: 100
  };

  it('upserts by manufacturer/catalog identity instead of appending duplicates', () => {
    const first = upsertCatalogProduct([], base);
    assert.equal(first.length, 1);
    const updated = upsertCatalogProduct(first, {
      ...base,
      id: 'TRAY-12-REV-B',
      description: 'Revised tray',
      list_price_usd: 118,
      approved: true,
      source: 'Approved list rev B',
      lastVerified: '2026-05-22'
    });
    assert.equal(updated.length, 1);
    assert.equal(updated[0].description, 'Revised tray');
    assert.equal(updated[0].commercial.listPriceUsd, 118);
    assert.equal(updated[0].approved, true);
  });

  it('appends products with a different identity', () => {
    const list = upsertCatalogProduct([base], { ...base, id: 'TRAY-24', catalogNumber: 'TRAY-24' });
    assert.deepEqual(list.map(row => row.catalogNumber).sort(), ['TRAY-12', 'TRAY-24']);
  });

  it('removes products by product object, identity string, or row id', () => {
    const list = [base, { ...base, id: 'TRAY-24', catalogNumber: 'TRAY-24' }];
    assert.deepEqual(removeCatalogProduct(list, base).map(row => row.id), ['TRAY-24']);
    assert.deepEqual(removeCatalogProduct(list, 'acme::tray-24').map(row => row.id), ['TRAY-12']);
    assert.deepEqual(removeCatalogProduct(list, 'TRAY-24').map(row => row.id), ['TRAY-12']);
    assert.equal(removeCatalogProduct(list, '').length, 2);
  });
});

describe('catalog quality summary and filters', () => {
  const complete = {
    id: 'FULL-1',
    manufacturer: 'ACME',
    catalogNumber: 'FULL-1',
    category: 'tray',
    description: 'Fully governed tray',
    approved: true,
    source: 'Owner approved list',
    lastVerified: '2026-05-22',
    datasheetUrl: 'https://example.com/full-1.pdf',
    bimRef: { familyName: 'ACME Tray', typeName: 'FULL-1', classification: 'tray' },
    standards: ['NEMA VE 1'],
    co2eKgPerUnit: 3.4,
    epdSource: 'ACME EPD 2026',
    epdValidUntil: '2027-12-31'
  };
  const partial = {
    id: 'PART-1',
    manufacturer: 'ACME',
    catalogNumber: 'PART-1',
    category: 'fitting',
    description: 'Partly governed elbow',
    approved: true,
    source: 'Owner approved list',
    lastVerified: '2026-05-22',
    standards: ['NEMA VE 1']
  };
  const ungoverned = {
    id: 'GEN-1',
    manufacturer: 'Generic',
    catalogNumber: '',
    category: 'accessory',
    description: 'Placeholder accessory'
  };

  it('rolls up confidence, approval, and evidence gaps', () => {
    const summary = summarizeCatalogQuality([complete, partial, ungoverned], { today: '2026-06-02' });
    assert.equal(summary.total, 3);
    assert.equal(summary.approved, 2);
    assert.equal(summary.byConfidence.complete, 1);
    assert.equal(summary.byConfidence.review, 1);
    assert.equal(summary.byConfidence.incomplete, 1);
    assert.equal(summary.byApprovalStatus.approved, 2);
    assert.equal(summary.byApprovalStatus.unreviewed, 1);
    const datasheetGap = summary.missingEvidence.find(item => item.evidence === 'datasheet URL');
    assert.equal(datasheetGap.count, 2);
    assert.ok(summary.averageScore > 0 && summary.averageScore <= 100);
  });

  it('counts stale verification and expired EPD evidence', () => {
    const summary = summarizeCatalogQuality([
      { ...complete, lastVerified: '2024-01-01' }
    ], { today: '2026-06-02', verificationMaxAgeDays: 365 });
    assert.equal(summary.staleRows, 1);
    assert.ok(summary.staleEvidence.some(item => item.evidence === 'catalog verification date'));
  });

  it('filters by approval status and confidence status', () => {
    const products = [complete, partial, ungoverned];
    assert.deepEqual(
      filterCatalogProducts(products, { approvalStatus: 'unreviewed' }).map(row => row.id),
      ['GEN-1']
    );
    assert.deepEqual(
      filterCatalogProducts(products, {
        confidenceStatus: CATALOG_CONFIDENCE_STATUS.complete,
        confidenceOptions: { today: '2026-06-02' }
      }).map(row => row.id),
      ['FULL-1']
    );
  });
});

describe('catalog export', () => {
  const product = {
    id: 'EXP-1',
    manufacturer: 'ACME',
    catalogNumber: 'EXP-1',
    category: 'tray',
    subcategory: 'straight',
    description: 'Exportable tray',
    material: 'steel',
    finish: 'pre-galvanized',
    width_in: 12,
    depth_in: 4,
    weight_lb: 24.5,
    unit: 'EA',
    list_price_usd: 142,
    load_class: '20A',
    nec_listed: true,
    ul_classified: true,
    approved: true,
    approval: { status: 'approved', authority: 'Project EE', approvedBy: 'D. Mitz', approvedAt: '2026-05-22' },
    source: 'Approved list rev B',
    lastVerified: '2026-05-22',
    datasheetUrl: 'https://example.com/exp-1.pdf'
  };

  it('maps governed fields onto the import template headers', () => {
    const [row] = buildCatalogExportRows([product]);
    assert.equal(row['Part Number'], 'EXP-1');
    assert.equal(row['Catalog No.'], 'EXP-1');
    assert.equal(row['Width (in)'], 12);
    assert.equal(row['List Price (USD)'], 142);
    assert.equal(row['Approved'], 'TRUE');
    assert.equal(row['Approval Status'], 'approved');
    assert.equal(row['Last Verified'], '2026-05-22');
    assert.equal(row['Datasheet URL'], 'https://example.com/exp-1.pdf');
    Object.keys(row).forEach(header => {
      assert.ok(CATALOG_IMPORT_COLUMNS.some(col => col.header === header), `unexpected header ${header}`);
    });
  });

  it('round-trips exported CSV back through the import parser', () => {
    const csv = buildCatalogExportCsv([product]);
    const { products, errors } = parseCatalogCsv(csv);
    assert.equal(errors.length, 0, `unexpected parse errors: ${JSON.stringify(errors)}`);
    assert.equal(products.length, 1);
    assert.equal(products[0].catalogNumber, 'EXP-1');
    assert.equal(products[0].approved, true);
    assert.equal(products[0].source, 'Approved list rev B');
    assert.equal(products[0].lastVerified, '2026-05-22');
    assert.equal(products[0].dimensions.widthIn, 12);
    assert.equal(products[0].commercial.listPriceUsd, 142);
  });

  it('escapes commas and quotes so descriptions survive the round trip', () => {
    const csv = buildCatalogExportCsv([{
      ...product,
      id: 'EXP-2',
      catalogNumber: 'EXP-2',
      description: 'Tray, 12" wide, "special" order'
    }]);
    const { products, errors } = parseCatalogCsv(csv);
    assert.equal(errors.length, 0);
    assert.equal(products[0].description, 'Tray, 12" wide, "special" order');
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
      catalog_last_verified: '2026-05-22',
      datasheet_url: 'https://example.com/p-100.pdf',
      bim_ref: { familyName: 'ACME Part', typeName: 'P-100' },
      co2eKgPerUnit: 2.5,
      epdSource: 'ACME EPD',
      epdValidUntil: '2027-01-01'
    });
    assert.equal(fields.manufacturer, 'ACME');
    assert.equal(fields.catalogNumber, 'P-100');
    assert.equal(fields.approvedPart, true);
    assert.equal(fields.lastVerified, '2026-05-22');
    assert.equal(fields.datasheetUrl, 'https://example.com/p-100.pdf');
    assert.equal(fields.bimRef.familyName, 'ACME Part');
    assert.equal(fields.co2eKgPerUnit, 2.5);
    assert.equal(fields.epdSource, 'ACME EPD');
    assert.equal(fields.catalogConfidenceStatus, CATALOG_CONFIDENCE_STATUS.complete);
  });

  it('does not treat string false approval fields as approved BOM fields', () => {
    ['false', 'no', '0', 'rejected', 'unreviewed'].forEach((approved_part) => {
      const fields = buildBomCatalogFields({
        manufacturer: 'ACME',
        catalog_number: `P-${approved_part}`,
        approved_part,
        approval_status: approved_part === 'rejected' ? 'rejected' : 'unreviewed'
      });
      assert.equal(fields.approvedPart, false);
      assert.notEqual(fields.approvalStatus, 'approved');
    });
  });
});

describe('catalog confidence and traceability', () => {
  const approvedProduct = {
    id: 'TRAY-100',
    manufacturer: 'ACME',
    catalogNumber: 'TRAY-100',
    category: 'tray',
    description: 'Approved tray',
    approved: true,
    source: 'Owner approved list',
    lastVerified: '2026-05-22',
    datasheetUrl: 'https://example.com/tray-100.pdf',
    bimRef: { familyName: 'ACME Tray', typeName: 'TRAY-100', classification: 'tray' },
    standards: ['NEMA VE 1', 'UL classified'],
    co2eKgPerUnit: 3.4,
    epdSource: 'ACME EPD 2026',
    epdValidUntil: '2027-12-31'
  };

  it('scores complete governed catalog evidence', () => {
    const confidence = buildCatalogConfidence(approvedProduct, { today: '2026-06-02' });
    assert.equal(confidence.score, 100);
    assert.equal(confidence.status, CATALOG_CONFIDENCE_STATUS.complete);
    assert.deepEqual(confidence.missingEvidence, []);
    assert.deepEqual(confidence.staleEvidence, []);
  });

  it('marks generic or incomplete catalog evidence for review', () => {
    const confidence = buildCatalogConfidence({
      tag: 'EQ-1',
      manufacturer: 'Generic',
      catalogNumber: '',
      approved_part: false
    }, { today: '2026-06-02' });
    assert.equal(confidence.status, CATALOG_CONFIDENCE_STATUS.incomplete);
    assert.ok(confidence.missingEvidence.includes('manufacturer/catalog identity'));
    assert.ok(confidence.missingEvidence.includes('approved part status'));
  });

  it('warns for stricter datasheet, BIM, EPD, and stale verification checks', () => {
    const warnings = buildCatalogWarnings([{
      tag: 'TRAY-OLD',
      manufacturer: 'ACME',
      catalogNumber: 'TRAY-OLD',
      approved_part: true,
      catalog_source: 'Owner list',
      catalog_last_verified: '2024-01-01'
    }], [], {
      requireDatasheet: true,
      requireBimRef: true,
      requireEpd: true,
      today: '2026-06-02',
      verificationMaxAgeDays: 365
    });
    assert.ok(warnings.some(warning => warning.code === 'stale-catalog-verification'));
    assert.ok(warnings.some(warning => warning.code === 'missing-datasheet'));
    assert.ok(warnings.some(warning => warning.code === 'missing-bim-reference'));
    assert.ok(warnings.some(warning => warning.code === 'missing-epd-metadata'));
  });

  it('matches schedule records to catalog products and summarizes confidence', () => {
    const record = { tag: 'T-1', manufacturer: 'ACME', catalog_number: 'TRAY-100' };
    const matched = findCatalogProductForRecord(record, [approvedProduct]);
    assert.equal(matched.id, 'TRAY-100');

    const report = buildCatalogTraceabilityReport([
      record,
      { tag: 'T-2', manufacturer: 'Generic', catalog_number: '' }
    ], [approvedProduct], {
      today: '2026-06-02',
      requireDatasheet: true,
      requireBimRef: true,
      requireEpd: true
    });
    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.matched, 1);
    assert.equal(report.summary.approved, 1);
    assert.equal(report.summary.byConfidence.complete, 1);
    assert.equal(report.summary.byConfidence.incomplete, 1);
    assert.equal(report.rows[0].matchedCatalogId, 'TRAY-100');
    assert.equal(report.rows[0].confidence.status, CATALOG_CONFIDENCE_STATUS.complete);
    assert.ok(report.rows[1].warnings.some(warning => warning.code === 'missing-catalog-selection'));
  });

  it('does not match a catalog number belonging to a different manufacturer', () => {
    const record = { tag: 'T-OTHER', manufacturer: 'OtherCo', catalog_number: 'TRAY-100' };
    assert.equal(findCatalogProductForRecord(record, [approvedProduct]), null);
    const warnings = buildCatalogWarnings([record], [approvedProduct]);
    assert.ok(warnings.some(warning => warning.code === 'unknown-catalog-selection'));
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

describe('catalog import: templates and CSV parsing', () => {
  it('exposes a column spec with required headers', () => {
    const required = CATALOG_IMPORT_COLUMNS.filter(col => col.required).map(col => col.key);
    ['id', 'manufacturer', 'catalogNumber', 'category', 'description'].forEach(field => {
      assert.ok(required.includes(field), `${field} must be a required template column`);
    });
  });

  it('template rows cover every CATALOG_IMPORT_COLUMNS header', () => {
    const rows = buildCatalogTemplateRows();
    assert.ok(rows.length >= 1);
    const headerSet = new Set(CATALOG_IMPORT_COLUMNS.map(col => col.header));
    for (const row of rows) {
      Object.keys(row).forEach(key => assert.ok(headerSet.has(key), `unexpected header ${key} in template row`));
    }
  });

  it('template CSV round-trips through parseCatalogCsv to approved governed rows', () => {
    const csv = buildCatalogTemplateCsv();
    const { products, errors } = parseCatalogCsv(csv);
    assert.equal(errors.length, 0, `unexpected parse errors: ${JSON.stringify(errors)}`);
    assert.ok(products.length >= 1);
    const approved = products.filter(p => p.approved);
    assert.ok(approved.length >= 1, 'expected at least one approved example in the template');
    approved.forEach(p => {
      assert.ok(p.source, `approved row ${p.id} should round-trip a source`);
      assert.ok(p.lastVerified, `approved row ${p.id} should round-trip lastVerified`);
    });
  });

  it('reports row-numbered errors for approved rows missing source/lastVerified', () => {
    const csv = [
      'Part Number,Manufacturer,Catalog No.,Category,Description,Approved',
      'X-1,ACME,X-1,tray,Bad approved row,TRUE'
    ].join('\r\n');
    const { products, errors } = parseCatalogCsv(csv);
    assert.equal(products.length, 0);
    assert.ok(errors.some(err => err.row === 2 && /source/i.test(err.message)));
    assert.ok(errors.some(err => err.row === 2 && /lastVerified/i.test(err.message)));
  });

  it('reports impossible imported calendar dates as row errors', () => {
    const csv = [
      'Part Number,Manufacturer,Catalog No.,Category,Description,Approved,Source,Last Verified',
      'X-DATE,ACME,X-DATE,tray,Bad date,TRUE,Approved list,2026-02-31'
    ].join('\r\n');
    const { products, errors } = parseCatalogCsv(csv);
    assert.equal(products.length, 0);
    assert.ok(errors.some(error => error.row === 2 && error.column === 'Last Verified'));
  });

  it('rejects rows with invalid category enums', () => {
    const csv = [
      'Part Number,Manufacturer,Catalog No.,Category,Description',
      'X-2,ACME,X-2,not-a-category,Some row'
    ].join('\r\n');
    const { errors } = parseCatalogCsv(csv);
    assert.ok(errors.some(err => err.row === 2 && /Category/i.test(err.column)));
  });

  it('importCatalogRows splits incoming products into accepted vs duplicate by manufacturer/catalogNumber', () => {
    const existing = [
      normalizeCatalogProduct({
        id: 'OLD',
        manufacturer: 'ACME',
        catalogNumber: 'TRAY-12',
        category: 'tray',
        description: 'Old',
        approved: true,
        source: 'Approved list',
        lastVerified: '2026-05-22'
      })
    ];
    const incoming = [
      normalizeCatalogProduct({
        id: 'NEW',
        manufacturer: 'ACME',
        catalogNumber: 'TRAY-24',
        category: 'tray',
        description: 'New approved tray',
        approved: true,
        source: 'Approved list',
        lastVerified: '2026-05-22'
      }),
      normalizeCatalogProduct({
        id: 'DUP',
        manufacturer: 'ACME',
        catalogNumber: 'TRAY-12',
        category: 'tray',
        description: 'Same identity, will overwrite OLD',
        approved: true,
        source: 'Approved list rev B',
        lastVerified: '2026-05-22'
      })
    ];
    const identity = catalogIdentity(existing[0]);
    const { accepted, duplicates, blocked, importable, merged } = importCatalogRows(
      incoming,
      existing,
      { overridableIdentities: new Set([identity]) }
    );
    assert.deepEqual(accepted.map(p => p.id), ['NEW']);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].existing.id, 'OLD');
    assert.equal(blocked.length, 0);
    assert.deepEqual(importable.map(product => product.id), ['NEW', 'DUP']);
    assert.deepEqual(merged.map(product => product.id).sort(), ['DUP', 'NEW']);
  });

  it('blocks protected base identities and repeated identities within one import', () => {
    const existing = [{
      id: 'BASE',
      manufacturer: 'ACME',
      catalogNumber: 'TRAY-12',
      category: 'tray',
      description: 'Protected base row'
    }];
    const incoming = [
      {
        id: 'BASE-OVERRIDE',
        manufacturer: 'ACME',
        catalogNumber: 'TRAY-12',
        category: 'tray',
        description: 'Attempted base override'
      },
      {
        id: 'DUP-A',
        manufacturer: 'ACME',
        catalogNumber: 'TRAY-24',
        category: 'tray',
        description: 'First duplicate'
      },
      {
        id: 'DUP-B',
        manufacturer: 'ACME',
        catalogNumber: 'TRAY-24',
        category: 'tray',
        description: 'Second duplicate'
      }
    ];
    const result = importCatalogRows(incoming, existing);
    assert.equal(result.accepted.length, 0);
    assert.equal(result.duplicates.length, 0);
    assert.equal(result.importable.length, 0);
    assert.equal(result.blocked.filter(entry => entry.kind === 'protected-base').length, 1);
    assert.equal(result.blocked.filter(entry => entry.kind === 'incoming-duplicate').length, 2);
  });

  it('skips fully blank CSV rows', () => {
    const csv = [
      'Part Number,Manufacturer,Catalog No.,Category,Description',
      ',,,,',
      'X-3,ACME,X-3,tray,Real row'
    ].join('\r\n');
    const { products, errors } = parseCatalogCsv(csv);
    assert.equal(errors.length, 0);
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 'X-3');
  });
});
