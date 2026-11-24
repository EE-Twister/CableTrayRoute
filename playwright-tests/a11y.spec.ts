/**
 * Automated accessibility tests using axe-core.
 *
 * Runs WCAG 2.1 AA checks against the most critical pages, once with the light
 * colour scheme and once with the dark one (dark mode follows the OS setting,
 * so token gaps only show up in the dark pass). Any violations will fail CI.
 * The baseURL is the local file:// root, so no running server is required.
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
  'projectreport.html',
  'samplegallery.html',
  'arcFlash.html',
  'shortCircuit.html',
];

const COLOR_SCHEMES = ['light', 'dark'] as const;


// Pages that do not load the shared theme runtime, so body never receives the
// dark-mode class; the dark pass still covers them through the media query.
const PAGES_WITHOUT_THEME_RUNTIME = new Set(['loadFlow.html', 'login.html']);

async function waitForRenderSettle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

// Puts pages whose key content is generated on demand into a state where that
// content is rendered alongside the controls that produce it.
async function preparePage(pw, page) {
  if (page === 'oneline.html') {
    await expect(pw.locator('#oneline-ready-beacon')).toHaveAttribute('data-oneline-ready', '1');
  }
  if (page === 'projectreport.html') {
    // The preview is the issued document; generate it, then return to the
    // configure tab so the preview and the builder controls are both scanned.
    await pw.locator('#rpt-generate-btn').click();
    await expect(pw.locator('#report-status')).toContainText('Preview built');
    await pw.locator('#rpt-config-tab').click();
    await expect(pw.locator('.rpt-config-panel')).toBeVisible();
  }
}

for (const colorScheme of COLOR_SCHEMES) {
  for (const page of PAGES) {
    const title = colorScheme === 'light' ? `WCAG 2.1 AA: ${page}` : `WCAG 2.1 AA (dark): ${page}`;
    test(title, async ({ page: pw }) => {
      await pw.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await pw.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await pw.goto(`${page}?e2e=1`);
      // Wait for the page shell to settle (scripts may inject nav etc.). The
      // suite fixes the media scheme above so browser defaults cannot change
      // the theme while computed colors are being measured.
      await pw.waitForLoadState('domcontentloaded');
      if (colorScheme === 'dark' && !PAGES_WITHOUT_THEME_RUNTIME.has(page)) {
        // body.dark-mode rules only apply once the theme runtime has run.
        await expect(pw.locator('body')).toHaveClass(/(^|\s)dark-mode(\s|$)/);
      }
      await preparePage(pw, page);
      await waitForRenderSettle(pw);

      const results = await new AxeBuilder({ page: pw })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        // Exclude third-party CDN-injected elements that we cannot control
        .exclude('[data-noaxe]')
        .analyze();

      // Report all violations for easier debugging
      if (results.violations.length > 0) {
        const summary = results.violations
          .map(v => `  [${v.impact}] ${v.id}: ${v.description}\n    ${v.nodes.map(n => `${n.target.join(', ')}: ${n.failureSummary || 'No node details returned'}`).join('\n    ')}`)
          .join('\n');
        throw new Error(`Accessibility violations found on ${page} (${colorScheme}):\n${summary}`);
      }

      expect(results.violations).toHaveLength(0);
    });
  }
}
