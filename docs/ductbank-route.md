# Ductbank Route Plan/Profile

The Ductbank Route page supports a planning-level station model in addition to
its cross-section editor. The route model is stored with the selected ductbank
in the project when **Save to Project** is selected and is also retained in the
scenario's ductbank working session.

## Route stations

Each station records:

- station, easting, and northing in feet;
- finished-grade elevation in feet; and
- cover from finished grade to the top of the ductbank envelope in inches.

At least two stations are required. Plan length is calculated from the easting
and northing coordinates. If both coordinates are unchanged, the station
interval is used as the plan length. Developed length follows the top of the
ductbank and includes elevation change caused by grade and variable cover.

The page warns when coordinate length and station interval differ by more than
2%, when the calculated ductbank grade exceeds 10%, or when a structure is
beyond the final station.

## Structures and crossings

The first-phase model supports station references for manholes, handholes, pull
boxes, building entries, and crossings. These records provide locations and
counts; they do not size the structure or design its penetrations, drainage,
grounding, traffic rating, or accessories.

## Bill of materials behavior

When the profile is valid, the material takeoff uses its developed length and
average cover instead of the single route-length and cover inputs. The BOM adds:

- counts for route structures and crossings;
- a per-conduit allowance for horizontal direction changes; and
- a per-conduit allowance for vertical grade changes.

These allowances are planning quantities only. Bend radius, sweep geometry,
pulling limits, utility clearances, casing, permits, restoration, dewatering,
and detailed structure assemblies require survey data and project-specific
engineering.

The **Export Route CSV** action writes stations and structures in one traceable
file. It does not represent a CAD, GIS, or construction-staking deliverable.

