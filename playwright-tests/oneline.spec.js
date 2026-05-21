import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function pageUrl(file) {
  return 'file://' + path.join(root, file);
}

async function openToolbarMenu(page, name) {
  await page.locator('summary.command-menu-trigger', { hasText: new RegExp(`^${name}`) }).first().click();
}

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

test('palette click places upright devices and creates provisional click connections', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });

  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');

  await page.locator('[data-testid="palette-button"][data-subtype="utility"]').click();
  await page.locator('[data-testid="palette-button"][data-subtype="switchboard"]').click();

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
  await page.locator(`g.component[data-id="${placed[0].id}"]`).click();
  await page.locator(`g.component[data-id="${placed[1].id}"]`).click();

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
  await expect(page.locator('.data-state-fill').first()).toBeVisible();
  await expect(page.locator('#voltage-legend')).toContainText('Data State');
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
  await page.dblclick('g.component[data-id="source1"] image');
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
