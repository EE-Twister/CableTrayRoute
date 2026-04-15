# Test Lanes and Execution Policy

This repository now defines two explicit test lanes so CI and local development can balance speed and regression depth.

## Lane intent

### Pre-merge lane (fast confidence)
Use the **critical path** commands for quick feedback on high-risk flows:

- `npm run test:critical`
- `npm run e2e:critical`

This lane is intended for pull requests and rapid iteration. It validates:

- Core computational/unit regression paths (routing, analysis, validation, collaboration/security)
- Selected Playwright smoke/integration scenarios for high-risk user journeys:
  - workflow creation and dirty-state prompts
  - one-line editing behavior
  - next-feature smoke page boot and core controls

### Scheduled/nightly lane (full regression depth)
Use the full-regression commands for comprehensive coverage:

- `npm run test:full`
- `npm run e2e:full`

This lane is intended for nightly/scheduled runs and release hardening.

## CI compatibility policy

To remain compatible with existing CI workflows that invoke `npm test` and `npm run e2e`:

- `npm test` is retained and maps to `npm run test:full`
- `npm run e2e` is retained and maps to `npm run e2e:full`

This preserves current behavior while adding explicit lane names for teams that want to split pre-merge and nightly pipelines.


## Next-features phased lane sequence

For Cost Estimator + EMF acceptance hardening, run lanes in this order and gate merge at each step:

1. Fixture/acceptance definition
2. Test-structure refactor
3. Cost Estimator deterministic integration tests
4. EMF deterministic integration tests
5. Export validation
6. CI lane split and docs updates

Phase-oriented commands:

- `npm run e2e:next-features-integration`
- `npm run e2e:next-features-cost`
- `npm run e2e:next-features-emf`
- `npm run e2e:next-features-export`

Current command mappings:

- `npm run e2e:next-features-integration` → full `playwright-tests/nextFeatures.integration.spec.js` lane
- `npm run e2e:next-features-cost` → deterministic Cost Estimator acceptance set (`AT-CE-01` through `AT-CE-04`)
- `npm run e2e:next-features-emf` → deterministic EMF acceptance set (`AT-EMF-01` through `AT-EMF-04`)
- `npm run e2e:next-features-export` → export-specific validations (`AT-CE-04` and submittal XLSX download integration)

## Week 1 rollout gate criteria (required pass conditions)

For the first seven calendar days after rollout, merge gates for next-feature changes are strict:

1. **Lane command pass requirement**
   - `npm run e2e:next-features-cost` must pass with no test retries consumed.
   - `npm run e2e:next-features-emf` must pass with no test retries consumed.
   - `npm run e2e:next-features-export` must pass before merging export-related changes.
2. **Deterministic acceptance requirement**
   - Any PR that modifies Cost Estimator logic/fixtures must include a passing CE acceptance lane run in PR evidence.
   - Any PR that modifies EMF logic/fixtures must include a passing EMF acceptance lane run in PR evidence.
3. **Baseline lane protection**
   - `npm run test:critical` and `npm run e2e:critical` remain required and cannot be waived during Week 1.

## PR checklist additions for related changes

Add the following checklist items to PR descriptions when touching Cost Estimator, EMF, or export flows:

- [ ] Deterministic CE acceptance lane passed (`npm run e2e:next-features-cost`) when CE code, fixtures, or selectors changed.
- [ ] Deterministic EMF acceptance lane passed (`npm run e2e:next-features-emf`) when EMF code, fixtures, or selectors changed.
- [ ] Export validation lane passed (`npm run e2e:next-features-export`) when CE export or submittal export behavior changed.
- [ ] Attached CI/local artifact bundle for any retry used (trace, video/screenshot, and stdout log excerpt).

## Week 1 flake triage protocol

During the first week after rollout, use this protocol for any flaky failure in the phased lanes:

1. **Retry policy**
   - Allow one immediate rerun of the failing lane to classify potential infra/transient instability.
   - If rerun also fails, mark as probable product or selector instability and block merge until resolved or explicitly waived by maintainers.
2. **Selector stabilization**
   - Replace brittle selectors with role/label/test-id anchored locators.
   - Prefer explicit readiness checks (`toBeVisible`, `toHaveText`, `waitForEvent`) over arbitrary timeouts.
   - Keep assertion scopes narrow to deterministic UI regions.
3. **Artifact capture**
   - Capture and attach the failing run trace, screenshots/video (if available), and terminal output.
   - Record failure signature, commit SHA, browser/project name, and whether failure reproduced locally.
4. **Escalation window**
   - Repeated failures of the same test (2+ times in Week 1) require opening/linked triage issue before additional related merges.
