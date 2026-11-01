import { useMemo, useState } from 'react';
import { useT } from '../../app/i18n';
import { Check, Dialog } from '../../components/ui';
import { changeShop, shopStore } from '../../stores/shop-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import type { ShopCustomer } from '../../types/shop';
import { newId } from '../nesting/model';
import { orderTotals, totalsOf } from './logic';
import { Area, DataTable, dateText, FormDialog, Input, StatusTag, useMoney, type Column } from './parts';

export function CustomerForm({ customer, onClose, onSaved }: { customer: ShopCustomer | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const { t } = useT();
  const customers = useStore(shopStore, s => s.data.customers);
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [error, setError] = useState<string>();
  const submit = async () => {
    const clean = name.trim(), now = new Date().toISOString(), id = customer?.id ?? newId('cus');
    if (!clean) { setError(t('shop.err.name')); return false; }
    const same = customers.find(c => c.id !== customer?.id && c.name.toLowerCase() === clean.toLowerCase() && c.phone.trim() === phone.trim());
    if (same) { setError(t('shop.err.duplicate')); return false; }
    const fields = { name: clean, phone: phone.trim(), address: address.trim(), notes: notes.trim(), updatedAt: now };
    const ok = await changeShop(customer ? 'customer-edit' : 'customer-add', clean, d => ({
      ...d, customers: customer ? d.customers.map(c => (c.id === id ? { ...c, ...fields } : c)) : [{ ...fields, id, archived: false, createdAt: now }, ...d.customers]
    }));
    if (ok) onSaved?.(id);
    return ok;
  };
  return (
    <FormDialog title={customer ? t('shop.customer.edit') : t('shop.customer.new')} onClose={onClose} onSubmit={submit} testId="customer-form">
      <Input label={t('shop.name')} value={name} onChange={setName} error={error} required wide testId="customer-name" />
      <Input label={t('shop.phone')} value={phone} onChange={setPhone} type="tel" testId="customer-phone" />
      <Input label={t('shop.address')} value={address} onChange={setAddress} />
      <Area label={t('shop.notes')} value={notes} onChange={setNotes} />
    </FormDialog>
  );
}

function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney();
  const [editing, setEditing] = useState(false);
  const customer = data.customers.find(c => c.id === id);
  if (!customer) return null;
  const orders = data.orders.filter(o => o.customerId === id), billed = orders.filter(o => o.status !== 'quote' && o.status !== 'cancelled');
  const owed = billed.reduce((s, o) => s + Math.max(0, totalsOf(data, o).balance), 0);
  const archive = () => void changeShop(customer.archived ? 'customer-restore' : 'customer-archive', customer.name, d => ({
    ...d, customers: d.customers.map(c => (c.id === id ? { ...c, archived: !c.archived, updatedAt: new Date().toISOString() } : c))
  }));
  return (
    <Dialog title={customer.name} onClose={onClose} wide>
      {customer.archived && <p className="notice warn">{t('shop.customer.archived')}</p>}
      <dl className="detail-grid">
        <div><dt>{t('shop.phone')}</dt><dd>{customer.phone || '—'}</dd></div>
        <div><dt>{t('shop.address')}</dt><dd>{customer.address || '—'}</dd></div>
        <div><dt>{t('shop.tab.orders')}</dt><dd>{orders.length}</dd></div>
        <div><dt>{t('shop.owed')}</dt><dd data-testid="customer-owed">{money(owed)}</dd></div>
      </dl>
      {customer.notes && <p className="hint">{customer.notes}</p>}
      <h3>{t('shop.customer.history')}</h3>
      {orders.length ? (
        <ul className="plain-list" data-testid="customer-orders">
          {orders.map(o => (
            <li key={o.id}>
              <button type="button" className="link" onClick={() => uiStore.patch({ shopOrder: o.id })}>{o.number}</button>
              <span>{o.title} · {dateText(lang, o.createdAt)}</span><StatusTag status={o.status} /><b>{money(orderTotals(o).total)}</b>
            </li>
          ))}
        </ul>
      ) : <p className="hint">{t('shop.customer.noOrders')}</p>}
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setEditing(true)} data-testid="customer-edit">{t('shop.edit')}</button>
        <button type="button" className="btn" onClick={archive} data-testid="customer-archive">{t(customer.archived ? 'shop.restore' : 'shop.archive')}</button>
      </div>
      {editing && <CustomerForm customer={customer} onClose={() => setEditing(false)} />}
    </Dialog>
  );
}

export function Customers() {
  const { t } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const rows = useMemo(() => data.customers.filter(c => archived || !c.archived), [data.customers, archived]);
  const countOf = (id: string) => data.orders.filter(o => o.customerId === id).length;
  const owedOf = (id: string) => data.orders.filter(o => o.customerId === id && o.status !== 'quote' && o.status !== 'cancelled').reduce((s, o) => s + Math.max(0, totalsOf(data, o).balance), 0);
  const columns: Column<ShopCustomer>[] = [
    { key: 'name', label: t('shop.name'), render: c => c.name, sort: c => c.name },
    { key: 'phone', label: t('shop.phone'), render: c => c.phone || '—' },
    { key: 'address', label: t('shop.address'), render: c => c.address || '—' },
    { key: 'orders', label: t('shop.tab.orders'), render: c => countOf(c.id), sort: c => countOf(c.id), align: 'right' },
    { key: 'owed', label: t('shop.owed'), render: c => money(owedOf(c.id)), sort: c => owedOf(c.id), align: 'right' }
  ];
  return (
    <section aria-label={t('shop.tab.customers')}>
      <div className="section-head">
        <h2>{t('shop.tab.customers')}</h2>
        <button type="button" className="btn primary" onClick={() => setAdding(true)} data-testid="customer-new">{t('shop.customer.new')}</button>
      </div>
      <DataTable rows={rows} columns={columns} testId="customers-table" onRow={c => setViewing(c.id)} search={c => `${c.name} ${c.phone} ${c.address}`}
        filters={<Check label={t('shop.showArchived')} checked={archived} onChange={setArchived} testId="show-archived" />}
        empty={<><p>{t('shop.customer.empty')}</p><button type="button" className="btn primary" onClick={() => setAdding(true)}>{t('shop.customer.new')}</button></>} />
      {adding && <CustomerForm customer={null} onClose={() => setAdding(false)} />}
      {viewing && <CustomerDetail id={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
