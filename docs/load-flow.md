# Load Flow

The Load Flow study uses the active one-line diagram to build buses, branches, loads, and generation.

## Solver selection for large systems

The study automatically uses a backward/forward-sweep solver when a balanced network has at least 250 buses and is a supported radial tree: one slack bus, PQ buses, a common voltage base, non-zero series impedances, and no taps, shunts, PV buses, or active IBR Volt-VAR controls. This path scales linearly with the radial branches and is intended for large utility-fed distribution systems.

Newton-Raphson remains the default for smaller cases and is always retained for meshed networks, PV buses, multiple voltage bases, transformer taps, shunts, ideal ties, and active IBR controls. Results expose the selected method as `solver`; reports and downstream consumers otherwise receive the same bus, branch-flow, loss, source, warning, and convergence fields.

The enforced large-project contract converts and solves one common utility bus, 1,000 downstream buses, and 2,000 attached devices in less than 2 seconds. A numerical regression runs the same supported network through both solvers and compares every bus voltage magnitude and angle plus real and reactive losses.

## Balanced three-phase study

**Balanced three-phase** is selected by default. The solver uses the total kW and kvar on each connected bus as a single three-phase load.

## A/B/C phase study

Clear **Balanced three-phase** to solve each phase independently. For every load or generation component, use **Phase Assignment** in One-Line Properties when its total kW/kvar belongs on a specific phase or phase pair.

- Leave **Phase Assignment** blank when the component is a balanced three-phase total; its total demand is divided equally across A, B, and C.
- Assign `A`, `B`, or `C` for a single-phase total.
- Assign `A + B`, `A + C`, or `B + C` for a two-phase total; the total is divided equally across the selected phases.
- Imported or programmatic load payloads may also use explicit per-phase records, such as `load.phases.A = { kw, kvar }`. Missing phase records are treated as zero, not as a duplicated balanced load.

This keeps a 90 kW / 30 kvar unassigned load at 30 kW / 10 kvar on each phase in an A/B/C study, rather than incorrectly applying 90 kW / 30 kvar to every phase.

## Transformer tap review

The One-Line **Studies → Review Transformer Taps** action provides a constrained what-if review for transformers with LTC metadata. It reuses the Load Flow solver on cloned One-Line snapshots and evaluates only the configured permitted range and discrete step. The review reports the controlled secondary-bus voltage, voltage change from the current case, system voltage range, convergence, and voltage-limit violations.

The current transformer setting is never changed by running the review. A reviewer must choose **Approve & Apply** for a feasible recommendation. Approval rechecks that the One-Line revision is unchanged, writes the selected ratio through the existing One-Line setter, and therefore creates the normal One-Line revision-history entry. The saved review remains in `studyResults.transformerTapOptimization` with its source and applied revisions.

For the shipped two-winding transformer metadata, the relevant fields are `ltc.enabled`, `ltc.min_tap_volts`, `ltc.max_tap_volts`, `ltc.step_percent`, and `ltc.setpoint_pu`. Optional `ltc.min_voltage_pu` and `ltc.max_voltage_pu` values constrain that transformer's feasible cases; otherwise the workflow uses 0.95–1.05 pu. An explicit disabled state is always honored. A transformer without a complete enabled range and positive step, valid voltage limits, or a resolvable controlled bus is shown as review-ineligible; no tap range or controlled-bus voltage is inferred from unrelated system buses.

This slice follows the common base-package workflow evidenced by ETAP's Load Flow tutorial and product documentation: evaluate LTC/tap settings against a regulated bus and inspect the resulting voltage. It also follows SKM Power*Tools guidance that transformer tap settings affect the bus voltage profile and that transformer taps are represented in load-flow and unbalanced-study models. See [ETAP Load Flow Analysis](https://etap.com/docs/default-source/faqs-tutorials/load-flow-analysis.pdf?sfvrsn=7c0fb67f_10), [ETAP Load Flow software](https://etap.com/load-flow/load-flow-software-reporting), [SKM DAPPER load-flow features](https://www.skm.com/DAPPER.html), and [SKM unbalanced/single-phase study features](https://skm.com/phaseStudies.html).
