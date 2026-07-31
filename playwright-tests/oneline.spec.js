import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function pageUrl(file) {
  return 'file://' + path.join(root, file);
}

async function openToolbarMenu(page, name) {
  await page.waitForTimeout(200);
  await page.locator('summary.command-menu-trigger', { hasText: new RegExp(`^${name}`) }).first().click();
}

test('mobile layout keeps the canvas reachable and starts with the inspector collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  const canvas = page.locator('.oneline-canvas-scroll');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#history-sidebar')).toBeHidden();

  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds.y).toBeLessThan(844);
  expect(bounds.height).toBeGreaterThan(140);
});

test('drag first library item onto canvas', async ({ page }) => {
  await page.addInitScript(() => {
    if (!location.search.includes('probe=')) {
      localStorage.clear();
      sessionStorage.clear();
    }
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  const paletteLabels = await page.locator('.palette-scroll [data-testid="palette-button"] .palette-label').allTextContents();
  expect(new Set(paletteLabels).size).toBe(paletteLabels.length);
  await expect(page.locator('.palette-card:visible .no-components')).toHaveCount(0);
  const firstBtn = page.locator('[data-testid="palette-button"]').first();
  await firstBtn.waitFor({ state: 'visible' });
  const before = await page.locator('g.component').count();
  const svgBox = await page.locator('#diagram').boundingBox();
  expect(svgBox).toBeTruthy();
  await page.evaluate(({ clientX, clientY }) => {
    const button = document.querySelector('[data-testid="palette-button"]');
    const svg = document.querySelector('#diagram');
    if (!button || !svg) return;
    const dataTransfer = new DataTransfer();
    button.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer
    }));
    svg.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      dataTransfer
    }));
    svg.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      dataTransfer
    }));
  }, {
    clientX: svgBox.x + 240,
    clientY: svgBox.y + 220
  });
  await expect(page.locator('g.component')).toHaveCount(before + 1);
});

