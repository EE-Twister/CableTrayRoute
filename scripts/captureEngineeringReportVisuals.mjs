import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INPUT = join(ROOT, 'samples', 'project-workflow-core.json');
const DEFAULT_OUTPUT_DIR = join(ROOT, 'tmp', 'pdfs', 'engineering-report-visuals');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]);

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, outputDir: DEFAULT_OUTPUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') args.input = argv[++index];
    else if (value === '--output-dir') args.outputDir = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  args.input = resolve(ROOT, args.input);
  args.outputDir = resolve(ROOT, args.outputDir);
  return args;
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, '-');
}

function isWithinRoot(path) {
  const rel = relative(ROOT, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const requested = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      let filePath = resolve(ROOT, requested);
      if (!isWithinRoot(filePath)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
      const fileInfo = await stat(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': fileInfo.size,
        'Content-Type': MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolvePromise({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(closeResolve => server.close(closeResolve)),
      });
    });
  });
}

function assignedRacewayIds(cable) {
  const ids = [];
  if (Array.isArray(cable.raceway_ids)) ids.push(...cable.raceway_ids);
  if (cable.route_preference) ids.push(cable.route_preference);
  if (cable.conduit_id) ids.push(cable.conduit_id);
  return ids.map(String);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function captureLocator(page, selector, path) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts?.ready);
  await locator.screenshot({ path, animations: 'disabled' });
  const box = await locator.boundingBox();
  return {
    file: path,
    selector,
    cssWidth: Math.round(box?.width || 0),
    cssHeight: Math.round(box?.height || 0),
    sha256: await sha256(path),
  };
}

