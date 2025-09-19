# CableTrayRoute
Designed to find the optimal cable route for your cable.

## Quick Start

For a step-by-step overview of the workflow, see the [Quick Start](docs/quickstart.html) guide. Each tool can run on its own, but following the six steps in sequence provides a smoother experience.

## Secure Authentication & API Hardening

The bundled Express server now persists credentials and sessions securely:

- Passwords supplied during `/signup` are salted and hashed with Node's `crypto.scrypt` algorithm before being written to `server_data/users.json`.
- `/login` verifies hashes, rotates any existing sessions for the account, and stores bearer tokens with CSRF secrets and expiry timestamps in `server_data/sessions.json`.
- Client code stores the issued bearer token, CSRF token, and expiry. Authenticated project requests must supply both the `Authorization: Bearer <token>` header and the matching `X-CSRF-Token` header for state-changing calls.
- `/projects` endpoints are guarded by a lightweight rate limiter and will return HTTP `429` if the per-IP ceiling defined by `PROJECT_RATE_LIMIT_MAX` within `PROJECT_RATE_LIMIT_WINDOW_MS` is exceeded.
- When `NODE_ENV=production`, the server assumes it is behind a TLS terminator and redirects HTTP requests to HTTPS. For self-hosted deployments, terminate TLS at a reverse proxy or run the app behind an HTTPS-capable load balancer.

