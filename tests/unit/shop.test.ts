import { describe, expect, it } from 'vitest';
import {
  actualMinutes, applyStatus, emptyShop, finishedLate, formatMoney, isDelayed, isLow, needsBackup, orderNumber, orderTotals, overview, parseMoney, queueOf, report, STATUS_NEXT, stockOf, toCsv, totalsOf
} from '../../src/features/shop/logic';
import { parseShopFile, readShop, ShopFileError, SHOP_FORMAT, toShopFile } from '../../src/services/shop-io';
import type { OrderStatus, ShopData, ShopOrder } from '../../src/types/shop';

const at = '2026-10-01T03:00:00.000Z';

const order = (over: Partial<ShopOrder> = {}): ShopOrder => ({
  id: 'o1', number: 'ORD-2026-0001', customerId: 'c1', title: 'Letters', status: 'pending', dueDate: '', notes: '', projectId: null, projectName: '',
  items: [{ id: 'i1', description: 'Foam letter', qty: 3, unitPrice: 1250 }], discount: 0, taxRate: 0, estMinutes: null, machine: '', assignee: '', queue: 1,
  startedAt: null, finishedAt: null, createdAt: at, updatedAt: at, ...over
});

function shop(): ShopData {
  const d = emptyShop();
  d.customers = [{ id: 'c1', name: 'Sok', phone: '012', address: '', notes: '', archived: false, createdAt: at, updatedAt: at }];
  d.materials = [{ id: 'm1', name: 'Foam 5cm', widthMm: 1000, heightMm: 480, thicknessMm: 50, unitCost: 300, lowStock: 2, archived: false, createdAt: at }];
  d.orders = [order()];
  return d;
}

describe('money', () => {
  it('reads typed amounts into whole minor units', () => {
    expect(parseMoney('12.50', 'USD')).toBe(1250);
    expect(parseMoney('1,250', 'USD')).toBe(125000);
    expect(parseMoney('0.1', 'USD')).toBe(10);
    expect(parseMoney('4000', 'KHR')).toBe(4000);
  });

  it('refuses text that is not an amount', () => {
    for (const s of ['', 'abc', '-5', '1.234', '1e3', '.5']) expect(parseMoney(s, 'USD')).toBeNull();
    expect(parseMoney('10.5', 'KHR')).toBeNull();
  });

  it('never drifts the way floats do', () => {
    expect(parseMoney('0.07', 'USD')).toBe(7);
    expect(parseMoney('1.15', 'USD')).toBe(115);
    expect(parseMoney('19.99', 'USD')).toBe(1999);
  });

  it('prints amounts for the shop', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(5, 'USD')).toBe('$0.05');
    expect(formatMoney(-150, 'USD')).toBe('-$1.50');
    expect(formatMoney(40000, 'KHR')).toBe('40,000 ៛');
  });
});

describe('order totals', () => {
  it('adds lines, takes the discount, then the tax', () => {
    const t = orderTotals(order({ discount: 750, taxRate: 10 }), 1000);
    expect(t).toEqual({ subtotal: 3750, discount: 750, taxable: 3000, tax: 300, total: 3300, paid: 1000, balance: 2300 });
  });

  it('cannot discount below zero', () => {
    expect(orderTotals(order({ discount: 99999 })).total).toBe(0);
  });

  it('keeps fractional quantities in whole cents', () => {
    const t = orderTotals(order({ items: [{ id: 'a', description: 'x', qty: 1.5, unitPrice: 333 }] }));
    expect(t.total).toBe(500);
    expect(Number.isInteger(t.total)).toBe(true);
  });

  it('counts only payments on that order', () => {
    const d = shop();
    d.orders.push(order({ id: 'o2', number: 'ORD-2026-0002' }));
    d.payments = [{ id: 'p1', orderId: 'o1', amount: 1000, method: 'cash', date: '2026-10-02', note: '' }, { id: 'p2', orderId: 'o2', amount: 500, method: 'bank', date: '2026-10-02', note: '' }];
    expect(totalsOf(d, d.orders[0]).balance).toBe(2750);
    expect(totalsOf(d, d.orders[1]).balance).toBe(3250);
  });
});

describe('status flow', () => {
  it('stamps start and finish', () => {
    const started = applyStatus(order(), 'in_progress', '2026-10-02T01:00:00.000Z');
    const done = applyStatus(started, 'done', '2026-10-02T01:45:00.000Z');
    expect(started.startedAt).toBe('2026-10-02T01:00:00.000Z');
    expect(done.finishedAt).toBe('2026-10-02T01:45:00.000Z');
    expect(actualMinutes(done)).toBe(45);
  });

  it('ignores a step the flow does not allow', () => {
    const delivered = order({ status: 'delivered' });
    for (const s of Object.keys(STATUS_NEXT) as OrderStatus[]) expect(applyStatus(delivered, s, at)).toBe(delivered);
    expect(applyStatus(order({ status: 'quote' }), 'done', at).status).toBe('quote');
  });

  it('clears the timing when a job goes back', () => {
    const back = applyStatus(order({ status: 'in_progress', startedAt: at }), 'pending', at);
    expect(back.startedAt).toBeNull();
  });
});

