# Voltage Drop Study

The Voltage Drop Study connects Cable Schedule geometry and conductor data to operating values from the Cable Schedule, a converged Load Flow result, or the Load List.

## Input precedence

For each cable, the study resolves current and voltage in this order:

1. Explicit values already recorded on the cable
2. A valid converged Load Flow result matched to the cable endpoint
3. Load List kW/kVA, power factor, phase, and voltage matched to the cable endpoint

The cable's insulation rating (for example 600 V or 5 kV) is not an operating voltage. It is used only as a last resort when no operating, Load Flow or Load List voltage exists; the result is then marked "Cable insulation rating (assumed)" and the study warns, because a 600 V rating on a 480 V circuit would understate the percent drop by 20%.

The result records the current source for every cable. A missing source leaves the cable not evaluated instead of substituting an unexplained default.

## Calculations

Individual circuit drop uses conductor resistance and reactance with the modeled load power factor. Connected cable endpoints are assembled into upstream-to-downstream paths so feeder and branch drops can also be checked together.

The page reports:

- Individual drop in volts and percent
- Individual recommendation status
- Feeder-plus-branch path and combined drop
- Current/voltage input source
- The next modeled conductor size that meets the remaining path allowance, when one is available

The installed cable's voltage drop is calculated from its selected size, phase
representation, power factor, parallel run count, and impedance override. A
different conductor size may be suggested by sizing; its modeled drop is shown
as a recommendation and does not replace the installed cable result. Table 9
and the DC fallback accept AWG/kcmil conductor tokens only. Metric or malformed
descriptions remain unevaluated until a sourced metric impedance is provided.
Each result records its impedance basis: NEC Chapter 9 Table 9 AC resistance
and reactance, a temperature-corrected DC resistance fallback, or an explicit
resistance override with reactance assumed zero. An override therefore remains
the governing value when the selected conductor size changes; clear it before
expecting a conductor change to alter the drop.

The 3% branch/feeder and 5% combined values are design recommendations used for screening; they are not presented as mandatory NEC pass/fail limits.

## Controlled writeback

Conductor recommendations are selected explicitly. **Apply Selected Recommendations** confirms the changes, writes only the selected conductor sizes through the Cable Schedule data API, and reruns the study. The original project change remains available to the project undo/redo history.

## Saved-result readiness

A result is saved and exportable only when every cable and every assembled path is evaluable. The result stores a source fingerprint and becomes stale when its Cable Schedule, Load List, or Load Flow source changes.

## Result visualizations

Results open with a bar chart of each evaluated cable's voltage drop. A vertical tick on every bar marks that cable's allowed limit. Pass, review and fail states use an icon, a color and a label, so they do not rely on color alone. The full table follows the chart.
