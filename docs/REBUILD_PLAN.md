# រៀបអក្សរ CNC — rebuild plan (Phase 1: audit and plan)

Date: 2026-11-02. Baseline: commit `0ecacaa` on `main`.

This document answers Phase 1 of the master brief: what the application is today, what the brief asks for that is missing, how the missing parts will be added without breaking the CNC pipeline, and in what order.

---

## 1. Repository audit

### What the application is

A browser-only (offline-capable PWA) tool for a hot-wire foam workshop. React 19 + TypeScript, Vite, no server. About 10,600 lines of source.

Pipeline today:

```
SVG file ──parse──► polygons ──buildParts──► Design.parts ──nest (worker)──► Layout
Khmer text ──browser render──► pixels ──trace──► polygons ─┘                     │
                                                                                 ▼
                             TAP (Mach3) ◄──toTAP── wire stroke ◄──buildCut/Stroke
                                   │
                                   └──► parseTap + checkTap + validate ──► download gate
```

| Layer | Where | Notes |
|---|---|---|
| SVG parser | `src/engines/svg-parser` | Paths, shapes, transforms, `<use>`, CSS subset. **Flattens every curve to straight segments** (about 0.04 mm). |
| Geometry | `src/engines/geometry-engine` | Polygons, bboxes, point-in-polygon, distances. No Bézier, no booleans, no offset. |
| Text | `src/features/text`, `src/engines/text-engine/trace.ts` | The browser shapes Khmer correctly, then the result is **rasterised and traced** (marching squares). Reference glyph ក height is measured on the traced ink. Output is polylines, not curves. |
| Nesting | `src/engines/nesting-engine` (worker) | Raster nesting, same-height rows, keep-position, manual moves. |
| Toolpath | `src/engines/toolpath-engine` | One continuous wire stroke, bridges, cut orders, validation. No kerf, no lead-in/out. |
| G-code | `src/engines/gcode-engine/tap.ts` | FCNC-style TAP writer and an independent reader; pre-download checks. |
| UI | `src/app`, `src/features/*` | Dock, side panel, sheet canvas, properties, modal system with edit sessions, Shop module. |
| Storage | IndexedDB, `rieb-snor-project` JSON backups | Undo 40 steps, autosave. |

### Data model

`Project` holds `designs: Design[]`, each a list of **flattened polygons** (`Part.outers / holes`), plus nesting `settings`, `layouts`, the machine profile id. There is no editable vector document: once imported, a design cannot be node-edited, welded or re-typed.

### Health

| Check | Result (2026-11-02) |
|---|---|
| `tsc --noEmit` | Clean |
| Unit + integration (vitest) | 223 / 223 pass |
| End-to-end (Playwright, Chromium) | 55 / 55 pass; one unexplained single failure seen once in ~5 full runs |
| Firefox / WebKit | Not run on this computer |
| Real Mach3 / real machine | Never run |
| Bundle | One 632 kB JS chunk (180 kB gzip) |

### Problems found

| # | Problem | Severity |
|---|---|---|
| A1 | Text to curves is traced from pixels, so curve accuracy depends on render resolution and output is never true Bézier curves. | High for a typography product |
| A2 | No editable vector document; imported or converted shapes cannot be edited, welded, combined or offset. | High |
| A3 | No kerf compensation and no lead-in/out; letters come out smaller by half the kerf. | High for production quality (safety-relevant) |
| A4 | Overlapping contours from fonts or SVGs are reported, not welded. | Medium |
| A5 | Single large JS chunk; new engines must be loaded on demand. | Medium |
| A6 | Workshop dialogs stack (order → payment). | Low |
| A7 | Firefox/WebKit/real tablets untested. | Medium |

---

## 2. Feature inventory against the brief

Legend: **Have** = working and tested · **Part** = exists but limited · **New** = to build · **Engine** = needs a new engine (§3) · **Defer** = low value for foam CNC or needs physical testing first.

### Workspace (Parts 2, 5, 6, 9, 10)

