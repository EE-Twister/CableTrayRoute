# Protective Device Default-Library Research

Research date: **2026-07-16**  
Machine-readable inventory: [`protective-device-candidates.json`](protective-device-candidates.json)

## Outcome

The recommended research inventory contains **27 source-backed candidate families or exact
configurations**:

- 11 low-voltage circuit-breaker candidates;
- 4 low-voltage fuse families;
- 1 medium-voltage fuse family with official PDF and Excel TCC data;
- 5 feeder-protection relay families;
- 3 transformer/bus differential relay families; and
- 3 recloser controls.

The candidate file intentionally does **not** add these records to
`data/protectiveDevices.json`. Official ratings are sufficient to create an
inventory, but production TCC entries also need exact curve data, curve revision,
settings applicability, and independent review. Inventing a few representative
points would make arc-flash clearing times and coordination results unsafe.

## Candidate list

| Category | Source-backed candidates | Evidence level |
| --- | --- | --- |
| Molded-case breakers | Schneider PowerPacT B, J, L, P, R | Official ratings and TCC source located |
| Molded-case breakers | Eaton Power Defense PD2 `PDG23P0100E2MK`, PD5 `PDF53M1200E2MN` | Exact SKU ratings and frame TCC source located |
| Molded-case breakers | ABB SACE Tmax XT2 `1SDA075102R1`, Tmax XT5 family | Exact XT2 and family XT5 ratings verified; curve selection pending |
| Molded-case breakers | Siemens SENTRON 3VA5 `3VA5180-5EF31-0AA0`, 3VA6 family | Official ratings, setting ranges, and curve/manual sources located |
| Low-voltage fuses | Eaton Bussmann LPJ-SP and LPS-RK-SP | Official ratings, TCC, and current-limitation sources located |
| Low-voltage fuses | Mersen AJT and A6D-R | Official ratings; AJT curve source located, A6D-R curve selection pending |
| Medium-voltage fuses | S&C SMU-20 Standard Speed | Official minimum-melt and total-clearing PDF/Excel sources located |
| Feeder relays | SEL-751, ABB REF615, Siemens 7SJ82, GE Multilin 850 | Published curve families/settings located and suitable for equation-based implementation |
| Multifunction relay | Schneider PowerLogic P3 | Product/manual source located; exact model and application mode pending |
| Differential relays | SEL-787 family, SEL-487B, GE Multilin T60 | Current product characteristics verified; exact settings/manual revisions pending |
| Recloser controls | Eaton Form 6, SEL-651R, SEL-651RA | Official control-curve families located; controlled interrupter must be modeled separately |

`curve-source-located` means the manufacturer curve document or download location
is known, not that its points have been transcribed and approved. `formula-ready`
means published relay equation families/settings are available for a parametric
implementation. `ratings-verified` is intentionally more limited and cannot yet
support production clearing-time calculations.

## Current-library findings

`data/protectiveDevices.json` currently contains 23 records: 6 breakers, 3 fuses,
and 14 relay records. Two physical-device entries are explicitly labeled
`Sample Study`, and most manufacturer breaker/fuse curves contain only three to
five points with no source document, revision, voltage basis, or curve identifier.

The following data-model issues should be corrected before adding a large catalog:

1. **Interrupting rating must be voltage-specific.** A single `interruptRating`
   value is insufficient for AC/DC and 240/480/600 V applications.
2. **Relays do not interrupt fault current.** Relay records should set
   `interruptRating` to `null` or omit it. The relay operates a separately modeled
   breaker or recloser.
3. **AIC and short-time withstand are different ratings.** Do not copy AIC into
   `withstandRatingKA`. Withstand requires its own manufacturer value and duration.
4. **Breaker curves belong to a configuration.** Frame, sensor/rating plug, trip
   unit, protection functions, ampere rating, poles, and interrupt code can all
   affect the valid curve and settings.
5. **Fuse curves need both boundaries.** Coordination and arc-flash work should
   distinguish minimum-melt and total-clearing curves. Current-limiting analysis
   also needs peak let-through and clearing/pre-arcing I²t tables.
6. **Opening time must be explicit.** For relays and recloser controls, total
   clearing time is relay operate time plus output/contact delay, breaker relay
   time, mechanism time, and arcing time as applicable.
7. **Differential protection is not a TCC curve.** Transformer and bus
   differential elements need restraint pickup, slope, breakpoint, harmonic,
   zone, CT, and winding-compensation fields. Their backup overcurrent elements
   may use TCC equations, but the 87 element must have a separate characteristic.

## Required production fields

### Identity and applicability

| Field | Requirement |
| --- | --- |
| `id`, `type`, `vendor`, `series` | Stable normalized identity |
| `catalogNumber` / `tripUnitModel` | Exact SKU or exact configurable assembly |
| `lifecycleStatus`, `region` | Current/legacy and market applicability |
| `standards` | UL/CSA/IEC/IEEE basis with edition where available |
| `frequencyHz`, `poles` | Configuration applicability |

### Ratings

| Field | Requirement |
| --- | --- |
| `ratedVoltageVac`, `ratedVoltageVdc` | Separate AC and DC limits |
| `continuousCurrentA`, `frameA`, `sensorA`, `tripRatingA` | Do not collapse these into one value |
| `interruptingRatings[]` | Array keyed by voltage, AC/DC, standard, and rating type (AIR/Icu/Ics) |
| `makingCapacityKApeak` | When available for IEC duty checks |
| `shortTimeWithstand[]` | Current plus duration; never inferred from AIC |

### Protection settings

