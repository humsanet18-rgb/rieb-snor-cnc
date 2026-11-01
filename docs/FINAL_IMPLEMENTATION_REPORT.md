# Final implementation report

Date: 2026-11-01.

## Outcome

Rieb Snor CNC keeps everything it did before and now has a Shop screen that runs the workshop: customers, orders, the cutting queue, foam stock, payments, reports and backups. The whole app now fits screens from 360 to 1920 px wide.

**Deployment status: not deployed.** This work is on the local computer and is not yet committed or pushed. A push to `main` deploys it, and that needs the owner's approval. The live sites still run the earlier version.

## Decisions by the owner

| Question | Answer | Effect |
| --- | --- | --- |
| Where do records live? | On this device | No login, server or online database. Works offline |
| Which modules? | Customers and orders, production queue, foam stock, prices and payments | All four were built |

## Implemented and tested

| Area | Detail |
| --- | --- |
| Dashboard | Cards from real records, alerts for late work, low stock and old backups, queue, recent activity |
| Customers | Add, edit, search, sort, archive, restore, duplicate check, order history, amount owed |
| Orders | Items, discount, tax, due date, status flow, copy, unique numbers, link to a cutting project |
| Production | Queue, reorder, start, finish, estimated and actual minutes, history, late flags |
| Foam stock | Materials, in, out, count correction, history, low stock, cost |
| Money | Payments, overpayment refused, payment removal, expenses, who owes |
| Documents | Quotation, invoice and report PDFs with correct Khmer |
| Reports | Date range, totals, CSV for Excel with a formula guard |
| Data safety | Separate database from projects, revision check between tabs, screen updates only after a save, validated restore, backup reminder, request for persistent storage |
| Responsive | Top bar, tabs, tables as cards on phones, dialogs, layer menu, at six screen sizes |
| Accessibility | Field labels, written error messages, role on the G-code panel. Not tried with a screen reader |
| Audit fixes | Off-screen top bar, sideways scroll, customer job name removed from current public files |

## Implemented but not fully tested

| Item | What is missing |
| --- | --- |
| TAP files | Never run on Mach3 or a machine |
| Time estimate from the open project | No automated test |
| Shop save failure message | Not forced in a test |
| PDFs | Checked on screen, not printed |
| Phone and tablet layouts | Tested at those sizes in desktop browsers only |
| Screen reader use | Labels exist, not tried with a screen reader |
| Firefox | Blocked on this computer |

## Not implemented

Login, roles, server permissions, shared records, server backups, messaging, online payment, multi-branch management and full accounting. The reasons are in [MISSING_FEATURES.md](MISSING_FEATURES.md). No fake login or role screen was added.

## Blocked by external dependencies

| Item | Blocked by |
| --- | --- |
| Deployment and live verification | The owner's approval to push |
| Vercel dashboard checks | The owner's sign-in |
| Mach3 and machine test | Physical access |
| Firefox tests | A Windows block, left in place |

## Existing features

No feature was removed. The cutting screens are unchanged except for fit on small screens. In the Shop view the top bar hides the project name, undo and save state, because they concern cutting projects.

## Safety statement

This app does not guarantee that G-code is safe. No file has been run on Mach3 or a machine. Validation compares a file with the settings entered and knows nothing about the actual wire, foam, clamps or machine zero.

## Results

Type check clean, 195 unit and integration tests, 31 browser tests each in Chromium and WebKit, and 0 known vulnerabilities. Details, including failures seen along the way, are in [TEST_RESULTS.md](TEST_RESULTS.md).

## Documents

[Project audit](PROJECT_AUDIT.md), [feature inventory](FEATURE_INVENTORY.md), [missing features](MISSING_FEATURES.md), [security audit](SECURITY_AUDIT.md), [roadmap](IMPROVEMENT_ROADMAP.md), [test results](TEST_RESULTS.md), [remaining issues](REMAINING_ISSUES.md), [deployment guide](DEPLOYMENT_GUIDE.md) and [user guide](USER_GUIDE.md).
