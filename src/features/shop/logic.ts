import type { Currency, Material, OrderItem, OrderStatus, ShopData, ShopOrder, ShopSettings } from '../../types/shop';

export const emptyShop = (): ShopData => ({
  rev: 0,
  settings: { shopName: '', phone: '', address: '', currency: 'USD', taxRate: 0, nextOrder: 1, lastBackup: null },
  customers: [], orders: [], payments: [], materials: [], moves: [], expenses: [], activity: []
});

export const decimalsOf = (c: Currency) => (c === 'USD' ? 2 : 0);

/** Reads what was typed into whole minor units, or null when it is not an amount. */
export function parseMoney(text: string, currency: Currency): number | null {
  const s = text.trim().replace(/,/g, ''), d = decimalsOf(currency);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, part = ''] = s.split('.');
  if (part.length > d || whole.length > 12) return null;
  return Number(whole) * 10 ** d + Number(part.padEnd(d, '0') || 0);
}

export function formatMoney(minor: number, currency: Currency): string {
  const d = decimalsOf(currency), sign = minor < 0 ? '-' : '', abs = Math.abs(minor);
  const whole = String(Math.floor(abs / 10 ** d)).replace(/\B(?=(\d{3})+$)/g, ',');
  const part = d ? '.' + String(abs % 10 ** d).padStart(d, '0') : '';
  return currency === 'USD' ? `${sign}$${whole}${part}` : `${sign}${whole}${part} ៛`;
}

export const moneyText = (minor: number, currency: Currency) => (minor / 10 ** decimalsOf(currency)).toFixed(decimalsOf(currency));

export const lineTotal = (i: OrderItem) => Math.round(i.qty * i.unitPrice);

export interface Totals { subtotal: number; discount: number; taxable: number; tax: number; total: number; paid: number; balance: number }

export function orderTotals(order: Pick<ShopOrder, 'items' | 'discount' | 'taxRate'>, paid = 0): Totals {
  const subtotal = order.items.reduce((s, i) => s + lineTotal(i), 0);
  const discount = Math.min(order.discount, subtotal), taxable = subtotal - discount;
  const tax = Math.round(taxable * order.taxRate / 100), total = taxable + tax;
  return { subtotal, discount, taxable, tax, total, paid, balance: total - paid };
}

export const paidOn = (data: ShopData, orderId: string) => data.payments.filter(p => p.orderId === orderId).reduce((s, p) => s + p.amount, 0);
export const totalsOf = (data: ShopData, o: ShopOrder) => orderTotals(o, paidOn(data, o.id));

export const stockOf = (data: ShopData, materialId: string) => data.moves.filter(m => m.materialId === materialId).reduce((s, m) => s + m.qty, 0);
export const isLow = (data: ShopData, m: Material) => !m.archived && stockOf(data, m.id) <= m.lowStock;

export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Where an order may go next. Finished work can only be delivered, so timestamps stay trustworthy. */
export const STATUS_NEXT: Record<OrderStatus, OrderStatus[]> = {
  quote: ['pending', 'cancelled'], pending: ['in_progress', 'quote', 'cancelled'], in_progress: ['done', 'pending', 'cancelled'],
  done: ['delivered'], delivered: [], cancelled: ['quote']
};

export function applyStatus(order: ShopOrder, status: OrderStatus, now: string): ShopOrder {
  if (!STATUS_NEXT[order.status].includes(status)) return order;
  const next = { ...order, status, updatedAt: now };
  if (status === 'in_progress') next.startedAt = now;
  if (status === 'done') next.finishedAt = now;
  if (status === 'pending' || status === 'quote') { next.startedAt = null; next.finishedAt = null; }
  return next;
}

const OPEN: OrderStatus[] = ['pending', 'in_progress'];
export const isOpen = (o: ShopOrder) => OPEN.includes(o.status);
/** A quote has not been promised yet, so only accepted work can run late. */
export const isDelayed = (o: ShopOrder, today = localDate()) => isOpen(o) && !!o.dueDate && o.dueDate < today;
export const finishedLate = (o: ShopOrder) => !!o.dueDate && !!o.finishedAt && localDate(new Date(o.finishedAt)) > o.dueDate;

export const actualMinutes = (o: ShopOrder): number | null =>
  (o.startedAt && o.finishedAt ? Math.max(0, Math.round((Date.parse(o.finishedAt) - Date.parse(o.startedAt)) / 60000)) : null);

export function orderNumber(s: ShopSettings, year: number): string {
  return `ORD-${year}-${String(s.nextOrder).padStart(4, '0')}`;
}

