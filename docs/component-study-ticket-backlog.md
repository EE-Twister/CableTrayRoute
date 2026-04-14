# Component Study Backlog Tickets

This ticket set translates the current component/attribute gaps into implementation-ready work items for one-line modeling and study workflows.

## Ticket format
- **Component**: The symbol/model that must be added (or normalized) in the library and UI.
- **Study impact**: Which studies require the component data.
- **Required attributes**: Minimum schema keys required for practical engineering use.
- **Acceptable outcome**: Definition of done for the ticket.

---

## CTR-COMP-001 — Add `battery` one-line component
**Component:** Stationary battery / battery bank.

**Status:** Completed on April 14, 2026.

**Study impact:** DC short circuit, DC arc flash, battery / UPS sizing, time-series dispatch.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `nominal_voltage_vdc`, `cell_chemistry`, `cell_count`
- `capacity_ah`, `internal_resistance_ohm`, `initial_soc_pct`
- `min_soc_pct`, `max_charge_current_a`, `max_discharge_current_a`

**Acceptable outcome:**
- Battery appears in one-line palette with icon + IEC icon where applicable.
- Component can be placed, edited, persisted, exported, and re-imported.
- Validation catches missing required battery fields.
- DC and battery studies can consume the saved battery attributes without fallbacks.

---

## CTR-COMP-002 — Add `panel` component with feeder/load roll-up metadata
**Component:** Distribution panelboard.

**Status:** Completed on April 14, 2026.

**Study impact:** Load flow, short-circuit, arc flash labeling, panel schedules.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `rated_voltage_kv`, `phases`, `bus_rating_a`, `main_device_type`
- `main_interrupting_ka`, `grounding_type`, `service_type`

**Acceptable outcome:**
- Panel subtype is available in one-line and schedule exports.
- Panel properties persist in project storage and map to schedule fields.
- Arc flash and short-circuit modules can read panel rating + interrupting data.

---

## CTR-COMP-003 — Add `switchboard` / switchgear lineup component
**Component:** LV/MV switchboard block.

**Status:** Completed on April 14, 2026.

**Study impact:** Short circuit, arc flash, protection coordination, protection zones.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `rated_voltage_kv`, `phases`, `bus_rating_a`
- `withstand_1s_ka`, `interrupting_ka`, `arc_resistant_type`
- `maintenance_mode_supported` (boolean)

**Acceptable outcome:**
- Switchboard can host/represent main protective device context in the one-line.
- Study data blocks can display switchboard withstand/interruption metadata.
- Export/import round-trips all fields losslessly.

---

## CTR-COMP-004 — Add `meter` component (PQM / energy meter)
**Component:** Revenue or power quality meter.

**Status:** Completed on April 14, 2026.

**Study impact:** Harmonics, load profile calibration, energy analytics, reporting.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `meter_class`, `ct_ratio`, `pt_ratio`, `sample_rate_hz`
- `supports_thd`, `supports_flicker`, `supports_waveform_capture` (booleans)

**Acceptable outcome:**
- Meter symbol can be inserted on feeders/buses.
- Meter attributes persist and are available to harmonics/power-quality reports.
- Validation enforces CT/PT ratio completeness when meter is enabled for studies.

---

## CTR-COMP-005 — Add `cable` network component for explicit inter-device segments
**Component:** Cable segment/feeder segment in one-line graph.

**Status:** Completed on April 14, 2026.

**Study impact:** Voltage drop, short circuit (R/X path), DC fault, ampacity validation.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `length_ft`, `material`, `insulation_type`, `temp_rating_c`
- `size_awg_kcmil`, `parallel_sets`, `r_ohm_per_kft`, `x_ohm_per_kft`

**Acceptable outcome:**
- Cable objects can be added between components and connected to ports.
- Study solvers consume cable impedance/length instead of default assumptions.
- Cable values synchronize to cable schedule/export without duplicate entry.

---

## CTR-COMP-006 — Normalize protective component attributes (`breaker`, `fuse`, `relay`, `recloser`)
**Component:** Existing protection devices with incomplete common schema.

**Status:** Completed on April 14, 2026.

**Study impact:** TCC, short circuit, selective coordination, arc flash clearing time.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `rated_voltage_kv`, `phases`, `interrupting_rating_ka`
- `pickup_amps`, `time_dial_or_tms`, `curve_family`
- `ground_fault_enabled`, `ground_pickup_a`, `ground_time_delay_s`

**Acceptable outcome:**
- All protective subtypes share a common baseline schema for TCC ingestion.
- Existing diagrams migrate without data loss.
- TCC input forms auto-populate from component fields and report missing data.

---

## CTR-COMP-007 — Add differential protection relay component (`relay_87`)
**Component:** Bus/transformer/generator differential relay.

**Status:** Completed on April 14, 2026.

