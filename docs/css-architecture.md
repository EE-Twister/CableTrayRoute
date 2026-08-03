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

The suite fixes the viewport, light theme, font family, reduced-motion preference, animations, and volatile status UI. Baselines live in `playwright-tests/visual-baselines/` and are enforced in a Windows Edge CI lane after critical E2E, matching the platform used to approve the reference images.

Run `npm run visual:regression` to compare the application against the committed baselines. Only use `npm run visual:regression:update` after intentionally reviewing the changed screenshots; an updated image is a product decision, not an automatic test repair.
