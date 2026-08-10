import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DOM_FREE_MODULES,
  ENTRYPOINT_BUDGETS,
  EXTRACTED_MODULE_BUDGETS,
  ORIGINAL_ENTRYPOINT_BASELINES,
  REQUIRED_BOUNDARIES,
  countSourceLines,
  inspectArchitectureBoundaries
} from '../scripts/checkArchitectureBoundaries.mjs';
import { createRoutingState } from '../src/routing/routingState.mjs';

describe('architecture boundaries', () => {
  it('keeps decomposed entrypoints within their ratcheted size budgets', async () => {
    const result = await inspectArchitectureBoundaries();
    assert.deepEqual(result.failures, []);
    Object.entries(ENTRYPOINT_BUDGETS).forEach(([relativePath, budget]) => {
      assert.ok(result.measurements[relativePath].lines <= budget);
    });
  });

  it('keeps every entrypoint ratchet below its immutable original baseline', () => {
    assert.ok(Object.isFrozen(ORIGINAL_ENTRYPOINT_BASELINES));
    assert.ok(Object.isFrozen(ENTRYPOINT_BUDGETS));
    assert.deepEqual(ORIGINAL_ENTRYPOINT_BASELINES, {
      'oneline.js': 20852,
      'analysis/tcc.js': 11308,
      'app.mjs': 6734,
      'ductbankroute.js': 5377,
      'cableschedule.js': 3644,
      'cathodicprotection.js': 3401,
      'src/panelSchedule.js': 3234,
      'site.js': 2974
    });
    assert.deepEqual(Object.keys(ENTRYPOINT_BUDGETS).sort(), Object.keys(ORIGINAL_ENTRYPOINT_BASELINES).sort());
    Object.entries(ENTRYPOINT_BUDGETS).forEach(([relativePath, budget]) => {
      assert.ok(budget < ORIGINAL_ENTRYPOINT_BASELINES[relativePath], `${relativePath} must stay below its original baseline`);
    });
  });

  it('requires explicit production-module seams for every large entrypoint', () => {
    assert.deepEqual(Object.keys(REQUIRED_BOUNDARIES).sort(), [
      'analysis/tcc.js',
      'app.mjs',
      'cableschedule.js',
      'cathodicprotection.js',
      'ductbankroute.js',
      'oneline.js',
      'site.js',
      'src/panelSchedule.js'
    ]);
    Object.values(REQUIRED_BOUNDARIES).forEach(imports => assert.ok(imports.length >= 2));
    assert.ok(REQUIRED_BOUNDARIES['oneline.js'].includes('./src/one-line/eventBindingController.mjs'));
    assert.ok(REQUIRED_BOUNDARIES['analysis/tcc.js'].includes('./tcc/chartRenderer.mjs'));
    assert.ok(REQUIRED_BOUNDARIES['app.mjs'].includes('./src/routing/routingProjectAdapter.mjs'));
    assert.ok(REQUIRED_BOUNDARIES['cableschedule.js'].includes('./src/cable-schedule/templateModel.js'));
    assert.ok(REQUIRED_BOUNDARIES['src/panelSchedule.js'].includes('./panel-schedule/breakerLayoutModel.js'));
  });

  it('bounds large extracted views and controllers as well as small models', () => {
    assert.ok(Object.isFrozen(EXTRACTED_MODULE_BUDGETS));
    assert.equal(EXTRACTED_MODULE_BUDGETS['src/one-line/eventBindingController.mjs'], 2155);
    assert.equal(EXTRACTED_MODULE_BUDGETS['src/one-line/propertyDetailView.mjs'], 2332);
    assert.equal(EXTRACTED_MODULE_BUDGETS['analysis/tcc/chartRenderer.mjs'], 1342);
    assert.equal(EXTRACTED_MODULE_BUDGETS['analysis/tcc/customCurveBuilderView.mjs'], 1629);
    assert.equal(EXTRACTED_MODULE_BUDGETS['src/panel-schedule/breakerLayoutModel.js'], 360);
  });

  it('keeps calculation and view-model boundaries independent from browser and persistence globals', () => {
    assert.ok(DOM_FREE_MODULES.length >= 16);
    assert.ok(DOM_FREE_MODULES.includes('analysis/dissimilarMetalsModel.mjs'));
    assert.ok(DOM_FREE_MODULES.includes('analysis/tcc/equipmentOverlayModel.mjs'));
    assert.ok(DOM_FREE_MODULES.includes('src/one-line/diagramModel.mjs'));
    assert.ok(DOM_FREE_MODULES.includes('src/ductbank-route/ampacityModel.js'));
    assert.ok(DOM_FREE_MODULES.includes('src/cable-schedule/templateModel.js'));
    assert.ok(DOM_FREE_MODULES.includes('src/panel-schedule/phaseLoadModel.js'));
    assert.ok(!DOM_FREE_MODULES.includes('src/one-line/propertyDetailView.mjs'));
    assert.ok(!DOM_FREE_MODULES.includes('analysis/tcc/chartRenderer.mjs'));
    assert.ok(!DOM_FREE_MODULES.includes('src/cable-schedule/printReport.js'));
  });

  it('counts source lines consistently and creates isolated routing state', () => {
    assert.equal(countSourceLines('one\ntwo\n'), 2);
    const first = createRoutingState();
    const second = createRoutingState();
    first.cableList.push({ id: 'C-1' });
    first.expandedPullGroupIds.add('group-1');
    assert.deepEqual(second.cableList, []);
    assert.equal(second.expandedPullGroupIds.size, 0);
  });
});
