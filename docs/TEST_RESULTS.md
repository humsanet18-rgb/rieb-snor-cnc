# Test results

Run on 2026-11-01 on Windows 11 with Node 24.13, against the production build, with the Content Security Policy and service worker active. These results are for the local build. The live sites do not have this work until it is pushed.

## Final build

| Check | Command | Result |
| --- | --- | --- |
| Type check, strict | `npx tsc --noEmit -p .` | No errors |
| Production build | `npm run build` | Succeeds. Main script 459 kB, 136 kB gzipped |
| Unit and integration | `npm test` | 195 passed, 9 files, 79 s |
| Browser, Chromium | `npm run test:e2e` | 31 passed |
| Browser, WebKit (Safari engine) | `npm run test:e2e` | 31 passed |
| Dependency audit, all | `npm audit` | 0 vulnerabilities |
| Dependency audit, production | `npm audit --omit=dev` | 0 vulnerabilities |
| Browser, Firefox | `npm run test:e2e:firefox` | **Not run.** Windows blocks the test browser from starting (`spawn UNKNOWN`) |
| Real Mach3 or machine | none | **Not run** |
| Real phone or tablet | none | **Not run.** Sizes were set in desktop browsers |
| Screen reader | none | **Not run** |
| Printing on paper | none | **Not run** |

The browser suite passed 62 of 62 twice in a row on the final build.

## Failures seen during the work

Every failure below is listed, including those that did not repeat.

| Test run | Failure | Outcome |
| --- | --- | --- |
| First shop run | 7 of 14 shop tests failed | Test mistakes: an ambiguous selector, a click on a table row instead of its link, an archive step that waited for a dialog that does not exist. Real bugs found: top bar off-screen, page sideways scroll, amount columns collapsed onto each other because they shared a CSS class name with the step number badges. All fixed |
| Second shop run | 5 of 14 failed | Top bar wrapping and hidden table headers. Fixed. A closed menu was also wrongly counted as off-screen, so the test now opens the menu and checks it for real |
| One full browser run, on a build before the last fixes | 4 of 62 failed, 41 passed, the rest did not run: Chromium keep-position test (a step did not open in time), WebKit editor test (a text check), and two WebKit tests where the Playwright worker process died with code 3221225794 | **Cause not proven.** That code is the Windows error for a process failing to start. Other work was running on the computer. None repeated in two later full runs on the final build |

An earlier full run in this project also saw the WebKit editor test fail once and then pass. Treat that test as possibly unreliable on this computer. If it fails on another computer, investigate it rather than rerunning.

## What the new tests cover

Unit (33 tests in `tests/unit/shop.test.ts`):

- Money parsing and printing, including values that drift in floating point.
- Totals with discount and tax, discounts above the subtotal, fractional quantities.
- Status flow, timestamps, refused steps.
- Late work, finished late, queue order, order numbers.
- Stock as a sum of moves, low stock, archived material.
- Overview and report by period.
- Backup reminder, CSV quoting and formula guard.
- Backup files: round trip, wrong format, wrong version, broken references, repeated ids and numbers, bad values.

Browser (`tests/e2e/shop.spec.ts`, in Chromium and WebKit):

- A job from customer to order, payment, foam, production, expense, report, CSV and dashboard, then a reload, with no console errors.
- Validation errors keep what was typed.
- Duplicate customers refused, archiving keeps orders.
- Unique order numbers across copy and cancel.
- Corrections: payment removal, queue reorder, stock count, customer edit and restore.
- An order linked to a cutting project opens it.
- Quotation, invoice and report PDFs.
- Backup, a refused bad file that changes nothing, and restore.
- Second tab updates, and a stale save is refused with no silent overwrite.
- Khmer labels.

Screen sizes 360, 390, 768, 1024, 1366 and 1920 px: the cutting screen, layer menu, EDITOR, order detail and all eight Shop tabs were checked for sideways scroll and for controls past the screen edge, with long customer and job names.

## Checked by eye

A Khmer invoice PDF: Khmer text rendered correctly, and the sums were right (102 − 2 + 10% tax = 110). The dashboard and order detail at 1366 px, and the orders list at 390 px.

## Not covered

- Filling the time estimate from the open project.
- Storage full or blocked. The save error path exists and shows a message, but no test forces it for shop records.
- Very large record counts. The tests use a handful of records.
- The new work on the live sites.