Use structured `{min,max,step,unit,basis}` objects for long-time pickup/delay,
short-time pickup/delay, I²t on/off, instantaneous pickup, ground-fault
pickup/delay, ZSI, neutral protection, and any arc-energy-reduction mode.
Discrete switch positions should remain arrays of actual supported values.

### Curve evidence

Every production curve should carry:

- manufacturer document title, number, revision/date, page, and curve number;
- whether it is minimum-melt, total-clearing, average, nominal, or tolerance band;
- current and time units, frequency, reference ambient, and scaling basis;
- extraction method (`manufacturer spreadsheet`, `equation`, or
  `digitized official PDF`), extraction date, and reviewer;
- upper and lower points when the source publishes a band; and
- formula coefficients and standard family when a curve is equation-based.

## Recommended implementation order

1. **Fuse data first:** S&C publishes Excel curve files, and Eaton/Mersen publish
   well-defined TCC and let-through documents. These are the lowest-risk physical
   devices to import accurately.
2. **Parametric relays second:** SEL-751, ABB REF615, Siemens 7SJ82, and GE
   Multilin 850 can use published equation families and setting ranges rather than
   sparse digitized curves.
3. **Differential relays third:** add the current SEL-787 family, SEL-487B, and
   GE Multilin T60 only after introducing a dedicated restraint-characteristic
   schema. Treat the existing SEL-387 as a legacy candidate pending review.
4. **Electronic MCCBs fourth:** start with exact configurations such as Eaton
   `PDG23P0100E2MK`, ABB `1SDA075102R1`, and Siemens
   `3VA5180-5EF31-0AA0`; then expand by trip unit and frame.
5. **Thermal-magnetic MCCBs fifth:** import manufacturer upper/lower bands for
   exact ampere ratings; do not assume one normalized curve scales across a frame.
6. **Reclosers last:** separate the electronic control curve from the compatible
   interrupter's continuous-current and interrupting-duty record.

## Suggested promotion gate

A candidate should enter `data/protectiveDevices.json` only when:

- identity and voltage-specific ratings are confirmed from official sources;
- an exact curve document/configuration is pinned;
- curve points or formula output reproduce at least three official spot checks;
- total-clearing versus minimum-melt semantics are correct;
- no relay record carries an interrupting rating;
- AIC and withstand are independently sourced;
- a second reviewer confirms the transcription; and
- automated tests verify monotonicity, interpolation, setting bounds, and a
  known clearing-time benchmark.

## Primary official sources

- Schneider Electric: [PowerPacT B](https://www.se.com/us/en/product-range/63534-powerpact-bframe-molded-case-circuit-breakers/), [J](https://www.se.com/us/en/product-range/60183-powerpact-jframe-molded-case-circuit-breakers/), [L](https://www.se.com/us/en/product-range/61214-powerpact-lframe-molded-case-circuit-breakers/), [P](https://www.se.com/us/en/product-range/1448-powerpact-pframe-molded-case-circuit-breakers/), [R](https://www.se.com/us/en/product-range/1855-powerpact-rframe-molded-case-circuit-breakers/), and [TCC download center](https://www.se.com/us/en/work/support/resources-and-tools/calculators-and-online-tools/time-current-curves/).
- Eaton: [Power Defense PD2 example](https://www.eaton.com/us/en-us/skuPage.PDG23P0100E2MK.html), [PD5 example](https://www.eaton.com/us/en-us/skuPage.PDF53M1200E2MN.html), [LPJ-600SP](https://www.eaton.com/us/en-us/skuPage.LPJ-600SP.html), and [LPS-RK-1SP](https://www.eaton.com/us/en-us/skuPage.LPS-RK-1SP.html).
- ABB: [Tmax XT range](https://electrification.us.abb.com/products/circuit-breakers/tmax-xt), [XT2 exact example](https://empower.abb.com/ecatalog/ec/EN_NA/p/1SDA075102R1), and [REF615 product guide](https://library.e.abb.com/public/94eba3ec6dde4261af4a510d76916e6d/REF615_pg_756379_ENu.pdf).
- Siemens: [3VA manual](https://support.industry.siemens.com/cs/attachments/90318775/3VA_manual_molded_case_circuit_breakers_en_en-US.pdf), [3VA5/3VA6 overview](https://support.industry.siemens.com/cs/attachments/109989141/SIE_BR_3VA56-UL.pdf?download=true), and [SIPROTEC 7SJ82 manual](https://cache.industry.siemens.com/dl/files/384/109742384/att_1113120/v1/SIP5_7SJ82-85_V09.30_Manual_C017-H_en.pdf?download=true).
- Mersen: [AJT600 with curve links](https://www.mersen.com/en/products/ajt-class-j-time-delay/ajt600) and [A6D-R](https://us.mersen.com/en/products/a6d-r-class-rk1-time-delay?page=1).
- S&C Electric: [official TCC PDF/Excel library](https://www.sandc.com/en/contact-us/time-current-characteristic-curves/).
- SEL: [SEL-751](https://selinc.com/products/751/), [SEL-787](https://selinc.com/products/787/), [SEL-487B](https://selinc.com/products/487B/), [SEL-651R documentation](https://selinc.com/products/651r/docs/), and [SEL-651RA](https://selinc.com/products/651RA/?vidId=137863).
- GE Vernova: [Multilin 850](https://www.gevernova.com/grid-solutions/automation/protection-control-metering/feeder-protection/multilin-850), [Multilin T60](https://www.gevernova.com/grid-solutions/automation/protection-control-metering/transformer-protection/multilin-t60), and [current manuals](https://www.gevernova.com/grid-solutions/resources?prod=850&type=3).
