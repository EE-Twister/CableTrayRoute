import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = file => 'file://' + path.join(__dirname, '..', file);

test('Scenario Comparison turns model deltas into a read-only study rerun checklist', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ctr_scenarios_v1', JSON.stringify(['base', 'future']));
    localStorage.setItem('ctr_current_scenario_v1', 'base');
    localStorage.setItem('base:loadList', JSON.stringify([{ id: 'LOAD-1', kw: 100 }]));
    localStorage.setItem('future:loadList', JSON.stringify([{ id: 'LOAD-1', kw: 150 }]));
    localStorage.setItem('base:oneLineDiagram', JSON.stringify({
      sheets: [{ id: 'MAIN', components: [{ id: 'BUS-1', type: 'bus', connections: [] }] }],
    }));
    localStorage.setItem('future:oneLineDiagram', JSON.stringify({
      sheets: [{ id: 'MAIN', components: [{ id: 'BUS-1', type: 'bus', connections: [{ target: 'LOAD-1' }] }] }],
    }));
    localStorage.setItem('base:studyResults', JSON.stringify({
      loadFlow: { summary: { totalLoadKW: 100 }, runMetadata: { valid: true } },
    }));
    localStorage.setItem('future:studyResults', JSON.stringify({
      loadFlow: { summary: { totalLoadKW: 150 }, runMetadata: { valid: true } },
    }));
  });

  await page.goto(pageUrl('scenarios.html'));
  await expect(page.getByRole('heading', { name: 'Scenario Comparison' })).toBeVisible();
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { name: 'Study-Impact Review' })).toBeVisible();
  const impactTable = page.getByRole('table', { name: 'Study-impact rerun checklist' });
  await expect(impactTable).toContainText('Load Flow');
  await expect(impactTable).toContainText('Rerun recommended');
  await expect(impactTable).toContainText('Voltage Drop');
  await expect(impactTable).toContainText('Consider running');
  await expect(impactTable).toContainText('One-Line Connections');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Comparison CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scenario-comparison-base-vs-future.csv');
  const csv = await fs.readFile(await download.path(), 'utf8');
  const rows = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => Object.values(row).some(value => String(value || '').trim()))).toBe(true);
  expect(rows.some(row => row.Type === 'project-record' && row.Record === 'LOAD-1')).toBe(true);
  expect(rows.some(row => row.Type === 'study-result' && row['Domain / Study'] === 'Load Flow')).toBe(true);
  expect(rows.some(row => row.Type === 'study-impact' && row['Domain / Study'] === 'Load Flow' && row.Status === 'rerun')).toBe(true);
  expect(rows.some(row => row.Type === 'study-impact' && row['Domain / Study'] === 'Voltage Drop' && row.Status === 'consider')).toBe(true);
});
