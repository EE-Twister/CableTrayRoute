import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.CTR_BASE_URL || 'http://127.0.0.1:3000';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function serverIsReady() {
  try {
    return (await fetch(`${baseUrl}/oneline.html`)).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverIsReady()) return null;
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await serverIsReady()) return server;
    await delay(100);
  }
  server.kill();
  throw new Error('Local application server did not become ready.');
}

function profileFor(component) {
  const type = String(component.type || '').toLowerCase();
  const subtype = String(component.subtype || '').toLowerCase();
  const label = String(component.label || '').toLowerCase();
  const signature = `${type} ${subtype} ${label}`;
  if (type === 'utility_source' || signature.includes('utility')) return 'utility';
  if (type === 'bus') return 'bus';
  if (type === 'busway') return 'busway';
  if (type === 'generator') return 'generator';
  if (type === 'transformer') return subtype === 'three_winding' ? 'transformer3' : 'transformer';
  if (subtype === 'ats' || subtype === 'double_throw') return 'transferSwitch';
  if (type === 'ups' || signature.includes('ups')) return 'ups';
  if (type === 'panel' || signature.includes('panel')) return 'panel';
  if (['vfd', 'soft_starter', 'motor_starter', 'combination_starter'].includes(type) || signature.includes('vfd') || signature.includes('starter')) return 'controller';
  if (['switchboard', 'switchgear', 'mcc', 'equipment'].includes(type)) return 'equipment';
  if (['breaker', 'fuse', 'switch', 'disconnect', 'relay', 'recloser', 'contactor', 'meter', 'current_transformer', 'voltage_transformer'].includes(type)) return 'inlineDevice';
  if (signature.includes('breaker') || signature.includes('fuse') || signature.includes('disconnect') || signature.includes('switch') || signature.includes('relay') || signature.includes('meter')) return 'inlineDevice';
  if (['motor', 'motor_load'].includes(type) || subtype.includes('motor')) return 'motor';
  if (type === 'static_load' || subtype.includes('static_load')) return 'load';
  if (type === 'shunt_capacitor_bank' || subtype.includes('capacitor') || subtype.includes('cap')) return 'capacitor';
  if (type === 'reactor') return 'reactor';
  return '';
}

function geometryFor(component) {
  const profile = profileFor(component);
  const geometries = {
    utility: [64, 64, [[32, 64]]],
    ups: [72, 82, [[36, 0], [36, 82]]],
    panel: [64, 76, [[32, 0], [32, 76]]],
    equipment: [70, 82, [[35, 0], [35, 82]]],
    controller: [64, 78, [[32, 0], [32, 78]]],
    inlineDevice: [56, 72, [[28, 0], [28, 72]]],
    transferSwitch: [72, 72, [[18, 0], [54, 0], [36, 72]]],
    transformer: [76, 84, [[38, 0], [38, 84]]],
    transformer3: [86, 92, [[43, 0], [26, 92], [60, 92]]],
    generator: [68, 68, [[34, 68]]],
    motor: [64, 64, [[32, 0]]],
    load: [64, 64, [[32, 0]]],
    capacitor: [64, 64, [[32, 0]]],
    reactor: [64, 64, [[32, 0]]],
    busway: [160, 22, [[0, 11], [160, 11]]],
    bus: [260, 20, [[0, 10], [260, 10]]]
  };
  if (geometries[profile]) {
    const [width, height, ports] = geometries[profile];
    return { width, height, ports: ports.map(([x, y]) => ({ x, y })) };
  }
  const width = Number(component.width) || 80;
  const height = Number(component.height) || 40;
  const ports = Array.isArray(component.ports) && component.ports.length
    ? component.ports
    : [{ x: width / 2, y: 0 }, { x: width / 2, y: height }];
  return { width, height, ports };
}

