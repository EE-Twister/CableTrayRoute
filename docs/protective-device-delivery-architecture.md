# Protective-device delivery architecture

## Purpose

The canonical protective-device library contains detailed curves, ratings, settings, provenance, and review records for thousands of devices. Shipping that complete dataset during page startup makes unrelated workflows pay a large download, parse, and memory cost. The delivery architecture separates discovery from calculation so each page loads only the information needed for its current task.

This design exists to preserve three properties at the same time:

- Library and TCC users can search and group the complete catalog immediately.
- Calculation and equipment-duty workflows receive full records for every device they actually reference.
- Browser startup does not download the 43 MB canonical catalog or the Node calculation projection.

## Generated artifacts

`data/protectiveDevices.json` remains the canonical governed source. `scripts/buildProtectiveDeviceCatalog.mjs` derives the browser and Node delivery artifacts during every production build.

| Artifact | Purpose | Browser loading rule |
| --- | --- | --- |
| `data/protectiveDeviceIndex.json` | Versioned packed locator used for search, grouping, readiness labels, and ID-to-shard lookup | Library and TCC load it at startup; other pages load it only when a referenced device must be resolved |
| `data/protectiveDeviceCatalog/00.json` through `3f.json` | Full records partitioned into 64 deterministic hash shards | Loaded only for selected or project-referenced device IDs |
| `data/protectiveDeviceCalculations.mjs` | Compact synchronous calculation fallback for Node, server, and unit-test execution | Must never be statically imported or requested by a browser bundle |
| `data/protectiveDevices.json` | Canonical governed source and last-resort compatibility fallback | Loaded only when the locator or a required shard cannot be retrieved |

The locator uses a field-array encoding rather than repeating JSON property names for every record:

```json
{
  "schemaVersion": 2,
  "fields": ["id", "type", "name", "catalogAssessmentStatus", "catalogShard"],
  "records": [["device-id", "breaker", "Example breaker", "screening", "2b"]]
}
```

The generated field list is the schema. `decodeProtectiveDeviceIndex` expands the rows into normal objects at the loader boundary, so UI consumers do not depend on array positions. Version 1 array indexes remain readable during the compatibility window.

## Why these fields are in the locator

The locator contains only fields needed before a full record is selected: identity, device type, voltage class, vendor, series, display name, exact catalog/trip-unit identifiers, ground-fault grouping, calculated readiness status, and shard location.

Ratings, settings, setting options, curves, source documents, field provenance, and review evidence stay in the full shards. Readiness is calculated from the canonical record during generation and stored as `catalogAssessmentStatus`; the UI can therefore filter accurately without downloading the underlying evidence package.

This reduced the startup locator from 4.51 MB to approximately 0.90 MB for 5,218 records. The committed contract requires it to remain below 1,000,000 bytes.

## Runtime flow

1. Library and TCC call `loadIndex()` and receive decoded locator objects.
2. A selected device ID is resolved to its deterministic `catalogShard`.
3. The loader fetches that shard once, caches the shard promise and decoded records, and returns the requested record.
4. Short Circuit, IEC 60909, Arc Flash, One-Line, Equipment Evaluation, and full Dashboard evaluation collect IDs from `tccId` and `props.device`, hydrate only those IDs, and inject the resulting records into their synchronous engines.
5. Node and server calls dynamically load the calculation projection when the caller does not inject a catalog.

The browser loader retains the legacy full-catalog fallback because older deployments can temporarily contain HTML and JavaScript from a newer release while their generated data files are still cached. Fallback use is observable through `getStats().legacyFallbackUsed` and should remain exceptional.

## Performance and correctness contracts

- `tests/protectiveDeviceCatalog.test.mjs` verifies catalog coverage, packed schema decoding, shard caching, legacy fallback, and the sub-1 MB locator budget.
- `tests/calculationCatalog.test.mjs` verifies referenced-ID collection and prevents catalog requests for projects without linked devices.
- `scripts/checkBundleBudgets.mjs` prevents the calculation projection from returning to protected browser bundles.
- `scripts/perf-browser-baseline.mjs` rejects monolithic catalog requests, eager study-page catalog requests, eager Library shards, and route startup-time regressions.
- Browser regression checks confirm that selecting or calculating with a referenced device fetches the locator and one required shard, with no canonical or calculation-monolith request.

## Maintenance workflow

After editing `data/protectiveDevices.json`:

1. Run `npm run build:protective-device-catalog`.
2. Run `node tests/protectiveDeviceCatalog.test.mjs`.
3. Run `npm run build` to enforce bundle budgets and copy the generated data artifacts.
4. Run `npm run perf:browser` when delivery behavior, loader behavior, or catalog fields change.

Do not add a field to the locator merely because it exists in the canonical record. Add it only when a pre-hydration UI requirement is documented and the locator remains inside its startup budget. Otherwise, hydrate the referenced full record.
