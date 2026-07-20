# Engineering Sample Report Package

The **Project Workflow Core** gallery sample includes a report-ready electrical dataset that can be assembled into one PDF calculation book. The sample intentionally uses the issue status **Sample - Not for Construction** because its study values and protective-device curves are demonstrations, not field-verified engineering results.

Install the PDF dependency once, then generate the package from the repository root:

```powershell
npm run sample:engineering-report:setup
npm run sample:engineering-report
```

The stable output path is:

```text
output/pdf/project-workflow-core-engineering-package.pdf
```

The expanded sample contains 13 equipment records, 10 loads, 14 cables, three cable trays, two ductbanks, 20 one-line components, nine short-circuit/arc-flash study buses, six protective fuses, three radial TCC studies, and 14 stored route results.

The package contains 22 sheets:

1. Cover sheet
2. Document control and clickable table of contents
3. Executive summary and design basis
4. Equipment list
5. Load list and demand summary, including power factor
6. Cable schedule with operating voltage, cable rated voltage, and yellow/red voltage-drop screening
7. Raceway schedule
8. Ductbank DB-101 cross-section view
9. Ductbank DB-102 cross-section view
10. Cable tray TR-PWR-101 cross-section view
11. Cable tray TR-PWR-102 cross-section view
12. Cable tray TR-PWR-103 cross-section view
13. Electrical one-line diagram
14. Short-circuit study
15. Arc-flash study summary
16. Arc-flash labels, sheet 1
17. Arc-flash labels, sheet 2
18. Process pump series-fuse coordination chart
19. Production compressor series-fuse coordination chart
20. Warehouse transformer series-fuse coordination chart
21. Protective-device settings and coordination intervals
22. Engineering review checklist and limitations

The generator reads `samples/project-workflow-core.json`; schedules, diagrams, labels, and study tables are not maintained as separate report-only copies. Report-specific metadata, schematic cross-sections, and protective-device settings live under `settings.projectMeta`, `settings.engineeringPackage`, `settings.tccSettings`, and `settings.studies` so the source data remains reviewable with the project.

The one-line, cable tray, and ductbank report sheets use the same browser rendering surfaces as the application. The generation command first opens the Project Workflow Core sample in a headless Chromium session and captures the application-rendered `#diagram`, `#svgContainer svg`, and `#grid` surfaces. The one-line uses Engineering Print mode with the **Report Annotations** datablock preset, showing protective-device amp-trip values plus transformer voltage ratios and winding configurations. Its live content is fitted to the report viewport, MCCs are rendered as horizontally extended buses with clearance from adjacent branches, ports in legacy or custom component boxes are transformed through the same centered aspect-ratio fit used by their SVG images so visible icon leads and connector centerlines coincide, every connector and component terminal uses the same 3 px stroke weight, and every connected non-bus terminal uses a short square-ended bridge that overlaps the connector and component symbol to eliminate rasterized white seams. Transformer terminal bridges and painted leads extend into the winding circles instead of stopping at their boundaries, while winding labels remain offset from the terminal axis; motor loads use the upright circle-M symbol with a vertical feeder lead, VFDs use a labeled rectangular enclosure with top and bottom terminal leads, and panelboards act as single-connection loads with one top incoming terminal and no bottom leader. Automated audits confirm that every connection terminates on its target symbol, every component-terminal bridge is present, each endpoint shares the exact terminal centerline and stroke width, motor icon centerlines coincide with their visible terminal leads, both VFD terminals coincide with the painted top and bottom symbol leads, both transformer terminals are connected and unobscured, LP-101 and LP-102 panelboard terminals visibly mate with their incoming feeders, and every direct feeder falls vertically beneath its bus. Ductbank report captures use the page's **Earth/Sky Context** toggle in the off position so the cross-section remains legible at sheet scale. The PDF stage then embeds those captures without re-laying out the engineering graphics. Intermediate captures and their provenance manifest are written to `tmp/pdfs/engineering-report-visuals`; the single deliverable remains the PDF under `output/pdf`.

Each sample ductbank now contains the complete conduit array plus explicit top, bottom, left, and right concrete padding. The drawing labels the minimum cover and dimensions the resulting concrete envelope. DB-102 also demonstrates two control cables installed in the same conduit, using numbered markers keyed to a cable-identification legend so both tags remain readable at drawing scale. Cable tray drawings show physical divider boundaries, named zones, numbered cable markers, a cable-tag legend, and an explicit dotted-line stacking-boundary callout; the accompanying report row also identifies tray material.

The table of contents contains internal PDF links and the document includes section bookmarks. The load list includes PF, while voltage-drop cells in the cable schedule are yellow above 3% through 5% and red above 5%. The short-circuit sheet defines DLG as double-line-to-ground, and each arc-flash label includes the ANSI Z535.4 safety-alert triangle and exclamation mark in its warning panel plus the controlled label-creation date.

Section 13 is split into three radial series-fuse studies. Each chart contains only the fuses connected on that path, uses diagonal hatching between every fuse minimum-melt and total-clearing curve, and adds the relevant cable damage curve, motor hot/cold thermal limits and tagged starting point, or transformer tagged inrush point and damage curve. The interactive TCC view uses the same fuse-band convention and identifies the associated equipment tag directly beside every motor-start or transformer-inrush marker. These remain demonstration screening envelopes and are not substitutes for manufacturer-published curves.

This capture-first design prevents a second report-only layout engine from drifting away from the program. Changes to component coordinates, cable packing, symbols, labels, ductbank spacing, or engineering-print styling therefore appear in both the application and the next generated package.

Before any real project issue, replace the screening inputs with approved manufacturer curves and field-verified source, enclosure, electrode, protective-device, cable, raceway, soil, and installation data. A qualified engineer must independently check and authorize the deliverable.