const server = await ensureServer();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/oneline.html?e2e=1&e2e_reset=1`, { waitUntil: 'load' });
  const library = await page.evaluate(async () => (await fetch('./componentLibrary.json')).json());
  const inputs = library.components
    .filter(component => component.icon && !['annotation', 'dimension'].includes(component.type))
    .flatMap(component => {
      const geometry = geometryFor(component);
      return ['ANSI', 'IEC'].map(standard => ({
        subtype: component.subtype,
        label: component.label,
        standard,
        icon: standard === 'IEC' && component.iconIEC ? component.iconIEC : component.icon,
        stretchIcon: profileFor(component) === 'bus',
        terminalLeadLength: ['cable', 'busway'].includes(String(component.type || '').toLowerCase()) ? 20 : 0,
        ...geometry
      }));
    });
  const results = await page.evaluate(async entries => {
    const scale = 4;
    const sampleRadius = 2.5;
    async function loadImage(url) {
      const source = await (await fetch(url)).text();
      const viewBox = source.match(/viewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i);
      if (!viewBox) throw new Error(`Unable to read viewBox for ${url}`);
      const sourceWidth = Number(viewBox[3]);
      const sourceHeight = Number(viewBox[4]);
      const blobUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      const image = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load ${url}`));
        image.src = blobUrl;
      });
      return { image, sourceWidth, sourceHeight, blobUrl };
    }
    return Promise.all(entries.map(async entry => {
      const { image, sourceWidth, sourceHeight, blobUrl } = await loadImage(entry.icon);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(entry.width * scale);
      canvas.height = Math.ceil(entry.height * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.clearRect(0, 0, canvas.width, canvas.height);
      const fitScale = Math.min(entry.width / sourceWidth, entry.height / sourceHeight);
      const drawWidth = entry.stretchIcon ? entry.width : sourceWidth * fitScale;
      const drawHeight = entry.stretchIcon ? entry.height : sourceHeight * fitScale;
      const offsetX = (entry.width - drawWidth) / 2;
      const offsetY = (entry.height - drawHeight) / 2;
      context.drawImage(image, offsetX * scale, offsetY * scale, drawWidth * scale, drawHeight * scale);
      URL.revokeObjectURL(blobUrl);
      if (entry.terminalLeadLength > 0) {
        context.strokeStyle = '#111827';
        context.lineWidth = 2.5 * scale;
        entry.ports.forEach(port => {
          const dx = (entry.width / 2) - port.x;
          const dy = (entry.height / 2) - port.y;
          const distance = Math.hypot(dx, dy);
          if (!distance) return;
          const length = Math.min(entry.terminalLeadLength, Math.max(0, distance - 2));
          context.beginPath();
          context.moveTo(port.x * scale, port.y * scale);
          context.lineTo((port.x + dx * (length / distance)) * scale, (port.y + dy * (length / distance)) * scale);
          context.stroke();
        });
      }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      function hasInk(x, y) {
        const px = Math.round(x * scale);
        const py = Math.round(y * scale);
        const radius = Math.ceil(sampleRadius * scale);
        for (let yy = py - radius; yy <= py + radius; yy++) {
          if (yy < 0 || yy >= canvas.height) continue;
          for (let xx = px - radius; xx <= px + radius; xx++) {
            if (xx < 0 || xx >= canvas.width) continue;
            if (pixels[((yy * canvas.width) + xx) * 4 + 3] > 24) return true;
          }
        }
        return false;
      }
      const portResults = entry.ports.map(port => {
        const center = { x: entry.width / 2, y: entry.height / 2 };
        const dx = center.x - port.x;
        const dy = center.y - port.y;
        const distance = Math.hypot(dx, dy);
        let firstInk = null;
        for (let step = 0; step <= distance; step += 0.25) {
          const ratio = distance ? step / distance : 0;
          if (hasInk(port.x + dx * ratio, port.y + dy * ratio)) {
            firstInk = step;
            break;
          }
        }
        return { ...port, gapPx: firstInk === null ? null : Number(firstInk.toFixed(2)) };
      });
      return {
        subtype: entry.subtype,
        label: entry.label,
        standard: entry.standard,
        icon: entry.icon,
        width: entry.width,
        height: entry.height,
        ports: portResults,
        maxGapPx: Math.max(...portResults.map(port => port.gapPx ?? Number.POSITIVE_INFINITY))
      };
    }));
  }, inputs);

  const failures = results.filter(result => !Number.isFinite(result.maxGapPx) || result.maxGapPx > 1);
  console.log(JSON.stringify({ audited: results.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  server?.kill();
}
