import type { Page } from '@playwright/test';

export type Section = 'home' | 'import' | 'text' | 'nest' | 'machine' | 'path' | 'export' | 'editor' | 'projects' | 'shop' | 'settings';

/** Opens a screen from the side rail; on phones the rail lives behind the "More" tab. */
export async function goTo(page: Page, section: Section) {
  const item = page.getByTestId(`nav-${section}`);
  if (!(await item.isVisible())) await page.getByTestId('tab-more').click();
  await item.click();
}
