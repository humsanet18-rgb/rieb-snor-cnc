# Workspace and modal system

How the រៀបអក្សរ CNC workspace is laid out, which tools open in a window, and the rules every window follows.
The CNC engines (SVG parser, nesting, toolpath, TAP writer and reader, validation) and the project file format are unchanged.

## Layout

| Area | Component | What it holds |
|---|---|---|
| Top bar | `src/app/TopBar.tsx` | Project name, save state, workflow stepper (Designs → Layout → Path checked → Export), machine chip (profile + readiness), New / Open / Save / Export, undo / redo, theme, help, language |
| Left dock | `src/app/Dock.tsx`, `src/app/tools.ts` | Grouped tools: Canvas (select, pan, layers), Design (Import SVG, Designs, Khmer text, Nesting), Production (Cutting path, Machine, G-code check, Simulation, Export), Manage. Right-click or "Customize" pins a tool to the top group; pins persist |
| Side panel | `src/app/Workspace.tsx` | Results of the current screen and the button into its window (e.g. "Nesting setup…") |
| Canvas | `src/features/preview/SheetCanvas.tsx` | Rulers, grid, zoom / pan, box select, multi-select, drag, 5 mm snap toggle, right-click / Shift+F10 / long-press menu (`CanvasMenu.tsx`). Pieces off the sheet are drawn red (`data-state="bad"`), inside the margin amber (`warn`) |
| Properties | `src/features/geometry/PropertiesPanel.tsx` | Selection and job totals; resizable 240–480 px (drag, arrow keys, double-click resets); width persists |
| Status bar | in `SheetCanvas.tsx` | Cursor, zoom, sheet, selection, flagged pieces, path state, save state, machine readiness (opens the machine window) |
| Phones | `BottomNav` in `Dock.tsx` | Home / Designs / Nest / Path / More; side panel becomes a bottom sheet |

## Tool locations

| Tool | Before | Now |
|---|---|---|
| SVG import | "SVG Import" screen | **Import SVG** window (centre); the screen is now **Designs** (list, quantities, rename) |
| Khmer text | "Khmer Text" screen | **Khmer text** window (workspace size) |
| Nesting settings, sheet, clamps | Nesting screen | **Nesting** window (workspace size) with tabs Foam sheet / Arrangement / Clamps, live preview and layouts to compare. The screen keeps the summary, layout table and row list |
| Cut order, profile, move list, review | Cutting Path screen | **Cutting path** window (tabs Order / Machine / Kerf & leads / Review). The screen keeps a summary, path table and review |
| Machine settings | "Machine" screen | **Machine calibration** window: Profile, Wire, Travel, Zero, X/Y steps, Verify |
| G-code preview | Editor only | **G-code check** window: full file, line numbers, per-file checks, full-screen |
| Export | "Export" screen | **Export** window (centre) |
| Simulation (editor) | Editor screen | Unchanged screen, renamed "Simulation"; it drives the main canvas so it stays docked |
| Delete / rename / discard / overwrite | Browser-style dialog | Confirmation drawn inside the current window (or alone when none is open) |

## Window sizes

`Modal` in `src/components/modal.tsx` takes `size`:

- `center` — import, export, help, import report.
- `workspace` — nesting, toolpath, machine, G-code, Khmer text. Full screen below 900 px wide.
- `confirm` — the standalone confirmation (`ConfirmHost`).

Below 600 px every window is full screen. Only one window is open at a time (`uiStore.dialog`); moving between tools replaces it. Confirmations never open a second window: they cover the current one.

## Rules every window follows

- **Live preview, separate commit.** Opening a window that edits the project starts an edit session (`src/app/edit-session.ts` → `beginTransaction` in `project-store.ts`). Changes show at once on the canvas and in the preview, but autosave waits.
- **Apply** validates first (errors disable it and are listed above the buttons; warnings do not), then keeps the session as **one undo step** and saves.
- **Cancel / Esc / ×** with changes asks "Discard changes?"; discarding restores the project, history, profiles and save state exactly.
- **Busy:** while nesting, importing or converting text, the window will not close; trying shows what is running with a Stop button.
- **Keyboard:** focus starts on the first field, Tab and Shift+Tab stay inside, Esc goes through the same guard (also when focus is outside the dialog), Enter confirms only in one-line fields of windows that have an obvious action, focus returns to the control that opened the window.
- Workspace windows do not close on a backdrop click; centre windows do (still guarded).

## Machine readiness

`src/features/machine-settings/calibration.ts`. A profile is **incomplete** (no usable feed, negative heat, no name, or travel not set), **unverified** (complete, not signed off) or **verified** (operator ticked the three checks on the real machine). Changing feed, heat, M5 or travel clears the verification (`verifiedAt`, optional in saved files; older files load unchanged). Fields still at the shipped sample values are labelled "Sample value". The X/Y calculator works out corrected steps per mm for Mach3 Motor Tuning; it does not change Mach3.

## G-code checks

`src/features/export/gcode-checks.ts` reads each generated `.tap` back with the independent reader (`parseTap`) and checks: syntax, F and S match the profile, M5 matches, the path end, every move on the sheet, every move inside the machine travel, and the toolpath validation. Any failed check, or the safety confirmation not ticked, keeps the downloads disabled. Unset machine travel is a warning, not a failure.

## Known limitations

- Kerf compensation and lead-in / lead-out are **not** in the toolpath engine. The Kerf tab says so; nothing pretends to apply them.
- No drawing tools or boolean vector operations exist in the engine, so none were added to the dock.
- The Workshop (shop) module keeps its own stacked dialogs (an order window with a payment window on top) through the compatibility `Dialog` wrapper.
- An invalid machine value (feed 0, negative heat, empty name) can no longer be applied from the machine window; the validator rule for it remains for profiles that arrive from elsewhere.
- Tab strips scroll sideways on phones instead of wrapping.
- Automated tests ran in Chromium only. Touch long-press and the larger touch targets (`pointer: coarse`) were not exercised by a test.

## Tests

- Unit: `tests/unit/workspace-modals.test.ts` — G-code checks, calibration and readiness, edit-session commit / rollback / save timing.
- End to end: `tests/e2e/modals.spec.ts` — rollback, one-step undo, busy guard, Esc guard, focus trap and return, verification, axis calculator, G-code gating and file equality with the export window, toolpath preview and rollback, import cancel / apply, rename with Enter / Esc, context menu, snap and pin persistence, workflow stepper, full-screen windows on phones, screenshots.
- Helpers in `tests/e2e/nav.ts`: `goTo` closes any open window first (Apply if allowed, else Cancel), `openNesting`, `apply`.
- Screenshots: `docs/screenshots/` (desktop 1440×900, tablet 820×1180, mobile 390×844).
