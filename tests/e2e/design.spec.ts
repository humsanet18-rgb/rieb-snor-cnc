import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { apply, closeModals, goTo, openNesting } from './nav';

const sample = (name: string) => join(process.cwd(), 'public', 'samples', name);

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
  await goTo(page, 'design');
  await expect(page.getByTestId('design-workspace')).toBeVisible();
}

const items = (page: Page) => page.getByTestId('design-canvas').locator('path.v-item');

/** Drags on the canvas from one offset (relative to its centre) to another. */
async function drag(page: Page, from: [number, number], to: [number, number], opts: { shift?: boolean } = {}) {
  const box = (await page.getByTestId('design-canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(cx + from[0], cy + from[1]);
  await page.mouse.down();
  await page.mouse.move(cx + (from[0] + to[0]) / 2, cy + (from[1] + to[1]) / 2, { steps: 3 });
  await page.mouse.move(cx + to[0], cy + to[1], { steps: 3 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
}

async function draw(page: Page, tool: string, from: [number, number], to: [number, number]) {
  await page.getByTestId(`tool-${tool}`).click();
  await drag(page, from, to);
}

async function setNumber(page: Page, id: string, value: number) {
  const input = page.getByTestId(id);
  await input.fill(String(value));
  await input.press('Enter');
}

test('draws shapes, edits them by number and keyboard, groups, and undoes', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  // A project from before the Design workspace opens with an empty page the size of its foam sheet.
  await page.getByTestId('tab-page').click();
  const sheetW = await page.getByTestId('design-page-w').inputValue();
  expect(Number(sheetW)).toBeGreaterThan(0);
  await expect(page.getByTestId('design-page-sheet')).toBeDisabled();
  await page.getByTestId('tab-object').click();
  await expect(page.getByTestId('design-props-empty')).toBeVisible();

  await draw(page, 'rect', [-120, -60], [20, 40]);
  await expect(items(page)).toHaveCount(1);
  await expect(page.getByTestId('design-selection')).toContainText('1 selected');
  // Drawing returns nothing else to pick: the rectangle stays selected for editing.
  await expect(page.getByTestId('design-prop-kind')).toContainText('Rectangle');
  await expect(page.getByTestId('design-prop-kind')).toContainText('4 nodes');

  await page.getByTestId('design-prop-ratio').uncheck();
  await setNumber(page, 'design-prop-w', 200);
  await setNumber(page, 'design-prop-h', 100);
  await setNumber(page, 'design-prop-x', 50);
  await setNumber(page, 'design-prop-y', 60);
  await expect(page.getByTestId('design-prop-w')).toHaveValue('200');
  await expect(page.getByTestId('design-prop-x')).toHaveValue('50');
  await expect(page.getByTestId('design-selection')).toContainText('200.0 × 100.0 mm');

  // Keyboard nudges move by 1 mm, or 10 mm with Shift.
  await page.getByTestId('design-canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.getByTestId('design-prop-x')).toHaveValue('51');
  await expect(page.getByTestId('design-prop-y')).toHaveValue('70');

  // Rotating 90° swaps width and height.
  await page.getByTestId('prop-object.rotateCw').click();
  await expect(page.getByTestId('design-prop-w')).toHaveValue('100');
  await expect(page.getByTestId('design-prop-h')).toHaveValue('200');

  await page.getByTestId('design-canvas').focus();
  await page.keyboard.press('Control+d');
  await expect(items(page)).toHaveCount(2);
  await draw(page, 'ellipse', [60, -80], [140, 0]);
  await expect(items(page)).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-pick')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('design-canvas').focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('design-selection')).toContainText('3 selected');
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('design-selection')).toContainText('1 selected');
  await expect(page.getByTestId('design-prop-kind')).toContainText('Group');
  await page.getByTestId('tb-object.ungroup').click();
  await expect(page.getByTestId('design-selection')).toContainText('3 selected');

  // Combine joins outlines into one object; break apart splits them again.
  await page.getByTestId('tb-path.combine').click();
  await expect(page.getByTestId('design-selection')).toContainText('1 selected');
  await expect(items(page)).toHaveCount(1);
  await page.getByTestId('tb-path.breakApart').click();
  await expect(items(page)).toHaveCount(3);

  // Undo walks back through combine and break apart.
  await page.getByTestId('design-canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(items(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(items(page)).toHaveCount(3);
  await page.keyboard.press('Control+y');
  await expect(items(page)).toHaveCount(1);

  // Undo and redo leave nothing selected that no longer exists, so select again before deleting.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(items(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('click, shift-click and marquee select; drag moves; handles resize', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await draw(page, 'rect', [-200, -50], [-120, 30]);
  await draw(page, 'rect', [100, -50], [180, 30]);
  await page.getByTestId('tool-pick').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('design-selection')).toContainText('Nothing selected');

  const box = (await page.getByTestId('design-canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.click(cx - 160, cy - 10);
  await expect(page.getByTestId('design-selection')).toContainText('1 selected');
  await page.keyboard.down('Shift');
  await page.mouse.click(cx + 140, cy - 10);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('design-selection')).toContainText('2 selected');
  await page.mouse.click(cx, cy + 150);
  await expect(page.getByTestId('design-selection')).toContainText('Nothing selected');
  await drag(page, [-230, -90], [-80, 60]);
  await expect(page.getByTestId('design-selection')).toContainText('1 selected');

  const x0 = Number(await page.getByTestId('design-prop-x').inputValue());
  await drag(page, [-160, -10], [-100, -10]);
  await expect.poll(async () => Number(await page.getByTestId('design-prop-x').inputValue())).toBeGreaterThan(x0 + 10);

  const w0 = Number(await page.getByTestId('design-prop-w').inputValue());
  const handle = (await page.getByTestId('handle-3').boundingBox())!;
  await page.mouse.move(handle.x + 4, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 44, handle.y + 4, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId('design-prop-w').inputValue())).toBeGreaterThan(w0 * 1.2);
  expect(errors).toEqual([]);
});

test('polyline, freehand, star and polygon options draw real paths', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await page.getByTestId('tool-polygon').click();
  await setNumber(page, 'opt-sides', 8);
  await drag(page, [-250, -100], [-150, 0]);
  await expect(page.getByTestId('design-prop-kind')).toContainText('8 nodes');

  await page.getByTestId('tool-star').click();
  await setNumber(page, 'opt-points', 7);
  await drag(page, [-120, -100], [-20, 0]);
  await expect(page.getByTestId('design-prop-kind')).toContainText('14 nodes');

  const box = (await page.getByTestId('design-canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.getByTestId('tool-polyline').click();
  await page.mouse.click(cx + 20, cy + 40);
  await page.mouse.click(cx + 120, cy + 40);
  await page.mouse.click(cx + 120, cy + 120);
  await page.keyboard.press('Enter');
  await expect(items(page)).toHaveCount(3);
  await expect(page.getByTestId('design-prop-kind')).toContainText('Polyline');
  await expect(page.getByTestId('design-open-note')).toBeVisible();

  await page.getByTestId('tool-freehand').click();
  await page.mouse.move(cx + 150, cy - 100);
  await page.mouse.down();
  for (let k = 1; k <= 20; k++) await page.mouse.move(cx + 150 + k * 5, cy - 100 + Math.sin(k / 3) * 30);
  await page.mouse.up();
  await expect(items(page)).toHaveCount(4);
  await expect(page.getByTestId('design-prop-kind')).toContainText('Freehand');
  expect(errors).toEqual([]);
});

test('send to production nests the drawn shapes; sending again replaces the design', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await draw(page, 'rect', [-150, -80], [-50, 20]);
  await draw(page, 'star', [0, -80], [100, 20]);
  await draw(page, 'line', [-150, 60], [100, 60]);
  await page.getByTestId('design-canvas').focus();
  await page.keyboard.press('Control+a');
  await page.getByTestId('tb-cnc.send').click();
  await expect(page.getByTestId('toast')).toContainText('added to production: 2 pieces');
  await expect(page.getByTestId('toast')).toContainText('1 open lines were left out');

  // Sending the same objects again updates the design instead of adding a copy.
  await page.getByTestId('tb-cnc.send').click();
  await expect(page.getByTestId('toast')).toContainText('updated in production');

  await goTo(page, 'import');
  await expect(page.getByTestId('design-list').locator('li')).toHaveCount(1);
  await openNesting(page);
  if (await page.getByTestId('seconds').isVisible()) await page.getByTestId('seconds').selectOption('3');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('generate')).toBeEnabled({ timeout: 30_000 });
  await apply(page);
  await expect(page.getByTestId('stat-cut')).not.toHaveText(/^0\.00/, { timeout: 30_000 });

  // The drawing is still there when the operator comes back.
  await goTo(page, 'design');
  await expect(items(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('imports SVG onto the page and keeps the drawing after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await page.getByTestId('design-file-input').setInputFiles(sample('block-letters.svg'));
  await expect(page.getByTestId('toast')).toContainText('is on the page');
  await expect(items(page)).toHaveCount(1);
  await expect(page.getByTestId('design-prop-name')).toHaveValue('block-letters');
  // Autosave waits for a pause in editing.
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('save-state')).toHaveClass(/(^| )saved( |$)/, { timeout: 10_000 });
  await page.reload();
  await goTo(page, 'design');
  await expect(items(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('every enabled menu command runs without an error', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  // Advanced mode shows every command.
  await page.getByTestId('tab-page').click();
  await page.getByTestId('design-mode-advanced').check();
  await page.getByTestId('tab-object').click();
  const skip = new Set(['file.new', 'file.importSvg']);
  const menus = await page.getByTestId('design-menubar').locator('[data-testid^="menu-"]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid!).filter(id => !id.startsWith('menu-pop')));
  expect(menus.length).toBe(12);
  let ran = 0;
  for (const menu of menus) {
    const ids = await (async () => {
      if (!(await page.getByTestId('design-workspace').isVisible())) { await closeModals(page); await goTo(page, 'design'); }
      await page.getByTestId(menu).click();
      const list = await page.getByTestId(`menu-pop-${menu.slice(5)}`).locator('[data-testid^="cmd-"]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid!));
      await page.keyboard.press('Escape');
      return list;
    })();
    expect(ids.length, menu).toBeGreaterThan(0);
    for (const id of ids) {
      if (skip.has(id.slice(4))) continue;
      // Fresh shapes before each command, selected, so selection commands are enabled.
      if (!(await page.getByTestId('design-workspace').isVisible())) { await closeModals(page); await goTo(page, 'design'); }
      if (await items(page).count() < 3) {
        await draw(page, 'rect', [-200, -60], [-120, 20]);
        await draw(page, 'ellipse', [-60, -60], [20, 20]);
        await draw(page, 'rect', [80, -60], [160, 20]);
        await page.getByTestId('tool-pick').click();
      }
      await page.getByTestId('design-canvas').focus();
      await page.keyboard.press('Control+a');
      await page.getByTestId(menu).click();
      const item = page.getByTestId(id);
      if (await item.isEnabled()) {
        await item.click();
        ran++;
      } else await page.keyboard.press('Escape');
      await closeModals(page);
    }
  }
  expect(ran).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('command palette, shortcuts list and toolbar customizing', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await draw(page, 'rect', [-200, -60], [-120, 20]);
  await draw(page, 'rect', [80, -60], [160, 20]);
  await page.getByTestId('design-canvas').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByTestId('design-palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('group');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('design-palette')).toBeHidden();
  await expect(page.getByTestId('design-prop-kind')).toContainText('Group');

  await page.getByTestId('menu-tools').click();
  await page.getByTestId('cmd-tools.shortcuts').click();
  await expect(page.getByTestId('design-shortcuts')).toContainText('Ctrl+G');
  await closeModals(page);

  await expect(page.getByTestId('tb-cnc.export')).toBeVisible();
  await page.getByTestId('tb-customize').click();
  await page.getByTestId('customize-remove-cnc.export').click();
  await page.getByTestId('customize-add-object.flipH').click();
  await page.getByTestId('customize-done').click();
  await expect(page.getByTestId('tb-cnc.export')).toHaveCount(0);
  await expect(page.getByTestId('tb-object.flipH')).toBeVisible();
  // The toolbar is remembered on this device.
  await page.reload();
  await goTo(page, 'design');
  await expect(page.getByTestId('tb-object.flipH')).toBeVisible();
  await page.getByTestId('tb-customize').click();
  await page.getByTestId('customize-reset').click();
  await page.getByTestId('customize-done').click();
  await expect(page.getByTestId('tb-cnc.export')).toBeVisible();
  expect(errors).toEqual([]);
});

test('menu bar works from the keyboard', async ({ page }) => {
  await start(page);
  await page.getByTestId('menu-file').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('menu-pop-file')).toBeVisible();
  await expect(page.getByTestId('cmd-file.new')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('cmd-file.open')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('menu-pop-edit')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-pop-edit')).toHaveCount(0);
  await expect(page.getByTestId('menu-edit')).toBeFocused();
});
