import { test, expect } from '@playwright/test';
import fsp from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAGE_CONTRACTS_BY_HREF } from '../src/pageContracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const CONTRACT_HANDOFFS = [
  { label: 'equipment -> loads', from: 'equipmentlist.html', output: 'equipment', to: 'loadlist.html', input: 'equipment' },
  { label: 'loads -> one-line', from: 'loadlist.html', output: 'loadList', to: 'oneline.html', input: 'loadList' },
  { label: 'one-line -> cables', from: 'oneline.html', output: 'oneLineDiagram', to: 'cableschedule.html', input: 'oneLineDiagram' },
  { label: 'cables -> raceways', from: 'cableschedule.html', output: 'cableSchedule', to: 'racewayschedule.html', input: 'cableSchedule' },
  { label: 'raceway trays -> routing', from: 'racewayschedule.html', output: 'traySchedule', to: 'optimalRoute.html', input: 'traySchedule' },
  { label: 'raceway conduits -> routing', from: 'racewayschedule.html', output: 'conduitSchedule', to: 'optimalRoute.html', input: 'conduitSchedule' },
  { label: 'raceway ductbanks -> routing', from: 'racewayschedule.html', output: 'ductbankSchedule', to: 'optimalRoute.html', input: 'ductbankSchedule' },
  { label: 'routing -> deliverables', from: 'optimalRoute.html', output: 'settings.latestRouteResults', to: 'projectreport.html', input: 'settings.latestRouteResults' },
  { label: 'studies -> deliverables', from: 'shortCircuit.html', output: 'studyResults.shortCircuit', to: 'projectreport.html', input: 'studyResults' }
];

function assertContractHandoffs() {
  for (const handoff of CONTRACT_HANDOFFS) {
    const fromContract = PAGE_CONTRACTS_BY_HREF[handoff.from];
    const toContract = PAGE_CONTRACTS_BY_HREF[handoff.to];
    expect(fromContract, `${handoff.label}: missing source contract`).toBeTruthy();
    expect(toContract, `${handoff.label}: missing target contract`).toBeTruthy();
    expect(
      fromContract.outputs.some(output => output.key === handoff.output),
      `${handoff.label}: ${handoff.from} must declare ${handoff.output}`
    ).toBe(true);
    expect(
      toContract.projectInputs.some(input => input.key === handoff.input),
      `${handoff.label}: ${handoff.to} must consume ${handoff.input}`
    ).toBe(true);
  }
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = path.resolve(root, `.${requested}`);
      if (!(filePath === root || filePath.startsWith(root + path.sep))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const body = await fsp.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const type = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    url: file => new URL(file, `http://127.0.0.1:${port}/`).toString(),
    close: () => new Promise(resolve => server.close(resolve))
  };
}

