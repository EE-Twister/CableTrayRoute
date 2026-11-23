import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { startStaticServer } from './staticServer.helper.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const payload = '<img src=x onerror="window.__importExecuted=true">';
let site;

test.beforeAll(async () => { site = await startStaticServer(root); });
test.afterAll(async () => { await site.close(); });

test('route hover renders imported labels and metadata as text', async ({ page }) => {
  await page.goto(site.url('404.html'));
  const result = await page.evaluate(async payload => {
    const { RouteViewer3D } = await import('/dist/routeViewer3D.js');
    const tooltip = document.createElement('div');
    document.body.appendChild(tooltip);
    const data = { kind: 'raceway', label: payload, racewayKind: 'tray', allowedGroup: payload, utilizationPct: 42, routeCount: 2 };
    const viewer = { tooltip, canvas: { style: {} }, pick: () => ({ object: { userData: data } }) };
    RouteViewer3D.prototype.handlePointerMove.call(viewer, { offsetX: 5, offsetY: 6 });
    const racewayText = tooltip.textContent;
    const racewayElements = [...tooltip.children].map(element => element.tagName);
    Object.assign(data, { kind: 'route', label: 'Cable A & B', containmentType: payload });
    RouteViewer3D.prototype.handlePointerMove.call(viewer, { offsetX: 5, offsetY: 6 });
    return { racewayText, racewayElements, routeText: tooltip.textContent, smallCount: tooltip.querySelectorAll('small').length, imageCount: tooltip.querySelectorAll('img').length };
  }, payload);
  expect(result.racewayText).toContain(payload);
  expect(result.racewayText).toContain('42% utilized · 2 routes');
  expect(result.racewayElements).toEqual(['SMALL']);
  expect(result.routeText).toBe(`Cable A & B${payload} segment`);
  expect(result.smallCount).toBe(1);
  expect(result.imageCount).toBe(0);
  expect(await page.evaluate(() => window.__importExecuted)).toBeUndefined();
});

test('shared route records keep literal text and highlight/fill actions', async ({ page }) => {
  await page.goto(site.url('404.html'));
  const result = await page.evaluate(async payload => {
    const { renderSharedRouteMetrics } = await import('/src/routing/sharedRoutesView.mjs');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const highlights = [];
    const fills = [];
    const options = { formatPoint: point => point.join(','), onHighlight: index => highlights.push(index), onFill: index => fills.push(index) };
    renderSharedRouteMetrics(container, [{ name: payload, allowed_cable_group: payload, start: [0, 0, 0], end: [10, 0, 0], cables: [payload, 'Cable A & B'], recommendation: 'conduit', trade_size: '2' }], options);
    container.querySelector('li').click();
    container.querySelector('a').click();
    const text = container.textContent;
    const images = container.querySelectorAll('img').length;
    renderSharedRouteMetrics(container, [], options);
    return { text, images, highlights, fills, emptyText: container.textContent };
  }, payload);
  expect(result.text).toContain(payload);
  expect(result.text).toContain('Recommended: 2" Conduit');
  expect(result.images).toBe(0);
  expect(result.highlights).toEqual([0]);
  expect(result.fills).toEqual([0]);
  expect(result.emptyText).toBe('No common field routes detected.');
});

