# Type checking

The project is plain JavaScript. `npm run typecheck` (part of `npm run lint`) runs the TypeScript compiler over a growing allow-list of modules, using JSDoc types. Nothing is compiled or emitted, and no runtime behavior changes.

## Why

Several of the bugs found in the November 2026 review were a producer and a consumer disagreeing on a field name: Load Flow results saved as `Vm` and read as `voltagePu`, Motor Starting results saved under `results[]` and read as top-level keys, arc-flash boundaries saved in mm and read as m. A checked shape catches that class of mistake when the code is written.

## How it is set up

- `tsconfig.json` has `checkJs` on and an explicit `include` list. A file is checked only when it is listed.
- `types/project.d.ts` holds the shared shapes (`Cable`, `Tray`, `StudyAssessment`, `ShortCircuitResult`, `ArcFlashResult`, `BarRow`, `ChartReadiness`). Fields are optional because saved projects come from many revisions; the shapes document what consumers read.
- `strict` is off and `strictNullChecks` is off for now. Turn them on per file group once the group is clean.

## Adding a module

1. Add the file to `include` in `tsconfig.json`.
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

Extend `include` toward the study result producers and the report builders (`analysis/projectReport.mjs`, `reports/`), then turn on `strictNullChecks` for the files that are already clean.
