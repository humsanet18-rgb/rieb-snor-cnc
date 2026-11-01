import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
  await expect(page.getByTestId('step-1')).toContainText('Import SVG');
  await page.getByTestId('view-shop').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await expect(page.getByTestId('shop-welcome')).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByTestId(`shop-${name}`).click();

async function addCustomer(page: Page, name: string, phone: string) {
  await tab(page, 'customers');
  await page.getByTestId('customer-new').click();
  await page.getByTestId('customer-name').fill(name);
  await page.getByTestId('customer-phone').fill(phone);
  await page.getByTestId('customer-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('customer-form')).toBeHidden();
  await expect(page.getByTestId('customers-table')).toContainText(name);
}

async function addOrder(page: Page, customer: string, title: string, price: string) {
  await tab(page, 'orders');
  await page.getByTestId('order-new').click();
  await page.getByTestId('order-customer').selectOption({ label: customer });
  await page.getByTestId('order-title').fill(title);
  await page.getByTestId('item-description').fill('Foam letters');
  await page.getByTestId('item-qty').fill('2');
  await page.getByTestId('item-price').fill(price);
  await page.getByTestId('order-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('order-form')).toBeHidden();
  await expect(page.getByTestId('order-total')).toBeVisible();
}

const closeDialog = (page: Page) => page.keyboard.press('Escape');
const detailStatus = (page: Page) => page.getByRole('dialog').getByTestId('status');

test('a job runs from customer to report and survives a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);

  await addCustomer(page, 'Sok Dara', '012345678');

  await tab(page, 'stock');
  await page.getByTestId('material-new').click();
  await page.getByTestId('material-name').fill('Foam 5 cm');
  await page.getByTestId('material-cost').fill('3.00');
  await page.getByTestId('material-low').fill('2');
  await page.getByTestId('material-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('stock-table')).toContainText('Foam 5 cm');
  await page.getByTestId('stock-move').click();
  await page.getByTestId('move-qty').fill('5');
  await page.getByTestId('move-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('stock-table')).toContainText('5');

  await addOrder(page, 'Sok Dara', 'Shop sign', '12.50');
  await expect(page.getByTestId('order-total')).toHaveText('$25.00');
  await expect(detailStatus(page)).toHaveText('Quote');

  await page.getByTestId('status-pending').click();
  await expect(detailStatus(page)).toHaveText('Waiting');

  await page.getByTestId('add-payment').click();
  await page.getByTestId('payment-amount').fill('99');
  await page.getByTestId('payment-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('payment-form')).toContainText('more than the balance');
  await page.getByTestId('payment-amount').fill('10');
  await page.getByTestId('payment-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('order-balance')).toHaveText('$15.00');

  await page.getByTestId('use-stock').click();
  await page.getByTestId('use-qty').fill('50');
  await page.getByTestId('use-stock-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('use-stock-form')).toContainText('Only 5 in stock');
  await page.getByTestId('use-qty').fill('4');
  await page.getByTestId('use-stock-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('use-stock-form')).toBeHidden();
  await closeDialog(page);

  await tab(page, 'production');
  await page.getByTestId('queue-start').click();
  await expect(page.getByTestId('queue-finish')).toBeVisible();
  await page.getByTestId('queue-finish').click();
  await expect(page.getByTestId('history-table')).toContainText('Shop sign');
  await expect(page.getByTestId('queue-table')).toBeHidden();

  await tab(page, 'money');
  await expect(page.getByTestId('money-received')).toHaveText('$10.00');
  await expect(page.getByTestId('money-owed')).toHaveText('$15.00');
  await page.getByTestId('expense-new').click();
  await page.getByTestId('expense-category').fill('Wire');
  await page.getByTestId('expense-amount').fill('4');
  await page.getByTestId('expense-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('money-expenses')).toHaveText('$4.00');

  await tab(page, 'reports');
  await expect(page.getByTestId('report-created')).toHaveText('1');
  await expect(page.getByTestId('report-completed')).toHaveText('1');
  await expect(page.getByTestId('report-result')).toHaveText('$6.00');
  await expect(page.getByTestId('report-materials')).toContainText('Foam 5 cm');
  const csv = page.waitForEvent('download');
  await page.getByTestId('csv-orders').click();
  const text = readFileSync((await (await csv).path())!, 'utf8');
  expect(text).toContain('Shop sign');
  expect(text).toContain('25.00');

  await tab(page, 'dashboard');
  await expect(page.getByTestId('dash-received')).toHaveText('$10.00');
  await expect(page.getByTestId('dash-owed')).toHaveText('$15.00');
  await expect(page.getByTestId('alerts')).toContainText('Low stock: Foam 5 cm');
  await expect(page.getByTestId('dash-activity')).toContainText('Payment recorded');

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByTestId('view-shop').click();
  await expect(page.getByTestId('dash-owed')).toHaveText('$15.00');
  expect(errors).toEqual([]);
});

test('validation stops a bad order and keeps what was typed', async ({ page }) => {
  await start(page);
  await addCustomer(page, 'Dara', '011');
  await tab(page, 'orders');
  await page.getByTestId('order-new').click();
  await page.getByTestId('item-qty').fill('0');
  await page.getByTestId('item-price').fill('abc');
  await page.getByTestId('order-form').getByRole('button', { name: 'Save' }).click();
  const form = page.getByTestId('order-form');
  for (const m of ['Choose a customer', 'Enter a job name', 'Describe this item', 'Enter a quantity above 0', 'Enter an amount such as']) await expect(form).toContainText(m);
  await expect(page.getByTestId('item-price')).toHaveValue('abc');
});

test('duplicate customers are refused and archiving keeps their orders', async ({ page }) => {
  await start(page);
  await addCustomer(page, 'Dara', '011');
  await page.getByTestId('customer-new').click();
  await page.getByTestId('customer-name').fill('dara');
  await page.getByTestId('customer-phone').fill('011');
  await page.getByTestId('customer-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('customer-form')).toContainText('already exists');
  await closeDialog(page);
  await addOrder(page, 'Dara', 'Sign', '5');
  await closeDialog(page);
  await tab(page, 'customers');
  await page.getByTestId('customers-table').getByRole('button', { name: 'Dara' }).click();
  await page.getByTestId('customer-archive').click();
  await expect(page.getByRole('dialog')).toContainText('archived');
  await closeDialog(page);
  await expect(page.getByTestId('customers-table')).toBeHidden();
  await page.getByTestId('show-archived').check();
  await expect(page.getByTestId('customers-table')).toContainText('Dara');
  await tab(page, 'orders');
  await expect(page.getByTestId('orders-table')).toContainText('Dara');
});

test('order numbers stay unique after a copy, a cancel and a repeat', async ({ page }) => {
  await start(page);
  await addCustomer(page, 'Dara', '011');
  await addOrder(page, 'Dara', 'Sign', '5');
  await page.getByTestId('copy-order').click();
  await closeDialog(page);
  await expect(page.getByTestId('orders-table').locator('tbody tr')).toHaveCount(2);
  const numbers = await page.getByTestId('orders-table').locator('tbody tr td:first-child').allInnerTexts();
  expect(new Set(numbers).size).toBe(2);
  await page.getByTestId('order-filter').selectOption('quote');
  await expect(page.getByTestId('orders-table').locator('tbody tr')).toHaveCount(2);
  await page.getByTestId('orders-table').locator('tbody tr').first().getByRole('button').first().click();
  await page.getByTestId('status-cancelled').click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Cancel order' }).click();
  await expect(detailStatus(page)).toHaveText('Cancelled');
  await closeDialog(page);
  await expect(page.getByTestId('orders-table').locator('tbody tr')).toHaveCount(1);
});

test('mistakes can be corrected: queue, payment, stock count and customer', async ({ page }) => {
  await start(page);
  await addCustomer(page, 'Dara', '011');
  await addOrder(page, 'Dara', 'First job', '5');
  await page.getByTestId('status-pending').click();
  await page.getByTestId('add-payment').click();
  await page.getByTestId('payment-amount').fill('4');
  await page.getByTestId('payment-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('order-balance')).toHaveText('$6.00');
  await page.getByRole('button', { name: 'Remove payment' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByTestId('order-balance')).toHaveText('$10.00');
  await closeDialog(page);
  await addOrder(page, 'Dara', 'Second job', '5');
  await page.getByTestId('status-pending').click();
  await closeDialog(page);

  await tab(page, 'production');
  const rows = page.getByTestId('queue-table').locator('tbody tr');
  await expect(rows.first()).toContainText('First job');
  await rows.nth(1).getByRole('button', { name: 'Move up the queue' }).click();
  await expect(rows.first()).toContainText('Second job');

  await tab(page, 'stock');
  await page.getByTestId('material-new').click();
  await page.getByTestId('material-name').fill('Foam');
  await page.getByTestId('material-form').getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('stock-move').click();
  await page.getByTestId('move-qty').fill('10');
  await page.getByTestId('move-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('stock-table').locator('tbody tr')).toContainText('10');
  await page.getByTestId('stock-move').click();
  await page.getByTestId('move-kind').selectOption('adjust');
  await page.getByTestId('move-qty').fill('7');
  await page.getByTestId('move-form').getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('stock-history').click();
  await expect(page.getByTestId('move-history')).toContainText('Count correction');
  await closeDialog(page);

  await tab(page, 'customers');
  await page.getByTestId('customers-table').getByRole('button', { name: 'Dara' }).click();
  await page.getByTestId('customer-edit').click();
  await page.getByTestId('customer-name').fill('Dara Sok');
  await page.getByTestId('customer-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('customer-form')).toBeHidden();
  await page.getByTestId('customer-archive').click();
  await page.getByTestId('customer-archive').click();
  await closeDialog(page);
  await expect(page.getByTestId('customers-table')).toContainText('Dara Sok');
});

test('an order links to a cutting project and opens it', async ({ page }) => {
  await start(page);
  await page.getByTestId('view-work').click();
  await page.getByTestId('project-name').fill('Linked job');
  await expect(page.getByTestId('save-state')).toHaveText('Saved on this device', { timeout: 10_000 });
  await page.getByTestId('nav-new').click();
  await expect(page.getByTestId('project-name')).not.toHaveValue('Linked job');
  await expect(page.getByTestId('save-state')).toHaveText('Saved on this device', { timeout: 10_000 });
  await page.getByTestId('view-shop').click();
  await addCustomer(page, 'Dara', '011');
  await tab(page, 'orders');
  await page.getByTestId('order-new').click();
  await page.getByTestId('order-customer').selectOption({ label: 'Dara' });
  await page.getByTestId('order-title').fill('Sign');
  await page.getByTestId('item-description').fill('Letters');
  await page.getByTestId('order-project').selectOption({ label: 'Linked job' });
  await page.getByTestId('order-form').getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('open-project').click();
  await expect(page.getByTestId('project-name')).toHaveValue('Linked job');
  await expect(page.getByTestId('step-1')).toBeVisible();
});

test('quotation and invoice PDFs download', async ({ page }) => {
  await start(page);
  await addCustomer(page, 'Dara', '011');
  await addOrder(page, 'Dara', 'ស្លាកហាង', '5');
  const quote = page.waitForEvent('download');
  await page.getByTestId('order-pdf').click();
  const d = await quote;
  expect(d.suggestedFilename()).toMatch(/^ORD-\d{4}-0001\.pdf$/);
  expect(readFileSync((await d.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByTestId('status-pending').click();
  await expect(page.getByTestId('order-pdf')).toHaveText('Invoice PDF');
  await closeDialog(page);
  await tab(page, 'reports');
  const report = page.waitForEvent('download');
  await page.getByTestId('report-pdf').click();
  expect(readFileSync((await (await report).path())!).subarray(0, 5).toString()).toBe('%PDF-');
});

test('a backup restores everything and a bad file changes nothing', async ({ page }) => {
  await start(page);
  await addCustomer(page, 'Keep Me', '011');
  await tab(page, 'settings');
  await page.getByTestId('shop-name').fill('Rieb Snor');
  await page.getByTestId('shop-save').click();
  await expect(page.getByTestId('shop-name')).toHaveValue('Rieb Snor');
  const saved = page.waitForEvent('download');
  await page.getByTestId('shop-backup').click();
  const file = (await (await saved).path())!;
  await expect(page.getByTestId('last-backup')).not.toContainText('never');
  const backup = readFileSync(file, 'utf8');
  expect(JSON.parse(backup).format).toBe('rieb-snor-shop');

  await addCustomer(page, 'Remove Me', '012');
  await tab(page, 'settings');
  await page.getByTestId('shop-restore-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"nope"}') });
  await expect(page.getByTestId('toast')).toContainText('not a usable shop backup');
  await tab(page, 'customers');
  await expect(page.getByTestId('customers-table')).toContainText('Remove Me');

  await tab(page, 'settings');
  await page.getByTestId('shop-restore-input').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.getByRole('button', { name: 'Replace records' }).click();
  await tab(page, 'customers');
  await expect(page.getByTestId('customers-table')).toContainText('Keep Me');
  await expect(page.getByTestId('customers-table')).not.toContainText('Remove Me');
  await tab(page, 'settings');
  await expect(page.getByTestId('shop-name')).toHaveValue('Rieb Snor');
});

test('a second tab sees changes, and a stale save is refused', async ({ page, context }) => {
  await start(page);
  await addCustomer(page, 'First', '011');
  const other = await context.newPage();
  await other.goto('/');
  await other.getByTestId('view-shop').click();
  await other.getByTestId('shop-customers').click();
  await expect(other.getByTestId('customers-table')).toContainText('First');
  await addCustomer(page, 'Second', '012');
  await expect(other.getByTestId('customers-table')).toContainText('Second');
  await other.close();

  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('rieb-snor-shop');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const store = open.result.transaction('data', 'readwrite').objectStore('data');
      const read = store.get('main');
      read.onsuccess = () => {
        const put = store.put({ ...read.result, rev: read.result.rev + 1 }, 'main');
        put.onsuccess = () => { open.result.close(); resolve(); };
      };
    };
  }));
  await page.getByTestId('customer-new').click();
  await page.getByTestId('customer-name').fill('Third');
  await page.getByTestId('customer-phone').fill('013');
  await page.getByTestId('customer-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('toast')).toContainText('Another tab changed');
  await expect(page.getByTestId('customer-form')).toBeVisible();
});

test('the shop screen works in Khmer', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('view-shop').click();
  await expect(page.getByTestId('shop-orders')).toHaveText('ការបញ្ជាទិញ');
  await page.getByTestId('shop-settings').click();
  await expect(page.getByTestId('shop-backup')).toHaveText('រក្សាឯកសារបម្រុង');
});

for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]] as const) {
  test(`every screen fits at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByTestId('lang').click();
    const fits = async (where: string) => {
      const over = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        const wide = document.documentElement.scrollWidth - limit;
        const cut = [...document.querySelectorAll('button, input, select, a')].filter(e => {
          const r = e.getBoundingClientRect();
          if (!r.width || e.closest('details:not([open]), .shop-nav')) return false;
          return r.right > limit + 1 || r.left < -1;
        }).map(e => (e as HTMLElement).dataset.testid ?? e.textContent);
        return { wide, cut };
      });
      expect(over, where).toEqual({ wide: 0, cut: [] });
    };
    await fits('work');
    await page.getByTestId('layers').click();
    await fits('layer menu');
    await page.getByTestId('layers').click();
    await page.getByTestId('view-editor').click();
    await fits('editor');
    await page.getByTestId('view-shop').click();
    await addCustomer(page, 'A long customer name for a narrow phone screen', '012345678');
    await addOrder(page, 'A long customer name for a narrow phone screen', 'A very long job name that has to wrap on a phone', '1234.50');
    await fits('order detail');
    await closeDialog(page);
    for (const name of ['dashboard', 'orders', 'production', 'customers', 'stock', 'money', 'reports', 'settings']) {
      await tab(page, name);
      await fits(name);
    }
  });
}
