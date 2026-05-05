# Sustainability Footprint

**Study page:** `sustainability.html`  
**Analysis module:** `analysis/sustainabilityFootprint.mjs`  
**Standards:** IEC/EN 15804 (EPD methodology), GHG Protocol Scope 2 & 3, IEA/EPA eGRID emission factors

---

## Purpose

Calculate the embodied CO₂e (Scope 3, A1–A3 cradle-to-gate) from project materials and
the operating CO₂e (Scope 2) from capitalised conductor losses, producing a sustainability
footprint suitable for LEED, BREEAM, and client sustainability appendices.

---

## Scope Boundaries

| Scope | Description | Included |
|-------|-------------|----------|
| Scope 2 | Purchased electricity (conductor I²R losses) | Optional |
| Scope 3 — Cat 1 | Purchased goods and materials (cable, tray, conduit, equipment) | Yes |
| Scope 1 | On-site diesel (generators, construction equipment) | No |
| Scope 3 — Transport | Delivery of materials to site | No |

---

## Embodied Carbon (Scope 3)

Each BOM line item's quantity (metres or units) is multiplied by a unit embodied factor:

```
Embodied CO₂e [kg] = Σ (quantity × co2eKgPerUnit)
```

**Factor precedence:**
1. Item-level `co2eKgPerUnit` override (EPD data from manufacturer)
2. Built-in `CO2E_LIBRARY` table (representative averages per IEC/EN 15804 A1–A3)

### CO₂e Library Sources

| Category | Source |
|----------|--------|
| Cable (Cu, Al, XLPE/PVC) | Nexans, Prysmian, Southwire EPD averages |
| Cable tray (steel, Al, FRP) | Niedax, OBO, B-Line, Enduro EPD ranges |
| Conduit (EMT, IMC, RGS, PVC) | Atkore, ABB Thomas & Betts EPDs |
| Equipment | ETH ecoinvent v3.9, Siemens Eco Declarations, ABB EPD ranges |

---

## Operating Carbon (Scope 2)

```
Operating CO₂e [kg] = P_loss [kW] × 8 760 [h/yr] × gridFactor [kg CO₂e/kWh] × projectLifeYears
```

**Loss source options:**
- **Omit** — operating CO₂e not included in the total
- **Manual entry** — enter the annual average I²R losses in kW
- **From IEC 60287 study** — pulls the total conductor losses from a previously run IEC 60287 cable ampacity study

---

## Grid Emission Factors

| Region | Factor (kg CO₂e/kWh) | Source |
|--------|---------------------|--------|
| United States | 0.386 | EPA eGRID 2022 |
| European Union | 0.233 | IEA 2023 |
| United Kingdom | 0.207 | DESNZ 2023 |
| Canada | 0.130 | NRCAN 2022 |
| Australia (NEM) | 0.510 | DCCEEW 2023 |
| China | 0.581 | IEA 2023 |
| Custom | User-defined | — |

---

## EPD Item Overrides

To use a manufacturer-specific EPD for a cable, tray, conduit, or equipment item, add
these optional fields to the item record in the project data:

| Field | Type | Description |
|-------|------|-------------|
| `co2eKgPerUnit` | number | kg CO₂e per metre (cable/tray/conduit) or per unit (equipment) |
| `epdSource` | string | EPD document ID or URL for audit traceability |
| `epdValidUntil` | string | ISO date (YYYY-MM-DD) — EPD expiry tracking |

When `co2eKgPerUnit` is set, the library table value is ignored for that item.

---

## Alternative Design Comparison

Enable the comparison toggle and paste a second BOM JSON array. The study computes
the alternative embodied footprint and shows a delta card:

- **Positive delta** — alternative has higher CO₂e than the primary design
- **Negative delta** — alternative is lower-carbon than the primary design

Example alternative BOM JSON:
```json
[
  { "type": "cable", "quantity": 100, "size": "4 AWG", "material": "Al", "conductors": 3 },
  { "type": "tray",  "quantity": 50,  "widthIn": 12, "material": "aluminum" }
]
```

---

## Report Package Preset

The **Sustainability** preset in the Report Package Builder includes:
- Cover sheet
- Table of contents
- Assumptions / Basis section
- Sustainability section (embodied + operating CO₂e, category breakdown, grid factor used)
- Cable schedule (BOM basis)

---

## Skipped Items

BOM entries that cannot be matched to the library (unknown size, material, or type) are
listed in the Skipped Items panel. Common causes:

| Symptom | Fix |
|---------|-----|
| Cable size not recognised | Use AWG (e.g. `"4 AWG"`) or mm² number (e.g. `25`) |
| Conductor material unrecognised | Use `Cu` or `Al` (or `copper`/`aluminum`/`aluminium`) |
| Equipment category not found | Set `co2eKgPerUnit` override or use a supported `category` key |
| Zero length item | Check `length_ft` or `route_length` field in cable/tray/conduit data |

---

## Disclaimer

Embodied CO₂e factors are representative industry EPD averages for **screening-level design**
only. Final sustainability reports, LEED submittals, and BREEAM assessments must be verified
against:
- Manufacturer-specific EPDs for selected products
- Project-specific grid emission factor (from utility, PPA, or regional authority)
- Current EPD validity dates (typically 5-year expiry per ISO 14044 / EN 15804)
