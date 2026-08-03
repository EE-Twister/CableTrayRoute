import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessProtectiveDeviceLibraryEntry } from '../analysis/protectiveDeviceLibrary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'data', 'protectiveDevices.json');
const indexPath = path.join(root, 'data', 'protectiveDeviceIndex.json');
const calculationModulePath = path.join(root, 'data', 'protectiveDeviceCalculations.mjs');
const shardDirectory = path.join(root, 'data', 'protectiveDeviceCatalog');
const SHARD_COUNT = 64;
const LOCATOR_BUDGET_BYTES = 1_000_000;

const LOCATOR_FIELDS = [
  'id',
  'type',
  'subtype',
  'voltageClass',
  'vendor',
  'series',
  'name',
  'catalogNumber',
  'tripUnitModel',
  'groundFault',
  'catalogAssessmentStatus',
  'catalogShard',
];

const CALCULATION_FIELDS = [
  'id',
  'name',
  'type',
  'subtype',
  'vendor',
  'interruptRating',
  'ampRating',
  'settings',
  'settingOptions',
  'curve',
  'curveProfile',
  'curveProfiles',
  'curveFamily',
  'iec60255',
  'tolerance',
  'instantaneousMax',
  'letThrough',
  'groundFault',
];

function shardForId(id) {
  let hash = 0x811c9dc5;
  for (const char of String(id || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % SHARD_COUNT;
}

function shardName(index) {
  return index.toString(16).padStart(2, '0');
}

function locatorRecord(record) {
  const derived = {
    ...record,
    catalogAssessmentStatus: assessProtectiveDeviceLibraryEntry(record).status,
    catalogShard: shardName(shardForId(record.id)),
  };
  return LOCATOR_FIELDS.map(field => derived[field] ?? null);
}

function calculationRecord(record) {
  const calculation = {};
  CALCULATION_FIELDS.forEach(field => {
    if (record[field] !== undefined) calculation[field] = record[field];
  });
  return calculation;
}

const devices = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(devices)) {
  throw new Error('Protective-device source must contain an array.');
}

const ids = new Set();
const shards = Array.from({ length: SHARD_COUNT }, () => []);
devices.forEach(device => {
  if (!device?.id || ids.has(device.id)) {
    throw new Error(`Protective-device IDs must be present and unique: ${device?.id || '<missing>'}`);
  }
  ids.add(device.id);
  shards[shardForId(device.id)].push(device);
});

const index = {
  schemaVersion: 2,
  fields: LOCATOR_FIELDS,
  records: devices.map(locatorRecord),
};
fs.writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
const calculationDevices = devices.map(calculationRecord);
fs.writeFileSync(calculationModulePath, `export default ${JSON.stringify(calculationDevices)};\n`);

fs.rmSync(shardDirectory, { recursive: true, force: true });
fs.mkdirSync(shardDirectory, { recursive: true });
shards.forEach((records, shardIndex) => {
  const filePath = path.join(shardDirectory, `${shardName(shardIndex)}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(records)}\n`);
});

const sourceBytes = fs.statSync(sourcePath).size;
const indexBytes = fs.statSync(indexPath).size;
const calculationBytes = fs.statSync(calculationModulePath).size;
if (indexBytes > LOCATOR_BUDGET_BYTES) {
  throw new Error(`Protective-device locator is ${indexBytes} bytes; budget is ${LOCATOR_BUDGET_BYTES} bytes.`);
}
console.log(
  `Built protective-device catalog: ${devices.length} records, ${SHARD_COUNT} shards, `
  + `${(indexBytes / 1024 / 1024).toFixed(2)} MB locator `
  + `and ${(calculationBytes / 1024 / 1024).toFixed(2)} MB calculation module `
  + `(${(((indexBytes + calculationBytes) / sourceBytes) * 100).toFixed(1)}% combined).`
);
