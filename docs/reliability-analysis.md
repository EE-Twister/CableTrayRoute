# Reliability Analysis

The Reliability page provides a project-level screening analysis based on the One-Line topology, Load List service points, and governed component MTBF/MTTR inputs.

## Governed inputs

Each eligible component requires:

- MTBF greater than zero
- MTTR greater than or equal to zero
- A source reference
- A source date

Inputs may be stored on the One-Line component, entered as a component override, or populated from a shared source basis. Overrides, source references, source dates, and analyst notes persist in `settings.reliabilityInputs`.

Appropriate evidence may include owner maintenance history, manufacturer reliability data, or a documented industry reliability dataset. The page records the basis but does not assert that values from different populations or operating environments are interchangeable.

## Service metrics

Load List records are matched to One-Line components using stable IDs and tags. The analysis reports:

- Component availability and expected downtime
- Load-weighted service availability
- Expected interruptions per year and average interruption duration
- Expected energy not supplied (EENS)
- Critical-load EENS
- Per-service-point availability, outage hours, interruption frequency, and EENS

If no Load List service points can be matched, One-Line buses are used as a clearly labeled fallback.

## Minimal cut-set screening

The topology engine removes eligible components and checks which service points become disconnected from a source:

- N-1 rows identify single component outages that interrupt service.
- N-2 rows identify true two-component cut sets; a pair is excluded when either member already causes the same interruption by itself.

N-2 screening is bounded to 50 outage candidates. Larger models receive a warning and require a specialized reliability tool or a scoped candidate set.

Cable, feeder, and link connector elements define the graph topology but are not assigned standalone failure probabilities in this screening model.

## Saved-result readiness

Incomplete MTBF/MTTR coverage is displayed as missing data. Incomplete source evidence is displayed as a governance warning. A result is saved and exportable only when both engineering-input coverage and source coverage are complete.

The saved result includes run metadata and a source fingerprint. A change to the One-Line, Load List, or reliability inputs marks the saved result stale.

## Limitations

This is a steady-state minimal-cut-set screening model. It does not model switching time distributions, common-cause failures, weather correlation, protection misoperation, crew logistics, maintenance states, or time-sequential restoration. Those effects require a more detailed probabilistic reliability study.
