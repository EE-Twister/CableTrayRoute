# Examples

Sample CSV files illustrating the expected formats for CableTrayRoute. Each file can be opened with Excel and saved as `.xlsx` if needed.

## Cable Schedule (`cable_schedule.csv`)

Columns (in order):

1. `tag`
2. `service_description`
3. `from_tag`
4. `to_tag`
5. `start_x`
6. `start_y`
7. `start_z`
8. `end_x`
9. `end_y`
10. `end_z`
11. `zone`
12. `circuit_group`
13. `allowed_cable_group`
14. `cable_type`
15. `conductors`
16. `conductor_size`
17. `conductor_material`
18. `insulation_type`
19. `insulation_rating`
20. `insulation_thickness`
21. `shielding_jacket`
22. `cable_rating`
23. `est_load`
24. `duty_cycle`
25. `length`
26. `notes`

## Ductbanks

Two files represent the different sheets:

- `ductbank_conduits.csv` — `conduit_id`, `conduit_type`, `trade_size`, `x`, `y`, `z`, `angle`
- `ductbank_cables.csv` — `tag`, `cable_type`, `diameter`, `conductors`, `conductor_size`, `weight`, `start_conduit_id`, `end_conduit_id`

## Cable Trays (`tray_schedule.csv`)

Columns (in order): `tray_id`, `start_x`, `start_y`, `start_z`, `end_x`, `end_y`, `end_z`, `width`, `height`, `capacity`

## Stand-alone Conduits (`conduit_schedule.csv`)

Columns (in order): `conduit_id`, `type`, `trade_size`, `start_x`, `start_y`, `start_z`, `end_x`, `end_y`, `end_z`, `capacity`

## Tray Import Template (`trays_template.csv`)

Columns (in order): `tray_id`, `start_x`, `start_y`, `start_z`, `end_x`, `end_y`, `end_z`, `width`, `height`, `current_fill`, `allowed_cable_group`

## Cable Import Template (`cables_template.csv`)

Columns (in order): `tag`, `start_tag`, `end_tag`, `cable_type`, `conductors`, `conductor_size`, `diameter`, `weight`, `allowed_cable_group`, `start_x`, `start_y`, `start_z`, `end_x`, `end_y`, `end_z`
