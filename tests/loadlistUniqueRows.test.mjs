import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aggregateLoadsBySource, calculateDerived } from '../loadlist.mjs';

const legacyLoad = {
  source: 'MCC-1',
  tag: 'P-101',
  kw: '5',
  quantity: '3',
  voltage: '480',
  powerFactor: '1',
  phases: '3'
};

const derived = calculateDerived(legacyLoad);
assert.equal(derived.kva, 5, 'one uniquely tagged row must contribute its entered kW once');

const summary = aggregateLoadsBySource([legacyLoad]);
assert.equal(summary['MCC-1'].kW, 5, 'legacy quantity must not multiply source totals');

const html = fs.readFileSync(new URL('../loadlist.html', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(new URL('../loadlist.mjs', import.meta.url), 'utf8');
assert.equal(html.includes('data-column="quantity"'), false, 'Load List table must not render a Quantity column');
assert.equal(pageSource.includes("{ key: 'quantity', label: 'Qty'"), false, 'Quantity must not be available as an import target');
assert.equal(pageSource.includes('<span>Qty</span>'), false, 'Load entry form must not render Quantity');

console.log('Load List unique-row semantics tests passed');
