import type {
  Activity, ActivityAction, Currency, Expense, Material, MoveKind, OrderItem, OrderStatus, Payment, PaymentMethod,
  ShopCustomer, ShopData, ShopOrder, ShopSettings, StockMove
} from '../types/shop';

export const SHOP_FORMAT = 'rieb-snor-shop', SHOP_VERSION = 1;

export class ShopFileError extends Error {}

const bad = (field: string): never => { throw new ShopFileError(field); };
type Obj = Record<string, unknown>;
const obj = (v: unknown, f: string): Obj => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : bad(f));
const arr = (v: unknown, f: string): unknown[] => (Array.isArray(v) ? v : bad(f));
const str = (v: unknown, f: string, max = 2000): string => (typeof v === 'string' && v.length <= max ? v : bad(f));
const num = (v: unknown, f: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : bad(f));
const pos = (v: unknown, f: string): number => { const n = num(v, f); return n >= 0 ? n : bad(f); };
const whole = (v: unknown, f: string): number => { const n = pos(v, f); return Number.isSafeInteger(n) ? n : bad(f); };
const bool = (v: unknown, f: string): boolean => (typeof v === 'boolean' ? v : bad(f));
const oneOf = <T extends string>(v: unknown, list: readonly T[], f: string): T => (list.includes(v as T) ? v as T : bad(f));
const id = (v: unknown, f: string): string => { const s = str(v, f, 80); return s ? s : bad(f); };
const stamp = (v: unknown, f: string): string => { const s = str(v, f, 40); return Number.isNaN(Date.parse(s)) ? bad(f) : s; };
const day = (v: unknown, f: string): string => { const s = str(v, f, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : bad(f); };

const STATUSES: OrderStatus[] = ['quote', 'pending', 'in_progress', 'done', 'delivered', 'cancelled'];
const ACTIONS: ActivityAction[] = ['customer-add', 'customer-edit', 'customer-archive', 'customer-restore', 'order-add', 'order-edit', 'order-status', 'order-copy',
  'payment-add', 'payment-remove', 'material-add', 'material-edit', 'stock-move', 'expense-add', 'expense-remove', 'settings', 'restore'];

function customer(v: unknown): ShopCustomer {
  const o = obj(v, 'customer');
  return {
    id: id(o.id, 'customer.id'), name: id(o.name, 'customer.name'), phone: str(o.phone, 'customer.phone'), address: str(o.address, 'customer.address'),
    notes: str(o.notes, 'customer.notes'), archived: bool(o.archived, 'customer.archived'), createdAt: stamp(o.createdAt, 'customer.createdAt'), updatedAt: stamp(o.updatedAt, 'customer.updatedAt')
  };
}

function item(v: unknown): OrderItem {
  const o = obj(v, 'item');
  return { id: id(o.id, 'item.id'), description: id(o.description, 'item.description'), qty: pos(o.qty, 'item.qty'), unitPrice: whole(o.unitPrice, 'item.unitPrice') };
}

function order(v: unknown): ShopOrder {
  const o = obj(v, 'order'), due = str(o.dueDate, 'order.dueDate', 10);
  return {
    id: id(o.id, 'order.id'), number: id(o.number, 'order.number'), customerId: id(o.customerId, 'order.customerId'), title: id(o.title, 'order.title'),
    status: oneOf(o.status, STATUSES, 'order.status'), dueDate: due && day(due, 'order.dueDate'), notes: str(o.notes, 'order.notes'),
    projectId: o.projectId === null ? null : id(o.projectId, 'order.projectId'), projectName: str(o.projectName, 'order.projectName'),
    items: arr(o.items, 'order.items').map(item), discount: whole(o.discount, 'order.discount'), taxRate: pos(o.taxRate, 'order.taxRate'),
    estMinutes: o.estMinutes === null ? null : pos(o.estMinutes, 'order.estMinutes'), machine: str(o.machine, 'order.machine'), assignee: str(o.assignee, 'order.assignee'),
    queue: pos(o.queue, 'order.queue'), startedAt: o.startedAt === null ? null : stamp(o.startedAt, 'order.startedAt'), finishedAt: o.finishedAt === null ? null : stamp(o.finishedAt, 'order.finishedAt'),
    createdAt: stamp(o.createdAt, 'order.createdAt'), updatedAt: stamp(o.updatedAt, 'order.updatedAt')
  };
}

function payment(v: unknown): Payment {
  const o = obj(v, 'payment');
  return {
    id: id(o.id, 'payment.id'), orderId: id(o.orderId, 'payment.orderId'), amount: whole(o.amount, 'payment.amount'),
    method: oneOf<PaymentMethod>(o.method, ['cash', 'bank', 'other'], 'payment.method'), date: day(o.date, 'payment.date'), note: str(o.note, 'payment.note')
  };
}

function material(v: unknown): Material {
  const o = obj(v, 'material');
  return {
    id: id(o.id, 'material.id'), name: id(o.name, 'material.name'), widthMm: pos(o.widthMm, 'material.widthMm'), heightMm: pos(o.heightMm, 'material.heightMm'),
    thicknessMm: pos(o.thicknessMm, 'material.thicknessMm'), unitCost: whole(o.unitCost, 'material.unitCost'), lowStock: pos(o.lowStock, 'material.lowStock'),
    archived: bool(o.archived, 'material.archived'), createdAt: stamp(o.createdAt, 'material.createdAt')
  };
}

function move(v: unknown): StockMove {
  const o = obj(v, 'move');
  return {
    id: id(o.id, 'move.id'), materialId: id(o.materialId, 'move.materialId'), qty: num(o.qty, 'move.qty'), kind: oneOf<MoveKind>(o.kind, ['in', 'out', 'adjust'], 'move.kind'),
    orderId: o.orderId === null ? null : id(o.orderId, 'move.orderId'), note: str(o.note, 'move.note'), date: day(o.date, 'move.date')
  };
}

function expense(v: unknown): Expense {
  const o = obj(v, 'expense');
  return { id: id(o.id, 'expense.id'), date: day(o.date, 'expense.date'), category: id(o.category, 'expense.category'), amount: whole(o.amount, 'expense.amount'), note: str(o.note, 'expense.note') };
}

function activity(v: unknown): Activity {
  const o = obj(v, 'activity');
  return { id: id(o.id, 'activity.id'), at: stamp(o.at, 'activity.at'), action: oneOf(o.action, ACTIONS, 'activity.action'), detail: str(o.detail, 'activity.detail') };
}

function settings(v: unknown): ShopSettings {
  const o = obj(v, 'settings');
  return {
    shopName: str(o.shopName, 'settings.shopName'), phone: str(o.phone, 'settings.phone'), address: str(o.address, 'settings.address'),
    currency: oneOf<Currency>(o.currency, ['USD', 'KHR'], 'settings.currency'), taxRate: pos(o.taxRate, 'settings.taxRate'),
    nextOrder: whole(o.nextOrder, 'settings.nextOrder') || bad('settings.nextOrder'), lastBackup: o.lastBackup === null ? null : stamp(o.lastBackup, 'settings.lastBackup')
  };
}

function unique(list: string[], field: string) {
  if (new Set(list).size !== list.length) bad(field);
}

/** Runs on everything loaded or restored, so a damaged record stops at the door. */
export function readShop(v: unknown): ShopData {
  const o = obj(v, 'shop');
  const data: ShopData = {
    rev: whole(o.rev, 'rev'), settings: settings(o.settings), customers: arr(o.customers, 'customers').map(customer), orders: arr(o.orders, 'orders').map(order),
    payments: arr(o.payments, 'payments').map(payment), materials: arr(o.materials, 'materials').map(material), moves: arr(o.moves, 'moves').map(move),
    expenses: arr(o.expenses, 'expenses').map(expense), activity: arr(o.activity, 'activity').map(activity)
  };
  unique(data.orders.map(x => x.number), 'order.number');
  for (const [list, f] of [[data.customers, 'customer.id'], [data.orders, 'order.id'], [data.payments, 'payment.id'], [data.materials, 'material.id'], [data.moves, 'move.id'], [data.expenses, 'expense.id']] as const) {
    unique(list.map(x => x.id), f);
  }
  const customers = new Set(data.customers.map(x => x.id)), orders = new Set(data.orders.map(x => x.id)), materials = new Set(data.materials.map(x => x.id));
  if (data.orders.some(x => !customers.has(x.customerId))) bad('order.customerId');
  if (data.payments.some(x => !orders.has(x.orderId))) bad('payment.orderId');
  if (data.moves.some(x => !materials.has(x.materialId) || (x.orderId !== null && !orders.has(x.orderId)))) bad('move.reference');
  return data;
}

export const toShopFile = (data: ShopData, savedAt = new Date().toISOString()): string =>
  JSON.stringify({ format: SHOP_FORMAT, version: SHOP_VERSION, savedAt, data }, null, 1);

export function parseShopFile(text: string): ShopData {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return bad('json'); }
  const o = obj(raw, 'file');
  if (o.format !== SHOP_FORMAT) bad('format');
  if (o.version !== SHOP_VERSION) bad('version');
  return readShop(o.data);
}
