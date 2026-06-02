# Dist Review Policy

Generated build output is release-only. Feature branches should run `npm run build` to verify bundles, but they should not commit `dist/`, `docs/asset-manifest.json`, or `data/protectiveDevices.mjs` churn.

## Decision

- Feature PRs commit source, tests, samples, and hand-maintained docs.
- CI builds `dist/` from source and uploads it as a short-lived artifact for Playwright and reviewer download.
- Root HTML source files reference logical `dist/*.js` paths for page bundles and root `style.css` for styles. The build rewrites bundle paths to fingerprinted assets for release output, while leaving `style.css` at the root so its imported `src/styles/*.css` files resolve on static hosts.
- Release or static-hosting PRs may commit generated build output after running `npm run build`.
- Release branches should use a `release/` prefix, or set `ALLOW_DIST_CHANGES=1` when intentionally running the dist review check.

## Why

Rollup emits standalone page bundles for static hosting. Generated bundle filenames can still churn when source changes, which makes feature reviews harder without adding useful design signal. Separating generated bundles from feature work keeps code review focused on source behavior while still proving that distributable output builds.

The local server also tolerates stale browser-cached HTML during feature work: when a missing `/dist/name.<hash>.js` or `/dist/name.<hash>.css` request has a matching logical `/dist/name.js` or `/dist/name.css` file, the server serves the logical asset instead of returning 404. This keeps old cached shells usable while source HTML is normalized back to logical bundle references and root `style.css`.

## Local Workflow

1. Run `npm test`.
2. Run `npm run build`.
3. Run the relevant Playwright tests.
4. Run `npm run check:html-assets -- --fix` if the build rewrote root HTML files.
5. Leave generated build artifacts unstaged for feature work.

Use this check before opening a feature PR:

```bash
npm run check:html-assets
npm run check:dist-review
```

For a release/static-hosting update:

```bash
npm run build
ALLOW_DIST_CHANGES=1 npm run check:dist-review
git add -f dist docs/asset-manifest.json data/protectiveDevices.mjs
```

PowerShell equivalent for the check:

```powershell
$env:ALLOW_DIST_CHANGES = '1'
npm run check:dist-review
Remove-Item Env:ALLOW_DIST_CHANGES
```
