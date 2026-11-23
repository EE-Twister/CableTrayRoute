import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

const cases = [
  { name: 'text corridor permission', path: 'corridors.edges[0].permitted', change: input => { input.corridors.edges[0].permitted = 'false'; } },
  { name: 'boolean fault current', path: 'supply.availableFaultCurrentKA', change: input => { input.supply.availableFaultCurrentKA = true; } },
  { name: 'contradictory frequency', path: 'equipment[0].frequency', change: input => { input.equipment[0].frequencyHz = 60; input.equipment[0].frequency = 50; } },
  { name: 'misspelled design criterion', path: 'criteria.voltageDropLimitPercent', change: input => { input.criteria.voltageDropLimitPercent = 0.1; } },
];

for (const scenario of cases) {
  test(`blocks ${scenario.name} and retains the original diagnostic input`, async ({ page }) => {
    await page.goto(server.url('designsynthesis.html?e2e=1'));
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
    const input = JSON.parse(await fs.readFile(path.join(root, 'samples/design-synthesis-industrial.json'), 'utf8'));
    scenario.change(input);
    await page.locator('#synthesis-import').setInputFiles({ name: 'invalid-input.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
    await expect(page.locator('#synthesis-status')).toContainText('Imported');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    const pending = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
    expect(proposal.status).toBe('blocked');
    expect(proposal.cables).toHaveLength(0);
    expect(proposal.inputs.original).toEqual(input);
    expect(proposal.issues.some(issue => issue.path === scenario.path && issue.severity === 'blocking')).toBe(true);
    expect(proposal.loadDispositions).toHaveLength(30);
    expect(proposal.loadDispositions.every(row => row.status !== 'accepted')).toBe(true);
  });
}
