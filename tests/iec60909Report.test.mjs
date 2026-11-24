import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { toIEC60909PDF } from '../reports/iec60909Report.mjs';

const results = {
  'BUS-VALID': {
    validity: 'evaluated', calculationStatus: 'screening-only', prefaultKV: 11, cFactor: 1.1,
    kappa: 1.746, threePhaseKA: 34.76, lineToGroundKA: 34.76, lineToLineKA: 30.1,
    doubleLineGroundKA: 34.76, doubleLineGroundPhaseBKA: 34.76, doubleLineGroundPhaseCKA: 34.76,
    doubleLineGroundEarthKA: 34.76, ip: 85.82, mu: 1, Ib: 34.76, Ith: 35.03,
    inputFingerprint: 'saved-project', currentInputFingerprint: 'current-project', freshness: 'stale',
    calculatedAt: '2026-09-16T12:00:00.000Z', provenance: { standard: 'IEC 60909-0:2016' },
    modelLimits: { thermalEquivalent: 'Screening-only; I″k3 and m+n model.' },
    studyOptions: { method: 'IEC', cMode: 'max' },
    warnings: Array.from({ length: 90 }, (_, index) => `Long warning ${index + 1}: review thermal screening input provenance.`),
    requiredInputs: []
  },
  'BUS-INCOMPLETE': {
    validity: 'unevaluated', calculationStatus: 'incomplete', prefaultKV: 11,
    threePhaseKA: null, lineToGroundKA: null, lineToLineKA: null, doubleLineGroundKA: null,
    doubleLineGroundPhaseBKA: null, doubleLineGroundPhaseCKA: null, doubleLineGroundEarthKA: null,
    ip: null, mu: null, Ib: null, Ith: null, inputFingerprint: null,
    currentInputFingerprint: 'current-project', freshness: 'unknown', calculatedAt: null,
    requiredInputs: ['Positive-sequence impedance z1 is required.'],
    warnings: ['Currents withheld until finite impedance data is provided.'], provenance: {}
  }
};

const pdf = await toIEC60909PDF(results);
const outputPath = 'output/calculation-corrections-2026-09-17/iec60909-report.pdf';
// output/ is gitignored, so a clean checkout (CI) has no evidence folder yet.
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, Buffer.from(pdf));
const document = await getDocument({ data: new Uint8Array(pdf), disableWorker: true }).promise;
let text = '';
for (let page = 1; page <= document.numPages; page += 1) {
  const content = await (await document.getPage(page)).getTextContent();
  text += `${content.items.map(item => item.str).join(' ')}\n`;
}
assert.ok(document.numPages > 1, 'long contract metadata should paginate');
assert.match(text, /Bus \/ component: BUS-VALID/);
assert.match(text, /Bus \/ component: BUS-VALID \(continued\)/);
assert.match(text, /Page 1 of/);
assert.match(text, /3-phase current \(kA\): 34\.76/);
assert.match(text, /DLG phase B \(kA\): 34\.76/);
assert.match(text, /Saved fingerprint: saved-project/);
assert.match(text, /Current fingerprint: current-project/);
assert.match(text, /Freshness: stale/);
assert.match(text, /Validity: unevaluated/);
assert.match(text, /Calculation status: incomplete/);
assert.match(text, /Positive-sequence impedance z1 is required/);
assert.doesNotMatch(text, /3-phase current \(kA\): 0/);
console.log(`IEC 60909 PDF report checks passed (${document.numPages} pages)`);
