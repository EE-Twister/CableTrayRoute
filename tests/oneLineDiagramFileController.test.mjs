import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDiagramExportData,
  createDiagramFileController,
  migrateOneLineDiagram,
  sanitizeDiagramExport
} from '../src/one-line/diagramFileController.mjs';

describe('One-Line diagram file controller', () => {
  it('exports isolated sheet records without dropping connections or layers', () => {
    const source = [{
      name: 'Main',
      components: [{ id: 'a' }],
      connections: [{ from: 'a', to: 'b' }],
      layers: [{ id: 'base' }]
    }];
    const exported = buildDiagramExportData(source);
    assert.deepEqual(exported.sheets[0].connections, [{ from: 'a', to: 'b' }]);
    assert.notEqual(exported.sheets[0].components[0], source[0].components[0]);
    assert.notEqual(exported.sheets[0].layers[0], source[0].layers[0]);
  });

  it('migrates legacy sheet links and sanitizes non-JSON diagnostics values', () => {
    const migrated = migrateOneLineDiagram({
      version: 3,
      sheets: [{ components: [{ type: 'sheet_link', props: { target_sheet: 'Sheet 2' } }] }]
    }, 4);
    assert.equal(migrated.sheets[0].components[0].props.linked_sheet, 'Sheet 2');
    assert.equal('target_sheet' in migrated.sheets[0].components[0].props, false);
    const circular = { value: Number.NaN, count: 3n };
    circular.self = circular;
    assert.deepEqual(sanitizeDiagramExport(circular), { value: 'NaN', count: 3, self: '[Circular]' });
  });

  it('coordinates imported scenario, scale, templates, sheets, and persistence', async () => {
    const calls = [];
    const controller = createDiagramFileController({
      documentRef: {},
      windowRef: null,
      URLRef: {},
      BlobCtor: class {},
      setTimeoutFn: () => {},
      getSheets: () => [],
      getScenario: () => 'default',
      getOneLine: () => ({}),
      getStudies: () => ({}),
      diagramVersion: 4,
      switchScenario: scenario => calls.push(['scenario', scenario]),
      normalizeDiagramScale: scale => ({ ...scale, normalized: true }),
      applyDiagramScale: scale => calls.push(['scale', scale]),
      applyTemplates: templates => calls.push(['templates', templates]),
      normalizeComponent: component => ({ ...component, normalized: true }),
      applySheets: sheets => calls.push(['sheets', sheets]),
      loadSheet: (index, options) => calls.push(['load', index, options]),
      renderSheetTabs: () => calls.push(['tabs']),
      save: () => calls.push(['save']),
      showToast: () => {}
    });
    await controller.importDiagram({
      version: 4,
      meta: { scenario: 'emergency' },
      scale: { unitPerPx: 2 },
      templates: [{ name: 'T1' }],
      sheets: [{ name: 'Imported', components: [{ id: 'a' }], connections: [], layers: [] }]
    });
    assert.deepEqual(calls.map(call => call[0]), ['scenario', 'scale', 'templates', 'sheets', 'load', 'tabs', 'save']);
    assert.equal(calls[3][1][0].components[0].normalized, true);
  });
});
