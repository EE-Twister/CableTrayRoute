import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  PERFORMANCE_BUDGETS,
  evaluatePerformanceReport,
} from '../src/performance/performanceContracts.js';
import {
  ROUTE_STARTUP_CONTRACTS,
  evaluateRouteStartupProfiles,
} from '../src/performance/routeStartupContracts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'output', 'playwright', 'performance');
const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--no-enforce');
const configuredChannel = process.env.CTR_PLAYWRIGHT_CHANNEL?.trim();
const channel = configuredChannel || (process.platform === 'win32' ? 'msedge' : '');

function pageUrl(relativePath) {
  const url = pathToFileURL(path.join(ROOT, relativePath));
  url.searchParams.set('e2e', '1');
  url.searchParams.set('perf', '1');
  return url.href;
}

function latestMeasurement(measurements, name) {
  return [...measurements].reverse().find(measurement => measurement.name === name);
}

async function installProfiler(page) {
  await page.addInitScript(() => {
    const profile = {
      startedAt: performance.now(),
      longTasks: [],
      dom: { batches: 0, addedNodes: 0, removedNodes: 0, attributeChanges: 0, textChanges: 0 },
      storageReads: { total: 0, byKey: {} },
    };
    window.__CTR_PROFILE__ = profile;

    try {
      const nativeGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function profiledGetItem(key) {
        const normalizedKey = String(key);
        profile.storageReads.total += 1;
        profile.storageReads.byKey[normalizedKey] = (profile.storageReads.byKey[normalizedKey] || 0) + 1;
        return nativeGetItem.call(this, key);
      };
    } catch { /* Storage instrumentation is diagnostic and best-effort. */ }

    try {
      const longTaskObserver = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => profile.longTasks.push({
          startTime: entry.startTime,
          durationMs: entry.duration,
        }));
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch { /* Long Task API is not available in every browser. */ }

    const startDomObserver = () => {
      if (!document.documentElement) return;
      const mutationObserver = new MutationObserver(records => {
        profile.dom.batches += 1;
        records.forEach(record => {
          profile.dom.addedNodes += record.addedNodes?.length || 0;
          profile.dom.removedNodes += record.removedNodes?.length || 0;
          if (record.type === 'attributes') profile.dom.attributeChanges += 1;
          if (record.type === 'characterData') profile.dom.textChanges += 1;
        });
      });
      mutationObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    };
    if (document.documentElement) startDomObserver();
    else document.addEventListener('DOMContentLoaded', startDomObserver, { once: true });
  });
}

async function profileSnapshot(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const slowResources = performance.getEntriesByType('resource')
      .map(entry => ({
        name: entry.name.split('/').pop()?.split('?')[0] || entry.name,
        initiatorType: entry.initiatorType,
        startTime: entry.startTime,
        durationMs: entry.duration,
        transferSize: entry.transferSize,
      }))
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 12);
    return {
      now: performance.now(),
      elementCount: document.querySelectorAll('*').length,
      longTaskCount: window.__CTR_PROFILE__?.longTasks.length || 0,
      navigation: navigation ? {
        domInteractive: navigation.domInteractive,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
      } : {},
      slowResources,
      dom: { ...(window.__CTR_PROFILE__?.dom || {}) },
      storageReads: {
        total: window.__CTR_PROFILE__?.storageReads.total || 0,
        byKey: { ...(window.__CTR_PROFILE__?.storageReads.byKey || {}) },
      },
    };
  });
}

function profileDelta(name, start, end, allLongTasks) {
  const byKey = {};
  Object.entries(end.storageReads.byKey).forEach(([key, count]) => {
    const delta = count - (start.storageReads.byKey[key] || 0);
    if (delta > 0) byKey[key] = delta;
  });
  const dom = {};
  Object.entries(end.dom).forEach(([key, count]) => {
    dom[key] = count - (start.dom[key] || 0);
  });
  const longTasks = allLongTasks.slice(start.longTaskCount, end.longTaskCount);
  return {
    name,
    durationMs: end.now - start.now,
    elementDelta: end.elementCount - (start.elementCount || 0),
    longTasks,
    longTaskTotalMs: longTasks.reduce((sum, task) => sum + task.durationMs, 0),
    navigation: end.navigation,
    slowResources: end.slowResources,
    dom,
    storageReads: {
      total: end.storageReads.total - start.storageReads.total,
      byKey: Object.fromEntries(Object.entries(byKey).sort((a, b) => b[1] - a[1])),
    },
  };
}

