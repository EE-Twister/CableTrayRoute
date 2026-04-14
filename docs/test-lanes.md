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

Post-merge policy: monitor flaky tests for one week after each phase and tighten waits/selectors only where instability is observed.
