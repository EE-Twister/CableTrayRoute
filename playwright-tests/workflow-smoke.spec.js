import { test, expect } from '@playwright/test';
import fs from 'fs';
import fsp from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const navSource = fs.readFileSync(path.join(root, 'src/components/navigation.js'), 'utf8');
const navPages = [...new Set([...navSource.matchAll(/href:\s*'([^']+\.html)'/g)].map(match => match[1]))];
const workflowPages = [
  'workflowdashboard.html',
  'equipmentlist.html',
  'loadlist.html',
  'oneline.html',
  'cableschedule.html',
  'racewayschedule.html',
  'cabletrayfill.html',
  'conduitfill.html',
  'ductbankroute.html',
  'optimalRoute.html',
  'pullcards.html',
  'spoolsheets.html',
  'projectreport.html'
];

function seedDeliverableWorkflow() {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('base:cableSchedule', JSON.stringify([
    {
      tag: 'CBL-1',
      name: 'CBL-1',
      from_tag: 'SWBD-101',
      to_tag: 'MCC-101',
      conductor_size: '#4 AWG',
      length: 80,
      length_ft: 80,
      raceway_ids: ['TR-1'],
      route_preference: 'TR-1',
      cable_type: 'Power',
      conductors: 3,
      diameter: 0.8,
      weight: 1.2
    },
    {
      tag: 'CBL-2',
      name: 'CBL-2',
      from_tag: 'MCC-101',
      to_tag: 'PMP-101',
      conductor_size: '#8 AWG',
      length: 70,
      length_ft: 70,
      raceway_ids: ['TR-1'],
      route_preference: 'TR-1',
      cable_type: 'Power',
      conductors: 3,
      diameter: 0.6,
      weight: 0.9
    }
  ]));
  localStorage.setItem('base:traySchedule', JSON.stringify([
    {
      tray_id: 'TR-1',
      start_x: 0,
      start_y: 0,
      start_z: 12,
      end_x: 80,
      end_y: 0,
      end_z: 12,
      inside_width: 12,
      tray_depth: 4,
      length_ft: 80
    }
  ]));
  localStorage.setItem('base:conduitSchedule', JSON.stringify([]));
  localStorage.setItem('base:ductbankSchedule', JSON.stringify([]));
  localStorage.setItem('base:studyResults', JSON.stringify({
    demandSchedule: { status: 'Run', totalDemandKva: 25 }
  }));
  localStorage.setItem('base:latestRouteResults', JSON.stringify({
    source: 'playwright',
    updatedAt: '2026-05-01T12:00:00.000Z',
    batchResults: [
      {
        cable: 'CBL-1',
        status: 'Routed',
        total_length: 80,
        breakdown: [{ tray_id: 'TR-1', length: 80, start: [0, 0, 12], end: [80, 0, 12] }],
        route_segments: [{ type: 'tray', tray_id: 'TR-1', length: 80, start: [0, 0, 12], end: [80, 0, 12] }]
      },
      {
        cable: 'CBL-2',
        status: 'Routed',
        total_length: 70,
        breakdown: [{ tray_id: 'TR-1', length: 70, start: [0, 0, 12], end: [70, 0, 12] }],
        route_segments: [{ type: 'tray', tray_id: 'TR-1', length: 70, start: [0, 0, 12], end: [70, 0, 12] }]
      }
    ]
  }));
  localStorage.setItem('base:reportSnapshots', JSON.stringify({
    'smoke-report': { id: 'smoke-report', createdAt: '2026-05-01T12:30:00.000Z', sections: ['Cable Schedule'] }
  }));
  localStorage.setItem('base:lifecyclePackages', JSON.stringify([
    { id: 'smoke-ifr', revisionLabel: 'IFR', status: 'Issued for Review', createdAt: '2026-05-01T12:35:00.000Z' }
  ]));
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
    if (/downloadable font: download failed/i.test(message.text())
      && /fonts\.gstatic\.com/i.test(message.text())) return;
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

async function expectHealthyPage(page, server, file) {
  const monitor = monitorPage(page, server.origin);
  await page.goto(server.url(`${file}?e2e=1&e2e_reset=1`), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.locator('body').waitFor({ state: 'visible' });

  const bodyText = (await page.locator('body').innerText()).trim();
  expect(bodyText.length, `${file} should render meaningful text`).toBeGreaterThan(20);

  const style = await page.evaluate(() => {
    const computed = getComputedStyle(document.body);
    const nav = document.querySelector('.top-nav');
    return {
      fontFamily: computed.fontFamily,
      navDisplay: nav ? getComputedStyle(nav).display : ''
    };
  });
  expect(style.fontFamily, `${file} should have CSS-applied font styles`).not.toBe('');
  if (await page.locator('.top-nav').count()) {
    expect(style.navDisplay, `${file} top nav should not be unstyled`).not.toBe('inline');
  }

  const visibleFailureText = await page.evaluate(() => {
    const matches = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue || '';
      const parent = node.parentElement;
      if (/failed to load/i.test(text) && parent) {
        const style = getComputedStyle(parent);
        const visible = style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0
          && !!(parent.offsetParent || parent.getClientRects().length);
        if (visible) matches.push(text.trim());
      }
      node = walker.nextNode();
    }
    return matches;
  });
  expect(visibleFailureText, `${file} should not show failed-load banners`).toEqual([]);
  expect(monitor.failedResponses, `${file} should not have missing same-origin assets`).toEqual([]);
  expect(monitor.errors, `${file} should not have critical console/page errors`).toEqual([]);
}

test.describe.configure({ timeout: 120000 });

let server;
test.beforeAll(async () => {
  server = await startStaticServer();
});

test.afterAll(async () => {
  await server.close();
});

test('dashboard shows the real project workflow order', async ({ page }) => {
  await page.goto(server.url('workflowdashboard.html?e2e=1&e2e_reset=1'), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.guided-workflow-step a', { state: 'attached' });
  await expect(page.locator('.dashboard-guided-details')).not.toHaveAttribute('open', '');
  const steps = await page.locator('.guided-workflow-step a').allTextContents();
  expect(steps.slice(0, 8)).toEqual([
    '1. Equipment',
    '2. Loads',
    '3. One-Line',
    '4. Cables',
    '5. Raceways',
    '6. Fill / Routing',
    '7. Studies',
    '8. Deliverables'
  ]);
  await expect(page.locator('#dashboard-next-action-strip')).toContainText('Add equipment records');
});

test('equipment list supports add modal, starter records, and workflow navigation', async ({ page }) => {
  await page.goto(server.url('equipmentlist.html?e2e=1&e2e_reset=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#equipment-empty-guide')).toBeVisible();
  await page.getByRole('button', { name: 'Add Equipment' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add Equipment' });
  await dialog.getByLabel('Equipment Tag').fill('SWBD-101');
  await dialog.getByLabel('Voltage').fill('480');
  await dialog.getByRole('button', { name: 'Add Equipment' }).click();
  await expect(page.locator('#equipment-table input[name="tag"]').first()).toHaveValue('SWBD-101');
  await expect(page.locator('#equipment-summary-cards')).toContainText('Equipment');
  await page.getByRole('button', { name: 'Load Starter Equipment' }).first().click();
  await expect(page.locator('#equipment-table tbody tr')).toHaveCount(5);
  await expect(page.locator('.equipment-step-nav')).toContainText('Next: Load List');
});

test('load list links source choices to equipment and points to one-line when ready', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:equipment', JSON.stringify([{ tag: 'SWBD-101', voltage: '480', manufacturer: 'Square D' }]));
    localStorage.setItem('base:loadList', JSON.stringify([
      { source: 'SWBD-101', tag: 'PMP-101', description: 'Pump motor', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3' }
    ]));
  });
  await page.goto(server.url('loadlist.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#load-source-list option[value="SWBD-101"]')).toHaveCount(1);
  await expect(page.locator('#load-next-action')).toContainText('Open One-Line');
  await expect(page.locator('.step-nav')).toContainText('Equipment List');
});

test('cable schedule separates schedule-ready and routing-ready states', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:equipment', JSON.stringify([{ tag: 'SWBD-101' }, { tag: 'MCC-101' }]));
    localStorage.setItem('base:loadList', JSON.stringify([{ tag: 'PMP-101', source: 'MCC-101' }]));
    localStorage.setItem('base:panelSchedule', JSON.stringify([{ panel_id: 'PNL-L1' }]));
    localStorage.setItem('base:cableSchedule', JSON.stringify([
      { tag: 'CBL-1', from_tag: 'SWBD-101', to_tag: 'MCC-101', conductor_size: '#4 AWG', length: 80, raceway_ids: ['TR-1'] },
      { tag: 'CBL-2', from_tag: 'MCC-101', to_tag: 'PMP-101', conductor_size: '#8 AWG', length: 60 },
      { tag: 'CBL-3', from_tag: '', to_tag: 'PNL-L1', conductor_size: '', length: '' }
    ]));
  });
  await page.goto(server.url('cableschedule.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-metric="ready"]')).toContainText('2');
  await expect(page.locator('[data-metric="routing-ready"]')).toContainText('1');
  await expect(page.locator('[data-metric="missing-raceway"]')).toContainText('1');
  await expect(page.locator('[data-metric="missing-from-to"]')).toContainText('1');
  await expect(page.locator('#cable-workflow-next-action')).toContainText('Finish schedule-ready cable fields');
  await expect(page.locator('.step-nav')).toContainText('Raceway Schedule');
});

test('raceway schedule shows readiness diagnostics and next action', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:cableSchedule', JSON.stringify([
      { tag: 'CBL-1', from_tag: 'SWBD-101', to_tag: 'MCC-101', conductor_size: '#4 AWG', length: 80, raceway_ids: ['TR-1'] }
    ]));
    localStorage.setItem('base:traySchedule', JSON.stringify([
      { tray_id: 'TR-1', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0, inside_width: 12, tray_depth: 4 },
      { tray_id: 'TR-2', start_x: '', start_y: '', start_z: '', end_x: '', end_y: '', end_z: '', inside_width: 12, tray_depth: 4 }
    ]));
    localStorage.setItem('base:conduitSchedule', JSON.stringify([]));
    localStorage.setItem('base:ductbankSchedule', JSON.stringify([]));
  });
  await page.goto(server.url('racewayschedule.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#raceway-total-count')).toContainText('2');
  await expect(page.locator('#raceway-assigned-count')).toContainText('1');
  await expect(page.locator('#raceway-missing-geometry-count')).toContainText('1');
  await expect(page.locator('#raceway-next-action')).toContainText('Complete raceway geometry');
  await expect(page.locator('.step-nav')).toContainText('Fill / Routing');
});

