# Deployment guide

The app is a static site. There is no server, database or environment variable. Everything runs in the visitor's browser, and files are never uploaded.

## Build

```bash
npm ci
```

```bash
npm run build
```

Publish the `dist/` folder. All paths are relative, so it works at a domain root or in a sub-folder.

## Hosts

HTTPS is required. Service workers, and so offline use, only work over HTTPS or on localhost.

### Cloudflare Pages or Netlify

Build command `npm run build`, output directory `dist`. Both read `public/_headers`, which is copied into `dist/`.

### Vercel

`vercel.json` already sets the build command, output directory and headers.

### GitHub Pages

Publish `dist/` with the Pages action. Pages ignores `_headers`, so the security headers below will be missing. The Content Security Policy still applies, because it is a `<meta>` tag in the page.

### nginx or Apache

Serve `dist/` as static files and add the headers below. `.webmanifest` should be sent as `application/manifest+json`, and `.woff2` as `font/woff2`.

## Headers

| Header | Value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cache-Control` for `/assets/*` | `public, max-age=31536000, immutable` |
| `Cache-Control` for `/sw.js` | `no-cache` |

`sw.js` must not be cached for long, or visitors will stay on the old version.

## Updates

Each build produces hashed asset names and a new service worker version. Visitors get the new version on their next page load after the worker installs, and old caches are deleted. Project files have a version number; `parseProjectFile` refuses versions newer than the app, so raise `FILE_VERSION` and add a migration when the format changes.

## Before going public

1. Add your real domain to `index.html` as `<link rel="canonical">` and `og:url`, and add a `sitemap.xml` if you want one. They were left out because the domain is not known yet.
2. Add a licence, plus a privacy note and terms of use that suit your country. The app's safety warnings are not a legal disclaimer.
3. Confirm the private customer files are not in the repository or in `dist/`. `.gitignore` excludes `tests/fixtures/private/`.
4. Run the full test suite on the final commit.
5. Cut a real job from a generated TAP file, with the dry-run procedure in the README, before recommending the app to anyone.

## Cloud features

None exist. Sync, accounts and sharing would be a later project and would need their own security review.
