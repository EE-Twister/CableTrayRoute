/**
 * Manufacturer catalog governance audit.
 *
 * Validates a catalog file against the governed schema and reports the
 * catalog-confidence roll-up used by BOM, submittal, cost, and BIM export
 * flows. Works on the shipped seed catalog and on any exported/imported
 * project catalog that uses the same `{ products: [...] }` shape.
 *
 *   node scripts/auditManufacturerCatalog.mjs [file] [options]
 *
 *   --check              exit non-zero on validation errors or threshold misses
 *   --min-score=<0-100>  minimum average evidence score for --check
 *   --min-complete=<n>   minimum share (0-1) of rows at complete confidence
 *   --today=YYYY-MM-DD   evaluation date for staleness checks
 *   --json               emit the audit as JSON instead of text
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildCatalogConfidence,
  summarizeCatalogQuality,
  validateCatalog
} from '../analysis/manufacturerCatalog.mjs';

const DEFAULT_FILE = 'data/manufacturer_catalog.json';

export function parseAuditArgs(argv = []) {
  const options = {
    file: DEFAULT_FILE,
    check: false,
    json: false,
    minScore: null,
    minCompleteRatio: null,
    today: ''
  };
  for (const arg of argv) {
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--min-score=')) options.minScore = Number(arg.split('=')[1]);
    else if (arg.startsWith('--min-complete=')) options.minCompleteRatio = Number(arg.split('=')[1]);
    else if (arg.startsWith('--today=')) options.today = arg.split('=')[1];
    else if (!arg.startsWith('--')) options.file = arg;
  }
  return options;
}

function readProducts(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (Array.isArray(catalog?.products)) return catalog.products;
  return [];
}

/**
 * Audit a parsed catalog payload.
 * @param {object|object[]} catalog `{ products: [...] }` or a bare array
 * @param {object} [options] `today`, `minScore`, `minCompleteRatio`, `verificationMaxAgeDays`
 */
export function auditCatalog(catalog, options = {}) {
  const products = readProducts(catalog);
  const validation = validateCatalog(products, { requireApprovalAuthority: false });
  const confidenceOptions = {
    today: options.today || undefined,
    verificationMaxAgeDays: options.verificationMaxAgeDays
  };
  const summary = summarizeCatalogQuality(validation.products, confidenceOptions);

  const rows = validation.products.map((product) => {
    const confidence = buildCatalogConfidence(product, confidenceOptions);
    return {
      id: product.id,
      manufacturer: product.manufacturer,
      catalogNumber: product.catalogNumber,
      approvalStatus: product.approval?.status || 'unreviewed',
      score: confidence.score,
      status: confidence.status,
      missingEvidence: confidence.missingEvidence,
      staleEvidence: confidence.staleEvidence
    };
  });

  const completeRatio = summary.total ? summary.byConfidence.complete / summary.total : 0;
  const failures = [];
  validation.errors.forEach(error => failures.push({
    code: 'schema-error',
    message: `${error.path}: ${error.message}`
  }));
  if (options.minScore != null && Number.isFinite(options.minScore)
    && summary.averageScore < options.minScore) {
    failures.push({
      code: 'below-min-score',
      message: `Average evidence score ${summary.averageScore} is below the required ${options.minScore}.`
    });
  }
  if (options.minCompleteRatio != null && Number.isFinite(options.minCompleteRatio)
    && completeRatio < options.minCompleteRatio) {
    failures.push({
      code: 'below-min-complete',
      message: `Complete-confidence share ${completeRatio.toFixed(2)} is below the required `
        + `${Number(options.minCompleteRatio).toFixed(2)}.`
    });
  }

  return {
    valid: failures.length === 0,
    summary,
    completeRatio,
    rows,
    errors: validation.errors,
    warnings: validation.warnings,
    failures
  };
}

export function renderAuditReport(audit, { file = DEFAULT_FILE } = {}) {
  const { summary, rows } = audit;
  const lines = [
    `Manufacturer catalog audit — ${file}`,
    `  Rows: ${summary.total} (${summary.approved} approved)`,
    `  Confidence: ${summary.byConfidence.complete} complete, `
      + `${summary.byConfidence.review} review, ${summary.byConfidence.incomplete} incomplete`,
    `  Average evidence score: ${summary.averageScore}%`
  ];

  if (summary.missingEvidence.length) {
    lines.push('  Evidence gaps:');
    summary.missingEvidence.forEach(item => lines.push(`    - ${item.evidence}: ${item.count} row(s)`));
  }
  if (summary.staleRows) {
    lines.push(`  Stale evidence: ${summary.staleRows} row(s)`);
    summary.staleEvidence.forEach(item => lines.push(`    - ${item.evidence}: ${item.count} row(s)`));
  }

  const weakest = rows
    .filter(row => row.status !== 'complete')
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);
  if (weakest.length) {
    lines.push('  Lowest-confidence rows:');
    weakest.forEach(row => lines.push(
      `    - ${row.id} (${row.score}%, ${row.status}): missing ${row.missingEvidence.join(', ') || 'nothing'}`
    ));
  }

  if (audit.errors.length) {
    lines.push(`  Schema errors: ${audit.errors.length}`);
    audit.errors.slice(0, 20).forEach(error => lines.push(`    - ${error.path}: ${error.message}`));
  }
  if (audit.warnings.length) {
    lines.push(`  Schema warnings: ${audit.warnings.length}`);
  }
  if (audit.failures.length) {
    lines.push('  FAILURES:');
    audit.failures.forEach(failure => lines.push(`    - ${failure.message}`));
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseAuditArgs(process.argv.slice(2));
  const catalog = JSON.parse(await fs.readFile(options.file, 'utf8'));
  const audit = auditCatalog(catalog, options);

  if (options.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    process.stdout.write(renderAuditReport(audit, { file: options.file }));
  }

  if (options.check && !audit.valid) {
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
