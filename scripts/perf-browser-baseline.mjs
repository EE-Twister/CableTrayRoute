import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_PROFILE_BUDGETS,
  evaluatePerformanceReport,
  evaluatePerformanceProfiles,
} from '../src/performance/performanceContracts.js';
import {
  ROUTE_STARTUP_CONTRACTS,
  evaluateRouteStartupProfiles,
} from '../src/performance/routeStartupContracts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'output', 'playwright', 'performance');
const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--no-enforce');
const sampleRetainedHeap = args.has('--heap-sampling');
const configuredChannel = process.env.CTR_PLAYWRIGHT_CHANNEL?.trim();
const channel = configuredChannel || (process.platform === 'win32' ? 'msedge' : '');
const ONE_LINE_COMPONENT_COUNT = 1000;

function pageUrl(relativePath) {
  const url = pathToFileURL(path.join(ROOT, relativePath));
  url.searchParams.set('e2e', '1');
  url.searchParams.set('perf', '1');
  return url.href;
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

async function collectGarbage(page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('HeapProfiler.collectGarbage');
  } finally {
    await session.detach();
  }
}

async function startHeapSampling(page) {
  const session = await page.context().newCDPSession(page);
  await session.send('HeapProfiler.enable');
  await session.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
  return session;
}

async function stopHeapSampling(session) {
  if (!session) return [];
  try {
    await session.send('HeapProfiler.collectGarbage');
    const { profile } = await session.send('HeapProfiler.stopSampling');
    const allocations = [];
    const visit = node => {
      const size = Number(node.selfSize) || 0;
      if (size > 0) {
        allocations.push({
          bytes: size,
          functionName: node.callFrame?.functionName || '(anonymous)',
          url: node.callFrame?.url || '',
          line: (Number(node.callFrame?.lineNumber) || 0) + 1,
        });
      }
      (node.children || []).forEach(visit);
    };
    visit(profile.head);
    return allocations.sort((left, right) => right.bytes - left.bytes).slice(0, 20);
  } finally {
    await session.detach();
  }
}

async function profileSnapshot(page, { garbageCollection = 'none' } = {}) {
  if (garbageCollection === 'before') await collectGarbage(page);
  const snapshot = await page.evaluate(() => {
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
      heapUsedBytes: Number(performance.memory?.usedJSHeapSize) || 0,
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
      storageDiagnostics: window.projectStorage?.getProjectStorageDiagnostics?.() || {},
    };
  });
  if (garbageCollection === 'after') {
    await collectGarbage(page);
    snapshot.heapUsedBytes = await page.evaluate(() => Number(performance.memory?.usedJSHeapSize) || 0);
  }
  return snapshot;
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
    heapGrowthBytes: Math.max(0, (end.heapUsedBytes || 0) - (start.heapUsedBytes || 0)),
    heapStartBytes: start.heapUsedBytes || 0,
    heapEndBytes: end.heapUsedBytes || 0,
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
    storageDiagnostics: {
      undoEntries: end.storageDiagnostics.undoEntries || 0,
      undoBytes: end.storageDiagnostics.undoBytes || 0,
      undoEntryDelta: (end.storageDiagnostics.undoEntries || 0) - (start.storageDiagnostics?.undoEntries || 0),
      undoByteDelta: (end.storageDiagnostics.undoBytes || 0) - (start.storageDiagnostics?.undoBytes || 0),
    },
  };
}

async function readLongTasks(page) {
  return page.evaluate(() => window.__CTR_PROFILE__?.longTasks || []);
}

async function readMeasurements(page) {
  return page.evaluate(() => window.__CTR_PERFORMANCE__?.measurements || []);
}

