import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

function fixture(sample, count) {
  const input = structuredClone(sample); const original = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...original[i % original.length],
    id: `BROWSER-HEADROOM-${i + 1}`, tag: `BROWSER-HEADROOM-${i + 1}`,
    voltage: i < count * 0.8 ? 208 : 480, kw: i < count * 0.8 ? 1 : 3, powerFactor: 0.9, phases: 3 }));
  return input;
}

async function importDraft(page, input) {
  await page.locator('#synthesis-import').setInputFiles({ name: 'headroom.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('#synthesis-status')).toContainText('Imported headroom.json');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 90000 });
}

test('50-load named project retains owner data and full evidence across reload and tabs', async ({ page, context }) => {
  test.setTimeout(180000);
  const sample = JSON.parse(await fs.readFile(path.join(root, 'samples/design-synthesis-industrial.json'), 'utf8'));
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await importDraft(page, fixture(sample, 25));
  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
  await page.locator('input[id^="project-name-"]').fill('Storage Headroom Journey');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible();
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 90000 });
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const first = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  await page.evaluate(() => window.dataStore.setItem('ownerEngineeringNotes', { notes: 'N'.repeat(25000) }));
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/);

  await page.goto(server.url('designsynthesis.html'));
  const expanded = fixture(sample, 50); expanded.generationBaseline = first.distributionBaseline;
  await importDraft(page, expanded);
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/);
  await page.reload();
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  const saved = await page.evaluate(() => {
    const key = 'designSynthesisDeviceEvidence';
    const map = window.dataStore.getItem(key, {});
    const named = JSON.parse(localStorage.getItem('CTR_SAVED_PROJECTS_V1'))['Storage Headroom Journey'];
    const canonical = JSON.parse(localStorage.getItem('CTR_PROJECT_V1'));
    return { count: window.dataStore.getLoads().length, notes: window.dataStore.getItem('ownerEngineeringNotes', {}).notes,
      encoding: JSON.parse(localStorage.getItem(`base:${key}`)).encoding,
      canonicalEncoding: canonical.settings[key].encoding, exported: window.dataStore.exportProject().settings[key],
      named: named.settings[key], map,
      reviewRecords: Object.fromEntries(['designSynthesisLastApplied', 'designSynthesisInputEvidence'].map(name => [name, {
        active: window.dataStore.getItem(name), exported: window.dataStore.exportProject().settings[name], named: named.settings[name],
        encoding: JSON.parse(localStorage.getItem(`base:${name}`)).encoding,
      }])),
      bytes: Object.keys(localStorage).reduce((sum, name) => sum + 2 * (name.length + localStorage.getItem(name).length), 0) };
  });
  expect(saved.count).toBe(50);
  expect(saved.notes).toHaveLength(25000);
  expect(saved.encoding).toBe('design-synthesis-device-evidence-lz77-utf15-v1');
  expect(saved.canonicalEncoding).toBe(saved.encoding);
  expect(saved.exported).toEqual(saved.map);
  expect(saved.named).toEqual(saved.map);
  for (const record of Object.values(saved.reviewRecords)) {
    expect(record.encoding).toBe('design-synthesis-device-evidence-lz77-utf15-v1');
    expect(record.exported).toEqual(record.active);
    expect(record.named).toEqual(record.active);
  }
  expect(saved.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);

  const second = await context.newPage();
  await second.goto(server.url('designsynthesis.html'));
  await second.waitForFunction(() => window.__ctrProjectReady === true);
  await second.evaluate(() => window.dataStore.on('designSynthesisDeviceEvidence', value => {
    window.__evidenceEvent = value;
    window.__evidenceReadDuringEvent = window.dataStore.getItem('designSynthesisDeviceEvidence', {});
  }));
  await page.evaluate(() => {
    const map = window.dataStore.getItem('designSynthesisDeviceEvidence', {});
    map['user-extra'] = { source: 'cross-tab owner evidence' };
    window.dataStore.setItem('designSynthesisDeviceEvidence', map);
  });
  await expect.poll(() => second.evaluate(() => window.__evidenceEvent?.['user-extra']?.source)).toBe('cross-tab owner evidence');
  await expect.poll(() => second.evaluate(() => window.__evidenceReadDuringEvent?.['user-extra']?.source)).toBe('cross-tab owner evidence');
  await expect.poll(() => second.evaluate(() => window.dataStore.getItem('designSynthesisDeviceEvidence', {})['user-extra']?.source)).toBe('cross-tab owner evidence');
  await second.close();
});
