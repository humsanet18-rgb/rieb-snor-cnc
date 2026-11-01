# Remaining issues

No Critical issue is open.

| Severity | Issue | What it means | Next step |
| --- | --- | --- | --- |
| High | Not tested on Mach3 or a real machine | Generated files have never moved a machine | Mach3 display check, cold dry run, scrap cut |
| High | Records exist in one browser | A browser reset or lost device loses them unless a backup exists | Save a backup weekly, away from this computer |
| High | Two live addresses hold separate records | Vercel and GitHub Pages do not share data | Use the Vercel address only |
| High | No login or roles, by the owner's choice | Anyone using this browser can read and change records. Changes cannot be traced to a person | Use a protected Windows account. A hosted system would be a separate project |
| Medium | One full browser run failed 4 tests | Cause not proven. Two later runs passed 62 of 62. See [TEST_RESULTS.md](TEST_RESULTS.md) | Investigate if it comes back |
| Medium | Firefox not tested | Windows blocks the test browser here | Run the Firefox suite on another computer |
| Medium | Real phone and tablet not tested | Sizes were set in a desktop browser | Try it on the workshop's device |
| Medium | Printing not tested | PDFs were checked on screen only | Print one invoice |
| Medium | Two tabs on one cutting project: last save wins | Shop records are protected, projects are not | Keep one tab open. Code change R6 |
| Medium | GitHub Pages sends no security headers | Vercel does | Use Vercel |
| Medium | Backup file is plain text | It contains customer details | Store it privately |
| Medium | Old commits contain a customer job name | The public history keeps it. Customer files were never committed | The owner decides whether to rewrite history |
| Low | Browser's own `confirm()` box in two places | It works and is translated, but looks different | Code change R7 |
| Low | No column sorting in the phone card layout | Search and filters still work | Code change R8 |
| Low | Time estimate from a project has no test | The field can always be typed by hand | Add a test |
| Low | Saving failure for shop records has no test | The message path is written but was not forced | Add a test |
| Low | No licence chosen | Others have no clear right to reuse the code | The owner decides |

Limits of the design are in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