test('palette exposes the complete catalog and switches ANSI/IEC symbols', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  for (const label of ['Recloser', 'Shunt Reactor', 'Feeder', 'Relay']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  const paletteButtons = page.locator('[data-testid="palette-button"]');
  expect(await paletteButtons.count()).toBeGreaterThanOrEqual(51);

  const atsPaletteButton = page.locator('[data-testid="palette-button"][data-subtype="ats"]');
  await atsPaletteButton.click();
  const placedImage = page.locator('g.component image');
  await expect(placedImage).toHaveCount(1);
  await expect(placedImage).toHaveAttribute('href', /ATS\.svg/);
  await page.evaluate(() => {
    const select = document.getElementById('symbol-standard-select');
    select.value = 'IEC';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(placedImage).toHaveAttribute('href', /IEC_ATS\.svg/);
  await expect(page.locator('[data-testid="palette-button"][data-subtype="ats"] img').first()).toHaveAttribute('src', /IEC_ATS\.svg/);
});

test('transformer tap review shows expected voltage impact and requires approval before applying', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
    localStorage.setItem('base:oneLineDiagram', JSON.stringify({
      activeSheet: 0,
      sheets: [{
        name: 'Tap Review Fixture',
        components: [
          { id: 'source-bus', label: 'SOURCE', type: 'bus', subtype: 'Bus', busType: 'slack', baseKV: 13.8 },
          { id: 'load-bus', label: 'LOAD BUS', type: 'bus', subtype: 'Bus', busType: 'PQ', baseKV: 0.48 },
          {
            id: 'xfmr-review',
            label: 'XFMR-REVIEW',
            type: 'transformer',
            subtype: 'two_winding',
            volts_primary: 13800,
            volts_secondary: 480,
            kva: 1000,
            percent_z: 5,
            xr_ratio: 10,
            tap_ratio: 1.025,
            props: {
              volts_primary: 13800,
              volts_secondary: 480,
              kva: 1000,
              percent_z: 5,
              tap_ratio: 1.025,
              ltc: {
                enabled: true,
                min_tap_volts: 460,
                max_tap_volts: 500,
                step_percent: 0.625,
                setpoint_pu: 1
              }
            },
            impedance: { r: 0.002, x: 0.008 },
            connections: [
              { target: 'source-bus', sourcePort: 0 },
              { target: 'load-bus', sourcePort: 1 }
            ]
          },
          { id: 'review-load', label: 'LOAD-1', type: 'load', subtype: 'static_load', kw: 100, kvar: 25, connections: [{ target: 'load-bus' }] }
        ],
        connections: []
      }]
    }));
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await openToolbarMenu(page, 'Review');
  await page.locator('#studies-panel-btn').click();
  await page.locator('#run-tap-optimization-btn').click();
  await expect(page.locator('#transformer-tap-review')).toBeVisible();
  await expect(page.locator('#transformer-tap-review')).toContainText('What-if load-flow cases');
  await expect(page.locator('#transformer-tap-review')).toContainText('XFMR-REVIEW');
  await expect(page.locator('#transformer-tap-review')).toContainText('voltage limits 0.95 pu to 1.05 pu');

  const before = await page.evaluate(() => ({
    oneLine: window.dataStore.getOneLine(),
    revisions: window.dataStore.getRevisions().length
  }));
  expect(before.oneLine.sheets[0].components.find(component => component.id === 'xfmr-review')?.tap_ratio).toBe(1.025);
  const approveButton = page.locator('[data-tap-apply="1"]');
  await expect(approveButton).toHaveCount(1);
  await approveButton.click();
  const approvalDialog = page.locator('.modal[role="dialog"]');
  await expect(approvalDialog).toBeVisible();
  await approvalDialog.getByRole('button', { name: 'Approve & Apply', exact: true }).click();

  await page.waitForFunction(() => {
    const transformer = window.dataStore.getOneLine().sheets[0].components.find(component => component.id === 'xfmr-review');
    return Number.isFinite(Number(transformer?.tap_ratio)) && Number(transformer.tap_ratio) !== 1.025;
  });
  const after = await page.evaluate(() => ({
    transformer: window.dataStore.getOneLine().sheets[0].components.find(component => component.id === 'xfmr-review'),
    revisions: window.dataStore.getRevisions().length,
    review: window.dataStore.getStudies().transformerTapOptimization
  }));
  expect(after.transformer.tap_ratio).not.toBe(1.025);
  expect(after.revisions).toBeGreaterThan(before.revisions);
  expect(after.review.status).toBe('applied');
});

test('palette retains recent symbols and supports favorites', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  await expect(page.locator('#palette-pinned')).toBeHidden();
  await page.locator('.palette-scroll [data-testid="palette-button"][data-subtype="ats"]').click();
  const pinnedAts = page.locator('#palette-pinned [data-testid="palette-button"][data-subtype="ats"]');
  await expect(pinnedAts).toBeVisible();
  await expect(pinnedAts).toHaveAttribute('data-palette-pinned-kind', 'recent');

  await pinnedAts.dispatchEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 160, clientY: 160 });
  await expect(page.locator('#palette-context-menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Add to Favorites' }).click();
  await expect(pinnedAts).toHaveAttribute('data-palette-pinned-kind', 'favorite');

  await page.locator('.palette-scroll [data-testid="palette-button"][data-subtype="switchboard"]').click();
  await expect(page.locator('#palette-pinned [data-testid="palette-button"][data-subtype="switchboard"]')).toHaveAttribute('data-palette-pinned-kind', 'recent');
  await page.getByRole('button', { name: 'Clear Recent' }).click();
  await expect(pinnedAts).toHaveAttribute('data-palette-pinned-kind', 'favorite');
  await expect(page.locator('#palette-pinned [data-testid="palette-button"][data-subtype="switchboard"]')).toHaveCount(0);
});

test('canvas quick-add and repeat last symbol preserve palette workflow', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  await page.locator('[data-testid="palette-button"][data-subtype="utility"]').first().click();
  const beforeQuickAdd = await page.locator('g.component').count();
  const diagram = page.locator('#diagram');
  const bounds = await diagram.boundingBox();
  expect(bounds).toBeTruthy();
  await diagram.dispatchEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: bounds.x + 300,
    clientY: bounds.y + 240
  });
  await expect(page.getByText('Quick Add Bus', { exact: true })).toBeVisible();
  await page.getByText('Quick Add Bus', { exact: true }).click();
  const afterQuickAdd = await page.evaluate(() => window.dataStore.getOneLine().sheets[0].components.map(comp => comp.subtype));
  expect(afterQuickAdd).toHaveLength(beforeQuickAdd + 1);
  expect(afterQuickAdd.at(-1)).toBe('bus_bus');
  await expect(page.locator('g.component')).toHaveCount(beforeQuickAdd + 1);

  await page.keyboard.press('Alt+r');
  await expect(page.locator('g.component')).toHaveCount(beforeQuickAdd + 2);
  const subtypes = await page.evaluate(() => window.dataStore.getOneLine().sheets[0].components.map(comp => comp.subtype));
  expect(subtypes.slice(-2)).toEqual(['bus_bus', 'bus_bus']);
});

