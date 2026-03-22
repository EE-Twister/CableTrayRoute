/**
 * Automated accessibility tests using axe-core.
 *
 * Runs WCAG 2.1 AA checks against the 10 most critical pages.
 * Any violations will fail CI.  The baseURL is the local file:// root,
 * so no running server is required.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Pages to audit — ordered from highest to lowest traffic
const PAGES = [
  'index.html',
  'cableschedule.html',
  'optimalRoute.html',
  'racewayschedule.html',
  'loadFlow.html',
  'oneline.html',
  'tcc.html',
  'panelschedule.html',
  'help.html',
  'login.html',
];

for (const page of PAGES) {
  test(`WCAG 2.1 AA: ${page}`, async ({ page: pw }) => {
    await pw.goto(page);
    // Wait for the page shell to settle (scripts may inject nav etc.)
    await pw.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page: pw })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      // Exclude third-party CDN-injected elements that we cannot control
      .exclude('[data-noaxe]')
      .analyze();

    // Report all violations for easier debugging
    if (results.violations.length > 0) {
      const summary = results.violations
        .map(v => `  [${v.impact}] ${v.id}: ${v.description}\n    ${v.nodes.map(n => n.target.join(', ')).join('\n    ')}`)
        .join('\n');
      throw new Error(`Accessibility violations found on ${page}:\n${summary}`);
    }

    expect(results.violations).toHaveLength(0);
  });
}
