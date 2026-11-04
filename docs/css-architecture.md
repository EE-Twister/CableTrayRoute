# CSS Architecture and Visual Regression

## Cascade layers

`style.css` declares one canonical cascade order:

`tokens -> base -> layout -> components -> pages -> utilities -> overrides`

Every imported file under `src/styles/` must name its layer. Shared colors, spacing, controls, panel geometry, focus treatment, and motion values belong in `src/styles/tokens.css`. Page-specific selectors remain in the `pages` layer; print rules use `overrides`.

Run `npm run lint:css` to enforce the layer contract, required shared tokens, and ratcheted size ceilings for the three largest stylesheets. The check is included in `npm run lint`.

## Desktop screenshot contract

`playwright-tests/visual-regression.spec.js` protects four representative desktop states:

- Homepage command center;
- populated Cable Schedule;
- Ductbank Route engineering workspace; and
- Panel Schedule workspace.

The suite fixes the viewport, light theme, font family, reduced-motion preference, animations, and volatile status UI. It also pins the locale (`en-US`), time zone (`UTC`), and wall clock (`page.clock.setFixedTime`), so time-stamped UI such as the Cable Schedule "Last Change" metric renders the same text on every run. Each test waits for the asynchronous content in its shot before capturing: the homepage waits for the "My Projects" panel to finish loading, and the Cable Schedule waits for the debounced `#schedule-summary` KPI strip to show the sample cable count. When a page gains content that renders after a timer, network call, or dynamic import, add a matching wait; otherwise the screenshot races it and the check flakes. Baselines live in `playwright-tests/visual-baselines/` and are enforced in a Windows Edge CI lane after critical E2E, matching the platform used to approve the reference images.

Run `npm run visual:regression` to compare the application against the committed baselines. Only use `npm run visual:regression:update` after intentionally reviewing the changed screenshots; an updated image is a product decision, not an automatic test repair.

Baselines must be rendered on Windows Edge. `npm run visual:regression:update` rewrites all four images (`--update-snapshots=all`) and only works on Windows. From any machine, run the **Visual Baselines** workflow (`.github/workflows/visual-baselines.yml`) from the Actions tab instead. It regenerates the images on `windows-latest`, checks that a second pass matches them, and uploads them as the `visual-baselines-<sha>` artifact. It never commits. Download the artifact, review each image, and commit the approved ones to `playwright-tests/visual-baselines/`.