test('component labels support inline edit, cancel, and undo', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  await page.locator('[data-testid="palette-button"][data-subtype="utility"]').first().click();
  const label = page.locator('.component-label').first();
  const original = await label.textContent();
  await label.dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  const editor = page.locator('.inline-label-editor-input');
  await expect(editor).toBeFocused();
  await editor.fill('UTILITY-INLINE');
  await expect(editor).toHaveValue('UTILITY-INLINE');
  await editor.press('Enter');
  await expect(editor).toHaveCount(0);
  const committedLabels = await page.evaluate(() => window.dataStore.getOneLine().sheets[0].components.map(comp => comp.label));
  expect(committedLabels).toContain('UTILITY-INLINE');
  await expect(page.locator('.component-label').first()).toHaveText('UTILITY-INLINE');

  await page.keyboard.press('Control+z');
  await expect(page.locator('.component-label').first()).toHaveText(original || '');

  await page.locator('.component-label').first().dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  await editor.fill('CANCELLED-LABEL');
  await editor.press('Escape');
  await expect(page.locator('.component-label').first()).toHaveText(original || '');
});

test('position and properties locks protect distinct editing paths', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.locator('[data-testid="palette-button"][data-subtype="utility"]').first().click();

  const image = page.locator('g.component image').first();
  const imageBox = await image.boundingBox();
  expect(imageBox).toBeTruthy();
  const openComponentMenu = async () => {
    await image.dispatchEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: imageBox.x + imageBox.width / 2,
      clientY: imageBox.y + imageBox.height / 2
    });
  };

  await openComponentMenu();
  await page.getByText('Lock Position', { exact: true }).click();
  await page.waitForFunction(() => {
    const component = window.dataStore.getOneLine().sheets[0].components[0];
    return component?.locked === true && component.positionLocked === true;
  });
  await page.locator('.component-label').first().dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  await expect(page.locator('.inline-label-editor-input')).toHaveCount(0);

  await openComponentMenu();
  await page.getByText('Lock Properties', { exact: true }).click();
  await page.waitForFunction(() => window.dataStore.getOneLine().sheets[0].components[0]?.propertiesLocked === true);
  await image.dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  const propertyForm = page.locator('#prop-form');
  await expect(propertyForm).toBeVisible();
  await expect(propertyForm.locator('input').first()).toBeDisabled();
  await expect(propertyForm.getByRole('button', { name: 'Apply' })).toBeDisabled();
});

test('dragging aligns components with persistent snap guides and distance readout', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.locator('[data-testid="palette-button"][data-subtype="utility"]').first().click();
  await page.locator('[data-testid="palette-button"][data-subtype="lv_cb"]').first().click();

  const components = page.locator('g.component');
  const sourceBox = await components.nth(0).boundingBox();
  const movedBox = await components.nth(1).boundingBox();
  expect(sourceBox).toBeTruthy();
  expect(movedBox).toBeTruthy();
  const sourceCenterX = sourceBox.x + sourceBox.width / 2;
  const sourceCenterY = sourceBox.y + sourceBox.height / 2;
  const movedCenterX = movedBox.x + movedBox.width / 2;
  const movedCenterY = movedBox.y + movedBox.height / 2;

  await components.nth(1).locator('image').first().dispatchEvent('mousedown', {
    button: 0,
    bubbles: true,
    clientX: movedCenterX,
    clientY: movedCenterY
  });
  await page.locator('#diagram').dispatchEvent('mousemove', {
    bubbles: true,
    clientX: sourceCenterX,
    clientY: movedCenterY + 60
  });
  await expect(page.locator('.alignment-snap-guide-vertical')).toHaveCount(1);
  await expect(page.locator('.alignment-snap-readout')).toContainText('ΔX');

  await page.locator('#diagram').dispatchEvent('mouseup', {
    button: 0,
    bubbles: true,
    clientX: sourceCenterX,
    clientY: movedCenterY + 60
  });
  await page.waitForFunction(() => {
    const components = window.dataStore.getOneLine().sheets[0].components;
    return components.length === 2 && components[0].x === components[1].x;
  });
});

