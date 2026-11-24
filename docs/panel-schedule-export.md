# Panel schedule Excel export

Export Panel to Excel includes manually entered load descriptions, breaker/fuse ratings, pole counts, cable tags, and each circuit's phase load (VA for AC or W for DC), alongside assigned load information. Multi-pole circuits retain their starting-circuit references ("Tied to Circuit 1 — Workshop outlets"). Connected and demand totals use the same calculation as the panel schedule page, including manual phase-load entries.

The **Demand (kVA)** column shows the load's demand kVA, or its connected kVA when no demand kVA is recorded — the same precedence the panel kVA totals use. A load that records only kW is never shown under the kVA header and no power factor conversion is assumed: its Demand (kVA) cell is left blank and a **Notes** row below the totals names the circuit and its kW value. Enter kVA or demand kVA on the load to include it. Demand and total cells are numbers rounded to 0.01.

The worksheet is named after the panel id. Characters Excel does not allow in sheet names (`: \ / ? * [ ]`) are replaced with `-`, leading and trailing apostrophes are removed, and the name is shortened to 31 characters, so any panel id exports. The download file name replaces characters that are not allowed in file names with `_`.