async function waitForRenderedFrame(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function measureRoutingAndImport(browser, project) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installProfiler(page);
  await page.goto(pageUrl('optimalRoute.html'));
  await page.locator('#optimal-ready-beacon[data-optimal-ready="1"]').waitFor({ timeout: 30000 });

  const startupEnd = await profileSnapshot(page);
  const importStart = startupEnd;
  const imported = await page.evaluate(async projectData => {
    const dataStore = await import(`./dataStore.mjs?perf=${Date.now()}`);
    return dataStore.importProject(projectData);
  }, project);
  if (!imported) {
    throw new Error(`Project performance fixture failed to import: ${await page.evaluate(() => window.dataStore.getLastProjectImportError())}`);
  }
  const importEnd = await profileSnapshot(page);
  const repeatedLoadsStart = await profileSnapshot(page, { garbageCollection: 'before' });
  await page.evaluate(async projectData => {
    const dataStore = await import('./dataStore.mjs');
    for (let index = 0; index < 6; index += 1) {
      const next = structuredClone(projectData);
      next.settings = { ...(next.settings || {}) };
      next.settings.projectMeta = {
        ...(next.settings.projectMeta || {}),
        revision: `PERF-${index % 2}`,
      };
      if (!dataStore.importProject(next)) throw new Error(dataStore.getLastProjectImportError());
    }
  }, project);
  const repeatedLoadsEnd = await profileSnapshot(page, { garbageCollection: 'after' });

  await page.click('#load-large-facility-btn');
  await page.waitForFunction(() => document.querySelectorAll('#cable-list-container tbody tr').length >= 200, null, { timeout: 30000 });
  let routingCount = (await readMeasurements(page)).filter(measurement => measurement.name === 'ctr.routing-recalculation').length;
  await page.click('#calculate-route-btn');
  await page.waitForFunction(
    expected => (window.__CTR_PERFORMANCE__?.measurements || [])
      .filter(measurement => measurement.name === 'ctr.routing-recalculation').length > expected,
    routingCount,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () => Number(window.__routeViewerDebug?.routeCount) >= 200,
    null,
    { timeout: 30000 },
  );
  await waitForRenderedFrame(page);
  routingCount += 1;
  const routingStart = await profileSnapshot(page, { garbageCollection: 'before' });
  const heapSamplingSession = sampleRetainedHeap ? await startHeapSampling(page) : null;
  await page.evaluate(() => document.querySelector('#calculate-route-btn')?.click());
  await page.waitForFunction(
    expected => (window.__CTR_PERFORMANCE__?.measurements || [])
      .filter(measurement => measurement.name === 'ctr.routing-recalculation').length > expected,
    routingCount,
    { timeout: 120000 },
  );
  await waitForRenderedFrame(page);
  const routingEnd = await profileSnapshot(page, { garbageCollection: 'after' });
  const retainedAllocationHotspots = await stopHeapSampling(heapSamplingSession);
  routingCount += 1;
  const repeatRoutingStart = routingEnd;
  await page.evaluate(() => document.querySelector('#calculate-route-btn')?.click());
  await page.waitForFunction(
    expected => (window.__CTR_PERFORMANCE__?.measurements || [])
      .filter(measurement => measurement.name === 'ctr.routing-recalculation').length > expected,
    routingCount,
    { timeout: 120000 },
  );
  await waitForRenderedFrame(page);
  const repeatRoutingEnd = await profileSnapshot(page, { garbageCollection: 'after' });
  const staticSceneReuseCount = await page.evaluate(() => Number(window.__routeViewerDebug?.staticSceneReuseCount) || 0);
  if (staticSceneReuseCount < 2) throw new Error(`Repeated routing rebuilt static 3D geometry; expected 2 reuses, observed ${staticSceneReuseCount}.`);
  const longTasks = await readLongTasks(page);
  const profiles = [
    profileDelta('startup:optimal-route', {
      now: 0,
      longTaskCount: 0,
      heapUsedBytes: 0,
      dom: {},
      storageReads: { total: 0, byKey: {} },
    }, startupEnd, longTasks),
    profileDelta('project-import', importStart, importEnd, longTasks),
    profileDelta('repeated-project-loads', repeatedLoadsStart, repeatedLoadsEnd, longTasks),
    {
      ...profileDelta('routing-recalculation', routingStart, routingEnd, longTasks),
      staticSceneReuseCount,
      ...(retainedAllocationHotspots.length ? { retainedAllocationHotspots } : {}),
    },
    profileDelta('routing-recalculation-steady-state', repeatRoutingStart, repeatRoutingEnd, longTasks),
  ];
  const allMeasurements = await readMeasurements(page);
  await page.close();
  return {
    measurements: allMeasurements.filter(measurement => [
      'ctr.startup',
      'ctr.project-import',
      'ctr.routing-recalculation',
    ].includes(measurement.name)),
    profiles,
  };
}

