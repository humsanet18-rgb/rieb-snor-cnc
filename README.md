# រៀបស្នោ CNC

Foam nesting and Mach3 toolpath generator for hot-wire CNC shops. It runs entirely in the browser, in Khmer and English. Files stay on your device.

កម្មវិធីរៀបអក្សរស្នោលើសន្លឹក និងបង្កើតឯកសារ TAP សម្រាប់ Mach3។ ដំណើរការក្នុងកម្មវិធីរុករក ឯកសារមិនបញ្ជូនទៅណាទេ។

**Open the app:** https://humsanet18-rgb.github.io/rieb-snor-cnc/

## What it does

1. **Import** SVG files from CorelDRAW, and report everything it could not use.
2. **Manage** designs, copies and rotation lock.
3. **Set** the foam sheet, margin, clamp corners and wire start box.
4. **Nest** automatically by rows or columns, in rows of same-height letters, keep original positions, or adjust by hand.
5. **Save** machine profiles with F, S, optional M5 and travel limits.
6. **Build** one continuous wire stroke per sheet, because a hot wire cannot lift. Choose the shortest path, or cut row by row, column by column, or piece by piece.
7. **Validate** bounds, connectivity, clamp collisions, gaps and the TAP format.
8. **Export** TAP, SVG, ZIP, a project backup and a PDF cutting report.

The **EDITOR** screen plays the wire along the path, with its X and Y, the distance and time left, and the G-code line it is on. Click a line to put the wire there.

## ⚠ Safety

**This software does not guarantee that its G-code is safe.** It has not been run on your machine. Validation only compares the file with your settings.

Before every new job:

1. Confirm F and S suit your wire, foam and thickness. The defaults come from sample files.
2. Set machine zero at the foam corner, and check that the head clears every clamp.
3. Load the file in Mach3 and compare the toolpath display with the preview.
4. Dry-run with the wire cold, watching the full path with a hand on the stop button.
5. Cut a scrap piece first when a setting has changed.
6. Stay at the machine, and ventilate. Hot-wire fumes are harmful.

The operator is responsible for what runs on the machine.

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Then open `http://localhost:5173`. Details are in the [installation guide](docs/INSTALL.md).

Sample files are in `public/samples/`, and the app has buttons for them in step 1. All are synthetic.

## Documents

- [Technical audit of the original app](docs/AUDIT.md)
- [Installation guide](docs/INSTALL.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Testing and results](docs/TESTING.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)

## Project layout

```text
src/
  app/          shell, actions, translations
  components/   shared controls and icons
  engines/      framework-free logic, each testable alone
    svg-parser/  geometry-engine/  nesting-engine/
    toolpath-engine/  gcode-engine/  export/
  features/     panels, canvas, playback and editor, by workflow step
  services/     IndexedDB, project files, downloads, worker client
  stores/       project and interface state
  workers/      engine worker, service worker template
  styles/       one stylesheet with light and dark tokens
tests/
  unit/  integration/  e2e/  fixtures/
scripts/        sample and icon generators
```

Engines have no React or DOM-rendering code. Heavy work runs in a Web Worker, one per job, and cancelling a job terminates that worker.

## Stack

React 19, TypeScript in strict mode, Vite, Vitest and Playwright. Runtime dependencies are React and the two Khmer font packages. ZIP and PDF writing are small in-house modules, because a store-only ZIP and an image-based PDF need very little code.

## Licence

No licence has been chosen yet. Choose one before publishing the source.
