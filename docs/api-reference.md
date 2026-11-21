# CableTrayRoute REST API Reference

The CableTrayRoute server exposes a public REST API under `/api/v1` for scripting and automation.

## Authentication

Authenticated routes accept either credential from `POST /login`:

- the HttpOnly `ctr_auth` cookie (preferred for browsers), or
- an `Authorization: Bearer <token>` header (legacy; accepted during the deprecation window and the normal choice for scripts).

Requests that change state (anything other than `GET`, `HEAD`, `OPTIONS`) must also send the session's CSRF token in an `x-csrf-token` header. The `/api/v1` study routes (`POST .../studies/*`) only compute from saved data and do not require it. The one public `/api/v1` route is `GET /api/v1/library/shared/:token`.

```bash
# 1. Log in to get a token and CSRF token
curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"MySecret123!"}'
# → {"token":"e3f4a1b2c9d0...","csrfToken":"9a7c...","expiresAt":1760000000000,"role":"engineer"}

# 2. Use the token in subsequent requests
export TOKEN="e3f4a1b2c9d0..."
export CSRF="9a7c..."
```

Tokens expire after the configured TTL (default: 1 hour, `AUTH_TOKEN_TTL_MS`) and sessions have an absolute lifetime (default 8 hours, `AUTH_SESSION_MAX_LIFETIME_MS`). Refresh via `POST /session/refresh` (see [Session and Account Endpoints](#session-and-account-endpoints)).

Roles, lowest to highest: `read-only`, `reviewer`, `engineer`, `admin`. Writes to projects, snapshots, and the cloud library require `engineer`; team-library publishing and the admin routes require `admin`. See [enterprise-auth.md](enterprise-auth.md).

---

## Rate Limiting

Limits are per IP and held in memory. Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (epoch seconds); a rejected request returns `429 {"error":"Too many requests"}` with a `Retry-After` header (seconds).

| Routes | Window | Max |
|--------|--------|-----|
| `/api/v1/*`, `/projects/*`, `/shared/*` | 15 min (`PROJECT_RATE_LIMIT_WINDOW_MS`) | 100 (`PROJECT_RATE_LIMIT_MAX`) |
| `/login`, `/signup`, `/session/refresh`, `/forgot-password`, `/reset-password` | same window | 20 |
| `/ws/ticket` | same window | the lower of 20 and the project limit |
| `/api/errors` | same window | 50 |
| `/api/copilot` | 60 s | 10 |

---

## Endpoints

### GET /api/v1/projects/:project/cables

Returns the cable schedule for a project.

**Parameters:**
- `:project` — project name (alphanumeric, dashes, underscores; 1–100 chars)

**Response:**
```json
{
  "cables": [
    { "name": "C1", "cable_type": "Power", "conductors": 3, "conductor_size": "#12 AWG" }
  ],
  "count": 1
}
```

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/projects/myproject/cables
```

---

### GET /api/v1/projects/:project/trays

Returns the raceway (tray) schedule for a project.

**Response:**
```json
{
  "trays": [
    { "tray_id": "T1", "inside_width": 12, "start_x": 0, "start_y": 0, "start_z": 10,
      "end_x": 20, "end_y": 0, "end_z": 10 }
  ],
  "count": 1
}
```

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/projects/myproject/trays
```

---

### POST /api/v1/projects/:project/studies/short-circuit

Runs a short-circuit study on the project's saved one-line diagram, joined to
its Equipment, Panel, Load, and Cable Schedule records exactly as the browser
study does. Feeder impedance between buses comes from the linked Cable Schedule
rows, and protective-device data comes from the saved `settings.tccSettings`.
The endpoint evaluates the supplied project data directly and does not depend
on process-global browser storage.

Computes three-phase (3LG), single-line-to-ground (SLG), line-to-line (L-L), and
double-line-to-ground (DLG) fault currents for each bus. Each bus result's
`impedanceProvenance.segments` lists the source of every impedance segment
(for example `"One-Line source data"` or `"Cable Schedule"`).

**Request body:** `{}` (no parameters required; uses stored project data)

**Response:**
```json
{
  "shortCircuit": {
    "BUS-001": {
      "threePhaseKA": 12.4,
      "lineToGroundKA": 10.1,
      "lineToLineKA": 10.8,
      "doubleLineGroundKA": 11.2
    }
  }
}
```

**Example:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/v1/projects/myproject/studies/short-circuit
```

---

### POST /api/v1/projects/:project/studies/motor-start

Runs a motor starting study on the project's saved one-line diagram data,
joined to its schedules the same way as the browser study. The endpoint
evaluates the supplied project data directly and does not depend on
process-global browser storage.

Returns inrush current, voltage sag, acceleration time, and starter type for each motor.
Supports all starter types: `dol`, `vfd`, `soft_starter`, `wye_delta`, `autotransformer`.

**Request body:** `{}` (no parameters required)

**Response:**
```json
{
  "motorStart": {
    "M-101": {
      "inrushKA": 0.66,
      "voltageSagPct": 3.2,
      "accelTime": 2.45,
      "starterType": "soft_starter"
    }
  }
}
```

**Example:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/v1/projects/myproject/studies/motor-start
```

---

### POST /api/v1/projects/:project/studies/voltage-drop

Runs a voltage drop study on the project's saved Cable Schedule, Load List, and
Load Flow data. Canonical exports store saved Load Flow results under
`settings.studyResults.loadFlow`; older `studies.loadFlow` and
`studyResults.loadFlow` shapes remain accepted for migration compatibility.
The endpoint evaluates the supplied project data directly and does not depend
on process-global browser storage.

**Request body:** `{}` (no parameters required)

**Response:**
```json
{
  "voltageDrop": {
    "summary": { "passing": 12, "failing": 2, "total": 14 },
    "violations": [
      { "cableId": "C-045", "dropPct": 5.8, "limitPct": 5.0, "severity": "error" }
    ]
  }
}
```

**Example:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/v1/projects/myproject/studies/voltage-drop
```

---

## Library Endpoints

These endpoints manage a per-user **cloud-synchronized component library** for the one-line diagram editor. The library is shared across all projects owned by the authenticated user, and can be shared read-only with other users via time-limited tokens.

---

### GET /api/v1/library

Returns the authenticated user's saved component library.

**Response:**
```json
{
  "version": "1712345678901",
  "data": {
    "categories": ["bus", "protection"],
    "components": [{ "type": "bus", "label": "Bus" }],
    "icons": {}
  }
}
```

Returns `404` if no library has been saved yet.

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/library
```

---

### PUT /api/v1/library

Saves or updates the authenticated user's cloud library. Supports full replace or merge-patch modes.

**Request body (full replace):**
```json
{ "data": { "categories": ["bus"], "components": [], "icons": {} } }
```

**Request body (merge patch):**
```json
{ "patch": { "newField": "value" }, "baseVersion": "1712345678901" }
```

Omit `baseVersion` to skip conflict detection. Include it to get a `409` response if the library was updated by another session since you last read it.

**Response:**
```json
{ "version": "1712345679000", "unchanged": false }
```

**Example:**
```bash
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Csrf-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"data":{"categories":["bus"],"components":[],"icons":{}}}' \
  http://localhost:3000/api/v1/library
```

---

### GET /api/v1/library/shares

Lists all active share tokens for the authenticated user's library.

**Response:**
```json
{
  "shares": [
    {
      "id": "uuid",
      "createdAt": 1712345678901,
      "expiresAt": 1714937678901,
      "revokedAt": null,
      "lastAccessAt": null,
      "expired": false
    }
  ]
}
```

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/library/shares
```

---

### POST /api/v1/library/shares

Creates a new 30-day read-only share token for the authenticated user's library. The plain token is returned once and never stored — save it immediately.

**Response:**
```json
{
  "id": "uuid",
  "token": "64-hex-chars",
  "expiresAt": 1714937678901
}
```

**Example:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Csrf-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/api/v1/library/shares
```

---

### DELETE /api/v1/library/shares/:shareId

Revokes an active share token by its ID. The token immediately becomes invalid.

**Parameters:**
- `:shareId` — share UUID from the list or create response

**Response:**
```json
{ "revoked": true }
```

Returns `404` if the share ID is not found or belongs to a different user.

**Example:**
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Csrf-Token: $CSRF" \
  http://localhost:3000/api/v1/library/shares/uuid-here
```

---

### GET /api/v1/library/shared/:token

Loads a library by share token. **No authentication required** — this endpoint is public so recipients do not need an account. Returns `404` if the token is expired, revoked, or invalid.

**Parameters:**
- `:token` — 64-char hex token from `POST /api/v1/library/shares`

**Response:**
```json
{
  "version": "1712345679000",
  "data": { "categories": ["bus"], "components": [], "icons": {} },
  "owner": "alice"
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/library/shared/abc123...
```

---

## Approved Team Library Endpoints

An approved team library is a deployment-wide, immutable release stream. All authenticated users can read the latest release; only users with the `admin` role can publish. Releases retain the publisher, time, and optional change note for auditing.

### GET /api/v1/team-library

Returns the latest approved team-library release. Returns `404` if no release has been published.

```json
{
  "version": "1712345678901-a1b2c3d4",
  "data": { "categories": ["bus"], "components": [], "icons": {} },
  "publishedAt": "2026-07-31T18:30:00.000Z",
  "publishedBy": "standards_admin",
  "releaseNotes": "Approved breaker and MCC catalog updates"
}
```

### GET /api/v1/team-library/releases

Lists release metadata, newest first. The list intentionally omits the component payload; load the latest endpoint when the actual library data is required.

### PUT /api/v1/team-library

Requires: `admin` role and CSRF token. Publishes the supplied valid library payload as a new immutable release. Include `baseVersion` to protect against replacing a release published after the editor was loaded. `releaseNotes` is optional and limited to 500 characters.

```json
{
  "data": { "categories": ["bus"], "components": [], "icons": {} },
  "baseVersion": "1712345000000-1234abcd",
  "releaseNotes": "Standards committee approval 2026-07"
}
```

Returns `409` with `currentVersion` when the supplied `baseVersion` is stale. Repeating an unchanged release returns the existing release with `unchanged: true` rather than creating duplicate history.

---

## TCC Device Library — IEC 60255-151 Relay Types

The protective device library (`data/protectiveDevices.json`) includes four IEC 60255-151 formula-based relay types. These relay curves are computed mathematically from the formula **t = TMS × k / [(I/Is)^α − 1]** rather than using sampled point arrays, so they accept `tms` and `pickup` as their primary settings.

| Device ID | Curve Family | k | α |
|---|---|---|---|
| `iec_ni_relay` | Normal Inverse (NI) | 0.14 | 0.02 |
| `iec_vi_relay` | Very Inverse (VI) | 13.5 | 1.0 |
| `iec_ei_relay` | Extremely Inverse (EI) | 80.0 | 2.0 |
| `iec_lti_relay` | Long-Time Inverse (LTI) | 120.0 | 1.0 |

**Settings fields:**

| Field | Description | Default | Range |
|---|---|---|---|
| `tms` | Time Multiplier Setting | 0.5 | 0.05 – 1.5 |
| `pickup` | Pickup current Is (A) | 100 | 50 – 1600 |

**Tolerance:** ±5% on operating time per IEC 60255-151 Class E1 (minCurve = 95%, maxCurve = 105% of nominal time).

These relay types are fully supported by the Auto-Coordinate algorithm (`greedyCoordinate`), which searches for the minimum TMS value that achieves selective coordination with the downstream device.

**Example — use NI relay in a TCC study via the REST API:**

```bash
# Save project settings that include an IEC NI relay device override
curl -X PUT http://localhost:3000/api/v1/projects/myproject/cables \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceOverrides": {"iec_ni_relay": {"tms": 0.3, "pickup": 200}}}'
```

**Internal implementation:** `analysis/iecRelayCurves.mjs` — `computeIecCurvePoints(familyKey, tms, pickupAmps)`. Integrated into the main curve engine via `analysis/tccUtils.js` (`scaleCurve`).

---

## CTI Report Export

After running Auto-Coordinate on `tcc.html`, the "Export CTI Report" button downloads a CSV file (`coordination-cti-report.csv`) containing the standard Coordination Time Interval (CTI) table required for submission to utilities, AHJs, and clients.

### `buildCTIRows(deviceEntries, coordResult, faultCurrentA, margin?)`

**Module:** `reports/coordinationReport.mjs`

Produces one row per adjacent device pair × test-current level from a `greedyCoordinate()` result.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `deviceEntries` | `Array<{id, device, overrides}>` | Ordered load→source — same array passed to `greedyCoordinate()` |
| `coordResult` | `object` | Return value of `greedyCoordinate()` |
| `faultCurrentA` | `number` | Maximum bolted fault current [A] |
| `margin` | `number` (optional) | Required CTI [s]. Default: `0.3` |

**Returns:** `Array<Object>` — one row per (device pair × test-current level). Returns `[]` for fewer than 2 devices or invalid inputs.

**Standard test-current levels:** 100%, 60%, 25%, 10%, 5% of `faultCurrentA` — covering the full operating range from bolted fault to near-FLA.

**Column headers** (exported as `CTI_HEADERS`):

| Column | Description |
|--------|-------------|
| `Upstream Device` | Name of the upstream (source-side) protective device |
| `Downstream Device` | Name of the downstream (load-side) protective device |
| `Test Current (A)` | Fault current level for this row |
| `Upstream Time (s)` | Upstream device trip time at this current |
| `Downstream Time (s)` | Downstream device trip time at this current |
| `Margin (s)` | Upstream time − Downstream time |
| `Required CTI (s)` | Minimum required margin (from `margin` argument) |
| `Pass/Fail` | `PASS` if Margin ≥ Required CTI, else `FAIL` |

**Usage with `downloadCSV`:**

```js
import { buildCTIRows, CTI_HEADERS } from './reports/coordinationReport.mjs';
import { downloadCSV } from './reports/reporting.mjs';

const rows = buildCTIRows(deviceEntries, coordResult, maxFaultA, 0.3);
downloadCSV(CTI_HEADERS, rows, 'coordination-cti-report.csv');
```

This is called automatically by the "Export CTI Report" button in `tcc.html` after Auto-Coordinate completes.

---

## One-Line Diagram Schema

### `OneLineSheet`

Each sheet in the `oneLine` storage object conforms to:

```json
{
  "name": "Sheet 1",
  "components": [ /* OneLineComponent[] */ ],
  "connections": [ /* connection descriptors */ ],
  "layers": [
    { "id": "layer_1712345678901", "name": "Protection Devices", "visible": true, "locked": false }
  ]
}
```

The `layers` array (Gap #51) is optional for backward compatibility. When absent, the sheet is treated as having an empty layer list and all components are rendered as usual.

### `OneLineLayer`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (format: `layer_{timestamp}`) |
| `name` | string | Display name — not required to be unique |
| `visible` | boolean | When `false`, member components are excluded from rendering |
| `locked` | boolean | When `true`, member components are non-interactive (pointer-events disabled) |

### `OneLineComponent` (partial)

Relevant fields for layer management:

| Field | Type | Description |
|-------|------|-------------|
| `layer` | string (optional) | Id of the layer this component belongs to |
| `locked` | boolean (optional) | Component-level lock (Gap #41) — independent of layer lock |

See [layer-management.md](layer-management.md) for full workflow documentation.

---

## Session and Account Endpoints

Unless noted, bodies are JSON, errors are `{ "error": "..." }`, and the route is rate limited as above. "Auth" means the cookie or Bearer token; "CSRF" means the `x-csrf-token` header.

| Method | Path | Auth | CSRF | Body | Success |
|--------|------|------|------|------|---------|
| `POST` | `/signup` | no | no | `{ username, password }` | `201 { "message": "User created" }` (no session is created) |
| `POST` | `/login` | no | no | `{ username, password }` | `200 { token, csrfToken, expiresAt, role }` and sets the `ctr_auth` cookie |
| `POST` | `/session/refresh` | yes | yes | none | `200 { token, csrfToken, expiresAt }`, new cookie, old session deleted |
| `POST` | `/logout` | yes | yes | none | `200 { "loggedOut": true }`, cookie cleared |
| `POST` | `/account/signout-all` | yes | yes | none | `200 { "loggedOut": true }`, every session of the user revoked |
| `POST` | `/forgot-password` | no | no | `{ username }` | always `200` (never reveals whether the account exists) |
| `POST` | `/reset-password` | no | no | `{ token, newPassword }` | `200 { "message": ... }`, all sessions revoked |
| `POST` | `/account/change-password` | yes | yes | `{ currentPassword, newPassword }` | `200 { message, token, csrfToken, expiresAt }`, new cookie (other sessions are not revoked) |
| `GET` | `/account/sessions` | yes | n/a | none | `200 { sessions: [{ id, current, issuedAt, expiresAt }] }`, current session first |
| `GET` | `/account/deletion-request` | yes | n/a | none | `200 { request }` (`request` is `null` when none exists) |
| `POST` | `/account/deletion-request` | yes | yes | `{ "confirmation": "DELETE" }` | `201 { request: { username, email, status, requestedAt, updatedAt } }` |
| `POST` | `/ws/ticket` | yes | yes | none | `200 { ticket, expiresAt }` |

**Rules**
- Usernames match `[A-Za-z0-9_-]{1,100}`. Passwords must be 8-1000 characters.
- `/login` returns the same `401 Invalid credentials` for an unknown user, a wrong password, an invalid name, or an over-long password. It also upgrades the stored scrypt hash when needed.
- `/session/refresh` only succeeds within 5 minutes of expiry and before the absolute lifetime; otherwise it returns `401 Session not eligible for refresh` and clears the cookie.
- `/forgot-password` creates a reset token valid for 15 minutes. It is logged on the server console as `[password-reset]` and is never returned in the response.
- The `ctr_auth` cookie is `HttpOnly; Path=/; SameSite=Lax`, with `Max-Age` equal to the session TTL and `Secure` added over HTTPS.
- `/ws/ticket` returns a single-use ticket that expires after 30 seconds (at most 5 outstanding per session). Pass it as `ticket.<hex>` in the `Sec-WebSocket-Protocol` header when opening the collaboration WebSocket.
- Error messages you may see: `400 Missing credentials`, `400 Invalid username`, `400 Password must be at least 8 characters`, `400 Password too long`, `400 Missing token or password`, `400 Invalid or expired reset token`, `400 Missing passwords`, `400 Deletion confirmation is required`, `409 User exists`, `401 Current password is incorrect`.

---

## Project Cloud Sync Endpoints

All `/projects/*` routes require auth and CSRF (for writes) and share the project rate limiter. Project names follow the same pattern as usernames; anything else returns `400 Invalid project name`. Writes need the `engineer` role (`403 Insufficient permissions` otherwise).

### GET /projects/:project

Returns the latest saved version.

```json
{ "version": "1760000000000", "data": { } }
```

`404 { "error": "Not found" }` if the project does not exist. The response carries a `Server-Timing` header with read, parse, and total durations.

### POST /projects/:project

Saves a project. The JSON body (up to 1 MB) takes one of three shapes:

| Body | Mode |
|------|------|
| `{ "patch": { ... }, "baseVersion": "..." }` | Merge patch (RFC 7386 style): `null` deletes a key, objects merge recursively, arrays and scalars replace. A non-object patch replaces the whole document. |
| `{ "data": { ... }, "baseVersion": "..." }` | Replace with `data`. |
| any other object | Replace with the whole body. No `baseVersion` is sent. |

Updating an existing project requires `baseVersion` (optimistic concurrency); creating a new project does not.

**Response:** `200 { "version": "...", "unchanged": false }`. `unchanged` is `true` when the saved content is identical to the current version, in which case nothing is written and the version is unchanged. `Server-Timing` reports persist, load, merge, serialize, write, and total durations.

**Conflicts:** `409 { "error": "Version conflict", "currentVersion": "..." }` when `baseVersion` is stale (`currentVersion` is `null` if the project does not exist), or `409 { "error": "Base version required for project update", "currentVersion": "..." }` when it is missing for an existing project.

`DELETE /projects/:project` is not implemented: a role check is registered for it but no handler.

### GET /projects/:project/snapshots

`200 { "snapshots": [ { id, project, mode, version, createdAt, expiresAt, revokedAt, lastAccessAt, expired } ] }`, newest first.

### POST /projects/:project/snapshots

Creates a share link. Body `{ "mode": "read" | "edit" }` (anything other than `"edit"` becomes `"read"`).

`201 { id, project, mode, version, createdAt, expiresAt, revokedAt, token, url }`. The plain `token` and the `url` (`.../oneline.html?snapshotToken=<token>`) are returned only here. `404 Project not found` if the project does not exist.

### DELETE /projects/:project/snapshots/:snapshotId

Revokes a share link. `204` with an empty body, or `404 { "error": "Not found" }`.

---

## Shared Snapshot Endpoints

Public routes addressed by a share token; they use the project rate limiter and require no login or CSRF token.

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/shared/:token` | `200 { snapshot: { id, project, mode, version, createdAt, expiresAt, revokedAt }, data }` |
| `POST` | `/shared/:token` | Saves the request body as the project (replace mode) when the snapshot is in `edit` mode. `200 { version, unchanged }` |

An unknown, revoked, or expired token returns `404 { "error": "Not found" }`. Saving through a `read` snapshot returns `403 { "error": "Read-only snapshot" }`. See [sharing_security.md](sharing_security.md).

---

## AI Copilot

### POST /api/copilot

Auth and CSRF required; limited to 10 requests per minute per IP. Requires `ANTHROPIC_API_KEY` on the server.

**Body:** `{ "query": "string (1-2000 chars)", "projectData": { ... } }`. `projectData` is serialized and truncated to 8000 characters before it is sent to the model.

**Response:** `200 { "answer": "..." }`. `400 { "error": "Invalid query" }` for an empty or over-long query. Upstream failures return `500 { "error": "Internal server error" }`.

---

## Client Error Reporting

### POST /api/errors

No auth. Limited to 50 requests per window per IP. Browsers post uncaught errors here; the server logs them to the console as `[client-error]`.

**Body:** `{ type, error: { message, name, stack }, source, lineno, colno, page, userAgent, timestamp }`. Fields are coerced to strings and truncated (message 2000, stack 3000, page 200, source 300, userAgent 300). A missing or over-long message returns `400 { "error": "Invalid payload" }`. Success is `204` with no body.

---

## Admin and SSO Endpoints

`/api/v1/admin/*` (users, roles, account-deletion requests, audit log) and `/auth/oidc/*` (single sign-on) are documented in [enterprise-auth.md](enterprise-auth.md).

---

## Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Invalid name, missing or invalid input, or HTTPS required |
| 401 | Missing, expired, or invalid session (cookie or Bearer token) |
| 403 | Invalid or missing `x-csrf-token`, insufficient role, or write to a read-only snapshot |
| 404 | Project, library, or share link not found |
| 409 | Version conflict (response includes `currentVersion`) |
| 429 | Rate limit exceeded (see `Retry-After`) |
| 500 | Internal server error. Request bodies over 1 MB and malformed JSON also end up here, because the generic error handler does not distinguish them |

All errors return JSON: `{ "error": "description" }`. Successful `204` responses have no body.

---

## Python Automation Example

```python
import requests

BASE = "http://localhost:3000"

# Authenticate
session = requests.post(f"{BASE}/login", json={
    "username": "alice", "password": "MySecret123!"
}).json()
headers = {"Authorization": f"Bearer {session['token']}"}

# Fetch cables
cables = requests.get(f"{BASE}/api/v1/projects/myproject/cables", headers=headers).json()
print(f"Project has {cables['count']} cables")

# Run short-circuit study
sc = requests.post(f"{BASE}/api/v1/projects/myproject/studies/short-circuit",
                   headers=headers, json={}).json()
for bus, r in sc["shortCircuit"].items():
    print(f"{bus}: 3Φ={r['threePhaseKA']} kA")
```
