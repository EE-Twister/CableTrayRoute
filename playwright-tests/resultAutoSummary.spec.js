import { test, expect } from '@playwright/test';
test('auto summary bar appears above a status table and ignores plain tables', async ({ page }) => {
  await page.goto('shortCircuit.html');
  await page.evaluate(() => {
    const host = document.querySelector('main') || document.body;
    host.insertAdjacentHTML('beforeend', `<section id="t1"><div class="table-scroll"><table class="results-table"><tbody>
      <tr><td>A</td><td>1</td><td>PASS</td></tr><tr><td>B</td><td>2</td><td>FAIL</td></tr>
      <tr><td>C</td><td>3</td><td>Warning</td></tr><tr><td>D</td><td>4</td><td>PASS</td></tr></tbody></table></div></section>
      <section id="t2"><table class="results-table"><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr><tr><td>C</td><td>3</td></tr></tbody></table></section>`);
  });
  await expect(page.locator('#t1 [data-auto-summary] .viz-stack')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('#t1 [data-auto-summary]')).toContainText('Pass 2');
  await expect(page.locator('#t1 [data-auto-summary]')).toContainText('Fail 1');
  await expect(page.locator('#t2 [data-auto-summary]')).toHaveCount(0);
  // editing a status cell refreshes the bar without duplicating it
  await page.evaluate(() => { document.querySelector('#t1 tr:nth-child(2) td:last-child').textContent = 'PASS'; document.querySelector('#t1 tbody').appendChild(document.createElement('tr')).innerHTML = '<td>E</td><td>5</td><td>FAIL</td>'; });
  await expect(page.locator('#t1 [data-auto-summary]')).toContainText('Fail 1', { timeout: 5000 });
  await expect(page.locator('#t1 [data-auto-summary]')).toHaveCount(1);
});