async function createSvgCaptureSurface(page, selector, { padding = 60, targetWidth = 1200 } = {}) {
  return page.locator(selector).evaluate((svg, options) => {
    const boxes = Array.from(svg.children)
      .filter(element => element.tagName !== 'defs' && element.id !== 'grid-bg')
      .map(element => element.getBBox())
      .filter(box => box.width > 0 || box.height > 0);
    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));
    const x = left - options.padding;
    const y = top - options.padding;
    const width = Math.max(1, right - left + options.padding * 2);
    const height = Math.max(1, bottom - top + options.padding * 2);
    const targetHeight = Math.round(options.targetWidth * height / width);
    document.getElementById('engineering-report-capture-surface')?.remove();
    const surface = document.createElement('div');
    surface.id = 'engineering-report-capture-surface';
    Object.assign(surface.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${options.targetWidth}px`,
      height: `${targetHeight}px`,
      background: '#ffffff',
      zIndex: '2147483647',
    });
    const clone = svg.cloneNode(true);
    clone.querySelector('#grid-bg')?.remove();
    clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    clone.setAttribute('width', String(options.targetWidth));
    clone.setAttribute('height', String(targetHeight));
    clone.style.width = `${options.targetWidth}px`;
    clone.style.height = `${targetHeight}px`;
    clone.style.maxWidth = 'none';
    clone.style.background = '#ffffff';
    surface.appendChild(clone);
    document.body.appendChild(surface);
    return '#engineering-report-capture-surface > svg';
  }, { padding, targetWidth });
}

async function launchCaptureBrowser() {
  const attempts = [
    { label: 'Playwright Chromium', options: { headless: true } },
    { label: 'Google Chrome', options: { channel: 'chrome', headless: true } },
    { label: 'Microsoft Edge', options: { channel: 'msedge', headless: true } },
  ];
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await chromium.launch(attempt.options);
    } catch (error) {
      errors.push(`${attempt.label}: ${error.message.split('\n')[0]}`);
    }
  }
  throw new Error(`No supported browser could be launched. ${errors.join(' | ')}`);
}

async function captureVisuals({ input, outputDir }) {
  const project = JSON.parse(await readFile(input, 'utf8'));
  const engineeringPackage = project.settings?.engineeringPackage || {};
  const traySections = engineeringPackage.trayCrossSections || [];
  const ductbankSections = engineeringPackage.ductbankCrossSections || [];
  if (!project.oneLine?.sheets?.length || !traySections.length || !ductbankSections.length) {
    throw new Error('The sample needs a one-line plus tray and ductbank cross-section definitions.');
  }

  await mkdir(outputDir, { recursive: true });
  const server = await startStaticServer();
  let browser;
  try {
    browser = await launchCaptureBrowser();
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1600, height: 1100 },
    });
    const page = await context.newPage();
    page.on('pageerror', error => console.warn(`[engineering-report capture] ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') console.warn(`[engineering-report browser] ${message.text()}`);
    });

    await page.goto(`${server.origin}/samplegallery.html`, { waitUntil: 'domcontentloaded' });
    const sampleCard = page.locator(`[data-sample-id="${project.id}"]`);
    await sampleCard.getByRole('button', { name: /Open guided/i }).click();
    await page.locator('#checklist-panel').waitFor({ state: 'visible' });

    await page.goto(`${server.origin}/oneline.html`, { waitUntil: 'domcontentloaded' });
    const componentCount = project.oneLine.sheets[project.oneLine.activeSheet || 0].components.length;
    await page.waitForFunction(expected => (
      document.querySelectorAll('#diagram g.component').length === expected
    ), componentCount);
    await page.evaluate(() => {
      const select = document.getElementById('drawing-mode-select');
      select.value = 'engineeringPrint';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const datablock = document.getElementById('datablock-format-select');
      datablock.value = 'off';
      datablock.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.body.classList.contains('engineering-print-mode'));
    await page.waitForTimeout(350);
    const oneLineConnectionAudit = await page.evaluate(sheet => {
      const byId = new Map(sheet.components.map(component => [component.id, component]));
      const disconnected = [];
      let renderedConnections = 0;
      document.querySelectorAll('#diagram polyline.connection').forEach(polyline => {
        renderedConnections += 1;
        const source = byId.get(polyline.dataset.comp);
        const index = Number(polyline.dataset.index);
        const targetId = source?.connections?.[index]?.target;
        const target = document.querySelector(`#diagram g.component[data-id="${CSS.escape(targetId || '')}"]`);
        const lastPoint = polyline.points?.numberOfItems ? polyline.points.getItem(polyline.points.numberOfItems - 1) : null;
        const matrix = polyline.getScreenCTM();
        if (!target || !lastPoint || !matrix) {
          disconnected.push(targetId || `${polyline.dataset.comp}:${index}`);
          return;
        }
        const point = new DOMPoint(lastPoint.x, lastPoint.y).matrixTransform(matrix);
        const bounds = target.getBoundingClientRect();
        const tolerance = 3;
        const touchesTarget = point.x >= bounds.left - tolerance
          && point.x <= bounds.right + tolerance
          && point.y >= bounds.top - tolerance
          && point.y <= bounds.bottom + tolerance;
        if (!touchesTarget) disconnected.push(targetId);
      });
      return { renderedConnections, disconnected };
    }, project.oneLine.sheets[project.oneLine.activeSheet || 0]);
    if (oneLineConnectionAudit.disconnected.length) {
      throw new Error(`One-line connections do not terminate on their target symbols: ${oneLineConnectionAudit.disconnected.join(', ')}`);
    }
    const oneLineCaptureSelector = await createSvgCaptureSurface(page, '#diagram', { padding: 70, targetWidth: 1200 });
    const oneLinePath = join(outputDir, 'one-line-engineering-print.png');
    const oneLine = await captureLocator(page, oneLineCaptureSelector, oneLinePath);
    oneLine.selector = '#diagram';

    const trays = [];
    for (const section of traySections) {
      console.log(`Capturing application tray view ${section.trayId}...`);
      const tray = project.trays.find(row => row.tray_id === section.trayId || row.id === section.trayId);
      if (!tray) throw new Error(`Tray cross-section references missing tray ${section.trayId}.`);
      const cables = project.cables.filter(cable => assignedRacewayIds(cable).includes(section.trayId));
      await page.evaluate(({ selectedTray, selectedCables }) => {
        window.dataStore.setItem('trayFillData', { tray: selectedTray, cables: selectedCables });
      }, {
        selectedTray: {
          ...tray,
          tray_id: section.trayId,
          width: Number(tray.inside_width ?? tray.width ?? section.insideWidthIn),
          height: Number(tray.tray_depth ?? tray.height ?? section.usableDepthIn),
        },
        selectedCables: cables,
      });
      await page.goto(`${server.origin}/cabletrayfill.html`, { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForFunction(expected => (
          document.querySelector('#trayName')?.value === expected
            && Boolean(document.querySelector('#svgContainer svg'))
        ), section.trayId, { timeout: 15000 });
      } catch (error) {
        const state = await page.evaluate(() => ({
          trayName: document.querySelector('#trayName')?.value,
          hasSvg: Boolean(document.querySelector('#svgContainer svg')),
          results: document.querySelector('#results')?.textContent?.trim().slice(0, 400),
          modal: document.querySelector('.modal[aria-hidden="false"], .modal:not([hidden])')?.textContent?.trim().slice(0, 400),
          rows: Array.from(document.querySelectorAll('#cableTable tbody tr')).map(row => (
            Array.from(row.querySelectorAll('input, select')).map(input => input.value)
          )),
          readyState: document.readyState,
        }));
        throw new Error(`Tray ${section.trayId} did not render: ${JSON.stringify(state)}`, { cause: error });
      }
      const path = join(outputDir, `tray-${safeFileName(section.trayId)}.png`);
      const trayAudit = await page.locator('#svgContainer svg').evaluate(svg => ({
        labels: svg.textContent || '',
        dividerCount: Array.from(svg.querySelectorAll('text')).filter(node => node.textContent === 'DIVIDER').length,
      }));
      const missingCableLabels = cables.map(cable => cable.tag).filter(tag => !trayAudit.labels.includes(tag));
      if (missingCableLabels.length) throw new Error(`Tray ${section.trayId} is missing cable identification labels: ${missingCableLabels.join(', ')}`);
      const expectedDividers = Math.max(0, Number(tray.num_slots || 1) - 1);
      if (trayAudit.dividerCount !== expectedDividers) {
        throw new Error(`Tray ${section.trayId} rendered ${trayAudit.dividerCount} dividers; expected ${expectedDividers}.`);
      }
      trays.push({
        id: section.trayId,
        cableTags: cables.map(cable => cable.tag),
        material: tray.material,
        dividerCount: trayAudit.dividerCount,
        page: 'cabletrayfill.html',
        ...(await captureLocator(page, '#svgContainer svg', path)),
      });
    }

    const ductbanks = [];
    for (const section of ductbankSections) {
      const id = section.ductbankId;
      console.log(`Capturing application ductbank view ${id}...`);
      await page.goto(`${server.origin}/ductbankroute.html?ductbank=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(expected => (
        document.querySelector('#ductbankTag')?.value === expected
          && document.querySelector('#grid')?.children.length > 0
      ), id);
      await page.locator('#showEarthContext').uncheck();
      await page.waitForFunction(() => Number(document.querySelector('#grid')?.getAttribute('width')) < 1200);
      await page.waitForTimeout(200);
      const ductbankAudit = await page.locator('#grid').evaluate(svg => ({
        labels: svg.textContent || '',
        width: Number(svg.getAttribute('width')),
        height: Number(svg.getAttribute('height')),
        conduitCount: svg.querySelectorAll('circle[title]').length,
      }));
      if (!ductbankAudit.labels.includes('MIN COVER')) {
        throw new Error(`Ductbank ${id} does not identify its concrete sidewall cover.`);
      }
      const path = join(outputDir, `ductbank-${safeFileName(id)}.png`);
      ductbanks.push({
        id,
        concreteCoverIn: section.concreteCoverIn,
        conduitCount: ductbankAudit.conduitCount,
        page: `ductbankroute.html?ductbank=${encodeURIComponent(id)}`,
        ...(await captureLocator(page, '#grid', path)),
      });
    }

    const makeRelative = capture => ({
      ...capture,
      file: relative(outputDir, capture.file).replaceAll('\\', '/'),
    });
    const manifest = {
      schemaVersion: 1,
      projectId: project.id,
      sourceProject: relative(ROOT, input).replaceAll('\\', '/'),
      generatedAt: new Date().toISOString(),
      renderer: 'CableTrayRoute browser application',
      captures: {
        oneLine: {
          ...makeRelative(oneLine),
          page: 'oneline.html',
          mode: 'engineeringPrint',
          datablockFormat: 'off',
          componentCount,
          renderedConnectionCount: oneLineConnectionAudit.renderedConnections,
        },
        trays: trays.map(makeRelative),
        ductbanks: ductbanks.map(makeRelative),
      },
    };
    await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await context.close();
    return manifest;
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const manifest = await captureVisuals(args);
console.log(resolve(args.outputDir, 'manifest.json'));
console.log(`Captured 1 one-line, ${manifest.captures.trays.length} tray, and ${manifest.captures.ductbanks.length} ductbank application views.`);
