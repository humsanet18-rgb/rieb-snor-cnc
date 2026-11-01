# Missing features

The master task lists a broad set of business features. This compares that list with what the workshop runs. The owner chose on-device storage and these four modules: customers and orders, production queue, foam stock, and prices and payments.

## Built

Dashboard, customers, orders, CNC project links, production queue, foam stock, quotations, invoices, payments, expenses, reports, CSV export, backup and restore, phone and tablet layouts, and the activity list. Details are in [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md).

## Not built, by the owner's choice

Each of these needs a server, and the owner chose no server.

| Feature | Why not | What it would take |
| --- | --- | --- |
| Login, passwords, sessions | With no server, a browser password protects nothing: anyone with the device can read IndexedDB | A hosted auth service and a database |
| Roles (Owner, Manager, Operator, Sales, Viewer) | Roles enforced only in the browser would be fake security, which the master task forbids | Server-side permission checks on every read and write |
| Shared records between several computers | Records are in one browser | A hosted database and a sync design |
| Audit log tied to a person | There are no identities. The activity list records what changed and when, not who | Login first |
| Server-side automatic backups | There is no server | A hosted database with backups |

## Not built, for other reasons

| Feature | Reason | Priority |
| --- | --- | --- |
| File versions for a CNC project | A project is overwritten by autosave and keeps layouts inside it. Saving a backup file works as a manual version | Medium |
| Attaching original SVG or customer photos to an order | The project stores geometry, not the original file. Files would quickly fill browser storage | Low |
| Status set per sheet or per piece | Orders move as a whole, which matches a single-machine shop | Low |
| Separate machine records with availability | The workshop has one machine. Machine is a text field on the order | Low |
| Bilingual documents | Quotes print in the language chosen in the app, one language at a time | Low |
| Multiple currencies on one order | One currency per shop. USD or KHR | Low |
| Payment instalment reminders, SMS, Telegram | They need outside services and accounts | Low |
| Delivery proof, signatures | Not needed for the current way of working | Low |
| Mach3 simulation | The app checks files against settings. It does not simulate the controller | Medium |

## Left out as not fitting the business

The master task says not to add modules that do not match the actual business. Multi-branch management, a customer login portal, payroll and full accounting were left out.