describe('due dates', () => {
  it('flags accepted work past its date', () => {
    expect(isDelayed(order({ dueDate: '2026-10-01' }), '2026-10-02')).toBe(true);
    expect(isDelayed(order({ dueDate: '2026-10-02' }), '2026-10-02')).toBe(false);
    expect(isDelayed(order({ dueDate: '' }), '2026-10-02')).toBe(false);
  });

  it('does not flag quotes, finished or cancelled orders', () => {
    for (const status of ['quote', 'done', 'delivered', 'cancelled'] as const) expect(isDelayed(order({ status, dueDate: '2026-01-01' }), '2026-10-02')).toBe(false);
  });

  it('notes a job that finished late', () => {
    expect(finishedLate(order({ dueDate: '2026-09-01', finishedAt: at }))).toBe(true);
    expect(finishedLate(order({ dueDate: '2026-12-01', finishedAt: at }))).toBe(false);
  });
});

describe('queue and numbers', () => {
  it('puts running work first, then the queue order', () => {
    const d = shop();
    d.orders = [order({ id: 'a', queue: 1 }), order({ id: 'b', queue: 3, status: 'in_progress' }), order({ id: 'c', queue: 2 }), order({ id: 'd', status: 'quote' })];
    expect(queueOf(d).map(o => o.id)).toEqual(['b', 'a', 'c']);
  });

  it('numbers orders from the counter', () => {
    const d = shop();
    d.settings.nextOrder = 27;
    expect(orderNumber(d.settings, 2026)).toBe('ORD-2026-0027');
  });
});

describe('stock', () => {
  it('is the sum of its moves', () => {
    const d = shop();
    d.moves = [{ id: 'a', materialId: 'm1', qty: 10, kind: 'in', orderId: null, note: '', date: '2026-10-01' }, { id: 'b', materialId: 'm1', qty: -3, kind: 'out', orderId: 'o1', note: '', date: '2026-10-02' }];
    expect(stockOf(d, 'm1')).toBe(7);
    expect(isLow(d, d.materials[0])).toBe(false);
    d.moves.push({ id: 'c', materialId: 'm1', qty: -5, kind: 'out', orderId: null, note: '', date: '2026-10-03' });
    expect(isLow(d, d.materials[0])).toBe(true);
  });

  it('does not warn about archived material', () => {
    const d = shop();
    d.materials[0].archived = true;
    expect(isLow(d, d.materials[0])).toBe(false);
  });
});

