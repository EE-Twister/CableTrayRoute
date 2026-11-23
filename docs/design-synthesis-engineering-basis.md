# Design synthesis engineering basis and review notes

Status: bounded preliminary implementation independently reviewed, 2026-09-18.
Overall review class: **Screening only**.

## Review basis

Automatic design requires simultaneous electrical and physical constraints.
The Schneider Electric [conductor-sizing methodology](https://www.electrical-installation.org/enwiki/Conductor_sizing:_methodology_and_definition)
describes checking load current, voltage drop, protective behavior, and
installation conditions throughout the distribution path. This supports the
review methodology; it is not a substitute for the selected project's adopted
standard or proof of complete NEC/IEC implementation.

Generated proposals must record the implementation's supported scope. Missing
motor starting, fault clearing, grounding, installation, or protective-device
evidence must not become successful checks or fabricated selections. Source
fault current used as a screening bound must state its assumptions, including
whether downstream rotating-machine or other source contributions are excluded.

## Cable construction evidence

Southwire [SPEC 45301](https://cabletechsupport.southwire.com/en/tile/9/spec/45301/?country=US),
revision 1.000.008, archived manufacturer PDF retrieved October 24, 2026,
provides a useful candidate family for the initial three-phase example: three
copper phase conductors, XHHW-2 insulation, aluminum interlocked armor, PVC
jacket, and a bare copper ground. Its dimensional and electrical tables identify
individual stock references. The nominal dimensions are subject to manufacturing
tolerances. Catalog selection and project approval remain separate decisions.

The frozen transcription uses the complete archived [manufacturer PDF](https://cabletechsupport.southwire.com/cablespec/download_spec/?country=US&spec=45301), SHA-256
`d01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341`. An earlier
cached/indexed extract for the same printed revision differed from those PDF
bytes; it is not combined with the archived table. The implementation records
the exact stock identifier with each generated cable and fingerprints the
catalog in proposal inputs. The complete source identity is retained once in
the proposal and, on Apply, in the scenario key
`designSynthesisCableCatalogSource`; generated cable schedules and embedded
one-line connections carry the compact stock and catalog fingerprint. Apply
checks the PDF identity, R/X, both generated diameter fields, conductor count,
cable rating, and any construction-source claim against the same frozen row.
It also checks that one-line cable claims agree with the cable schedule.
Legacy project data is not rewritten during load or migration. A later
generation must be reviewed before replacement, and old cable records are
preserved until that Apply.

On Apply, top-level drawing connections store the canonical circuit reference
and only cable fields that differ from the canonical schedule. The existing
One-Line project view restores the complete cable record, including stock,
catalog fingerprint and impedance. Nested component connections remain intact.
Exact structural comparison preserves custom fields; a matching short hash is
not used as proof that fields are equal. Conflicting explicit circuit references
are not eligible for this deduplication. This avoids storing the same sourced
cable projection repeatedly while retaining undo, reload and ownership checks.

For an independent voltage-drop fixture, stock 606939 is #8 AWG, with nominal
overall diameter 0.833 inch, 75 C AC resistance 0.810 ohm/1000 ft, and 60 Hz
inductive reactance 0.052 ohm/1000 ft. Its manufacturer construction impedance
must not be silently replaced by a different conduit arrangement's tabulated
impedance while claiming the manufacturer supplied the calculation basis.
The selected 500 kcmil row is stock 380618 (2 AWG ground); the alternate stock
582274 has a different ground-conductor construction and is not substituted.

## Raceway capacity screening

`analysis/designSynthesisRaceways.mjs` provides the pure raceway adapter for
generated tray assignments. `evaluateDesignSynthesisRaceways({ corridors, cables,
routeResults, catalog })` enriches cables with outside diameter,
conductor count, conductor material/rating fields, and explicit `raceway_ids`,
then evaluates assigned trays through the existing Article 392 fill evaluator.
It proposes standard widths that fit the supplied corridor allowance. Missing
cable construction data, tray geometry, unsupported construction, congestion,
and invalid explicit tray assignments remain blocking issues. Endpoint legs
require explicit installation criteria and receive separate dedicated EMT
conduit proposals and fill checks; missing assumptions block complete
installation coverage. See [endpoint installation evidence](design-synthesis-endpoints.md).
Southwire SPEC45301 nominal
diameters are recorded only for the supported catalog family. Route endpoints
and corridor segments alone do not establish a verified tray installation.

## Independent arithmetic fixtures

For a balanced three-phase 10 kW electrical input at 480 V line-to-line and
0.9 lagging power factor, operating current is
`10000 / (sqrt(3) * 480 * 0.9)` amperes. A stated 125% continuous-load factor
acts on this current for the illustrative design-current check. Thirty
identical loads total `300 / 0.9` kVA. Five identical loads on a panel draw
five times the individual operating current before any explicitly permitted
demand adjustment.

For 150 ft one-way length of the #8 construction above, voltage drop is
`sqrt(3) * I * 0.150 * (0.810 * 0.9 + 0.052 * sqrt(1 - 0.9^2))` volts.
Divide by 480 V and multiply by 100 for percent. The upstream feeder drop
must also contribute to the total source-to-load path check. These expressions
are independent of the implementation's table lookup and selection loops.

## Protective-device evidence

The existing governed library includes exact catalog identities and source
documents, alongside representative legacy records and research-only entries.
Selection must use applicable voltage-specific interrupting ratings, current
rating, pole arrangement, frequency, and installation restrictions; a family
maximum or a plot alone is insufficient. See
[Protective Device Library Governance](protective-device-library-governance.md).
Preserve evidence status, source references, and unresolved coordination
requirements. Do not promote candidates or manufacture a human approval.

The initial bundled snapshot retains eight complete governed Eaton records,
including their field-source mappings, missing-production-evidence lists, and
lifecycle conflicts. This is a bounded candidate set, not an exhaustive market
search. On September 18, 2026 the
[FD3020 manufacturer page](https://www.eaton.com/us/en-us/skuPage.FD3020.html)
independently confirmed a complete 20 A, three-pole breaker, 50/60 Hz rating,
and 35 kA interrupting capacity at 480 V AC. The
[KDB3400 manufacturer page](https://www.eaton.com/us/en-us/skuPage.KDB3400.html)
is the source reference for the 400 A candidate. Exact voltage-specific ratings
must govern selection; the maximum equipment voltage is not an interrupting
rating. Missing rating-level frequency may inherit a documented compatible
device frequency; an explicit incompatible rating frequency cannot.

The industrial sample's 20 kA available current is a declared synthetic input,
not a measured site value or a short-circuit calculation. Any use as a common
downstream bound excludes additional downstream source contributions. Industrial
motor contributions, coordination, trip settings, and equipment assembly SCCR
remain separate unresolved engineering checks.

## Completion evidence

The optional [cable fault thermal screen](design-synthesis-cable-fault-withstand.md)
uses the archived SPEC45301 copper MC construction, SPEC10080 nominal conductor
metal areas, and Southwire CTS0002 (2023) coefficient 0.0719 for a single event
from 90 °C to 250 °C. The area table supplies only a metal-area conversion.
The separate Schneider installation-guide method supplies the five-second
upper domain; the application restricts supplied clearing claims to 0.1–5 s.
The comparison integrates each cable terminal's signed per-phase RMS phasors
separately and uses the larger exposure. The continuous fault-selection mode
also covers cable-side endpoint limits and every interior position of every
generated cable against every selected conductor, including faults elsewhere
in the network. Complete polynomial extrema apply to the supplied rounded
coefficient model; network forward error and physical uncertainty are not
enclosed. Legacy bus-only requests retain their old scope. Actual protective
clearing/let-through and repeated-event heating remain outside the model. A supplied clearing claim
and reference do not establish protection adequacy. Qualification remains
unevaluated. A valid numerical failure can now drive successive sourced
conductor floors under the same absolute load-flow/motor/thermal revision
budget. Each candidate regenerates dependent routes, raceways, protective
selections and studies. Incomplete evidence or an exhausted/infeasible search
keeps Apply blocked. Zero revisions evaluates without retrying; it does not
change the supplied clearing claim or any engineering limit.
Implementation and independent verification status are recorded in the
acceptance contract below.

The [acceptance contract](design-synthesis-acceptance.md) records the observed
workflow checks, regression results, and remaining scope. Independent numeric
fixtures and ordinary browser journeys cover the supported preliminary model.
These checks do not establish completion of the broader industrial-design
vision or change the screening classification above.