test('optimal route explains routing readiness and invalid assignments', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:cableSchedule', JSON.stringify([
      { tag: 'CBL-1', from_tag: 'SWBD-101', to_tag: 'MCC-101', conductor_size: '#4 AWG', length: 80, raceway_ids: ['TR-1'], start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0 },
      { tag: 'CBL-2', from_tag: 'SWBD-101', to_tag: 'MCC-102', conductor_size: '#8 AWG', length: 65, raceway_ids: ['MISSING'], start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0 }
    ]));
    localStorage.setItem('base:traySchedule', JSON.stringify([
      { tray_id: 'TR-1', start_x: 0, start_y: 0, start_z: 0, end_x: 30, end_y: 0, end_z: 0, inside_width: 12, tray_depth: 4 }
    ]));
    localStorage.setItem('base:conduitSchedule', JSON.stringify([]));
    localStorage.setItem('base:ductbankSchedule', JSON.stringify([
      {
        id: 'DB-1',
        tag: 'DB-1',
        from: 'MH-1',
        to: 'MH-2',
        start_x: 0,
        start_y: 4,
        start_z: -3,
        end_x: 30,
        end_y: 4,
        end_z: -3,
        conduits: [
          { conduit_id: 'C1', type: 'RMC', trade_size: '2', start_x: 0, start_y: 4, start_z: -3, end_x: 30, end_y: 4, end_z: -3 }
        ]
      }
    ]));
  });
  await page.goto(server.url('optimalRoute.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#route-readiness-panel')).toContainText('Schedule-ready');
  await expect(page.locator('#route-readiness-panel')).toContainText('Routing-ready');
  await expect(page.locator('#route-readiness-panel')).toContainText('Invalid assignments');
  await expect(page.locator('#route-readiness-actions')).toContainText('Resolve missing raceway references');
  await expect(page.locator('#route-readiness-actions')).toContainText('CBL-2 references MISSING');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('base:cableSchedule') || '[]').length)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('base:traySchedule') || '[]').length)).toBe(1);
});

