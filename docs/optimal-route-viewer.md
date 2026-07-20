# Professional Optimal Route Viewer

The Optimal Route page uses a Three.js desktop viewer to review calculated cable paths in a spatial plant context. The same canonical scene model drives the viewer, containment metrics, decision score, and GLB export so tray, conduit, and ductbank classifications remain consistent.

## What the viewer shows

- Cable trays as ladder-style raceways.
- Standalone conduits as cylindrical runs.
- Ductbanks as translucent envelopes with their internal conduits visible.
- Raceway colors keyed to each scheduled cable or voltage class. The legend is generated from the classes present in the current model, and hover details repeat the class explicitly.
- Selected cable routes as luminous cyan paths with a white centerline, soft halo, direction markers, endpoint markers, and labels.
- Field-routed gaps as amber dashed paths.
- Route density as a translucent blue corridor over raceways; wider corridors carry more calculated routes.
- A schematic industrial facility context with translucent floor slabs, grid lines, columns, beams, tray supports, switchgear, pump skids, vessels, and process piping. The context-density control keeps this reference geometry useful without obscuring routed assets.
- Equipment endpoint context, a translucent earth-toned grade datum at Z=0, elevation levels, a Z-up axis triad, a view cube, and a plan minimap. The grade surface uses subtle natural variation and a shallow soil cutaway to read as earth instead of another drafting plane. Below-grade ductbanks and conduits remain visible through the surface, while rings identify raceway transitions through grade. The complete treatment is controlled with the **Grade & context** layer toggle.

When ductbank conduits share only an envelope centerline, the viewer uses the scheduled row and column values to infer a separated internal arrangement. Hover text explicitly marks that placement as inferred. Supplied conduit paths always take precedence.

The built-in sample network includes separate HV and LV ductbanks below grade, plus dedicated above-grade Instrument and Communication tray networks. Each ductbank contains four conduits and terminates at a dedicated vertical RMC riser. The risers cross the Z=0 grade datum and connect directly to the first above-grade tray segment, so the selected power cables demonstrate a continuous ductbank → conduit → cable-tray route instead of an open-field jump. Cable 03 and Cable 04 demonstrate fully connected Instrument and Communication tray routes. Cables 03, 08, and 18 share an Instrument route, while Cables 11 and 21 share an HV route, so the sample also demonstrates automatic pull-set suggestions.

## Desktop review workflow

1. Load or import raceways and cables, then calculate routes.
2. Select a cable in the left route list to isolate its path.
3. Orbit or pan the model, or use Isometric, Plan, Front, and Right presets.
4. Use the right inspector to review total length, containment breakdown, bends, maximum fill, raceway count, field-routed length, and a compact route-sequence timeline.
5. Review the route score. It combines length efficiency, raceway containment, available capacity, and bend count into a 0–100 decision aid. It does not replace engineering judgment.
6. Review the comparison card below the viewer. It uses calculated length, field routing, bend, utilization, and score values. The panel states when only one candidate was calculated instead of inventing alternative-route values.
7. Toggle ductbanks, conduits, field jumps, labels, utilization coloring, or plant context to reduce visual noise. Use **Context density** to choose low, medium, or high facility detail.
8. Use **Eligible raceways** to show only raceways compatible with the selected cable, every class, or one class in isolation. Compatibility includes raceways assigned to the cable's class plus open-class raceways; the cyan selected route remains visible for comparison.
9. Save a PNG for a review package or export the complete scene to GLB for BIM coordination.

## Optional cable pull planning

Enable **Perform cable pull checks** in Routing Setup or press **Plan cable pull** in the selected-route inspector. The planner calculates pulling tension, sidewall pressure, pull direction, pull-section length, and field-equipment locations after a route is available. Project inputs include maximum pull length, cable tension, sidewall pressure, friction, bend radius, reel payoff tension, puller continuous rating, rope working-load limit, grip/pulling-eye rating, anchorage rating, sheave-support rating, and maximum tray-roller spacing. Cable-specific imported tension or sidewall limits take precedence over project defaults.

Keep **Allow short sections to be pulled by hand** enabled to replace a tugger recommendation with **PULL BY HAND** only when the section satisfies both the configured maximum distance and maximum calculated tension. The defaults are 25 ft and 200 lbf. A section longer than the distance limit or above the force limit retains a tugger, even if it passes the other test. This is a planning recommendation, not a crew-capacity certification; confirm staffing, access, cable control, grip method, and the site-specific safe-work plan.

