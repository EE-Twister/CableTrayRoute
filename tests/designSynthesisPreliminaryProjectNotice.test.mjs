import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import * as dataStore from '../dataStore.mjs';
import { PRELIMINARY_MOTOR_NOTICE, preliminaryMotorNotice, withCableReviewNotice } from '../src/design-synthesis/preliminaryProjectNotice.mjs';
import { buildDiagramExportData } from '../src/one-line/diagramFileController.mjs';
import { exportPanelSchedule } from '../exportPanelSchedule.js';
import { exportDXF, exportDWG } from '../exporters/dxf.js';

test('cable workbook notice preserves the header row and every value without mutating inputs', () => {
  const input = [['Tag', 'From'], ['M1', 'P1'], ['M2', 'P1']];
  const output = withCableReviewNotice(input, PRELIMINARY_MOTOR_NOTICE);
  assert.deepEqual(output, [['Tag', 'From', 'Review status'], ['M1', 'P1', PRELIMINARY_MOTOR_NOTICE], ['M2', 'P1', PRELIMINARY_MOTOR_NOTICE]]);
  assert.deepEqual(input, [['Tag', 'From'], ['M1', 'P1'], ['M2', 'P1']]);
  assert.equal(withCableReviewNotice(input, ''), input);
});

test('panel workbook and diagram data retain preliminary status only while generated motor records exist', () => {
  let workbook;
  globalThis.XLSX = { ...XLSX, writeFile: value => { workbook = value; } };
  try {
    dataStore.setPanels([{ id: 'P1', phases: 3, circuitCount: 4 }]);
    dataStore.setCables([{ id: 'C1', _designSynthesis: { identity: 'C1' }, motor: { overloadProtectionStatus: 'unresolved' } }]);
    assert.equal(preliminaryMotorNotice(), PRELIMINARY_MOTOR_NOTICE);
    exportPanelSchedule('P1');
    assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.P1, { header: 1 })[0][0], PRELIMINARY_MOTOR_NOTICE);
    assert.equal(buildDiagramExportData([], PRELIMINARY_MOTOR_NOTICE).reviewNotice, PRELIMINARY_MOTOR_NOTICE);
    dataStore.setCables([]);
    assert.equal(preliminaryMotorNotice(), '');
    assert.equal(buildDiagramExportData([]).reviewNotice, undefined);
    dataStore.setItem('designSynthesisReviewDraft', { status: 'preliminary-review-only' });
    assert.equal(preliminaryMotorNotice(), PRELIMINARY_MOTOR_NOTICE);
    exportPanelSchedule('P1');
    assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.P1, { header: 1 })[0][0], PRELIMINARY_MOTOR_NOTICE);
    dataStore.removeItem('designSynthesisReviewDraft');
    assert.equal(preliminaryMotorNotice(), '');
  } finally { delete globalThis.XLSX; }
});

test('DXF and DWG exports include readable status text near the diagram, without changing ordinary exports', async () => {
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  let blob;
  globalThis.document = { createElement: () => ({ click() {} }) };
  globalThis.URL = { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} };
  try {
    for (const exportDrawing of [exportDXF, exportDWG]) {
      exportDrawing([{ x: 100, y: 200, subtype: 'Breaker' }], { reviewNotice: PRELIMINARY_MOTOR_NOTICE });
      const contents = await blob.text();
      assert.match(contents, /10\n100\n20\n180/);
      assert.ok(contents.includes(PRELIMINARY_MOTOR_NOTICE));
      exportDrawing([{ x: 100, y: 200, subtype: 'Breaker' }]);
      assert.ok(!(await blob.text()).includes(PRELIMINARY_MOTOR_NOTICE));
    }
  } finally { globalThis.document = originalDocument; globalThis.URL = originalUrl; }
});
