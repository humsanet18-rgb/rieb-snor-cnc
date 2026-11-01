# Security audit

Audit date: 2026-11-01. The app has no server, so the risks differ from a normal web system. No one else can reach the records through the internet, and equally nothing protects them from someone using the same browser.

## Results

| ID | Severity | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| S1 | High | Physical access | Customer names, phones and money records are readable by anyone who can open this browser. There is no login and no encryption at rest | Accepted by the owner's choice. Use a Windows account with a password. The backup file is plain text, so store it privately |
| S2 | High | Data loss | A browser reset, or storage eviction under disk pressure, deletes records | Reduced: backup reminder, request for persistent storage. The owner must keep the backup files |
| S3 | Medium | Headers on Pages | GitHub Pages cannot send `nosniff`, `X-Frame-Options` or `Permissions-Policy`. A page could be framed there | Open. Vercel sends all of them, so Vercel is the recommended address |
| S4 | Medium | Public repository | The source and all commits are public. Old commits contain a customer's job name in test and document text. The customer's files were never committed | Open for history. Rewriting public history is the owner's decision |
| S5 | Low | Spreadsheet injection | A typed value such as `=1+1` could run as a formula when a CSV is opened | Fixed. Such text cells are written as plain text, with a unit test |
| S6 | Low | Restore file | A damaged or hand-made backup could put bad records in the shop | Fixed. Every field, every reference and all ids are checked first, and a refused file changes nothing |
| S7 | Low | Second tab | A stale tab could overwrite newer records | Fixed. A revision check refuses the save and asks the user to repeat it |

## Checks performed

| Check | Result |
| --- | --- |
| Secrets in source, `public/` and workflows | None found. The workflow uses only GitHub's own short-lived token |
| `.env`, key or private customer files tracked by Git | None |
| `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write` in `src/` | None |
| React text output | Escaped by React, so customer text cannot inject markup |
| SVG import | Parsed into geometry and never inserted into the page |
| Content Security Policy | Set as a meta tag in the built page. A meta tag cannot set `frame-ancestors`; `X-Frame-Options` covers that on Vercel |
| Network use | The app makes no requests except for its own files. Records are not sent anywhere |
| Dependencies | See `npm audit` in [TEST_RESULTS.md](TEST_RESULTS.md). Runtime dependencies are React and two font packages |
| Logging | The app does not log records, and it holds no passwords or tokens |

## Security features that were not added

Encoding records, or adding a browser password, would look like protection without providing any, and the master task forbids this. Roles are not shown for the same reason. These become meaningful only with a server, and then need a separate review.

## Vercel headers

`vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`, and Vercel adds HSTS. The existing configuration was left as it was.
