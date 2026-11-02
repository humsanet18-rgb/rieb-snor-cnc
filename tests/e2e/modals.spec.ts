import { expect, test, type Download, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTap } from '../../src/engines/gcode-engine/tap';
import { apply, closeModals, goTo, openNesting } from './nav';

const sample = (name: string) => join(process.cwd(), 'public', 'samples', name);
const shots = join(process.cwd(), 'docs', 'screenshots');

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
}

async function nested(page: Page, file = 'block-letters.svg') {
  await page.getByTestId('file-input').setInputFiles(sample(file));
  await openNesting(page);
  if (await page.getByTestId('seconds').isVisible()) await page.getByTestId('seconds').selectOption('3');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('generate')).toBeEnabled({ timeout: 30_000 });
  await apply(page);
  await expect(page.getByTestId('stat-cut')).not.toHaveText(/^0\.00/, { timeout: 30_000 });
}

const focusedTestId = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null);
const focusInside = (page: Page, id: string) => page.evaluate(t => !!document.querySelector(`[data-testid="${t}"]`)?.contains(document.activeElement), id);

test('cancelling nesting puts the project back exactly; apply is one undo step', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await page.getByTestId('file-input').setInputFiles(sample('block-letters.svg'));
  await openNesting(page);
  await page.getByTestId('seconds').selectOption('3');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('generate')).toBeEnabled({ timeout: 30_000 });
  // The result is previewed live in the window and on the sheet behind it.
  await expect(page.getByTestId('nest-preview')).toBeVisible();
  await expect(page.getByTestId('stat-sheets')).toBeVisible();
  await expect(page.getByTestId('candidates').locator('li')).toHaveCount(1);
  await page.getByTestId('modal-close').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Discard changes?');
  await page.getByTestId('confirm-no').click();
  await expect(page.getByTestId('nest-modal')).toBeVisible();
  await page.getByTestId('modal-close').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('nest-modal')).toHaveCount(0);
  await expect(page.getByTestId('stat-sheets')).toHaveCount(0);
  await expect(page.getByTestId('undo')).toBeEnabled(); // the import is still undoable, untouched

  await nested(page);
  await expect(page.getByTestId('toast')).toContainText('Changes applied');
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('stat-sheets')).toHaveCount(0);
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('stat-sheets')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a running search keeps the window open until it is stopped', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles(sample('block-letters.svg'));
  await openNesting(page);
  await page.getByTestId('seconds').selectOption('60');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('cancel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('modal-blocked')).toBeVisible();
  await expect(page.getByTestId('nest-modal')).toBeVisible();
  await expect(page.getByTestId('modal-apply')).toBeDisabled();
  await page.getByTestId('modal-blocked').getByRole('button').click();
  await expect(page.getByTestId('generate')).toBeEnabled();
  await expect(page.getByTestId('modal-blocked')).toHaveCount(0);
});

test('machine window: guarded Escape, focus kept inside and returned, verification', async ({ page }) => {
  await start(page);
  const chip = page.getByTestId('machine-chip');
  await expect(chip).toHaveClass(/incomplete/);
  await chip.click();
  await expect(page.getByTestId('machine-modal')).toBeVisible();
  expect(await focusInside(page, 'machine-modal')).toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await focusInside(page, 'machine-modal')).toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+Tab');
  expect(await focusInside(page, 'machine-modal')).toBe(true);

  // Nothing changed: Escape closes at once and focus goes back to the chip.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('machine-modal')).toHaveCount(0);
  await expect.poll(() => focusedTestId(page)).toBe('machine-chip');

  await chip.click();
  await page.getByTestId('tab-wire').click();
  await page.getByTestId('feed').fill('450');
  await page.getByTestId('feed').blur();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.keyboard.press('Escape'); // backs out of the question, not the window
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('machine-modal')).toBeVisible();
  await expect(page.getByTestId('feed')).toHaveValue('450');
  await page.keyboard.press('Escape');
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('machine-modal')).toHaveCount(0);
  await chip.click();
  await page.getByTestId('tab-wire').click();
  await expect(page.getByTestId('feed')).toHaveValue('500');

  // Travel, then a sign-off: the profile becomes verified, and editing it clears that.
  await page.getByTestId('tab-limits').click();
  await page.getByTestId('max-x').fill('1300');
  await page.getByTestId('max-y').fill('700');
  await page.getByTestId('max-y').blur();
  await page.getByTestId('tab-verify').click();
  await expect(page.getByTestId('mark-verified')).toBeDisabled();
  for (const n of [1, 2, 3]) await page.getByTestId(`verify-${n}`).check();
  await page.getByTestId('mark-verified').click();
  await expect(page.getByTestId('calib-readiness')).toHaveClass(/\bverified\b/);
  await apply(page);
  await expect(chip).toHaveClass(/\bverified\b/);
  await chip.click();
  await page.getByTestId('tab-wire').click();
  await page.getByTestId('power').fill('280');
  await page.getByTestId('power').blur();
  await expect(page.getByTestId('calib-readiness')).not.toHaveClass(/\bverified\b/);
  await apply(page);
  await expect(chip).toHaveClass(/unverified/);
});

