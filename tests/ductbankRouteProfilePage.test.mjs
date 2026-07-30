import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../ductbankroute.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../ductbankroute.js',import.meta.url),'utf8');

test('ductbank route page exposes station, structure, project save, and export controls',()=>{
  [
    'routeProfileTable',
    'routeStructureTable',
    'addRoutePointBtn',
    'addRouteStructureBtn',
    'saveDuctbankRouteBtn',
    'exportRouteProfileBtn'
  ].forEach(id=>assert.match(html,new RegExp(`id="${id}"`)));
});

test('ductbank route profile is retained in the session and saved through the project store',()=>{
  assert.match(script,/routeProfile:\s*\{/);
  assert.match(script,/setDuctbanks\(next\)/);
  assert.doesNotMatch(script,/localStorage\./);
});

