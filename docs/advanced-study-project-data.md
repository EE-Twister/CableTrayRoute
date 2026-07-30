# Advanced Study Project Data

The advanced power-system pages share a project-data adapter rather than maintaining separate, disconnected demonstration models.

## Project-derived inputs

| Study | Imported data | Deliberately manual data |
|---|---|---|
| Voltage Stability | One-Line buses, bus types, loads, generation, branch R/X | Sweep limits, study MVA base, final continuation-power-flow assumptions |
| Optimal Power Flow | Generator min/max output and connected real-power load | Missing quadratic cost coefficients, unit commitment, ramp and network constraints |
| Frequency Scan | Bus voltage, Short Circuit strength/X/R, capacitor/filter data, cable R/X/length | Evaluation bus selection where the project has multiple possible PCCs, manufacturer frequency-dependent data |
| Transient Stability | Generator inertia/frequency/operating power and saved clearing time when available | During-fault and post-fault transfer limits from a validated network reduction |

The adapter never fills missing cost curves or dynamic transfer limits with authoritative-looking defaults. It reports the unresolved assumptions beside the import action.

## Provenance and stale results

Project-derived runs store a deterministic fingerprint of the source records used by that study. When the relevant One-Line, cable schedule, or Short Circuit result changes, the saved result is marked stale and export is withheld until the study is imported and rerun.

Manual studies remain supported. Their report section identifies the source as manual rather than implying a project-data linkage.

## Reporting

Project Report includes dedicated sections for:

- Quasi-Dynamic Load Flow
- Probabilistic Load Flow
- N-1 Contingency
- Voltage Stability
- Frequency Scan
- Transient Stability
- Optimal Power Flow

Every advanced section includes run validity, source, timestamp, convergence context, warnings, summary values, and its principal result table. Legacy results without the new run metadata are labeled **Legacy / unverified result**.
