# Routing Assumptions

Saved project route results are restored when Optimal Route opens. The result summary, cable route list, and available 3D segments can be reviewed and exported without rerunning the routing calculation; rerun routing only when inputs or routing assumptions have changed.

## Saved Route Result Contract

`latestRouteResults` is the canonical project routing handoff. It includes a schema version, normalized `batchResults`, `trayCableMap`, `routedCableNames`, success/failure counts, total routed length, and routing mode. Each successful cable result retains its cable identity, endpoints, raceway assignment, length, and normalized segment geometry. Optimal Route, DRC, workflow readiness, Home, and report generation all consume this contract.

Older result shapes and gallery samples are normalized when loaded. A route may identify its raceway through a tray, conduit, raceway, or segment id; the normalized handoff preserves that identity and rebuilds the cable-to-raceway map. This avoids requiring a routing rerun solely to make a downstream page recognize an existing saved route.

Routing calculations simplify the physical environment to speed analysis.

- Paths are modeled as straight segments between defined nodes.
- The solver ignores elevation changes, obstacles, and congestion.
- Dijkstra's algorithm is applied with non‑negative edge weights.
- Coordinates are treated as planar and use consistent units.

These assumptions suit early design estimates; field conditions may require adjustment.

## Tray fill limits

The router limits each tray (or slot) to a percentage of its cross-section (width × depth, default 40%). This is a planning limit, not an NEC determination. NEC 392.22(A)(1) caps multiconductor cable area by tray width alone (for example 14.0 in² for a 12 in ladder tray, 11.0 in² for solid-bottom), so a deep tray can plan more fill than the code allows. The routing readiness panel flags trays whose planning limit exceeds the Table 392.22(A)(1) area (ladder is assumed when construction is not set). Confirm final fill on the Tray Fill page.

Tray IDs may contain underscores (for example `TR_1`); the router tracks which tray each graph node belongs to rather than parsing node names.

## Conduit Fill page

Cable OD must be greater than 0 and a conduit may hold at most 500 conductors. When the fill exceeds the NEC Chapter 9 limit (53% / 31% / 40%), the results list the smallest size of the selected conduit type that passes.