| Brief item | Status | Plan |
|---|---|---|
| Top menu bar (File … Help, 13 menus) | Have (12; Effects with Phase 5) | Phase 2 |
| Main toolbar, customizable | Part (top bar actions) | Phase 2 |
| Categorized left toolbox | Part (dock, workflow tools only) | Phase 2–3 |
| Contextual properties panel, tabs, collapsible, resizable | Part (selection + totals, resizable) | Phase 2 shell, filled per phase |
| Rulers, grid, snap to grid, zoom, pan, fit, selection handles, context menu, marquee, multi-select | Have (sheet canvas) | Reuse in the design canvas |
| Snap to object / node, smart guides | New | Phase 3 |
| Large canvas with page boundaries, multiple pages | New | Phase 3 |
| Khmer / English, light / dark | Have | Keep |
| Beginner / Advanced mode | New | Phase 2 |
| Tool search / command palette, tooltips, shortcuts | Part (tooltips, some shortcuts) | Phase 2 |
| Shortcut customization, favorite tools | Part (pinning) | Phase 2 |
| Recent projects, autosave, recovery | Have | Keep |
| Object and layer locking | New | Phase 3 |

### Vector (Parts 2C, 4)

| Brief item | Status | Plan |
|---|---|---|
| Pick, marquee, multi-select, pan, zoom | Have on sheet | Phase 3 on the design canvas |
| Shape/node tool, add/delete/join nodes, break curve, line↔curve, smooth/symmetrical node | New, Engine | Phase 3 |
| Free transform, rotate, scale, mirror, skew, numeric transform, duplicate (numeric offset) | Part (move, rotate 90°, align in manual nesting) | Phase 3 |
| Rectangle, 3-point rectangle, ellipse, 3-point ellipse, polygon, star, spiral, grid, line, polyline, Bézier/pen, freehand | New | Phase 3 |
| Weld/union, difference, intersection, exclude, trim, combine, break apart | New, Engine | Phase 5 |
| Offset path, contour, outline (stroke to path), simplify | New, Engine | Phase 5 |
| Group/ungroup, order (front/back), layers | New | Phase 3 |
| Align / distribute (to selection, to page) | Part (sheet only) | Phase 3 |
| Fill, outline colour, stroke width, palette, eyedropper | New | Phase 3 (display only; the wire ignores colour) |
| Crop tool | New | Phase 5 (as a boolean with a rectangle) |
| Transparency, gradient | Defer | No meaning for a wire cut; display-only if requested |
| Smart drawing (shape recognition) | Defer | Low value; revisit after Phase 5 |

### Khmer typography (Part 3)

| Brief item | Status | Plan |
|---|---|---|
| Correct Khmer shaping (vowels, diacritics, coeng subscripts, stacking) | Have via browser render | Phase 4: HarfBuzz shaping to vector outlines |
| Custom TTF/OTF | Part (loaded for rendering only) | Phase 4: parsed by HarfBuzz |
| Accurate preview, glyph order and position | Have (traced) | Phase 4 vector preview |
| Reference glyph ក height in mm, measured on real geometry | Have (traced ink) | Phase 4: measured on the glyph's vector outline bbox |
| Exact width/height in mm, letter spacing, line spacing, alignment | Part | Phase 4 |
| Artistic vs paragraph text, text on path | New | Phase 4 |
| Vertical text | Defer | Rare for Khmer signage |
| Text to curves as editable Bézier paths with holes | Part (polylines) | Phase 4 |
| Font manager | Part (bundled, detected system, uploaded) | Phase 4 |

### CNC (Part 7)

| Brief item | Status | Plan |
|---|---|---|
| Auto / manual nesting, material size, gap, margin, rotation, utilization, waste, layout comparison | Have | Keep |
| Collision / overlap detection | Have (validator) | Keep |
| Cutting direction, cutting order, feed, machine profile | Have (order, feed, profile) | Direction in Phase 6 |
| Kerf compensation | New, Engine | Phase 6, opt-in, default 0 |
| Lead-in / lead-out | New | Phase 6, opt-in |
| Material and wire profiles (wire thickness, temperature) | Part (F/S per profile) | Phase 6 |
| Calibration, X/Y steps, limits, work zero, verification | Have | Keep |
| TAP generation, preview, coordinate/bounds/units checks, export gate | Have | Keep; add unit check |
| Full-screen cutting simulation modal | Part (docked Simulation) | Phase 6 |

---

## 3. Architecture decisions

### 3.1 Two workspaces, one project

The brief's screenshot shows a design page with editable objects, not a foam sheet. The existing sheet canvas is about production. Both are needed:

- **Design workspace** (new): a vector document — pages, layers, objects (paths, shapes, text, groups) with real Bézier geometry. Menu bar, toolbox and properties panel live here.
- **Production workspace** (existing): nesting, toolpath, G-code, simulation — unchanged engines.

