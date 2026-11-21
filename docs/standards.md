# Engineering References

This project relies on several established standards and publications for its electrical calculations.

- **NEC 310‑15(C)** – National Electrical Code\, 2023 edition. This section outlines how conductor ampacity must be adjusted when more than three current‑carrying conductors are installed together. The same article points to Chapter 9 for conduit fill requirements used in this tool.
- **IEEE Std 835** – *IEEE Standard Power Cable Ampacity Tables*. The thermal modeling approach implemented here reflects the guidelines and example calculations provided in this standard.
- **Neher‑McGrath Paper** – *The Calculation of the Temperature Rise and Load Capability of Cable Systems* by J. H. Neher and M. H. McGrath (AIEE Transactions, 1957). The simplified ampacity and thermal resistance equations in this app stem from this seminal work.

- **IEC 60255‑151** – *Measuring relays and protection equipment – Part 151: Functional requirements for over/under‑current protection* (Edition 1.0, 2009‑12). The TCC module implements the four standard inverse‑time overcurrent relay curve families — Normal Inverse (NI), Very Inverse (VI), Extremely Inverse (EI), and Long‑Time Inverse (LTI) — using the parametric formula **t = TMS × k / [(I/Is)^α − 1]** with the constants defined in Table 1 of the standard. Operating‑time tolerance follows Class E1 (±5%). Implemented in `analysis/iecRelayCurves.mjs`; integrated into the TCC coordination engine via `analysis/tccUtils.js` (`scaleCurve`) and `analysis/tccAutoCoord.mjs` (`findCoordinatingTimeDial`, `greedyCoordinate`).

- **SVG/PNG Chart Export** — TCC chart export produces a self-contained SVG 1.1 file conforming to the W3C SVG specification (`xmlns="http://www.w3.org/2000/svg"`). Annotation element styles are inlined into a `<style>` element inside the exported SVG so the file renders correctly without the application stylesheet. Interactive crosshair elements are stripped before export. PNG export rasterises the SVG at 2× pixel density (≈ 192 dpi on standard 96-dpi displays) using the HTML5 Canvas API (`canvas.toBlob('image/png')`). Pure utility functions are in `analysis/chartExportUtils.mjs`; browser integration is in `analysis/tcc.js` (`handleExportSVG`, `handleExportPNG`). Tests: `tests/tcc/chartExport.test.mjs`.

- **IEEE 1584-2018** – *IEEE Guide for Performing Arc-Flash Hazard Calculations*. The arc-flash engine uses the full 2018 empirical calculation path in `analysis/ieee1584.mjs`, including the electrode-configuration coefficient tables, intermediate arcing current at the standard voltage levels, arcing-current variation correction, enclosure-size correction, voltage interpolation, incident energy, and arc-flash boundary. `analysis/arcFlash.mjs` evaluates both full and reduced arcing-current cases using the protective-device clearing time at each arcing current, then reports the higher incident energy. The implementation is checked against the standard's Annex D.1 and D.2 worked examples in `tests/ieee1584.test.mjs`.
  - *TCC incident-energy limit curve*: for every bolted-fault-current point, the full 2018 engine calculates incident energy at one second. Because incident energy is linear in duration for fixed model inputs, the limiting time is `T_limit = E_threshold / E_at_1_second`. Implemented by `incidentEnergyLimitCurve()` in `analysis/arcFlash.mjs` and tested in `tests/tcc/arcFlashOverlay.test.mjs`.

See this file as the citation source for comments in the code referencing each of these standards.

## Edition currency

Checked 2026-11-21. "Implemented" is the edition the calculations, benchmarks, and citations in this tool were built and validated against. A delta review against the latest edition has not been completed for the rows below, so no compliance with the latest edition is claimed.

| Standard | Latest edition | Implemented / validated | Delta review |
| --- | --- | --- | --- |
| NFPA 70 (NEC) | 2026 (issued 2025-08-20, effective 2025-09-09) | 2023 (tray fill, conduit fill, ampacity, voltage-drop benchmarks) | Pending |
| NFPA 70E | 2027 (issued 2026-04-16, effective 2026-05-06; dates from trade-press sources, confirm on nfpa.org) | 2024 (DC arc flash Annex D.8 / D.8.1); label text reviewed against 2021 | Pending |
| IEC 60909-0 | 2026, edition 3.0 | 2016 | See [iec60909-2026-edition-assessment.md](iec60909-2026-edition-assessment.md) |

The Submittal Package page defaults to NEC 2026 and prints the calculation basis whenever the selected edition differs from the implemented one. Relabel a row to the latest edition only after a reviewer records the changed clauses and re-runs the affected benchmarks.
