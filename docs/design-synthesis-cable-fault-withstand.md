# Cable fault thermal withstand screen

The optional `cableFaultWithstand` input requests a conditional single-event adiabatic screen for final generated Southwire SPEC45301 copper MC cables. It requires the exact frozen catalog source, final cable schedule identities, a complete fault study, and the supplied `faultEvolution` history. Choose `all-generated-bus-and-cable-span-faults` to check every selected conductor against all generated bus faults and the complete closed length of every generated cable. Faults in unselected cables still act on selected conductors. The `all-modeled` cable selection means every cable in the final generated proposal; it does not mean unrelated owner cables already in the project. Older `all-generated-bus-fault-cases` requests retain their visibly limited bus-only scope.

```js
{
  schemaVersion: '1.0.0',
  cableSelection: { mode: 'all-modeled' },
  faultSelection: { mode: 'all-generated-bus-and-cable-span-faults' },
  clearing: {
    maximumTotalClearingTimeS: 1.5,
    reference: 'supplied time-current evidence reference',
    applicabilityReference: 'statement covering every modeled source',
    appliesToAllModeledSources: true
  },
  thermal: {
    conductorMaterial: 'copper',
    maximumInitialTemperatureC: 90,
    finalTemperatureC: 250,
    singleEvent: true,
    adequateRecoveryBeforeEvent: true,
    reference: 'single-event condition basis'
  }
}
```

