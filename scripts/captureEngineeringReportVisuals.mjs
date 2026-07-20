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
      serviceWorkers: 'block',
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
      datablock.value = 'report';
      datablock.dispatchEvent(new Event('change', { bubbles: true }));
      const density = document.getElementById('datablock-density-select');
      density.value = 'expanded';
      density.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.body.classList.contains('engineering-print-mode'));
    const reportAnnotations = project.oneLine.sheets[project.oneLine.activeSheet || 0].components
      .map(component => {
        if (component.props?.amp_trip) return { id: component.id, values: [component.props.amp_trip], type: 'protective' };
        if (component.type === 'transformer') {
          return {
            id: component.id,
            values: [component.voltage_ratio, component.winding].filter(Boolean),
            type: 'transformer',
          };
        }
        return null;
      })
      .filter(Boolean);
    await page.waitForFunction(expected => (
      document.querySelectorAll('#diagram g.component-datablock').length === expected
    ), reportAnnotations.length);
    const reportAnnotationAudit = await page.evaluate(expected => expected.map(annotation => {
      const block = document.querySelector(`#diagram g.component-datablock[data-id="${CSS.escape(annotation.id)}"]`);
      const label = block?.textContent || '';
      return {
        ...annotation,
        rendered: Boolean(block),
        missingValues: annotation.values.filter(value => !label.includes(value)),
      };
    }), reportAnnotations);
    const incompleteReportAnnotations = reportAnnotationAudit.filter(annotation => (
      !annotation.rendered || annotation.missingValues.length
    ));
    if (incompleteReportAnnotations.length) {
      throw new Error(`One-line report annotations are incomplete: ${JSON.stringify(incompleteReportAnnotations)}`);
    }
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
    const oneLineSheet = project.oneLine.sheets[project.oneLine.activeSheet || 0];
    const oneLineComponentById = new Map(oneLineSheet.components.map(component => [component.id, component]));
    const bridgedComponentType = component => component
      && component.type !== 'annotation'
      && !['bus', 'busway', 'cable'].includes(String(component.type || '').toLowerCase());
    const expectedTerminalBridgeKeys = new Set();
    const expectedTerminalEndpoints = [];
    oneLineSheet.components.forEach(source => {
      (source.connections || []).forEach((connection, connectionIndex) => {
        const target = oneLineComponentById.get(connection.target);
        if (bridgedComponentType(source)) {
          const portIndex = Number(connection.sourcePort || 0);
          expectedTerminalBridgeKeys.add(`${source.id}:${portIndex}`);
          expectedTerminalEndpoints.push({
            componentId: source.id,
            portIndex,
            sourceId: source.id,
            connectionIndex,
            endpoint: 'start',
          });
        }
        if (bridgedComponentType(target)) {
          const portIndex = Number(connection.targetPort || 0);
          expectedTerminalBridgeKeys.add(`${target.id}:${portIndex}`);
          expectedTerminalEndpoints.push({
            componentId: target.id,
            portIndex,
            sourceId: source.id,
            connectionIndex,
            endpoint: 'end',
          });
        }
      });
    });
    const terminalBridgeAudit = await page.evaluate(expectedKeys => expectedKeys.map(key => {
      const [componentId, portIndex] = key.split(':');
      const bridge = document.querySelector(
        `#diagram g.component[data-id="${CSS.escape(componentId)}"] .component-terminal-bridge[data-port-index="${CSS.escape(portIndex)}"]`
      );
      return {
        key,
        rendered: Boolean(bridge),
        length: bridge && typeof bridge.getTotalLength === 'function' ? bridge.getTotalLength() : 0,
        linecap: bridge?.getAttribute('stroke-linecap') || '',
      };
    }), [...expectedTerminalBridgeKeys]);
    const discontinuousTerminals = terminalBridgeAudit.filter(terminal => (
      !terminal.rendered || terminal.length < 16 || terminal.linecap !== 'square'
    ));
    if (discontinuousTerminals.length) {
      throw new Error(`Connected component terminals must visibly overlap their connectors: ${JSON.stringify(discontinuousTerminals)}`);
    }
    const terminalMatingAudit = await page.evaluate(endpoints => {
      const toScreenPoint = (element, x, y) => {
        const matrix = element?.getScreenCTM();
        return matrix ? new DOMPoint(x, y).matrixTransform(matrix) : null;
      };
      return endpoints.map(endpoint => {
        const polyline = document.querySelector(
          `#diagram polyline.connection[data-comp="${CSS.escape(endpoint.sourceId)}"][data-index="${endpoint.connectionIndex}"]`
        );
        const bridge = document.querySelector(
          `#diagram g.component[data-id="${CSS.escape(endpoint.componentId)}"] .component-terminal-bridge[data-port-index="${endpoint.portIndex}"]`
        );
        const pointCount = polyline?.points?.numberOfItems || 0;
        const connectionPoint = pointCount
          ? polyline.points.getItem(endpoint.endpoint === 'start' ? 0 : pointCount - 1)
          : null;
        const connectionScreenPoint = connectionPoint
          ? toScreenPoint(polyline, connectionPoint.x, connectionPoint.y)
          : null;
        const portX = Number(bridge?.dataset.portX);
        const portY = Number(bridge?.dataset.portY);
        const terminalScreenPoint = Number.isFinite(portX) && Number.isFinite(portY)
          ? toScreenPoint(bridge, portX, portY)
          : null;
        return {
          ...endpoint,
          rendered: Boolean(polyline && bridge && connectionScreenPoint && terminalScreenPoint),
          centerlineOffsetPx: connectionScreenPoint && terminalScreenPoint
            ? Math.hypot(connectionScreenPoint.x - terminalScreenPoint.x, connectionScreenPoint.y - terminalScreenPoint.y)
            : -1,
          connectionStrokeWidthPx: polyline ? Number.parseFloat(getComputedStyle(polyline).strokeWidth) : -1,
          terminalStrokeWidthPx: bridge ? Number.parseFloat(getComputedStyle(bridge).strokeWidth) : -1,
        };
      });
    }, expectedTerminalEndpoints);
    const imperfectTerminalMates = terminalMatingAudit.filter(endpoint => (
      !endpoint.rendered
      || endpoint.centerlineOffsetPx > 0.25
      || Math.abs(endpoint.connectionStrokeWidthPx - endpoint.terminalStrokeWidthPx) > 0.01
      || endpoint.connectionStrokeWidthPx !== 3
    ));
    if (imperfectTerminalMates.length) {
      throw new Error(`Component terminals must share the exact connector centerline and stroke width: ${JSON.stringify(imperfectTerminalMates)}`);
    }
    const busComponents = project.oneLine.sheets[project.oneLine.activeSheet || 0].components
      .filter(component => component.type === 'bus')
      .map(component => ({
        id: component.id,
        label: component.label,
        connectionCount: (component.connections || []).length,
      }));
    const busTapAudit = await page.evaluate(buses => buses.flatMap(bus => (
      Array.from({ length: bus.connectionCount }, (_, index) => {
        const polyline = document.querySelector(`#diagram polyline.connection[data-comp="${CSS.escape(bus.id)}"][data-index="${index}"]`);
        const busImage = document.querySelector(`#diagram g.component[data-id="${CSS.escape(bus.id)}"] image`);
        const points = polyline?.points
          ? Array.from({ length: polyline.points.numberOfItems }, (_, pointIndex) => {
              const point = polyline.points.getItem(pointIndex);
              return { x: point.x, y: point.y };
            })
          : [];
        const vertical = points.length >= 2 && points.every(point => Math.abs(point.x - points[0].x) < 0.5);
        return { bus: bus.label, index, renderedWidth: Number(busImage?.getAttribute('width')), points, vertical };
      })
    )), busComponents);
    const extendedBusConnections = busTapAudit.filter(connection => !connection.vertical);
    if (extendedBusConnections.length) {
      throw new Error(`Feeder connections must fall directly beneath their visible buses: ${JSON.stringify(extendedBusConnections)}`);
    }
    const adjacentBranchClearance = await page.evaluate(() => {
      const bus = document.querySelector('#diagram g.component[data-id="comp-mcc-102"] image');
      const transformer = document.querySelector('#diagram g.component[data-id="comp-xfmr-102"] image');
      const busBounds = bus?.getBoundingClientRect();
      const transformerBounds = transformer?.getBoundingClientRect();
      return {
        rendered: Boolean(busBounds && transformerBounds),
        gapPx: busBounds && transformerBounds ? transformerBounds.left - busBounds.right : -1,
      };
    });
    if (!adjacentBranchClearance.rendered || adjacentBranchClearance.gapPx < 20) {
      throw new Error(`MCC-102 must maintain visible clearance from the XFMR-102 branch: ${JSON.stringify(adjacentBranchClearance)}`);
    }
    const transformerComponents = project.oneLine.sheets[project.oneLine.activeSheet || 0].components
      .filter(component => component.type === 'transformer')
      .map(transformer => {
        const primaryConnected = project.oneLine.sheets[project.oneLine.activeSheet || 0].components
          .some(component => (component.connections || []).some(connection => (
            connection.target === transformer.id && Number(connection.targetPort || 0) === 0
          )));
        const secondaryConnected = (transformer.connections || [])
          .some(connection => Number(connection.sourcePort || 0) === 1);
        return { id: transformer.id, label: transformer.label, primaryConnected, secondaryConnected };
      });
    const transformerTerminalAudit = await page.evaluate(transformers => transformers.map(transformer => {
      const component = document.querySelector(`#diagram g.component[data-id="${CSS.escape(transformer.id)}"]`);
      const image = component?.querySelector('image');
      const imageBounds = image?.getBoundingClientRect();
      const terminalAxisX = imageBounds ? imageBounds.left + (imageBounds.width / 2) : null;
      const fittedScale = imageBounds ? Math.min(imageBounds.width / 76, imageBounds.height / 84) : 0;
      const fittedWidth = 76 * fittedScale;
      const fittedHeight = 84 * fittedScale;
      const expectedTop = imageBounds ? {
        x: imageBounds.left + ((imageBounds.width - fittedWidth) / 2) + (38 * fittedScale),
        y: imageBounds.top + ((imageBounds.height - fittedHeight) / 2),
      } : null;
      const expectedBottom = expectedTop ? {
        x: expectedTop.x,
        y: expectedTop.y + fittedHeight,
      } : null;
      const bridgeDetails = portIndex => {
        const bridge = component?.querySelector(`.component-terminal-bridge[data-port-index="${portIndex}"]`);
        const matrix = bridge?.getScreenCTM();
        const portX = Number(bridge?.dataset.portX);
        const portY = Number(bridge?.dataset.portY);
        const point = matrix && Number.isFinite(portX) && Number.isFinite(portY)
          ? new DOMPoint(portX, portY).matrixTransform(matrix)
          : null;
        return {
          point,
          length: bridge && typeof bridge.getTotalLength === 'function' ? bridge.getTotalLength() : -1,
        };
      };
      const topBridge = bridgeDetails(0);
      const bottomBridge = bridgeDetails(1);
      const endpointOffset = (actual, expected) => actual && expected
        ? Math.hypot(actual.x - expected.x, actual.y - expected.y)
        : -1;
      const labels = Array.from(document.querySelectorAll(
        `#diagram .transformer-port-label[data-component-id="${CSS.escape(transformer.id)}"]`
      )).map(label => {
        const bounds = label.getBoundingClientRect();
        const axisClearancePx = terminalAxisX === null
          ? -1
          : bounds.right <= terminalAxisX
            ? terminalAxisX - bounds.right
            : bounds.left >= terminalAxisX
              ? bounds.left - terminalAxisX
              : -1;
        return { text: label.textContent || '', axisClearancePx };
      });
      return {
        ...transformer,
        rendered: Boolean(imageBounds),
        labels,
        topTerminalOffsetPx: endpointOffset(topBridge.point, expectedTop),
        bottomTerminalOffsetPx: endpointOffset(bottomBridge.point, expectedBottom),
        topBridgeLength: topBridge.length,
        bottomBridgeLength: bottomBridge.length,
      };
    }), transformerComponents);
    const obscuredTransformerTerminals = transformerTerminalAudit.filter(transformer => (
      !transformer.rendered
      || !transformer.primaryConnected
      || !transformer.secondaryConnected
      || transformer.labels.length !== 2
      || transformer.labels.some(label => label.axisClearancePx < 4)
      || transformer.topTerminalOffsetPx < 0
      || transformer.bottomTerminalOffsetPx < 0
      || transformer.topTerminalOffsetPx > 0.25
      || transformer.bottomTerminalOffsetPx > 0.25
      || transformer.topBridgeLength < 22
      || transformer.bottomBridgeLength < 22
    ));
    if (obscuredTransformerTerminals.length) {
      throw new Error(`Transformer winding terminals must be connected and remain visible on both sides: ${JSON.stringify(obscuredTransformerTerminals)}`);
    }
    const panelComponents = project.oneLine.sheets[project.oneLine.activeSheet || 0].components
      .filter(component => component.type === 'panel')
      .map(panel => ({
        id: panel.id,
        label: panel.label,
        incomingConnected: project.oneLine.sheets[project.oneLine.activeSheet || 0].components
          .some(component => (component.connections || []).some(connection => (
            connection.target === panel.id && Number(connection.targetPort || 0) === 0
          )))
      }));
    const panelTerminalAudit = await page.evaluate(panels => panels.map(panel => {
      const component = document.querySelector(`#diagram g.component[data-id="${CSS.escape(panel.id)}"]`);
      const image = component?.querySelector('image');
      const imageBounds = image?.getBoundingClientRect();
      const fittedScale = imageBounds ? Math.min(imageBounds.width / 64, imageBounds.height / 76) : 0;
      const fittedWidth = 64 * fittedScale;
      const expectedTop = imageBounds ? {
        x: imageBounds.left + ((imageBounds.width - fittedWidth) / 2) + (32 * fittedScale),
        y: imageBounds.top + ((imageBounds.height - (76 * fittedScale)) / 2),
      } : null;
      const bridge = component?.querySelector('.component-terminal-bridge[data-port-index="0"]');
      const bottomBridge = component?.querySelector('.component-terminal-bridge[data-port-index="1"]');
      const terminalBridgeCount = component?.querySelectorAll('.component-terminal-bridge').length || 0;
      const matrix = bridge?.getScreenCTM();
      const portX = Number(bridge?.dataset.portX);
      const portY = Number(bridge?.dataset.portY);
      const point = matrix && Number.isFinite(portX) && Number.isFinite(portY)
        ? new DOMPoint(portX, portY).matrixTransform(matrix)
        : null;
      return {
        ...panel,
        rendered: Boolean(imageBounds),
        terminalBridgeCount,
        hasBottomBridge: Boolean(bottomBridge),
        topTerminalOffsetPx: point && expectedTop
          ? Math.hypot(point.x - expectedTop.x, point.y - expectedTop.y)
          : -1,
        topBridgeLength: bridge && typeof bridge.getTotalLength === 'function' ? bridge.getTotalLength() : -1,
      };
    }), panelComponents);
    const misalignedPanelTerminals = panelTerminalAudit.filter(panel => (
      !panel.rendered
      || !panel.incomingConnected
      || panel.terminalBridgeCount !== 1
      || panel.hasBottomBridge
      || panel.topTerminalOffsetPx < 0
      || panel.topTerminalOffsetPx > 0.25
      || panel.topBridgeLength < 22
    ));
    if (misalignedPanelTerminals.length) {
      throw new Error(`Panel terminals must visibly mate with their incoming connectors: ${JSON.stringify(misalignedPanelTerminals)}`);
    }
    const motorComponents = project.oneLine.sheets[project.oneLine.activeSheet || 0].components
      .filter(component => component.subtype === 'motor_load')
      .map(component => ({ id: component.id, rotation: Number(component.rotation || 0) }));
    const motorOrientationAudit = await page.evaluate(motors => motors.map(motor => {
      const element = document.querySelector(`#diagram g.component[data-id="${CSS.escape(motor.id)}"]`);
      const transform = element?.getAttribute('transform') || '';
      const image = element?.querySelector('image');
      const iconHref = image?.getAttribute('href')
        || image?.getAttribute('xlink:href')
        || '';
      const imageBounds = image?.getBoundingClientRect();
      const bridge = element?.querySelector('.component-terminal-bridge[data-port-index="0"]');
      const bridgeMatrix = bridge?.getScreenCTM();
      const portX = Number(bridge?.dataset.portX);
      const portY = Number(bridge?.dataset.portY);
      const portPoint = bridgeMatrix && Number.isFinite(portX) && Number.isFinite(portY)
        ? new DOMPoint(portX, portY).matrixTransform(bridgeMatrix)
        : null;
      const storedComponent = window.dataStore.getOneLine().sheets
        .flatMap(sheet => sheet.components || [])
        .find(component => component.id === motor.id);
      return {
        ...motor,
        transform,
        rotated: transform.includes('rotate('),
        iconHref,
        storedType: storedComponent?.type,
        storedSubtype: storedComponent?.subtype,
        storedWidth: storedComponent?.width,
        storedHeight: storedComponent?.height,
        storedPorts: storedComponent?.ports,
        visibleIconCenterlineOffsetPx: imageBounds && portPoint
          ? Math.abs((imageBounds.left + (imageBounds.width / 2)) - portPoint.x)
          : -1,
      };
    }), motorComponents);
    const misorientedMotors = motorOrientationAudit.filter(row => (
      row.rotation !== 0
      || row.rotated
      || !/\/Motor\.svg(?:\?|$)/.test(row.iconHref)
      || row.visibleIconCenterlineOffsetPx > 0.25
    ));
    if (misorientedMotors.length) {
      throw new Error(`One-line motor symbols must use the upright circle-M orientation: ${JSON.stringify(misorientedMotors)}`);
    }
    const vfdComponents = project.oneLine.sheets[project.oneLine.activeSheet || 0].components
      .filter(component => component.subtype === 'vfd')
      .map(component => ({ id: component.id, rotation: Number(component.rotation || 0) }));
    const vfdSymbolAudit = await page.evaluate(vfds => vfds.map(vfd => {
      const element = document.querySelector(`#diagram g.component[data-id="${CSS.escape(vfd.id)}"]`);
      const transform = element?.getAttribute('transform') || '';
      const image = element?.querySelector('image');
      const iconHref = image?.getAttribute('href')
        || image?.getAttribute('xlink:href')
        || '';
      const imageBounds = image?.getBoundingClientRect();
      const fittedScale = imageBounds ? Math.min(imageBounds.width / 64, imageBounds.height / 78) : 0;
      const fittedHeight = 78 * fittedScale;
      const expectedTop = imageBounds ? {
        x: imageBounds.left + (imageBounds.width / 2),
        y: imageBounds.top + ((imageBounds.height - fittedHeight) / 2),
      } : null;
      const expectedBottom = expectedTop ? {
        x: expectedTop.x,
        y: expectedTop.y + fittedHeight,
      } : null;
      const bridgePortPoint = portIndex => {
        const bridge = element?.querySelector(`.component-terminal-bridge[data-port-index="${portIndex}"]`);
        const matrix = bridge?.getScreenCTM();
        const portX = Number(bridge?.dataset.portX);
        const portY = Number(bridge?.dataset.portY);
        return matrix && Number.isFinite(portX) && Number.isFinite(portY)
          ? new DOMPoint(portX, portY).matrixTransform(matrix)
          : null;
      };
      const topPort = bridgePortPoint(0);
      const bottomPort = bridgePortPoint(1);
      const storedComponent = window.dataStore.getOneLine().sheets
        .flatMap(sheet => sheet.components || [])
        .find(component => component.id === vfd.id);
      const endpointOffset = (actual, expected) => actual && expected
        ? Math.hypot(actual.x - expected.x, actual.y - expected.y)
        : -1;
      return {
        ...vfd,
        transform,
        rotated: transform.includes('rotate('),
        iconHref,
        storedType: storedComponent?.type,
        storedSubtype: storedComponent?.subtype,
        storedWidth: storedComponent?.width,
        storedHeight: storedComponent?.height,
        storedPorts: storedComponent?.ports,
        topTerminalOffsetPx: endpointOffset(topPort, expectedTop),
        bottomTerminalOffsetPx: endpointOffset(bottomPort, expectedBottom),
      };
    }), vfdComponents);
    const invalidVfdSymbols = vfdSymbolAudit.filter(row => (
      row.rotation !== 0
      || row.rotated
      || !/\/VFD\.svg(?:\?|$)/.test(row.iconHref)
      || row.topTerminalOffsetPx < 0
      || row.bottomTerminalOffsetPx < 0
      || row.topTerminalOffsetPx > 0.25
      || row.bottomTerminalOffsetPx > 0.25
    ));
    if (invalidVfdSymbols.length) {
      throw new Error(`One-line VFD symbols must use the upright labeled enclosure: ${JSON.stringify(invalidVfdSymbols)}`);
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
        stackingBoundaryLineCount: svg.querySelectorAll('line[stroke-dasharray]').length,
        stackingBoundaryLabelCount: Array.from(svg.querySelectorAll('text')).filter(node => node.textContent === 'DOTTED LINE - STACKING BOUNDARY').length,
      }));
      const missingCableLabels = cables.map(cable => cable.tag).filter(tag => !trayAudit.labels.includes(tag));
      if (missingCableLabels.length) throw new Error(`Tray ${section.trayId} is missing cable identification labels: ${missingCableLabels.join(', ')}`);
      const expectedDividers = Math.max(0, Number(tray.num_slots || 1) - 1);
      if (trayAudit.dividerCount !== expectedDividers) {
        throw new Error(`Tray ${section.trayId} rendered ${trayAudit.dividerCount} dividers; expected ${expectedDividers}.`);
      }
      if (trayAudit.stackingBoundaryLabelCount !== trayAudit.stackingBoundaryLineCount) {
        throw new Error(`Tray ${section.trayId} has ${trayAudit.stackingBoundaryLineCount} dotted stacking boundaries but ${trayAudit.stackingBoundaryLabelCount} labels.`);
      }
      trays.push({
        id: section.trayId,
        cableTags: cables.map(cable => cable.tag),
        material: tray.material,
        dividerCount: trayAudit.dividerCount,
        stackingBoundaryCount: trayAudit.stackingBoundaryLineCount,
        page: 'cabletrayfill.html',
        ...(await captureLocator(page, '#svgContainer svg', path)),
      });
    }

    const ductbanks = [];
    let sharedConduitExamples = 0;
    for (const section of ductbankSections) {
      const id = section.ductbankId;
      const ductbank = project.ductbanks.find(row => row.ductbank_id === id || row.id === id || row.tag === id);
      const conduitIds = new Set((ductbank?.conduits || []).map(conduit => String(conduit.conduit_id)));
      const assignedCables = project.cables.filter(cable => assignedRacewayIds(cable).some(racewayId => conduitIds.has(racewayId)));
      const cableCounts = assignedCables.reduce((counts, cable) => {
        new Set(assignedRacewayIds(cable).filter(racewayId => conduitIds.has(racewayId))).forEach(racewayId => {
          counts.set(racewayId, (counts.get(racewayId) || 0) + 1);
        });
        return counts;
      }, new Map());
      const maximumCablesInOneConduit = Math.max(0, ...cableCounts.values());
      if (maximumCablesInOneConduit >= 2) sharedConduitExamples += 1;
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
      const missingCableLabels = assignedCables.map(cable => cable.tag).filter(tag => !ductbankAudit.labels.includes(tag));
      if (missingCableLabels.length) {
        throw new Error(`Ductbank ${id} is missing assigned cable labels: ${missingCableLabels.join(', ')}`);
      }
      const path = join(outputDir, `ductbank-${safeFileName(id)}.png`);
      ductbanks.push({
        id,
        concreteCoverIn: section.concreteCoverIn,
        conduitCount: ductbankAudit.conduitCount,
        assignedCableCount: assignedCables.length,
        maximumCablesInOneConduit,
        page: `ductbankroute.html?ductbank=${encodeURIComponent(id)}`,
        ...(await captureLocator(page, '#grid', path)),
      });
    }
    if (!sharedConduitExamples) {
      throw new Error('The engineering sample must include at least one ductbank conduit containing multiple cables.');
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
          datablockFormat: 'report',
          datablockDensity: 'expanded',
          componentCount,
          renderedConnectionCount: oneLineConnectionAudit.renderedConnections,
          connectedTerminalBridgeCount: terminalBridgeAudit.length,
          perfectlyMatedTerminalEndpointCount: terminalMatingAudit.length,
          connectionAndTerminalStrokeWidthPx: 3,
          uprightMotorCount: motorOrientationAudit.length,
          uprightVfdCount: vfdSymbolAudit.length,
          perfectlyAlignedVfdTerminalCount: vfdSymbolAudit.length * 2,
          verticallyAlignedBusConnectionCount: busTapAudit.length,
          adjacentBranchClearancePx: Number(adjacentBranchClearance.gapPx.toFixed(1)),
          visiblyConnectedTransformerCount: transformerTerminalAudit.length,
          perfectlyAlignedTransformerTerminalCount: transformerTerminalAudit.length * 2,
          transformerTerminalBridgeDepthPx: 20,
          visiblyConnectedPanelCount: panelTerminalAudit.length,
          perfectlyAlignedPanelTerminalCount: panelTerminalAudit.length,
          singleConnectionPanelCount: panelTerminalAudit.length,
          panelTerminalBridgeDepthPx: 20,
          annotatedProtectiveDeviceCount: reportAnnotationAudit.filter(annotation => annotation.type === 'protective').length,
          annotatedTransformerCount: reportAnnotationAudit.filter(annotation => annotation.type === 'transformer').length,
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
