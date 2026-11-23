# Selected-device evidence storage

Design Synthesis retains full selected manufacturer records in the active
scenario. A 25-to-50-load mixed-voltage fixture previously used 5,236,928 of
5,242,880 bytes after Apply. Three active-storage copies repeated the same
100,902-byte evidence map. With device-evidence packing alone, the same fixture uses 4,955,180
bytes: 281,748 bytes less. A separate acceptance fixture with 25 KB of
user-owned notes used 5,151,536 bytes and passed Apply, undo/redo, named reload,
and rollback checks. These are measured fixtures, not capacity guarantees for
projects with different data.

The browser version of that journey initially exceeded the same 5 MiB target
because the UI generated additional project records. Packing the two generated
review/input records as well brings this fixture under the limit in Firefox and
Edge while retaining the 25 KB owner notes, complete exports and named reload.

## Storage and compatibility

The `designSynthesisDeviceEvidence`, `designSynthesisLastApplied`, and
`designSynthesisInputEvidence` settings can be stored in a versioned
`design-synthesis-device-evidence-lz77-utf15-v1` envelope. The established
lossless byte codec is shared from `utils/evidenceBinaryCodec.mjs`; its prior
Design Synthesis import path re-exports the same functions. Packing is used
only if the JSON value survives an exact round trip and the encoded value is
smaller. Work is bounded to 1,000,000 UTF-8 input bytes. Values beyond that
bound remain in the prior plain form. Packing does not bypass the existing
2.5 MiB scenario-entry threshold or change the 5 MiB test budget.

The browser build includes the synchronous codec in the page bundles, keeping
their existing single-request startup behavior. The added storage safeguards
increase three protected bundle budgets: harmonics from 200 KB to 205 KB,
load flow from 325 KB to 335 KB, and contingency from 325 KB to 330 KB. Other
protected bundle budgets are unchanged.

`dataStore.getItem`, project-state getters and notifications, cross-tab setting
events, project export, and named-project snapshots expose the complete decoded
records. The current scenario mirror, unscoped mirror, and canonical project
settings may contain compact envelopes. Valid records in named project
snapshots and exported project documents remain plain maps; unreadable
envelopes remain intact. Older app builds may not understand the compact
active-state representation. Existing uncompressed maps remain readable and
are packed only on a later write. No unrelated evidence
records are pruned.

The decoder bounds its work and verifies the data fingerprint. FNV detects
accidental changes; it is not authentication. Recognized corrupt or unsupported
envelopes in the canonical project or scoped scenario remain intact and do not
resolve to the original records. Unscoped keys are derived legacy mirrors and
can be regenerated from the canonical project. Automatic
replacement or deletion, Apply, and an import that would discard them fail
without committing the requested change. Undo and redo wait until an unreadable
record is intentionally recovered. A low-level explicit recovery option
is available for intentional removal. Scenario cloning also checks the source
and destination before writing and rolls back if a later write fails. These
envelope safeguards apply to parseable JSON; a truncated, syntactically invalid
scenario-storage value is handled by the application's general malformed-JSON
fallback and is not protected by the envelope check. Manufacturer-source text, including
mojibake-looking text, is preserved rather than silently rewritten during
project migration.

Cross-tab subscribers receive a decoded setting value after that bundle's
scenario cache has been updated. Read the setting through `dataStore.getItem`
in that event; the separately maintained canonical project view updates when
its project-storage event arrives.

## Verification scope

The focused tests cover exact JSON/Unicode round trips, bounded and malformed
payloads, older and future encodings, unrelated source text, project-state and
event views, scenario isolation, import/export, named saves, undo/redo, and
rejected evidence writes and scenario clones. The browser journey exercises 25-to-50-load
mixed-voltage Apply with owner data, reload, full evidence export and a second
tab. Full regression results are recorded under
`output/design-synthesis-storage-headroom-2026-10-26/`.

The final full browser run recorded 1,145 passing cases and three Firefox
timeouts across import, sample loading, and project creation. All three passed
when rerun individually. The import case also passed 15 individual diagnostic
repetitions and five repetitions of the four-case sequence; the original
full-suite timeout remains unexplained.

This storage change does not qualify a device, calculate clearing times, or
complete motor protection. The full equipment-to-industrial-design goal remains
active.
