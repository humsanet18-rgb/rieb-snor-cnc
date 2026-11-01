import { useState } from 'react';
import { useT } from '../../app/i18n';
import { IconButton } from '../../components/ui';
import { changeShop, shopStore } from '../../stores/shop-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import type { Expense, Payment, ShopOrder } from '../../types/shop';
import { newId } from '../nesting/model';
import { formatMoney, localDate, overview, parseMoney, totalsOf } from './logic';
import { Card, ConfirmDialog, DataTable, dateText, FormDialog, Input, MoneyInput, useCurrency, useMoney, type Column } from './parts';

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const currency = useCurrency();
  const [date, setDate] = useState(localDate());
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const e: Record<string, string> = {}, value = parseMoney(amount, currency);
    if (!category.trim()) e.category = t('shop.err.category');
    if (!value) e.amount = t('shop.err.amount');
    setErrors(e);
    if (Object.keys(e).length) return false;
    return changeShop('expense-add', `${category.trim()} ${formatMoney(value!, currency)}`, d => ({
      ...d, expenses: [{ id: newId('exp'), date: date || localDate(), category: category.trim(), amount: value!, note: note.trim() }, ...d.expenses]
    }));
  };
  return (
    <FormDialog title={t('shop.expense.new')} onClose={onClose} onSubmit={submit} testId="expense-form">
      <Input label={t('shop.category')} value={category} onChange={setCategory} error={errors.category} required testId="expense-category" />
      <MoneyInput label={t('shop.amount')} value={amount} onChange={setAmount} error={errors.amount} required testId="expense-amount" />
      <Input label={t('shop.date')} value={date} onChange={setDate} type="date" />
      <Input label={t('shop.notes')} value={note} onChange={setNote} />
    </FormDialog>
  );
}

export function Money() {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney();
  const [adding, setAdding] = useState(false);
  const [drop, setDrop] = useState<Expense | null>(null);
  const o = overview(data);
  const owing = data.orders.filter(x => x.status !== 'quote' && x.status !== 'cancelled' && totalsOf(data, x).balance > 0);
  const numberOf = (id: string) => data.orders.find(x => x.id === id)?.number ?? '—';
  const owed: Column<ShopOrder>[] = [
    { key: 'number', label: t('shop.number'), render: x => x.number, sort: x => x.number },
    { key: 'customer', label: t('shop.customer'), render: x => data.customers.find(c => c.id === x.customerId)?.name ?? '—' },
    { key: 'total', label: t('shop.total'), render: x => money(totalsOf(data, x).total), align: 'right' },
    { key: 'paid', label: t('shop.paid'), render: x => money(totalsOf(data, x).paid), align: 'right' },
    { key: 'balance', label: t('shop.balance'), render: x => money(totalsOf(data, x).balance), sort: x => totalsOf(data, x).balance, align: 'right' }
  ];
  const payments: Column<Payment>[] = [
    { key: 'date', label: t('shop.date'), render: p => dateText(lang, p.date), sort: p => p.date },
    { key: 'order', label: t('shop.number'), render: p => numberOf(p.orderId), sort: p => numberOf(p.orderId) },
    { key: 'method', label: t('shop.method'), render: p => t(`shop.method.${p.method}`) },
    { key: 'amount', label: t('shop.amount'), render: p => money(p.amount), sort: p => p.amount, align: 'right' }
  ];
  const expenses: Column<Expense>[] = [
    { key: 'date', label: t('shop.date'), render: e => dateText(lang, e.date), sort: e => e.date },
    { key: 'category', label: t('shop.category'), render: e => e.category, sort: e => e.category },
    { key: 'note', label: t('shop.notes'), render: e => e.note || '—' },
    { key: 'amount', label: t('shop.amount'), render: e => money(e.amount), sort: e => e.amount, align: 'right' }
  ];
  return (
    <section aria-label={t('shop.tab.money')}>
      <div className="section-head"><h2>{t('shop.tab.money')}</h2></div>
      <div className="stat-grid">
        <Card label="shop.invoiced" value={money(o.invoiced)} />
        <Card label="shop.received" value={money(o.received)} tone="ok" testId="money-received" />
        <Card label="shop.owed" value={money(o.owed)} tone={o.owed ? 'warn' : undefined} testId="money-owed" />
        <Card label="shop.expenses" value={money(o.expenses)} testId="money-expenses" />
      </div>
      <div className="section-head"><h2>{t('shop.owing')}</h2></div>
      <DataTable rows={owing} columns={owed} testId="owing-table" onRow={x => uiStore.patch({ shopOrder: x.id })} empty={<p>{t('shop.owing.empty')}</p>} />
      <div className="section-head"><h2>{t('shop.payments')}</h2></div>
      <DataTable rows={data.payments} columns={payments} testId="payments-table" empty={<p>{t('shop.payment.none')}</p>} />
      <div className="section-head">
        <h2>{t('shop.expenses')}</h2>
        <button type="button" className="btn primary" onClick={() => setAdding(true)} data-testid="expense-new">{t('shop.expense.new')}</button>
      </div>
      <DataTable rows={data.expenses} columns={expenses} testId="expenses-table" empty={<p>{t('shop.expense.empty')}</p>}
        actions={e => <IconButton icon="trash" label={t('shop.remove')} onClick={() => setDrop(e)} testId="expense-remove" />} />
      {adding && <ExpenseForm onClose={() => setAdding(false)} />}
      {drop && <ConfirmDialog title={t('shop.expense.remove')} body={t('shop.expense.removeBody')} action={t('shop.remove')} danger onClose={() => setDrop(null)}
        onYes={() => void changeShop('expense-remove', drop.category, d => ({ ...d, expenses: d.expenses.filter(x => x.id !== drop.id) }))} />}
    </section>
  );
}
