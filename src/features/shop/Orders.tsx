import { useEffect, useMemo, useState } from 'react';
import { tr, useT } from '../../app/i18n';
import { Dialog, IconButton, SelectField } from '../../components/ui';
import { listProjects, loadProject, type ProjectSummary } from '../../services/db';
import { readProject } from '../../services/project-io';
import { activeProfile, flushSave, loadInto, projectStore } from '../../stores/project-store';
import { changeShop, shopStore } from '../../stores/shop-store';
import { useStore } from '../../stores/store';
import { toast, uiStore } from '../../stores/ui-store';
import type { OrderItem, OrderStatus, PaymentMethod, ShopData, ShopOrder } from '../../types/shop';
import { newId } from '../nesting/model';
import { CustomerForm } from './Customers';
import { makeOrderPdf } from './documents';
import { applyStatus, formatMoney, isDelayed, lineTotal, localDate, nextQueue, orderNumber, orderTotals, parseMoney, paidOn, STATUS_NEXT, stockOf, totalsOf } from './logic';
import { Area, checkMoney, ConfirmDialog, DataTable, dateText, Field, FormDialog, Input, moneyInput, MoneyInput, StatusTag, useCurrency, useMoney, type Column } from './parts';

interface ItemDraft { id: string; description: string; qty: string; price: string }
const FILTERS = ['all', 'open', 'quote', 'pending', 'in_progress', 'done', 'delivered', 'cancelled', 'late'] as const;
type Filter = typeof FILTERS[number];

const nameOf = (d: ShopData, id: string) => d.customers.find(c => c.id === id)?.name ?? '—';

