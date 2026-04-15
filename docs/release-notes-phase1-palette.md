# Release notes: Phase 1 palette additions

Date: 2026-04-15

## Added components in baseline rollout

- `mcc` (Motor Control Center)
- `busway`
- `ct`
- `pt_vt`
- `ups`

## Included in this release prep

- Shared Phase 1 component checklist for baseline + subtype fields.
- Migration backfill in `migrateProject` for one-line components missing Phase 1 required metadata.
- Component coverage audit updates for explicit Phase 1 subtype checks.
- Regression fixture (`docs/examples/phase1_components_fixture.json`) with all Phase 1 components.
- Validation and import/export round-trip regression tests for new Phase 1 components.
- Component docs updated with study impact and minimum required attributes sections.
