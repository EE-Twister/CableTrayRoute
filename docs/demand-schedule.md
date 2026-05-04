# Demand & Diversity Estimator

## Overview

The Demand Schedule study applies NEC 220 demand factors (US) or IEC 60439-1 diversity (international) to the project's Load List to compute coincident demand — the actual simultaneous load expected on the system rather than the sum of nameplate ratings.

Use the demand schedule to size service entrances, main switchboards, and utility coordination submissions.

## Accessing the Study

Navigate to **Studies → Equipment Sizing → Demand Schedule**, or click **Demand Schedule** from the footer of the Load List page.

## Prerequisites

Populate the [Load List](loadlist.html) with:

- **Source / Panel** — which panel or switchboard feeds the load (used for per-panel breakdown)
- **Load Type** — free-text; keyword-matched to an NEC 220 category
- **kW** — connected power per unit
- **Quantity** — number of units of this load
- **Power Factor** — used to compute kVA; defaults to 1.0 if not set

## NEC 220 Mode

Each load is auto-categorised by scanning its **Load Type** for keywords, then the appropriate code demand factor is applied.

### Category Table

| Category | Keywords | NEC Reference | Demand Factor |
|---|---|---|---|
| Lighting | light, luminaire, lamp, illum | NEC 220.42 | 100% ≤ 50 kVA; 50% remainder |
| Receptacles | recept, outlet, plug, strip | NEC 220.44 | 100% first 10 kVA; 50% remainder |
| Motors | motor, pump, fan, compressor, drive, VFD | NEC 430.24 | 100% all + 25% largest |
| Kitchen / Cooking | kitchen, cook, oven, range, fryer | NEC Table 220.56 | 65%–100% by unit count |
| HVAC / Heating | hvac, heat, cool, AC, chiller, furnace | NEC 220.60 | 100% (verify non-coincident) |
| EV Charging | ev, electric vehicle, charger, EVSE | NEC 625.42 | 100% / 75% / 50% by ordinal |
| Fixed Appliances | appliance, washer, dryer | NEC 220.53 | 75% if ≥ 4, else 100% |
| Critical / UPS | ups, critical, server, datacen | NEC 220 | 100% |
| General / Other | (all others) | NEC 220 | 100% |

### NEC 430.24 — Motor Loads

All motor kW values are taken at 100% of full-load amperes. The motor with the **largest connected kW** receives an additional **25% adder** per NEC 430.24. If a single motor is present it receives the 125% factor.

### NEC 220.56 — Commercial Kitchen

Demand factor by total unit count (Table 220.56):

| Units | Factor |
|---|---|
| 1–2 | 100% |
| 3 | 90% |
| 4 | 80% |
| 5 | 70% |
| 6+ | 65% |

### NEC 625.42 — EV Supply Equipment

Chargers are applied in the order they appear in the Load List:

| Charger ordinal | Factor |
|---|---|
| 1st | 100% |
| 2nd – 4th | 75% |
| 5th and above | 50% |

### NEC 220.60 — Non-Coincident Loads (HVAC)

The study applies 100% to all HVAC loads and flags the note "verify non-coincident loads per NEC 220.60". If both heating and cooling loads are present and truly non-coincident, remove the smaller load from the schedule manually before running the study.

## IEC 60439-1 Mode

A single diversity factor is applied to all loads based on total consumer count (Table B.1):

| Consumers | Diversity Factor |
|---|---|
| 1–2 | 1.0 |
| 3–5 | 0.9 |
| 6–10 | 0.8 |
| 11–40 | 0.7 |
| > 40 | 0.6 |

## Overriding the Category

Add a `necCategory` property to a load row (via JSON import) to force a specific category. Valid values: `lighting`, `receptacle`, `motor`, `kitchen`, `hvac`, `ev`, `appliance`, `critical`, `general`.

## Results

### Summary Cards

| Metric | Description |
|---|---|
| Connected Load (kW / kVA) | Sum of nameplate kW × quantity, before demand factors |
| Demand Load (kW / kVA) | Coincident demand after applying code factors |
| Overall Demand Factor | Demand ÷ Connected (aggregate) |

### Service Entrance Summary

Demand totals are grouped by the **Source / Panel** field, giving the per-panel coincident demand needed to size main breakers, bus bars, and the service entrance.

### Detail Table

One row per load showing: connected kW/kVA, demand factor, demand kW/kVA, and the specific code clause applied.

## Export

Click **Export CSV** to download the complete demand schedule. Use the CSV in:

- Utility coordination submittals
- Service entrance sizing calculations
- Panel schedule cross-checks
- Report package appendices

## References

- NEC 2023, Article 220 — Branch-Circuit, Feeder, and Service Load Calculations
- NEC 2023, Article 430 — Motors, Motor Circuits, and Controllers (§ 430.24)
- NEC 2023, Article 625 — Electric Vehicle Power Transfer System (§ 625.42)
- IEC 60439-1:1999 — Low-voltage switchgear and controlgear assemblies (Annex B, Table B.1)
