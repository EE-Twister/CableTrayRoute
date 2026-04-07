# Arc Flash Warning Label Generation

## Overview

CableTrayRoute generates NFPA 70E–compliant arc flash warning labels directly from the one-line diagram after running an arc flash study. Labels can be:

- **Printed as a label sheet** — a print-optimized page with all equipment labels arranged in a 2-column grid, ready to cut and apply to switchgear
- **Viewed as overlay badges** on the one-line diagram — compact signal-color badges at each analyzed bus, showing PPE category and incident energy at a glance

This feature satisfies **NFPA 70E 2021 §130.5(H)**, which requires electrical equipment to be field-labeled with arc flash hazard information before energized work is performed.

---

## Regulatory Background

### NFPA 70E 2021 §130.5(H) — Equipment Labeling

> "Electrical equipment such as switchboards, panelboards, industrial control panels, meter socket enclosures, and motor control centers that are in other than dwelling units and are likely to require examination, adjustment, servicing, or maintenance while energized shall be field-marked with a label containing all of the following information..."

**Required label fields:**

| Field | Source in CableTrayRoute |
|---|---|
| Nominal system voltage | `nominalVoltage` on bus component |
| Arc flash boundary | Arc flash study `boundary` (mm) |
| Incident energy at working distance | Arc flash study `incidentEnergy` (cal/cm²) |
| Minimum arc rating of PPE | Derived from `ppeCategory` |
| Working distance | Arc flash study `workingDistance` (mm) |
| Upstream protective device | `upstreamDevice` from arc flash study |
| Date of study | `studyDate` from arc flash study |

### Signal Word Selection (ANSI Z535)

| Incident Energy | Signal Word | Banner Color |
|---|---|---|
| < 40 cal/cm² | **WARNING** | Orange `#f57c00` |
| ≥ 40 cal/cm² | **DANGER** | Red `#d32f2f` |

---

## Workflow

### Step 1 – Run the Arc Flash Study

1. Open the **One-Line Diagram** page (`oneline.html`)
2. Open the **Studies** panel (toolbar button or keyboard shortcut)
3. Click **Arc Flash** — this automatically runs Short Circuit first, then computes IEEE 1584-2018 incident energy for every bus component

### Step 2 – Print Labels

After the arc flash study completes, the **Print Labels** button becomes enabled in the Studies panel.

1. Click **Print Labels**
2. A new browser window opens containing all NFPA 70E labels in a 2-column grid
3. Click **Print All Labels** in that window — the browser print dialog opens
4. Select your label stock (landscape, ½ in margins), print, cut, and apply to switchgear

**Label size:** 6 in × 4 in per label (matches standard industrial arc flash label stock)

### Step 3 – Enable Diagram Overlay (Optional)

Check **Show Label Overlays** in the Studies panel to toggle compact signal-color badge overlays on the one-line diagram at each analyzed bus. Each badge shows:

- Signal color banner (orange = WARNING, red = DANGER)
- Signal word
- PPE category number
- Incident energy in cal/cm²

Overlays are for visual reference only and are not printed when exporting the diagram.

---

## Label Format

Each label is a 6 in × 4 in SVG document. The default layout:

```
┌────────────────────────────────────────┐
│ ▲  WARNING / DANGER (signal banner)    │
│ !  ARC FLASH HAZARD                    │
├────────────────────────────────────────┤
│ Equipment Tag:        MCC-1            │
│ Nominal Voltage:      480 V            │
│ Incident Energy:      8.50 cal/cm² @ 18 in│
│ Working Distance:     18 in (455 mm)   │
│ Arc Flash Boundary:   5 ft (1524 mm)   │
│ Limited Approach:     Not Applicable   │
│ Restricted Approach:  11.8 in (300 mm) │
│ Upstream Device:      CB-1A            │
│ PPE Category: 2       Study: 2026-04-07│
└────────────────────────────────────────┘
```

---

## Individual SVG Downloads

When the arc flash study runs, CableTrayRoute also automatically downloads one individual `.svg` label file per equipment piece (alongside the `arcflash.csv` and `arcflash.pdf` reports). These individual files can be opened in any SVG editor or sent to a label printer directly.

File names are derived from the equipment tag (e.g., `MCC-1.svg`).

---

## Customising the Label Template

The label layout is driven by the SVG template at `reports/templates/arcflashLabel.svg`. If that file exists, it takes priority over the built-in default template in `reports/labels.mjs`.

To customise:
1. Copy the default template SVG from `reports/labels.mjs` (the `template` string) into `reports/templates/arcflashLabel.svg`
2. Edit dimensions, fonts, logo placement, or field layout as needed
3. Keep all `{{key}}` placeholder tokens — they are replaced at generation time with study result values

Available placeholder tokens:

| Token | Value |
|---|---|
| `{{signalWord}}` | `WARNING` or `DANGER` |
| `{{signalColor}}` | Hex color for the signal banner |
| `{{equipmentTag}}` | Equipment identifier |
| `{{voltage}}` | Formatted system voltage |
| `{{incidentEnergy}}` | Incident energy with unit and working distance |
| `{{workingDistance}}` | Verbose working distance (ft/in and mm) |
| `{{arcFlashBoundary}}` | Arc flash boundary (ft/in and mm) |
| `{{limitedApproach}}` | Limited approach boundary |
| `{{restrictedApproach}}` | Restricted approach boundary |
| `{{upstreamDevice}}` | Upstream protective device name |
| `{{ppeCategory}}` | PPE category number |
| `{{studyDate}}` | Date of arc flash study (YYYY-MM-DD) |

---

## Implementation Notes

- **Module:** `reports/arcFlashReport.mjs` — `buildLabelSheetHtml()`, `openLabelPrintWindow()`
- **Label renderer:** `reports/labels.mjs` — `generateArcFlashLabel(data)`
- **Overlay renderer:** `oneline.js` — `renderArcFlashLabelOverlays(svg)`
- **Tests:** `tests/arcFlashLabels.test.mjs` (17 assertions)
- **Standard:** NFPA 70E 2021 §130.5(H), ANSI Z535 signal word hierarchy