**Send to production** turns selected design objects into a `Design` (flatten curves with the existing 0.04 mm tolerance → `buildParts`). Each produced design keeps the ids of its source objects, so editing the source and sending again replaces it rather than duplicating it.

This keeps every existing algorithm, file and test in place: the production side still only sees polygons.

### 3.2 Document model (stored in the project, backward compatible)

```ts
Project.document?: VectorDocument          // absent in older files → empty document
VectorDocument { pages: Page[]; layers: Layer[]; objects: Record<id, VObject>; units: 'mm' }
VObject = PathObject | ShapeObject | TextObject | GroupObject
  common: id, layerId, name, transform (matrix), fill, stroke, strokeWidth, locked, hidden
PathObject  { subpaths: { closed; segments: { p; in?; out? }[] }[] }   // cubic Bézier, mm
ShapeObject { kind: rect | ellipse | polygon | star | spiral | grid; params }  // editable until converted
TextObject  { runs; fontId; refHeightMm | sizeMm; tracking; leading; align; onPath? }
```

Undo/redo reuses the existing project history and the modal edit sessions, so every new editing operation is undoable by construction.

### 3.3 New engines (loaded only when the Design workspace is opened)

| Need | Library | Licence | Why this one |
|---|---|---|---|
| Khmer shaping to vector glyph outlines | **harfbuzzjs** (HarfBuzz in WebAssembly) | MIT | The same shaper browsers use; gives glyph ids + positions + outlines, so subscripts and vowel placement are exactly the font's rules. |
| Bézier paths, node editing, booleans on curves, simplify, smooth | **paper.js** (core, no canvas rendering) | MIT | Mature boolean operations that keep curves; hit testing for the node tool. |
| Offset, contour, kerf on polygons | **Clipper2** | Boost | Robust integer offsetting; used where output is polygons (contour preview, kerf on the toolpath). |

