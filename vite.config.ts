/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server needs inline scripts for hot reload, so the policy goes into the production page only.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ');
const contentSecurityPolicy = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: html => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`)
});

const PUBLIC_FILES = ['./', 'manifest.webmanifest', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'samples/block-letters.svg', 'samples/mixed-shapes.svg', 'samples/file-with-problems.svg'];

/** The first visit runs before the worker controls the page, so every file is listed for install time. */
const serviceWorker = (): Plugin => ({
  name: 'service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const files = Object.keys(bundle).filter(f => f !== 'index.html');
    const version = createHash('sha256').update(files.join()).digest('hex').slice(0, 12);
    const source = readFileSync('src/workers/sw.js', 'utf8')
      .replace('__VERSION__', version)
      .replace('[/*FILES*/]', JSON.stringify([...PUBLIC_FILES, ...files]));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  }
});

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy(), serviceWorker()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 60000
  }
});