async function readLongTasks(page) {
  return page.evaluate(() => window.__CTR_PROFILE__?.longTasks || []);
}

async function readMeasurements(page) {
  return page.evaluate(() => window.__CTR_PERFORMANCE__?.measurements || []);
}

async function measureRoutingAndImport(browser, project) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installProfiler(page);
  await page.goto(pageUrl('optimalRoute.html'));
  await page.locator('#optimal-ready-beacon[data-optimal-ready="1"]').waitFor({ timeout: 30000 });

  const startup = latestMeasurement(await readMeasurements(page), 'ctr.startup');
  const startupEnd = await profileSnapshot(page);
  const importStart = startupEnd;
  const imported = await page.evaluate(async projectData => {
    const dataStore = await import(`./dataStore.mjs?perf=${Date.now()}`);
    return dataStore.importProject(projectData);
  }, project);
  if (!imported) {
    throw new Error(`Project performance fixture failed to import: ${await page.evaluate(() => window.dataStore.getLastProjectImportError())}`);
  }
  const projectImport = latestMeasurement(await readMeasurements(page), 'ctr.project-import');
  const importEnd = await profileSnapshot(page);

  await page.click('#load-large-facility-btn');
  await page.waitForFunction(() => document.querySelectorAll('#cable-list-container tbody tr').length >= 200, null, { timeout: 30000 });
  const routingStart = await profileSnapshot(page);
  await page.click('#calculate-route-btn');
  await page.waitForFunction(
    () => window.__CTR_PERFORMANCE__?.measurements?.some(measurement => measurement.name === 'ctr.routing-recalculation'),
    null,
    { timeout: 120000 },
  );
  const routing = latestMeasurement(await readMeasurements(page), 'ctr.routing-recalculation');
  const routingEnd = await profileSnapshot(page);
  const longTasks = await readLongTasks(page);
  const profiles = [
    profileDelta('startup:optimal-route', {
      now: 0,
      longTaskCount: 0,
      dom: {},
      storageReads: { total: 0, byKey: {} },
    }, startupEnd, longTasks),
    profileDelta('project-import', importStart, importEnd, longTasks),
    profileDelta('routing-recalculation', routingStart, routingEnd, longTasks),
  ];
  await page.close();
  return { measurements: [startup, projectImport, routing].filter(Boolean), profiles };
}

async function measureOneLine(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installProfiler(page);
  await page.goto(pageUrl('oneline.html'));
  await page.locator('#oneline-ready-beacon[data-oneline-ready="1"]').waitFor({ timeout: 30000 });
  const startup = latestMeasurement(await readMeasurements(page), 'ctr.startup');
  const priorCount = (await readMeasurements(page)).filter(measurement => measurement.name === 'ctr.oneline-render').length;
  const startupEnd = await profileSnapshot(page);
  const renderStart = startupEnd;

  await page.evaluate(() => {
    const componentCount = 160;
    const components = Array.from({ length: componentCount }, (_, index) => ({
      id: `perf-${index}`,
      type: index === 0 ? 'utility_source' : 'load',
      subtype: index === 0 ? 'utility_source_utility' : 'load_Generic',
      x: 60 + (index % 16) * 100,
      y: 40 + Math.floor(index / 16) * 95,
      width: 64,
      height: 64,
      label: `Performance ${index + 1}`,
      volts: 480,
      connections: index < componentCount - 1 ? [{ target: `perf-${index + 1}` }] : [],
    }));
    const connections = Array.from({ length: componentCount - 1 }, (_, index) => ({
      source: `perf-${index}`,
      target: `perf-${index + 1}`,
    }));
    window.dataStore.setOneLine({
      activeSheet: 0,
      sheets: [{ name: 'Performance Fixture', components, connections }],
    });
    document.dispatchEvent(new CustomEvent('ctr:remote-applied'));
  });

  await page.waitForFunction(
    expected => (window.__CTR_PERFORMANCE__?.measurements || [])
      .filter(measurement => measurement.name === 'ctr.oneline-render').length > expected,
    priorCount,
    { timeout: 30000 },
  );
  const oneLine = latestMeasurement(await readMeasurements(page), 'ctr.oneline-render');
  const renderEnd = await profileSnapshot(page);
  const longTasks = await readLongTasks(page);
  const profiles = [
    profileDelta('startup:oneline', {
      now: 0,
      longTaskCount: 0,
      dom: {},
      storageReads: { total: 0, byKey: {} },
    }, startupEnd, longTasks),
    profileDelta('oneline-render', renderStart, renderEnd, longTasks),
  ];
  await page.close();
  return { measurements: [startup, oneLine].filter(Boolean), profiles };
}

