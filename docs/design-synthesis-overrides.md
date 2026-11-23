# Panel location overrides

Overall review class: **Screening only**.

Explicit panel location overrides extend the equipment-to-proposal workflow.
They do not bypass route feasibility, thermal ampacity, conductor selection,
protective-device screening, voltage-drop, or raceway-capacity checks.
Coordinates are physical feet, separate from one-line drawing positions.

The subsequent [contract audit](design-synthesis-contract-audit.md) adds panel
identity history. Inserting an unrelated load group no longer renumbers exact
existing groups or redirects their location overrides. Changing group
membership can still change assignments and requires review; identity history
does not lock load assignments.

The engine accepts `overrides.panelLocations`, keyed by generated panel ID,
with finite numeric x, y, and z and an optional string note. Case-duplicate
IDs, unknown generated IDs, malformed coordinates, and unsupported fields
produce blocking issues. Locations are applied after automatic load grouping
and before circuit route and conductor selection. Original inputs and the
automatic/requested/effective location decision are retained in outputs.

The workspace provides add, edit, and remove controls. It preserves raw imported
inputs for diagnosis, rejects duplicate renames without discarding another
entry, and invalidates results when a draft changes. Removing an override
restores automatic placement on the next generation. A reason is user-supplied
text, not evidence of field verification or engineering approval.

Browser review exposed input loss when a blur event rebuilt the table while
focus moved to the next field. Ordinary field commits now persist without
replacing the controls; imports and structural edits still rebuild them.
Regression checks inspect exact coordinates and equipment ratings in the
downloaded proposal, rather than merely checking that generation ran.

## Reconciliation

Apply retains whole-record ownership fingerprints and a compact additional
fingerprint excluding only x/y/z and the ownership marker for generated panel
and equipment-panel records. The baseline is captured after canonical storage
normalization. A matching explicit override can accept a coordinate-only
manual change; unrelated fields must still match the stored baseline.
An unchanged equipment mirror is updated by the generated proposal. A mirror
edited to different coordinates or with unrelated changes prevents reliable
acceptance. Legacy records lacking the selective baseline remain blocked.

Acceptance uses the normal Generate, review, and Apply path. One-line manual
edit guards, route ownership, named-project durability, undo/redo, and the
5 MiB acceptance budget remain in force.

## Independent evidence

`tests/designSynthesisOverrideAcceptance.test.mjs` moves DP-01 from (60, 0, 0)
to (120, 50, 0), with corridor E25 at 40 C. Its feeder grows from 60 to 170 ft
and changes from 600 to 750 kcmil. The first branch becomes
`110 + sqrt(20² + 20²)` ft. Separate voltage-drop arithmetic uses the sourced
750 kcmil resistance/reactance of 0.022/0.038 ohm per 1,000 ft. Tests check
matching equipment and drawing physical coordinates, route/cable lengths,
combined voltage drop, and restoration after removing the override.

Real storage acceptance exercises a manually moved panel, proposal conflict
without an explicit override, accepted regeneration, all canonical mirrors,
load-flow handoff, undo/redo, export/import, and removal. Unrelated edits and
independently inconsistent mirror coordinates remain blocked without mutation.

## Final verification — September 18, 2026

- `npm test`: all 408 discovered Node test files executed and passed.
- Full `npm run build` and `npm run lint`: passed on the corrected source.
- Edge: 42/42 selected Playwright cases passed across Design Synthesis,
  explicit overrides, study handoff, workflow contracts, and analysis pages.
- The named-project override case manually edits a canonical panel, verifies
  conflict blocking, accepts the location through the visible candidate action,
  downloads the regenerated proposal, applies, reloads, checks physical mirrors
  and feeder length, and removes the override to restore automatic placement.
- Direct entry verifies coordinates and human-readable report values. Invalid
  imported coordinates remain intact in diagnostic JSON and block Apply.
  The equipment edit case verifies both 120 kW and x = 175 in original inputs
  and the generated load, detecting the previously lost second field.
- Real-storage tests verify undo/redo, import/export, unchanged one-line counts,
  load-flow behavior, unrelated manual records, and the 50-load 5 MiB budget.
- The accepted-location screenshot was inspected; the editable panel ID,
  coordinates, note field, and removal action are visible.
- `git diff --check` and the page-contract audit passed. Firefox remains
  unverified because its earlier runner failed before application navigation;
  this revision's browser acceptance was run in Edge.

Evidence is in `output/design-synthesis-overrides-2026-09-18/`:
`node-input-fix-final.log`, `build-input-fix-final.log`,
`lint-input-fix-final.log`, `browser-verified.log`, and
`numerical-evidence.json`. Earlier failed logs remain to document the real
coordinate-entry defects and a corrected stale test locator. Final screenshots
are under `browser-verified-results/`.

This closes the panel-location override milestone. Other override types,
automatic study-driven design revision, and the broader engineering boundaries
in the acceptance contract remain outside this verification. The full
equipment-to-design goal still requires its complete acceptance audit.
