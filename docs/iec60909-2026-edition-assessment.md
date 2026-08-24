# IEC 60909-0:2026 Edition Assessment

**Assessment date:** 2026-08-12  
**Application implementation:** IEC 60909-0:2016  
**Current IEC publication:** IEC 60909-0:2026, edition 3.0  
**Disposition:** Version-pinned 2016 regression only; 2026 compliance is not claimed

## Lifecycle finding

IEC lists IEC 60909-0:2026 as edition 3.0, published 2026-07-23. Its public scope covers short-circuit calculations in low- and high-voltage three-phase AC systems at 50 Hz or 60 Hz. The repository calculation engine, interface, reports, comments, and existing benchmark explicitly implement IEC 60909-0:2016.

Primary lifecycle sources:

- [IEC 60909-0:2026 publication page](https://webstore.iec.ch/en/publication/68454)
- [IEC 60909-0:2016 withdrawn-edition page](https://webstore.iec.ch/en/publication/24100)

## Controlled boundary

The public IEC catalogue establishes the edition change and broad scope, but it does not provide the normative equations, tables, figures, or a clause-by-clause redline. A technically defensible edition delta therefore requires licensed access to both editions or an authorized IEC redline. Without that text, this assessment does not infer that a 2016 equation, factor, table, or scope limitation is unchanged in 2026.

Until the delta is completed:

- Results are screening calculations for projects whose basis explicitly adopts IEC 60909-0:2016.
- Reports and UI must retain the 2016 edition label and the 2026 non-claim warning.
- The version-pinned benchmark may detect regressions in the implemented 2016 path, but it is not a 2026 validation benchmark.
- A project requiring the current IEC edition must be evaluated outside this application or by a qualified reviewer with the licensed 2026 text.

## Licensed-text delta matrix

| Application function | Implemented 2016 basis | Required 2026 review before promotion |
|---|---|---|
| Voltage factor | Table 1 lookup | Compare voltage bands, tolerances, and maximum/minimum factors |
| Peak factor | Kappa equation and X/R handling | Compare equation, bounds, and network method applicability |
| Transformer correction | K_T path | Compare equation inputs, transformer classes, and exceptions |
| Generator correction | K_G path | Compare near/far-from-generator definitions and machine factors |
| Breaking current | Mu decay treatment | Compare decay curves/equations, minimum delay, and source apportionment |
| Thermal equivalent | Simplified m+n method | Compare equations, time range, and applicability constraints |
| Unbalanced faults | Sequence-network implementation | Compare fault definitions, grounding treatment, and zero-sequence rules |
| Scope and exclusions | 2016 engine limitations | Compare 2026 voltage/frequency scope and explicit exclusions |

## Acceptance procedure

1. Obtain authorized 2016 and 2026 normative text or an IEC-issued redline.
2. Record every changed clause, equation, table, figure, definition, and scope statement affecting the matrix above.
3. Map each change to code, inputs, outputs, reports, and documentation.
4. Implement the reviewed delta without overwriting the 2016 method if projects still require that edition.
5. Add named, edition-specific independently derived or published benchmarks for every affected calculation family.
6. Run unit, integration, build, and applicable browser evidence; archive results with the review record.
7. Require qualified human review before changing the application claim from version-pinned 2016 screening to 2026 readiness.

No reviewer identity, approval date, or engineering sign-off is asserted by this document.
