# BESS Hazard / Thermal Runaway Screening

CableTrayRoute provides preliminary engineering screening for battery energy
storage system layouts, generic thermal-runaway sensitivity, and
deflagration-vent inputs. It does **not** determine NFPA 855 or NFPA 68
compliance, complete or approve a Hazard Mitigation Analysis (HMA), or replace
UL 9540A and project-specific gas test data.

## References and limits

| Reference | How it applies |
|---|---|
| NFPA 855 | Defines installation requirements and the project-specific HMA process. Required provisions depend on the adopted edition and installation. |
| NFPA 68 | Governs final deflagration-vent design, including applicability, geometry, pressure, vent construction, and discharge. |
| UL 9540A | Test method used to obtain system-specific fire-propagation and gas-release data. The app does not reproduce this test. |
| Adopted fire/building/electrical codes | Must be identified for the project and coordinated with the Authority Having Jurisdiction (AHJ). |

## Study inputs

| Input | Unit | Notes |
|---|---|---|
| Total rated capacity | kWh | Used only to select a built-in advisory distance reference |
| Battery chemistry | — | Selects generic screening assumptions for LFP, NMC, NCA, lead-acid, or NiCd |
| Cells per module | — | Used by the generic propagation sensitivity model |
| Modules per rack | — | Used by the generic propagation sensitivity model |
| Ambient temperature | °C | Applies a simple temperature sensitivity factor |
| Room volume | m³ | Input to the preliminary vent equation |
| Vent opening pressure, P_stat | kPa | Assumed vent activation pressure |
| Installed vent area | m² | Used for a diagnostic comparison only |
| Exposures | m | Property line, occupied building, or ignition-source distances |

## Screening calculations

### 1. Advisory separation references

The application retains the following generic values to flag layouts for
review. They are not labeled as NFPA 855 minimum distances:

| Exposure type | ≤ 50 kWh | > 50 kWh |
|---|---|---|
| Property line | 0.9 m (3 ft) | 1.5 m (5 ft) |
| Occupied building | 1.5 m (5 ft) | 3.0 m (10 ft) |
| Ignition / electrical source | 0.9 m (3 ft) | 0.9 m (3 ft) |

An entered distance below its reference receives a **screening alert**. A
distance at or above the reference still receives **engineering review**, not a
compliance pass. Final separation must be established from the listed system,
UL 9540A report, adopted code edition, fire-protection features, permitted
alternatives, and AHJ decisions.

### 2. Generic thermal-runaway sensitivity

The model applies a chemistry-wide base time and an ambient-temperature factor,
then scales by the entered cell and module counts:

```text
temperature factor = 2^(-(ambient °C - 25) / 10)
cell-to-cell time = chemistry base time × temperature factor
cell-to-module time = cell-to-cell time × cells per module × 0.7
module-to-rack time = cell-to-module time × modules per rack × 0.5
```

The 0.7 and 0.5 factors are generic assumptions, not validated thermal-barrier
properties. The result is not a UL 9540A result and must not be used to claim
propagation resistance, suppression effectiveness, or installation approval.

### 3. Preliminary deflagration-vent equation

The application evaluates this screening equation:

```text
A_v = (P_stat^(-0.5682) × K_G^0.5922 × V^0.6672 × P_max^0.1723) / 1640
```

where `P_stat` is in bar, `K_G` is in bar·m/s, `V` is in m³, and `P_max` is in
bar. The chemistry-wide `K_G` and `P_max` values are assumptions. They cannot
replace gas composition, concentration, burning velocity, maximum pressure,
vent efficiency, duct, geometry, congestion, or other project data required by
the final NFPA 68 design.

### 4. Review summary

The overall status is always **engineering review required**. Diagnostic fields
record whether the inputs meet the built-in separation, 30-minute propagation,
and vent-area screening references. These flags prioritize investigation; they
are not pass/fail code determinations.

## Implementation

| File | Purpose |
|---|---|
| `analysis/bessHazard.mjs` | Pure screening calculations and review flags |
| `bessHazard.html` | Study page and limitations |
| `bessHazard.js` | Page rendering and CSV export |
| `src/bessHazard.js` | Rollup bundle entry |
| `tests/bessHazard.test.mjs` | Unit tests, including the no-compliance-pass invariant |

## Required project review

Before design or permitting decisions, obtain the exact product listing and
manufacturer documentation, applicable UL 9540A reports, project gas data,
adopted code editions and amendments, fire-protection design, and AHJ criteria.
A qualified engineer must evaluate those materials and complete the required
HMA and deflagration analysis.
