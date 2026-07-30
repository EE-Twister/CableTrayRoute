# Custom Pricing Books for the Cost Estimator

## Overview

The Project Cost Estimator uses unit prices to calculate material and labor costs for cables, trays, conduit, and fittings. Its built-in 2024 USD values are conceptual allowances, not a licensed cost-book extract. Import supplier, internal, or licensed cost data for issued estimates.

For detailed estimates — such as those submitted to a client or used for contractor bid comparison — you can import a **custom pricing book** from a CSV file. Typical sources include:

- Distributor quotations exported to CSV
- Internal company rate sheets
- RS Means regional cost data
- IBEW or local union labor agreements

Imported pricing is saved in your browser and persists between sessions so you do not need to re-import on every visit.

---

## Importing a Pricing Book

1. Open **Cost Estimate** (`costestimate.html`).
2. Expand **Price Overrides (optional)**.
3. Click **Import Pricing CSV** and select your `.csv` file.
4. A confirmation dialog reports how many entries were loaded and any warnings.
5. The **pricing basis** line below the buttons updates to show the source name and date from your CSV.
6. Click **Generate Estimate** — the estimate now uses your imported prices.

---

## Regional and Date Escalation

The **Estimate Basis & Escalation** section applies three independent factors:

```
material factor = current PPI index / base PPI index
regional labor factor = local electrician wage / national electrician wage
labor escalation factor = current ECI index / base ECI index
combined labor factor = regional labor factor × labor escalation factor
```

Material prices (cable, tray, conduit, and fittings) receive the material
factor. Contractor labor rates receive the combined labor factor. Productivity
rates are not changed.

### Public source basis