describe('overview and report', () => {
  function books(): ShopData {
    const d = shop();
    d.orders = [
      order({ id: 'a', number: 'A', status: 'done', dueDate: '2026-09-01', startedAt: '2026-10-01T01:00:00.000Z', finishedAt: at, estMinutes: 60 }),
      order({ id: 'b', number: 'B', status: 'quote' }), order({ id: 'c', number: 'C', status: 'cancelled' }),
      order({ id: 'd', number: 'D', dueDate: '2026-09-01' })
    ];
    d.payments = [{ id: 'p', orderId: 'a', amount: 1000, method: 'cash', date: '2026-10-05', note: '' }, { id: 'old', orderId: 'a', amount: 500, method: 'cash', date: '2026-08-05', note: '' }];
    d.expenses = [{ id: 'e', date: '2026-10-06', category: 'Wire', amount: 400, note: '' }];
    d.moves = [{ id: 'm', materialId: 'm1', qty: -2, kind: 'out', orderId: 'a', note: '', date: '2026-10-02' }];
    return d;
  }

  it('leaves quotes and cancelled orders out of the money', () => {
    const o = overview(books(), '2026-10-10');
    expect(o.invoiced).toBe(7500);
    expect(o.received).toBe(1500);
    expect(o.owed).toBe(6000);
    expect([o.orders, o.quotes, o.pending, o.done, o.delayed]).toEqual([4, 1, 1, 1, 1]);
  });

  it('counts money by the date it was paid', () => {
    const r = report(books(), { from: '2026-10-01', to: '2026-10-31' });
    expect(r.received).toBe(1000);
    expect(r.expenses).toBe(400);
    expect(r.cashResult).toBe(600);
  });

  it('reports finished work, lateness, time and foam', () => {
    const r = report(books(), { from: '2026-10-01', to: '2026-10-31' });
    expect(r.completed.map(o => o.id)).toEqual(['a']);
    expect(r.late).toBe(1);
    expect([r.estimated, r.actual]).toEqual([60, 120]);
    expect(r.materials).toEqual([{ id: 'm1', name: 'Foam 5cm', used: 2, cost: 600 }]);
    expect(r.cancelled).toBe(1);
  });

  it('shows nothing outside the period', () => {
    const r = report(books(), { from: '2025-01-01', to: '2025-12-31' });
    expect([r.created.length, r.received, r.expenses, r.customers.length, r.materials.length]).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('backup reminder', () => {
  it('stays quiet with no records', () => {
    expect(needsBackup(emptyShop())).toBe(false);
  });

  it('asks when there is no backup or it is old', () => {
    const d = shop(), now = Date.parse('2026-10-20T00:00:00Z');
    expect(needsBackup(d, now)).toBe(true);
    d.settings.lastBackup = '2026-10-18T00:00:00Z';
    expect(needsBackup(d, now)).toBe(false);
    d.settings.lastBackup = '2026-10-01T00:00:00Z';
    expect(needsBackup(d, now)).toBe(true);
  });
});

describe('CSV', () => {
  it('starts with a byte-order mark so Excel reads Khmer', () => {
    expect(toCsv([['ស្នោ']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('quotes commas, quotes and new lines', () => {
    expect(toCsv([['a,b', 'c"d', 'e\nf']]).slice(1)).toBe('"a,b","c""d","e\nf"\r\n');
  });

  it('stops typed text running as a spreadsheet formula', () => {
    for (const s of ['=1+1', '+1', '-1', '@x']) expect(toCsv([[s]]).slice(1)).toBe(`'${s}\r\n`);
  });

  it('leaves real numbers alone', () => {
    expect(toCsv([[-5, 12.5]]).slice(1)).toBe('-5,12.5\r\n');
  });
});

describe('shop backup file', () => {
  it('survives a round trip', () => {
    const d = shop();
    d.payments = [{ id: 'p', orderId: 'o1', amount: 100, method: 'cash', date: '2026-10-05', note: 'ស្នោ' }];
    expect(parseShopFile(toShopFile(d))).toEqual(d);
  });

  const broken = (change: (d: ShopData) => void) => {
    const d = shop();
    change(d);
    return () => readShop(JSON.parse(JSON.stringify(d)));
  };

  it('refuses files that are not shop backups', () => {
    expect(() => parseShopFile('not json')).toThrow(ShopFileError);
    expect(() => parseShopFile('[]')).toThrow(ShopFileError);
    expect(() => parseShopFile(JSON.stringify({ format: 'other', version: 1, data: {} }))).toThrow(ShopFileError);
    expect(() => parseShopFile(JSON.stringify({ format: SHOP_FORMAT, version: 99, data: shop() }))).toThrow(ShopFileError);
  });

  it('refuses orders that point at nothing', () => {
    expect(broken(d => { d.orders[0].customerId = 'gone'; })).toThrow(/order\.customerId/);
    expect(broken(d => { d.payments = [{ id: 'p', orderId: 'gone', amount: 1, method: 'cash', date: '2026-10-05', note: '' }]; })).toThrow(/payment\.orderId/);
    expect(broken(d => { d.moves = [{ id: 'm', materialId: 'gone', qty: 1, kind: 'in', orderId: null, note: '', date: '2026-10-05' }]; })).toThrow(/move\.reference/);
  });

  it('refuses repeated ids and order numbers', () => {
    expect(broken(d => { d.orders.push(order({ id: 'o2' })); })).toThrow(/order\.number/);
    expect(broken(d => { d.orders.push(order({ number: 'ORD-2026-0002' })); })).toThrow(/order\.id/);
    expect(broken(d => { d.customers.push({ ...d.customers[0] }); })).toThrow(/customer\.id/);
  });

  it('refuses bad values', () => {
    expect(broken(d => { d.orders[0].status = 'lost' as OrderStatus; })).toThrow(ShopFileError);
    expect(broken(d => { d.orders[0].discount = -1; })).toThrow(ShopFileError);
    expect(broken(d => { d.orders[0].discount = 1.5; })).toThrow(ShopFileError);
    expect(broken(d => { d.settings.currency = 'EUR' as 'USD'; })).toThrow(ShopFileError);
    expect(broken(d => { d.orders[0].dueDate = 'soon'; })).toThrow(ShopFileError);
    expect(broken(d => { d.settings.nextOrder = 0; })).toThrow(ShopFileError);
  });
});
