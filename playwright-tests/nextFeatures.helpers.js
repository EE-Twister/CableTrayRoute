import path from 'path';
import { fileURLToPath } from 'url';
import { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

export const pageUrl = file => `file://${path.join(root, file)}?e2e=1&e2e_reset=1`;

// README(sync): source-of-truth is docs/next-features-acceptance.md lines
// 94-135 (CE-Normal-01 + CE-Boundary-01/02) and 210-217 (numeric policy).
export const COST_ESTIMATOR_CANONICAL_FIXTURE = {
  projectData: {
    cableSchedule: [
      { cable_tag: 'C-1', conductor_size: '4 AWG', conductors: 3, length_ft: 100 },
      { cable_tag: 'C-2', conductor_size: '2/0', conductors: 1, length_ft: 250 },
    ],
    traySchedule: [
      { tray_id: 'T-1', tray_type: 'Ladder', inside_width: '12', length_ft: 80, fitting_count: 2 },
    ],
    conduitSchedule: [
      { conduit_id: 'CD-1', conduit_type: 'EMT', trade_size: '2', length_ft: 120 },
    ],
    studyResults: {
      routeResults: [
        { cable: 'C-1', total_length: 100 },
        { cable: 'C-2', total_length: 250 },
      ],
    },
  },
  expected: {
    cableSubtotal: 2486,
    traySubtotal: 980,
    conduitSubtotal: 756,
    subtotal: 4222,
    contingencyPct: 15,
    contingencyAmountRounded: 633,
    totalRounded: 4855,
    contingencyFloorPct: 0,
    contingencyCeilingPct: 100,
  },
  tolerances: {
    internalMathAbs: 0.01,
    uiWholeDollarsAbs: 0,
  },
};

// README(sync): source-of-truth is docs/next-features-acceptance.md lines
// 158-188 (EMF-Normal-01 + EMF-Boundary-01/02) and 225-233 (numeric policy).
export const EMF_CANONICAL_FIXTURE = {
  defaultGeometry: {
    frequency: '60',
    loadCurrent: '100',
    nCables: '1',
    trayWidth: '12',
    cableOd: '1.0',
    measDistance: '36',
  },
  boundaryCurrents: {
    nearGeneralPublicBoundary: '10150',
    overGeneralPublicBoundary: '10500',
    nearOccupationalBoundary: '50750',
  },
  expected: {
    normalBrmsMicroTesla: 1.97,
    normalBpeakMicroTesla: 2.786,
  },
  tolerances: {
    brmsLowCurrentAbs: 0.02,
    bpeakLowCurrentAbs: 0.03,
    boundaryMicroTeslaAbs: 1.0,
  },
};

export const COST_ESTIMATOR_FIXTURES = {
  baselineProject: COST_ESTIMATOR_CANONICAL_FIXTURE.projectData,
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

export async function setupCEPage(page, fixture = null) {
  await navigateForE2E(page, 'costestimate.html');
  if (fixture) {
    await applyCostEstimatorFixture(page, fixture);
  }
}

export async function setupEMFPage(page) {
  await navigateForE2E(page, 'emf.html');
}

export async function fillCEInputs(page, overrides = {}) {
  const values = {
    contingencyPct: '10',
    laborCableRate: '68',
    laborTrayRate: '61',
    laborConduitRate: '58',
    fittingPrice: '72',
    ...overrides,
  };

  await page.getByLabel('Contingency (%)').fill(values.contingencyPct);
  const details = page.locator('#price-overrides');
  if (!(await details.evaluate(el => el.hasAttribute('open')))) {
    await details.locator('summary').click();
  }
  await page.getByLabel('Labor ($/ft, cable)').fill(values.laborCableRate);
  await page.getByLabel('Labor ($/ft, tray)').fill(values.laborTrayRate);
  await page.getByLabel('Labor ($/ft, conduit)').fill(values.laborConduitRate);
  await page.getByLabel('Tray fitting unit price ($)').fill(values.fittingPrice);
}

export async function runCEEstimate(page) {
  await page.getByRole('button', { name: 'Generate Estimate' }).click();
}

export async function runCEXlsxExport(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export XLSX' }).click();
  return downloadPromise;
}

export async function assertCESmokeControls(page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Project Cost Estimator' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Estimate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export XLSX' })).toBeVisible();
}

export async function fillEMFInputs(page, overrides = {}) {
  const values = {
    frequency: '60',
    loadCurrent: '180',
    nCables: '2',
    trayWidth: '18',
    cableOd: '1.2',
    measDistance: '48',
    ...overrides,
  };

  await page.getByLabel('Frequency (Hz)').selectOption(values.frequency);
  await page.getByLabel('Load Current per Phase (A)').fill(values.loadCurrent);
  await page.getByLabel('Number of Parallel Cable Sets').fill(values.nCables);
  await page.getByLabel('Tray Width (in)').fill(values.trayWidth);
  await page.getByLabel('Cable O.D. (in)').fill(values.cableOd);
  await page.getByLabel('Measurement Distance from Tray Edge (in)').fill(values.measDistance);
}

export async function runEMFCalculate(page) {
  await page.getByRole('button', { name: 'Calculate Field' }).click();
}

export async function runEMFProfile(page) {
  await page.getByRole('button', { name: /Field Profile/ }).click();
}

export async function assertEMFSmokeControls(page) {
  await expect(page.getByRole('heading', { level: 1, name: /EMF/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate Field' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Field Profile/ })).toBeVisible();
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