async function measureOneLine(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installProfiler(page);
  await page.goto(pageUrl('oneline.html'));
  await page.locator('#oneline-ready-beacon[data-oneline-ready="1"]').waitFor({ timeout: 30000 });
  const priorCount = (await readMeasurements(page)).filter(measurement => measurement.name === 'ctr.oneline-render').length;
  const startupEnd = await profileSnapshot(page);
  const renderStart = startupEnd;

  await page.evaluate(async componentCount => {
    const dataStore = await import(`./dataStore.mjs?perf-oneline=${Date.now()}`);
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
    dataStore.setOneLine({
      activeSheet: 0,
      sheets: [{ name: 'Performance Fixture', components, connections }],
    });
    const storedCount = dataStore.getOneLine().sheets?.[0]?.components?.length || 0;
    if (storedCount !== componentCount) {
      throw new Error(`One-Line performance fixture stored ${storedCount} of ${componentCount} components.`);
    }
    document.dispatchEvent(new CustomEvent('ctr:remote-applied'));
  }, ONE_LINE_COMPONENT_COUNT);

  await page.waitForFunction(
    expected => (window.__CTR_PERFORMANCE__?.measurements || [])
      .filter(measurement => measurement.name === 'ctr.oneline-render').length > expected,
    priorCount,
    { timeout: 30000 },
  );
  try {
    await page.waitForFunction(
      expected => document.querySelectorAll('#diagram g.component').length === expected,
      ONE_LINE_COMPONENT_COUNT,
      { timeout: 30000 },
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      componentElements: document.querySelectorAll('#diagram g.component').length,
      renderLayerCount: document.querySelectorAll('#diagram > .oneline-render-layer').length,
      recentMeasurements: (window.__CTR_PERFORMANCE__?.measurements || []).filter(item => item.name === 'ctr.oneline-render').slice(-4),
      storedComponents: window.dataStore.getOneLine().sheets?.[0]?.components?.length || 0,
    }));
    throw new Error(`One-Line large fixture did not render: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
  const renderEnd = await profileSnapshot(page);
  const interactionStart = await profileSnapshot(page, { garbageCollection: 'before' });
  for (let index = 0; index < 6; index += 1) {
    await page.evaluate(() => document.querySelector('#grid-toggle')?.click());
  }
  await waitForRenderedFrame(page);
  const interactionEnd = await profileSnapshot(page, { garbageCollection: 'after' });
  const longTasks = await readLongTasks(page);
  const profiles = [
    profileDelta('startup:oneline', {
      now: 0,
      longTaskCount: 0,
      heapUsedBytes: 0,
      dom: {},
      storageReads: { total: 0, byKey: {} },
    }, startupEnd, longTasks),
    profileDelta('oneline-render', renderStart, renderEnd, longTasks),
    profileDelta('one-line-interactions', interactionStart, interactionEnd, longTasks),
  ];
  const allMeasurements = await readMeasurements(page);
  await page.close();
  return {
    measurements: allMeasurements.filter(measurement => [
      'ctr.startup',
      'ctr.oneline-render',
    ].includes(measurement.name)),
    profiles,
  };
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
  const warmupCount = (await readMeasurements(page)).filter(measurement => measurement.name === 'ctr.tcc-plot').length;
  await page.click('#plot-btn');
  await page.waitForFunction(
    expected => (window.__CTR_PERFORMANCE__?.measurements || [])
      .filter(measurement => measurement.name === 'ctr.tcc-plot').length > expected,
    warmupCount,
    { timeout: 30000 },
  );
  const start = await profileSnapshot(page, { garbageCollection: 'before' });
  const priorCount = (await readMeasurements(page)).filter(measurement => measurement.name === 'ctr.tcc-plot').length;
  for (let index = 0; index < 5; index += 1) {
    await page.click('#plot-btn');
    await page.waitForFunction(
      expected => (window.__CTR_PERFORMANCE__?.measurements || [])
        .filter(measurement => measurement.name === 'ctr.tcc-plot').length > expected,
      priorCount + index,
      { timeout: 30000 },
    );
  }
  const end = await profileSnapshot(page, { garbageCollection: 'after' });
  const measurements = await readMeasurements(page);
  const longTasks = await readLongTasks(page);
  const profile = profileDelta('study-runs', start, end, longTasks);
  await page.close();
  return {
    measurements: measurements.filter(measurement => measurement.name === 'ctr.tcc-plot'),
    profiles: [profile],
  };
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
    args: ['--allow-file-access-from-files', '--enable-precise-memory-info'],
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
  const profileEvaluations = evaluatePerformanceProfiles(profiles);
  const routeStartupEvaluations = evaluateRouteStartupProfiles(routeStartups);
  const report = {
    generatedAt: new Date().toISOString(),
    browser: channel || 'chromium',
    budgets: PERFORMANCE_BUDGETS,
    profileBudgets: PERFORMANCE_PROFILE_BUDGETS,
    measurements,
    profiles,
    evaluations,
    profileEvaluations,
    routeStartupBudgets: ROUTE_STARTUP_CONTRACTS,
    routeStartups,
    routeStartupEvaluations,
    passed: evaluations.every(evaluation => evaluation.passed)
      && profileEvaluations.every(evaluation => evaluation.passed)
      && routeStartupEvaluations.every(evaluation => evaluation.passed),
  };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'performance-report.json');
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  evaluations.forEach(evaluation => {
    const status = evaluation.passed ? 'PASS' : 'FAIL';
    console.log(`[perf] ${status} ${evaluation.name}: ${evaluation.durationMs.toFixed(1)}ms / ${evaluation.maxMs}ms`);
  });
  profileEvaluations.forEach(evaluation => {
    const status = evaluation.passed ? 'PASS' : 'FAIL';
    const details = evaluation.passed
      ? `${evaluation.durationMs.toFixed(1)}ms, ${(evaluation.heapGrowthBytes / (1024 * 1024)).toFixed(1)}MB heap growth, ${evaluation.longestTaskMs.toFixed(1)}ms longest task`
      : evaluation.failures.join('; ');
    console.log(`[perf] ${status} profile:${evaluation.name}: ${details}`);
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
