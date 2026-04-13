import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

export const pageUrl = file => `file://${path.join(root, file)}?e2e=1&e2e_reset=1`;

export const COST_ESTIMATOR_FIXTURES = {
  baselineProject: {
    cableSchedule: [
      { cable_tag: 'C-101', conductor_size: '4 AWG', conductors: 3, length_ft: 150 },
    ],
    traySchedule: [
      { tray_id: 'T-101', tray_type: 'Ladder', inside_width: '12', length_ft: 120, fitting_count: 2 },
    ],
    conduitSchedule: [
      { conduit_id: 'CD-101', conduit_type: 'EMT', trade_size: '2', length_ft: 80 },
    ],
    studyResults: {
      routeResults: [{ cable: 'C-101', total_length: 150 }],
    },
  },
  highContingency: {
    contingencyPct: '35',
  },
  laborOverrideScenario: {
    laborCableRate: '95',
    laborTrayRate: '110',
    laborConduitRate: '105',
  },
  emptyInvalidInputScenario: {
    cableSchedule: [],
    traySchedule: [],
    conduitSchedule: [],
    studyResults: {},
    contingencyPct: 'not-a-number',
    laborCableRate: '',
    laborTrayRate: 'invalid',
    laborConduitRate: '',
  },
};

export async function navigateForE2E(page, file) {
  await page.goto(pageUrl(file));
  await page.waitForLoadState('networkidle');
}

export async function applyCostEstimatorFixture(page, fixture) {
  await page.evaluate(data => {
    const scenario = 'base';
    localStorage.setItem('ctr_current_scenario_v1', scenario);
    localStorage.setItem('ctr_scenarios_v1', JSON.stringify([scenario]));
    localStorage.setItem(`${scenario}:cableSchedule`, JSON.stringify(data.cableSchedule || []));
    localStorage.setItem(`${scenario}:traySchedule`, JSON.stringify(data.traySchedule || []));
    localStorage.setItem(`${scenario}:conduitSchedule`, JSON.stringify(data.conduitSchedule || []));
    localStorage.setItem(`${scenario}:studyResults`, JSON.stringify(data.studyResults || {}));
  }, fixture);
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

export async function getCostEstimateContingencyAmount(page) {
  const contingencyText = await page.locator('tr:has(th:has-text("Contingency")) td').last().innerText();
  return parseCurrency(contingencyText);
}

export async function getEmfRmsMicroTesla(page) {
  const rowValue = await page.locator('tr:has(th:has-text("RMS Flux Density")) td strong').innerText();
  const match = rowValue.match(/([\d.]+)\s*µT/);
  return match ? Number.parseFloat(match[1]) : null;
}
