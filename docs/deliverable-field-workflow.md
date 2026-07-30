# Deliverable and Field Workflow

CableTrayRoute stores deliverables and field progress as project data rather
than treating every download as an isolated file.

## Deliverable artifacts

`settings.deliverableArtifacts` is a scenario-aware register. Each record
contains:

- stable artifact ID and type;
- title, revision, lifecycle status, transmittal, author, and generation time;
- included report or submittal sections;
- source artifact IDs;
- a project-input fingerprint used to identify stale packages; and
- a compact summary of the source schedules.

The Submittal page can save a package record after previewing it. The Project
Report construction preset can include the deliverable register alongside
equipment, load, raceway, routing, pull, procurement, and field records.
Generic registered sections are included in HTML previews and XLSX exports.

Named project Save/Load and collaboration snapshots include deliverable,
procurement, field execution, report snapshot, lifecycle package, pull-plan,
and latest-route workflow artifacts.

## Field execution records

`settings.fieldExecutionRecords` stores installation progress keyed by source
record type and tag. Cable and tray QR links open Field View and allow a user
to record:

- installation status;
- quantity complete, crew, updater, and timestamp;
- field notes;
- open punch status and description;
- as-built deviation notes; and
- evidence or attachment references.

The shared data model is independent of the mobile presentation. Field records
can be included in Submittal and Project Report packages and survive project
save/export operations.

## Status boundaries

Deliverables use `draft`, `issued`, `superseded`, or `void`. Field records use
`not-started`, `staged`, `installed`, `terminated`, `tested`, `accepted`, or
`blocked`. These states describe project workflow only; they do not replace
engineering review gates or commissioning acceptance.
