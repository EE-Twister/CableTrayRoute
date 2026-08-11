# Project Data Integration

CableTrayRoute uses one project record as the source for schedules, diagrams, studies, and deliverables. Pages may still accept standalone inputs, but project workflow mode should reuse existing information before asking the user to enter it again.

## Canonical project metadata

Shared identity and site values are stored in `settings.projectMeta` and edited from the Report Package Builder. The record includes:

- project name and number;
- client, site, and location;
- responsible engineer and license;
- issue date, revision, and cover notes;
- site altitude plus minimum and maximum design ambient temperatures; and
- default battery runtime.

Battery Sizing, Generator Sizing, and Report Builder bind directly to this record. Project import/export includes it through the standard settings persistence flow.

Other study pages automatically reuse common project identity, system label, altitude, ambient, jurisdiction, and AHJ fields when no saved study result exists. A source badge identifies each populated value. Heat Trace uses the minimum design ambient; equipment-rating and thermal pages use the maximum design ambient.

## Project file compatibility

Canonical browser-storage records and exported `.ctr.json` files carry a root-level `schemaVersion`. Version 1 is the current project contract. The machine-readable contract is [Project JSON Schema](../schemas/project.schema.json); it describes both the compact storage record and the richer interchange file.

Unversioned projects are treated as legacy version 0 and upgraded through the ordered migration registry before use. Each migration must advance exactly one supported contract version, and the migrated result is validated before it can replace application state. Files with a newer version are refused with an update prompt instead of being interpreted as an older shape.

Import validation checks required collections, row object types, One-Line sheet structure, scenario metadata, and unexpected root fields. A malformed import is rejected atomically: CableTrayRoute reports the failing JSON path and leaves the current project unchanged. The former repair path that silently replaced invalid collections with empty arrays is intentionally no longer used.

Specialized project-scope selectors are available where a study must target a particular record:

- **Bus Duct Sizing** selects a load or circuit and derives voltage, phases, load current, cable-route length, maximum ambient, and Short Circuit duty.
- **Voltage Flicker** derives PCC strength and X/R from Short Circuit and builds disturbance rows from matching project loads such as motors, furnaces, welders, and wind resources.
- **IEC 60287** selects a cable and derives conductor size/material, insulation basis, core count, installation method, operating voltage, and maximum ambient.
- **BESS Hazard** reuses the selected Battery Sizing bank energy, chemistry, rack layout, equipment context, and maximum ambient.
- **Insulation Coordination** selects equipment or a circuit and derives the study label, nominal voltage, IEC highest-voltage class, site altitude, and arrester MCOV where available.

Changing the selected scope refreshes linked fields. An engineer can edit any linked field to create a study-specific override.

MCC Lineups use the same linked-input pattern for procurement requirements. A lineup matched by Equipment Tag or Tag can reuse ratings from Equipment List or One-Line, available fault current from Short Circuit, conductor interfaces from Cable Schedule, environmental and report data from Project Metadata, and code-basis data from Design Basis. Blank, already linked, and untouched generic starting values update automatically; manual edits and deliberately applied MCC profiles are preserved as overrides until the user explicitly selects **Refresh from project**. All fields also accept standalone manual entry when upstream workflow records do not exist.

## Linked study inputs

A linked study field has one of three states:

- **Linked** — the value is populated from a project schedule, study result, design basis, or project metadata.
- **Manual override** — the user edited the value for the current study. Refreshing from the project clears overrides.
- **Missing** — the page identifies the upstream schedule value that is required.

Saved Battery and Generator results include a `projectLink` envelope containing the input hash, source bindings, override list, source snapshot, and capture time. When linked project inputs change, the page marks the existing result as stale and lists the changed input fields.

The data store also records a project-wide fingerprint in `settings.studyProvenance` whenever any study result is updated. Study pages display whether their saved result is current, stale, or predates provenance tracking. This project-wide check is intentionally conservative: any change to the shared engineering model can require a study re-run.

## Entity relationships

The data store assigns stable IDs when schedule records do not already have them:

- equipment records receive an `id`;
- loads receive an `id` and an `equipmentId` when their tag matches equipment;
- cables receive an `id`, `circuitId`, `sourceEquipmentId`, and `targetEquipmentId`; and
- one-line components and connections receive `entityId` and `circuitId` references.

Legacy tag, endpoint, and embedded cable fields remain readable during migration. New integrations should use stable IDs as the relationship and treat legacy aliases as compatibility data.

## Adding another integrated study

1. Add a pure project-input adapter to `analysis/projectIntegration.mjs`.
2. Declare every project source in `src/pageContracts.js`.
3. Render the shared project-source panel and bind applicable fields.
4. Preserve deliberate manual overrides.
5. Save a project input snapshot with the result and display stale status on reload.
6. Add pure adapter tests and a browser workflow that changes an upstream source.
