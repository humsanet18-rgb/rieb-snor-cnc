import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTap } from '../../src/engines/gcode-engine/tap';
import { readZip } from '../../src/engines/export/zip';
import { apply, goTo, openNesting } from './nav';

const samples = join(process.cwd(), 'public', 'samples');
const sample = (name: string) => join(samples, name);

async function bytes(d: Download): Promise<Buffer> { return readFileSync((await d.path())!); }

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
}

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app')).toBeVisible();
  await page.getByTestId('lang').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await goTo(page, 'import');
  await expect(page.getByTestId('side-panel')).toContainText('Designs');
}

async function importSample(page: Page, name = 'block-letters.svg') {
  await page.getByTestId('file-input').setInputFiles(sample(name));
  await expect(page.getByTestId('design-list')).toContainText(name.replace('.svg', ''));
}

/** Runs nesting in its window and applies the result. */
async function generate(page: Page) {
  await openNesting(page);
  await page.getByTestId('seconds').selectOption('3');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('generate')).toBeEnabled({ timeout: 30_000 });
  await apply(page);
  await expect(page.getByTestId('stat-sheets')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('stat-cut')).not.toHaveText(/^0\.00/, { timeout: 30_000 });
}

test('imports, nests, validates and exports real files', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await importSample(page);
  await generate(page);
  await expect(page.getByTestId('stat-pieces')).toHaveText('11');
  await goTo(page, 'path');
  await expect(page.getByTestId('review-summary')).toContainText('No errors');

  await goTo(page, 'export');
  await expect(page.getByTestId('tap-0')).toBeDisabled();
  await expect(page.getByTestId('download-zip')).toBeDisabled();
  await page.getByTestId('confirm').check();

  const [tap] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tap-0').click()]);
  expect(tap.suggestedFilename()).toMatch(/\.tap$/);
  const text = (await bytes(tap)).toString('latin1');
  const parsed = parseTap(text);
  expect(parsed.errors).toEqual([]);
  expect(parsed.feed).toBe(500);
  expect(parsed.power).toBe(300);
  expect(parsed.moves.length).toBeGreaterThan(50);
  expect(/[^\x00-\x7f]/.test(text)).toBe(false);

  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('svg-0').click()]);
  expect((await bytes(svg)).toString()).toContain('<svg');

  const sheets = await page.getByTestId('stat-sheets').innerText();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-zip').click()]);
  const files = readZip(new Uint8Array(await bytes(zip)));
  expect(files.filter(f => f.name.endsWith('.tap')).length).toBe(+sheets);
  expect(files.filter(f => f.name.endsWith('.svg')).length).toBe(+sheets);
  // The first line is a comment with the export time; everything after it must match the single-file export.
  const body = (t: string) => t.split('\n').slice(1).join('\n');
  expect(body(new TextDecoder().decode(files.find(f => f.name.endsWith('.tap'))!.data))).toBe(body(text));

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-pdf').click()]);
  const pdfBytes = await bytes(pdf);
  expect(pdf.suggestedFilename()).toMatch(/report\.pdf$/);
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdfBytes.subarray(-6).toString()).toContain('%%EOF');

  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-project').click()]);
  expect(JSON.parse((await bytes(json)).toString()).format).toBe('rieb-snor-project');
  expect(errors).toEqual([]);
});

test('shows the path, bridges, zones and playback on the canvas', async ({ page }) => {
  await start(page);
  await importSample(page);
  await generate(page);
  await expect(page.getByTestId('zone')).toHaveCount(2);
  await expect(page.getByTestId('toolpath')).toHaveAttribute('d', /^M/);
  await expect(page.getByTestId('bridges')).toHaveAttribute('d', /^M/);
  await expect(page.getByTestId('start')).toBeVisible();
  await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('zoom')).not.toHaveText('100%');
  const box = await page.getByTestId('canvas').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('readout')).toContainText('mm');
  await page.getByTestId('fit').click();
  await page.getByTestId('play-position').fill('2000');
  await expect(page.getByTestId('head')).toBeVisible();
  await expect(page.getByTestId('play-readout')).toContainText('2.00');
  await page.getByTestId('layers').click();
  await page.getByTestId('layer-toolpath').uncheck();
  await expect(page.getByTestId('toolpath')).toHaveCount(0);
});

