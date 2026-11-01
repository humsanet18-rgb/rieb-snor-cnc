export type OrderStatus = 'quote' | 'pending' | 'in_progress' | 'done' | 'delivered' | 'cancelled';
export type Currency = 'USD' | 'KHR';
export type PaymentMethod = 'cash' | 'bank' | 'other';
export type MoveKind = 'in' | 'out' | 'adjust';

export interface ShopCustomer {
  id: string; name: string; phone: string; address: string; notes: string;
  archived: boolean; createdAt: string; updatedAt: string;
}

/** Money is stored as whole minor units (cents or riel), so totals never pick up rounding drift. */
export interface OrderItem { id: string; description: string; qty: number; unitPrice: number }

export interface ShopOrder {
  id: string;
  /** Issued once from the shop counter and never reused. */
  number: string;
  customerId: string;
  title: string;
  status: OrderStatus;
  /** Local date as yyyy-mm-dd, or empty when there is no deadline. */
  dueDate: string;
  notes: string;
  projectId: string | null;
  projectName: string;
  items: OrderItem[];
  discount: number;
  /** Percent, applied after the discount. */
  taxRate: number;
  estMinutes: number | null;
  machine: string;
  assignee: string;
  /** Lower numbers are cut first. */
  queue: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment { id: string; orderId: string; amount: number; method: PaymentMethod; date: string; note: string }

export interface Material {
  id: string; name: string; widthMm: number; heightMm: number; thicknessMm: number;
  unitCost: number; lowStock: number; archived: boolean; createdAt: string;
}

/** Stock is the sum of its moves, so the history and the count can never disagree. */
export interface StockMove { id: string; materialId: string; qty: number; kind: MoveKind; orderId: string | null; note: string; date: string }

export interface Expense { id: string; date: string; category: string; amount: number; note: string }

export interface Activity { id: string; at: string; action: ActivityAction; detail: string }

export type ActivityAction =
  | 'customer-add' | 'customer-edit' | 'customer-archive' | 'customer-restore'
  | 'order-add' | 'order-edit' | 'order-status' | 'order-copy'
  | 'payment-add' | 'payment-remove' | 'material-add' | 'material-edit' | 'stock-move'
  | 'expense-add' | 'expense-remove' | 'settings' | 'restore';

export interface ShopSettings {
  shopName: string; phone: string; address: string; currency: Currency; taxRate: number;
  nextOrder: number; lastBackup: string | null;
}

export interface ShopData {
  /** Goes up on every save, so a second open tab cannot silently overwrite newer work. */
  rev: number;
  settings: ShopSettings;
  customers: ShopCustomer[];
  orders: ShopOrder[];
  payments: Payment[];
  materials: Material[];
  moves: StockMove[];
  expenses: Expense[];
  activity: Activity[];
}