test('configurable shortcuts repeat commands beyond symbol placement', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.locator('[data-testid="palette-button"][data-subtype="utility"]').first().click();

  await page.keyboard.press('R');
  await page.waitForFunction(() => window.dataStore.getOneLine().sheets[0].components[0]?.rotation === 90);
  await page.keyboard.press('Alt+R');
  await page.waitForFunction(() => window.dataStore.getOneLine().sheets[0].components[0]?.rotation === 180);

  await page.evaluate(() => document.getElementById('shortcuts-btn')?.click());
  const dialog = page.getByRole('dialog', { name: 'One-Line Keyboard Shortcuts' });
  await expect(dialog).toBeVisible();
  const rotateRow = dialog.locator('.shortcut-settings-row').filter({ hasText: 'Rotate selection' });
  await rotateRow.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('T');
  await expect(rotateRow.locator('kbd')).toHaveText('T');
  await dialog.getByRole('button', { name: 'Save Shortcuts' }).click();

  await page.keyboard.press('R');
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.dataStore.getOneLine().sheets[0].components[0]?.rotation)).toBe(180);
  await page.keyboard.press('T');
  await page.waitForFunction(() => window.dataStore.getOneLine().sheets[0].components[0]?.rotation === 270);
});

test('palette click places upright devices and creates provisional click connections', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });

  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  await page.locator('[data-testid="palette-button"][data-subtype="utility"]').first().click();
  await page.locator('[data-testid="palette-button"][data-subtype="switchboard"]').first().click();

  const placed = await page.evaluate(() => {
    const store = window.dataStore?.getOneLine?.();
    return (store?.sheets?.[0]?.components || []).map(comp => ({
      id: comp.id,
      subtype: comp.subtype,
      rotation: comp.rotation,
      x: comp.x,
      y: comp.y
    }));
  });
  expect(placed).toHaveLength(2);
  expect(placed.every(comp => comp.rotation === 0)).toBe(true);
  expect(placed[1].y).toBeGreaterThan(placed[0].y);

  await page.click('#connect-btn');
  await page.evaluate(([sourceId, targetId]) => {
    const dispatchConnectPointer = id => {
      const node = document.querySelector(`g.component[data-id="${id}"]`);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      node.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
    };
    dispatchConnectPointer(sourceId);
    dispatchConnectPointer(targetId);
  }, [placed[0].id, placed[1].id]);

  const connection = await page.evaluate(sourceId => {
    const store = window.dataStore?.getOneLine?.();
    const source = store?.sheets?.[0]?.components?.find(comp => comp.id === sourceId);
    return source?.connections?.[0] || null;
  }, placed[0].id);
  expect(connection).toBeTruthy();
  expect(connection.target).toBe(placed[1].id);
  expect(connection.cable?.provisional).toBe(true);
  expect(connection.cable?.tag).toContain('CBL-');

  await page.evaluate(() => {
    const connection = document.querySelector('polyline.connection');
    connection?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.connection-inspector')).toBeVisible();
  await page.locator('.connection-inspector input[name="tag"]').fill('CBL-UNIT-TEST');
  await page.locator('.connection-inspector button[type="submit"]').click();
  await page.waitForFunction(() => {
    const cable = window.dataStore?.getCables?.().find(item => item.tag === 'CBL-UNIT-TEST');
    const store = window.dataStore?.getOneLine?.();
    const source = store?.sheets?.[0]?.components?.find(comp => comp.connections?.some(conn => conn.cable?.tag === 'CBL-UNIT-TEST'));
    return !!cable && !!source;
  });
  const savedCable = await page.evaluate(() => {
    const cable = window.dataStore.getCables().find(item => item.tag === 'CBL-UNIT-TEST');
    const store = window.dataStore.getOneLine();
    const source = store.sheets[0].components.find(comp => comp.connections?.some(conn => conn.cable?.tag === 'CBL-UNIT-TEST'));
    const conn = source.connections.find(item => item.cable?.tag === 'CBL-UNIT-TEST');
    return { cable, conn };
  });
  expect(savedCable.cable.from_tag).toBeTruthy();
  expect(savedCable.conn.cable.provisional).toBe(false);
});