test('stale layouts are flagged and machine files stay blocked until reviewed again', async ({ page }) => {
  await start(page);
  await importSample(page);
  await generate(page);
  await openNesting(page);
  await page.getByTestId('gap').fill('12');
  await page.getByTestId('gap').blur();
  await expect(page.getByTestId('stale')).toBeVisible();
  await goTo(page, 'export');
  await expect(page.getByTestId('stale-summary')).toBeVisible();
  await page.getByTestId('confirm').check();
  await goTo(page, 'machine');
  await page.getByTestId('tab-wire').click();
  await page.getByTestId('feed').fill('450');
  await page.getByTestId('feed').blur();
  await goTo(page, 'export');
  await expect(page.getByTestId('confirm')).not.toBeChecked();
  await expect(page.getByTestId('tap-0')).toBeDisabled();
});

test('rejects an invalid machine profile', async ({ page }) => {
  await start(page);
  await importSample(page);
  await generate(page);
  await goTo(page, 'machine');
  await page.getByTestId('tab-wire').click();
  await page.getByTestId('feed').fill('0');
  await page.getByTestId('feed').blur();
  // While the window is open the toolpath review already sees the bad value...
  await expect(page.getByTestId('apply-problems').locator('.bad')).toHaveCount(1);
  await expect(page.getByTestId('modal-apply')).toBeDisabled();
  // ...but it can never be applied; closing puts the working value back.
  await page.getByTestId('modal-close').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('machine-modal')).toHaveCount(0);
  await goTo(page, 'path');
  await expect(page.locator('[data-code="profile-feed"]')).toHaveCount(0);
  await goTo(page, 'machine');
  await page.getByTestId('tab-wire').click();
  await expect(page.getByTestId('feed')).toHaveValue('500');
  await goTo(page, 'export');
  await expect(page.getByTestId('tap-0')).toBeDisabled();
  await expect(page.getByTestId('confirm')).toBeVisible();
});

test('restores the project after a reload and survives undo', async ({ page }) => {
  await start(page);
  await importSample(page);
  await page.getByTestId('more-0').click();
  await expect(page.getByTestId('qty-0')).toHaveText('2');
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('qty-0')).toHaveText('1');
  await page.getByTestId('redo').click();
  await page.getByTestId('project-name').fill('Shop order 12');
  await generate(page);
  await expect(page.getByTestId('save-state')).toContainText('Saved', { timeout: 5000 });
  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveValue('Shop order 12');
  await expect(page.getByTestId('home')).toContainText('Shop order 12');
  await page.getByTestId('home-continue').click();
  await expect(page.getByTestId('stat-pieces')).toHaveText('22');
  await goTo(page, 'import');
  await expect(page.getByTestId('qty-0')).toHaveText('2');
});

test('project backup restores in a clean browser and bad backups are refused', async ({ page, browser }) => {
  await start(page);
  await importSample(page);
  await generate(page);
  await goTo(page, 'export');
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-project').click()]);
  const path = (await json.path())!;
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const clean = await context.newPage();
  await start(clean);
  await clean.getByTestId('nav-open').click();
  await clean.getByTestId('project-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(clean.getByTestId('project-error')).toBeVisible();
  await clean.getByTestId('project-input').setInputFiles({ name: 'p.rieb-snor.json', mimeType: 'application/json', buffer: readFileSync(path) });
  await expect(clean.getByTestId('stat-pieces')).toHaveText('11');
  await context.close();
});

test('reports unsupported content and never runs embedded script', async ({ page }) => {
  await start(page);
  await importSample(page, 'file-with-problems.svg');
  expect(await page.title()).not.toContain('never run');
  await page.getByRole('button', { name: 'Needs correction' }).click();
  const issues = page.getByTestId('report-issues');
  await expect(issues).toContainText('Text not converted');
  await expect(issues).toContainText('Images cannot');
  await expect(issues).toContainText('Scripts were removed');
  await expect(issues).toContainText('Duplicate shapes');
  await expect(issues).toContainText('Open outlines');
});

test('a damaged file gives a clear error and adds nothing', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles({ name: 'broken.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('this is not svg at all') });
  await expect(page.getByTestId('import-failures')).toContainText('broken.svg');
  await goTo(page, 'import');
  await expect(page.getByTestId('design-list')).toHaveCount(0);
});

test('cancelling stops a long search', async ({ page }) => {
  await start(page);
  await importSample(page);
  await openNesting(page);
  await page.getByTestId('seconds').selectOption('60');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('cancel')).toBeVisible();
  await page.getByTestId('cancel').click();
  await expect(page.getByTestId('generate')).toBeEnabled();
  await expect(page.getByTestId('stat-sheets')).toHaveCount(0);
});

test('keep-position mode cuts each file where it was drawn', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles([sample('block-letters.svg'), sample('mixed-shapes.svg')]);
  await openNesting(page);
  await page.getByTestId('mode-keep').check();
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('stat-sheets')).toHaveText('2', { timeout: 20_000 });
  await apply(page);
  await expect(page.getByTestId('sheet-label')).toContainText('1 / 2');
  await page.getByTestId('next-sheet').click();
  await expect(page.getByTestId('sheet-label')).toContainText('2 / 2');
});