test('cached routing ignores imported metrics HTML and rebuilds shared-route records', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(site.url('optimalRoute.html?e2e=1'));
  await page.locator('#optimal-ready-beacon[data-optimal-ready="1"]').waitFor();
  await page.click('#load-sample-network-btn');
  await page.click('#calculate-route-btn');
  await page.waitForFunction(() => window.dataStore.keys().some(key => key.startsWith('route-')));
  await page.evaluate(payload => {
    const store = window.dataStore;
    const key = store.keys().find(key => key.startsWith('route-'));
    const cache = store.getItem(key);
    cache.metricsHtml = payload;
    cache.sharedRoutes = [{ name: 'Imported corridor & cable', start: [0, 0, 0], end: [10, 0, 0], cables: ['Cable 01'], recommendation: 'tray', tray_size: '12' }];
    store.setItem(key, cache);
  }, payload);
  await page.click('#route-mode-toggle');
  await page.click('#calculate-route-btn');
  await expect(page.locator('#progress-label')).toContainText('cached');
  await expect(page.locator('#metrics')).toContainText('Imported corridor & cable');
  await expect(page.locator('#metrics .shared-route-item')).toHaveCount(1);
  await expect(page.locator('#metrics img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__importExecuted)).toBeUndefined();
});

test('canvas property editing preserves imported point and segment labels literally', async ({ page }) => {
  await page.goto(site.url('404.html'));
  const label = '"><img src=x onerror=window.__importExecuted=true>';
  const result = await page.evaluate(async label => {
    const { initCpLayoutCanvas } = await import('/src/cpLayoutCanvas.js');
    document.body.innerHTML = '<form id="cp-form"></form><section id="cp-layout-canvas-panel"><div id="cp-layout-canvas"></div><div id="cp-element-properties-content"></div></section>';
    const controller = initCpLayoutCanvas({ initialLayout: { geometry: { anodes: [{ x: 100, y: 100, label }], structureSegments: [{ x1: 100, y1: 150, x2: 300, y2: 150, label }] } } });
    const select = selector => {
      document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      return document.querySelector('[data-cp-prop-key="label"]').value;
    };
    const pointLabel = select('[data-drag-kind="anode"]');
    const segmentLabel = select('[data-segment-index="0"]');
    const input = document.querySelector('[data-cp-prop-key="label"]');
    input.value = 'Edited "label" & <text>';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const storedLabel = controller.getState().geometry.structureSegments[0].label;
    controller.destroy();
    return { pointLabel, segmentLabel, storedLabel, imageCount: document.querySelectorAll('#cp-element-properties-content img').length };
  }, label);
  expect(result.pointLabel).toBe(label);
  expect(result.segmentLabel).toBe(label);
  expect(result.storedLabel).toBe('Edited "label" & <text>');
  expect(result.imageCount).toBe(0);
  expect(await page.evaluate(() => window.__importExecuted)).toBeUndefined();
});

test('reopened DC results escape every imported numeric-display string', async ({ page }) => {
  await page.goto(site.url('404.html'));
  await page.evaluate(async () => {
    const { getProjectState, setProjectState } = await import('/projectStorage.js');
    setProjectState({ ...getProjectState(), name: 'Imported result security regression' });
  });
  await page.goto(site.url('dcshortcircuit.html'));
  await page.waitForFunction(() => Boolean(window.dataStore?.setStudies));
  await page.evaluate(async () => {
    const { runDcShortCircuitStudy } = await import('/analysis/dcShortCircuit.mjs');
    const inputs = { studyLabel: 'Battery A & B', batteryVoltageV: 125, batteryInternalResistanceOhm: 0.025, runArcFlash: true, arcDurationMs: 50, workingDistanceMm: 455, devices: [{ tag: 'F1', type: 'fuse', ratedCurrentA: 100, interruptRatingA: 10000 }] };
    window.dataStore.setStudies({ dcShortCircuit: { inputs, result: runDcShortCircuitStudy(inputs) } });
  });
  expect(await page.evaluate(() => window.dataStore.getStudies().dcShortCircuit.inputs.studyLabel)).toBe('Battery A & B');
  await page.reload();
  await expect(page.locator('#results')).toContainText('Battery A & B');
  await expect(page.locator('#results')).toContainText('5,000 A');
  await page.evaluate(payload => {
    const studies = window.dataStore.getStudies();
    const result = studies.dcShortCircuit.result;
    result.faultCurrent.boltedFaultCurrentA = payload;
    result.arcFlash.arcCurrentA = payload;
    result.arcFlash.workingDistanceMm = payload;
    result.protectionCheck[0].ratedCurrentA = payload;
    result.protectionCheck[0].interruptRatingA = payload;
    window.dataStore.setStudies(studies);
  }, payload);
  await page.reload();
  await expect(page.locator('#results')).toContainText(payload);
  expect((await page.locator('#results').textContent()).split(payload)).toHaveLength(6);
  await expect(page.locator('#results img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__importExecuted)).toBeUndefined();
});

test('gist sharing restores legacy application credentials and persists a replacement', async ({ page }) => {
  await page.goto(site.url('404.html'));
  await page.evaluate(() => {
    localStorage.setItem('gistToken', JSON.stringify('existing-gist-test-token'));
    localStorage.setItem('onelineTourDone', 'true');
  });
  const requests = [];
  await page.route('https://api.github.com/gists', async route => {
    requests.push({ authorization: route.request().headers().authorization, body: route.request().postDataJSON() });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ html_url: 'https://gist.github.com/test/mock-gist' }) });
  });
  await page.goto(site.url('oneline.html?e2e=1'));
  await page.locator('body[data-oneline-ready="1"]').waitFor();
  await page.locator('summary.command-menu-trigger', { hasText: /^File/ }).click();
  await page.click('#diagram-share-btn');
  const input = page.locator('input[name="promptDialogValue"]');
  await expect(input).toHaveValue('existing-gist-test-token');
  await input.fill('replacement-gist-test-token');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].authorization).toBe('token replacement-gist-test-token');
  expect(requests[0].body.public).toBe(true);
  expect(typeof requests[0].body.files['oneline.json'].content).toBe('string');
  expect(await page.evaluate(() => localStorage.getItem('gistToken'))).toBe('replacement-gist-test-token');
  await page.reload();
  await page.locator('body[data-oneline-ready="1"]').waitFor();
  await page.locator('summary.command-menu-trigger', { hasText: /^File/ }).click();
  await page.click('#diagram-share-btn');
  await expect(page.locator('input[name="promptDialogValue"]')).toHaveValue('replacement-gist-test-token');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(requests).toHaveLength(1);
});

