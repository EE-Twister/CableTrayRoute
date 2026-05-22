import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect } from '@playwright/test';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const RESET_FLAG = '__ctr_heat_trace_e2e_reset_done';

export const heatTracePageUrl = file => `file://${path.join(root, file)}?e2e=1`;

export const HEAT_TRACE_FIXTURES = {
  normal: {
    inputs: {
      pipeNps: '2',
      insulationThicknessIn: 1,
      insulationType: 'mineralWool',
      lineLengthFt: 150,
      pipeMaterial: 'carbonSteel',
      environment: 'indoor-still',
      ambientTempC: 20,
      maintainTempC: 60,
      windSpeedMph: 0,
      safetyMarginPct: 10,
      voltageV: 120,
      heatTraceCableType: 'selfRegulating',
      traceRunCount: 1,
      maxCircuitLengthFt: 300,
    },
    expected: {
      requiredWPerFt: 5.07,
      requiredWPerM: 16.63,
      totalCircuitWatts: 759.9,
      recommendedCableRatingWPerFt: 8,
      recommendedCableRatingWPerM: 26.2,
      installedWPerFt: 8,
      installedTotalWatts: 1200,
      effectiveTraceLengthFt: 150,
      totalResistanceKmPerW: 2.9121,
      warnings: 0,
    },
  },
  windyStainless: {
    inputs: {
      pipeNps: '2',
      insulationThicknessIn: 1,
      insulationType: 'mineralWool',
      lineLengthFt: 150,
      pipeMaterial: 'stainlessSteel',
      environment: 'outdoor-windy',
      ambientTempC: -10,
      maintainTempC: 60,
      windSpeedMph: 15,
      safetyMarginPct: 10,
      voltageV: 120,
      heatTraceCableType: 'selfRegulating',
      traceRunCount: 1,
      maxCircuitLengthFt: 300,
    },
    expected: {
      requiredWPerFt: 9.52,
      totalCircuitWatts: 1427.9,
      recommendedCableRatingWPerFt: 10,
      totalResistanceKmPerW: 2.5888,
    },
  },
  warning: {
    inputs: {
      pipeNps: '2',
      insulationThicknessIn: 0.5,
      insulationType: 'mineralWool',
      lineLengthFt: 550,
      pipeMaterial: 'copper',
      environment: 'outdoor-windy',
      ambientTempC: -35,
      maintainTempC: 80,
      windSpeedMph: 25,
      safetyMarginPct: 20,
      voltageV: 120,
      heatTraceCableType: 'selfRegulating',
      traceRunCount: 1,
      maxCircuitLengthFt: 300,
    },
    expected: {
      requiredWPerFt: 27.13,
      totalCircuitWatts: 14920.5,
      recommendedCableRatingWPerFt: 30,
      effectiveTraceLengthFt: 550,
    },
  },
};

export function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', error => {
    errors.push(error.message);
  });
  return errors;
}

export async function navigateWithHeatTraceStorage(page, file, seedStudies = null) {
  await page.addInitScript(({ resetFlag, studies }) => {
    if (!sessionStorage.getItem(resetFlag)) {
      localStorage.clear();
      sessionStorage.clear();
      const scenario = 'base';
      localStorage.setItem('ctr_current_scenario_v1', scenario);
      localStorage.setItem('ctr_scenarios_v1', JSON.stringify([scenario]));
      localStorage.setItem(`${scenario}:studyResults`, JSON.stringify(studies || {}));
      sessionStorage.setItem(resetFlag, '1');
    }
  }, { resetFlag: RESET_FLAG, studies: seedStudies });
  await page.goto(heatTracePageUrl(file));
  await page.waitForLoadState('networkidle');
}

export async function navigateHeatTrace(page, seedStudies = null) {
  await navigateWithHeatTraceStorage(page, 'heattracesizing.html', seedStudies);
  await expect(page.getByRole('heading', { level: 1, name: 'Heat Trace Sizing' })).toBeVisible();
}

export async function navigateWorkflowDashboard(page, seedStudies = null) {
  await navigateWithHeatTraceStorage(page, 'workflowdashboard.html', seedStudies);
  await expect(page.getByRole('heading', { level: 1, name: /Project Dashboard/ })).toBeVisible();
}

