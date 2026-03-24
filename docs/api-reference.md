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

## Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Invalid project name |
| 401 | Missing or invalid Bearer token |
| 404 | Project not found |
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
