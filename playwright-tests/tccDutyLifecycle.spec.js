import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStaticServer } from './staticServer.helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const catalogProduct = {
  id: 'ACME-100',
  manufacturer: 'Acme Power',
  catalogNumber: 'ACME-100-3P',
  category: 'protective_device',
  description: 'Synthetic E2E 100 A 3-pole breaker',
  evidenceStatus: 'screening',
  protective_device_type: 'breaker',
  protective_device_trip_unit_model: 'TX-100',
  protective_device_interrupting_ratings: '480:35',
  protective_device_curve: '100:100;500:1;1000:0.1',
  protective_device_pickup: 100,
  protective_device_time: 0.3,
  protective_device_instantaneous: 500,
  protective_device_curve_document: 'Synthetic E2E fixture',
  protective_device_curve_revision: 'Test',
  protective_device_curve_id: 'Synthetic curve',
  protective_device_curve_extraction_method: 'synthetic fixture'
};

const oneLine = {
  sheets: [{
    id: 'S1',
    name: 'Main',
    components: [{
      id: 'C1',
      type: 'breaker',
      label: 'Main Breaker',
      tccId: 'project_catalog_acme_power_acme_100_3p',
      props: { tag: 'CB-1', voltage: 480, phases: 3 }
    }],
    connections: []
  }]
};

const motorOneLine = lockedRotorCurrent => ({
  sheets: [{
    id: 'S1',
    name: 'Main',
    components: [
      {
        id: 'C1',
        type: 'breaker',
        label: 'Main Breaker',
        tccId: 'project_catalog_acme_power_acme_100_3p',
        props: { tag: 'CB-1', voltage: 480, phases: 3 }
      },
      {
        id: 'M1',
        type: 'motor_load',
        label: 'Test Motor',
        props: {
          voltage: 480,
          phases: 3,
          fla: 50,
          locked_rotor_current: lockedRotorCurrent,
          start_time_s: 0.3
        }
      }
    ],
    connections: [{ from: 'C1', to: 'M1' }]
  }]
});

