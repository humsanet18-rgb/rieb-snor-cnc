# Technical audit of the original app

Subject: the single-file `RiebSnor.html` (source `src/engine.js` and `src/app.html`), about 900 lines of engine and 500 lines of interface.

The original is kept unchanged at `tests/fixtures/legacy-engine.cjs`. The regression suite compares the new engine with it.

## Architecture

| Layer | Original | Problem for a public product |
| --- | --- | --- |
| Packaging | One HTML file with everything inline | Fine for one workshop, but no tests, types or modules |
| State | Global variables | No undo, hard to test |
| Nesting | Runs on the main thread in `async` slices | The page can stutter, and work cannot really be stopped |
| Storage | `localStorage` for settings | No projects; storage is small and can fail silently |
| Language | Khmer only | Not usable by others |

## Features that worked and were preserved

Polygon flattening of SVG paths, outer and hole detection by containment, duplicate removal, copies, sheet and gap settings, rotation, clamp corner zones, the start box, the continuous single stroke, bridges, preview, TAP export byte-compatible with FCNC, sheet SVG export, ZIP export, the original-position mode and fill by rows or columns.

The functions `parseSVG`, `buildParts`, `rasterize`, `makeVariants`, `greedyPass`, `nest`, `buildStroke`, `simplifyPath`, `toTAP`, `toSVG` and `makeZip` were ported to typed modules under `src/engines/`. Their algorithms were kept. The port was proven by regression, not by reading: on four real customer files the parser output, the parts, and the TAP and SVG files are byte-identical to the original, with and without clamp zones.

## Known limitations found

- The SVG reader walked only a fixed set of elements and said nothing about the rest, so text not converted to curves disappeared without warning.
- `viewBox` was read with no `preserveAspectRatio` handling, and CSS support was limited to one class pattern.
- `<use>`, nested `<svg>`, rounded rectangles and units other than the file's own were not handled.
- There was no cancel, no undo, no project files and no validation before export.

## Potential bugs

| Finding | Effect | Resolution |
| --- | --- | --- |
| Gap dilation radius rounded down | Two pieces could end up slightly closer than the gap | `gapRadius` adds a safety term, and tests measure real contour distance |
| `isNaN`-style number scan treated `1e-5` as a command letter | Paths with exponents broke | Grammar scanner in `path.ts` |
| Arc flags without separators (`a40 40 0 1180 0`) | Shape distorted | Flags are read character by character |
| Recursive tree walk in stroke building | Stack overflow on a very long chain | Explicit stack |
| `toLocaleString` can emit U+202F | Non-ASCII byte in a TAP header | Manual `tapDate` formatter |
| Reference file with a `<use>` cycle | Hang | Cycle and depth limits |
| Overlap of an island in a hole bridged across the ring | Wire crossed foam | `allowed()` fix, kept and tested |

## Performance bottlenecks

- Nesting cost grows with parts × variants × positions. It is bounded by the search time, and a raster collision test keeps each check cheap.
- The bridge search uses exact nearest pairs over densified contours, which grows with the square of the vertex count on a sheet.
- The preview redrew every piece on each interaction. The new canvas memoizes pieces and only changes a group transform for zoom and pan.

## Security risks

| Risk | Original | New version |
| --- | --- | --- |
| Script inside an SVG | Parsed with `DOMParser`, not rendered, but not reported | Same safe parse, script reported, content never inserted into the page |
| Entity expansion bomb | Not limited | Entity and tag counts refused before parsing |
| Huge files | Not limited | 20 MB, element and point limits, stack overflow handled |
| HTML injection through names | Possible through `innerHTML` | React text nodes only; no `dangerouslySetInnerHTML` anywhere |
| Untrusted project file | Not applicable | Every field rebuilt and checked; unknown keys dropped |
| Third-party scripts | None | None; strict Content Security Policy; fonts are bundled |

## Recommended improvements, and their status

| Recommendation | Status |
| --- | --- |
| Move nesting to a Web Worker, cancel by terminating it | Done |
| Report everything skipped during import | Done |
| Validate before export and require operator confirmation | Done |
| Project files, IndexedDB autosave, undo | Done |
| True no-fit-polygon nesting instead of raster | Not done; see [known limitations](KNOWN_LIMITATIONS.md) |
| Kerf compensation | Not done, deliberately; see [known limitations](KNOWN_LIMITATIONS.md) |
