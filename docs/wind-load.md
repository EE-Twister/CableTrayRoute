# Wind Load Assumptions

The Wind Load page calculates cable tray wind force using the projected-area method:

```text
F = q_z x G x C_f x A_f
```

The page now separates the aerodynamic assumptions that previously lived inside one fill selector:

- Tray construction: ladder/open rung, ventilated/wire basket, or solid bottom.
- Fill condition: empty, partially filled, or fully filled.
- Cover condition: no cover, ventilated cover, or solid cover/hood.
- Optional engineer override for `C_f`.
- Optional projected area factor applied to `tray width x span`.

Default force coefficient behavior:

- Empty open ladder tray uses `C_f = 1.3`.
- Partially filled tray uses `C_f = 1.6`.
- Fully filled tray uses `C_f = 2.0`.
- Solid-bottom trays are treated as flat-plate conditions with `C_f >= 2.0`.
- Solid covers are treated as flat-plate conditions with `C_f >= 2.0`.
- Ventilated covers are treated as at least the partial-fill condition with `C_f >= 1.6`.

Schedule mode reads each tray's `tray_type` from the Raceway Schedule to infer construction. If the tray row includes `cover_condition`, the page uses it; otherwise it falls back to the Wind Load page default. Fill condition and any engineer override are applied from the Wind Load page defaults unless a tray row includes a specific wind fill value such as `wind_fill_level`, `fill_level`, or `current_fill`.

Final design should still verify manufacturer tray data, cover attachment requirements, and any uplift or support-connection checks not covered by this simplified lateral wind-force calculation.
