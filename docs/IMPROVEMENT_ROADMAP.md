# Improvement roadmap

## Done in this work

Shop screen with dashboard, orders, production, customers, foam stock, money, reports and shop settings. Phone and tablet layouts for the whole app. Tests at six screen sizes. Backup, restore and tab conflict protection.

## Next

| ID | Priority | Item | Owner action needed |
| --- | --- | --- | --- |
| R1 | High | Use one address for daily work, the Vercel one, because it sends security headers. Records already typed on the other address can move with a backup file | Choose and bookmark it. Optionally turn GitHub Pages off |
| R2 | High | Cut one real job from a generated TAP: Mach3 display check, cold dry run, then scrap | Run it at the machine |
| R3 | High | Save a shop backup weekly to a USB drive or private cloud folder | Make it a habit. The app reminds after 7 days |
| R4 | Medium | Try the app on the real phone or tablet used in the workshop | Open the site on it |
| R5 | Medium | Open it in Firefox, if anyone uses it | Run `npm run test:e2e:firefox` on a computer that allows it |
| R6 | Medium | Stop one project being edited in two tabs at once, as Shop records already do | None. A code change |
| R7 | Medium | Replace the browser's `confirm()` box with the app's own dialog | None. A code change |
| R8 | Medium | Sort on phones. Table headers are hidden in the card layout | None. A code change |
| R9 | Low | Choose a licence for the public repository, or make it private | Decide |
| R10 | Low | Rewrite Git history to remove the old customer job name | Decide. This changes public commits |

## Only if the business grows

Login, roles, shared records across computers and automatic server backups all depend on a hosted database. Treat that as a separate project with its own security review, and keep a way to import the backup files from this version.
