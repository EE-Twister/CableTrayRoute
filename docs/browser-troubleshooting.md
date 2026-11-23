# Browser acceptance troubleshooting

The functional browser configuration runs every applicable Playwright spec in Firefox and Microsoft Edge. The visual configuration is a separate Windows-only Microsoft Edge lane: desktop snapshots use the committed `playwright-tests/visual-baselines` root, and the config fails with a diagnostic when run on another platform instead of comparing a different browser's pixels.

If Firefox fails before navigation with `browserContext.newPage: Cannot read properties of undefined (reading '_page')`, capture `DEBUG=pw:protocol,pw:browser*` output. The actionable browser messages are usually `Failed to launch tab subprocess`, `remoteTab is null`, and `Page.crashed`. This indicates that the host blocked Firefox's nested content process. Run the same command from a normal local terminal or a CI runner with browser-process permission. Do not set `MOZ_DISABLE_CONTENT_SANDBOX` as a repository default or use it to hide the failure.

The smallest smoke check is:

```sh
node --input-type=module <<'EOF'
import { firefox } from 'playwright';
const browser = await firefox.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto('about:blank');
console.log('firefox startup passed');
await browser.close();
EOF
```

Run the functional lane with `npx playwright test --config playwright.config.cjs --project=firefox --project=msedge`. Run `npm run visual:regression` separately on Windows for the required desktop Edge snapshot lane.

On Windows PowerShell, the equivalent smoke check is:

```powershell
@'
import { firefox } from 'playwright';
const browser = await firefox.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto('about:blank');
console.log('firefox startup passed');
await browser.close();
'@ | node --input-type=module
```
