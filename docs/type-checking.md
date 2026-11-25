# Type checking

The project is plain JavaScript. `npm run typecheck` (part of `npm run lint`) runs the TypeScript compiler over the modules that opt in with `// @ts-check`, using JSDoc types. Nothing is compiled or emitted, and no runtime behavior changes.

## Why

Several of the bugs found in the November 2026 review were a producer and a consumer disagreeing on a field name: Load Flow results saved as `Vm` and read as `voltagePu`, Motor Starting results saved under `results[]` and read as top-level keys, arc-flash boundaries saved in mm and read as m. A checked shape catches that class of mistake when the code is written.

## How it is set up

- A module is checked when its first line is `// @ts-check`. `tsconfig.json` has `checkJs` off and a broad `include`, so everything is parsed (for imports) but only opted-in files report errors. Run `npm run typecheck` to see them; it takes a few seconds.
- `types/project.d.ts` holds the shared shapes (`Cable`, `Tray`, `StudyAssessment`, `ShortCircuitResult`, `ArcFlashResult`, `BarRow`, `ChartReadiness`). Fields are optional because saved projects come from many revisions; the shapes document what consumers read.
- `strict` and `strictNullChecks` are off for now. Turn them on once the checked set is clean enough to absorb them.
- Checked today: the schedule workflow, tray fill, route results, cable operating voltage, arc-flash units, study lifecycle / result context / export metadata, the voltage-drop study, the project report and report package builders, the supplemental report sections, cost estimate, the TCC auto-coordination and CTI report, the report exporters, the result charts, and the short-circuit export table.
- Not checked yet (each has a batch of real type drift to resolve first): `analysis/designRuleChecker.mjs` (finding severity needs a literal union), `analysis/autoSize.mjs`, `analysis/arcFlash.mjs`.

What the checker found while these were opted in: JSDoc blocks attached to the wrong function (`parsePricingCSV`, `downloadCSV`), result and finding typedefs missing fields the code returns, and report entry points whose documented parameters were out of date.

## Adding a module

1. Put `// @ts-check` on the first line.
2. Annotate its exported functions with JSDoc, referencing the shared shapes:

   ```js
   /**
    * @param {import('../types/project').Cable[]} cables
    * @returns {{ total: number, scheduleReady: number }}
    */
   ```

3. Run `npm run typecheck` and fix what it reports. Prefer a typed parameter or a `/** @type */` cast over `// @ts-ignore`.
4. If a shape is missing a field the code reads, add the field to `types/project.d.ts` instead of widening to `any`.

## Next steps

Opt in the study result producers (`analysis/shortCircuit.mjs`, `analysis/loadFlow.js`), then turn on `strictNullChecks` for the files that are already clean.