test('axis calibration works out corrected steps per mm', async ({ page }) => {
  await start(page);
  await goTo(page, 'machine');
  await page.getByTestId('tab-axes').click();
  await page.getByTestId('calib-current').fill('200');
  await page.getByTestId('calib-commanded').fill('100');
  await page.getByTestId('calib-measured').fill('98');
  await page.getByTestId('calib-measured').blur();
  await expect(page.getByTestId('calib-result')).toContainText('204.08');
});

test('G-code window checks the file and only then allows the download', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await nested(page);
  await goTo(page, 'gcode');
  const checks = page.getByTestId('gcode-checks');
  await expect(checks.locator('[data-status="fail"]')).toHaveCount(0);
  for (const id of ['syntax', 'feed', 'power', 'sheet-bounds', 'validation']) await expect(checks.locator(`[data-check="${id}"]`)).toHaveAttribute('data-status', 'pass');
  await expect(checks.locator('[data-check="machine-bounds"]')).toHaveAttribute('data-status', 'warn');
  await expect(page.getByTestId('gcode-verdict')).toHaveClass(/ok/);
  await expect(page.getByTestId('gcode-download')).toBeDisabled();
  await page.getByTestId('gcode-confirm').check();
  await expect(page.getByTestId('gcode-download')).toBeEnabled();
  await page.getByTestId('gcode-full').click();
  await expect(page.getByTestId('gcode-modal')).toHaveClass(/full/);
  const [tap] = await Promise.all([page.waitForEvent('download'), page.getByTestId('gcode-download').click()]);
  const text = readFileSync((await (tap as Download).path())!).toString('latin1');
  const parsed = parseTap(text);
  expect(parsed.errors).toEqual([]);
  expect(parsed.feed).toBe(500);
  // The same file the export window writes.
  await page.getByTestId('gcode-to-export').click();
  await expect(page.getByTestId('export-modal')).toBeVisible();
  const [again] = await Promise.all([page.waitForEvent('download'), page.getByTestId('tap-0').click()]);
  const body = (t: string) => t.split('\r\n').slice(1).join('\r\n');
  expect(body(readFileSync((await again.path())!).toString('latin1'))).toBe(body(text));
  expect(errors).toEqual([]);
});

test('toolpath window previews the order and explains what it does not change', async ({ page }) => {
  await start(page);
  await nested(page, 'mixed-shapes.svg');
  await goTo(page, 'path');
  await page.getByTestId('open-toolpath').click();
  await expect(page.getByTestId('toolpath-modal')).toBeVisible();
  const path = page.getByTestId('toolpath-preview-path');
  const before = await path.getAttribute('d');
  await expect(page.getByTestId('cut-order')).toHaveValue('shortest');
  await page.getByTestId('cut-order').selectOption('columns');
  await expect.poll(() => path.getAttribute('d'), { timeout: 15_000 }).not.toBe(before);
  await page.getByTestId('tab-kerf').click();
  await expect(page.getByTestId('kerf-note')).toBeVisible();
  // Cancel brings the old order and the old path back.
  await page.getByTestId('modal-close').click();
  await page.getByTestId('confirm-yes').click();
  await page.getByTestId('open-toolpath').click();
  await expect(page.getByTestId('cut-order')).toHaveValue('shortest');
  await expect.poll(() => page.getByTestId('toolpath-preview-path').getAttribute('d'), { timeout: 15_000 }).toBe(before);
});

test('SVG import window: preview, cancel removes the file, apply keeps it', async ({ page }) => {
  await start(page);
  await goTo(page, 'import-svg');
  await page.getByTestId('import-file-input').setInputFiles(sample('block-letters.svg'));
  await expect(page.getByTestId('import-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('import-list')).toContainText('mm');
  await page.getByTestId('modal-close').click();
  await page.getByTestId('confirm-yes').click();
  await goTo(page, 'import');
  await expect(page.getByTestId('design-list')).toHaveCount(0);
  await goTo(page, 'import-svg');
  await page.getByTestId('import-file-input').setInputFiles(sample('block-letters.svg'));
  await expect(page.getByTestId('import-list').locator('li')).toHaveCount(1);
  await apply(page);
  await expect(page.getByTestId('design-list').locator('li')).toHaveCount(1);
});

test('renaming asks for the name in a small window; Enter confirms', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles(sample('block-letters.svg'));
  await goTo(page, 'import');
  await page.getByRole('button', { name: 'Rename block-letters' }).click();
  const input = page.getByTestId('confirm-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('block-letters');
  await input.fill('Shop sign');
  await input.press('Enter');
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('design-list')).toContainText('Shop sign');
  await page.getByRole('button', { name: 'Rename Shop sign' }).click();
  await page.getByTestId('confirm-input').fill('Never');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('design-list')).toContainText('Shop sign');
});

