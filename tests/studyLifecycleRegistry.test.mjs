import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  STUDY_PAGE_LIFECYCLE_REGISTRY,
  getStudyLifecycleCoverage,
} from '../src/components/studyLifecycleRegistry.js';
import { NAV_ROUTES } from '../src/components/navigation.js';
import { PAGE_CONTRACTS_BY_HREF } from '../src/pageContracts.js';

function htmlIds(href) {
  const html = fs.readFileSync(href, 'utf8');
  return new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]));
}

test('every study route has an explicit lifecycle registry entry', () => {
  const coverage = getStudyLifecycleCoverage();
  assert.equal(coverage.totalRoutes, 45);
  assert.equal(coverage.registryRoutes, 45);
  assert.deepEqual(coverage.missing, []);
  assert.deepEqual(coverage.ephemeral.sort(), [
    'autosize.html',
    'demandschedule.html',
    'emf.html',
    'equipmentevaluation.html',
    'groundgrid.html',
    'intlCableSize.html',
  ]);
});

test('lifecycle metadata stays aligned with navigation and page contracts', () => {
  const expected = NAV_ROUTES
    .filter(route => route.section === 'Studies')
    .map(route => ({
      href: route.href,
      label: route.label,
      resultKeys: (PAGE_CONTRACTS_BY_HREF[route.href]?.outputs || [])
        .map(output => output.key)
        .filter(key => key.startsWith('studyResults.'))
        .map(key => key.slice('studyResults.'.length)),
    }));
  const actual = STUDY_PAGE_LIFECYCLE_REGISTRY.map(({ href, label, resultKeys }) => ({ href, label, resultKeys }));
  assert.deepEqual(actual, expected);
});

test('explicit lifecycle DOM bindings are present in their page HTML', () => {
  for (const route of STUDY_PAGE_LIFECYCLE_REGISTRY) {
    const ids = htmlIds(route.href);
    const scoped = route.exportScopes.flatMap(scope => [...scope.resultKeys, ...scope.controlIds]);
    const declared = [...route.formIds, ...route.runControlIds, ...route.exportControlIds, ...route.requiredControlIds, ...scoped.filter(id => id.includes('-'))];
    assert.deepEqual(declared.filter(id => !ids.has(id)), [], `${route.href} declares a missing DOM id`);
  }
});

test('every saved route declares a result or explicitly documents its ephemeral policy', () => {
  for (const route of STUDY_PAGE_LIFECYCLE_REGISTRY) {
    if (route.mode === 'ephemeral') {
      assert.equal(route.exportPolicy, 'live-inputs-only');
    } else {
      assert.ok(route.resultKeys.length > 0, `${route.href} has no saved result key`);
      if (['tcc.html', 'iec60909.html'].includes(route.href)) assert.equal(route.exportPolicy, 'controller-managed');
      else assert.equal(route.exportPolicy, 'assessment-required');
    }
  }
});

test('conditional numeric controls are explicitly excluded from required-input checks', () => {
  const contingency = STUDY_PAGE_LIFECYCLE_REGISTRY.find(route => route.href === 'contingency.html');
  const dc = STUDY_PAGE_LIFECYCLE_REGISTRY.find(route => route.href === 'dcshortcircuit.html');
  assert.deepEqual(contingency.optionalControlIds, ['generatorInertiaH', 'faultClearingTime_s']);
  assert.equal(contingency.optionalWhen, 'checkTransientStability');
  assert.deepEqual(dc.optionalControlIds, ['arc-duration', 'gap-mm', 'working-distance']);
  assert.equal(dc.optionalWhen, 'run-arc-flash');
  assert.equal(dc.hiddenControlPolicy, 'exclude-hidden-disabled');
});

test('heat trace exports distinguish active sizing from branch schedule evidence', () => {
  const route = STUDY_PAGE_LIFECYCLE_REGISTRY.find(item => item.href === 'heattracesizing.html');
  assert.deepEqual(route.exportScopes.map(scope => scope.resultKeys), [
    ['heatTraceSizing'],
    ['heatTraceSizingCircuits'],
  ]);
  assert.deepEqual(route.exportScopes[0].controlIds, [
    'heattrace-export-package',
    'heattrace-export-report-json',
    'heattrace-print-report',
  ]);
});

test('multi-result pages bind form edits to the affected result scope', () => {
  const harmonics = STUDY_PAGE_LIFECYCLE_REGISTRY.find(item => item.href === 'harmonics.html');
  assert.deepEqual(harmonics.inputScopes, [
    { selectors: ['#freq-scan-section'], resultKeys: ['frequencyScan'] },
    { selectors: ['#unbalanced-section'], resultKeys: ['harmonics'] },
    { selectors: ['#harmonic-network-section'], resultKeys: ['harmonicNetwork'] },
  ]);
  const heatTrace = STUDY_PAGE_LIFECYCLE_REGISTRY.find(item => item.href === 'heattracesizing.html');
  assert.deepEqual(heatTrace.inputScopes, [
    { selectors: ['#circuit-case-list', '#circuit-case-name'], resultKeys: ['heatTraceSizingCircuits'] },
    { selectors: ['#heat-trace-form'], resultKeys: ['heatTraceSizing'] },
  ]);
});

test('embedded harmonic frequency scans persist through lifecycle context', () => {
  const html = fs.readFileSync('harmonics.html', 'utf8');
  const controller = fs.readFileSync('src/components/frequencyScanPanel.js', 'utf8');
  for (const source of ['src/harmonics.js', 'src/motorStart.js', 'src/loadFlow.js', 'src/contingency.js']) {
    const entry = fs.readFileSync(source, 'utf8');
    assert.match(entry, /initStudyLifecycle/);
    assert.match(entry, /addEventListener\('DOMContentLoaded', initStudyLifecycle\)/);
  }
  assert.match(controller, /captureStudyRunContext/);
  assert.match(controller, /saveStudyResult\('frequencyScan'/);
  assert.doesNotMatch(html, /studies\.frequencyScan\s*=\s*\{\s*params,\s*results/);
});
