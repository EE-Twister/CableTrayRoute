import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateProtectiveDeviceCollection } from '../analysis/protectiveDeviceValidation.mjs';
import { PROTECTIVE_DEVICE_LIBRARY_STATUS } from '../analysis/protectiveDeviceLibrary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultInput = path.join(root, 'docs', 'protective-device-research-results-2026-07-31.json');
const defaultOutput = path.join(root, 'data', 'protectiveDevices.json');

function parseArgs(args) {
  const options = {
    input: defaultInput,
    output: defaultOutput,
    apply: false,
    repairExisting: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--input' || arg === '--output') {
      const next = args[index + 1];
      if (!next) throw new Error(`${arg} requires a path`);
      options[arg.slice(2)] = path.resolve(next);
      index += 1;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--repair-existing') {
      options.repairExisting = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertCandidateBatch(batch) {
  if (!batch || batch.schemaVersion !== 1 || batch.purpose !== 'protective_device_research_candidates') {
    throw new Error('Input is not a schemaVersion 1 protective_device_research_candidates batch.');
  }
  const validation = validateProtectiveDeviceCollection(batch, { mode: 'research' });
  if (!validation.valid) {
    const summary = validation.errors.slice(0, 12).map(error => `${error.path}: ${error.message}`).join('\n');
    throw new Error(`Candidate validation failed with ${validation.errors.length} errors:\n${summary}`);
  }
  return batch.records;
}

export function prepareProtectiveDevicePromotion(productionDevices, candidateBatch) {
  if (!Array.isArray(productionDevices)) throw new Error('Production protective-device library must be an array.');
  const candidates = assertCandidateBatch(candidateBatch);
  const productionIds = new Set(productionDevices.map(device => device?.id).filter(Boolean));
  const candidateIds = new Set();

  candidates.forEach((candidate) => {
    if (candidate.libraryStatus !== PROTECTIVE_DEVICE_LIBRARY_STATUS.SCREENING) {
      throw new Error(`${candidate.id}: only screening candidates may be promoted by this command.`);
    }
    if (candidate.researchStatus !== 'candidate') {
      throw new Error(`${candidate.id}: researchStatus must remain candidate during screening promotion.`);
    }
    if (candidateIds.has(candidate.id)) throw new Error(`Duplicate candidate id: ${candidate.id}`);
    if (productionIds.has(candidate.id)) throw new Error(`Candidate id already exists in production library: ${candidate.id}`);
    candidateIds.add(candidate.id);
  });

  return [...productionDevices, ...candidates.map(normalizePromotedRecord)];
}

export function normalizePromotedRecord(record) {
  if (!record || typeof record !== 'object') return record;
  if (!['breaker', 'fuse'].includes(record.type)) return record;
  return {
    ...record,
    // Legacy scalar fields are deliberately not used for unreviewed records.
    // Preserve structured shortTimeWithstand separately when it is source-backed.
    withstandRatingKA: null,
    withstandCycles: null
  };
}

export function normalizeProductionLibrary(productionDevices) {
  return productionDevices.map(normalizePromotedRecord);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const productionDevices = readJson(options.output);
  if (options.repairExisting) {
    const normalized = normalizeProductionLibrary(productionDevices);
    const changed = normalized.reduce((count, record, index) => count + (record !== productionDevices[index] ? 1 : 0), 0);
    console.log(`Found ${changed} existing screening records needing explicit null safety fields.`);
    if (options.apply) {
      fs.writeFileSync(options.output, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      console.log(`Wrote normalized library to ${options.output}.`);
    } else {
      console.log('Dry run only. Re-run with --repair-existing --apply to update the production library.');
    }
    return;
  }
  const candidateBatch = readJson(options.input);
  const merged = prepareProtectiveDevicePromotion(productionDevices, candidateBatch);
  console.log(`Prepared ${candidateBatch.records.length} screening candidates for promotion.`);
  console.log(`Production library would grow from ${productionDevices.length} to ${merged.length} records.`);
  if (!options.apply) {
    console.log('Dry run only. Re-run with --apply to update the production library.');
    return;
  }
  fs.writeFileSync(options.output, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${merged.length} records to ${options.output}.`);
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryUrl === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