The existing pixel-tracing text path stays as the fallback for installed system fonts the page cannot read as files (Chromium's Local Font Access can provide them with permission; other browsers cannot). Traced results are labelled "traced" in the properties panel.

Fonts for HarfBuzz must be TTF/OTF. Battambang and Moul (SIL OFL) will be bundled as TTF; uploaded TTF/OTF files are used directly.

### 3.4 CNC safety rules for the new features

- Kerf and lead-in/out are **off by default**. With them off, generated TAP files must stay byte-identical to today's (a regression test will lock this).
- When kerf is on, outer contours are offset outward and holes inward by kerf/2; the validator re-checks gaps and bounds on the offset path; the G-code check window states the kerf used.
- Wire thickness and temperature are recorded on the profile as **unverified** until signed off, like feed and heat today.

### 3.5 Performance

Booleans, offsets and text shaping of long strings run in a Web Worker (the project already has one for nesting). The design canvas renders with SVG plus memoised paths; node handles only for the selected object.

---

## 4. Phases

Each phase ends with typecheck, all unit and end-to-end tests green, new tests for its own features, screenshots, and a commit.

| Phase | Delivers | Key tests | Size |
|---|---|---|---|
| **1. Audit** | This document | Baseline: 223 unit, 55 e2e green | Done |
| **2. Workspace shell** | Design workspace route; menu bar (12 menus now, Effects in Phase 5; real commands only); customizable main toolbar; categorized toolbox frame; tabbed properties panel; status bar; command palette (Ctrl+Shift+P); Beginner/Advanced; shortcut list | Every menu item and toolbar button runs a command (automated sweep); keyboard access; mobile layout | M |
| **3. Document + core editing** | Document model + storage + migration; pick/marquee/multi-select; move/rotate/scale/mirror/skew/numeric transform; shapes (rect, ellipse, polygon, star, spiral, grid, line, polyline, pen, freehand); node tool; group, order, layers, lock/hide; align/distribute; snap to grid/object/node; pages; send to production | Geometry unit tests per tool; undo/redo for every op; old projects open unchanged; SVG round-trip | L |
| **4. Khmer typography** | HarfBuzz text objects; bundled TTF fonts; font manager; reference ក measurement on vector bbox; mm width/height; tracking, leading, alignment; text on path; text to curves as editable Bézier paths; SVG export of curves | Shaping fixtures (coeng stacks, pre-base vowels, ឬ ឮ ៗ), counters/holes preserved, ref-height within 0.05 mm, comparison against browser rendering | L |
| **5. Vector operations** | Weld/union, difference, intersection, exclude, trim, combine, break apart, crop, offset/contour, outline stroke, simplify, smooth | Boolean fixtures incl. overlapping Khmer glyph contours; area and hole counts; no degenerate paths | M |
| **6. CNC upgrades** | Kerf (opt-in), lead-in/out (opt-in), cutting direction, wire/material profiles, full-screen simulation, units check | TAP byte-identical with features off; offset correctness; validator on offset paths | M |
| **7. Performance** | Workers for booleans/shaping, code-splitting, render profiling on 10k+ nodes and long Khmer strings | Timing budgets in tests; bundle size budget | S–M |
| **8. Regression + docs** | Firefox/WebKit runs where possible, full report, screenshots, user guide | Full suite | S |

### Progress

**Phase 2 — done.** The shell was built together with the core of the Phase 3 document model, so that every menu entry, toolbar button and tool does real work from the start instead of being a placeholder.

- *Design* workspace (dock → Design, `nav-design`). The existing screens are the Production workspace and are unchanged.
- Vector document stored in `Project.document` (optional; projects without it open with an empty page the size of the foam sheet). Validated on load (`readDocument`: depth, item and point limits, colours, matrices).
- Engine `src/engines/vector-engine/`: cubic Bézier paths with exact bounds and adaptive flattening (0.04 mm, the same tolerance as the SVG importer), shapes, groups, layers, transforms, align/distribute, order, combine / break apart, reverse, SVG export, conversion to nesting polygons.
- Menu bar with 12 menus (Effects waits for Phase 5 operations, so it is not shown empty). One command registry feeds the menus, toolbar, palette, context menu and keyboard.
- Main toolbar, customizable (add, remove, reorder, separators, reset; remembered on the device).
- Toolbox: pick, pan, zoom; rectangle, ellipse, polygon, star, spiral, grid; line, polyline, freehand; Khmer text (opens the existing text window). Tool options bar (sides, points, inner size, turns, rows/columns, grid size, copy offset).
- Canvas: page, rulers in mm, grid, snap to grid, wheel zoom at the pointer, pan, fit page / selection, click, Shift+click, marquee, drag move (Shift: one axis), 8 resize handles, rotate handle (Shift: 15° steps), right-click menu.
- Properties: Object (name, X/Y/W/H with keep-proportions, rotate by angle, ±90°, mirror, slant in Advanced mode, node and contour counts, warning for open lines), Style (fill, outline, width — display only), Layers (add, rename, show/hide, lock, activate, move selection, delete), Page (size, from foam sheet, Beginner/Advanced).
- Command palette (Ctrl+Shift+P, searches English and Khmer names), shortcut list, status bar (pointer mm, zoom, selection size, layer, save state).
- **Send to production**: closed outlines go to the existing pipeline (`buildParts` → design list → nesting → cutting path → TAP). Open lines are left out and reported. Sending the same objects again replaces the design rather than adding a copy.
- Every change is one undo step through the existing project history.

Tests added: `tests/unit/vector-engine.test.ts`, `tests/unit/design-commands.test.ts` (registry, shortcuts, translations), `tests/e2e/design.spec.ts` (drawing, numeric and keyboard edits, select/move/resize, all draw tools, send → nest, SVG import + reload, a sweep that runs every enabled menu command, palette/shortcuts/toolbar customizing, keyboard menu navigation). The layout overflow test covers the Design workspace at six screen sizes in both languages.

**Not yet built (later phases), so not shown in the interface:** node editing, pen/Bézier tool, 3-point shapes, snapping to objects and nodes, smart guides, multiple pages, shortcut re-binding, booleans, offset/contour, Khmer text as editable vector objects (HarfBuzz), kerf and lead-in/out.

---

## 5. Explicitly not promised

- Real-machine accuracy: nothing here has moved a machine. Kerf values, lead-ins, wire thickness and temperature need physical cut tests (see §6).
- CorelDRAW file formats (.cdr) — not readable in a browser; SVG remains the exchange format.
- Copying CorelDRAW branding, icons or exact layout — the interface is original and only follows the usual vector-editor organisation.

## 6. Needs physical CNC testing

1. Load generated TAP files in Mach3 and dry-run with the wire cold.
2. Measure a cut test letter to set the kerf value per foam and wire temperature.
3. Confirm lead-in/out lengths do not mark visible faces.
4. Confirm X/Y steps per mm with the calibration calculator.
5. Confirm machine zero against the "top corners" clamp option.