test('fill pages show project handoff context', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:traySchedule', JSON.stringify([
      { tray_id: 'TR-1', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 12, tray_depth: 4 }
    ]));
    localStorage.setItem('base:conduitSchedule', JSON.stringify([
      { conduit_id: 'C-1', type: 'RMC', trade_size: '2', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0 }
    ]));
    localStorage.setItem('base:ductbankSchedule', JSON.stringify([]));
    localStorage.setItem('base:cableSchedule', JSON.stringify([
      { tag: 'CBL-1', from_tag: 'SWBD-101', to_tag: 'MCC-101', conductor_size: '#4 AWG', length: 80, raceway_ids: ['TR-1'] }
    ]));
    localStorage.setItem('base:trayFillData', JSON.stringify({
      tray: { tray_id: 'TR-1', width: 12, height: 4 },
      cables: [{ tag: 'CBL-1', cable_type: 'Power', conductors: 3, conductor_size: '#4 AWG', cable_od: 0.8, weight: 1.2 }]
    }));
    localStorage.setItem('base:conduitFillData', JSON.stringify({
      type: 'RMC',
      tradeSize: '2',
      cables: [{ tag: 'CBL-1', cable_type: 'Power', conductors: 3, conductor_size: '#4 AWG', cable_od: 0.8 }]
    }));
  });
  await page.goto(server.url('cabletrayfill.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tray-fill-handoff')).toContainText('Reviewing TR-1');
  await expect(page.locator('#tray-fill-handoff')).toContainText('Cable Schedule');
  await page.goto(server.url('conduitfill.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#conduit-fill-handoff')).toContainText('Reviewing RMC 2');
  await expect(page.locator('#conduit-fill-handoff')).toContainText('Routing');
});

