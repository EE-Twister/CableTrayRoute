# Existing project equipment handoff

Design Synthesis can review equipment already stored in a named project, either with an existing linked load or with an explicit equipment electrical input kW rating. The **Use existing project equipment** panel requires a user to select the equipment records, acknowledge the kW, voltage, and coordinate bases, review the exact equipment/load mapping, and explicitly copy that selection into the synthesis draft. Reviewing and copying do not change canonical project records.

Selection and basis checkboxes retain keyboard focus while they are changed.
Changing either removes the pending mapping review, which must be reviewed
again before it can be copied into the draft.

For linked records, the mapping joins `equipment.id` to `load.equipmentId`; the project equipment ID and linked load ID can differ and both are retained. For equipment without a linked load, an explicit equipment kW rating is used to propose a load with identity `DS-LOAD-<equipment ID>`. Apply creates that load; a conflicting identity or tag blocks the proposal. Equipment supplies x/y/z. kW, voltage, phase count, power factor, and duty are checked across both records when both provide a value. Missing or contradictory values, duplicate links, ambiguous identities/tags, unsupported units or rating basis, and an incomplete motor record are shown as blockers. The workflow does not guess kW basis, line-to-line voltage, or feet coordinates; it requires explicit basis confirmation when a record does not declare the basis.

Sources, panels, buses, transformers, and previously generated records are not eligible for selection. The reviewed binding records the named project, scenario, input fingerprint, exact source-record fingerprints, mapped row, selected identities, tags, and acknowledgements. Generation and Apply verify that binding against the current project and draft. Before first Apply, a source or project change requires another review. After Apply, selective field baselines allow regeneration while retaining unrelated and custom owner edits. A changed project/scenario or mapped rating, coordinate, motor model, or reference still requires a new review.

Apply retains the original equipment and load IDs, tags, and owner fields. It selectively writes generated panel assignment and electrical-derived load fields, with an undoable canonical mutation. If a selected pair is omitted from a later design, only unchanged generated fields are restored or cleared; the owner equipment and load records remain. Custom owner edits are preserved. Manual changes to fields owned by the generated design or conflicts with any unreviewed project record block Apply. Downstream schedules use the canonical load identity and load tag while preserving the associated equipment identity.

Loads created from equipment-only ratings are generated records, rather than preexisting owner records. Their ownership and saved snapshot are checked on re-review and regeneration; a changed generated load or an independently linked load requires resolution rather than silent replacement. Omitted unchanged generated loads can be removed during reconciliation, while their source equipment remains.

For a named project, **Review Apply conflicts** remains available on an otherwise proposal-status result so users can request fresh conflict diagnostics and inspect available corrections such as an explicitly reviewed panel-location override. The fresh preview still blocks the canonical mutation while any conflict remains. Motor-blocked proposals do not enable this action.

This handoff is workflow integration for preliminary design screening. It does not verify supplied project data, complete motor protection, or represent qualified engineering approval. Existing motor Apply gates remain in force.

Motor data may be entered in the Equipment List's motor fields or supplied as an existing nested `motor` record. Flat fields are converted into a motor record for the reviewed draft, preserving the separate design-current reference and nameplate and locked-rotor currents. Partial or invalid flat inputs and conflicts with a nested record block review; unsupported VFD and soft-starter classifications are not converted to direct-on-line starting. The [motor integration guide](design-synthesis-motors.md) describes the supported inputs and limits.

Direct synthesis drafts and the project handoff recognize the same motor indicators in type, subtype, category, subcategory, load type, and MCC unit type, including case, spaces, hyphens, and underscores. Motor-specific flat fields, a nonblank motor-data reference, and an explicit starter type also trigger motor validation. A direct draft must still supply the nested motor data; it does not automatically convert flat fields. VFD and soft-starter indicators block the direct-on-line model even when another field says DOL. Motor proposals remain blocked from Apply while protection is unresolved.

The Equipment List can also copy an explicitly selected manufacturer motor
reference to selected rows. The handoff preserves `motorDataReference` as a
source reference, independently of the design-current reference. It does not
verify either reference or infer that the selected model is installed.
When the user explicitly chooses the picker's typical full-load operating option,
the handoff carries the bound manufacturer data and validates the source model,
motor ratings, circuit, kW, power factor, and duty. The draft and input evidence
identify the kW and power factor as reference-derived. Changes or conflicting
equipment/load bindings block review until the basis is reconciled. These are
typical 460 V data and a stated constant-power screening assumption for 480 V;
they do not establish the actual operating load or complete motor protection.

Optional motor breaker-enclosure temperature and reference fields are
reviewed as a pair and carried with the matching motor. `none` explicitly
suppresses the applicable project default; a partial or contradictory basis
blocks mapping. Exact 35, 50, 60, and 70 A research candidates use their own
temperature tables; the 70 A project basis is not applied to other breakers.
The separate S2 project basis applies to 35–60 A candidates only. See the
[motor branch-breaker guide](design-synthesis-motor-branch-breakers.md).

The handoff retains an explicitly supplied equipment or linked-load frequency
(`frequencyHz` or `frequency`) in the reviewed draft. If both records or aliases
specify frequency, they must agree; invalid values block the mapping. The review
shows an explicit frequency or states that it is inherited from the project.
Synthesis currently supports 60 Hz only, so a 50 Hz load or source blocks the
proposal rather than being silently treated as 60 Hz. The full-load motor
reference also rejects a conflicting supplied circuit frequency.

When the Equipment List's limited historical motor-current aid is used, the
handoff verifies the current and its bound horsepower, nameplate current, motor
and circuit voltage, phase count, frequency, rotor and starter assumptions. A
stale or modified basis blocks the handoff and motor input validation until it
is reviewed again or replaced with an independently documented basis. This is a
preliminary screening aid, not a determination of the adopted code edition or
the installation's suitability.

Equipment may also supply `motorInstantaneousPickupA` as a supported numeric
proposal, `none` to suppress a project-wide proposal, or blank to inherit it.
The reviewed mapping carries that choice into the motor record and blocks
conflicting flat and nested values. A later source edit requires another
equipment review; selection and protection checks remain preliminary.