function OrderForm({ order, onClose, onSaved }: { order: ShopOrder | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const { t } = useT();
  const data = useStore(shopStore, s => s.data), currency = data.settings.currency;
  const [customerId, setCustomer] = useState(order?.customerId ?? '');
  const [title, setTitle] = useState(order?.title ?? '');
  const [dueDate, setDue] = useState(order?.dueDate ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [machine, setMachine] = useState(order?.machine ?? '');
  const [assignee, setAssignee] = useState(order?.assignee ?? '');
  const [est, setEst] = useState(order?.estMinutes === null || !order ? '' : String(order.estMinutes));
  const [discount, setDiscount] = useState(order ? moneyInput(order.discount, currency) : '');
  const [tax, setTax] = useState(String(order?.taxRate ?? data.settings.taxRate));
  const [projectId, setProject] = useState(order?.projectId ?? '');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [items, setItems] = useState<ItemDraft[]>(order?.items.map(i => ({ id: i.id, description: i.description, qty: String(i.qty), price: moneyInput(i.unitPrice, currency) })) ?? [{ id: newId('item'), description: '', qty: '1', price: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addCustomer, setAddCustomer] = useState(false);
  useEffect(() => { listProjects().then(setProjects).catch(() => undefined); }, []);
  const customers = data.customers.filter(c => !c.archived || c.id === order?.customerId);
  const edit = (id: string, part: Partial<ItemDraft>) => setItems(l => l.map(i => (i.id === id ? { ...i, ...part } : i)));

  /** Fills the estimate from the wire path when the linked project is the one open now. */
  const pickProject = (id: string) => {
    setProject(id);
    const state = projectStore.get(), paths = uiStore.get().toolpaths, feed = activeProfile(state).feed;
    if (id && id === state.project.id && paths && feed > 0 && !est) setEst(String(Math.ceil(paths.sheets.reduce((s, x) => s + x.length, 0) / feed)));
  };

  const submit = async () => {
    const e: Record<string, string> = {}, parsed: OrderItem[] = [];
    if (!customerId) e.customer = t('shop.err.customer');
    if (!title.trim()) e.title = t('shop.err.title');
    for (const i of items) {
      const qty = Number(i.qty), price = parseMoney(i.price || '0', currency);
      if (!i.description.trim()) e['d' + i.id] = t('shop.err.item');
      if (!Number.isFinite(qty) || qty <= 0) e['q' + i.id] = t('shop.err.qty');
      if (price === null) e['p' + i.id] = t('shop.err.money');
      else parsed.push({ id: i.id, description: i.description.trim(), qty, unitPrice: price });
    }
    if (!items.length) e.items = t('shop.err.items');
    const money = checkMoney(discount, currency, t('shop.err.money')), rate = Number(tax || 0), minutes = est.trim() === '' ? null : Number(est);
    if (money.error) e.discount = money.error;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) e.tax = t('shop.err.percent');
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) e.est = t('shop.err.number');
    if (!e.discount && money.value > parsed.reduce((s, i) => s + lineTotal(i), 0)) e.discount = t('shop.err.discount');
    setErrors(e);
    if (Object.keys(e).length) return false;
    const now = new Date().toISOString(), id = order?.id ?? newId('ord');
    const fields = {
      customerId, title: title.trim(), dueDate, notes: notes.trim(), machine: machine.trim(), assignee: assignee.trim(), estMinutes: minutes,
      discount: money.value, taxRate: rate, items: parsed, projectId: projectId || null, projectName: projects.find(p => p.id === projectId)?.name ?? (projectId ? order?.projectName ?? '' : ''), updatedAt: now
    };
    const ok = order
      ? await changeShop('order-edit', order.number, d => ({ ...d, orders: d.orders.map(o => (o.id === id ? { ...o, ...fields } : o)) }))
      : await changeShop('order-add', title.trim(), d => {
        const number = orderNumber(d.settings, new Date().getFullYear());
        const created: ShopOrder = { ...fields, id, number, status: 'quote', queue: nextQueue(d), startedAt: null, finishedAt: null, createdAt: now };
        return { ...d, orders: [created, ...d.orders], settings: { ...d.settings, nextOrder: d.settings.nextOrder + 1 } };
      });
    if (ok) onSaved?.(id);
    return ok;
  };

  return (
    <>
      <FormDialog title={order ? t('shop.order.edit', { n: order.number }) : t('shop.order.new')} onClose={onClose} onSubmit={submit} wide testId="order-form">
        <Field label={t('shop.customer')} error={errors.customer} required wide>
          {(id, invalid) => (
            <div className="inline">
              <select id={id} value={customerId} aria-invalid={invalid} onChange={e => setCustomer(e.target.value)} data-testid="order-customer">
                <option value="">{t('shop.choose')}</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="btn" onClick={() => setAddCustomer(true)} data-testid="order-add-customer">{t('shop.customer.new')}</button>
            </div>
          )}
        </Field>
        <Input label={t('shop.order.title')} value={title} onChange={setTitle} error={errors.title} required wide testId="order-title" />
        <div className="items wide">
          <h3>{t('shop.items')}</h3>
          {errors.items && <span className="field-error" role="alert">{errors.items}</span>}
          {items.map(i => (
            <div className="item-row" key={i.id}>
              <Input label={t('shop.item.description')} value={i.description} onChange={description => edit(i.id, { description })} error={errors['d' + i.id]} required testId="item-description" />
              <Input label={t('shop.item.qty')} value={i.qty} onChange={qty => edit(i.id, { qty })} error={errors['q' + i.id]} required type="text" testId="item-qty" />
              <MoneyInput label={t('shop.item.price')} value={i.price} onChange={price => edit(i.id, { price })} error={errors['p' + i.id]} testId="item-price" />
              <IconButton icon="trash" label={t('shop.item.remove')} disabled={items.length < 2} onClick={() => setItems(l => l.filter(x => x.id !== i.id))} />
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setItems(l => [...l, { id: newId('item'), description: '', qty: '1', price: '' }])} data-testid="item-add">{t('shop.item.add')}</button>
        </div>
        <MoneyInput label={t('shop.discount')} value={discount} onChange={setDiscount} error={errors.discount} testId="order-discount" />
        <Input label={t('shop.taxRate')} value={tax} onChange={setTax} error={errors.tax} testId="order-tax" />
        <Input label={t('shop.due')} value={dueDate} onChange={setDue} type="date" testId="order-due" />
        <Input label={t('shop.estMinutes')} value={est} onChange={setEst} error={errors.est} testId="order-est" />
        <Input label={t('shop.machine')} value={machine} onChange={setMachine} />
        <Input label={t('shop.assignee')} value={assignee} onChange={setAssignee} />
        <SelectField label={t('shop.project')} value={projectId} onChange={pickProject} testId="order-project"
          options={[{ value: '', label: t('shop.project.none') }, ...projects.map(p => ({ value: p.id, label: p.name })), ...(projectId && !projects.some(p => p.id === projectId) ? [{ value: projectId, label: order?.projectName || projectId }] : [])]} />
        <Area label={t('shop.notes')} value={notes} onChange={setNotes} />
      </FormDialog>
      {addCustomer && <CustomerForm customer={null} onClose={() => setAddCustomer(false)} onSaved={setCustomer} />}
    </>
  );
}

function PaymentForm({ order, onClose }: { order: ShopOrder; onClose: () => void }) {
  const { t } = useT();
  const data = useStore(shopStore, s => s.data), currency = data.settings.currency, balance = totalsOf(data, order).balance;
  const [amount, setAmount] = useState(moneyInput(Math.max(0, balance), currency));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const submit = async () => {
    const value = parseMoney(amount, currency);
    if (!value) { setError(t('shop.err.amount')); return false; }
    if (value > balance) { setError(t('shop.err.overpay', { n: formatMoney(Math.max(0, balance), currency) })); return false; }
    return changeShop('payment-add', `${order.number} ${formatMoney(value, currency)}`, d => ({
      ...d, payments: [{ id: newId('pay'), orderId: order.id, amount: value, method, date: date || localDate(), note: note.trim() }, ...d.payments]
    }));
  };
  return (
    <FormDialog title={t('shop.payment.add')} onClose={onClose} onSubmit={submit} testId="payment-form">
      <MoneyInput label={t('shop.amount')} value={amount} onChange={setAmount} error={error} required testId="payment-amount" />
      <Input label={t('shop.date')} value={date} onChange={setDate} type="date" />
      <SelectField label={t('shop.method')} value={method} onChange={setMethod} options={(['cash', 'bank', 'other'] as const).map(value => ({ value, label: t(`shop.method.${value}`) }))} />
      <Input label={t('shop.notes')} value={note} onChange={setNote} wide />
    </FormDialog>
  );
}

function UseStockForm({ order, onClose }: { order: ShopOrder; onClose: () => void }) {
  const { t } = useT();
  const data = useStore(shopStore, s => s.data), materials = data.materials.filter(m => !m.archived);
  const [materialId, setMaterial] = useState(materials[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string>();
  const submit = async () => {
    const n = Number(qty);
    if (!materialId) { setError(t('shop.err.material')); return false; }
    if (!Number.isFinite(n) || n <= 0) { setError(t('shop.err.qty')); return false; }
    if (n > stockOf(data, materialId)) { setError(t('shop.err.stock', { n: stockOf(data, materialId) })); return false; }
    return changeShop('stock-move', order.number, d => ({ ...d, moves: [{ id: newId('mov'), materialId, qty: -n, kind: 'out', orderId: order.id, note: order.number, date: localDate() }, ...d.moves] }));
  };
  return (
    <FormDialog title={t('shop.stock.use')} onClose={onClose} onSubmit={submit} testId="use-stock-form">
      <SelectField label={t('shop.material')} value={materialId} onChange={setMaterial} testId="use-material"
        options={materials.map(m => ({ value: m.id, label: `${m.name} (${stockOf(data, m.id)})` }))} />
      <Input label={t('shop.item.qty')} value={qty} onChange={setQty} error={error} required testId="use-qty" />
    </FormDialog>
  );
}

async function openProject(id: string) {
  try {
    const stored = await loadProject(id);
    if (!stored) { toast(tr('shop.project.missing'), true); return; }
    await flushSave();
    loadInto(readProject(stored));
    uiStore.patch({ view: 'work', shopOrder: null });
  } catch { toast(tr('shop.project.missing'), true); }
}

export function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney();
  const order = data.orders.find(o => o.id === id);
  const [dialog, setDialog] = useState<'edit' | 'pay' | 'stock' | null>(null);
  const [cancel, setCancel] = useState<OrderStatus | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  if (!order) return null;
  const totals = totalsOf(data, order), payments = data.payments.filter(p => p.orderId === id), moves = data.moves.filter(m => m.orderId === id);
  const customer = data.customers.find(c => c.id === order.customerId);
  const go = (status: OrderStatus) => void changeShop('order-status', `${order.number}: ${t(`shop.status.${status}`)}`, d => ({ ...d, orders: d.orders.map(o => (o.id === id ? applyStatus(o, status, new Date().toISOString()) : o)) }));
  const copy = () => void changeShop('order-copy', order.number, d => {
    const now = new Date().toISOString(), number = orderNumber(d.settings, new Date().getFullYear());
    const clone: ShopOrder = { ...order, id: newId('ord'), number, status: 'quote', dueDate: '', startedAt: null, finishedAt: null, queue: nextQueue(d), createdAt: now, updatedAt: now, items: order.items.map(i => ({ ...i, id: newId('item') })) };
    return { ...d, orders: [clone, ...d.orders], settings: { ...d.settings, nextOrder: d.settings.nextOrder + 1 } };
  }).then(ok => { if (ok) toast(t('shop.order.copied')); });
  return (
    <Dialog title={`${order.number} · ${order.title}`} onClose={onClose} wide>
      <div className="detail-head">
        <StatusTag status={order.status} />
        {isDelayed(order) && <span className="tag bad" data-testid="late-tag">{t('shop.late')}</span>}
        <span>{customer?.name}{customer?.phone ? ` · ${customer.phone}` : ''}</span>
      </div>
      <dl className="detail-grid">
        <div><dt>{t('shop.due')}</dt><dd>{dateText(lang, order.dueDate)}</dd></div>
        <div><dt>{t('shop.machine')}</dt><dd>{order.machine || '—'}</dd></div>
        <div><dt>{t('shop.assignee')}</dt><dd>{order.assignee || '—'}</dd></div>
        <div><dt>{t('shop.estMinutes')}</dt><dd>{order.estMinutes ?? '—'}</dd></div>
      </dl>
      {order.notes && <p className="hint">{order.notes}</p>}
      <div className="btn-row">
        {STATUS_NEXT[order.status].map(s => (
          <button key={s} type="button" className={'btn' + (s === 'cancelled' ? ' danger' : ' primary')} data-testid={`status-${s}`}
            onClick={() => (s === 'cancelled' ? setCancel(s) : go(s))}>{t(`shop.go.${s}`)}</button>
        ))}
      </div>
      <h3>{t('shop.items')}</h3>
      <table className="compare" data-testid="order-items">
        <thead><tr><th scope="col">{t('shop.item.description')}</th><th scope="col">{t('shop.item.qty')}</th><th scope="col">{t('shop.item.price')}</th><th scope="col">{t('shop.total')}</th></tr></thead>
        <tbody>{order.items.map(i => <tr key={i.id}><td>{i.description}</td><td>{i.qty}</td><td>{money(i.unitPrice)}</td><td>{money(lineTotal(i))}</td></tr>)}</tbody>
      </table>
      <dl className="totals" data-testid="order-totals">
        <div><dt>{t('shop.subtotal')}</dt><dd>{money(totals.subtotal)}</dd></div>
        {totals.discount > 0 && <div><dt>{t('shop.discount')}</dt><dd>-{money(totals.discount)}</dd></div>}
        {totals.tax > 0 && <div><dt>{t('shop.tax', { n: order.taxRate })}</dt><dd>{money(totals.tax)}</dd></div>}
        <div className="grand"><dt>{t('shop.total')}</dt><dd data-testid="order-total">{money(totals.total)}</dd></div>
        <div><dt>{t('shop.paid')}</dt><dd data-testid="order-paid">{money(totals.paid)}</dd></div>
        <div className={totals.balance > 0 ? 'owed' : ''}><dt>{t('shop.balance')}</dt><dd data-testid="order-balance">{money(totals.balance)}</dd></div>
      </dl>
      <h3>{t('shop.payments')}</h3>
      {payments.length ? (
        <ul className="plain-list">
          {payments.map(p => (
            <li key={p.id}><span>{dateText(lang, p.date)} · {t(`shop.method.${p.method}`)}{p.note ? ` · ${p.note}` : ''}</span><b>{money(p.amount)}</b>
              <IconButton icon="trash" label={t('shop.payment.remove')} onClick={() => setDrop(p.id)} /></li>
          ))}
        </ul>
      ) : <p className="hint">{t('shop.payment.none')}</p>}
      <h3>{t('shop.stockUsed')}</h3>
      {moves.length ? (
        <ul className="plain-list">
          {moves.map(m => <li key={m.id}><span>{dateText(lang, m.date)} · {data.materials.find(x => x.id === m.materialId)?.name}</span><b>{Math.abs(m.qty)}</b></li>)}
        </ul>
      ) : <p className="hint">{t('shop.stockUsed.none')}</p>}
      {order.projectId && <p className="hint">{t('shop.project')}: <button type="button" className="link" onClick={() => void openProject(order.projectId!)} data-testid="open-project">{order.projectName || t('shop.project.open')}</button></p>}
      <div className="btn-row">
        <button type="button" className="btn" disabled={totals.balance <= 0 || order.status === 'cancelled'} onClick={() => setDialog('pay')} data-testid="add-payment">{t('shop.payment.add')}</button>
        <button type="button" className="btn" disabled={!data.materials.some(m => !m.archived)} onClick={() => setDialog('stock')} data-testid="use-stock">{t('shop.stock.use')}</button>
        <button type="button" className="btn" onClick={() => setDialog('edit')} data-testid="edit-order">{t('shop.edit')}</button>
        <button type="button" className="btn" onClick={copy} data-testid="copy-order">{t('shop.order.copy')}</button>
        <button type="button" className="btn" onClick={() => void makeOrderPdf(order, data).catch(() => toast(t('shop.pdfFailed'), true))} data-testid="order-pdf">{t(order.status === 'quote' ? 'shop.pdf.quote' : 'shop.pdf.invoice')}</button>
      </div>
      {dialog === 'edit' && <OrderForm order={order} onClose={() => setDialog(null)} />}
      {dialog === 'pay' && <PaymentForm order={order} onClose={() => setDialog(null)} />}
      {dialog === 'stock' && <UseStockForm order={order} onClose={() => setDialog(null)} />}
      {cancel && <ConfirmDialog title={t('shop.order.cancelTitle')} body={t(paidOn(data, id) ? 'shop.order.cancelPaid' : 'shop.order.cancelBody')} action={t('shop.go.cancelled')} danger onYes={() => go(cancel)} onClose={() => setCancel(null)} />}
      {drop && <ConfirmDialog title={t('shop.payment.remove')} body={t('shop.payment.removeBody')} action={t('shop.remove')} danger onClose={() => setDrop(null)}
        onYes={() => void changeShop('payment-remove', order.number, d => ({ ...d, payments: d.payments.filter(p => p.id !== drop) }))} />}
    </Dialog>
  );
}

export function Orders() {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney(), currency = useCurrency();
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => data.orders.filter(o => {
    if (filter === 'all') return true;
    if (filter === 'late') return isDelayed(o);
    if (filter === 'open') return o.status === 'pending' || o.status === 'in_progress';
    return o.status === filter;
  }), [data.orders, filter]);
  const columns: Column<ShopOrder>[] = [
    { key: 'number', label: t('shop.number'), render: o => o.number, sort: o => o.number },
    { key: 'customer', label: t('shop.customer'), render: o => nameOf(data, o.customerId), sort: o => nameOf(data, o.customerId) },
    { key: 'title', label: t('shop.order.title'), render: o => o.title, sort: o => o.title },
    { key: 'status', label: t('shop.status'), render: o => <><StatusTag status={o.status} />{isDelayed(o) && <> <span className="tag bad">{t('shop.late')}</span></>}</>, sort: o => o.status },
    { key: 'due', label: t('shop.due'), render: o => dateText(lang, o.dueDate), sort: o => o.dueDate || '9999' },
    { key: 'total', label: t('shop.total'), render: o => money(orderTotals(o).total), sort: o => orderTotals(o).total, align: 'right' },
    { key: 'balance', label: t('shop.balance'), render: o => (o.status === 'cancelled' ? '—' : formatMoney(totalsOf(data, o).balance, currency)), sort: o => totalsOf(data, o).balance, align: 'right' }
  ];
  return (
    <section aria-label={t('shop.tab.orders')}>
      <div className="section-head">
        <h2>{t('shop.tab.orders')}</h2>
        <button type="button" className="btn primary" onClick={() => setAdding(true)} data-testid="order-new">{t('shop.order.new')}</button>
      </div>
      <DataTable rows={rows} columns={columns} testId="orders-table" onRow={o => uiStore.patch({ shopOrder: o.id })}
        search={o => `${o.number} ${o.title} ${nameOf(data, o.customerId)}`}
        filters={<select value={filter} aria-label={t('shop.filter')} onChange={e => setFilter(e.target.value as Filter)} data-testid="order-filter">
          {FILTERS.map(f => <option key={f} value={f}>{t(`shop.filter.${f}`)}</option>)}
        </select>}
        empty={<><p>{t('shop.order.empty')}</p><button type="button" className="btn primary" onClick={() => setAdding(true)}>{t('shop.order.new')}</button></>} />
      {adding && <OrderForm order={null} onClose={() => setAdding(false)} onSaved={id => uiStore.patch({ shopOrder: id })} />}
    </section>
  );
}

export const NewOrderButton = () => {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)} data-testid="quick-order">{t('shop.order.new')}</button>
      {open && <OrderForm order={null} onClose={() => setOpen(false)} onSaved={id => uiStore.patch({ shopOrder: id })} />}
    </>
  );
};
