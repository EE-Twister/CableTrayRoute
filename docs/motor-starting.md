# Motor Starting Study

The Motor Starting page is a deliberate study workflow. It automatically assembles candidate motors from the current project, but it does not calculate or save results merely because the page was opened.

## Workflow

1. Set the project limits for maximum voltage sag and acceleration time.
2. Review the motors automatically merged from the One-Line, Equipment List, and Load List. Schedule-only motors remain available even when they have not yet been placed on the One-Line.
3. Select the motors to include and review the source chips beside each motor. Select **Refresh Motors from Project** to discard local study edits and reload current project values.
4. Complete horsepower, rated voltage, power factor, efficiency, locked-rotor current multiple, Thevenin resistance/reactance, and combined motor-plus-load inertia.
5. Select a starting method and enter its setting and time.
6. Run the selected motors. A valid run is saved to the project and can be exported to CSV.

Linked fields have a green source edge. Editing one marks it as a local study override so project values and study-only assumptions remain distinguishable. The page uses 0.90 power factor, 0.90 efficiency, and 6× locked-rotor current as visible screening defaults where the project has no value. Source impedance and non-VFD inertia are required rather than silently assumed.

A successful run stores its input provenance and the controlling motor's starting kVA and approximate starting kW. Battery / UPS Sizing uses the starting-kW summary as peak-load context, and Generator Sizing uses the controlling motor record ahead of a schedule-only largest-motor estimate.

## Starting Methods

- Direct-on-line uses the full locked-rotor current.
- VFD uses the entered current-limit setting and ramp time.
- Soft starter uses the entered initial-voltage setting and ramp time.
- Wye-delta uses one-third locked-rotor current during the entered switching time.
- Autotransformer uses the square of the entered tap setting for the source-current screen.

The result is a Thevenin-equivalent screening calculation. It compares voltage sag and acceleration time with the project criteria and reports **Pass** or **Review**. It is not a full electromagnetic-transient or manufacturer-specific torque-speed simulation.
