# Installation guide

Operators need nothing installed. They open the published site in a browser. This guide is for running or changing the code.

## Requirements

- Node.js 22 or newer (tested on 24.13)
- npm 10 or newer
- About 300 MB of disk, plus about 500 MB for test browsers

## Install and run

```bash
npm install
```

```bash
npm run dev
```

The app opens at `http://localhost:5173`. Saved projects live in that browser, under that address.

## Build and preview

```bash
npm run build
```

```bash
npm run preview
```

The build first runs the strict TypeScript check. Output goes to `dist/`, and preview serves it at `http://localhost:4173`. The service worker and the Content Security Policy only apply to this production build.

## Tests

```bash
npm test
```

```bash
npx playwright install chromium webkit firefox
```

```bash
npm run build
```

```bash
npm run test:e2e
```

Browser tests run against the production build, so build first. See [TESTING.md](TESTING.md).

The regression tests need the customer files in `tests/fixtures/private/`. They are excluded from the repository, and those tests skip themselves when the files are absent.

## Regenerate the samples and icons

```bash
node scripts/make-samples.mjs
```

```bash
python scripts/make-icons.py
```
