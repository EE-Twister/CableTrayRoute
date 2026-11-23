# Mixed-voltage synthesis: independent review record

Overall review class: **Screening only**. The bounded mixed-voltage generation
milestone was independently verified on October 18, 2026. This does not close
the full industrial-design goal or establish suitability for construction issue.

## Verified scope

A 480 V, three-phase source supplies a mix of direct 480 V loads and balanced
208 V loads through an automatically selected transformer. Transformer
terminals, primary and secondary feeders, panel assignments, routes, losses,
protection candidates, saved project records, and reports must describe the
same connected network. Unserved loads cannot be discarded to obtain a
successful result. The broader industrial-design goal remains unchanged.

## Source decisions

- Schneider's March 2020 **7400CT1901**, copper rows on pages 7, 13 and 20,
  supplies dated 30, 75 and 150 kVA 480-delta/208Y-120 profiles. The published
  impedance, reactance and X/R intervals overlap at their displayed precision.
  That checks transcription consistency, not manufacturing tolerance. The other
  reviewed copper rows and the aluminum profiles are not silently substituted.
  Later 75 kVA impedance values must not be combined with these dated losses.
  [Manufacturer catalog](https://iportal2.schneider-electric.com/Contents/docs/SQUARE%20D%20EXN%20LOW%20VOLTAGE%20DISTRIBUTION%20TRANSFORMERS%207400CT1901%20CATALOG.PDF).
- Schneider's transformer-protection FAQ supports distinct primary and
  secondary winding limits for the both-sides protection arrangement. The
  implementation must also protect conductors and identify device placement.
  A shared secondary main cannot be replaced by checking each of several
  outgoing devices independently against the full transformer limit. Inrush,
  coordination and adopted-code compliance remain separate checks.
  [Manufacturer protection guidance](https://www.se.com/us/en/faqs/FA97084/).
- Eaton's application guide describes straight-voltage breaker applicability
  below the rated voltage and distinguishes slash-rated devices. A 240 V
  rating used for 208 V screening must retain its published rating voltage
  and supporting applicability basis; arbitrary imported ratings cannot be
  treated as straight ratings without evidence. See PDF page 39, sheet 27.3-7.
  [Eaton application guide](https://www.eaton.com/content/dam/eaton/products/low-voltage-power-distribution-controls-systems/swiching-devices/resources/enclosedcircuitbreakers-cagsection27-pages126thru135.pdf).
- Ground faults near a transformer can exceed the three-phase fault current.
  Eaton explicitly describes its comparative percentages as rules of thumb,
  not replacements for calculations. Consequently a transferred upstream
  three-phase current is only a three-phase screening basis. Ground faults,
  X/R-dependent interrupting duty and additional motor/generator contributions
  must remain identified as unevaluated.
  [Eaton SPD handbook, section 4.1.7.5](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/technical-literature/bus-ele-br-3002-spd-2017.pdf).

## Independent electrical verification

`tests/designSynthesisMixedVoltageOracle.test.mjs` reconstructs a radial network
from generated cable endpoints and the selected transformer's physical
terminals. Its expected values use a separate backward-current/forward-voltage
sweep in physical volts and amperes. It does not reuse the application model
builder, per-unit conversions, Newton Jacobian or catalog calculation helpers.

For each phase, load current is the conjugate of complex power divided by
voltage. Cable receiving voltage is sending voltage minus complex impedance
times receiving current. The transformer uses the secondary-referred series
impedance and its voltage ratio; its primary current includes transformed
load current and the specified core-loss shunt. Catalog coil loss is retained
as source evidence, not added a second time to modeled series I-squared-R loss.

Acceptance compares all modeled bus voltage magnitudes, both branch currents,
source real/reactive powers and total losses for mixed 25- and 50-load cases,
at two numerical MVA bases. This demonstrates the connected calculation chain
within its assumptions; it does not validate an installed transformer unit.
The independent electrical cases passed on October 18, 2026. The 25-load
fixture retains 20 kW of 208 V demand and 15 kW of direct 480 V demand. It
revises the initial 30 kVA choice to 75 kVA and obtains a minimum bus voltage
of 0.980047587 pu. The 50-load fixture retains 40 kW of 208 V demand and 30 kW
of direct 480 V demand. It revises 75 kVA to the sourced 150 kVA profile and
obtains 0.975905891 pu. Both retain the original 3% voltage limit, equipment
ratings, source and corridors. Direct 480 V loads do not traverse the
transformer and are not included in its secondary demand.

The 150 kVA profile uses catalog page 20: 235 W core loss, 3045 W published
coil loss, 3.79% impedance, 3.26% reactance and 1.70 X/R. Its series model uses
the published impedance and X/R; published coil loss remains separate source
evidence. This expands the actual selection catalog rather than loosening
the fixture's criteria. The profile revision is `schneider-exn-copper-2020-r2`.

The magnitude-only approximation does not claim a manufacturer's signed phase
displacement or magnetizing reactive current. Actual phase relationships,
unbalance, neutral circuits, saturation and inrush need additional models and
data. A numerical reference angle must not be exported as verified physical
winding displacement.

## Corrections found in independent review

- Primary feeder sizing and failed-path traversal initially did not carry
  conductor revisions across the transformer. Both voltage bases now take
  part in revisions, using one shared revision budget and retaining the
  selected transformer profile between conductor attempts.
- A profile retry could return a passing study without its final load-flow
  check. The proposal now carries the passing check and trial evidence.
- Aggregate secondary-main screening now checks 1.25 times solved secondary
  current, and the transformer loading policy checks both terminal currents.
  The study fingerprint includes transformer ratings, protection and policy.
- Named Apply could create a second undo entry when synchronizing the project
  name. Name synchronization is now inside the Apply transaction.
- A generic solver warning incorrectly described every transformer as
  magnitude-only. That wording now follows the synthesis-specific model flag;
  explicit phase inputs and a supplied zero magnetizing kvar are distinguished.

The electrical acceptance also checks a zero revision budget, a one-revision
profile change, an explicit profile allowlist, phase-reference invariance,
and stale evidence after protection or loading-policy changes. The combined
independent oracle and transformer accounting run passed 10/10 tests; its log
is `output/design-synthesis-mixed-voltage-2026-10-18/oracle-final.log`.

## Final verification — October 18, 2026

- `npm test`: all 423 discovered Node test files executed successfully. An
  initial sandbox run could not bind the local test server; an authorized run
  exposed stale page-contract documentation. The audit was regenerated and
  the complete final run passed (`node-verified.log`).
- `npm run build` passed every stage; `npm run lint` and `git diff --check`
  passed. No production changes followed these final gates in this milestone.
- The independent oracle now has seven passing cases, including primary-side
  conductor revisions and the exact browser regeneration fixture. The earlier
  ten-test combined oracle/accounting log above predates those extra cases.
- Storage acceptance retains complete resolved input evidence, selected primary
  and secondary device records, sources, and all 50 loads within the existing
  5 MiB named-project budget. Apply, undo/redo, stable transformer identities,
  saved snapshots, evidence reads, and failed-save rollback are checked.
- All 60 selected Edge cases were verified across the initial 58-pass run and
  focused reruns. The first reruns corrected test selectors and an expectation
  that demanded a 150 kVA transformer where 75 kVA actually met the unchanged
  criteria. The revised browser case retains all 55 kW of demand, including
  40 kW downstream of the transformer, and reaches 0.970065655 pu after
  conductor revisions. Independent arithmetic confirms this result.
- The separate transformer tap-review browser case passed. The mixed-voltage
  journey creates a normal named project, applies, reloads, regenerates with
  changed demand, and retains exactly one connected transformer.
- The actual four-page downloaded load-flow PDF was rendered and visually
  inspected. It preserves both transformer currents (13.7 A / 31.5 A in the
  initial browser fixture), the correct voltage-drop basis, and magnitude-only
  and magnetizing-current limitations. The text proposal and UI screenshots
  were also inspected. Report metadata remains plain in presentation.

Logs and artifacts are under `output/design-synthesis-mixed-voltage-2026-10-18/`:
`node-verified.log`, `build-final.log`, `lint-final.log`,
`oracle-browser-fixture.log`, `browser-final.log`, `browser-followup.log`,
`browser-regeneration.log`, `browser-pdf.log`, and `tap-browser.log`.
Earlier failures are retained rather than represented as passing runs.
Firefox was not revalidated; this browser evidence is Edge-specific.

## Remaining full-design scope

Motor starting/overload design, calculated network fault contributions,
coordination/settings, grounding, broader catalogs and voltage arrangements,
construction-matched detailed thermal selection, and construction deliverables
still need integrated acceptance. The overall equipment-to-design goal remains
active. The model restrictions in this record remain applicable after testing.