test('workbook schema names cannot mutate inherited objects before validation', async ({ page }) => {
  await page.goto(site.url('library.html'));
  await expect.poll(() => page.evaluate(() => typeof window.XLSX)).toBe('object');
  const workbook = XLSX.utils.book_new();
  const subtypes = ['ordinary', '__proto__', 'constructor', 'toString'];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subtypes.map(subtype => ({ subtype, label: subtype, category: 'equipment', icon: 'icons/components/UPS.svg', ports: 2 }))), 'Components');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { subtype: '__proto__', field: 'ctrObjectPolluted', type: 'number' },
    { subtype: 'constructor', field: 'ctrFunctionPolluted', type: 'number' },
    { subtype: 'toString', field: 'ctrToStringPolluted', type: 'number' },
    { subtype: 'ordinary', schema: '{"baseline":{"type":"number"}}' },
    { subtype: 'ordinary', field: '__proto__', label: 'Literal field', type: 'string' },
    { subtype: 'ordinary', field: 'constructor', label: 'Another literal field', type: 'string' },
  ]), 'Schema');
  await page.setInputFiles('#library-upload', { name: 'schema-keys.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });
  await expect(page.locator('[data-kind="component-subtype"]').first()).toHaveValue('ordinary');
  const schema = JSON.parse(await page.locator('[data-kind="component-schema"]').first().inputValue());
  expect(Object.hasOwn(schema, '__proto__')).toBe(true);
  expect(schema.__proto__.label).toBe('Literal field');
  expect(schema.baseline.type).toBe('number');
  expect(await page.evaluate(() => [Object.prototype.ctrObjectPolluted, Object.ctrFunctionPolluted, Object.prototype.toString.ctrToStringPolluted])).toEqual([undefined, undefined, undefined]);
});
