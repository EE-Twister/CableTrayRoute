import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

import { validateProtectiveDeviceCollection } from '../analysis/protectiveDeviceValidation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(args) {
  const options = {
    mode: 'library',
    file: path.join(root, 'data', 'protectiveDevices.json')
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--research') {
      options.mode = 'research';
      const next = args[index + 1];
      if (next && !next.startsWith('--')) {
        options.file = path.resolve(next);
        index += 1;
      }
    } else if (arg === '--promotion') {
      options.mode = 'promotion';
      const next = args[index + 1];
      if (next && !next.startsWith('--')) {
        options.file = path.resolve(next);
        index += 1;
      }
    } else if (arg === '--file') {
      const next = args[index + 1];
      if (!next) throw new Error('--file requires a path');
      options.file = path.resolve(next);
      index += 1;
    } else if (arg === '--library') {
      options.mode = 'library';
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function printIssues(label, issues) {
  if (!issues.length) return;
  console.log(`${label} (${issues.length})`);
  issues.forEach(item => console.log(`  ${item.path}: ${item.message}`));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const schemaPath = path.join(root, 'data', 'protectiveDevices.schema.json');
  const schema = loadJson(schemaPath);
  if (schema.$schema !== 'http://json-schema.org/draft-07/schema#' || !schema.definitions?.deviceRecord) {
    throw new Error('data/protectiveDevices.schema.json is missing its draft-07 declaration or deviceRecord definition');
  }

  const payload = loadJson(options.file);
  const ajv = new Ajv({ allErrors: true, schemaId: 'auto' });
  const schemaValid = ajv.validate(schema, payload);
  if (!schemaValid) {
    const schemaErrors = (ajv.errors || []).map(error => ({
      path: error.dataPath || '/',
      message: `${error.message} (${error.schemaPath})`
    }));
    printIssues('JSON Schema errors', schemaErrors);
    process.exitCode = 1;
    return;
  }
  const result = validateProtectiveDeviceCollection(payload, { mode: options.mode });
  printIssues('Warnings', result.warnings);
  printIssues('Errors', result.errors);
  if (!result.valid) {
    process.exitCode = 1;
    return;
  }
  const label = options.mode === 'research' ? 'research candidate' : options.mode === 'promotion' ? 'promotion' : 'library';
  console.log(`Validated ${result.records.length} protective-device ${label} records.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
