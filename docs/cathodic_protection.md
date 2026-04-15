# Cathodic Protection (CP) Sizing — Inputs, Equations, and Limits

**Page:** `cathodicprotection.html`  
**Module:** `cathodicprotection.js`

This guide documents the engineering basis used by the Cathodic Protection sizing tool for buried metallic structures.

## Inputs and Units

| Input | Symbol | Units | Notes |
| --- | --- | --- | --- |
| Asset type | — | categorical | `pipe`, `tank`, or `other`; selects base current-density table row. |
| Soil resistivity | ρ | Ω·m | Used for current-density adjustment (`< 50`, `50–200`, `> 200` Ω·m bands). |
| Soil pH | pH | — | Used to apply an acidic/alkaline adjustment outside nominal neutral range. |
| Moisture category | — | categorical | `low`, `moderate`, or `high`; selects base current-density table column. |
| Coating breakdown factor | f<sub>cb</sub> | fraction | `0 < f_cb ≤ 1`; represents exposed steel area fraction. |
| Surface area | A<sub>surf</sub> | m² | Total structure surface area used for CP demand calculation. |
| Current density mode | — | categorical | `table` (auto-selected) or `manual`. |
| Manual current density | i<sub>manual</sub> | mA/m² | Used only when mode=`manual`. |
| Anode capacity | C<sub>a</sub> | Ah/kg | Net ampere-hour capacity basis for selected anode alloy/system. |
| Anode utilization | u | fraction | Fraction of theoretical anode capacity considered usable. |
| Design factor | F<sub>d</sub> | fraction | Reliability/engineering margin factor used in mass/life equations. |
| Availability factor | F<sub>avail</sub> | fraction | System uptime factor; required current is divided by this factor. |
| Target design life | L<sub>target</sub> | years | Converted internally to hours (`years × 8760`). |
| Installed anode mass | M<sub>inst</sub> | kg | Used for predicted-life calculation. |

## Equations Used

### 1) Current density selection

When `table` mode is selected, the tool determines:

- A base current density from asset type + moisture category table (mA/m²), then applies:
  - Resistivity factor = `1.2` for `ρ < 50` Ω·m, `1.0` for `50–200` Ω·m, `0.85` for `ρ > 200` Ω·m.
  - pH factor = `1.15` for `pH < 5.5` or `pH > 9`, else `1.0`.


i<sub>design</sub> = i<sub>base</sub> × F<sub>ρ</sub> × F<sub>pH</sub>

Then convert mA/m² to A/m²:

i<sub>design,A</sub> = i<sub>design</sub> / 1000

### 2) Exposed area

A<sub>exposed</sub> = A<sub>surf</sub> × f<sub>cb</sub>

### 3) Required current

I<sub>req</sub> = A<sub>exposed</sub> × i<sub>design,A</sub>

Availability-adjusted current used for sizing:

I<sub>adj</sub> = I<sub>req</sub> / F<sub>avail</sub>

### 4) Required anode mass for target life

Design hours:

H = L<sub>target</sub> × 8760

Required mass:

M<sub>req</sub> = (I<sub>adj</sub> × H) / (C<sub>a</sub> × u × F<sub>d</sub>)

### 5) Predicted life for installed mass

L<sub>pred</sub> = (M<sub>inst</sub> × C<sub>a</sub> × u × F<sub>d</sub>) / (I<sub>adj</sub> × 8760)

### 6) Safety margin outputs

- Safety margin (years) = `L_pred − L_target`
- Safety margin (%) = `(L_pred − L_target) / L_target × 100`

## Assumptions and Limits

- Intended for preliminary CP sizing and scoping studies, not detailed final design.
- Current-density table values are generalized and should be project-calibrated with owner/asset historical data when available.
- Coating breakdown factor is a dominant uncertainty; select conservatively for life-cycle projections.
- Temperature correction, current-distribution nonuniformity, shielding, stray-current effects, and attenuation modeling are not explicitly solved in this simplified workflow.
- pH and resistivity effects are represented via bounded multipliers, not full electrochemical kinetics.
- Validation requires positive numeric values for major scalar inputs and enforces `0 < coatingBreakdownFactor ≤ 1`, `0 ≤ pH ≤ 14`.

## Standards References

The in-app standards basis references:

- **AMPP SP21424** — current demand selection workflow basis.
- **NACE SP0169** — external corrosion control and CP criteria basis.
- **ISO 15589-1** — cathodic protection design basis for buried/immersed pipelines.
- **DNV-RP-B401** — anode design/capacity and utilization guidance.

> Note: The tool uses these standards as design-basis references for equation form and parameter framing. Project-specific compliance still requires engineering sign-off against the exact edition and jurisdictional requirements.

## Revision Notes

- **2026-04-15:** Initial documentation page added for CP sizing inputs, equations, assumptions/limits, references, and consistency guidance between required-mass and predicted-life relations.
