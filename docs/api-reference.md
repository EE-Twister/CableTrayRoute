# CableTrayRoute REST API Reference

The CableTrayRoute server exposes a public REST API under `/api/v1` for scripting and automation.

## Authentication

All `/api/v1` endpoints require a Bearer token obtained from the `/login` endpoint.

```bash
# 1. Log in to get a token
curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"MySecret123!"}' \
  | jq -r '.token'
# → e3f4a1b2c9d0...

# 2. Use the token in subsequent requests
export TOKEN="e3f4a1b2c9d0..."
```

Tokens expire after the configured TTL (default: 1 hour). Refresh via `POST /session/refresh`.

---

## Rate Limiting

All `/api/v1` endpoints share the project rate limiter: **100 requests per 15 minutes per IP** (configurable via `PROJECT_RATE_LIMIT_MAX` and `PROJECT_RATE_LIMIT_WINDOW_MS` environment variables).

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

Runs a short-circuit study on the project's one-line diagram data.

Computes three-phase (3LG), single-line-to-ground (SLG), line-to-line (L-L), and
double-line-to-ground (DLG) fault currents for each bus.

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

Runs a motor starting study on the project's one-line diagram data.

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

Runs a voltage drop study on the project's one-line diagram data.

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

## Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Invalid project name |
| 401 | Missing or invalid Bearer token |
| 404 | Project or library not found |
| 409 | Version conflict (include `currentVersion` in response) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

All errors return JSON: `{ "error": "description" }`

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