test('pull cards load saved project route results', async ({ page }) => {
  await page.addInitScript(seedDeliverableWorkflow);
  await page.goto(server.url('pullcards.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#pull-deliverable-handoff')).toContainText('Pull-card inputs are available');
  await expect(page.locator('#pull-deliverable-handoff')).toContainText('2 routed cable');
  await page.locator('#pull-deliverable-handoff [data-action="load-project-routes"]').click();
  await expect(page.locator('#pullTableSection')).toBeVisible();
  await expect(page.locator('#pullTable tbody tr')).toHaveCount(1);
});

test('spool sheets show geometry handoff and generate output', async ({ page }) => {
  await page.addInitScript(seedDeliverableWorkflow);
  await page.goto(server.url('spoolsheets.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#spool-deliverable-handoff')).toContainText('Spool sheet inputs are ready');
  await expect(page.locator('#spool-deliverable-handoff')).toContainText('2 routed cable result');
  await page.locator('#spool-deliverable-handoff [data-action="generate-spools"]').click();
  await expect(page.locator('#results')).toContainText('Spool');
});

test('project report exposes deliverable readiness before preview', async ({ page }) => {
  await page.addInitScript(seedDeliverableWorkflow);
  await page.goto(server.url('projectreport.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#rpt-deliverable-readiness')).toContainText('report section(s) have current project content');
  await expect(page.locator('#rpt-deliverable-readiness')).toContainText('2 route result');
  await expect(page.locator('#rpt-deliverable-readiness')).toContainText('1 spool');
  await page.locator('#rpt-generate-btn').click();
  await expect(page.locator('#report-preview #rpt-cover')).toBeVisible();
});

test('ductbank route exposes a next action for empty underground workflow', async ({ page }) => {
  await page.goto(server.url('ductbankroute.html?e2e=1&e2e_reset=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ductbank-next-action')).toContainText('Add ductbank conduits');
  await expect(page.locator('#ductbank-next-action')).toContainText('Load Complete Example');
});