test('canvas: context menu, snapping and pinned tools', async ({ page }) => {
  await start(page);
  await nested(page);
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 30, box.y + 30, { button: 'right' });
  const menu = page.getByTestId('canvas-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('menu-rotate')).toBeDisabled(); // auto layout: pieces stay where nesting put them
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.mouse.click(box.x + 30, box.y + 30, { button: 'right' });
  await page.getByTestId('menu-select-all').click();
  await expect(page.getByTestId('status-selection')).toContainText(/\d+ selected/);
  await page.mouse.click(box.x + 30, box.y + 30, { button: 'right' });
  await page.getByTestId('menu-nesting').click();
  await expect(page.getByTestId('nest-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('nest-modal')).toHaveCount(0);

  await page.getByTestId('snap').click();
  await expect(page.getByTestId('snap')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('dock-customize').click();
  await page.getByTestId('pin-gcode').click();
  await page.getByTestId('dock-customize').click();
  await expect(page.getByTestId('dock-pinned').getByTestId('pinned-gcode')).toBeVisible();
  await page.reload();
  await goTo(page, 'nest');
  await expect(page.getByTestId('snap')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pinned-gcode').click();
  await expect(page.getByTestId('gcode-modal')).toBeVisible();
});

test('workflow stepper and status bar open the right tools', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles(sample('block-letters.svg'));
  await page.getByTestId('workflow-nest').click();
  await expect(page.getByTestId('side-panel')).toContainText('Nesting');
  await page.getByTestId('workflow-export').click();
  await expect(page.getByTestId('export-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('status-machine').click();
  await expect(page.getByTestId('machine-modal')).toBeVisible();
});

test('the brand is រៀបអក្សរ CNC everywhere the user can see it', async ({ page, request }) => {
  const OLD = /rieb\s*snor|រៀបស្នោ CNC/i;
  await page.goto('/');
  await expect(page).toHaveTitle(/^រៀបអក្សរ CNC/);
  await expect(page.locator('.brand-name')).toHaveText('រៀបអក្សរ CNC');
  expect(await page.getByTestId('brand-logo').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(192);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect([manifest.name, manifest.short_name]).toEqual(['រៀបអក្សរ CNC', 'រៀបអក្សរ']);
  for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).ok()).toBe(true);
  expect((await request.get('/favicon.ico')).ok()).toBe(true);
  expect(await page.locator('head').innerHTML()).not.toMatch(OLD);
  await page.getByTestId('file-input').setInputFiles(sample('block-letters.svg'));
  for (const lang of ['km', 'en']) {
    for (const s of ['home', 'import', 'nest', 'path', 'editor', 'projects', 'shop', 'settings', 'machine', 'gcode', 'export'] as const) {
      await goTo(page, s);
      expect(await page.locator('body').innerText(), `${s} (${lang})`).not.toMatch(OLD);
    }
    await closeModals(page);
    await page.getByTestId('nav-help').click();
    await expect(page.locator('dialog.modal[open]')).toBeVisible();
    expect(await page.locator('body').innerText(), `help (${lang})`).not.toMatch(OLD);
    await closeModals(page);
    await goTo(page, 'home');
    await expect(page.getByTestId('home')).toContainText(lang === 'km' ? 'សូមស្វាគមន៍មកកាន់ រៀបអក្សរ CNC' : 'Welcome to រៀបអក្សរ CNC');
    await page.getByTestId('lang').click();
  }
});

test.describe('screenshots', () => {
  test.beforeAll(() => mkdirSync(shots, { recursive: true }));

  test('desktop', async ({ page }) => {
    await start(page);
    await nested(page, 'mixed-shapes.svg');
    await page.screenshot({ path: join(shots, 'desktop-workspace.png') });
    await openNesting(page);
    await page.screenshot({ path: join(shots, 'desktop-nesting-modal.png') });
    await goTo(page, 'gcode');
    await page.screenshot({ path: join(shots, 'desktop-gcode-modal.png') });
    await goTo(page, 'machine');
    await page.screenshot({ path: join(shots, 'desktop-machine-modal.png') });
    await goTo(page, 'path');
    await page.getByTestId('canvas').click({ button: 'right', position: { x: 200, y: 160 } });
    await page.screenshot({ path: join(shots, 'desktop-context-menu.png') });
  });

  for (const [name, width, height] of [['tablet', 820, 1180], ['mobile', 390, 844]] as const) {
    test(name, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await start(page);
      await nested(page, 'mixed-shapes.svg');
      await page.screenshot({ path: join(shots, `${name}-workspace.png`) });
      await openNesting(page);
      if (width < 900) {
        // Large tools take the whole screen on phones and portrait tablets.
        const b = (await page.getByTestId('nest-modal').boundingBox())!;
        expect([Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]).toEqual([0, 0, width, height]);
      }
      await page.screenshot({ path: join(shots, `${name}-nesting-modal.png`) });
      await goTo(page, 'machine');
      await page.screenshot({ path: join(shots, `${name}-machine-modal.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});
