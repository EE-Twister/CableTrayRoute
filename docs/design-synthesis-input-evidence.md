# Input evidence and effective assumptions

Design Synthesis records the input basis alongside the proposed design. This
is traceability for **screening only**; attaching a document does not verify a
rating or approve the resulting design.

Inputs may declare `provenance` as a kind string or an object with `kind` and
an optional `note`. The supported kinds are `synthetic`, `user-supplied`, and
`document-referenced`. A supply or equipment record can override the top-level
classification. The bundled industrial example is explicitly synthetic.

```json
{
  "provenance": { "kind": "user-supplied", "note": "Owner equipment list" },
  "equipment": [{
    "id": "PUMP-1",
    "provenance": "document-referenced",
    "sourceDocuments": [{ "id": "PUMP-1-nameplate", "revision": "A" }]
  }]
}
```

This fragment illustrates evidence fields; complete supply, equipment ratings,
locations, corridors, and criteria are still required. A document reference
must be a nonblank string or an object containing an identifiable `id`, `title`,
`url`, or `reference`. Empty document/reference arrays are allowed when no
document evidence is claimed. `document-referenced` requires source documents.
Malformed evidence and unknown provenance kinds or fields block generation.

When classification is omitted, a record with source documents is classified
as document-referenced; otherwise it is user-supplied. An explicit classification
takes precedence over that inference. No classification means independently
verified, calculation-ready, or approved.

The proposal's `inputEvidence` records coordinate units in feet, corridor
dimensions in inches, voltage in volts, power in kW, capacity in kVA, and
frequency in hertz. Units describe the accepted input contract; they do not
silently convert metric inputs. Provided ratings and coordinates are retained.
Each effective value distinguishes supplied data, defaults, and inherited
system frequency. Missing load power factor defaults to 1, duty to continuous,
and ratings basis to electrical input kW. These assumptions remain visible for
review and should be replaced with the actual equipment data when available.

The supported synthesis scope remains 60 Hz. Conflicting equipment frequency
is blocked. The evidence helper's ability to describe an inherited frequency
does not expand the supported calculation scope.

The workspace and human-readable report show input evidence before the full
JSON payload. Classification changes participate in the proposal signature.
Apply retains evidence with the generated project so save/import and undo/redo
do not discard its basis. The scenario setting `designSynthesisInputEvidence`
stores the complete units and record evidence once. For storage efficiency,
larger equipment lists use the tagged
`design-synthesis-input-evidence-v1` representation: a shared field-name table,
shared common classification/note defaults, and per-record value tuples. The
tuple flags preserve whether `value`, `basis`, and `source` were absent or
explicitly null, and primitive/null value entries remain primitive/null.
Consumers should call `resolveDesignSynthesisInputEvidence` before reading the
equipment records as ordinary evidence objects. It expands this schema after
project reload; unrecognized or legacy formats are returned unchanged. Supply
and equipment IDs link those records to generated schedules, avoiding repeated
full evidence packages in every load and drawing record.

Independent acceptance tests check effective power factor against normalized
load kVA, defaults versus provided values, classifications, signature changes,
malformed references, incompatible frequency, exact saved evidence, undo/redo,
and project import. The 50-load budget test requires the complete evidence map
and generated conduits to survive the named-project save within 5 MiB. Final
run results are recorded in the [acceptance contract](design-synthesis-acceptance.md).
