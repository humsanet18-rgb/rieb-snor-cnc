import { expect, type Page } from '@playwright/test';

/** Screens that stay docked beside the canvas. */
export type Section = 'home' | 'design' | 'import' | 'nest' | 'path' | 'editor' | 'projects' | 'shop' | 'settings';
/** Tools that open in a window over the workspace. */
export type ModalTool = 'import-svg' | 'text' | 'machine' | 'gcode' | 'export';

const MODALS: string[] = ['import-svg', 'text', 'machine', 'gcode', 'export'];
const MODAL_ID: Record<ModalTool, string> = { 'import-svg': 'import-modal', text: 'text-modal', machine: 'machine-modal', gcode: 'gcode-modal', export: 'export-modal' };

/**
 * Leaves every open window the way a user would: Apply when the window allows it,
 * otherwise close it and accept losing the changes.
 */
export async function closeModals(page: Page) {
  const open = page.locator('dialog.modal[open]');
  for (let i = 0; i < 4 && await open.count(); i++) {
    const modal = open.last();
    const apply = modal.getByTestId('modal-apply');
    if (await apply.count() && await apply.isEnabled()) await apply.click();
    else {
      await modal.getByTestId('modal-close').first().click();
      const yes = page.getByTestId('confirm-yes');
      if (await yes.isVisible()) await yes.click();
    }
  }
  await expect(open).toHaveCount(0);
}

/** Opens a screen or a tool window from the dock; on phones the dock lives behind the "More" tab. */
export async function goTo(page: Page, target: Section | ModalTool) {
  await closeModals(page);
  const item = page.getByTestId(`nav-${target}`);
  if (!(await item.isVisible())) await page.getByTestId('tab-more').click();
  await item.click();
  if (MODALS.includes(target)) await expect(page.getByTestId(MODAL_ID[target as ModalTool])).toBeVisible();
}

/** The nesting window, where sheet, arrangement and clamp settings live. */
export async function openNesting(page: Page) {
  await goTo(page, 'nest');
  await page.getByTestId('open-nesting').click();
  await expect(page.getByTestId('nest-modal')).toBeVisible();
}

/** Applies the open window and waits for it to close. */
export async function apply(page: Page) {
  await expect(page.getByTestId('modal-apply')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('modal-apply').click();
  await expect(page.locator('dialog.modal[open]')).toHaveCount(0);
}
