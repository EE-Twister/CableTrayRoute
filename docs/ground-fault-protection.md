# Ground Fault Protection (GFP) Relay Curves

## Overview

CableTrayRoute's TCC (Time-Current Curve) tool supports ground fault protection (GFP) relay curves alongside standard phase overcurrent curves. GFP curves are plotted on a separate **Ground Fault Plane** — a visually distinct overlay using dashed purple curves — so engineers can verify GFP coordination without cluttering the phase overcurrent study.

Ground fault protection is a mandatory compliance requirement on solidly-grounded systems:

- **NEC 230.95** — Requires ground fault protection on service equipment rated ≥ 1000 A, operating at 150 V–600 V line-to-ground (solidly grounded). Maximum pickup: 1200 A. Maximum time-delay: 1 second at 3000 A.
- **OSHA 29 CFR 1910.304** — Mandates GFP on solidly-grounded wye services 150 V–600 V LG.

GFP curves use the same IEC 60255-151 formula as phase overcurrent relays (see [`iec-relay-curves.md`](iec-relay-curves.md)), but with much lower pickup settings (typically 5–200 A for service-entrance GFP vs. 50–1600 A for phase relays) and lower TMS values.

---

## Sensor Types

GFP relays measure the ground fault current using one of two sensing methods:

| Type | Symbol | Measurement | Typical Use |
|------|--------|-------------|-------------|
| **Residual** | 3I₀ = Iₐ + I_b + I_c | Vector sum of three phase CT outputs | Switchboards, panelboards, feeders |
| **Zero-Sequence** | I₀ | Single core-balance (window) CT encircling all three phases | Service entrance, main disconnects |

Both types use the same IEC 60255-151 time-current formula. The sensor type is informational — it describes how the relay measures fault current in the field and does not affect the TCC curve shape.

---

## Formula

GFP relays use the same IEC 60255-151 inverse-time formula as phase relays:

```
t = TMS × k / [(I / Is)^α − 1]
```

Where:
- **t** — operating time in seconds
- **TMS** — Time Multiplier Setting (typically 0.05 – 1.5 for GFP)
- **k**, **α** — curve family constants (see table below)
- **I** — ground fault current in amps
- **Is** — GFP pickup current setting in amps (typically 5–200 A)

The relay does not operate for I ≤ Is. Operating time is floored at 0.01 s (IEC hardware minimum).

| Family Key | Name | k | α |
|------------|------|---|---|
| **NI** | Normal Inverse | 0.14 | 0.02 |
| **VI** | Very Inverse | 13.5 | 1.0 |
| **EI** | Extremely Inverse | 80.0 | 2.0 |
| **LTI** | Long-Time Inverse | 120.0 | 1.0 |

---

## NEC 230.95 Requirements

| Requirement | Value |
|-------------|-------|
| Applicable service | Solidly-grounded wye, ≥ 1000 A, 150 V – 600 V LG |
| Maximum pickup | 1200 A |
| Maximum time-delay at 3000 A | 1 second |
| Exemptions | Continuous industrial process where GFP shutdown creates greater hazard; fire pump circuits |

> **Note:** NEC 230.95(C) requires that the GFP device be performance-tested at installation. CableTrayRoute's GFP curve library flags all compliant devices with `nec230_95: true`.

---

## OSHA 29 CFR 1910.304 Summary

OSHA requires GFP on solidly-grounded 3-phase, 4-wire, 480Y/277 V services rated over 1000 A at the disconnecting means. The regulation references NEC 230.95 for technical requirements.

---

## Using GFP Curves in the TCC Tool

### Step 1 — Enable the Ground Fault Plane

1. Open **TCC** (`tcc.html`)
2. Click **Views** in the toolbar
3. Check **Ground Fault Plane**
4. Click **Apply**

GFP curves will now appear as **dashed purple lines** whenever GFP devices are plotted.

### Step 2 — Select GFP Devices

1. In the **Devices** panel, scroll to the **Ground Fault Relays (GFP)** group
2. Select one or more GFP relay entries:
   - **GFP Normal Inverse – Residual (3I₀)** — NI family, residual sensing
   - **GFP Very Inverse – Residual (3I₀)** — VI family, residual sensing
   - **GFP Extremely Inverse – Residual (3I₀)** — EI family, residual sensing
   - **GFP Very Inverse – Zero-Sequence (I₀)** — VI family, core-balance CT
   - **GFP Parametric Relay** — all four families, selectable sensor type

### Step 3 — Adjust Settings

In the device settings panel, adjust:

| Setting | Typical GFP Range | Phase Overcurrent Range |
|---------|-------------------|------------------------|
| **Pickup (Is)** | 5–200 A | 50–1600 A |
| **TMS** | 0.05–1.5 | 0.05–2.0 |
| **Curve Family** | NI, VI, EI, LTI | NI, VI, EI, LTI |

> **Guidance:** Start with a pickup at 20–30% of the maximum expected ground fault current, and a TMS that produces 0.5–1.0 s operation at the minimum fault level.

### Step 4 — Verify Coordination

Click **Plot** to render both phase and GFP curves. Phase curves appear as solid lines; GFP curves appear as **dashed purple lines**.

- GFP curves must clear below the phase overcurrent curves at all fault levels (GFP typically operates before phase overcurrent for low-level ground faults)
- Adjacent GFP devices must coordinate with the required CTI (0.2–0.3 s typical)

Click **Auto-Coordinate** to automatically adjust TMS settings. The engine handles phase and GFP devices independently — phase devices are coordinated on the phase plane, GFP devices on the ground fault plane.

### Step 5 — Export

- **CTI Report** — includes both phase and GFP coordination pairs (GFP entries labeled with `GFP:` prefix)
- **SVG/PNG Export** — GFP dashed curves are included automatically
- **PDF** — dashed purple curves render correctly in all export formats

---

## Coordination Example

A typical service-entrance GFP coordination chain:

```
Utility (source)
  └─ Main Breaker — phase OC: 2000 A pickup, 0.5 s delay
       └─ Main GFP Relay — 3I₀ pickup: 50 A, TMS 0.4 (VI)
            └─ Feeder GFP Relay — 3I₀ pickup: 20 A, TMS 0.2 (VI)
```

The feeder GFP relay operates first for low-level ground faults (< 200 A). The main GFP relay operates as backup. Both must be below the phase overcurrent curve to preserve selectivity.

---

## Implementation Reference

| Component | File | Description |
|-----------|------|-------------|
| Device library | `data/protectiveDevices.json` | 5 GFP entries (`gfp_ni_relay`, `gfp_vi_relay`, `gfp_ei_relay`, `gfp_zs_relay`, `gfp_parametric_relay`) |
| IEC formula engine | `analysis/iecRelayCurves.mjs` | `computeIecCurvePoints()` — shared with phase relays, no changes needed |
| Curve scaling | `analysis/tccUtils.js` | `scaleCurve()` — handles `iec60255: true` devices generically; GFP uses same path |
| GFP coordination | `analysis/tccAutoCoord.mjs` | `greedyCoordinateGFP()` — validates GFP-only chain, delegates to `greedyCoordinate()` |
| TCC renderer | `analysis/tcc.js` | `groundFault` view option in `TCC_VIEW_OPTIONS`; `GFP_COLOR_PALETTE`; `buildGFPLibraryEntries()`; dashed purple path styling in `plot()`; GFP dispatch in `autoCoordinate()` |
| Tests | `tests/tcc/groundFaultProtection.test.mjs` | 27 assertions covering library schema, curve generation, coordination, and NEC metadata |