test('auto-build creates generated assumptions from equipment and loads', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });

  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.evaluate(() => {
    window.dataStore.setOneLine({ activeSheet: 0, sheets: [] });
    window.dataStore.setEquipment([]);
    window.dataStore.setLoads([]);
    window.dataStore.setCables([]);
  });
  await page.reload();
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.evaluate(() => {
    window.dataStore.setEquipment([
      { id: 'SWBD-1', tag: 'SWBD-1', description: 'Main Switchboard', voltage: '480', category: 'Switchboard' }
    ]);
    window.dataStore.setLoads([
      { id: 'MTR-1', tag: 'MTR-1', description: 'Pump Motor', source: 'SWBD-1', loadType: 'Motor', voltage: '480', kw: '75' }
    ]);
  });

  await page.click('#auto-build-oneline-btn');
  await page.getByRole('button', { name: 'Build One-Line' }).click();
  await expect.poll(async () => page.evaluate(() => {
    const store = window.dataStore?.getOneLine?.();
    const comps = store?.sheets?.[0]?.components || [];
    const connectionCount = comps.reduce((sum, comp) => sum + (comp.connections || []).length, 0);
    const hasGeneratedAssumption = comps.some(comp => comp.generated && comp.assumptions?.length);
    return `${comps.length}:${connectionCount}:${hasGeneratedAssumption}`;
  }), { timeout: 10000 }).toBe('3:2:true');

  const built = await page.evaluate(() => {
    const store = window.dataStore.getOneLine();
    const comps = store.sheets[0].components;
    const generated = comps.filter(comp => comp.generated);
    const connectionCount = comps.reduce((sum, comp) => sum + (comp.connections || []).length, 0);
    return {
      count: comps.length,
      generated: generated.length,
      hasAssumption: generated.some(comp => comp.reviewStatus === 'assumed'),
      connectionCount,
      yValues: comps.map(comp => comp.y)
    };
  });
  expect(built.count).toBeGreaterThanOrEqual(3);
  expect(built.generated).toBeGreaterThanOrEqual(3);
  expect(built.hasAssumption).toBe(true);
  expect(built.connectionCount).toBeGreaterThanOrEqual(2);

  await expect(page.locator('.review-badge-assumption').first()).toBeVisible();
  await expect(page.locator('.readiness-card')).toContainText('%');
  await openToolbarMenu(page, 'View');
  await page.selectOption('#diagram-filter-select', 'generated');
  await expect(page.locator('g.component').first()).toBeVisible();
});