test.describe('TCC duty lifecycle producer', () => {
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer(root);
  });

  test.afterAll(async () => {
    await staticSite?.close();
  });

  test('Plot persists current duty provenance for a component and settings edits stale it', async ({ page }) => {
    const projectName = 'TCC Duty Producer E2E';
    await page.goto(staticSite.url('tcc.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => Boolean(window.dataStore && window.projectStorage));
    await page.evaluate(({ product, projectOneLine, name }) => {
      const state = window.projectStorage.getProjectState();
      window.projectStorage.setProjectState({ ...state, name });
      window.currentProjectId = name;
      window.dataStore.setProjectMeta({ id: 'tcc-duty-producer-e2e', name });
      window.dataStore.setOneLine(projectOneLine);
      window.dataStore.setItem('trayHardwareCatalogCustomProducts', [product]);
      window.dataStore.setItem('tccSettings', {
        devices: [], settings: {}, componentOverrides: {}, viewOptions: [], rangePreset: 'full'
      });
    }, { product: catalogProduct, projectOneLine: oneLine, name: projectName });

    await page.goto(staticSite.url('tcc.html?e2e=1&component=C1'));
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#tcc-context-banner')).toBeVisible();
    await expect(page.locator('#tcc-context-title')).toContainText('Main Breaker');
    await expect(page.locator('#device-select option:checked')).toHaveCount(1);

    // Seed the upstream dependency after the page's startup refresh has settled,
    // so the Plot action exercises the real duty producer with a current basis.
    await page.evaluate(() => {
      const context = window.dataStore.captureStudyRunContext('shortCircuit', {
        inputs: { source: 'tcc-duty-producer-browser' }
      });
      window.dataStore.saveStudyResult('shortCircuit', { C1: { threePhaseKA: 20 } }, context);
    });
    await page.locator('#plot-btn').click();
    await expect(page.locator('.tcc-device-layer path[tabindex="0"]')).toHaveCount(1);
    await expect.poll(async () => page.evaluate(() => {
      const assessment = window.dataStore.getStudyAssessment('duty');
      const provenance = window.dataStore.getStudyProvenance().duty;
      return {
        eligible: assessment?.eligible,
        freshness: assessment?.freshness,
        studyKey: provenance?.studyKey,
        projectName: provenance?.projectIdentity?.projectName,
        settings: Boolean(provenance?.settingsFingerprint),
        dependency: provenance?.dependencies?.some(entry => entry.studyKey === 'shortCircuit')
      };
    }), { timeout: 10000 }).toMatchObject({
      eligible: true,
      freshness: 'current',
      studyKey: 'duty',
      projectName,
      settings: true,
      dependency: true
    });

    const savedDuty = await page.evaluate(() => window.dataStore.getStudies().duty);
    expect(savedDuty).toHaveProperty('C1');
    expect(Array.isArray(savedDuty.C1)).toBe(true);

    await page.evaluate(() => {
      const settings = window.dataStore.getItem('tccSettings') || {};
      window.dataStore.setItem('tccSettings', {
        ...settings,
        settings: { ...(settings.settings || {}), e2eEditedPickup: 110 }
      });
    });
    await expect.poll(async () => page.evaluate(() => {
      const assessment = window.dataStore.getStudyAssessment('duty');
      return { freshness: assessment?.freshness, eligible: assessment?.eligible };
    })).toEqual({ freshness: 'stale', eligible: false });
  });

  test('equipment protection checks preserve unknown domain coverage in the review export', async ({ page }, testInfo) => {
    const projectName = 'TCC Equipment Domain E2E';
    await page.goto(staticSite.url('tcc.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => Boolean(window.dataStore && window.projectStorage));
    await page.evaluate(({ product, projectOneLine, name }) => {
      const state = window.projectStorage.getProjectState();
      window.projectStorage.setProjectState({ ...state, name });
      window.currentProjectId = name;
      window.dataStore.setProjectMeta({ id: 'tcc-equipment-domain-e2e', name });
      window.dataStore.setOneLine(projectOneLine);
      window.dataStore.setItem('trayHardwareCatalogCustomProducts', [product]);
      window.dataStore.setItem('tccSettings', {
        devices: [], settings: {}, componentOverrides: {}, viewOptions: [], rangePreset: 'full'
      });
    }, {
      product: { ...catalogProduct, protective_device_instantaneous: 0, protective_device_time: 1 },
      projectOneLine: motorOneLine(200),
      name: projectName
    });

    await page.goto(staticSite.url('tcc.html?e2e=1&component=C1'));
    await page.waitForLoadState('networkidle');
    await page.locator('#plot-btn').click();
    const startCheck = page.locator('.tcc-equipment-check[data-kind="rideThrough"]');
    await expect(startCheck).toHaveAttribute('data-screening-status', 'evaluated');
    await expect(startCheck).toContainText('rides through');
    await expect(startCheck).not.toContainText('may trip');

    await page.evaluate(projectOneLine => window.dataStore.setOneLine(projectOneLine), motorOneLine(2000));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#plot-btn').click();
    await expect(startCheck).toHaveAttribute('data-screening-status', 'unknown');
    await expect(startCheck).toHaveAttribute('data-reason', 'curve-domain-incomplete');
    await expect(startCheck).toContainText('Available protective-curve range: 100–1,000 A.');
    await expect(startCheck).toContainText('No current interval was evaluated.');
    await expect(startCheck).toContainText('No trip time or margin is reported.');

    const equipmentScreenshotPath = testInfo.outputPath('tcc-equipment-check-unknown.png');
    await page.locator('#tcc-equipment-metrics').screenshot({ path: equipmentScreenshotPath });
    await testInfo.attach('tcc-equipment-check-unknown.png', {
      path: equipmentScreenshotPath,
      contentType: 'image/png'
    });

    const reviewDownload = page.waitForEvent('download');
    await page.getByText('Export', { exact: true }).click();
    await expect(page.locator('#export-review-btn')).toBeVisible();
    await page.locator('#export-review-btn').click();
    const reviewFile = await reviewDownload;
    await testInfo.attach('tcc-review-package.html', {
      path: await reviewFile.path(),
      contentType: 'text/html'
    });
    const reviewHtml = await readFile(await reviewFile.path(), 'utf8');
    expect(reviewHtml).toContain('data-screening-status="unknown"');
    expect(reviewHtml).toContain('data-reason="curve-domain-incomplete"');
    expect(reviewHtml).toContain('Available protective-curve range: 100–1,000 A.');
    expect(reviewHtml).toContain('No current interval was evaluated.');
    expect(reviewHtml).toContain('No trip time or margin is reported.');
    expect(reviewHtml).toContain('they do not verify device clearing time or complete protection.');
    expect(reviewHtml).not.toContain('may trip during');
    expect(reviewHtml).not.toContain('worst margin');
  });
});
