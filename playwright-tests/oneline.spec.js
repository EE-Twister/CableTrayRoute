const { test, expect } = require('@playwright/test');
const path = require('path');
const root = path.join(__dirname, '..');

function pageUrl(file) {
  return 'file://' + path.join(root, file);
}

test('drag first library item onto canvas', async ({ page }) => {
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  const firstBtn = page.locator('[data-testid="palette-button"]').first();
  await firstBtn.waitFor({ state: 'visible' });
  const before = await page.locator('g.component').count();
  await firstBtn.dragTo(page.locator('#diagram'));
  await expect(page.locator('g.component')).toHaveCount(before + 1);
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
  const voltsInput = page.locator('#prop-modal input[name="volts"]');
  await voltsInput.waitFor();
  await voltsInput.fill('4160');
  await page.click('#prop-modal button[type="submit"]');
  await page.waitForSelector('#prop-modal form', { state: 'detached' });

  await page.waitForFunction(() => {
    const store = window.dataStore?.getOneLine();
    if (!store) return false;
    const sheet = store.sheets?.[0];
    if (!sheet) return false;
    const bus = sheet.components?.find(c => c.id === 'bus1');
    const conn = sheet.connections?.find(c => c.from === 'source1' && c.to === 'bus1');
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
  const bus = stored.sheets[0].components.find(c => c.id === 'bus1');
  const connection = stored.sheets[0].connections.find(c => c.from === 'source1' && c.to === 'bus1');
  expect(bus.voltage).toBe('4160');
  expect(bus.props.voltage).toBe('4160');
  expect(bus.props.volts).toBe('4160');
  expect(connection.voltage).toBe('4160');
  expect(connection.props.voltage).toBe('4160');
  expect(connection.props.volts).toBe('4160');
});
