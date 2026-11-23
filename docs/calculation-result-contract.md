# Calculation result contract

The ampacity, conductor-sizing, and voltage-drop paths expose a shared
`resultContract` alongside their existing scalar fields. The contract makes a
number traceable without implying that it is an issued engineering result.
This reviewed scope is screening only; it is not licensed-engineer approval,
code-compliance certification, or installation acceptance.

Each contract contains:

- `value`: a finite numeric result when evaluated, otherwise `null`;
- `units`: the value unit (`A` for ampacity/sizing and `%` for voltage drop);
- `validity`: `evaluated` or `unevaluated`;
- `inputSources`: where current, voltage, cable data, conductor tables, and
  impedance came from (for example, Cable Schedule, Load Flow, or a table);
- `assumptions`: phase count, parallel conductors, power factor, ambient and
  temperature rating, conduit material, and any impedance override used;
- `modelLimits`: constraints such as the supported ambient correction table,
  voltage-drop limit, screening model, and radial-only topology;
- `warnings`: deduplicated missing-input, unsupported-model, stale-source, or
  topology messages; and
- `inputFingerprint`: a fingerprint of the normalized inputs used to produce
  the result.

An unevaluated result must remain visibly unevaluated even when a legacy
scalar field is present. Missing or invalid current, voltage, length, phase,
conductor data, or impedance produces `value: null`; a requested voltage-drop
limit is only satisfied by a finite evaluated drop. Ampacity correction is
fail-closed outside the supported ambient-temperature table range. A load-flow
source is eligible only when it converged, is not marked stale, and its saved
provenance/fingerprint matches the current study inputs; otherwise the study
can use valid schedule/load inputs or reports missing inputs. Voltage-drop
path results support radial topology only. Multiple upstream parents and
cycles are diagnosed as unsupported, so the affected path cannot be presented
as a valid combined result.

Sizing and reporting keep the installed cable separate from a recommended
candidate. `selectedAmpacity*` and `selectedVoltageDrop*` describe the cable
already in the schedule. `requiredSize`, `recommendation`, and
`recommendedVoltageDrop` describe a candidate produced by the sizing path.
Passing or failing a limit is meaningful only when the corresponding result
is evaluated; an unevaluated constraint cannot be rendered as a clean pass.

The sizing CSV exports scalar summary columns plus serialized assumptions,
model limits, warnings, input sources, validity, units, and fingerprints for
the voltage-drop and ampacity contracts. Project reports carry the same
actual row values, per-row provenance fields, and study warnings, allowing a reviewer to identify
the source and age of a displayed value. Existing scalar wrappers remain for
backwards compatibility (`calculateVoltageDrop()` still returns a number or
`null`, and sizing summaries retain established fields); consumers should use
the contract when deciding whether a result is valid or comparable.

## Saved-study lifecycle

Saved studies retain their native result maps and arrays. A separate version 2
record in `settings.studyProvenance[studyKey]` identifies the calculation run.
This lifecycle applies to the study pages and embedded One-Line calculations;
it complements the quantity-level contracts above.

Controllers call `captureStudyRunContext(studyKey, options)` before calculation
and `saveStudyResult(studyKey, result, context)` after it. The captured context
includes the project and scenario, normalized project inputs, manual inputs,
solver options, relevant settings, upstream result/provenance fingerprints,
calculation and model revisions, and declared assumptions and limitations.
The saved record also fingerprints the result itself. A run cannot save into
a different active project or scenario. Result and provenance changes share
the same undo/redo operation and event batch.

`setStudies()` is for bulk restoration and historical metadata changes. It
does not certify a calculation run. Changed payloads without their original
provenance become unknown. Reopening, importing, or cloning an old result does
not manufacture fresh provenance; a new calculation is required when its
context no longer matches.

`getStudyAssessment()` and `getStudyAssessments()` distinguish:

- **Validity:** evaluated, partially evaluated, unevaluated, or unknown.
- **Freshness:** current, stale, or unknown.
- **Evaluation:** passing, failing, mixed, or unknown engineering checks.
- **Eligibility:** an evaluated result with a matching current context and
  eligible upstream calculations. Eligibility is not an engineering approval.

An evaluated limit failure remains a real result for review. Missing inputs,
failed convergence, and unknown provenance cannot become clean passes.
Historical numbers may be retained for inspection, with their status and
warnings. Downstream project adapters must check the assessment for the exact
study used as an input. A current result from another study does not validate
a stale source.

Validation also qualifies saved TCC duty and reliability caches. An old empty
violation list cannot imply a current pass: validation displays a historical
result warning until an eligible rerun is available. TCC duty runs record the
plotted equipment context, selected devices, view options, short-circuit source,
and relevant TCC/catalog settings. A run replaces the derived cache for its
plotted context instead of attaching new provenance to older sibling rows.

Pages containing several studies track edits by result scope. Rerunning an
independent calculation does not clear another calculation's stale state.
Linked sizing forms refresh their project inputs before calculation. Imported
Frequency Scan and Transient Stability inputs allow manual completion and
tuning, but require another import if the recorded project source or upstream
study changes. Current-page reports such as Equipment Evaluation and Ground
Grid clear affected results and exports when their source inputs change.

Controllers that produce qualified historical review reports, including IEC
60909, may export stale or unevaluated rows with their status, missing numeric
values, warnings, and original provenance. Other study exports remain gated
until a current run is available. A historical review export does not make its
results eligible for downstream calculations or project issuance.

Scenario comparisons assess each scenario against its own saved project data
and settings. Reports and standalone exports retain the run time, validity,
freshness, input sources, options, assumptions, warnings, limitations, and
provenance. Calculation/model revision constants must be updated when a solver
or its source-normalization contract changes so older results cannot appear
current under a new calculation version.

The implementation review and acceptance evidence are recorded in
[Study validity and freshness verification](study-lifecycle-verification-2026-09-17.md).