Environment variables let you tune behaviour without code changes:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SERVER_DATA_DIR` | Location for `users.json`/`sessions.json` | `<repo>/server_data` |
| `AUTH_TOKEN_TTL_MS` | Lifetime of issued bearer tokens | `3600000` (1 hour) |
| `PROJECT_RATE_LIMIT_WINDOW_MS` | Rate limit window size | `900000` (15 minutes) |
| `PROJECT_RATE_LIMIT_MAX` | Maximum requests per window | `100` |

Existing installs that contain plaintext passwords will be migrated automatically: the first successful login rehashes the credential using the secure format.

## Landing Page and Workflow

The new landing page (`index.html`) links to every tool in the suite and outlines
the recommended end-to-end workflow:

1. **Cable Schedule** – define cables to be routed.
2. **Raceway Schedule** – set up trays, conduits, and ductbanks.
3. **Ductbank** – analyze underground ductbanks.
4. **Tray Fill** – visualize tray utilization.
5. **Conduit Fill** – evaluate conduit loading.
6. **Optimal Cable Route** – generate the final route.

Each tool can be used independently, but the homepage lets you access the
entire sequence from one place.

## New Feature: Rebalance Tray Fill

After running the standard routing process, click **Rebalance Tray Fill** to
automatically reroute cables in trays that exceed the allowed fill percentage.
The script tries alternative paths for those cables until each tray is back
under its limit. A progress bar now displays the rerouting progress so you can
see the operation working.

## New Feature: Cable Tag Input

You can now specify a **Cable Tag** when routing cables. Use the text field in the
"Cable Specifications" section to assign a tag for a single cable. In batch mode
the tag can be edited for each cable in the table.

## New Feature: Allowed Cable Group

Cable trays and cables now include an **Allowed Cable Group** property. During routing, a cable will only use trays whose allowed group matches the cable's group. This helps ensure voltage-rated cables are routed appropriately.

## New Feature: Custom Equipment Columns

The Equipment List now lets you define extra columns. Click **Add Column** to specify a key, label, and data type. Custom columns are saved to browser storage and are included when importing or exporting the table.

## Manual Raceway vs Automatic Routing

Supplying specific **Raceway IDs** on a cable forces the router to follow those tray segments in order. Any IDs that do not match trays in the schedule are ignored. If none of the provided IDs exist, the router automatically reverts to its standard pathfinding. Leaving the field empty always triggers automatic routing.

## New Feature: Conduit Exclusion Diagnostics

When routing, any raceway that cannot be used—because it is over capacity, belongs to a different cable group, or sits beyond the start/end proximity threshold—is recorded with a reason. The Route Breakdown now lists these exclusions so you can see why particular conduits were skipped.

## New Feature: Conduit Import Count

After raceway data is loaded, the app logs and displays how many ductbank conduits were successfully added. If a conduit schedule is supplied but no conduits load, a warning suggests possible geometry problems or mismatched identifiers.

## New Feature: Manual Batch Cable Entry

When batch mode is selected, you can now use the **Add Cable to List** button to
add a cable using the current values from the Cable Specifications and Route
Points fields. After filling in the details, click **Add Cable to List** and the
cable will appear in the table for batch routing. Each row in the table allows
you to edit not only the cable tag, but also the cable OD and the start/end
coordinates for that cable.

## New Feature: In-App Help Modal

Click **Site Help** in the settings menu to open a help dialog without leaving
the page. The modal highlights key functions like cable tagging and allowed
cable groups, explains how to import or export CSV files, and references the
NEC 40% fill guideline used for tray capacity calculations.

## Updates

 - Default *Tray Proximity Threshold* is now **72 in**. Increase this value to let the router connect endpoints to trays or ductbank conduits that are slightly farther away.
- Each cable row in batch mode includes **Duplicate** and **Delete** controls.
- Tray utilization tables show **Available Space** to two decimal places.
- CSV export flattens the breakdown so each segment is a separate row.
- CSV export no longer includes the **Status** column.
- Route data download now generates an **XLSX** file with an additional
  worksheet mapping trays to the cables routed through them.
- The **Tray Cable Map** worksheet now also lists the tray's **Allowed Cable Group**.
- The XLSX export includes a **Shared Field Routes** worksheet showing
  potential field runs shared between cables.
- Start and end tags are displayed in the 3D view (duplicates shown once).
- Cable specification fields are now located in the **Cable Routing Options** panel.
- Manual tray entry now has a single **Import Trays CSV** button. Clicking it opens a file dialog and loads trays immediately after you choose a file.
- Cable Routing Options now has **Import Cables CSV** and **Export Cables CSV** buttons for managing the cable list.
- New **Shared Field Route Cost Multiplier** input lets successive cables reuse existing field runs at a reduced cost.
- The **Cables to Route** table now includes a **Cable Type** drop-down (Power, Control, Signal) and a **Weight (lbs/ft)** column.
- A new **Conductors** column lets you specify the number of conductors for each cable.
- A new **Conductor Size** column lets you choose an AWG or kcmil size for each cable.

## Tray Fill Visualization

The repository now includes `cabletrayfill.html`, a standalone page that draws
a cross-sectional view of a cable tray. After calculating routes, click
**Download Route Data (XLSX)** and then **Open Tray Fill Tool** to launch the
viewer. Import the exported `route_data.xlsx` file to display the tray fill
diagram with the cables placed according to their properties.

## Import and Export Guide

### Tray CSV Format
A tray CSV used for import must include the following headers:

```
tray_id,start_x,start_y,start_z,end_x,end_y,end_z,inside_width,tray_depth,tray_type,current_fill,allowed_cable_group,shape
```

All coordinates are in **feet**. Inside width and tray depth are in **inches** and `current_fill` is the occupied area in square inches. A sample file is available at `examples/trays_template.csv`.

### Cable CSV Format
Cables can be imported with these column headers:

```
tag,from_tag,to_tag,cable_type,conductors,conductor_size,cable_od,allowed_cable_group,start_x,start_y,start_z,end_x,end_y,end_z
```

Start and end coordinates use **feet**. Cable OD is in **inches**. See `examples/cables_template.csv` for a template.

Exported routing results are written to `route_data.xlsx`. Load this file in `cabletrayfill.html` to view tray utilization.

## Raceway Schedule

`racewayschedule.html` centralizes raceway data in three editable tables.

- **Ductbank Schedule** – list each ductbank by `Tag`, `From`, and `To`. Expand a row to add its conduits (`Conduit ID`, `Type`, `Trade Size`, `From`, `To`).
 - **Tray Schedule** – record tray segments with start and end coordinates plus `Inside Width`, `Tray Depth`, and `Tray Type`.
- **Conduit Schedule** – catalog stand-alone conduits with start/end coordinates, `Type`, `Trade Size`, and `Capacity`.

Use the buttons above each table to **Save** to browser storage, **Load** saved data, and **Import/Export XLSX** files. Templates are available in the `examples` folder (`ductbank_schedule_ductbanks.csv`, `ductbank_schedule_conduits.csv`, `tray_schedule.csv`, and `conduit_schedule.csv`). Save these CSV files as `.xlsx` with matching sheet names before importing.

## Ductbank Analysis

`ductbankroute.html` analyzes underground ductbanks. You can manually enter each conduit and cable or import them from CSV files. Example formats are available at `examples/ductbank_template.csv` and `examples/cables_ductbank.csv`. The **Thermal Analysis** tool overlays a heat map showing estimated earth temperatures. Use **Download Ductbank Data** for an XLSX report, **Export Ductbank Conduits** and **Export Ductbank Cables** for CSVs, or **Export Image** to save the drawing. Ductbank data is saved between sessions; select **Delete Saved Data** from the settings menu to clear it.

## Ductbank Geometry Integration

Underground ductbanks can be displayed alongside tray routes in the 3D viewer. Export geometry from `ductbankroute.html` using a JSON file placed in `data/` (e.g. `data/ductbank_geometry.json`) with the structure:

```json
{
  "ductbanks": [
    {
      "id": "DB1",
      "outline": [[x, y, z], ...],
      "conduits": [
        { "id": "C1", "path": [[x1, y1, z1], [x2, y2, z2]], "diameter": 4 }
      ]
    }
  ]
}
```

`app.mjs` loads this data when rendering the 3D route and adds Plotly traces for the ductbank outline and each conduit. In `optimalRoute.html` a **Show Ductbanks** checkbox below the 3D plot toggles their visibility.

## Clearing Saved Sessions
The application stores your trays, cables and theme preference in browser storage. Open the settings menu (⚙) and click **Delete Saved Data** to clear this information.

## Missing Pages

A custom [`404.html`](404.html) page displays a short message and navigation when a route isn't found. GitHub Pages will automatically serve this file for unknown paths so visitors can return to the [home page](index.html).
