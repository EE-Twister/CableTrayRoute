# Plant CAD Mapping Notes

Use the shared connector row fields for AVEVA and SmartPlant handoff:

- `guid` or `sourceId`: stable native model identifier.
- `elementType`: `cableTray`, `conduit`, `equipment`, `support`, `cable`, or `generic`.
- `tag`, `name`, `system`, `level`, `area`: review and reconciliation metadata.
- `dimensions`, `lengthFt`, `quantity`: quantity reconciliation basis.
- `mappedProjectId`, `mappingConfidence`: CableTrayRoute mapping hints.
- `propertySets`: BIM object-family and catalog metadata where available.
- `issues`: BCF-style issue records for review-only coordination.

Project-specific SDK implementations should keep import preview non-mutating until discipline review and owner procedures approve a write-back workflow.
