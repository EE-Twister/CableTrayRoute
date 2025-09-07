# Routing Assumptions

Routing calculations simplify the physical environment to speed analysis.

- Paths are modeled as straight segments between defined nodes.
- The solver ignores elevation changes, obstacles, and congestion.
- Dijkstra's algorithm is applied with non‑negative edge weights.
- Coordinates are treated as planar and use consistent units.

These assumptions suit early design estimates; field conditions may require adjustment.
