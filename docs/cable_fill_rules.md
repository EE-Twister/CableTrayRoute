# Cable Fill Rules

Cable trays and conduits do not share one universal percentage rule. Geometric packing density is useful for layout review, but it is not by itself an NEC cable-tray determination.

Fill percentage is computed as:

\[ F = 100 \times \frac{\sum A_{\text{cable}}}{A_{\text{space}}} \]

Where \(A_{\text{cable}}\) is the area of each cable and \(A_{\text{space}}\) is the usable area of the tray or conduit. A generic percentage is only a preliminary packing or project-capacity screen.

The shared tray evaluator is edition-pinned to NFPA 70 (NEC) 2023, 392.22(A)(1) through (A)(4), for multiconductor cables rated 2000 V or less in ladder, ventilated-trough/wire-mesh, and solid-bottom trays. It distinguishes:

- all multiconductor cables 4/0 AWG or larger, using the sum of cable diameters;
- all multiconductor cables smaller than 4/0 AWG, using the exact Table 392.22(A)(1) area for the listed tray width;
- mixed arrangements, using the applicable Column 2 or Column 4 diameter penalty; and
- control/signal-only arrangements, including the six-inch usable-depth cap.

The evaluator does not interpolate unlisted widths or automatically pass single-conductor, channel-tray, medium-voltage, ampacity-spacing, manufacturer-specific, or AHJ-specific arrangements. Missing cable conductor count, conductor size, outside diameter/area, tray construction, or required dimensions produces an incomplete-evidence result and blocks issue-ready routing deliverables.

Conduit checks use the recognized wiring method and trade-size internal area plus the NEC Chapter 9 count-based 53%, 31%, or 40% screen. Installation-specific conditions, exact conductor/cable construction, nipples, and adopted-code requirements still require qualified review.

Primary source used for the selected tray rules: [NFPA 70 2023 code-development record containing 392.22 text and Table 392.22(A)(1)](https://docinfofiles.nfpa.org/files/AboutTheCodes/70/70_A2022_NEC_P08_FD_PIReport_rev_1008.pdf).
