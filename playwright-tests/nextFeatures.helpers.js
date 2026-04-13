import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

export const pageUrl = file => `file://${path.join(root, file)}?e2e=1&e2e_reset=1`;

export async function navigateForE2E(page, file) {
  await page.goto(pageUrl(file));
  await page.waitForLoadState('networkidle');
}

export async function fillCostEstimatorForm(page, overrides = {}) {
  const values = {
    contingencyPct: '10',
    laborCableRate: '68',
    laborTrayRate: '61',
    laborConduitRate: '58',
    fittingPrice: '72',
    ...overrides,
  };

  await page.fill('#contingency-pct', values.contingencyPct);
  const details = page.locator('#price-overrides');
  if (!(await details.evaluate(el => el.hasAttribute('open')))) {
    await page.click('#price-overrides > summary');
  }
  await page.fill('#labor-cable-rate', values.laborCableRate);
  await page.fill('#labor-tray-rate', values.laborTrayRate);
  await page.fill('#labor-conduit-rate', values.laborConduitRate);
  await page.fill('#fitting-price', values.fittingPrice);
}

export async function fillEmfForm(page, overrides = {}) {
  const values = {
    frequency: '60',
    loadCurrent: '180',
    nCables: '2',
    trayWidth: '18',
    cableOd: '1.2',
    measDistance: '48',
    ...overrides,
  };

  await page.selectOption('#frequency', values.frequency);
  await page.fill('#load-current', values.loadCurrent);
  await page.fill('#n-cables', values.nCables);
  await page.fill('#tray-width', values.trayWidth);
  await page.fill('#cable-od', values.cableOd);
  await page.fill('#meas-distance', values.measDistance);
}

export async function getResultText(page, selector = '#results') {
  return page.locator(selector).innerText();
}

export function parseCurrency(text) {
  const match = text.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  return Number.parseFloat(match[1].replace(/,/g, ''));
}

export async function getCostEstimateGrandTotal(page) {
  const grandTotalText = await page.locator('.summary-grand-total td strong').innerText();
  return parseCurrency(grandTotalText);
}

export async function getEmfRmsMicroTesla(page) {
  const rowValue = await page.locator('tr:has(th:has-text("RMS Flux Density")) td strong').innerText();
  const match = rowValue.match(/([\d.]+)\s*µT/);
  return match ? Number.parseFloat(match[1]) : null;
}
