# Engineering References

This project relies on several established standards and publications for its electrical calculations.

- **NEC 310‑15(C)** – National Electrical Code\, 2023 edition. This section outlines how conductor ampacity must be adjusted when more than three current‑carrying conductors are installed together. The same article points to Chapter 9 for conduit fill requirements used in this tool.
- **IEEE Std 835** – *IEEE Standard Power Cable Ampacity Tables*. The thermal modeling approach implemented here reflects the guidelines and example calculations provided in this standard.
- **Neher‑McGrath Paper** – *The Calculation of the Temperature Rise and Load Capability of Cable Systems* by J. H. Neher and M. H. McGrath (AIEE Transactions, 1957). The simplified ampacity and thermal resistance equations in this app stem from this seminal work.

- **IEC 60255‑151** – *Measuring relays and protection equipment – Part 151: Functional requirements for over/under‑current protection* (Edition 1.0, 2009‑12). The TCC module implements the four standard inverse‑time overcurrent relay curve families — Normal Inverse (NI), Very Inverse (VI), Extremely Inverse (EI), and Long‑Time Inverse (LTI) — using the parametric formula **t = TMS × k / [(I/Is)^α − 1]** with the constants defined in Table 1 of the standard. Operating‑time tolerance follows Class E1 (±5%). Implemented in `analysis/iecRelayCurves.mjs`; integrated into the TCC coordination engine via `analysis/tccUtils.js` (`scaleCurve`) and `analysis/tccAutoCoord.mjs` (`findCoordinatingTimeDial`, `greedyCoordinate`).

See this file as the citation source for comments in the code referencing each of these standards.
