# UI/UX redesign (November 2026)

The app moved from one long accordion of numbered steps to a desktop CAD/CAM layout: a side rail of screens, a workspace with a control panel, the sheet canvas and a properties panel, and a status bar. The engines, file formats and saved projects are unchanged; projects saved before the redesign open as they were.

## Layout

| Area | What it holds |
| --- | --- |
| Top bar | Home, project name, save state, undo/redo, new/open/save, theme, help, language. On phones the file actions move into a ⋯ menu. |
| Side rail | Home · Design (SVG Import, Khmer Text, Nesting & Layout) · Production (Machine, Cutting Path, G-code & Export, Editor) · Manage (Projects, Workshop, Settings). A dot shows each step's state: done, out of date, or has errors. Labels show from 1440 px; icons only below. |
| Left panel | Controls for the current screen, in titled cards with ⓘ explanations, and a "Next: …" button. It can be hidden. |
| Canvas | Sheet, rulers, grid, toolpath, direction arrows, start and end marks, row bands, issue markers, selection box with dimensions. Toolbar: sheets, pan/box-select/select-all, zoom, fit, layers. |
| Right panel | Selected piece(s) (size, position, rotation, align/distribute) and job totals. It can be hidden. |
| Status bar | Cursor position, zoom, sheet size, selection, path state, machine profile. |

### Breakpoints

| Width | Behaviour |
| --- | --- |
| ≥ 1440 | Rail with labels, both panels docked. |
| 1200–1439 | Icon rail, both panels docked; sheet size, profile and playback note leave the status bar. |
| 900–1199 | Properties open as an overlay drawer from the canvas toolbar. |
| < 900 | Bottom tab bar (Home, Import, Nest, Path, More); the rail opens from More. Canvas on top, the control panel as a bottom sheet that can be closed. |
| < 600 | Zoom ± buttons hidden (pinch to zoom), sheet arrows hidden when there is one sheet, playback only on Path, Export and Editor. |

## New screens and features

- **Home**: start actions (import, Khmer text, sample, open), current project with job progress and Continue, recent projects, and a guide that can be hidden.
- **Khmer Text**: six numbered steps with done/current/waiting states. The browser lays out the text, so Khmer shaping is correct. The reference glyph (default ក) is scaled to the target height in mm. The outlines are traced from the rendered text, checked for small pieces and sheet fit, and added to the project as an ordinary design or downloaded as SVG. Bundled fonts: Battambang 400/700 and Moul; installed Khmer fonts are detected; a font file can be loaded for the session.
- **Projects** and **Settings** became pages instead of dialogs.
- **Multi-select**: Shift/Ctrl-click, box select (tool or Shift-drag), Ctrl+A, and moving several pieces at once with drag, arrows (Shift = 10 mm) or R.
- **Align and distribute** for selected pieces in manual mode.
- **Row grouping**: the cutting engine now returns the rows it built the stroke from (`Stroke.rows`). The row list, the row bands on the canvas and the cutting order all read that one result, so they cannot disagree.
- **Confirmations** before deleting designs, layouts, profiles and projects, and before clearing all data. The browser warns before leaving with unsaved changes or a running job.

## Not built, and why

No control was added for these, so the UI has no fake controls:

- Group/ungroup, and delete/duplicate of a single placed piece. Pieces come from design quantities; use the copies counter or remove the design.
- Random arrangement. The search already tries many orders; a random button would not add anything useful.
- Kerf offset. It is explained in a card on Cutting Path but not applied to the geometry.
- Sending to the machine. The app writes TAP files; Mach3 loads them.
- Uploaded fonts last only for the session.