test('manual mode moves a piece by dragging and undo restores it', async ({ page }) => {
  await start(page);
  await importSample(page);
  await openNesting(page);
  await page.getByTestId('mode-manual').check();
  await generate(page);
  await page.getByTestId('layers').click();
  await page.getByTestId('layer-toolpath').uncheck();
  await page.getByTestId('layer-bridges').uncheck();
  await page.getByTestId('layers').click();
  // A point on the outline itself, because the middle of a letter's box may be empty foam.
  const at = await page.locator('.piece path').first().evaluate((p: SVGPathElement) => {
    const q = p.getPointAtLength(1).matrixTransform(p.getScreenCTM()!);
    return { x: q.x, y: q.y };
  });
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('piece-props')).toBeVisible();
  const before = +(await page.getByTestId('piece-x').inputValue());
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => +(await page.getByTestId('piece-x').inputValue())).toBeGreaterThan(before);
  await page.locator('body').click({ position: { x: 700, y: 20 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => +(await page.getByTestId('piece-x').inputValue())).toBeCloseTo(before, 1);
});

test('language and theme persist, Khmer renders, no broken layout at tablet width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('nav-import')).toContainText('រូបរចនា');
  await page.getByTestId('theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 820, height: 1100 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.fonts.check('16px Battambang', 'ក'))).toBe(true);
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await page.getByTestId('lang').click();
  await page.getByTestId('file-input').setInputFiles(sample('block-letters.svg'));
  await openNesting(page);
  await page.getByTestId('seconds').selectOption('3');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('stat-sheets')).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);
});

test('the editor plays the path in step with the G-code', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await page.getByTestId('nav-editor').click();
  await expect(page.getByTestId('editor-empty')).toBeVisible();
  await goTo(page, 'import');
  await importSample(page);
  await generate(page);
  await page.getByTestId('nav-editor').click();
  const current = page.getByTestId('gcode-current');
  await expect(current).toContainText('N00020 G1');
  await expect(page.getByTestId('motion-piece')).toHaveText('—');

  await page.getByTestId('next-piece').click();
  await expect(page.getByTestId('motion-piece')).toHaveText(/^1 \/ /);
  await expect(page.getByTestId('head')).toBeVisible();
  const line = await current.textContent();
  await page.getByTestId('next-move').click();
  await expect(current).not.toHaveText(line!);

  await page.getByTestId('play').click();
  await expect(page.getByTestId('played')).toBeVisible();
  const x = await page.getByTestId('motion-x').textContent();
  await expect(page.getByTestId('motion-x')).not.toHaveText(x!, { timeout: 5000 });
  await page.getByTestId('play').click();

  const shown = page.getByTestId('gcode').locator('.gline').nth(14);
  const text = (await shown.textContent())!;
  const wanted = /X([\d.]+)\s*Y([\d.]+)/.exec(text)!;
  await shown.click();
  await expect(page.getByTestId('motion-x')).toHaveText((+wanted[1]).toFixed(2));
  await expect(page.getByTestId('motion-y')).toHaveText((+wanted[2]).toFixed(2));
  await page.getByTestId('follow').check();
  await page.getByTestId('next-piece').click();
  await expect(page.getByTestId('zoom')).not.toHaveText('0%');
  expect(errors).toEqual([]);
});

test('same-height rows are cut one row at a time and the file changes with the option', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await importSample(page, 'mixed-shapes.svg');
  await openNesting(page);
  await page.getByTestId('arrange-rows').check();
  await expect(page.getByTestId('rotation')).toHaveCount(0);
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('stat-sheets')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('stat-cut')).not.toHaveText(/^0\.00/, { timeout: 30_000 });
  await apply(page);

  await page.getByTestId('nav-editor').click();
  await expect(page.getByTestId('cut-order')).toHaveValue('rows');
  const home = await page.getByTestId('motion').textContent();
  await page.getByTestId('return-home').uncheck();
  await expect(page.getByTestId('no-return')).toBeVisible();
  await expect(page.getByTestId('motion')).not.toHaveText(home!, { timeout: 10_000 });
  await goTo(page, 'path');
  await expect(page.getByTestId('review-summary')).toContainText('No errors');

  await expect(page.getByTestId('save-state')).toContainText('Saved', { timeout: 5000 });
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await page.getByTestId('nav-editor').click();
  await expect(page.getByTestId('return-home')).not.toBeChecked();
  expect(errors).toEqual([]);
});