- The national reference wage is `$62,350 / 2,080 = $29.98/hr`, based on the
  BLS May 2024 median annual wage for Electricians (SOC 47-2111):
  [BLS Electricians](https://www.bls.gov/ooh/construction-and-extraction/electricians.htm)
- Enter a comparable state or metropolitan OEWS electrician wage for the
  project location. The wage is used only as a geographic index; it does not
  replace the loaded contractor bill rate.
- Select a project-appropriate material series from the
  [BLS PPI database](https://www.bls.gov/ppi/databases/) and record its series
  ID, base-period value, and estimate-period value.
- Select a project-appropriate **non-seasonally adjusted** labor series and
  follow the [BLS ECI escalation guidance](https://www.bls.gov/eci/factsheets/how-to-use-eci-for-escalation.htm).

The application does not fetch live index values. Values, series IDs, and
periods are saved together, making the estimate reproducible offline. A blank
series ID is shown as a provenance gap.

Manual labor-rate inputs are final-rate overrides and are applied after regional
and escalation factors. The manual fitting price is also a final override.

---

## Exporting the Current Pricing Book

Click **Export Current Pricing** to download a `pricing-book.csv` file containing all active unit prices (custom or default). You can open this file in Excel, update values, and re-import it.

This is the recommended workflow for first-time setup:

1. **Export** the default pricing book.
2. Open `pricing-book.csv` in Excel or a text editor.
3. Replace prices with your distributor quotes.
4. Save and **Import** the updated file.

---

## Resetting to Default Prices

Click **Reset to Built-in Defaults** to clear all custom pricing and return to the built-in 2024 conceptual allowances. The stored pricing book is removed from project storage.

---

## CSV Format

### Columns

| Column | Required | Description |
|--------|----------|-------------|
| `category` | Yes | One of: `cable`, `tray`, `conduit`, `fitting`, `labor`, `productivity` |
| `key` | Conditional | Size or rate key (see table below). Leave empty for `fitting`. |
| `unit_price` | Yes | Numeric unit price. Must be a non-negative finite number. |
| `unit` | No | Display label (e.g. `$/ft`, `$/hr`). Not used in calculations. |
| `source` | No | Free-text name of the pricing source (shown in the basis badge). |
| `date` | No | Date the pricing was collected (`YYYY-MM-DD` recommended). |

### Valid Keys by Category

| Category | Valid keys |
|----------|-----------|
| `cable` | Any conductor size string: `14 AWG`, `12 AWG`, `10 AWG`, `8 AWG`, `6 AWG`, `4 AWG`, `2 AWG`, `1 AWG`, `1/0`, `2/0`, `3/0`, `4/0`, `250 kcmil`, `350 kcmil`, `500 kcmil`, `750 kcmil`, `1000 kcmil`, `default` |
| `tray` | Nominal width in inches: `6`, `9`, `12`, `18`, `24`, `30`, `36`, `default` |
| `conduit` | Trade size in inches: `0.5`, `0.75`, `1`, `1.25`, `1.5`, `2`, `2.5`, `3`, `3.5`, `4`, `default` |
| `fitting` | *(leave key empty)* — sets the unit price per tray fitting |
| `labor` | `cableInstall`, `trayInstall`, `conduitInstall` |
| `productivity` | `cablePullFtPerHr`, `trayInstallFtPerHr`, `conduitInstallFtPerHr` |

> **Tip:** Include a `default` key for `cable`, `tray`, and `conduit` to cover any sizes not explicitly listed. Rows with unrecognized keys or non-numeric prices are skipped with a warning.

### Priority Rules

When both a CSV value and a manual UI override exist for the same field, the **manual UI field takes precedence**. This applies to the three labor-rate inputs and the fitting price input. All other values come exclusively from the CSV (or default if no CSV is loaded).

### Comments

Lines beginning with `#` are treated as comments and ignored. The export format uses a `#` header block for readability:

```
# CableTrayRoute Pricing Book
# Source: Distributor ABC
# Date: 2026-04-11
```

---

## Example CSV

The following is a complete example you can save as `pricing-book.csv` and use as a starting template:

```csv
# CableTrayRoute Pricing Book
# Source: Distributor ABC
# Date: 2026-04-11
category,key,unit_price,unit,source,date
cable,14 AWG,0.22,$/ft,Distributor ABC,2026-04-11
cable,12 AWG,0.30,$/ft,Distributor ABC,2026-04-11
cable,10 AWG,0.48,$/ft,Distributor ABC,2026-04-11
cable,8 AWG,0.72,$/ft,Distributor ABC,2026-04-11
cable,6 AWG,1.05,$/ft,Distributor ABC,2026-04-11
cable,4 AWG,1.45,$/ft,Distributor ABC,2026-04-11
cable,2 AWG,2.10,$/ft,Distributor ABC,2026-04-11
cable,1 AWG,2.65,$/ft,Distributor ABC,2026-04-11
cable,1/0,3.40,$/ft,Distributor ABC,2026-04-11
cable,2/0,4.20,$/ft,Distributor ABC,2026-04-11
cable,3/0,5.30,$/ft,Distributor ABC,2026-04-11
cable,4/0,6.60,$/ft,Distributor ABC,2026-04-11
cable,250 kcmil,8.25,$/ft,Distributor ABC,2026-04-11
cable,350 kcmil,11.00,$/ft,Distributor ABC,2026-04-11
cable,500 kcmil,14.30,$/ft,Distributor ABC,2026-04-11
cable,default,1.65,$/ft,Distributor ABC,2026-04-11
tray,6,4.80,$/ft,Distributor ABC,2026-04-11
tray,9,5.90,$/ft,Distributor ABC,2026-04-11
tray,12,7.20,$/ft,Distributor ABC,2026-04-11
tray,18,9.10,$/ft,Distributor ABC,2026-04-11
tray,24,11.80,$/ft,Distributor ABC,2026-04-11
tray,30,15.00,$/ft,Distributor ABC,2026-04-11
tray,36,18.20,$/ft,Distributor ABC,2026-04-11
tray,default,8.00,$/ft,Distributor ABC,2026-04-11
conduit,0.5,0.70,$/ft,Distributor ABC,2026-04-11
conduit,0.75,0.95,$/ft,Distributor ABC,2026-04-11
conduit,1,1.35,$/ft,Distributor ABC,2026-04-11
conduit,1.25,1.90,$/ft,Distributor ABC,2026-04-11
conduit,1.5,2.30,$/ft,Distributor ABC,2026-04-11
conduit,2,3.20,$/ft,Distributor ABC,2026-04-11
conduit,2.5,4.60,$/ft,Distributor ABC,2026-04-11
conduit,3,6.40,$/ft,Distributor ABC,2026-04-11
conduit,3.5,8.30,$/ft,Distributor ABC,2026-04-11
conduit,4,10.50,$/ft,Distributor ABC,2026-04-11
conduit,default,3.50,$/ft,Distributor ABC,2026-04-11
fitting,,42.00,$,Distributor ABC,2026-04-11
labor,cableInstall,80.00,$/hr,IBEW Local 2026,2026-04-11
labor,trayInstall,95.00,$/hr,IBEW Local 2026,2026-04-11
labor,conduitInstall,90.00,$/hr,IBEW Local 2026,2026-04-11
productivity,cablePullFtPerHr,140,ft/hr,IBEW Local 2026,2026-04-11
productivity,trayInstallFtPerHr,28,ft/hr,IBEW Local 2026,2026-04-11
productivity,conduitInstallFtPerHr,22,ft/hr,IBEW Local 2026,2026-04-11
```

---

## Persistence

Each successful estimate is saved as `settings.costEstimateArtifact`. The
record includes the source-stamped estimate basis, category summary,
contingency, grand total, and line-item rows. A source-fingerprinted entry is
also added to the deliverable register so Project Report and Submittal packages
can include the current estimate without relying on a downloaded workbook.

Custom pricing is stored through project storage under `settings.customPricing`.
The regional/escalation basis is stored under `settings.costEstimateBasis`.
Legacy browser keys are migrated through the central storage API. Pricing persists until you:

- Click **Reset to Built-in Defaults**, or
- Clear your browser's site data.

Each browser profile and device maintains its own pricing book. For team use, export the CSV and share it so all team members import the same rates.

---

## XLSX Export

When exporting the estimate to XLSX, the **Summary** sheet includes the pricing
basis and applied material/labor factors. A dedicated **Estimate Basis** sheet
records dates, region, wages, index values, series IDs, calculated factors, and
public source URLs. The **Line Items** sheet also carries manufacturer, catalog
number, and approval status fields when schedule rows include governed catalog
metadata.


---

## Workflow Assumptions and Validation Expectations

This section summarizes the behavior expected by integration checks and user workflows for `costestimate.html`.

### Input assumptions

- At least one schedule category (cable, tray, or conduit) is present in project data before generating a meaningful estimate.
- Contingency is a numeric percent, typically in the `0` to `100` UI range.
- Pricing source is either built-in defaults or imported CSV values, with manual labor/fitting overrides taking precedence when entered.

### Expected outputs

- The UI renders category subtotals, subtotal before contingency, contingency amount, and grand total.
- Displayed currency is rounded for readability in UI tables, while internal/exported values retain full calculation precision where applicable.
- Empty project data yields guidance text instead of broken or blank result tables.

### Compliance interpretation

- For Cost Estimator workflows, “compliance” means **formula and validation contract compliance** with automated checks (correct math, deterministic rounding behavior, and guardrails), not code/regulatory compliance.

### Export behavior

- **Export XLSX** is intentionally blocked until an estimate is generated.
- The exported workbook is expected to align with on-screen totals for the same run and include pricing basis metadata for traceability.

### Troubleshooting (common validation failures)

- **No data message shown after Generate Estimate**: load/import project schedule data and rerun.
- **Unexpected contingency result**: verify contingency is numeric and in range; malformed values can trigger fallback handling.
- **Export blocked with warning**: run **Generate Estimate** first in the current state, then retry **Export XLSX**.
- **Imported CSV appears partially applied**: check warning dialog for skipped rows (invalid category/key/price) and correct the CSV.
