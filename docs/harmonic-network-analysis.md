# Harmonic Network Analysis

The Harmonic Analysis page preserves the existing per-source screening results and adds a radial network view with results at every modeled bus, every feeder branch, and the selected point of common coupling (PCC).

## Result levels

- **Source results** report each source's fundamental current, injected spectrum, RMS harmonic current, and current THD.
- **Bus results** report voltage THD, the voltage-distortion screening limit, downstream harmonic current, current THD, the dominant order, local sources, and an expandable per-order voltage/current spectrum.
- **Branch results** report RMS and per-order harmonic current on the feeder into each downstream bus.
- **PCC results** vectorially combine the source-current phasors and report PCC voltage THD, current THD, and current TDD when maximum demand load current is provided.

The bus table is sorted by voltage THD. It initially renders at most 100 rows to bound DOM work; searching by bus ID or label exposes any bus in a large project without discarding its calculated result.

## Inputs

Harmonic sources use `harmonics` as `order:percent` pairs or an equivalent object, for example `5:20 7:14 11:9 13:7`. Imported or API-authored project data may provide optional `harmonicAngles` values as `order:degrees`. Missing angles default to zero degrees, so same-order currents add coherently.

The automatically selected slack/utility bus is the PCC. It requires either positive-sequence source impedance (`z1`) or short-circuit MVA plus X/R ratio in the project data. Maximum demand current is required only for current TDD and can be entered directly on the Harmonic Analysis page before recalculating the network.

## Screening model

The current network solver applies to connected balanced radial systems with one common voltage base and branches without transformer taps. For each harmonic order it:

1. converts each source spectrum into a current phasor;
2. sums downstream phasors in a backward tree pass;
3. calculates PCC harmonic voltage from the source Thevenin impedance;
4. propagates voltage distortion through branch impedance in a forward tree pass; and
5. calculates bus THD, branch RMS current, PCC THD, and optional PCC TDD.

Branch resistance is held constant and reactance scales with harmonic order. The result is explicitly `network-screening`, not final IEEE 519 compliance. Meshed networks, multiple voltage bases, transformer ratios, capacitors, tuned filters, frequency-dependent conductor resistance, and validated equipment phase-angle data require a detailed frequency-domain harmonic model and field verification.

## Large-project contract

`tests/harmonicNetwork.test.mjs` requires one utility, 1,000 downstream buses, and 2,000 attached devices to complete in less than 1,000 ms while returning all 1,001 bus results in a serialized result smaller than 2 MiB. The August 4, 2026 reference run completed in 19 ms.
