# Project audit

Audit date: 2026-11-01. It covers the repository, the Vercel and GitHub Pages sites, and the code as of commit 453ccb6. The older [AUDIT.md](AUDIT.md) covers the original single-file app that this one replaced.

## What this project actually is

Rieb Snor CNC is a browser-only tool for a hot-wire foam cutting workshop. It turns CorelDRAW SVG files into nested layouts and Mach3 TAP files. Before this audit it had no record of customers, orders, stock or money.

| Item | Finding |
| --- | --- |
| Frontend | React 19, TypeScript in strict mode, Vite |
| Backend | None |
| Database | None on a server. Projects are in IndexedDB in each browser |
| Authentication | None |
| Roles | None |
| API routes | None |
| Page routes | None. One page with screens held in interface state |
| Environment variables | None |
| Heavy work | One Web Worker per job, stopped on cancel |
| File generation | Own ZIP and PDF writers, in the browser |
| Offline | Service worker caches the built files |
| Hosting | Vercel (production) and GitHub Pages, both built from `main` |
| Payment or email | None |

## Structure

| Path | Purpose |
| --- | --- |
| `src/engines/` | SVG parsing, geometry, nesting, toolpath, G-code and export. No React |
| `src/features/` | Screens and panels for each workflow step, plus `editor/` |
| `src/services/` | IndexedDB, project files, downloads, worker client |
| `src/stores/` | Project and interface state |
| `src/workers/` | Engine worker and service worker template |
| `tests/` | Unit, integration and browser tests |

## Data model before this work

One store of projects. A project holds imported geometry, sheet settings, machine profile, layouts and validation results. Files have a version number and are checked on load. Autosave writes to IndexedDB. There was no link between a project and a customer, a job or a price.

## Findings

Severity follows the master task: Critical stops safe use, High affects daily work or data, Medium is a real weakness with a workaround, and Low is polish or housekeeping.

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| A1 | High | No customers, orders, production queue, stock, quotes, payments or reports | Fixed: Shop screen |
| A2 | High | At 768 px and below the top bar pushed Settings and Help off the screen, and at 360 to 390 px the page scrolled sideways by 4 to 34 px | Fixed, with a test at each screen size |
| A3 | High | Records exist in one browser only. Clearing site data, losing the device or a browser eviction deletes them | Accepted with the user's choice of on-device storage. Reduced by backup files, a 7-day reminder and a request for persistent storage |
| A4 | High | Vercel and GitHub Pages are different addresses, so each keeps separate records. Someone switching between them appears to lose work | Open. The Shop settings screen now says which address holds the records. See roadmap R1 |
| A5 | Medium | Two tabs editing one cutting project: the last save wins | Open and documented. Shop records are protected by a revision check |
| A6 | Medium | GitHub Pages cannot send security headers | Open. Vercel sends them |
| A7 | Medium | No automated check at each screen size | Fixed: six sizes in the browser tests |
| A8 | Medium | G-code panel had a label but no role, so screen readers could ignore it | Fixed |
| A9 | Low | Delete and clear actions in Settings and the project dialog use the browser's own `confirm()` box, unlike the rest of the app | Open. It works, and the wording is translated |
| A10 | Low | No licence chosen for a public repository | Open. The owner must choose |
| A11 | Low | A customer's job name appeared in tests and documents in the public repository | Fixed in the current files. It remains in old commits |
| A12 | Low | PDF pages are images, so the text cannot be searched | Open by design, because this keeps Khmer correct |

No Critical finding was open at the end of the audit.

## What was checked on the live sites

Before this work: the site loaded on both addresses with no console errors, nesting ran in the worker, the EDITOR showed positions and G-code lines, and the service worker was active. Vercel sends HSTS, `nosniff` and `X-Frame-Options: DENY`.

## What could not be checked

- A real Mach3 installation and a real machine.
- Firefox, because Windows refuses to start Playwright's Firefox build on this computer. That block was left in place.
- A real phone or tablet. Sizes were set in desktop browsers.
- The Vercel dashboard, which needs the owner's sign-in. Deployment was checked from the public site only.
