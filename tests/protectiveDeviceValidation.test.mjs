import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

import {
  getProtectiveDeviceProductionMissing,
  PROTECTIVE_DEVICE_RESEARCH_REQUIRED_FIELDS,
  validateProtectiveDeviceCollection,
  validateProtectiveDeviceRecord
} from '../analysis/protectiveDeviceValidation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'data', 'protectiveDevices.schema.json'), 'utf8'));
const template = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'protective-device-research-template.json'), 'utf8'));

function buildResearchBreaker() {
  const record = structuredClone(template.records[0]);
  Object.assign(record, {
    id: 'acme_us_breaker_100a',
    vendor: 'Acme Power',
    manufacturer: 'Acme Power',
    series: 'US Breaker',
    name: 'Acme US Breaker 100 A',
    catalogNumber: 'USB-100-3P-65K',
    lifecycleStatus: 'current',
    standards: ['UL 489 (current manufacturer declaration)'],
    poles: [3],
    ratedVoltageVac: 600,
    continuousCurrentA: 100,
    frameA: 125,
    sensorA: 100,
    tripRatingA: 100,
    interruptingRatings: [{
      voltageVac: 480,
      currentKA: 65,
      currentType: 'AC',
      ratingType: 'AIC',
      standard: 'UL 489',
      frequencyHz: 60,
      poles: 3,
      basis: 'Exact catalog configuration',
      sourceId: 'mfr-manual'
    }],
    protectionSettings: {
      longTimePickup: { min: 0.4, max: 1, step: 0.05, values: null, unit: 'multiple_of_sensor', basis: 'Manufacturer range', sourceId: 'mfr-manual' }
    },
    curve: [{ current: 100, time: 100 }, { current: 1000, time: 0.1 }],
    curveEvidence: {
      document: 'Acme US Breaker Technical Manual',
      revision: 'Rev 4',
      date: null,
      curveId: null,
      curveNumber: 'Figure 12',
      page: '42',
      representation: 'tolerance_band',
      currentUnit: 'A',
      timeUnit: 's',
      frequencyHz: 60,
      referenceAmbientC: 40,
      scalingBasis: 'Exact 100 A trip configuration',
      extractionMethod: 'digitized official PDF',
      extractionDate: '2026-07-31',
      sourceId: 'mfr-manual',
      reviewer: null
    },
    curveValidation: {
      spotChecks: [
        { profileId: null, current: 200, expectedTime: 20, actualTime: 20, relativeError: 0, sourceId: 'mfr-manual' },
        { profileId: null, current: 500, expectedTime: 1, actualTime: 1, relativeError: 0, sourceId: 'mfr-manual' },
        { profileId: null, current: 1000, expectedTime: 0.1, actualTime: 0.1, relativeError: 0, sourceId: 'mfr-manual' }
      ],
      notes: 'Synthetic test fixture only.'
    },
    sourceUrls: ['https://manufacturer.example/manual', 'https://utility.example/approved-products'],
    sourceDocuments: [
      {
        id: 'mfr-manual', sourceType: 'manufacturer', purposes: ['technical_data', 'curve_data', 'standards', 'lifecycle'],
        publisher: 'Acme Power', title: 'US Breaker Technical Manual', url: 'https://manufacturer.example/manual',
        documentNumber: 'USB-TM-4', revision: 'Rev 4', date: '2026-01-15', accessedOn: '2026-07-31', page: '42', notes: null
      },
      {
        id: 'utility-list', sourceType: 'utility', purposes: ['market_prevalence'],
        publisher: 'Example Utility', title: 'Approved Breaker List', url: 'https://utility.example/approved-products',
        documentNumber: null, revision: null, date: '2026-03-01', accessedOn: '2026-07-31', page: null, notes: null
      }
    ],
    lastVerified: '2026-07-31',
    missingForProduction: [
      'short-time withstand not published for this configuration'
    ]
  });

  const verifiedPaths = [
    '/type', '/vendor', '/series', '/catalogNumber', '/lifecycleStatus', '/region', '/standards', '/frequencyHz', '/poles',
    '/ratedVoltageVac', '/continuousCurrentA', '/frameA', '/sensorA', '/tripRatingA', '/interruptingRatings',
    '/protectionSettings', '/curve', '/curveEvidence', '/curveValidation'
  ];
  verifiedPaths.forEach((fieldPath) => {
    record.fieldStatus[fieldPath] = 'verified';
    record.fieldSources[fieldPath] = fieldPath === '/region' ? ['utility-list'] : ['mfr-manual'];
  });
  record.fieldStatus['/tripUnitModel'] = 'not_applicable';
  record.fieldStatus['/ratedVoltageVdc'] = 'not_found';
  record.fieldStatus['/makingCapacityKApeak'] = 'not_found';
  record.fieldStatus['/shortTimeWithstand'] = 'not_found';
  record.fieldStatus['/settings'] = 'not_applicable';
  record.fieldStatus['/settingOptions'] = 'not_applicable';
  record.fieldStatus['/curveProfiles'] = 'not_applicable';
  record.fieldStatus['/openingTime'] = 'not_applicable';
  return record;
}

assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
assert.ok(schema.definitions.deviceRecord);
assert.ok(schema.definitions.researchBatch);
PROTECTIVE_DEVICE_RESEARCH_REQUIRED_FIELDS.forEach((field) => {
  assert.ok(Object.hasOwn(template.records[0], field), `research template is missing ${field}`);
});

const researchRecord = buildResearchBreaker();
const researchBatch = {
  schemaVersion: 1,
  purpose: 'protective_device_research_candidates',
  researchedOn: '2026-07-31',
  scope: 'Synthetic validator fixture',
  records: [researchRecord]
};
const researchResult = validateProtectiveDeviceCollection(researchBatch, { mode: 'research' });
assert.deepEqual(researchResult.errors, []);
const ajv = new Ajv({ allErrors: true, schemaId: 'auto' });
assert.equal(ajv.validate(schema, researchBatch), true, JSON.stringify(ajv.errors));

const promotedByAgent = structuredClone(researchBatch);
promotedByAgent.records[0].libraryStatus = 'calculation_ready';
promotedByAgent.records[0].review.reviewer = 'Research agent';
promotedByAgent.records[0].review.reviewedOn = '2026-07-31';
const promotedByAgentResult = validateProtectiveDeviceCollection(promotedByAgent, { mode: 'research' });
assert.ok(promotedByAgentResult.errors.some(error => /candidate records only|screening|cannot claim/i.test(error.message)));

const promotionRecord = structuredClone(researchRecord);
promotionRecord.researchStatus = 'reviewed';
promotionRecord.libraryStatus = 'calculation_ready';
promotionRecord.curveEvidence.reviewer = 'Independent PE';
promotionRecord.review = { reviewer: 'Independent PE', reviewedOn: '2026-08-01', notes: 'Fixture review.' };
const promotionResult = validateProtectiveDeviceRecord(promotionRecord, { mode: 'promotion' });
assert.deepEqual(promotionResult.errors, []);
assert.equal(ajv.validate(schema, [promotionRecord]), true, JSON.stringify(ajv.errors));

const fuseMissing = getProtectiveDeviceProductionMissing({
  ...promotionRecord,
  id: 'acme_fuse',
  type: 'fuse',
  curveProfiles: []
});
assert.ok(fuseMissing.includes('minimum-melt curve profile'));
assert.ok(fuseMissing.includes('total-clearing curve profile'));

const differentialMissing = getProtectiveDeviceProductionMissing({
  ...promotionRecord,
  id: 'acme_diff',
  type: 'relay',
  subtype: 'relay_87',
  interruptRating: null,
  interruptingRatings: [],
  curve: [],
  settings: { slope1: 0.25, slope2: 0.65, minPickupPu: 0.2, breakpointPu: 3 }
});
assert.ok(!differentialMissing.includes('voltage-specific interrupting ratings'));
assert.ok(!differentialMissing.includes('curve points, curve profiles, or published formula'));

const relayWithInterruptingRating = validateProtectiveDeviceRecord({
  id: 'bad_relay', type: 'relay', vendor: 'Acme', name: 'Bad relay', settings: {}, settingOptions: {}, curve: [], interruptRating: 65
});
assert.ok(relayWithInterruptingRating.errors.some(error => error.path === '/interruptRating'));

console.log('Protective-device schema and research validation tests passed.');