function monitorPage(page, origin) {
  const errors = [];
  const failedResponses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (/Failed to load resource/i.test(message.text())) return;
    errors.push(message.text());
  });
  page.on('response', response => {
    const url = response.url();
    if (!url.startsWith(origin)) return;
    const pathname = new URL(url).pathname;
    if (pathname === '/api/errors' || pathname === '/auth/oidc/login') return;
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${url}`);
  });
  return { errors, failedResponses };
}

async function gotoWorkflowPage(page, server, file) {
  await page.goto(server.url(`${file}?e2e=1`), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.locator('body').waitFor({ state: 'visible' });
}

async function waitForDataStore(page) {
  await page.waitForFunction(() => (
    window.dataStore
    && typeof window.dataStore.getEquipment === 'function'
    && typeof window.dataStore.getItem === 'function'
  ));
}

async function readWorkflowSnapshot(page) {
  await waitForDataStore(page);
  return page.evaluate(() => {
    const ds = window.dataStore;
    const scenario = localStorage.getItem('ctr_current_scenario_v1') || ds.getCurrentScenario() || 'base';
    const readScenarioKey = (key, fallback) => {
      try {
        const raw = localStorage.getItem(`${scenario}:${key}`);
        if (raw !== null && raw !== undefined) return JSON.parse(raw);
      } catch { /* fall back to dataStore below */ }
      if (typeof ds.getItem === 'function') return ds.getItem(key, fallback);
      return fallback;
    };
    const equipment = readScenarioKey('equipment', ds.getEquipment());
    const loads = readScenarioKey('loadList', ds.getLoads());
    const oneLine = readScenarioKey('oneLineDiagram', ds.getOneLine());
    const cables = readScenarioKey('cableSchedule', ds.getCables());
    const trays = readScenarioKey('traySchedule', ds.getTrays());
    const conduits = readScenarioKey('conduitSchedule', ds.getConduits());
    const ductbanks = readScenarioKey('ductbankSchedule', ds.getDuctbanks());
    const routeResults = readScenarioKey('latestRouteResults', null);
    const studies = readScenarioKey('studyResults', ds.getStudies());
    const components = (oneLine?.sheets || []).flatMap(sheet => Array.isArray(sheet.components) ? sheet.components : []);
    const connectionCableTags = components.flatMap(component => (
      Array.isArray(component.connections)
        ? component.connections.map(connection => connection?.cable?.tag).filter(Boolean)
        : []
    ));
    return {
      scenario,
      equipmentTags: equipment.map(row => row.tag || row.id || '').filter(Boolean),
      loadTags: loads.map(row => row.tag || row.id || '').filter(Boolean),
      loadSources: loads.map(row => row.source || '').filter(Boolean),
      oneLineRefs: components.map(component => component.ref || component.label || component.id || '').filter(Boolean),
      connectionCableTags,
      cableTags: cables.map(row => row.tag || row.name || '').filter(Boolean),
      cableRacewayIds: cables.flatMap(row => Array.isArray(row.raceway_ids) ? row.raceway_ids : [row.route_preference]).filter(Boolean),
      trayIds: trays.map(row => row.tray_id || row.id || '').filter(Boolean),
      conduitIds: conduits.map(row => row.conduit_id || row.id || '').filter(Boolean),
      ductbankIds: ductbanks.map(row => row.ductbank_id || row.id || row.tag || '').filter(Boolean),
      routeResultCount: Array.isArray(routeResults?.batchResults) ? routeResults.batchResults.length : 0,
      routedCableTags: Array.isArray(routeResults?.batchResults) ? routeResults.batchResults.map(row => row.cable).filter(Boolean) : [],
      studyKeys: studies && typeof studies === 'object' ? Object.keys(studies) : []
    };
  });
}

test.describe.configure({ timeout: 120000 });

let server;
test.beforeAll(async () => {
  server = await startStaticServer();
});

test.afterAll(async () => {
  await server.close();
});

test('legacy specialist sample hydrates every supporting project surface', async ({ page }) => {
  await gotoWorkflowPage(page, server, 'samplegallery.html');
  await page.locator('[data-sample-id="industrial-plant"] .primary-btn').click();
  await expect(page.locator('#checklist-panel')).toContainText('Guided Workflow: Industrial Plant');

  await waitForDataStore(page);
  const imported = await page.evaluate(() => ({
    equipmentTags: window.dataStore.getEquipment().map(row => row.tag || row.id).filter(Boolean),
    loadTags: window.dataStore.getLoads().map(row => row.tag || row.id).filter(Boolean),
    studyKeys: Object.keys(window.dataStore.getStudies() || {}),
    routeResultCount: window.dataStore.getItem('latestRouteResults', {})?.batchResults?.length || 0,
  }));
  expect(imported.equipmentTags).toEqual(expect.arrayContaining(['XFMR-1', 'MCC-A', 'MOTOR-101']));
  expect(imported.loadTags).toEqual(expect.arrayContaining(['MOTOR-101', 'MOTOR-102', 'MOTOR-103']));
  expect(imported.studyKeys).toEqual(expect.arrayContaining(['arcFlash', 'shortCircuit']));
  expect(imported.routeResultCount).toBe(10);

  await gotoWorkflowPage(page, server, 'equipmentlist.html');
  await expect(page.locator('#equipment-table tbody tr')).toHaveCount(imported.equipmentTags.length);
  await gotoWorkflowPage(page, server, 'loadlist.html');
  await expect(page.locator('#load-table tbody tr')).toHaveCount(3);
});

test('Underground Ductbank checklist loads the sample before opening its route tables', async ({ page }) => {
  await gotoWorkflowPage(page, server, 'samplegallery.html');
  const card = page.locator('[data-sample-id="ductbank-network"]');
  await card.getByRole('button', { name: 'Load Underground Ductbank and show its guided checklist' }).click();
  await expect(page.locator('#checklist-panel')).toContainText('Guided Workflow: Underground Ductbank');

  await page.locator('#checklist-steps a[href="ductbankroute.html"]').click();
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

  await expect(page.locator('#ductbankTag')).toHaveValue('DUCTBANK-DB-01');
  await expect(page.locator('#conduitTable tbody tr')).toHaveCount(4);
  await expect(page.locator('#cableTable tbody tr')).toHaveCount(2);
  await expect(page.locator('#cableTable tbody tr').first().locator('input[name="tag"]')).toHaveValue('UG-CBL-001');
  await expect(page.locator('#cableTable tbody tr').first().locator('input[name="conduit_id"]')).toHaveValue('DB01-COND-1');
});

test('sample project satisfies contract handoffs from equipment through deliverables', async ({ page }) => {
  assertContractHandoffs();
  const monitor = monitorPage(page, server.origin);

  await gotoWorkflowPage(page, server, 'samplegallery.html');
  await page.locator('[data-sample-id="project-workflow-core"] .primary-btn').click();
  await expect(page.locator('#checklist-panel')).toContainText('Guided Workflow: Project Workflow Core');
  await expect.poll(async () => (await readWorkflowSnapshot(page)).scenario).toBe('default');

  const imported = await readWorkflowSnapshot(page);
  expect(imported.equipmentTags).toEqual(expect.arrayContaining(['SWBD-101', 'MCC-101', 'PMP-101']));
  expect(imported.loadTags).toEqual(expect.arrayContaining(['PMP-101', 'LTG-101', 'REC-101']));
  expect(imported.cableTags).toEqual(expect.arrayContaining(['CBL-SWBD-MCC-101', 'CBL-MCC-PMP-101']));
  expect(imported.studyKeys).toEqual(expect.arrayContaining(['demandSchedule', 'shortCircuit']));

  await gotoWorkflowPage(page, server, 'equipmentlist.html');
  await expect(page.locator('#equipment-table tbody tr')).toHaveCount(5);
  const equipment = await readWorkflowSnapshot(page);
  expect(equipment.equipmentTags).toEqual(expect.arrayContaining(['SWBD-101', 'MCC-101', 'XFMR-101', 'LP-101', 'PMP-101']));

  await gotoWorkflowPage(page, server, 'loadlist.html');
  await expect(page.locator('#load-source-list option[value="MCC-101"]')).toHaveCount(1);
  await expect(page.locator('#load-next-action')).toContainText('Continue to One-Line');
  const loads = await readWorkflowSnapshot(page);
  expect(loads.loadSources).toEqual(expect.arrayContaining(['MCC-101', 'LP-101']));
  expect(loads.equipmentTags).toEqual(expect.arrayContaining([...new Set(loads.loadSources)]));

  await gotoWorkflowPage(page, server, 'oneline.html');
  await page.waitForSelector('#oneline-ready-beacon');
  const oneLine = await readWorkflowSnapshot(page);
  expect(oneLine.oneLineRefs).toEqual(expect.arrayContaining(['SWBD-101', 'MCC-101', 'PMP-101', 'XFMR-101', 'LP-101']));
  expect(oneLine.connectionCableTags).toEqual(expect.arrayContaining(['CBL-SWBD-MCC-101', 'CBL-MCC-PMP-101', 'CBL-SWBD-XFMR-101', 'CBL-XFMR-LP-101']));
  expect(oneLine.loadTags).toContain('PMP-101');

  await gotoWorkflowPage(page, server, 'cableschedule.html');
  await expect(page.locator('[data-metric="ready"]')).toContainText('4');
  await expect(page.locator('[data-metric="routing-ready"]')).toContainText('4');
  const cables = await readWorkflowSnapshot(page);
  expect(cables.cableTags).toEqual(expect.arrayContaining(oneLine.connectionCableTags));
  expect(cables.cableRacewayIds).toEqual(expect.arrayContaining(['TR-PWR-101', 'CND-PMP-101']));

  await gotoWorkflowPage(page, server, 'racewayschedule.html');
  await expect(page.locator('#raceway-total-count')).toContainText('4');
  await expect(page.locator('#raceway-assigned-count')).toContainText('3');
  await expect(page.locator('#raceway-missing-geometry-count')).toContainText('0');
  const raceways = await readWorkflowSnapshot(page);
  expect(raceways.trayIds).toContain('TR-PWR-101');
  expect(raceways.conduitIds).toContain('CND-PMP-101');
  expect(raceways.ductbankIds).toContain('DB-101');
  expect([...raceways.trayIds, ...raceways.conduitIds]).toEqual(expect.arrayContaining(cables.cableRacewayIds));

  await gotoWorkflowPage(page, server, 'optimalRoute.html');
  await expect(page.locator('#route-readiness-panel')).toContainText('Schedule-ready');
  await expect(page.locator('#route-readiness-panel')).toContainText('Routing-ready');
  const routing = await readWorkflowSnapshot(page);
  expect(routing.routeResultCount).toBe(4);
  expect(routing.routedCableTags).toEqual(expect.arrayContaining(cables.cableTags));

  await gotoWorkflowPage(page, server, 'shortCircuit.html');
  await expect(page.locator('#shortcircuit-form')).toBeVisible();
  const studies = await readWorkflowSnapshot(page);
  expect(studies.studyKeys).toEqual(expect.arrayContaining(['shortCircuit']));

  await gotoWorkflowPage(page, server, 'projectreport.html');
  await expect(page.locator('#rpt-deliverable-readiness')).toContainText('4 route result');
  await expect(page.locator('#rpt-deliverable-readiness')).toContainText('1 spool');
  await page.locator('#rpt-deliverable-readiness [data-action="generate-report-preview"]').evaluate(button => button.click());
  await expect(page.locator('#report-preview #rpt-shortCircuit')).toContainText('Short Circuit Analysis');
  await expect(page.locator('#report-preview')).toContainText('Cable Schedule');

  expect(monitor.failedResponses).toEqual([]);
  expect(monitor.errors).toEqual([]);
});
