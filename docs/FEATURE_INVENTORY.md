# Feature inventory

Status words: **Working** means an automated test exercises it. **Partly tested** means it exists but a real-world part was not exercised.

## Cutting (existing, kept)

| Feature | Screen | Status |
| --- | --- | --- |
| SVG import with report | Step 1 | Working. Tested with CorelDRAW and hand-written files |
| Design list, copies, rotation lock | Step 2 | Working |
| Sheet, margin, clamp corners, start box | Step 3 | Working |
| Free nesting, keep positions, manual moves | Step 4 | Working |
| Same-height rows, arrange by width or height | Step 4 | Working |
| Machine profiles (F, S, M5, limits) | Step 5 | Working |
| Single wire stroke, cut order choices | Steps 4 to 6 | Working |
| Validation of bounds, joins, clamps, gaps, format | Step 6 | Working |
| TAP, SVG, ZIP, project backup, PDF report | Step 7 | Working. TAP has not been run on Mach3 |
| EDITOR playback and G-code line tracking | EDITOR | Working |
| Autosave, undo, redo, project list | Top bar | Working |
| Khmer and English, light and dark | Top bar | Working |
| Offline use | All | Working in Chromium. Partly tested elsewhere |

## Shop (added by this work)

| Feature | Screen | Status |
| --- | --- | --- |
| Summary cards from real records | Dashboard | Working |
| Alerts for late work, low stock and old backups | Dashboard | Working |
| Customers: add, edit, search, sort, archive, restore, order history, duplicate check | Customers | Working |
| Orders: items, discount, tax, due date, notes, machine, assigned person | Orders | Working |
| Order numbers from a counter that is never reused | Orders | Working |
| Status flow from quote to delivered, or cancelled | Orders | Working |
| Copy an order as a new quote | Orders | Working |
| Link an order to a cutting project and open it | Orders | Working |
| Estimate from the open project's wire length and feed | Orders | Partly tested. The code runs only with a built toolpath, and no test covers it |
| Cutting queue, start, finish, reorder, history, estimated and actual minutes | Production | Working |
| Foam materials, stock in, stock out, count correction, history, low stock tag | Foam stock | Working |
| Record foam used on an order, refused above the stock count | Orders | Working |
| Payments, overpayment refused, balance, removal | Orders, Money | Working |
| Expenses | Money | Working |
| Who owes money | Money | Working |
| Quotation and invoice PDF, in Khmer | Orders | Working. An invoice was checked by eye on screen. Not printed on paper |
| Reports by date, CSV for Excel, report PDF | Reports | Working |
| Shop details, currency, default tax | Shop settings | Working |
| Backup and restore with full checking | Shop settings | Working |
| Activity list of every change | Dashboard, Shop settings | Working |
| Warning when a second tab changed the records | All Shop screens | Working |

## Not present on purpose

The app has no login, roles, server, online database, messaging or online payment, because the owner chose to keep records on this device. See [MISSING_FEATURES.md](MISSING_FEATURES.md).
