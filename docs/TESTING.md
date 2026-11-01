# Testing and results

Last full run: 2026-11-01, Windows 11, Node 24.13.

| Suite | Command | Result |
| --- | --- | --- |
| Type check (strict) | `npm run build` | No errors |
| Unit and integration | `npm test` | 162 passed, 8 files, about 80 s |
| Browser, Chromium | `npm run test:e2e` | 15 passed |
| Browser, WebKit (Safari engine) | `npm run test:e2e` | 15 passed |
| Browser, Firefox | `npm run test:e2e:firefox` | **Not run.** Windows blocked the test browser from starting |
| Real Mach3 or machine | none | **Not run** |

Browser tests run against the production build, with the Content Security Policy and service worker active. The main flow also fails on any console error.

## Regression against the original engine

`tests/integration/regression.test.ts` runs the unchanged original engine and the new one side by side on the four real Ba+1 jobs:

- Parser output and parts are equal.
- TAP output is byte-identical, with no clamp zones and with two.
- SVG output is byte-identical.
- The contours match the FCNC-made TAP files within 0.6 mm.

These tests skip when the private customer files are absent, so a public checkout has fewer tests than the 162 above. Without those files, the count of passing tests alone says nothing about this comparison.

## Real job

On the 111 pieces of the Ba+1 job, at the default 5 mm gap with the two bottom clamp corners, a 3-second search gives 4 sheets, the same as the original engine and the hand layout. 78.96 m of wire path, 34.5% utilization, no validation errors.

Utilization is the letter area divided by the area of the sheets, including the partly used last sheet.

With same-height rows on the same job, at a 20 mm height tolerance: 5 sheets, no unplaced pieces, no validation errors. Row-by-row cutting gives 82.61 m of wire path, of which 4.79 m follows lines already cut. The shortest-path order on the same layout gives 78.40 m.

## Large dataset

407 pieces on 27 sheets, nested with paths built and validated: 7.3 seconds on the test computer, with a 3-second search.

## Coverage of the requested cases

| # | Case | Where |
| --- | --- | --- |
| 1 | Simple text curves | `svg-parser` shapes; browser main flow |
| 2 | Multiple shapes | `svg-parser` shapes; `mixed-shapes` pipeline |
| 3 | Holes | `svg-parser` holes; `toolpath` stroke |
| 4 | Compound paths | `svg-parser` holes |
| 5 | Rotations and transforms | `svg-parser` transforms |
| 6 | Units | `svg-parser` units and viewBox |
| 7 | Duplicates | `svg-parser` duplicates; browser report |
| 8 | Open contours | `svg-parser` duplicates and open contours |
| 9 | Unsupported elements | `svg-parser` unsupported; browser report |
| 10 | Multiple imports | `pipeline` multiple imports; browser keep-position |
| 11 | Multiple copies | `nesting` automatic; `pipeline`; browser undo and restore |
| 12 | Automatic nesting | `nesting` automatic |
| 13 | Keep position | `pipeline` mixed shapes; browser keep-position |
| 14 | Different sheet sizes | `nesting` sheet sizes |
| 15 | Rotation settings | `nesting` rotation |
| 16 | Clamp zones | `nesting` clamp zones; `toolpath` clamp zones |
| 17 | Multi-sheet | `nesting` multiple sheets; browser keep-position |
| 18 | TAP generation | `toolpath` TAP output; regression; browser main flow |
| 19 | SVG export | `export` SVG; regression |
| 20 | ZIP export | `export` ZIP; browser main flow |
| 21 | Project save and restore | `project-io`; browser reload and backup |
| 22 | Invalid machine settings | `toolpath` machine profile; browser invalid profile |
| 23 | Large datasets | `pipeline` large dataset |
| 24 | Same-height rows | `rows-cut`; browser rows test |
| 25 | Row-by-row cutting order | `rows-cut`; browser rows test |
| 26 | Editor playback and G-code sync | `rows-cut` editor motion; browser editor test |
| 27 | Project files from before these options | `project-io` |

## How the checks measure

- **No overlap, gaps, bounds and clamp zones**: measured on the final placed contours with exact distance functions, independently of the raster the nester used.
- **Holes preserved and paths connected**: every outer and hole vertex must appear on the path, and every bridge must be walked out and back.
- **Exported coordinates match the preview**: the TAP is parsed back and compared move by move, within the 0.01 mm the format holds.
- **TAP structure**: the checker has negative tests for missing feed, spindle or end marker, bad lines, duplicate line numbers and non-ASCII bytes.
- **PDF**: wrapper and cross-reference table checked by test. A generated report was also read with `pypdf` (2 A4 pages), and its pages were inspected by eye.

## Bugs these tests found

| Bug | Fix |
| --- | --- |
| A 200,000-element file hung the parser while the DOM was being built | Tags are counted before parsing |
| Very deep nesting crashed with a stack overflow | Reported as a too-complex file |
| `x="1e999"` let infinite coordinates into the geometry | Shape dropped and reported |
| Cached scripts were missed offline because of `Vary: Origin` | `ignoreVary` in the service worker |
| "Used area" was shown 100 times too large | Correct conversion to m² |
| A row raised beside one very tall letter let the next row overlap that letter, found on the real job | Rows only move down the sheet, and cannot rise past the middle of the row above |
| Row-by-row paths stopped one point short of the start | The way back now includes the start point |
