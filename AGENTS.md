# CableTrayRoute Contribution Guidelines

This repository uses this file for all developer tasks. The rules below apply to every directory in the project.

## Code Style

### Browser-facing modules (`*.js` / `*.mjs` loaded in the UI)
- Use standard ES module syntax for imports and exports. Keep the import organization and relative-path structure consistent with `site.js`, `projectStorage.js`, and `src/components/modal.js`.
- Prefer `const` and `let`; do not introduce `var`.
- Retain semicolons and the existing whitespace pattern when editing or creating modules.
- Follow the established patterns for async flows, DOM access, and error handling demonstrated in `site.js` and `src/components/modal.js`.

### Node-run scripts (tooling, build, or server helpers)
- Author scripts as ES modules (`import` / `export`) wherever possible so they align with the browser module style. When touching a legacy CommonJS file (e.g., scripts currently using `require`), either migrate the file fully to ESM or keep the CommonJS style consistent—do not mix module systems within a file.
- Use `const` / `let`, keep semicolons, and mirror the control-flow and logging patterns from `projectStorage.js` and other modern modules.
- When adding new automation, colocate shared helpers under `scripts/` or `utils/` rather than duplicating logic.

## Project Structure Expectations
- UI modules live under `src/`. Avoid placing UI logic in root-level files; root entry points should delegate into `src/` components.
- All persistence flows must pass through the APIs in `projectStorage.js`. Avoid direct `localStorage` access in feature code.
- Vendor bundles (such as the fast-json-patch shim) are built exclusively by `scripts/buildFastJsonPatch.js`. Do not check generated vendor files into source or rebuild them ad hoc from other scripts.
- Static assets and documentation artifacts are copied via `scripts/copyAssets.js`. Update that script (rather than duplicating copy logic) when new assets need to be distributed.

## Storage Invariants
- Respect the `PROJECT_KEY` namespace and reuse `setProjectState`, `setProjectKey`, and `removeProjectKey` to mutate stored data so undo/redo tracking remains correct.
- `migrateProject` is the single entry point for transforming legacy project shapes. Extend it when introducing new schema fields.
- `syncDerivedStorage` is responsible for mirroring project data into legacy keys (`cableSchedule`, `traySchedule`, etc.) and tracking `settings` keys. Wire new settings through this function instead of writing to `localStorage` manually.
- Preserve the undo/redo stacks maintained by `pushUndo`, `undoProjectChange`, and `redoProjectChange`. Ensure new mutations capture diffs through these helpers so change history stays accurate.

## Backend Security Requirements
- Server authentication in `server.mjs` relies on scrypt password hashing (`hashPassword` / `verifyPassword`), `FileSessionStore` persistence, and session records containing both bearer tokens and CSRF tokens. Retain these mechanisms when modifying auth flows.
- Authenticated routes must continue to require a `Bearer` token header and enforce the `x-csrf-token` timing-safe comparison before mutating state.
- The `/projects` endpoints are guarded by rate limiting. Keep rate limiting active for any new persistence routes.
- HTTPS enforcement (via the `enforceHttps` option) is required in production deployments. New middleware must not bypass or weaken this redirect.

## Testing & Documentation
- Run `npm test` and `npm run build` before completing any task that changes code.
- If you modify or add E2E scenarios or touch code covered by Playwright tests, run the Playwright suite specified in `playwright-tests/`.
- Update the relevant documents under `docs/` whenever user-visible behavior changes. Ensure code and docs stay synchronized.
