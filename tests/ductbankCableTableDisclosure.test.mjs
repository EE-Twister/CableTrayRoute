import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../ductbankroute.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../ductbankroute.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles/ductbank.css', import.meta.url), 'utf8');

assert.match(html, /id="toggleCableTableBtn"[^>]*aria-expanded="false"[^>]*aria-controls="cable-section-content"/);
assert.match(html, /id="cable-section-content"[^>]*hidden/);
assert.match(html, /id="cable-section-summary"[^>]*aria-live="polite"/);
assert.match(script, /function setDuctbankCableTableExpanded\(expanded/);
assert.match(script, /if\(issue\.table==='cable'\) setDuctbankCableTableExpanded\(true\);/);
assert.match(script, /function focusDuctbankCableRow\(tag\)[\s\S]*?setDuctbankCableTableExpanded\(true\);/);
assert.match(styles, /\.ductbank-collapsible-content\[hidden\]\s*{\s*display: none;/);

console.log('\u2713 ductbank cable table disclosure');
