# Study Result Readiness

Load Flow, Voltage Drop, Reliability, and the advanced power-system studies distinguish a valid study result from an incomplete or failed attempt.

## Load Flow

Before solving, the page checks for at least two buses, a connected branch, a source/slack bus, positive bus base voltages, and isolated buses. A failed or non-converged solve is shown as **No valid load flow result**. Numerical voltage, flow, and source tables are suppressed so unstable solver values are not mistaken for engineering results.

Only a converged result with finite bus voltages between 0 and 2 pu is saved. PDF export is a separate action and is enabled only for that valid result.

## Reliability

Every eligible One-Line component must have MTBF greater than zero, MTTR greater than or equal to zero, a source reference, and a source date. The page reports calculation coverage and source-evidence coverage and identifies the components and fields that are missing.

Until coverage is complete, system and service availability remain unavailable rather than being displayed as 100%. No incomplete result is saved, exported, or represented as a complete reliability study.

## Voltage Drop

Every cable must have usable length and conductor data plus current and voltage from an explicit cable value, a valid converged Load Flow result, or a matched Load List record. The page identifies the source used by each circuit.

Only complete individual and assembled feeder-plus-branch path results are saved. A saved result becomes stale when the Cable Schedule, Load List, or Load Flow source changes. Applying a conductor recommendation updates only the selected Cable Schedule rows and immediately reruns the study.

## Advanced power-system studies

- **Quasi-Dynamic Load Flow** requires a complete One-Line model and 100% timestep convergence before saving or export.
- **Probabilistic Load Flow** requires a complete model, at least 95% scenario convergence, and a minimum useful sample count.
- **N-1 Contingency** requires a converged base case and at least one branch contingency. Only a valid result can be exported.
- **Voltage Stability** requires converged base operating points in both the P-V and Q-V sweeps. A nonconverged operating point is shown but not saved.
- **Optimal Power Flow** saves and exports only a feasible dispatch. An infeasible capacity balance remains a visible screening result.
- **Frequency Scan** and **Transient Stability** save run metadata and the source fingerprint used to produce the result.

Voltage Stability, Optimal Power Flow, Frequency Scan, and Transient Stability can import available project data. The import banner identifies what was populated and which engineering inputs remain manual. Saved project-derived results are marked stale when their One-Line, cable, or upstream Short Circuit source changes.

Advanced results appear as dedicated Project Report sections. Each section states whether it is a valid saved run or a legacy/unverified result, records the input source and run time, and carries solver warnings into the report.