test('workflow dashboard exposes next action, blockers, and health metrics', async ({ page }) => {
  await page.goto(server.url('workflowdashboard.html?e2e=1&e2e_reset=1'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#dashboard-next-action-strip')).toContainText('Next action');
  await expect(page.locator('#dashboard-next-action-strip')).toContainText('Add equipment records');
  await expect(page.locator('#dashboard-blockers')).not.toContainText('Add equipment records');
  await expect(page.locator('#dashboard-health')).toContainText('Cable Schedule');
  await expect(page.locator('[data-workflow-mode-panel]')).toHaveCount(0);
});

test('workflow guidance stays compact and subordinate to the page workspace', async ({ page }) => {
  await page.goto(server.url('equipmentlist.html?e2e=1&e2e_reset=1'), { waitUntil: 'domcontentloaded' });

  const workflowNav = page.locator('.workflow-step-nav');
  await expect(workflowNav).toContainText('Step 1 of 8 · Equipment List');
  await expect(workflowNav.locator('.workflow-step-nav-status')).toHaveAttribute('aria-label', 'Project status: Missing inputs');
  await expect(workflowNav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', 'workflowdashboard.html');
  await expect(page.locator('[data-workflow-mode-panel]')).toHaveCount(0);

  const navHeight = await workflowNav.evaluate(element => element.getBoundingClientRect().height);
  expect(navHeight).toBeLessThanOrEqual(72);
});

test('sample gallery lists the full project workflow sample', async ({ page }) => {
  await page.goto(server.url('samplegallery.html?e2e=1&e2e_reset=1'), { waitUntil: 'domcontentloaded' });
  const sampleCards = page.locator('[data-sample-id]');
  await expect.poll(() => sampleCards.count()).toBeGreaterThanOrEqual(10);
  const sampleImages = page.locator('[data-sample-id] .sample-card__media img');
  await expect(sampleImages).toHaveCount(10);
  const imageHandles = await sampleImages.elementHandles();
  for (const image of imageHandles) {
    await image.scrollIntoViewIfNeeded();
  }
  await sampleImages.evaluateAll(images => Promise.all(images.map(img => {
    img.loading = 'eager';
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  })));
  await expect.poll(async () => sampleImages.evaluateAll(images => images.every(img => img.complete && img.naturalWidth >= 900 && img.naturalHeight >= 500))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Project Workflow Core' })).toBeVisible();
  await expect(page.locator('[data-sample-id="project-workflow-core"]')).toContainText('equipment');
  await expect(page.getByRole('heading', { name: 'Commercial Office Fitout' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Water Treatment Pump Station' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'EV Charging Depot' })).toBeVisible();
  await page.locator('[data-sample-id="commercial-office-fitout"] .primary-btn').click();
  await expect(page.locator('#checklist-panel')).toContainText('Guided Workflow: Commercial Office Fitout');
  await expect(page.locator('[data-sample-id="commercial-office-fitout"]')).toHaveClass(/sample-card--selected/);
});

test('one-line loads styled assets and opens reconcile preview', async ({ page }) => {
  const diagram = {
    activeSheet: 0,
    sheets: [{
      name: 'Smoke',
      components: [
        { id: 'eq-1', ref: 'MCC-1', label: 'MCC-1', type: 'equipment', subtype: 'switchgear', x: 120, y: 120, connections: [{ target: 'load-1' }] },
        { id: 'load-1', ref: 'MTR-1', label: 'MTR-1', type: 'load', subtype: 'motor_load', x: 360, y: 120, connections: [] }
      ],
      connections: []
    }]
  };
  await page.addInitScript(initDiagram => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:oneLineDiagram', JSON.stringify(initDiagram));
    localStorage.setItem('onelineTourDone', 'true');
  }, diagram);

  await page.goto(server.url('oneline.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oneline-ready-beacon');
  await page.locator('#reconcile-schedules-btn').evaluate(el => { const menu = el.closest('details'); if (menu) menu.open = true; });
  await expect(page.locator('#reconcile-schedules-btn')).toBeVisible();
  await expect(page.locator('#palette')).toBeVisible();
  await expect(page.locator('#sources-section')).toBeAttached();
  await expect(page.locator('#component-library-banner')).toBeHidden();
  await page.locator('#reconcile-schedules-btn').evaluate(el => {
    const menu = el.closest('details');
    if (menu) menu.open = true;
    el.click();
  });
  const dialog = page.getByRole('dialog', { name: 'Reconcile Schedules' });
  await expect(dialog).toContainText('Equipment');
  await expect(dialog).toContainText('Loads');
});

for (const file of workflowPages) {
  test(`workflow smoke: ${file}`, async ({ page }) => {
    await expectHealthyPage(page, server, file);
  });
}

for (const file of navPages) {
  test(`nav smoke: ${file}`, async ({ page }) => {
    await expectHealthyPage(page, server, file);
  });
}
