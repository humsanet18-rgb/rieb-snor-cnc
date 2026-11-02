import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { apply, goTo, openNesting, type ModalTool, type Section } from './nav';

const sample = (name: string) => join(process.cwd(), 'public', 'samples', name);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByTestId('lang').click();
  await expect(page.getByTestId('home')).toBeVisible();
}

/** Runs nesting in the open nesting window (opening it if needed) and applies the result. */
async function generate(page: Page) {
  if (!(await page.getByTestId('nest-modal').isVisible())) await openNesting(page);
  // Rows arrangement has no search time to choose.
  if (await page.getByTestId('seconds').isVisible()) await page.getByTestId('seconds').selectOption('3');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('generate')).toBeEnabled({ timeout: 30_000 });
  await apply(page);
  await expect(page.getByTestId('stat-cut')).not.toHaveText(/^0\.00/, { timeout: 30_000 });
}

test('Khmer text becomes cut-ready outlines at the chosen reference height', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await page.getByTestId('home-text').click();
  await expect(page.getByTestId('text-modal')).toBeVisible();
  await expect(page.getByTestId('text-step-1')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('text-step-4')).toHaveAttribute('data-state', 'waiting');
  await page.getByTestId('text-input').fill('សួស');
  await page.getByTestId('text-input').pressSequentially('្តី');
  await expect(page.getByTestId('text-input')).toBeVisible();
  await page.getByTestId('text-next-1').click();
  await page.getByTestId('ref-height').fill('60');
  await page.getByTestId('ref-height').blur();
  await expect(page.getByTestId('ref-explain')).toContainText('60');
  await expect(page.getByTestId('ref-bar')).toBeVisible();
  await page.getByTestId('text-next-2').click();

  await page.getByTestId('text-preview-ok').click();
  await page.getByTestId('text-convert').click();
  await expect(page.getByTestId('text-step-4')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(page.getByTestId('text-stats')).toBeVisible();
  await expect(page.getByTestId('text-curves')).toBeVisible();
  const ref = parseFloat(await page.getByTestId('text-ref').innerText());
  expect(Math.abs(ref - 60)).toBeLessThan(1);
  expect(+(await page.getByTestId('text-pieces').innerText())).toBeGreaterThan(1);

  await page.getByTestId('text-accept').click();
  await expect(page.getByTestId('text-step-5')).toHaveAttribute('data-state', 'done');
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('text-svg').click()]);
  expect(svg.suggestedFilename()).toBe('khmer-text-60mm.svg');
  await page.getByTestId('text-add').click();
  await expect(page.getByTestId('toast')).toContainText('Added');
  await expect(page.getByTestId('text-modal')).toHaveCount(0);
  await expect(page.getByTestId('side-panel')).toContainText('Nesting');
  await generate(page);
  await goTo(page, 'import');
  await expect(page.getByTestId('design-list').locator('li')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('several pieces can be selected, measured, aligned and the change undone', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles(sample('mixed-shapes.svg'));
  await openNesting(page);
  await page.getByTestId('mode-manual').check();
  await generate(page);
  await page.getByTestId('select-all').click();
  await expect(page.getByTestId('multi-props')).toBeVisible();
  await expect(page.getByTestId('status-selection')).toContainText(/\d+ selected/);
  await expect(page.getByTestId('dims')).toBeVisible();
  const width = async () => parseFloat(await page.getByTestId('sel-w').innerText());
  const before = await width();
  await page.getByTestId('align-left').click();
  await expect(page.getByTestId('toast')).toContainText('Moved');
  expect(await width()).toBeLessThan(before);
  await page.keyboard.press('Control+z');
  await expect.poll(width).toBeCloseTo(before, 1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('multi-props')).toHaveCount(0);
});

test('the row list, the row bands on the sheet and the cut order are the same rows', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles(sample('mixed-shapes.svg'));
  await openNesting(page);
  await page.getByTestId('arrange-rows').check();
  await generate(page);
  const rows = page.getByTestId('row-list').locator('button');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const n = await rows.count();
  expect(n).toBeGreaterThan(1);
  await expect(page.getByTestId('row-band')).toHaveCount(n);
  await page.getByTestId('row-1').click();
  await expect(page.locator('.row-band.on')).toHaveCount(1);
  await expect(page.locator('.row-band.off')).toHaveCount(n - 1);
  await expect(page.getByTestId('direction')).toHaveAttribute('d', /^M/);
  await goTo(page, 'path');
  await expect(page.getByTestId('sequence-card').getByTestId('row-list').locator('button')).toHaveCount(n);
});

test('deleting a design asks first and can be cancelled', async ({ page }) => {
  await start(page);
  await page.getByTestId('file-input').setInputFiles(sample('block-letters.svg'));
  await expect(page.getByTestId('design-list').locator('li')).toHaveCount(1);
  await page.getByTestId('design-list').getByRole('button', { name: 'Remove block-letters' }).click();
  await page.getByTestId('confirm-no').click();
  await expect(page.getByTestId('design-list').locator('li')).toHaveCount(1);
  await page.getByTestId('design-list').getByRole('button', { name: 'Remove block-letters' }).click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('design-list')).toHaveCount(0);
});

// Docked screens and every tool window, checked with the window open over the workspace.
const SCREENS: (Section | ModalTool)[] = ['home', 'import', 'import-svg', 'text', 'nest', 'machine', 'path', 'gcode', 'export', 'editor', 'projects', 'settings'];
for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 800]] as const) {
  test(`every section fits and keeps the canvas usable at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await start(page);
    await page.getByTestId('file-input').setInputFiles(sample('mixed-shapes.svg'));
    await generate(page);
    for (const lang of ['en', 'km']) {
      for (const s of SCREENS) {
        await goTo(page, s);
        const over = await page.evaluate(() => {
          const limit = document.documentElement.clientWidth;
          const cut = [...document.querySelectorAll('button, input, select, textarea')].filter(e => {
            const r = e.getBoundingClientRect();
            // Tab strips scroll sideways on narrow screens, like the shop's section bar.
            if (!r.width || e.closest('details:not([open]), [role="tablist"]')) return false;
            return r.right > limit + 1 || r.left < -1;
          }).map(e => (e as HTMLElement).dataset.testid ?? e.textContent);
          const modal = document.querySelector('dialog.modal[open]');
          const box = modal?.getBoundingClientRect();
          if (box && (box.right > limit + 1 || box.left < -1)) cut.push('modal');
          const canvas = modal ? null : document.querySelector('.canvas-wrap')?.getBoundingClientRect().height ?? null;
          return { wide: document.documentElement.scrollWidth - limit, cut, small: canvas !== null && canvas < 150 };
        });
        expect(over, `${s} (${lang})`).toEqual({ wide: 0, cut: [], small: false });
      }
      await page.getByTestId('lang').click();
    }
  });
}
