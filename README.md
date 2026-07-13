# CableTrayRoute
Designed to find the optimal cable route for your cable.

## Quick Start

For a step-by-step overview of the workflow, see the [Project Workflow](docs/project-workflow.md) guide. Each tool can run on its own, but following the eight-step project path provides a smoother integrated experience.

The Sample Gallery includes workflow and specialist projects with populated equipment, loads, one-lines, raceways, routed cable results, and study seeds. Opening a guided checklist first activates its sample project, and specialist pages such as Ductbank Route initialize directly from the shared schedules instead of requiring duplicate page-specific entry. The Underground Ductbank sample uses the same equipment tags, feeder terminations, demand currents, and parent ductbank records across Equipment List, Load List, One-Line, Cable List, Raceway Schedule, and thermal analysis. Automated adequacy checks tie every sample to the pages in its guided checklist so a listed demonstration cannot ship with an empty supporting view.

## Secure Authentication & API Hardening

The app supports two authentication modes:

- **Express server mode** for local/self-hosted deployments.
- **Supabase mode** for low-cost static hosting on Cloudflare Pages.

The profile control remains visible at the far right of the shared navigation, immediately after Settings. Signed-out users can use it to reach Login, while authenticated users receive account and logout actions.

For the Cloudflare Pages + Supabase path, see [docs/supabase-cloudflare.md](docs/supabase-cloudflare.md).

The bundled Express server persists credentials and sessions securely:

- Passwords supplied during `/signup` are salted and hashed with Node's `crypto.scrypt` algorithm before being written to `server_data/users.json`.
- `/login` verifies hashes, rotates any existing sessions for the account, and stores bearer tokens with CSRF secrets and expiry timestamps in `server_data/sessions.json`.
- Browser clients use the HttpOnly `ctr_auth` cookie plus the matching `X-CSRF-Token` header for state-changing calls. The legacy `Authorization: Bearer <token>` header remains available for API clients during the deprecation window.
- `/projects` endpoints are guarded by a lightweight rate limiter and will return HTTP `429` if the per-IP ceiling defined by `PROJECT_RATE_LIMIT_MAX` within `PROJECT_RATE_LIMIT_WINDOW_MS` is exceeded.
- `POST /projects/:project` supports full saves (`{ data }`) and incremental merge-patch updates (`{ patch, baseVersion }`). Matching payloads are de-duplicated server-side to avoid unnecessary version writes.
- Persistence routes emit `Server-Timing` metrics (`project.read`, `project.parse`, `project.merge`, `project.write`, and `project.total`) for backend observability.
- When `NODE_ENV=production`, the server assumes it is behind a TLS terminator and redirects HTTP requests to HTTPS. For self-hosted deployments, terminate TLS at a reverse proxy or run the app behind an HTTPS-capable load balancer.

Environment variables let you tune behaviour without code changes:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SERVER_DATA_DIR` | Location for `users.json`/`sessions.json` | `<repo>/server_data` |
| `AUTH_TOKEN_TTL_MS` | Lifetime of issued bearer tokens | `3600000` (1 hour) |
| `PROJECT_RATE_LIMIT_WINDOW_MS` | Rate limit window size | `900000` (15 minutes) |
| `PROJECT_RATE_LIMIT_MAX` | Maximum requests per window | `100` |

Existing installs that contain plaintext passwords will be migrated automatically: the first successful login rehashes the credential using the secure format.

For static hosting, set Cloudflare Pages to run `npm run build:cloudflare` and provide `SUPABASE_URL` plus `SUPABASE_ANON_KEY`. When `supabase-config.json` contains those values, the login page switches to Supabase email/password auth and project saves sync to the Supabase `projects` table.

GitHub Pages deployments use `.github/workflows/deploy-pages.yml`. The workflow runs the production build and publishes the generated `dist/` bundles with the tracked static files; serving the repository root directly is unsupported because `dist/` is intentionally excluded from source control.


## Static Asset Caching & Compression

The deployment server applies cache and compression defaults optimized for fingerprinted static assets:

- Fingerprinted assets matching `<name>.<hash>.<ext>` are served with `Cache-Control: public, max-age=31536000, immutable`.
- HTML entry points are served with `Cache-Control: public, max-age=60, must-revalidate`.
- Other static files use `Cache-Control: public, max-age=600, must-revalidate`.
- Text-like responses larger than 1 KB (HTML/CSS/JS/JSON/XML/SVG) are gzip-compressed by default.

The build copy pipeline (`scripts/copyAssets.js`) now emits fingerprinted copies and an `asset-manifest.json` map in both `dist/` and `docs/` so deployments can adopt immutable URLs while keeping HTML short-lived.

For rollout safety, keep older fingerprinted files available until all clients have refreshed to the new HTML references.

Feature PRs should not commit generated build output. CI builds and uploads `dist/` as an artifact, while `dist/`, generated asset manifests, and generated module wrappers are committed only in release/static-hosting updates. See [Dist Review Policy](docs/dist-review-policy.md).

## Landing Page and Workflow

The landing page (`index.html`) links to every tool in the suite and outlines
the recommended end-to-end workflow:

1. **Equipment List** - define major equipment tags, ratings, and locations.
2. **Load List** - capture load records and source relationships.
3. **One-Line** - model electrical relationships and explicitly reconcile schedules when ready.
4. **Cable Schedule** - complete schedule-ready cable rows with tag, from/to, conductor size, and length.
5. **Raceway Schedule** - set up trays, conduits, and ductbanks.
6. **Fill / Routing** - run tray/conduit fill, ductbank checks, and route assignments.
7. **Studies** - run demand, load flow, short-circuit, arc flash, TCC, harmonics, motor start, and related studies.
8. **Deliverables** - generate project reports, pull cards, spool sheets, procurement, estimate, and submittal outputs.

Each tool can be used independently. Following the shared workflow lets project
data move between modules through explicit reconcile actions instead of hidden
cross-module overwrites. See [`docs/project-workflow.md`](docs/project-workflow.md).

## New Feature: Cross-Sheet Off-Page Connectors

The one-line diagram editor now supports **off-page connectors** (cross-sheet reference symbols), closing the gap with ETAP, EasyPower, and SKM PTW.

- Drag **Sheet Link Out** or **Sheet Link In** from the **Links** palette category onto the canvas.
- Set `link_id` (e.g. `FEEDER-MCC1`) to the same value on both connectors, and set `linked_sheet` on each to the partner sheet's name.
- A blue arrow badge (`→ Sheet 2` / `← Sheet 1`) renders below each connector icon.
- **Double-click** any connector to navigate instantly to the partner sheet; the paired connector is highlighted with an orange pulse for 3 seconds.
- The **Validate** button reports connectors with missing `link_id`, missing `linked_sheet`, or no matching partner on any sheet.

See [`docs/off-page-connectors.md`](docs/off-page-connectors.md) for full details.

## New Feature: Cloud-Synchronized Component Library

The **Library Manager** (`library.html`) now persists your one-line diagram component library to the server, keeping it synchronized across all your devices and sessions — closing the gap with Bentley Raceway's Components Center.

**Key capabilities:**

- **Auto-sync on save** — clicking **Save** while logged in automatically pushes the library to your cloud account via `PUT /api/v1/library`.
- **Load from Cloud** — on page load the editor fetches your cloud library automatically; use **Load from Cloud** to refresh manually at any time.
- **Save to Cloud** — explicit one-click upload for when you want to push without saving locally.
- **Share Library** — generates a 30-day read-only share link. Team members can load it with **Load Shared Library** or by opening the URL directly, with no account required.
- **Fallback** — if you are not logged in or the server is offline, the editor falls back to `localStorage` and the static `componentLibrary.json` so no data is lost.

REST API: `GET/PUT /api/v1/library`, share management via `POST/DELETE /api/v1/library/shares`, and public access via `GET /api/v1/library/shared/:token`. See [docs/api-reference.md](docs/api-reference.md) for full documentation.

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
tray_id,start_x,start_y,start_z,end_x,end_y,end_z,inside_width,tray_depth,tray_type,cover_condition,current_fill,allowed_cable_group,shape
```