/** Work to cut next: running jobs first, then the queue order. */
export const queueOf = (data: ShopData) => data.orders.filter(isOpen).sort((a, b) =>
  Number(b.status === 'in_progress') - Number(a.status === 'in_progress') || a.queue - b.queue);

export const nextQueue = (data: ShopData) => data.orders.reduce((n, o) => Math.max(n, o.queue), 0) + 1;

export interface Overview {
  orders: number; pending: number; running: number; done: number; delayed: number; quotes: number;
  invoiced: number; received: number; owed: number; expenses: number;
  lowStock: Material[];
}

const counts = (o: ShopOrder) => o.status !== 'cancelled' && o.status !== 'quote';

export function overview(data: ShopData, today = localDate()): Overview {
  const orders = data.orders;
  const billed = orders.filter(counts);
  const invoiced = billed.reduce((s, o) => s + orderTotals(o).total, 0);
  const received = data.payments.reduce((s, p) => s + p.amount, 0);
  return {
    orders: orders.length, quotes: orders.filter(o => o.status === 'quote').length,
    pending: orders.filter(o => o.status === 'pending').length, running: orders.filter(o => o.status === 'in_progress').length,
    done: orders.filter(o => o.status === 'done' || o.status === 'delivered').length, delayed: orders.filter(o => isDelayed(o, today)).length,
    invoiced, received, owed: billed.reduce((s, o) => s + Math.max(0, totalsOf(data, o).balance), 0),
    expenses: data.expenses.reduce((s, e) => s + e.amount, 0),
    lowStock: data.materials.filter(m => isLow(data, m))
  };
}

export const needsBackup = (data: ShopData, now = Date.now()) => {
  const records = data.customers.length + data.orders.length + data.materials.length;
  if (!records) return false;
  const last = data.settings.lastBackup;
  return !last || now - Date.parse(last) > 7 * 864e5;
};

export interface Range { from: string; to: string }
const within = (date: string, r: Range) => (!r.from || date >= r.from) && (!r.to || date <= r.to);
const dayOf = (iso: string) => localDate(new Date(iso));

export interface ReportData {
  created: ShopOrder[]; completed: ShopOrder[]; late: number; cancelled: number;
  invoiced: number; received: number; expenses: number; cashResult: number; estimated: number; actual: number;
  customers: { id: string; name: string; orders: number; total: number; paid: number }[];
  materials: { id: string; name: string; used: number; cost: number }[];
}

/** Income is money actually received in the period, not invoiced, so the result matches the cash box. */
export function report(data: ShopData, range: Range): ReportData {
  const created = data.orders.filter(o => within(dayOf(o.createdAt), range));
  const completed = data.orders.filter(o => o.finishedAt && within(dayOf(o.finishedAt), range));
  const received = data.payments.filter(p => within(p.date, range)).reduce((s, p) => s + p.amount, 0);
  const expenses = data.expenses.filter(e => within(e.date, range)).reduce((s, e) => s + e.amount, 0);
  const billed = created.filter(counts);
  const customers = data.customers.map(c => {
    const own = billed.filter(o => o.customerId === c.id);
    return {
      id: c.id, name: c.name, orders: own.length, total: own.reduce((s, o) => s + orderTotals(o).total, 0),
      paid: data.payments.filter(p => within(p.date, range) && data.orders.some(o => o.id === p.orderId && o.customerId === c.id)).reduce((s, p) => s + p.amount, 0)
    };
  }).filter(c => c.orders || c.paid).sort((a, b) => b.total - a.total);
  const materials = data.materials.map(m => {
    const used = -data.moves.filter(v => v.materialId === m.id && v.kind === 'out' && within(v.date, range)).reduce((s, v) => s + v.qty, 0);
    return { id: m.id, name: m.name, used, cost: Math.round(used * m.unitCost) };
  }).filter(m => m.used > 0);
  const timed = completed.filter(o => o.estMinutes !== null && actualMinutes(o) !== null);
  return {
    created, completed, late: completed.filter(finishedLate).length, cancelled: created.filter(o => o.status === 'cancelled').length,
    invoiced: billed.reduce((s, o) => s + orderTotals(o).total, 0), received, expenses, cashResult: received - expenses,
    estimated: timed.reduce((s, o) => s + (o.estMinutes ?? 0), 0), actual: timed.reduce((s, o) => s + (actualMinutes(o) ?? 0), 0),
    customers, materials
  };
}

/** Cells starting with these run as formulas in Excel, so they are forced to plain text. */
const safeCell = (v: string | number) => {
  const s = String(v);
  const text = typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The byte-order mark makes Excel read Khmer as UTF-8. */
export const toCsv = (rows: (string | number)[][]) => '﻿' + rows.map(r => r.map(safeCell).join(',')).join('\r\n') + '\r\n';
