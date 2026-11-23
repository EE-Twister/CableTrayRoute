import bundledDeviceSnapshot from '../data/designSynthesisDevices.json' with { type: 'json' };

const EATON_APPLICATION_GUIDE = {
  id: 'eaton_enclosed_circuit_breaker_application_guide_2016',
  publisher: 'Eaton',
  title: 'Enclosed Circuit Breakers Application Guide',
  documentNumber: 'CA08104001E',
  edition: 'April 2016',
  printedPage: '27.3-7',
  pdfIndex: 38,
  url: 'https://www.eaton.com/content/dam/eaton/products/low-voltage-power-distribution-controls-systems/swiching-devices/resources/enclosedcircuitbreakers-cagsection27-pages126thru135.pdf',
  basis: 'The guide states straight-voltage rated breakers may apply where nominal conductor-to-conductor voltage does not exceed the breaker voltage rating; slash-rated breakers require separate ground/line checks.'
};

const ELECTRICAL_FIELDS = [
  'catalogNumber', 'manufacturer', 'vendor', 'type', 'subtype', 'ratedVoltageVac', 'ratedVoltageVdc',
  'maximumVoltageVac', 'continuousCurrentA', 'frameA', 'sensorA', 'tripRatingA', 'frequencyHz', 'poles'
];
const RATING_FIELDS = ['voltageVac', 'voltageVdc', 'currentKA', 'currentType', 'ratingType', 'standard', 'frequencyHz', 'poles'];

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function sameField(record, bundled, field) {
  return Object.hasOwn(record, field) && Object.hasOwn(bundled, field) && JSON.stringify(canonical(record[field])) === JSON.stringify(canonical(bundled[field]));
}

function exactElectricalMatch(record, bundled) {
  if (!isRecord(record) || !isRecord(bundled) || typeof record.id !== 'string' || record.id !== bundled.id) return false;
  if (!ELECTRICAL_FIELDS.every(field => sameField(record, bundled, field))) return false;
  if (!Array.isArray(record.interruptingRatings) || !Array.isArray(bundled.interruptingRatings) || record.interruptingRatings.length !== bundled.interruptingRatings.length) return false;
  const incoming = record.interruptingRatings.map(item => {
    if (!isRecord(item)) return null;
    return Object.fromEntries(RATING_FIELDS.filter(field => Object.hasOwn(item, field)).map(field => [field, canonical(item[field])]));
  });
  const source = bundled.interruptingRatings.map(item => {
    if (!isRecord(item)) return null;
    return Object.fromEntries(RATING_FIELDS.filter(field => Object.hasOwn(item, field)).map(field => [field, canonical(item[field])]));
  });
  if (incoming.some(item => item === null) || source.some(item => item === null)) return false;
  return JSON.stringify(canonical(incoming)) === JSON.stringify(canonical(source));
}

function hasEatonStraightVoltageBasis(record) {
  if (!Array.isArray(record.sourceDocuments)) return false;
  const productEvidence = record.sourceDocuments.some(source => isRecord(source)
    && source.sourceType === 'manufacturer'
    && source.publisher === 'Eaton'
    && typeof source.url === 'string'
    && source.url.includes('eaton.com/us/en-us/skuPage.'));
  const hasPlain600Vac = record.ratedVoltageVac === 600 && record.maximumVoltageVac === 600;
  const hasDistinctAcInterruptRows = [240, 480].every(voltage => record.interruptingRatings.some(item =>
    item.voltageVac === voltage && String(item.currentType).toUpperCase() === 'AC' && Number.isFinite(item.currentKA)));
  return productEvidence && hasPlain600Vac && hasDistinctAcInterruptRows;
}

/**
 * Build lower-system-voltage rating evidence for exact bundled Eaton Series C records.
 * Incoming IDs are only lookup hints: all listed electrical/nameplate and interruption
 * fields must still equal the immutable bundled snapshot before evidence is returned.
 */
export function buildSynthesisDeviceVoltageApplicability(devices) {
  const result = {};
  const bundled = Array.isArray(bundledDeviceSnapshot?.records) ? bundledDeviceSnapshot.records : [];
  if (!Array.isArray(devices)) return result;
  const byId = new Map(bundled.filter(isRecord).filter(record => typeof record.id === 'string').map(record => [record.id, record]));
  for (const candidate of devices) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') continue;
    const reference = byId.get(candidate.id);
    if (!reference || !exactElectricalMatch(candidate, reference) || !hasEatonStraightVoltageBasis(reference)) continue;
    result[candidate.id] = {
      ratingKind: 'straight',
      basis: 'Bundled Eaton Series C exact SKU data identifies a 600 Vac breaker with separate 240 Vac and 480 Vac AIC rows; Eaton application guidance permits straight-voltage application when nominal conductor-to-conductor voltage does not exceed the rating.',
      sourceDocuments: [
        ...reference.sourceDocuments.filter(source => isRecord(source) && source.sourceType === 'manufacturer' && source.publisher === 'Eaton' && source.url?.includes('/skuPage.')),
        EATON_APPLICATION_GUIDE
      ]
    };
  }
  return result;
}

export default { buildSynthesisDeviceVoltageApplicability };
