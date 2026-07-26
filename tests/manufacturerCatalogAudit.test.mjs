import assert from 'assert';
import { spawnSync } from 'node:child_process';
import {
  auditCatalog,
  parseAuditArgs,
  renderAuditReport
} from '../scripts/auditManufacturerCatalog.mjs';

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

const COMPLETE_ROW = {
  id: 'FULL-1',
  manufacturer: 'ACME',
  catalogNumber: 'FULL-1',
  category: 'tray',
  description: 'Fully governed tray',
  unit: 'EA',
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

const REVIEW_ROW = {
  id: 'PART-1',
  manufacturer: 'ACME',
  catalogNumber: 'PART-1',
  category: 'fitting',
  description: 'Partly governed elbow',
  unit: 'EA',
  approved: true,
  source: 'Owner approved list',
  lastVerified: '2026-05-22',
  standards: ['NEMA VE 1']
};

describe('catalog audit argument parsing', () => {
  it('defaults to the seed catalog with no flags set', () => {
    const options = parseAuditArgs([]);
    assert.equal(options.file, 'data/manufacturer_catalog.json');
    assert.equal(options.check, false);
    assert.equal(options.json, false);
    assert.equal(options.minScore, null);
  });

  it('parses file, check, threshold, and date flags', () => {
    const options = parseAuditArgs([
      'catalogs/project.json', '--check', '--json', '--min-score=85', '--min-complete=0.5', '--today=2026-06-02'
    ]);
    assert.equal(options.file, 'catalogs/project.json');
    assert.equal(options.check, true);
    assert.equal(options.json, true);
    assert.equal(options.minScore, 85);
    assert.equal(options.minCompleteRatio, 0.5);
    assert.equal(options.today, '2026-06-02');
  });
});

describe('catalog audit', () => {
  it('summarizes confidence for a valid catalog', () => {
    const audit = auditCatalog({ products: [COMPLETE_ROW, REVIEW_ROW] }, { today: '2026-06-02' });
    assert.equal(audit.valid, true);
    assert.equal(audit.summary.total, 2);
    assert.equal(audit.summary.byConfidence.complete, 1);
    assert.equal(audit.summary.byConfidence.review, 1);
    assert.equal(audit.completeRatio, 0.5);
    assert.equal(audit.rows.length, 2);
    assert.ok(audit.rows.find(row => row.id === 'PART-1').missingEvidence.includes('datasheet URL'));
  });

  it('accepts a bare product array as well as a wrapped catalog', () => {
    const audit = auditCatalog([COMPLETE_ROW], { today: '2026-06-02' });
    assert.equal(audit.summary.total, 1);
    assert.equal(audit.valid, true);
  });

  it('fails on schema errors such as approved rows without evidence', () => {
    const audit = auditCatalog({
      products: [{ ...COMPLETE_ROW, source: '', lastVerified: '' }]
    }, { today: '2026-06-02' });
    assert.equal(audit.valid, false);
    assert.ok(audit.failures.some(failure => failure.code === 'schema-error'));
    assert.ok(audit.errors.some(error => error.path.includes('source')));
  });

  it('enforces average-score and complete-share thresholds', () => {
    const catalog = { products: [COMPLETE_ROW, REVIEW_ROW] };
    assert.equal(auditCatalog(catalog, { today: '2026-06-02', minScore: 80 }).valid, true);

    const lowScore = auditCatalog(catalog, { today: '2026-06-02', minScore: 95 });
    assert.equal(lowScore.valid, false);
    assert.ok(lowScore.failures.some(failure => failure.code === 'below-min-score'));

    const lowComplete = auditCatalog(catalog, { today: '2026-06-02', minCompleteRatio: 0.9 });
    assert.equal(lowComplete.valid, false);
    assert.ok(lowComplete.failures.some(failure => failure.code === 'below-min-complete'));
  });

  it('reports stale verification dates against the evaluation date', () => {
    const audit = auditCatalog({
      products: [{ ...COMPLETE_ROW, lastVerified: '2024-01-01' }]
    }, { today: '2026-06-02', verificationMaxAgeDays: 365 });
    assert.equal(audit.summary.staleRows, 1);
    assert.ok(audit.rows[0].staleEvidence.includes('catalog verification date'));
  });

  it('renders a readable report with gaps and failures', () => {
    const audit = auditCatalog({ products: [COMPLETE_ROW, REVIEW_ROW] }, { today: '2026-06-02', minScore: 95 });
    const report = renderAuditReport(audit, { file: 'data/manufacturer_catalog.json' });
    assert.ok(report.includes('Manufacturer catalog audit'));
    assert.ok(report.includes('Rows: 2 (2 approved)'));
    assert.ok(report.includes('Evidence gaps:'));
    assert.ok(report.includes('Lowest-confidence rows:'));
    assert.ok(report.includes('FAILURES:'));
  });
});

describe('catalog audit CLI', () => {
  it('passes --check against the shipped seed catalog', () => {
    const result = spawnSync(process.execPath, ['scripts/auditManufacturerCatalog.mjs', '--check'], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(/Manufacturer catalog audit/.test(result.stdout));
  });

  it('exits non-zero when a threshold is not met', () => {
    const result = spawnSync(process.execPath, [
      'scripts/auditManufacturerCatalog.mjs', '--check', '--min-score=100'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(/below the required 100/.test(result.stdout));
  });

  it('emits machine-readable JSON with --json', () => {
    const result = spawnSync(process.execPath, ['scripts/auditManufacturerCatalog.mjs', '--json'], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.summary.total >= 20);
    assert.ok(Array.isArray(parsed.rows));
  });
});

console.log('manufacturer catalog audit tests complete');
