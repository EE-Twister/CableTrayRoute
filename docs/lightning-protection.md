# Lightning & Surge Protection

The Lightning & Surge Protection study performs a screening-level lightning risk assessment per **IEC 62305** (structural lightning protection) and **IEEE 998** (substation direct-stroke shielding), recommends a Lightning Protection Level (LPL), sizes the rolling-sphere air termination and down-conductors, and selects a surge-arrester continuous operating voltage per **IEEE C62.22 / IEC 60099-5**.

## When to Use

- Utility **substation** direct-stroke shielding (IEEE 998).
- Structural lightning protection for **control buildings, telecom huts, and BESS enclosures** (IEC 62305).
- **Surge-arrester MCOV** selection for incoming-line protection.

## Quick Start

1. Navigate to **Studies → Grounding → Lightning & Surge Protection**.
2. Enter the **thunderstorm-day** keraunic level (or the ground flash density directly) and the **location factor**.
3. Enter the **structure geometry** and the **protected equipment height**.
4. Optionally enter the **system voltage and grounding** for surge-arrester selection.
5. Click **Run Lightning Assessment**, review the recommended LPL and sizing, then **Export Results (CSV)**.

## Risk Assessment

```
Ng = 0.04 · Td^1.25                  (ground flash density, flashes/km²/yr)
Ad = L·W + 2·(3H)(L+W) + π·(3H)²     (equivalent collection area, m²)
Nd = Ng · Ad · Cd · 1e-6             (expected direct strikes per year)
E  = 1 − Nc/Nd                       (required protection efficiency)
```

The required **Lightning Protection Level** comes from the protection-efficiency table (IEC 61024-1 / 62305):

| Efficiency E | LPL |
|--------------|-----|
| > 0.98 | I |
| > 0.95 | II |
| > 0.90 | III |
| > 0.80 | IV |
| ≤ 0.80 | IV sufficient |

The **location factor Cd** accounts for nearby objects: surrounded by taller objects (0.25), surrounded by equal/shorter (0.5), isolated (1.0), isolated on a hilltop (2.0).

## Rolling Sphere (Electrogeometric Model)

Each LPL has a rolling-sphere radius `R`:

| LPL | R (m) | Min current (kA) | Down-conductor spacing (m) |
|-----|-------|------------------|----------------------------|
| I | 20 | 3 | 10 |
| II | 30 | 5 | 10 |
| III | 45 | 10 | 15 |
| IV | 60 | 16 | 20 |

A single vertical mast of height `h` protects an object of height `hx` out to a radius:

```
rp = √(h(2R − h)) − √(hx(2R − hx))         (h, hx ≤ R)
```

The striking distance for a given peak current is `r = 10·I^0.65` m (IEEE 998).

## Down-Conductors

The number of down-conductors is the structure perimeter divided by the class spacing (minimum two). Minimum cross-sections (IEC 62305-3 Table 6): **Copper 16 mm², Aluminium 25 mm², Steel 50 mm²**.

## Surge Arrester (IEEE C62.22 / IEC 60099-5)

```
Effectively / solidly grounded:  Uc ≥ 1.05 · V_LL / √3
Ungrounded / resonant-grounded:  Uc ≥ 1.05 · V_LL
Rated voltage  Ur ≈ MCOV / 0.8
```

The study reports the minimum MCOV, the required rated voltage, and the nearest standard duty-cycle rating.

## Limitations

- **Screening-level** — a simplified single-component risk, not the full IEC 62305-2 R1–R4 risk assessment.
- **Single-mast** protection only; multi-mast and shield-wire layouts need a dedicated study.
- Verify against a full risk assessment and the ground-grid study before final design.

## References

- IEC 62305-1/-2/-3 — Protection against lightning.
- IEEE Std 998 — Guide for Direct Lightning Stroke Shielding of Substations.
- IEEE Std C62.22 / IEC 60099-5 — Application of surge arresters.
