# Known limitations

## Not tested

| Area | Status | What to do |
| --- | --- | --- |
| Real Mach3 and a real machine | **Never run.** TAP files were compared with FCNC output and parsed by the app's own checker. Nothing has moved a machine. | Load a file in Mach3, dry-run with the wire cold, then cut a scrap test |
| Firefox | **Not run.** Windows refused to start the Playwright Firefox build on the test computer (`spawn UNKNOWN`). That block was left in place. | Run `npm run test:e2e:firefox` on another computer |
| Real iPad or Android tablet | Not run. Tablet width was checked in desktop browsers. Pinch zoom is written but has no automated test, and manual dragging was only tested with a mouse. | Try it on a real tablet |
| Real public hosting | Live on Vercel, which sends the headers, and on GitHub Pages, which does not. Automated tests run on the local preview server. | Use the Vercel address, as in [DEPLOYMENT.md](DEPLOYMENT.md) |
| Files from other software | SVGs were tested from CorelDRAW and hand-written cases. Illustrator and Inkscape exports were not tried. | Check the import report on the first few files |

## Machine and safety

- This app does not guarantee that G-code is safe. Validation compares the file with your settings. It knows nothing about your wire, foam, clamps or the actual machine zero.
- F and S defaults come from the sample files. They are not recommendations.
- No kerf compensation. The wire follows the drawn outline, matching what FCNC did on the sample files, so real letters come out slightly smaller by half the kerf on each side. Adding an offset would change every toolpath, so it needs a test on the real machine first.
- Only straight `G1` moves are written, and curves are flattened to short lines within about 0.04 mm. This matches the FCNC files, not arcs or a machine-specific dialect.
- No lead-in or lead-out tuning, and no control of where on a contour the wire enters beyond the nearest point.
- Bridges cut through the foam by design. They leave a wire-width slit in the leftover sheet and, where a bridge enters a hole, a slit through the letter body.
- Playback and the EDITOR show the path data at the F rate. They do not model acceleration, wire lag or heat, and estimated time is simply length divided by F.
- Cutting row by row walks back along lines already cut before crossing to the next row. Those moves pass through the kerf again, which can widen it slightly on some foams. On the real 111-piece job this was 4.8 m of 82.6 m. Check the result on scrap.
- With "return to the start point" off, the file ends with the wire inside the foam, and the operator has to free it.
- If the "top corners" clamp option is used, the wire starts just beyond the clamp, and the operator must set machine zero so the head clears it.

## Nesting

- "Best Found Layout" means the best result found in the search time. It is not proven optimal, and two runs can differ.
- Nesting works on a raster grid, not exact no-fit polygons. Layouts are safe (measured gaps are never below the setting), but a little material is lost. A piece needs about 5 mm of slack against the usable sheet. For example, a 979 × 459 mm piece fits a 984 × 464 mm usable area, while an exact 984 × 464 mm piece is reported as unplaced.
- Only the angles offered in step 4 are used; arbitrary rotation needs manual mode.
- Same-height rows use more foam than automatic nesting: 5 sheets instead of 4 on the real 111-piece job. Letters stay upright and rotation settings are ignored.
- A row is limited to the top half of the row above, so an unusually tall letter can still share height with the next row. Cutting order then treats them as one row.
- In manual mode nothing stops a piece being dragged into a bad position. The validator flags it, and export stays blocked until it is fixed.
- A piece moved in manual mode is not re-nested. Generating again replaces the manual work, though the earlier layout stays in the list.

## SVG import

- Clip paths and masks are not applied; the full shape is used, with a warning.
- Filters, gradients, markers and patterns have no effect on geometry.
- Text must be converted to curves. It is reported and skipped.
- CSS support covers tag, class, id and `*` selectors. Other selectors are reported, not applied.
- Shapes that only have a stroke are treated as outlines, and stroke width is ignored.
- Any rectangle-like shape covering 90% of the page is treated as a frame and skipped, with a warning in the import report. A real, page-sized plain rectangle would have to be drawn smaller than 90% of the page, or the page made larger.
- Crossing shapes are reported but not welded. Fix them in CorelDRAW.
- An island inside a hole is a separate piece of foam, so nesting may place it anywhere.
- Limits: 20 MB per file, 200,000 elements, 2,000,000 points, and `<use>` depth 8.

## Project storage

- Projects are stored in this browser on this device. Clearing browser data deletes them, and a private window may not keep them. Export a backup.
- A project stores imported geometry, not the original SVG file.
- Machine profiles are stored per browser. A backup carries only the profile the project uses.
- Undo covers project changes in the current session only, up to 40 steps. It is not saved.
- Only one tab should edit a project at a time; the last save wins.

## Shop records

- There is no login, no roles and no server, by the owner's choice. Anyone using this browser can see and change the records, and the activity list cannot say who made a change.
- Records live in one browser at one web address. Vercel and GitHub Pages hold separate records. Clearing browser data deletes them, and the browser may evict them under disk pressure even after the app asks to keep them. Save backup files.
- A backup file is plain text and contains customer details. It is not encrypted.
- One currency per shop, locked once records exist. Old amounts do not convert.
- Orders cannot be deleted, only cancelled. A cancelled order keeps its payments until you remove them, and those payments still count as received.
- Lowering an order's price below what was paid shows a negative balance. Refunds are recorded by removing a payment.
- Stock is what you record. Cutting a job does not reduce it, because the app cannot know which foam was used.
- Reports count money by date paid and foam by date recorded. This is a workshop summary, not accounting or tax software.
- The activity list keeps the latest 500 entries.
- On phones the card layout has no column sorting. Search and filters still work.
- All records load into memory together. This is fine for thousands of orders, not for hundreds of thousands.

## Other

- The PDF report uses page images, so its text cannot be selected or searched. This was chosen so Khmer always renders correctly without embedding font subsets.
- Phone-width screens work, and the Shop screens suit them well, but nesting and the canvas are meant for desktop and tablet.
- Screen-reader use has labels throughout but has not been tested with an actual screen reader.
- The app is not installable as a desktop program, by design. It can be added to a home screen as a PWA.