test('cross-probe URL resolves equipment tags and cable connections', async ({ page }) => {
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.reload();
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.evaluate(() => {
    window.dataStore.setOneLine({
      activeSheet: 0,
      sheets: [
        {
          name: 'Probe',
          components: [
            {
              id: 'swbd-component',
              type: 'equipment',
              subtype: 'switchboard',
              label: 'SWBD-101',
              tag: 'SWBD-101',
              ref: 'SWBD-101',
              scheduleLinks: { equipment: 'SWBD-101' },
              x: 160,
              y: 180,
              rotation: 0,
              connections: [
                {
                  target: 'mtr-component',
                  cable: { tag: 'CBL-101' },
                  cableRef: 'CBL-101'
                }
              ]
            },
            {
              id: 'mtr-component',
              type: 'load',
              subtype: 'motor_load',
              label: 'MTR-101',
              tag: 'MTR-101',
              loadRef: 'MTR-101',
              scheduleLinks: { load: 'MTR-101' },
              x: 160,
              y: 320,
              rotation: 0,
              connections: []
            }
          ],
          connections: []
        }
      ]
    });
  });

  await page.goto(pageUrl('oneline.html?e2e=1&probe=SWBD-101&probeType=equipment'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await expect.poll(async () => page.evaluate(() => {
    return !!document.querySelector('g.component[data-id="swbd-component"] rect[stroke="#00f"]');
  })).toBe(true);

  await page.goto(pageUrl('oneline.html?e2e=1&probe=CBL-101&probeType=cable'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await expect(page.locator('.selected-connection')).toHaveCount(1);
  await expect(page.locator('.connection-inspector')).toBeVisible();
});

test('view controls render datablocks, state coloring, and operating overrides', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });

  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.evaluate(() => {
    window.dataStore.setOneLine({ activeSheet: 0, sheets: [] });
    window.dataStore.setEquipment([]);
    window.dataStore.setLoads([]);
    window.dataStore.setCables([]);
  });
  await page.reload();
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.evaluate(() => {
    window.dataStore.setEquipment([
      { id: 'SWBD-1', tag: 'SWBD-1', description: 'Main Switchboard', voltage: '480', category: 'Switchboard' }
    ]);
    window.dataStore.setLoads([
      { id: 'MTR-1', tag: 'MTR-1', description: 'Pump Motor', source: 'SWBD-1', loadType: 'Motor', voltage: '480', kw: '75' }
    ]);
    window.dataStore.setCables([]);
  });

  await page.click('#auto-build-oneline-btn');
  await page.getByRole('button', { name: 'Build One-Line' }).click();
  await expect.poll(async () => page.locator('g.component').count(), { timeout: 10000 }).toBeGreaterThanOrEqual(3);

  await openToolbarMenu(page, 'View');
  await page.selectOption('#datablock-format-select', 'nameplate');
  await expect(page.locator('.component-datablock').first()).toBeVisible();
  await expect(page.locator('.component-datablock').first()).toContainText(/Voltage/i);

  await page.selectOption('#data-state-overlay-select', 'review');
  await expect(page.locator('.data-state-badge, .data-state-fill').first()).toBeVisible();
  await expect(page.locator('#voltage-legend')).toContainText('Data Quality');
  await page.keyboard.press('Escape');

  await page.selectOption('#operating-state-select', 'maintenance');
  const targetId = await page.evaluate(() => {
    const store = window.dataStore.getOneLine();
    return store.sheets[0].components.find(comp => comp.label === 'SWBD-1')?.id
      || store.sheets[0].components[0]?.id;
  });
  await page.locator(`g.component[data-id="${targetId}"]`).click();
  await expect(page.locator('.operating-state-card')).toBeVisible();
  await page.locator('.operating-state-card .operating-state-btn', { hasText: 'Open' }).click();
  await expect.poll(async () => page.evaluate(id => {
    const store = window.dataStore.getOneLine();
    const comp = store.sheets[0].components.find(item => item.id === id);
    return comp?.operatingStates?.maintenance?.state || '';
  }, targetId), { timeout: 5000 }).toBe('open');
  await expect(page.locator(`.operating-state-badge[data-id="${targetId}"]`)).toBeVisible();
});

test('study overlays separate result types and disclose stale provenance', async ({ page }) => {
  const diagram = {
    activeSheet: 0,
    sheets: [{
      name: 'Overlay Review',
      components: [{
        id: 'bus-overlay', type: 'bus', subtype: 'bus', label: 'BUS-OVERLAY', x: 220, y: 180,
        width: 200, height: 20, voltage_mag: 0.94, interrupting_rating_ka: 25, hazAreaId: 'area-1',
        shortCircuit: { threePhaseKA: 31 },
        arcFlash: { incidentEnergy: 12.4, minimumArcRatingCalCm2: 20, boundary: 1675, clearingTime: 0.185, workingDistance: 455 },
        props: { rated_voltage_kv: 0.48, interrupting_rating_ka: 25 }, ports: [{ x: 0, y: 10 }, { x: 200, y: 10 }], connections: []
      }], connections: []
    }]
  };
  const studies = {
    loadFlow: { buses: [{ id: 'bus-overlay', Vm: 0.94 }] },
    shortCircuit: { 'bus-overlay': { threePhaseKA: 31 } },
    arcFlash: { 'bus-overlay': { incidentEnergy: 12.4, minimumArcRatingCalCm2: 20, boundary: 1675, clearingTime: 0.185, workingDistance: 455 } },
    hazAreaClassification: {
      areas: [{ id: 'area-1', label: 'Process Area', designation: 'Zone 2', iecZone: '2' }],
      equipment: [{ areaId: 'area-1', pass: true }]
    },
    _oneLineMeta: {
      loadFlow: { scenario: 'default', runAt: '2026-07-16T12:00:00.000Z', oneLineRevision: 'stale-revision' },
      shortCircuit: { scenario: 'default', runAt: '2026-07-16T12:01:00.000Z', oneLineRevision: 'stale-revision' },
      arcFlash: { scenario: 'default', runAt: '2026-07-16T12:02:00.000Z', oneLineRevision: 'stale-revision' }
    }
  };
  await page.addInitScript(({ diagram, studies }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
    localStorage.setItem('base:oneLineDiagram', JSON.stringify(diagram));
    localStorage.setItem('base:studyResults', JSON.stringify(studies));
  }, { diagram, studies });
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  const setOverlay = value => page.evaluate(nextValue => {
    const select = document.getElementById('data-state-overlay-select');
    select.value = nextValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await setOverlay('loadFlow');
  await expect(page.locator('#voltage-legend')).toContainText('Load Flow');
  await expect(page.locator('#voltage-legend')).toContainText('stale');
  await expect(page.locator('.data-state-fill.data-state-stale')).toBeVisible();

  await setOverlay('faultDuty');
  await expect(page.locator('#voltage-legend')).toContainText('Fault Duty');
  await expect(page.locator('#voltage-legend')).toContainText('Available fault exceeds rating');

  await setOverlay('arcFlash');
  await page.evaluate(() => {
    const toggle = document.getElementById('toggle-arcflash-label-mode');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.af-label-badge')).toContainText('IE: 12.40 cal/cm²');
  await expect(page.locator('.af-label-badge')).toContainText('AFB: 1675 mm');
  await expect(page.locator('.af-label-badge')).toContainText('Clear: 0.185 s @ 455 mm');

  await page.evaluate(() => {
    const toggle = document.getElementById('toggle-haz-area');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.haz-area-overlay')).toBeVisible();
  await expect(page.locator('#voltage-legend')).toContainText('Hazardous area: Zone 2/22');
});

test('operating overlay respects ATS selected source and source availability', async ({ page }) => {
  const component = (id, type, subtype, x, y, ports, props = {}) => ({
    id, type, subtype, label: id.toUpperCase(), x, y, width: 72, height: 72,
    rotation: 0, flipped: false, ports, props: { ...props }, ...props, connections: []
  });
  const normal = component('normal-source', 'utility_source', 'utility', 80, 60, [{ x: 36, y: 72 }], { rated_voltage_kv: 0.48 });
  const emergency = component('emergency-source', 'utility_source', 'utility', 260, 60, [{ x: 36, y: 72 }], { rated_voltage_kv: 0.48 });
  const ats = component('ats-device', 'switch', 'switch_ats', 160, 190, [
    { x: 18, y: 0 }, { x: 54, y: 0 }, { x: 36, y: 72 }
  ], { selected_source: 'emergency', emergency_source_available: false, normal_source_available: true });
  const load = component('served-load', 'static_load', 'static_load_static_load', 165, 340, [{ x: 36, y: 0 }], { rated_voltage_kv: 0.48, kva: 100 });
  normal.connections.push({ target: ats.id, sourcePort: 0, targetPort: 0 });
  emergency.connections.push({ target: ats.id, sourcePort: 0, targetPort: 1 });
  ats.connections.push({ target: load.id, sourcePort: 2, targetPort: 0 });
  const diagram = { activeSheet: 0, sheets: [{ name: 'ATS', components: [normal, emergency, ats, load], connections: [] }] };
  await page.addInitScript(seed => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
    localStorage.setItem('base:oneLineDiagram', JSON.stringify(seed));
  }, diagram);
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.evaluate(() => {
    const select = document.getElementById('data-state-overlay-select');
    select.value = 'operating';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('g.component[data-id="served-load"] .data-state-fill.data-state-deenergized')).toBeVisible();
  await expect(page.locator('g.component[data-id="ats-device"] .data-state-fill.data-state-energized')).toBeVisible();
});

test('connection waypoints can be placed and dragged on the one-line', async ({ page }) => {
  const diagram = {
    activeSheet: 0,
    sheets: [{
      name: 'Waypoints',
      components: [
        {
          id: 'source1', type: 'utility_source', subtype: 'utility', label: 'Utility', x: 140, y: 120,
          rotation: 0, flipped: false, props: {}, connections: [{ target: 'panel1', sourcePort: 0, targetPort: 0 }]
        },
        {
          id: 'panel1', type: 'panel', subtype: 'panel', label: 'Panel', x: 420, y: 300,
          rotation: 0, flipped: false, props: {}, connections: []
        }
      ],
      connections: []
    }]
  };
  await page.addInitScript(seed => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
    localStorage.setItem('base:oneLineDiagram', JSON.stringify(seed));
  }, diagram);
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  const connection = page.locator('polyline.connection').first();
  await expect(connection).toBeVisible();
  const connectionBox = await connection.boundingBox();
  expect(connectionBox).toBeTruthy();
  await connection.dispatchEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: connectionBox.x + connectionBox.width / 2,
    clientY: connectionBox.y + connectionBox.height / 2
  });
  await page.getByText('Place Waypoint Here', { exact: true }).click();
  await page.waitForFunction(() => {
    const source = window.dataStore.getOneLine().sheets[0].components.find(comp => comp.id === 'source1');
    return source?.connections?.[0]?.dir && Number.isFinite(source.connections[0].mid);
  });

  await connection.dispatchEvent('click', { bubbles: true, cancelable: true });
  const handle = page.locator('.connection-waypoint-handle');
  await expect(handle).toBeVisible();
  const initialMid = await page.evaluate(() => window.dataStore.getOneLine().sheets[0].components.find(comp => comp.id === 'source1').connections[0].mid);
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();
  const axis = await handle.getAttribute('data-axis');
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const endX = axis === 'x' ? startX + 44 : startX;
  const endY = axis === 'y' ? startY + 44 : startY;
  await handle.dispatchEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: startY });
  await page.locator('#diagram').dispatchEvent('mousemove', { bubbles: true, cancelable: true, clientX: endX, clientY: endY });
  await page.locator('#diagram').dispatchEvent('mouseup', { bubbles: true, cancelable: true, clientX: endX, clientY: endY });
  await page.waitForFunction(previousMid => {
    const source = window.dataStore.getOneLine().sheets[0].components.find(comp => comp.id === 'source1');
    return source?.connections?.[0]?.mid !== previousMid;
  }, initialMid);
  const updatedMid = await page.evaluate(() => window.dataStore.getOneLine().sheets[0].components.find(comp => comp.id === 'source1').connections[0].mid);
  expect(updatedMid % 20).toBe(0);
});

test('editing a source voltage updates inherited props and connections', async ({ page }) => {
  const diagram = {
    activeSheet: 0,
    sheets: [
      {
        name: 'Voltage',
        components: [
          {
            id: 'source1',
            type: 'utility_source',
            subtype: 'utility',
            label: 'Utility',
            ref: 'SRC1',
            x: 120,
            y: 160,
            rotation: 0,
            flipped: false,
            voltage: '13800',
            props: { voltage: '13800', volts: '13800' },
            connections: [
              { target: 'bus1', sourcePort: 0, targetPort: 0 }
            ]
          },
          {
            id: 'bus1',
            type: 'bus',
            subtype: 'bus_Bus',
            label: 'Bus 1',
            ref: 'BUS1',
            x: 360,
            y: 150,
            width: 200,
            height: 20,
            rotation: 0,
            flipped: false,
            props: {},
            connections: []
          }
        ],
        connections: []
      }
    ]
  };

  await page.addInitScript(initDiagram => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:oneLineDiagram', JSON.stringify(initDiagram));
  }, diagram);

  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.waitForSelector('g.component[data-id="source1"] image');
  await page.locator('g.component[data-id="source1"] image').dispatchEvent('dblclick');
  await page.getByRole('tab', { name: 'Electrical' }).click();
  const voltsInput = page.locator('#prop-modal input[name="volts"]');
  await voltsInput.waitFor();
  await voltsInput.fill('4160');
  await page.click('#prop-modal button[type="submit"]');
  await expect(page.locator('#prop-modal form')).toBeHidden();

  await page.waitForFunction(() => {
    const store = window.dataStore?.getOneLine();
    if (!store) return false;
    const sheet = store.sheets?.[0];
    if (!sheet) return false;
    const source = sheet.components?.find(c => c.id === 'source1');
    const bus = sheet.components?.find(c => c.id === 'bus1');
    const conn = source?.connections?.find(c => c.target === 'bus1');
    if (!bus || !bus.props || !conn || !conn.props) return false;
    return (
      bus.voltage === '4160'
      && bus.props.voltage === '4160'
      && bus.props.volts === '4160'
      && conn.voltage === '4160'
      && conn.props.voltage === '4160'
      && conn.props.volts === '4160'
    );
  });

  const stored = await page.evaluate(() => window.dataStore.getOneLine());
  const source = stored.sheets[0].components.find(c => c.id === 'source1');
  const bus = stored.sheets[0].components.find(c => c.id === 'bus1');
  const connection = source.connections.find(c => c.target === 'bus1');
  expect(bus.voltage).toBe('4160');
  expect(bus.props.voltage).toBe('4160');
  expect(bus.props.volts).toBe('4160');
  expect(connection.voltage).toBe('4160');
  expect(connection.props.voltage).toBe('4160');
  expect(connection.props.volts).toBe('4160');
});