The implementation accepts maximum total-clearing claims from 0.1 through 5 seconds. The 0.1-second lower endpoint is an application restriction; it is not a manufacturer guarantee. The five-second upper method domain comes from the separate [Schneider Electrical Installation Guide](https://www.electrical-installation.org/enwiki/Verification_of_the_withstand_capabilities_of_cables_under_short-circuit_conditions), not from the Southwire cable paper. The supplied time and applicability references remain unverified statements and the application does not calculate actual device clearing, DC offset, peak duty, or let-through.

For each supported cable, the evaluator verifies the exact stock ID, catalog fingerprint, construction fields, three-conductor count, rating, dimensions, and impedance against the archived Southwire SPEC45301 PDF. It uses a nominal circular-mil area from the separate [Southwire SPEC10080 area table](https://cabletechsupport.southwire.com/en/cablespec/download_spec/?country=International&spec=10080) as an area conversion only; that bare-conductor table does not supply insulation or cable-construction assumptions. The short-circuit coefficient comes from [Southwire CTS0002 (2023)](https://www.southwire.com/medias/2307-Short-Circuit-Currents-Insulated-Cables-Whitepaper-PRINT.pdf?context=bWFzdGVyfHJvb3R8ODIzNzE3fGFwcGxpY2F0aW9uL3BkZnxoMDkvaGJkLzkyMjU2NjM3NzQ3NTAvMjMwN19TaG9ydF9DaXJjdWl0X0N1cnJlbnRzX0luc3VsYXRlZF9DYWJsZXNfV2hpdGVwYXBlcl9QUklOVC5wZGZ8YTM5OWJmMzQ0OWEzZDhmNzkyMDhiOWYyYTM1YTBkMDhmZDEwM2QzY2M5Y2Y2NzkwYWFmMTUxMDZkMjZiYzllZg), which gives `Isc = A_cmil × 0.0719 / sqrt(t)` for copper thermoset from 90 °C to 250 °C. Thus the allowable exposure is `(A_cmil × 0.0719)² A²s`. If the declared maximum initial temperature is lower than 90 °C, this remains the conservative 90 °C basis; no ambient temperature is inferred.

For each generated bus-fault case, the signed complex FROM and TO cable terminal histories are independently interpolated to the requested clearing endpoint and integrated as piecewise-linear phasors. The larger of the two integrated per-phase RMS exposures controls the comparison. Endpoints are not switched at individual knots, and phase conductors are not multiplied by three. The immediate-load-side zero-impedance cases are excluded because their `branchCurrents` retain the original bus-fault values; only device current is corrected in those rows.

An evaluated result contains a pass or fail comparison for every selected cable and generated bus-fault pair. A numeric failure can start automatic conductor trials when the operating, motor-starting, fault, and source-history studies are otherwise complete. Each failed cable is raised to the next sourced conductor size, then the proposal regenerates routes, panel/raceway/One-Line records and protective selections and reruns the operating, motor, fault, history, and thermal studies. The original loads, criteria, source model, supplied history profile, clearing claim, and request identities are retained. A changed or ambiguous selected cable identity stops the process.

The trials share the absolute `criteria.loadFlow.maxRevisions` budget with existing operating and motor-starting/acceleration revisions. The initial design is revision 0; each conductor candidate consumes a revision, and nested study retries retain their absolute revision numbers. `maxRevisions: 0` evaluates the supplied design without trying another conductor. Unchanged conductor floors from prior operating or motor revisions remain in force. A route, raceway, installation, study, or budget failure stops the trial sequence and leaves Apply blocked. The result and reports retain each candidate's absolute revision, requested cable and feeder floors, conductor changes, route/raceway/protection changes, nested study attempts, thermal comparison, and stopping reason; only the final attempted candidate's complete numerical study results are retained. Apply checks the recorded budget against the original proposal criterion, validates the chronological trial structure and sourced size transitions, and recomputes the final numeric result. It does not replay every prior network solve during Apply. The revision trace also records the exact original design criteria used for the candidates; the saved viewer verifies that binding and displays the criteria in the review details, TXT report, and attached JSON. New saved records require a validated trial trace; older saved thermal records without a trial trace remain readable under their existing context/result checks.

A failing or incomplete requested screen blocks Apply. A pass is only conditional exposure evidence: `qualificationStatus` and `protectionAdequacy` remain `unevaluated`. Continuous requests report `generated-bus-and-continuous-cable-span-faults`; legacy requests retain `generated-bus-fault-cases-only`. The thermal assumption covers one event starting at or below 90 °C after adequate recovery; repeated events are not accumulated. Automatic sizing is a bounded screening trial, not complete cable qualification, protection coordination, or approval. Existing motor protection blockers remain in force, and motor Apply remains blocked.

This checks insulated phase conductors using the balanced three-phase fault model.
It does not evaluate earth faults, neutral or grounding-conductor heating, or
armor/sheath fault-current paths.

When applied to a named project, the request, result, and structurally checked revision trace are stored alongside the existing lossless fault-evolution evidence. The saved viewer rechecks the project/scenario context, current fault study, exact cable-to-branch bindings, catalog source, final numeric result, and trace binding before showing numeric values. It does not claim to replay each prior candidate solve during reload. Legacy fault-history records with no cable-withstand request remain readable, as do older saved thermal records that predate the optional revision trace.

## Continuous cable-span calculation

Let A identify a faulted cable and B a selected conductor. The evaluator checks every A × B pair, including A ≠ B. It does not infer interior maxima from endpoint or midpoint samples. An independent synthetic two-source radial fixture has a maximum at 3.1388224894% of another cable's length: 3,853,249.467679 A²s exceeds the #6 allowance of 3,559,470.862336 A²s, while its endpoint/midpoint samples remain below that allowance.

For finite A, an unfaulted-network port response supplies the endpoint impedance block H, source voltage contributions, and signed branch-current transfer columns. With normalized distance a from A's FROM end, `D(a) = a(1-a)z + [1-a,a] H [1-a,a]ᵀ`. The two H transfer directions remain distinct with complex transformer taps. Own-cable half-conductor currents have affine numerators; other-conductor currents have quadratic numerators over D. Source contributions combine as complex phasors before squaring. Exact integration of the supplied linear source history through the clearing endpoint gives `Q(a)/|D(a)|²` with stationary polynomial degree at most six. The two faulted cable halves need not carry equal and opposite currents.

`rationalPolynomialEnvelope.mjs` converts supplied Float64 coefficients to exact dyadic integers and uses positive-scale primitive pseudo-remainder Sturm sequences to count and isolate every distinct stationary root in (0,1). Both closed endpoints are included. Repeated roots, constant envelopes and exact limit equality at an irrational stationary point are handled explicitly. A denominator zero, unresolved comparison, excessive coefficient growth or exhausted root work blocks the result. Bounds are degree six, 32,768 coefficient bits, 128 bisection levels, 1,024 bisections per terminal envelope and 500,000 total bisections per candidate. The existing combined 12,000 pair and 150,000 pair-knot budgets remain in force.

These exact operations certify extrema of the supplied rounded coefficient model. They do not supply forward-error enclosures for the numerical network solve or certify physical source, cable or clearing-time uncertainty. Overall classification remains **Screening only**. Numeric position intervals are outward-rounded, and exact dyadic endpoints are retained. Overlapping worst-location enclosures remain explicit candidates rather than a claim of a uniquely certified physical location.

An ideal zero-impedance fault cable is replaced transiently by two exact ideal halves and a virtual fault bus; the shared solver recovers unique half currents by original-node KCL. Position is immaterial in this ideal model. Ideal cycles and existing network size limits still block; no epsilon impedance is added. For exactly one in-service source on a connected unloaded branch tree, exact circuit identities eliminate unfed off-path branch currents and reduce the active denominator to a linear expression. This structural reduction counts every A × B pair and uses no small-current threshold. Any second connected source, including a zero-EMF source, or any mesh retains the general network response method.

The displayed result retains ordinary bus-pair rows and one continuous envelope row per selected B. FROM and TO values in an envelope row are independent maxima and may occur on different A spans or positions. JSON retains their possible controlling spans and positions, coverage counts, root-work evidence and model fingerprints. A failed B drives its own conductor-size trial; an unselected faulted A is not resized merely because it caused B to fail.

Saved continuous records add a lossless reconstruction context inside the existing packed evidence payload. Explicit undefined fields and negative zero are preserved because they contribute to the original network fingerprint. Reload rebuilds the canonical network, requires its initial-study fingerprint to match the current saved study, and recomputes the final continuous envelope before exposing numbers. The transient response matrix is not persisted, and prior conductor candidates are not re-solved. Existing storage encodings and the 5 MiB quota are unchanged.