In **Auto** direction mode, the planner calculates From → To and To → From, then selects the direction with fewer required sections, fewer mechanical tugger setups, and lower controlling utilization. For each section it places an orange reel at the payoff end and either a teal tugger or blue hand-pull station at the receiving end. Amber sheaves appear at route bends and containment transitions, while gray rollers are spaced along cable-tray sections. Color-matched leader lines connect every reel, tugger, hand-pull, and sheave callout to the exact 3D marker, even when labels are repositioned to avoid collisions. Route arrows follow the selected pulling direction. Use the **Pull equipment** canvas toggle to hide or show all field-planning equipment.

The individual-cable table labels its status column **Pull plan**. A pill such as **3 setups required** is a calculated result, not an action. Use **Show setup location** or **Show N setup locations** in the **3D locations** column to select the cable, enable Pull equipment and Labels, and return to the canvas with every reel, tugger or hand-pull, sheave, and roller marker visible.

The allowable tension is the lowest working limit among the cable, puller, rope, grip/pulling eye, and anchorage. Zero configured reel payoff tension invokes a screening estimate of 25 times the cable weight per foot. Sheave reaction uses the calculated line tension and route angle, and recommended radius is increased when required by sidewall pressure or imported cable bend-radius data. The selected-cable field plan lists reel stations, receiving method, section lengths, maximum tension, sheave quantities, roller quantities, sheave radius, and support reaction.

### Automatic multi-cable pull sets

Keep **Suggest multi-cable pull sets** enabled to compare routed cables after the individual pull checks finish. Automatic recommendations require the cables to share the complete start-to-end route and the same circuit class. Partial shared corridors, different HV/LV/Instrument/Communication assignments, missing cable weight or outside diameter, and combined equipment-limit failures are reported as reasons to keep cables separate.

The group calculation uses combined cable weight, an area-equivalent bundle diameter, the most conservative friction coefficient, and weight-proportional sharing of the total tension and sidewall pressure. The group card reports the number of payoff stations, physical cable reels, tugger setups, sheaves, rollers, and avoided separate pull operations. The **Maximum cables per suggested pull set** setting limits automatic group size from 2 through 12 cables.

Recommendations are advisory and default to separate pulls. **Plan together** records the selected pull-set decision in the routing session; **Keep separate** records the opposite decision. **Show common route** selects a representative cable in the 3D viewer because every recommended member follows the same complete route. The expandable **Why cables stay separate** list explains the closest shared-path percentage or circuit-class conflict for excluded cables.

The group model does not certify a pulling-head assembly or conduit jam clearance. Before construction, verify the pulling eye or basket-grip arrangement for every cable, reel synchronization and braking, conduit fill and jam ratio, manufacturer tension limits, bend packing, communications/instrument segregation requirements, and the crew's ability to control all payoff reels simultaneously.

Direction changes without modeled bend data use the configured default bend radius. These results remain installation-planning screens: confirm manufacturer data, exact fitting and sheave geometry, pull-box or vault access, equipment anchorage, working clearances, pull speed, splice strategy, and field conditions before construction. Intermediate section boundaries require an accessible staging or pull point; the route model does not certify site access.

## Data and persistence

Calculated route results store the enriched raceway utilization data alongside each batch. Reopening the project therefore preserves maximum-fill values in the inspector and utilization heatmap. Legacy saved route results without this enrichment still load; their capacity contribution is treated as unknown rather than zero.

The GLB export includes named tray, conduit, and ductbank nodes plus every calculated route segment. Cable bends and field jumps are preserved instead of being collapsed into a straight start-to-end chord.

## Fallback behavior

If WebGL or the Three.js bundle cannot initialize, the page falls back to the legacy Plotly visualization. Routing results, tables, and exports remain available.

## Desktop layout target

The review workspace is optimized for a 1440 × 900 viewport. The decision summary and cable list, 3D stage, and selected-route inspector occupy separate columns. Secondary engineering details such as pull checks sit below the visual workspace so they cannot crowd the route list or overlap the model. Automated UI coverage checks that these columns do not overlap and that the stage retains a useful review area.
