import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  navigateForE2E,
  applyCostEstimatorFixture,
  COST_ESTIMATOR_FIXTURES,
  COST_ESTIMATOR_CANONICAL_FIXTURE,
  EMF_CANONICAL_FIXTURE,
  setupCEPage,
  setupEMFPage,
  fillCEInputs,
  fillEMFInputs,
  runCEEstimate,
  runCEXlsxExport,
  runEMFCalculate,
  runEMFProfile,
  getResultText,
  getEmfRmsMicroTesla,
} from './nextFeatures.helpers.js';

const execFileAsync = promisify(execFile);

async function assertExportDownload(download, expectedName) {
  const downloadName = download.suggestedFilename();
  expect(downloadName).toBe(expectedName);
  expect(downloadName.toLowerCase().endsWith('.xlsx')).toBeTruthy();

  const tempPath = path.join(os.tmpdir(), `playwright-${Date.now()}-${downloadName}`);
  await download.saveAs(tempPath);
  const stats = await fs.stat(tempPath);
  expect(stats.size).toBeGreaterThan(0);

  return tempPath;
}

function escPy(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function readWorkbookRows(filePath) {
  const pythonScript = `
import json
import zipfile
import xml.etree.ElementTree as ET

path = '${escPy(filePath)}'
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
rels_ns = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}

def col_key(cell_ref):
    letters = ''.join([ch for ch in cell_ref if ch.isalpha()])
    value = 0
    for ch in letters:
        value = value * 26 + (ord(ch) - 64)
    return value

with zipfile.ZipFile(path, 'r') as zf:
    shared = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', ns):
            txt = ''.join(t.text or '' for t in si.findall('.//m:t', ns))
            shared.append(txt)

    workbook = ET.fromstring(zf.read('xl/workbook.xml'))
    wb_rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rel_map = {rel.attrib['Id']: rel.attrib['Target'] for rel in wb_rels.findall('r:Relationship', rels_ns)}

    by_name = {}
    for sheet in workbook.findall('m:sheets/m:sheet', ns):
        name = sheet.attrib.get('name', '')
        rel_id = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        target = rel_map.get(rel_id, '')
        if target and not target.startswith('xl/'):
            target = f"xl/{target}"

        sheet_root = ET.fromstring(zf.read(target))
        rows = []
        for row in sheet_root.findall('m:sheetData/m:row', ns):
            values = []
            for c in sorted(row.findall('m:c', ns), key=lambda cell: col_key(cell.attrib.get('r', 'A1'))):
                ctype = c.attrib.get('t')
                v = c.find('m:v', ns)
                if ctype == 's' and v is not None and v.text is not None:
                    idx = int(v.text)
                    values.append(shared[idx] if idx < len(shared) else '')
                elif ctype == 'inlineStr':
                    t = c.find('m:is/m:t', ns)
                    values.append((t.text if t is not None else '') or '')
                elif v is not None and v.text is not None:
                    values.append(v.text)
                else:
                    values.append('')
            rows.append(values)
        by_name[name] = rows

print(json.dumps(by_name))
`;

  const { stdout } = await execFileAsync('python3', ['-c', pythonScript], { maxBuffer: 1024 * 1024 * 5 });
  return JSON.parse(stdout);
}

test.describe('next features integration: cost estimator scenarios and exports', () => {
  test('acceptance CE-01 [cost estimator] [AT-CE-01]: baseline fixture renders deterministic rounded totals', async ({ page }) => {
    await setupCEPage(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Project Cost Estimator' })).toBeVisible();

    await applyCostEstimatorFixture(page, COST_ESTIMATOR_FIXTURES.baselineProject);
    await fillCEInputs(page, { contingencyPct: String(COST_ESTIMATOR_CANONICAL_FIXTURE.expected.contingencyPct) });

    await runCEEstimate(page);
    const results = page.locator('#results');

    await expect(results).toContainText(`Contingency (${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.contingencyPct}%)`);
    await expect(results).toContainText('Grand Total (incl. contingency)');
    await expect(results.locator('table[aria-label="Cost summary by category"] tbody tr')).toHaveCount(3);

    await expect(results.locator('tr:has(th:has-text("Subtotal")) td strong')).toHaveText(
      `$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.subtotal.toLocaleString()}`,
    );
    await expect(results.locator('tr:has(th:has-text("Contingency")) td').last()).toHaveText(
      `$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.contingencyAmountRounded.toLocaleString()}`,
    );
    await expect(results.locator('.summary-grand-total td strong')).toHaveText(
      `$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.totalRounded.toLocaleString()}`,
    );
    await expect(results.locator('tr:has(th:has-text("Contingency")) td').last()).toHaveText(/^\$[\d,]+$/);
    await expect(results.locator('.summary-grand-total td strong')).toHaveText(/^\$[\d,]+$/);
  });

  test('acceptance CE-02 [cost estimator] [AT-CE-02]: contingency boundaries at 0% and 100% preserve expected labels/totals', async ({ page }) => {
    await setupCEPage(page, COST_ESTIMATOR_FIXTURES.baselineProject);
    const expected = COST_ESTIMATOR_CANONICAL_FIXTURE.expected;
    const subtotalFormatted = `$${expected.subtotal.toLocaleString()}`;

    await fillCEInputs(page, { contingencyPct: String(expected.contingencyFloorPct) });
    await runCEEstimate(page);
    const results = page.locator('#results');
    await expect(results.locator('tr:has(th:has-text("Contingency")) th')).toHaveText('Contingency (0%)');
    await expect(results.locator('tr:has(th:has-text("Contingency")) td').last()).toHaveText('$0');
    await expect(results.locator('tr:has(th:has-text("Subtotal")) td strong')).toHaveText(subtotalFormatted);
    await expect(results.locator('.summary-grand-total td strong')).toHaveText(subtotalFormatted);

    await fillCEInputs(page, { contingencyPct: String(expected.contingencyCeilingPct) });
    await runCEEstimate(page);
    await expect(results.locator('tr:has(th:has-text("Contingency")) th')).toHaveText('Contingency (100%)');
    await expect(results.locator('tr:has(th:has-text("Subtotal")) td strong')).toHaveText(subtotalFormatted);
    await expect(results.locator('.summary-grand-total td strong')).toHaveText(`$${(expected.subtotal * 2).toLocaleString()}`);
    await expect(results.locator('.summary-grand-total td strong')).toHaveText(/^\$[\d,]+$/);
  });

  test('acceptance CE-03 [cost estimator] [AT-CE-03]: empty data shows guidance and does not render estimate tables', async ({ page }) => {
    await setupCEPage(page);
    await applyCostEstimatorFixture(page, COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario);
    await fillCEInputs(page, {
      contingencyPct: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.contingencyPct,
      laborCableRate: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.laborCableRate,
      laborTrayRate: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.laborTrayRate,
      laborConduitRate: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.laborConduitRate,
    });
    await runCEEstimate(page);

    const results = page.locator('#results');
    await expect(results).toContainText('No project data found. Add cables and raceways to the schedules first.');
    await expect(results.locator('table')).toHaveCount(0);
  });

  test('acceptance CE-04 [cost estimator] [AT-CE-04]: xlsx export guardrail before estimate and parity after estimate', async ({ page }) => {
    await setupCEPage(page, COST_ESTIMATOR_FIXTURES.baselineProject);

    await page.getByRole('button', { name: 'Export XLSX' }).click();
    const guardrailDialog = page.getByRole('dialog');
    await expect(guardrailDialog).toContainText('No Data');
    await expect(guardrailDialog).toContainText('Run the estimate first before exporting.');
    await guardrailDialog.getByRole('button', { name: 'Close' }).click();

    const expected = COST_ESTIMATOR_CANONICAL_FIXTURE.expected;
    await fillCEInputs(page, { contingencyPct: String(expected.contingencyPct) });
    await runCEEstimate(page);
    const results = page.locator('#results');

    const uiContingencyLabel = (await results.locator('tr:has(th:has-text("Contingency")) th').innerText()).trim();
    const uiSubtotal = (await results.locator('tr:has(th:has-text("Subtotal")) td strong').innerText()).trim();
    const uiContingency = (await results.locator('tr:has(th:has-text("Contingency")) td').last().innerText()).trim();
    const uiGrandTotal = (await results.locator('.summary-grand-total td strong').innerText()).trim();

    expect(uiContingencyLabel).toBe(`Contingency (${expected.contingencyPct}%)`);
    expect(uiSubtotal).toMatch(/^\$[\d,]+$/);
    expect(uiContingency).toMatch(/^\$[\d,]+$/);
    expect(uiGrandTotal).toMatch(/^\$[\d,]+$/);

    const download = await runCEXlsxExport(page);
    const savedPath = await assertExportDownload(download, 'cost_estimate.xlsx');
    const workbookRows = await readWorkbookRows(savedPath);
    const summaryRows = workbookRows.Summary || [];

    const findRow = firstCell => summaryRows.find(row => row?.[0] === firstCell) || [];
    const summarySubtotal = findRow('Subtotal');
    const summaryContingency = findRow(`Contingency (${expected.contingencyPct}%)`);
    const summaryGrand = findRow('Grand Total');

    expect(summaryContingency[0]).toBe(uiContingencyLabel);
    expect(summarySubtotal[3]).toBe(String(expected.subtotal));
    expect(summaryContingency[3]).toBe(String(expected.contingencyAmountRounded));
    expect(summaryGrand[3]).toBe(String(expected.totalRounded));
  });

  test('integration: submittal preview scenario renders expected structured output', async ({ page }) => {
    await navigateForE2E(page, 'submittal.html');

    await page.fill('#sub-project-name', 'Integration Test Project');
    await page.fill('#sub-project-number', 'ITP-0426');
    await page.fill('#sub-engineer', 'A. Engineer, PE');
    await page.selectOption('#sub-nec-edition', '2023');
    await page.click('#preview-btn');

    const previewText = await getResultText(page, '#submittal-preview');
    expect(previewText).toContain('Integration Test Project');
    expect(previewText).toContain('ITP-0426');
    expect(previewText).toContain('NEC 2023');
  });

  test('integration: submittal xlsx export downloads expected file', async ({ page }) => {
    await navigateForE2E(page, 'submittal.html');

    await page.fill('#sub-project-name', 'Integration Test Project');
    await page.fill('#sub-project-number', 'ITP-0426');
    await page.fill('#sub-revision', '3');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-xlsx-btn');
    const download = await downloadPromise;

    await assertExportDownload(download, 'submittal_ITP-0426_Rev3.xlsx');
  });
});

test.describe('next features integration: emf acceptance cases', () => {
  test('acceptance EMF-01 [emf] [AT-EMF-01]: nominal B_rms/B_peak outputs stay within tolerance and PASS limits', async ({ page }) => {
    await setupEMFPage(page);
    await fillEMFInputs(page, EMF_CANONICAL_FIXTURE.defaultGeometry);
    await runEMFCalculate(page);

    await expect(page.locator('tr:has(th:has-text("Frequency")) td')).toHaveText(
      `${EMF_CANONICAL_FIXTURE.defaultGeometry.frequency} Hz`,
    );

    const rmsCell = page.locator('tr:has(th:has-text("RMS Flux Density")) td strong');
    await expect(rmsCell).toHaveText(/^\d+\.\d{3}\sµT$/);
    const rms = await getEmfRmsMicroTesla(page);
    expect(rms).not.toBeNull();
    expect(Math.abs(rms - EMF_CANONICAL_FIXTURE.expected.normalBrmsMicroTesla)).toBeLessThanOrEqual(
      EMF_CANONICAL_FIXTURE.tolerances.brmsLowCurrentAbs,
    );

    const peakText = await page.locator('tr:has(th:has-text("Peak Flux Density")) td strong').innerText();
    expect(peakText).toMatch(/^\d+\.\d{3}\sµT$/);
    const peak = Number.parseFloat(peakText.replace(' µT', ''));
    expect(Math.abs(peak - EMF_CANONICAL_FIXTURE.expected.normalBpeakMicroTesla)).toBeLessThanOrEqual(
      EMF_CANONICAL_FIXTURE.tolerances.bpeakLowCurrentAbs,
    );

    const resultText = await getResultText(page, '#results');
    expect(resultText).toContain('ICNIRP 2010 Compliance');
    await expect(page.locator('tr:has(th:has-text("ICNIRP Occupational")) .status-badge.result-ok')).toHaveText('PASS');
    await expect(page.locator('tr:has(th:has-text("ICNIRP General Public")) .status-badge.result-ok')).toHaveText('PASS');
    await expect(page.locator('#results .status-badge', { hasText: 'PASS' })).toHaveCount(2);
    await expect(page.locator('#results .status-badge')).toHaveText(['PASS', 'PASS']);
  });

  test('acceptance EMF-02 [emf] [AT-EMF-02]: threshold boundaries enforce public and occupational pass-fail transitions', async ({ page }) => {
    await setupEMFPage(page);

    await fillEMFInputs(page, {
      ...EMF_CANONICAL_FIXTURE.defaultGeometry,
      loadCurrent: EMF_CANONICAL_FIXTURE.boundaryCurrents.nearGeneralPublicBoundary,
    });
    await runEMFCalculate(page);

    const nearPublicBoundaryRms = await getEmfRmsMicroTesla(page);
    expect(nearPublicBoundaryRms).not.toBeNull();
    expect(Math.abs(nearPublicBoundaryRms - 200)).toBeLessThanOrEqual(EMF_CANONICAL_FIXTURE.tolerances.boundaryMicroTeslaAbs);
    await expect(page.locator('tr:has(th:has-text("ICNIRP Occupational")) .status-badge.result-ok')).toHaveText('PASS');
    await expect(page.locator('tr:has(th:has-text("ICNIRP General Public")) .status-badge.result-ok')).toHaveText('PASS');

    await fillEMFInputs(page, {
      ...EMF_CANONICAL_FIXTURE.defaultGeometry,
      loadCurrent: EMF_CANONICAL_FIXTURE.boundaryCurrents.overGeneralPublicBoundary,
    });
    await runEMFCalculate(page);
    await expect(page.locator('tr:has(th:has-text("ICNIRP Occupational")) .status-badge.result-ok')).toHaveText('PASS');
    await expect(page.locator('tr:has(th:has-text("ICNIRP General Public")) .status-badge.result-fail')).toHaveText('FAIL');
    await expect(page.locator('#results .status-badge')).toHaveText(['PASS', 'FAIL']);

    await fillEMFInputs(page, {
      ...EMF_CANONICAL_FIXTURE.defaultGeometry,
      loadCurrent: EMF_CANONICAL_FIXTURE.boundaryCurrents.nearOccupationalBoundary,
    });
    await runEMFCalculate(page);

    const nearOccupationalBoundaryRms = await getEmfRmsMicroTesla(page);
    expect(nearOccupationalBoundaryRms).not.toBeNull();
    expect(Math.abs(nearOccupationalBoundaryRms - 1000)).toBeLessThanOrEqual(EMF_CANONICAL_FIXTURE.tolerances.boundaryMicroTeslaAbs);
    await expect(page.locator('tr:has(th:has-text("ICNIRP Occupational")) .status-badge.result-fail')).toHaveText('FAIL');
    await expect(page.locator('tr:has(th:has-text("ICNIRP General Public")) .status-badge.result-fail')).toHaveText('FAIL');
    await expect(page.locator('#results .status-badge')).toHaveText(['FAIL', 'FAIL']);
  });

  test('acceptance EMF-03 [emf] [AT-EMF-03]: field profile starts hidden then renders a non-empty chart/path payload', async ({ page }) => {
    await setupEMFPage(page);
    await fillEMFInputs(page, EMF_CANONICAL_FIXTURE.defaultGeometry);

    const chartContainer = page.locator('#profile-container');
    await expect(chartContainer).toBeHidden();
    await expect(chartContainer).toHaveAttribute('hidden', '');

    await runEMFProfile(page);

    await expect(chartContainer).toBeVisible();
    await expect(chartContainer).not.toHaveAttribute('hidden');
    await expect(chartContainer.locator('h2')).toHaveText('Field Profile vs. Distance from Tray Edge');
    await expect(page.locator('#emf-chart')).toBeVisible();

    const profilePolyline = page.locator('#emf-chart polyline').first();
    await expect(profilePolyline).toBeVisible();
    const points = await profilePolyline.getAttribute('points');
    expect(points).toBeTruthy();
    expect(points.trim().length).toBeGreaterThan(0);
    expect(points.trim().split(/\s+/).length).toBeGreaterThan(1);
    const labelCount = await page.locator('#emf-chart text').count();
    expect(labelCount).toBeGreaterThan(0);
  });

  test('acceptance EMF-04 [emf] [AT-EMF-04]: invalid current guardrails show modal errors and preserve prior result output', async ({ page }) => {
    await setupEMFPage(page);
    await fillEMFInputs(page, EMF_CANONICAL_FIXTURE.defaultGeometry);
    await runEMFCalculate(page);
    const priorResultsHtml = await page.locator('#results').innerHTML();
    const priorRms = await getEmfRmsMicroTesla(page);
    expect(priorRms).not.toBeNull();

    await fillEMFInputs(page, { loadCurrent: '0' });
    await runEMFCalculate(page);
    const inputErrorDialog = page.getByRole('dialog');
    await expect(inputErrorDialog).toContainText('Input Error');
    await expect(inputErrorDialog).toContainText('Load current must be greater than zero.');
    await inputErrorDialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#results')).toContainText('RMS Flux Density');
    const zeroAttemptResultsHtml = await page.locator('#results').innerHTML();
    expect(zeroAttemptResultsHtml).toBe(priorResultsHtml);

    await fillEMFInputs(page, { loadCurrent: '-25' });
    await runEMFCalculate(page);
    const negativeValueDialog = page.getByRole('dialog');
    await expect(negativeValueDialog).toContainText('Input Error');
    await expect(negativeValueDialog).toContainText('Load current must be greater than zero.');
    await negativeValueDialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#results')).toContainText('RMS Flux Density');
    const negativeAttemptResultsHtml = await page.locator('#results').innerHTML();
    expect(negativeAttemptResultsHtml).toBe(priorResultsHtml);
  });
});
