import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const procurementScript = fs.readFileSync(
  new URL('../procurementschedule.js', import.meta.url),
  'utf8'
);
const pullCardsScript = fs.readFileSync(
  new URL('../pullcards.js', import.meta.url),
  'utf8'
);
const ductbankScript = fs.readFileSync(
  new URL('../ductbankroute.js', import.meta.url),
  'utf8'
);

test('procurement schedule reads canonical latest route results before legacy caches', () => {
  assert.match(procurementScript, /getItem\('latestRouteResults', null\)/);
  assert.match(procurementScript, /normalizeRouteResults\(getItem\('latestRouteResults', null\)\)/);
  assert.match(procurementScript, /normalizeRouteResults\(cached\)/);
});

test('pull cards imports the shared alert modal used by empty and error states', () => {
  assert.match(
    pullCardsScript,
    /import\s*\{\s*showAlertModal\s*\}\s*from\s*'\.\/src\/components\/modal\.js';/
  );
});

test('ductbank BOM empty guidance reflects whether route geometry already exists', () => {
  assert.match(ductbankScript, /const hasRouteLength=summary\.routeLengthFt > 0;/);
  assert.match(ductbankScript, /Add at least one conduit to calculate the ductbank BOM\./);
});
