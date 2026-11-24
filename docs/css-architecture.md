# CSS Architecture and Visual Regression

## Cascade layers

`style.css` declares one canonical cascade order:

`tokens -> base -> layout -> components -> pages -> utilities -> overrides`

Every imported file under `src/styles/` must name its layer. Shared colors, spacing, controls, panel geometry, focus treatment, and motion values belong in `src/styles/tokens.css`. Page-specific selectors remain in the `pages` layer; print rules use `overrides`.

Run `npm run lint:css` to enforce the layer contract, required shared tokens, defined custom properties, and ratcheted size ceilings for the three largest stylesheets and `tokens.css`. The check is included in `npm run lint`.

## Theme tokens

The app has four themes: light (`:root`), dark (the `prefers-color-scheme: dark` media query and `body.dark-mode`), `body.theme-light`, and `body.theme-high-contrast`. High contrast starts from the light palette, then overrides it. Only the base tokens in `tokens.css` change per theme. Components must reach colour through those tokens, never through a hard-coded fallback.

- **Every `var(--name)` must have a definition.** `npm run lint:css` scans `style.css`, `src/styles/*.css` and the `<style>` blocks and inline `style` attributes of the root HTML pages. It fails on any referenced name that none of them declares. An undefined name silently uses its fallback, and a light fallback such as `var(--surface-2, #f5f5f5)` paints a light panel under dark mode's light text (review finding U1).
- **Add a new or legacy name as an alias, once, in the alias block at the end of `tokens.css`.** Point it at the closest themed token, for example `--surface-2: var(--color-surface);`. Group it by role: text, raised surfaces, subtle surfaces, page background, tinted surfaces, status colours, borders or focus. The block is declared on `:root, body`. A `var()` alias resolves where it is declared, so an alias declared only on `:root` would keep the OS-scheme colour after a `body` theme class changes the base tokens.
- **Two allowlists in `scripts/checkCssArchitecture.mjs` cover the exceptions:**
  - `JS_SET_CUSTOM_PROPERTIES` lists names that only JavaScript writes, such as bar widths and panel geometry. Each entry records its writer.
  - `CONFLICTING_CUSTOM_PROPERTIES` lists names whose consumers need colours no single alias can satisfy. `--color-accent` is the only entry: it is amber under black text in `copilot.css` and blue under white text in `scenarioComparison.css`.

  The check also fails on allowlist entries that are no longer used, or that a stylesheet now defines.
- **Issued-document previews are paper, not app chrome.** The Report Package Builder preview (`.report-preview` in `projectreport.html`) pins its own light palette, including the aliases its content reads. It looks the same in every app theme and matches print and export output.

`playwright-tests/a11y.spec.ts` runs axe on each audited page twice, once with the light colour scheme and once with the dark one. In the dark pass it waits for `body.dark-mode` before scanning. On the Report Package Builder it generates the preview first, so the paper surface and the builder controls are both checked.

## Desktop screenshot contract

`playwright-tests/visual-regression.spec.js` protects four representative desktop states:

- Homepage command center;
- populated Cable Schedule;
- Ductbank Route engineering workspace; and
- Panel Schedule workspace.

The suite fixes the viewport, light theme, font family, reduced-motion preference, animations, and volatile status UI. Baselines live in `playwright-tests/visual-baselines/` and are enforced in a Windows Edge CI lane after critical E2E, matching the platform used to approve the reference images.

Run `npm run visual:regression` to compare the application against the committed baselines. Only use `npm run visual:regression:update` after intentionally reviewing the changed screenshots; an updated image is a product decision, not an automatic test repair.