async function measureTcc(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installProfiler(page);
  const deviceIds = [
    'abb_tmax_160',
    'siemens_3va_125',
    'schneider_nsx100',
    'bussmann_lpsrksp_400',
    'mersen_trs200r',
    'eaton_seriesC_100',
    'mitsubishi_ws_225',
    'iec_ni_relay',
  ];
  await page.goto(pageUrl('tcc.html'));
  await page.waitForLoadState('networkidle');
  await page.evaluate(ids => window.dataStore.setItem('tccSettings', {
    devices: ids,
    settings: {},
    componentOverrides: {},
  }), deviceIds);
  await page.reload();
  await page.waitForLoadState('networkidle');
  const start = await profileSnapshot(page);
  const priorCount = (await readMeasurements(page)).filter(measurement => measurement.name === 'ctr.tcc-plot').length;
  await page.click('#plot-btn');
  await page.waitForFunction(
    expected => (window.__CTR_PERFORMANCE__?.measurements || [])
      .filter(measurement => measurement.name === 'ctr.tcc-plot').length > expected,
    priorCount,
    { timeout: 30000 },
  );
  const end = await profileSnapshot(page);
  const measurements = await readMeasurements(page);
  const longTasks = await readLongTasks(page);
  const profile = profileDelta('tcc-plot', start, end, longTasks);
  const measurement = latestMeasurement(measurements, 'ctr.tcc-plot');
  await page.close();
  return { measurements: [measurement].filter(Boolean), profiles: [profile] };
}

async function measureRouteStartups(browser) {
  const profiles = [];
  for (const route of Object.keys(ROUTE_STARTUP_CONTRACTS)) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(pageUrl(route), { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    const readyMs = await page.evaluate(() => performance.now());
    profiles.push({ route, readyMs, requests });
    await page.close();
  }
  return profiles;
}

async function main() {
  const project = JSON.parse(await fs.readFile(path.join(ROOT, 'samples', 'project-workflow-core.json'), 'utf8'));
  delete project.id;
  delete project.title;
  const launchOptions = {
    headless: true,
    args: ['--allow-file-access-from-files'],
    ...(channel ? { channel } : {}),
  };
  const browser = await chromium.launch(launchOptions);
  let measurements;
  let profiles;
  let routeStartups;
  try {
    const routingAndImport = await measureRoutingAndImport(browser, project);
    const oneLine = await measureOneLine(browser);
    const tcc = await measureTcc(browser);
    measurements = [...routingAndImport.measurements, ...oneLine.measurements, ...tcc.measurements];
    profiles = [...routingAndImport.profiles, ...oneLine.profiles, ...tcc.profiles];
    routeStartups = await measureRouteStartups(browser);
  } finally {
    await browser.close();
  }

  const evaluations = evaluatePerformanceReport(measurements);
  const routeStartupEvaluations = evaluateRouteStartupProfiles(routeStartups);
  const report = {
    generatedAt: new Date().toISOString(),
    browser: channel || 'chromium',
    budgets: PERFORMANCE_BUDGETS,
    measurements,
    profiles,
    evaluations,
    routeStartupBudgets: ROUTE_STARTUP_CONTRACTS,
    routeStartups,
    routeStartupEvaluations,
    passed: evaluations.every(evaluation => evaluation.passed)
      && routeStartupEvaluations.every(evaluation => evaluation.passed),
  };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'performance-report.json');
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  evaluations.forEach(evaluation => {
    const status = evaluation.passed ? 'PASS' : 'FAIL';
    console.log(`[perf] ${status} ${evaluation.name}: ${evaluation.durationMs.toFixed(1)}ms / ${evaluation.maxMs}ms`);
  });
  routeStartupEvaluations.forEach(evaluation => {
    const status = evaluation.passed ? 'PASS' : 'FAIL';
    const details = evaluation.passed
      ? `${evaluation.readyMs.toFixed(1)}ms, ${evaluation.scriptRequestCount} script and ${evaluation.catalogRequestCount} catalog startup request(s)`
      : evaluation.failures.join('; ');
    console.log(`[perf] ${status} startup:${evaluation.route}: ${details}`);
  });
  console.log(`[perf] Report: ${path.relative(ROOT, outputPath)}`);

  if (!reportOnly && !report.passed) process.exitCode = 1;
}

main().catch(error => {
  console.error('[perf] Browser measurement failed:', error);
  process.exitCode = 1;
});
