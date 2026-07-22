import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../ductbankroute.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../ductbankroute.js',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../src/styles/ductbank.css',import.meta.url),'utf8');

test('ductbank route exposes a visible, assumption-driven BOM workflow',()=>{
  for(const id of [
    'ductbankLength','ductbankBomSection','ductbankBomTable','ductbank-bom-body',
    'bomConduitWaste','bomConcreteWaste','bomSpacerSpacing','bomWorkingClearance',
    'bomBeddingDepth','bomConduitStickLength','exportDuctbankBomBtn','exportBomBtn'
  ]){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(script,/buildDuctbankBOM/);
  assert.match(script,/appendDuctbankBomSheets\(wb\)/);
  assert.match(script,/renderDuctbankBom\(\)/);
  assert.match(script,/data-bom-option-toggle/);
  assert.match(script,/data-bom-option-input/);
  assert.match(html,/<th>Include<\/th>/);
  assert.match(styles,/\.ductbank-bom-summary/);
  assert.match(styles,/\.ductbank-bom-table/);
  assert.match(styles,/\.ductbank-bom-table-toggle/);
  assert.match(styles,/\.ductbank-bom-inline-inputs/);
  assert.doesNotMatch(html,/ductbank-bom-option-card/);
  assert.doesNotMatch(html,/id="bomCableSlack"/);
});
