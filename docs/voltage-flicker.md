# Voltage Flicker Study

Screening assessment of short-term (Pst) and long-term (Plt) flicker severity at the point of common coupling (PCC) for step-like fluctuating loads (arc furnaces, welders, motor starts).

## Method

1. **Relative voltage change per step.** With the source impedance angle ψ = atan(X/R) and the load angle φ = acos(pf):

   d = (ΔP·R + ΔQ·X) / V² = (ΔS / S_sc) · cos(ψ − φ)

   A resistive step on a stiff source (X/R = 10) changes the voltage about ten times less than ΔP / S_sc; a low-power-factor motor start changes it about three times more. Enter the **load power factor** of the step (default 0.9 lagging; use the locked-rotor power factor for motor starts). A per-step `powerFactor` overrides the study value.
2. **Pst** is read from an iso-Pst matrix by log-log interpolation on ΔV and repetition rate.
3. **Plt** = (Σ Pst³ / N)^(1/3) over 12 ten-minute periods. Without measured Pst values it is estimated from the worst-case Pst.

## Limits

- Pst ≤ 1.0 limit, 0.8 planning level.
- Plt ≤ 0.65 limit (IEC 61000-3-3), planning level 80% of that.

## Limitations

The Pst matrix is an engineering approximation that has not been verified against IEC 61000-4-15 Table 5; the study says so in its warnings. Use it for screening, and confirm with a flickermeter measurement or the utility flicker study before relying on a pass.
