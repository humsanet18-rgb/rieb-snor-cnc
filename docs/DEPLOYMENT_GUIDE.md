# Deployment guide (short form)

The full guide is [DEPLOYMENT.md](DEPLOYMENT.md). This page is the checklist for a release.

No environment variables, database migrations or secrets are needed. Shop records and projects are in each browser, so a release cannot change or lose them on the server side.

## Release

```bash
npm ci
```

```bash
npm run build
```

```bash
npm test
```

```bash
npx playwright test --project=chromium --project=webkit
```

Check that nothing private is staged before committing:

```bash
git status --short
```

A push to `main` then deploys to Vercel and to GitHub Pages.

## After a release

1. Open https://rieb-snor-cnc.vercel.app/ and confirm the new build loaded. An open tab may need one reload for the service worker to change.
2. Open Shop and confirm existing records are present in a browser that already had some.
3. Check that the browser console has no errors.
4. Check the deployment status in the Vercel dashboard. That needs the owner's sign-in.

Rollback steps are in [DEPLOYMENT.md](DEPLOYMENT.md).