All coordinates are in **feet**. Inside width and tray depth are in **inches**. `cover_condition` may be `No Cover`, `Ventilated Cover`, or `Solid Cover` and is used by the Wind Load page. `current_fill` is the occupied area in square inches. A sample file is available at `examples/trays_template.csv`.

### Cable CSV Format
Cables can be imported with these column headers:

```
tag,from_tag,to_tag,cable_type,conductors,conductor_size,cable_od,weight,allowed_cable_group,start_x,start_y,start_z,end_x,end_y,end_z
```

Start and end coordinates use **feet**. Cable OD is in **inches**. See `examples/cables_template.csv` for a template.

Exported routing results are written to `route_data.xlsx`. Load this file in `cabletrayfill.html` to view tray utilization.

## Raceway Schedule

`racewayschedule.html` centralizes raceway data in three editable tables.

- **Ductbank Schedule** – list each ductbank by `Tag`, `From`, and `To`. Expand a row to add its conduits (`Conduit ID`, `Type`, `Trade Size`, `From`, `To`).
 - **Tray Schedule** – record tray segments with start and end coordinates plus `Inside Width`, `Tray Depth`, `Tray Type`, and `Cover`.
- **Conduit Schedule** – catalog stand-alone conduits with start/end coordinates, `Type`, `Trade Size`, and `Capacity`.

Use the buttons above each table to **Save** to browser storage, **Load** saved data, and **Import/Export XLSX** files. Templates are available in the `examples` folder (`ductbank_schedule_ductbanks.csv`, `ductbank_schedule_conduits.csv`, `tray_schedule.csv`, and `conduit_schedule.csv`). Save these CSV files as `.xlsx` with matching sheet names before importing.

Use **Batch Edit** from each schedule table's **More** menu to apply a shared field value to visible filtered rows or all rows.

## Ductbank Analysis

`ductbankroute.html` analyzes underground ductbanks. You can add conduits and cables through guided entry dialogs, import them from CSV files, download CSV templates, or load a complete example from the compact action toolbar. The page applies practical default thermal assumptions, summarizes conduit count, cable count, assignments, warnings, and thermal alerts, and provides quick filters for assigned, unassigned, missing-data, fill-warning, and thermal-alert rows. Actionable warnings jump to the field that needs correction, filtered tables show row counts and empty states, and the **Auto Assign** helper can distribute unassigned cables across available conduits. The workflow strip keeps users moving from **Validate** to **Calculate Fill**, **Thermal**, and **Export**. Example formats are available at `examples/ductbank_template.csv` and `examples/cables_ductbank.csv`. The **Thermal** tool overlays a heat map showing estimated earth temperatures, and selecting an individual cable in the drawing opens quick properties with a table-row shortcut. Use the **Export** menu for the XLSX workbook, conduit and cable CSVs, image export, thermal data, canvas data, and the calculation report. Ductbank data is saved between sessions; select **Delete Saved Data** from the settings menu to clear it.

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