export async function fillHeatTraceInputs(page, fixtureOrInputs, options = {}) {
  const unitSystem = options.unitSystem || 'imperial';
  const inputs = fixtureOrInputs.inputs || fixtureOrInputs;

  await page.locator('#unit-system').selectOption(unitSystem);
  await page.locator('#pipe-nps').selectOption(String(inputs.pipeNps));
  await page.locator('#insulation-type').selectOption(inputs.insulationType || 'mineralWool');
  await page.locator('#pipe-material').selectOption(inputs.pipeMaterial);
  await page.locator('#environment').selectOption(inputs.environment);
  await page.locator('#voltage-v').selectOption(String(inputs.voltageV));
  await page.locator('#heat-trace-cable-type').selectOption(inputs.heatTraceCableType || 'selfRegulating');

  await fillInput(page, '#insulation-thickness-in', displayInsulation(inputs.insulationThicknessIn, unitSystem));
  await fillInput(page, '#line-length-ft', displayLength(inputs.lineLengthFt, unitSystem));
  await fillInput(page, '#ambient-temp-c', displayTemperature(inputs.ambientTempC, unitSystem));
  await fillInput(page, '#maintain-temp-c', displayTemperature(inputs.maintainTempC, unitSystem));
  await fillInput(page, '#wind-speed-mph', displayWindSpeed(inputs.windSpeedMph || 0, unitSystem));
  await fillInput(page, '#design-margin-pct', inputs.safetyMarginPct);
  await fillInput(page, '#trace-run-count', inputs.traceRunCount || 1);
  await fillInput(page, '#max-circuit-length-ft', displayLength(inputs.maxCircuitLengthFt || 0, unitSystem));

  if (inputs.environment === 'buried') {
    await fillInput(page, '#soil-conductivity', inputs.soilThermalConductivityWPerMK || 1.2);
    await fillInput(page, '#burial-depth-ft', displayLength(inputs.burialDepthFt || 3, unitSystem));
  }
}

export async function runHeatTraceAnalysis(page) {
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.locator('#results .heattrace-status-banner')).toBeVisible();
}

export async function readStoredStudies(page) {
  return page.evaluate(() => {
    const scenario = localStorage.getItem('ctr_current_scenario_v1') || 'base';
    const scenarioRaw = localStorage.getItem(`${scenario}:studyResults`);
    if (scenarioRaw) return JSON.parse(scenarioRaw);
    return JSON.parse(localStorage.getItem('studyResults') || '{}');
  });
}

export async function readStoredHeatTraceResult(page) {
  const studies = await readStoredStudies(page);
  return studies.heatTraceSizing || null;
}

export function expectApprox(actual, expected, tolerance = 0.01) {
  expect(Math.abs(Number(actual) - Number(expected))).toBeLessThanOrEqual(tolerance);
}

export function assertHeatTraceResult(result, expected) {
  expect(result).toBeTruthy();
  if (expected.requiredWPerFt != null) expectApprox(result.requiredWPerFt, expected.requiredWPerFt, 0.01);
  if (expected.requiredWPerM != null) expectApprox(result.requiredWPerM, expected.requiredWPerM, 0.05);
  if (expected.totalCircuitWatts != null) expectApprox(result.totalCircuitWatts, expected.totalCircuitWatts, 0.1);
  if (expected.recommendedCableRatingWPerFt != null) {
    expect(result.recommendedCableRatingWPerFt).toBe(expected.recommendedCableRatingWPerFt);
  }
  if (expected.installedWPerFt != null) expectApprox(result.installedWPerFt, expected.installedWPerFt, 0.01);
  if (expected.installedTotalWatts != null) expectApprox(result.installedTotalWatts, expected.installedTotalWatts, 0.1);
  if (expected.effectiveTraceLengthFt != null) expectApprox(result.effectiveTraceLengthFt, expected.effectiveTraceLengthFt, 0.1);
  if (expected.totalResistanceKmPerW != null) {
    expectApprox(result.thermalResistance?.totalKmPerW, expected.totalResistanceKmPerW, 0.0001);
  }
  if (expected.warnings != null) {
    expect(Array.isArray(result.warnings) ? result.warnings.length : 0).toBe(expected.warnings);
  }
}

export async function getSvgPathData(page, selector) {
  return page.locator(`${selector} path[d]`).evaluateAll(paths => paths.map(path => path.getAttribute('d') || ''));
}

export async function saveWorkbookDownload(download, expectedNamePattern) {
  const downloadName = download.suggestedFilename();
  expect(downloadName).toMatch(expectedNamePattern);
  expect(downloadName.toLowerCase().endsWith('.xlsx')).toBeTruthy();

  const tempPath = path.join(os.tmpdir(), `playwright-${Date.now()}-${downloadName}`);
  await download.saveAs(tempPath);
  const stats = await fs.stat(tempPath);
  expect(stats.size).toBeGreaterThan(0);

  const workbook = XLSX.readFile(tempPath);
  const rowsBySheet = Object.fromEntries(workbook.SheetNames.map(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    return [sheetName, rows.map(row => row.map(value => String(value ?? '')))];
  }));
  return { path: tempPath, sheetNames: workbook.SheetNames, rowsBySheet };
}

async function fillInput(page, selector, value) {
  await page.locator(selector).fill(String(value));
}

function displayInsulation(value, unitSystem) {
  return unitSystem === 'metric' ? round(value * 25.4, 2) : value;
}

function displayLength(value, unitSystem) {
  return unitSystem === 'metric' ? round(value * 0.3048, 2) : value;
}

function displayTemperature(valueC, unitSystem) {
  return unitSystem === 'metric' ? valueC : round((valueC * 9 / 5) + 32, 2);
}

function displayWindSpeed(valueMph, unitSystem) {
  return unitSystem === 'metric' ? round(valueMph * 1.60934, 2) : valueMph;
}

function round(value, decimals) {
  return Number(value).toFixed(decimals).replace(/\.?0+$/, '');
}