**Study impact:** Differential protection characteristic plotting and settings checks.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `protected_zone_type` (`bus`, `transformer`, `generator`)
- `pickup_pu`, `slope1_pct`, `slope2_pct`, `breakpoint_pu`
- `inrush_blocking_enabled`, `second_harmonic_pct`

**Acceptable outcome:**
- Differential relay appears in library and can be linked to protected assets.
- Study engine can generate and render dual-slope differential characteristic data.
- Validation prevents running differential study with incomplete settings.

---

## CTR-COMP-008 — Add DC bus component (`dc_bus`)
**Component:** Dedicated DC distribution bus.

**Status:** Completed on April 14, 2026.

**Study impact:** DC short circuit, DC arc flash, BESS/UPS network studies.

**Required attributes (minimum):**
- `tag`, `description`
- `nominal_voltage_vdc`, `grounding_scheme`
- `max_continuous_current_a`, `short_circuit_rating_ka`

**Acceptable outcome:**
- DC buses are visually distinct from AC buses in one-line.
- DC studies can scope and calculate against DC bus nodes explicitly.
- Bus-level reports include DC voltage and fault ratings.

---

## CTR-COMP-009 — Add inverter/converter detail expansion (`pv_inverter`, `bess_inverter`, `rectifier`)

**Status:** Completed on April 14, 2026.
**Component:** Power electronic conversion devices.

**Study impact:** Harmonics, DER dispatch, volt-var behavior, fault current contribution.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `rated_kw`, `rated_kva`, `ac_voltage_kv`, `dc_voltage_v`
- `fault_current_multiple`, `thd_current_pct`, `control_mode`
- `volt_var_enabled`, `freq_watt_enabled`

**Acceptable outcome:**
- Converter family is represented as selectable subtypes in the library.
- Harmonic and DER studies consume converter-specific parameters.
- Unsupported control modes are flagged before study execution.

---

## CTR-COMP-010 — Add study-ready generator model attributes (`synchronous`, `asynchronous`)
**Component:** Existing generator components with expanded study schema.

**Status:** Completed on April 14, 2026.

**Study impact:** Short circuit, transient stability-lite, motor starting, dispatch.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `rated_mva`, `rated_kv`, `xdpp_pu`, `xdp_pu`, `xd_pu`
- `h_constant_s`, `governor_mode`, `avr_mode`
- `min_kw`, `max_kw`, `ramp_kw_per_min`

**Acceptable outcome:**
- Generator components expose advanced fields in properties panel.
- Existing projects migrate with safe defaults for newly-added fields.
- Short-circuit and dispatch calculations use generator dynamic/fault parameters.

---

## CTR-COMP-011 — Add capacitor/reactor bank tuning attributes
**Component:** `shunt_capacitor_bank` and `reactor` subtype enhancement.

**Status:** Completed on April 14, 2026.

**Completion note (April 14, 2026):** Validation now enforces required capacitor/reactor tuning metadata and checks `tuning_hz` / `reactor_pct` when `detuned` is enabled.

**Study impact:** Harmonic resonance scan, PF correction, capacitor bank sizing checks.

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `rated_kvar`, `rated_kv`, `steps`
- `detuned` (boolean), `tuning_hz`, `reactor_pct`
- `switching_transient_class`

**Acceptable outcome:**
- Capacitor/reactor components can model detuned vs non-detuned banks.
- Harmonic study uses tuning data and surfaces resonance risk warnings.
- Capacitor bank report includes selected tuning metadata.

---

## CTR-COMP-012 — Cross-cutting schema baseline for all one-line components
**Component:** Shared attribute baseline across all subtypes.

**Status:** Completed on April 14, 2026.

**Completion note (April 14, 2026):** Updated `scripts/componentCoverageAudit.mjs` to canonicalize subtype aliases (e.g., `synchronous`/`asynchronous` → `generator`, inverter families, breaker/fuse aliases), aggregate attribute coverage across matching definitions, and align baseline voltage checks with the shared schema (`rated_voltage_kv` for AC assets, `nominal_voltage_vdc` for DC assets).

**Study impact:** All studies (consistency, validation, report reliability).

**Required attributes (minimum):**
- `tag`, `description`, `manufacturer`, `model`
- `rated_voltage_kv` (or `nominal_voltage_vdc`), `phases`
- `commissioning_state`, `service_status`, `notes`

**Acceptable outcome:**
- A reusable schema helper enforces baseline fields for every component subtype.
- Component editor UI shows consistent required/optional behavior.
- Reports can safely assume baseline metadata exists for every modeled asset.

---

## Recommended implementation order
1. CTR-COMP-012 (baseline schema enforcement)
2. CTR-COMP-001, 008, 009 (DC/DER foundation)
3. CTR-COMP-005, 006 (network + protection core)
4. CTR-COMP-002, 003, 004 (operational metadata and reporting)
5. CTR-COMP-007, 010, 011 (advanced study fidelity)
