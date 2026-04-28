#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BIM_CONNECTOR_PACKAGE_SCHEMA,
  applyConnectorImportPreview,
  buildConnectorReadinessPackage,
  buildConnectorRoundTripDiff,
  validateConnectorImportPackage,
} from '../analysis/bimConnectorContract.mjs';

function parseArgs(argv = []) {
  const args = {
    packagePath: '',
    projectStatePath: '',
    previousPath: '',
    outPath: '',
    pretty: false,
    noFail: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--project-state') {
      args.projectStatePath = argv[index + 1] || '';
      index += 1;
    } else if (token === '--previous') {
      args.previousPath = argv[index + 1] || '';
      index += 1;
    } else if (token === '--out') {
      args.outPath = argv[index + 1] || '';
      index += 1;
    } else if (token === '--pretty') {
      args.pretty = true;
    } else if (token === '--no-fail') {
      args.noFail = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (!args.packagePath) {
      args.packagePath = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node tools/bim-connector-validator.mjs <connector-package.json> [options]',
    '',
    'Options:',
    '  --project-state <file>  CableTrayRoute project-state fixture for mapping and quantity preview.',
    '  --previous <file>       Previous connector package for round-trip diff comparison.',
    '  --out <file>            Write the validation report to a JSON file instead of stdout.',
    '  --pretty                Pretty-print JSON output.',
    '  --no-fail               Exit 0 even when validation errors are present.',
  ].join('\n');
}

function readJson(filePath, fallback = {}) {
  if (!filePath) return fallback;
  const absolute = resolve(filePath);
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (err) {
    throw new Error(`Unable to read JSON file ${absolute}: ${err.message}`);
  }
}

export function buildConnectorValidationReport({
  payload,
  projectState = {},
  previousPackage = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const validation = validateConnectorImportPackage(payload);
  const preview = applyConnectorImportPreview({ payload, projectState });
  const roundTripDiff = buildConnectorRoundTripDiff({
    previousPackage,
    importPackage: validation.package,
    projectState,
  });
  const readiness = buildConnectorReadinessPackage({
    packages: [validation.package],
    activePackageId: validation.package.id,
    projectState,
    generatedAt,
  });
  return {
    version: 'bim-connector-validation-report-v1',
    generatedAt,
    schema: BIM_CONNECTOR_PACKAGE_SCHEMA,
    valid: validation.valid,
    packageId: validation.package.id,
    connectorType: validation.package.connectorType,
    sourceApplication: validation.package.sourceApplication,
    sourceVersion: validation.package.sourceVersion,
    projectId: validation.package.projectId,
    scenario: validation.package.scenario,
    summary: {
      elementCount: validation.package.elements.length,
      quantityCount: validation.package.quantities.length,
      issueCount: validation.package.issues.length,
      acceptedElements: preview.acceptedElements.length,
      rejectedElements: preview.rejectedElements.length,
      quantityDeltas: preview.quantityDeltas.length,
      mappingDeltas: preview.mappingDeltas.length,
      addedElements: roundTripDiff.summary.addedElements,
      removedElements: roundTripDiff.summary.removedElements,
      changedElements: roundTripDiff.summary.changedElements,
    },
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
    },
    preview: {
      acceptedElements: preview.acceptedElements,
      rejectedElements: preview.rejectedElements,
      quantityDeltas: preview.quantityDeltas,
      mappingDeltas: preview.mappingDeltas,
      recommendedNextActions: preview.recommendedNextActions,
    },
    roundTripDiff,
    readiness: {
      summary: readiness.summary,
      warnings: readiness.warnings,
      assumptions: readiness.assumptions,
    },
  };
}

export function runCli(argv = process.argv.slice(2), io = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    (io.stdout || process.stdout).write(`${usage()}\n`);
    return 0;
  }
  if (!args.packagePath) {
    (io.stderr || process.stderr).write(`${usage()}\n`);
    return 2;
  }
  const payload = readJson(args.packagePath);
  const projectState = readJson(args.projectStatePath, {});
  const previousPackage = args.previousPath ? readJson(args.previousPath) : null;
  const report = buildConnectorValidationReport({ payload, projectState, previousPackage });
  const json = JSON.stringify(report, null, args.pretty ? 2 : 0);
  if (args.outPath) {
    writeFileSync(resolve(args.outPath), `${json}\n`);
  } else {
    (io.stdout || process.stdout).write(`${json}\n`);
  }
  if (!report.valid && !args.noFail) return 1;
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.exitCode = runCli();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}
