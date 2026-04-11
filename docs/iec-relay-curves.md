# IEC 60255-151 Formula-Based Relay Curves

## Overview

CableTrayRoute's TCC (Time-Current Curve) tool supports IEC 60255-151 formula-based protective relay curves. These are the standard inverse-time overcurrent relay characteristics used in IEC-jurisdiction projects worldwide (Europe, Australia, Asia, Middle East, and international utility applications).

Four curve families are supported, matching the IEC 60255-151:2009 standard exactly.

> **See also:** For ground fault relay curves (residual 3I₀ and zero-sequence I₀), including NEC 230.95 compliance requirements, see [`ground-fault-protection.md`](ground-fault-protection.md).

---

## Formula

All IEC 60255-151 inverse-time curves share the same mathematical form:

```
t = TMS × k / [(I/Is)^α − 1]
```

Where:
- **t** — operating time in seconds
- **TMS** — Time Multiplier Setting (dimensionless, typically 0.05 – 2.0)
- **k** — curve constant (family-specific)
- **α** — exponent (family-specific)
- **I** — fault current in amps
- **Is** — pickup current setting in amps

The relay does not operate for I ≤ Is. For very high currents the operating time is floored at **0.01 s** (hardware minimum per IEC 60255-151).

---

## Curve Families

| Key | Name | k | α | Typical Application |
|-----|------|---|---|---------------------|
| **NI** | Normal Inverse | 0.14 | 0.02 | General-purpose overcurrent; distribution feeders with moderate fault-current variation |
| **VI** | Very Inverse | 13.5 | 1.0 | Feeders where fault current varies significantly with fault location; cable systems |
| **EI** | Extremely Inverse | 80.0 | 2.0 | Coordination with fuses; high inrush loads; transformer protection |
| **LTI** | Long-Time Inverse | 120.0 | 1.0 | Thermal overload protection; motor and cable protection |

### Choosing a Curve Family

- **NI** — good default; offers gradual discrimination across a wide current range.
- **VI** — preferred when the source impedance is high relative to the fault impedance, giving a wider spread of fault currents between near-end and far-end faults.
- **EI** — best for coordinating with fuses (which are also very inverse) and for protecting equipment with high inrush (motors, transformers).
- **LTI** — designed to track thermal heating closely; use where the objective is thermal protection rather than fault discrimination.

---

## Tolerance

IEC 60255-151 defines **Class E1** accuracy: operating time within **±5%** of the formula value.

CableTrayRoute renders ±5% tolerance bands on all IEC relay curves (the shaded envelope on the TCC chart). This is tighter than the ±20% default used for manufacturer-tabulated devices.

---

## Using IEC Relay Curves in the TCC Tool

### Adding a Device

1. Open the TCC tool (`tcc.html`).
2. Click **Choose Devices**.
3. In the device modal, select type **Relay**, then manufacturer **IEC 60255-151**.
4. Choose one of:
   - **IEC Parametric Relay** — one device with a Curve Family dropdown; recommended for most workflows.
   - **IEC Normal Inverse (NI) Relay** — pre-fixed to NI family.
   - **IEC Very Inverse (VI) Relay** — pre-fixed to VI family.
   - **IEC Extremely Inverse (EI) Relay** — pre-fixed to EI family.
   - **IEC Long-Time Inverse (LTI) Relay** — pre-fixed to LTI family.

### Adjusting Settings

After selecting an IEC relay device, the **Settings** panel shows:

| Setting | Description | Range |
|---------|-------------|-------|
| **Curve Family (IEC 60255-151)** | Active curve family (Parametric Relay only) | NI, VI, EI, LTI |
| **TMS (Time Multiplier)** | Scales all operating times proportionally | 0.05 – 2.0 |
| **Pickup (A)** | Minimum operating current (Is) | 50 – 1600 A |

For the **IEC Parametric Relay**, changing the Curve Family dropdown immediately recalculates the entire curve without adding a new device — ideal for family comparison during coordination studies.

### Example: Comparing Curve Families

1. Add the **IEC Parametric Relay** device.
2. Set TMS = 0.5, Pickup = 200 A.
3. Click **Plot** — the NI curve appears.
4. In Settings, change Curve Family to **VI** → click **Plot** again to overlay.
5. Repeat for EI and LTI to see how each family coordinates with upstream/downstream devices.

---

## Implementation Details

| Component | File | Description |
|-----------|------|-------------|
| Formula engine | `analysis/iecRelayCurves.mjs` | `computeIecCurvePoints(family, tms, pickupAmps)` — generates 80 log-spaced {current, time} points |
| `scaleCurve()` integration | `analysis/tccUtils.js` lines 246–275 | IEC early-return handler; reads `overrides.curveFamily` before `device.curveFamily` |
| Device library | `data/protectiveDevices.json` | 5 IEC relay entries (4 fixed + 1 parametric) |
| Settings label | `analysis/tcc.js` `formatSettingLabel()` | `curveFamily` → `'Curve Family (IEC 60255-151)'` |
| Tests | `tests/tcc/iecRelayCurves.test.mjs` | Formula accuracy, TMS linearity, pickup scaling, `curveFamily` override |

---

## Reference

- **IEC 60255-151:2009** — *Measuring relays and protection equipment – Part 151: Functional requirements for over/under-current protection*
- **IEC 60255-3** (withdrawn, superseded by IEC 60255-151)
- **IEEE C37.112-2018** — American IDMT standard (different constants; not covered here)
