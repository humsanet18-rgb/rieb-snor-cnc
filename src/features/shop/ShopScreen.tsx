import { useEffect, useMemo, useRef, useState } from 'react';
import { tr, useT, type Key } from '../../app/i18n';
import { SelectField } from '../../components/ui';
import { saveFile } from '../../services/download';
import { parseShopFile, ShopFileError, toShopFile } from '../../services/shop-io';
import { changeShop, markBackedUp, reloadShop, restoreShop, shopStore } from '../../stores/shop-store';
import { useStore } from '../../stores/store';
import { toast, uiStore, type ShopTab } from '../../stores/ui-store';
import type { Currency, ShopData } from '../../types/shop';
import { Customers } from './Customers';
import { makeReportPdf } from './documents';
import { isDelayed, localDate, moneyText, needsBackup, orderTotals, overview, queueOf, report, toCsv, type Range } from './logic';
import { Money } from './Money';
import { NewOrderButton, OrderDetail, Orders } from './Orders';
import { Card, ConfirmDialog, DataTable, dateText, Field, Input, StatusTag, useMoney, type Column } from './parts';
import { Production } from './Production';
import { Stock } from './Stock';

const TABS: ShopTab[] = ['dashboard', 'orders', 'production', 'customers', 'stock', 'money', 'reports', 'settings'];
const go = (shopTab: ShopTab) => uiStore.patch({ shopTab });

function Dashboard() {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney();
  const o = useMemo(() => overview(data), [data]);
  const queue = queueOf(data).slice(0, 5), backup = needsBackup(data);
  const first = !data.customers.length && !data.orders.length && !data.materials.length;
  return (
    <section aria-label={t('shop.tab.dashboard')}>
      <div className="section-head">
        <h2>{t('shop.tab.dashboard')}</h2>
        <div className="btn-row">
          <NewOrderButton />
          <button type="button" className="btn" onClick={() => go('customers')}>{t('shop.tab.customers')}</button>
          <button type="button" className="btn" onClick={() => go('stock')}>{t('shop.tab.stock')}</button>
        </div>
      </div>
      {first && <p className="notice" data-testid="shop-welcome">{t('shop.welcome')}</p>}
      <ul className="notices" data-testid="alerts">
        {o.delayed > 0 && <li className="notice bad"><button type="button" className="link" onClick={() => go('production')}>{t('shop.alert.delayed', { n: o.delayed })}</button></li>}
        {o.lowStock.map(m => <li key={m.id} className="notice warn"><button type="button" className="link" onClick={() => go('stock')}>{t('shop.alert.low', { name: m.name })}</button></li>)}
        {backup && <li className="notice warn"><button type="button" className="link" onClick={() => go('settings')}>{t('shop.alert.backup')}</button></li>}
      </ul>
      <div className="stat-grid">
        <Card label="shop.filter.all" value={o.orders} onClick={() => go('orders')} testId="dash-orders" />
        <Card label="shop.filter.quote" value={o.quotes} onClick={() => go('orders')} testId="dash-quotes" />
        <Card label="shop.filter.pending" value={o.pending} onClick={() => go('production')} testId="dash-pending" />
        <Card label="shop.filter.in_progress" value={o.running} onClick={() => go('production')} testId="dash-running" />
        <Card label="shop.dash.done" value={o.done} onClick={() => go('production')} testId="dash-done" />
        <Card label="shop.filter.late" value={o.delayed} tone={o.delayed ? 'bad' : undefined} onClick={() => go('production')} testId="dash-delayed" />
        <Card label="shop.received" value={money(o.received)} tone="ok" onClick={() => go('money')} testId="dash-received" />
        <Card label="shop.owed" value={money(o.owed)} tone={o.owed ? 'warn' : undefined} onClick={() => go('money')} testId="dash-owed" />
        <Card label="shop.expenses" value={money(o.expenses)} onClick={() => go('money')} testId="dash-expenses" />
      </div>
      <div className="two-up">
        <div>
          <h3>{t('shop.queue')}</h3>
          {queue.length ? (
            <ul className="plain-list" data-testid="dash-queue">
              {queue.map(q => (
                <li key={q.id}>
                  <button type="button" className="link" onClick={() => uiStore.patch({ shopOrder: q.id })}>{q.number}</button>
                  <span>{q.title}</span>{isDelayed(q) ? <span className="tag bad">{t('shop.late')}</span> : <StatusTag status={q.status} />}
                </li>
              ))}
            </ul>
          ) : <p className="hint">{t('shop.queue.empty')}</p>}
        </div>
        <div>
          <h3>{t('shop.activity')}</h3>
          {data.activity.length ? (
            <ul className="plain-list" data-testid="dash-activity">
              {data.activity.slice(0, 6).map(a => <li key={a.id}><span>{t(`shop.act.${a.action}`)}{a.detail ? `: ${a.detail}` : ''}</span><small>{dateText(lang, a.at)}</small></li>)}
            </ul>
          ) : <p className="hint">{t('shop.activity.empty')}</p>}
        </div>
      </div>
    </section>
  );
}

const monthStart = () => localDate().slice(0, 8) + '01';

function Reports() {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney(), currency = data.settings.currency;
  const [range, setRange] = useState<Range>({ from: monthStart(), to: localDate() });
  const r = useMemo(() => report(data, range), [data, range]);
  const backwards = !!range.from && !!range.to && range.from > range.to;
  const name = (id: string) => data.customers.find(c => c.id === id)?.name ?? '';
  const plain = (minor: number) => moneyText(minor, currency);
  const orderCsv = () => saveFile('orders.csv', toCsv([
    [t('shop.number'), t('shop.customer'), t('shop.order.title'), t('shop.status'), t('shop.due'), t('shop.total')],
    ...r.created.map(o => [o.number, name(o.customerId), o.title, t(`shop.status.${o.status}`), o.dueDate, plain(orderTotals(o).total)])
  ]), 'text/csv');
  const customerCsv = () => saveFile('customers.csv', toCsv([
    [t('shop.name'), t('shop.tab.orders'), t('shop.total'), t('shop.paid')], ...r.customers.map(c => [c.name, c.orders, plain(c.total), plain(c.paid)])
  ]), 'text/csv');
  const materialCsv = () => saveFile('materials.csv', toCsv([
    [t('shop.name'), t('shop.report.used'), t('shop.report.cost')], ...r.materials.map(m => [m.name, m.used, plain(m.cost)])
  ]), 'text/csv');
  const customers: Column<ReportRow>[] = [
    { key: 'name', label: t('shop.name'), render: c => c.name, sort: c => c.name },
    { key: 'orders', label: t('shop.tab.orders'), render: c => c.orders, sort: c => c.orders, align: 'right' },
    { key: 'total', label: t('shop.total'), render: c => money(c.total), sort: c => c.total, align: 'right' },
    { key: 'paid', label: t('shop.paid'), render: c => money(c.paid), sort: c => c.paid, align: 'right' }
  ];
  const materials: Column<(typeof r.materials)[number]>[] = [
    { key: 'name', label: t('shop.name'), render: m => m.name, sort: m => m.name },
    { key: 'used', label: t('shop.report.used'), render: m => m.used, sort: m => m.used, align: 'right' },
    { key: 'cost', label: t('shop.report.cost'), render: m => money(m.cost), sort: m => m.cost, align: 'right' }
  ];
  return (
    <section aria-label={t('shop.tab.reports')}>
      <div className="section-head"><h2>{t('shop.tab.reports')}</h2></div>
      <div className="range">
        <Input label={t('shop.from')} value={range.from} onChange={from => setRange(x => ({ ...x, from }))} type="date" testId="report-from" />
        <Input label={t('shop.to')} value={range.to} onChange={to => setRange(x => ({ ...x, to }))} type="date" testId="report-to" />
      </div>
      {backwards && <p className="notice warn">{t('shop.report.backwards')}</p>}
      <div className="stat-grid">
        <Card label="shop.report.created" value={r.created.length} testId="report-created" />
        <Card label="shop.report.completed" value={r.completed.length} testId="report-completed" />
        <Card label="shop.report.late" value={r.late} tone={r.late ? 'bad' : undefined} />
        <Card label="shop.invoiced" value={money(r.invoiced)} />
        <Card label="shop.received" value={money(r.received)} tone="ok" testId="report-received" />
        <Card label="shop.expenses" value={money(r.expenses)} />
        <Card label="shop.report.result" value={money(r.cashResult)} tone={r.cashResult < 0 ? 'bad' : 'ok'} testId="report-result" />
        <Card label="shop.report.time" value={`${r.estimated} / ${r.actual}`} />
      </div>
      <p className="hint">{t('shop.report.note')}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={orderCsv} data-testid="csv-orders">{t('shop.report.csvOrders')}</button>
        <button type="button" className="btn" onClick={customerCsv} data-testid="csv-customers">{t('shop.report.csvCustomers')}</button>
        <button type="button" className="btn" onClick={materialCsv} data-testid="csv-materials">{t('shop.report.csvMaterials')}</button>
        <button type="button" className="btn" onClick={() => void makeReportPdf(r, range, data, lang).catch(() => toast(t('shop.pdfFailed'), true))} data-testid="report-pdf">{t('shop.report.pdf')}</button>
      </div>
      <div className="section-head"><h2>{t('shop.tab.customers')}</h2></div>
      <DataTable rows={r.customers} columns={customers} testId="report-customers" empty={<p>{t('shop.report.none')}</p>} />
      <div className="section-head"><h2>{t('shop.tab.stock')}</h2></div>
      <DataTable rows={r.materials} columns={materials} testId="report-materials" empty={<p>{t('shop.report.none')}</p>} />
    </section>
  );
}
type ReportRow = ReturnType<typeof report>['customers'][number];

const hasMoney = (d: ShopData) => d.orders.length > 0 || d.payments.length > 0 || d.expenses.length > 0 || d.materials.length > 0;

/** The fields start from the stored values, so a restore or another tab has to reset them. */
function SettingsPanel() {
  const s = useStore(shopStore, x => x.data.settings);
  return <SettingsForm key={[s.shopName, s.phone, s.address, s.taxRate, s.currency].join('|')} />;
}

function SettingsForm() {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data), s = data.settings;
  const [shopName, setName] = useState(s.shopName);
  const [phone, setPhone] = useState(s.phone);
  const [address, setAddress] = useState(s.address);
  const [taxRate, setTax] = useState(String(s.taxRate));
  const [currency, setCurrency] = useState<Currency>(s.currency);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<ShopData | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const save = async () => {
    const rate = Number(taxRate || 0);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setError(t('shop.err.percent')); return; }
    setError(undefined);
    const ok = await changeShop('settings', '', d => ({ ...d, settings: { ...d.settings, shopName: shopName.trim(), phone: phone.trim(), address: address.trim(), taxRate: rate, currency } }));
    if (ok) toast(t('shop.saved'));
  };
  const backup = async () => {
    saveFile(`rieb-snor-shop ${localDate()}.json`, toShopFile({ ...data, settings: { ...s, lastBackup: new Date().toISOString() } }), 'application/json');
    if (await markBackedUp()) toast(t('shop.backup.done'));
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 50e6) { toast(t('shop.backup.bad'), true); return; }
    try { setPending(parseShopFile(await file.text())); }
    catch (e) { toast(t('shop.backup.bad') + (e instanceof ShopFileError ? ` (${e.message})` : ''), true); }
    if (input.current) input.current.value = '';
  };
  return (
    <section aria-label={t('shop.tab.settings')}>
      <div className="section-head"><h2>{t('shop.tab.settings')}</h2></div>
      <div className="settings-grid">
        <div className="fields">
          <Input label={t('shop.shopName')} value={shopName} onChange={setName} wide testId="shop-name" />
          <Input label={t('shop.phone')} value={phone} onChange={setPhone} type="tel" />
          <Input label={t('shop.address')} value={address} onChange={setAddress} />
          <Input label={t('shop.taxRate')} value={taxRate} onChange={setTax} error={error} testId="shop-tax" />
          {hasMoney(data)
            ? <Field label={t('shop.currency')}>{id => <input id={id} type="text" value={s.currency} disabled />}</Field>
            : <SelectField label={t('shop.currency')} value={currency} onChange={setCurrency} wide={false} testId="shop-currency" options={[{ value: 'USD', label: 'USD ($)' }, { value: 'KHR', label: 'KHR (៛)' }]} />}
          <div className="wide"><button type="button" className="btn primary" onClick={() => void save()} data-testid="shop-save">{t('shop.save')}</button></div>
          {hasMoney(data) && <p className="hint wide">{t('shop.currency.locked')}</p>}
        </div>
        <div className="backup-box">
          <h3>{t('shop.backup')}</h3>
          <p className="hint">{t('shop.backup.about', { host: location.host })}</p>
          <p data-testid="last-backup">{t('shop.backup.last', { when: s.lastBackup ? dateText(lang, s.lastBackup) : t('shop.backup.never') })}</p>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void backup()} data-testid="shop-backup">{t('shop.backup.save')}</button>
            <button type="button" className="btn" onClick={() => input.current?.click()} data-testid="shop-restore">{t('shop.backup.restore')}</button>
            <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => void pick(e.target.files?.[0])} data-testid="shop-restore-input" />
          </div>
        </div>
      </div>
      <div className="section-head"><h2>{t('shop.activity')}</h2></div>
      <DataTable rows={data.activity} columns={activityColumns(t, lang)} testId="activity-table" search={a => `${tr(`shop.act.${a.action}`)} ${a.detail}`} empty={<p>{t('shop.activity.empty')}</p>} />
      {pending && <ConfirmDialog title={t('shop.backup.restore')} body={t('shop.backup.confirm', { orders: pending.orders.length, customers: pending.customers.length })} action={t('shop.backup.replace')} danger
        onClose={() => setPending(null)} onYes={() => void restoreShop(pending).then(ok => { if (ok) toast(t('shop.backup.restored')); })} />}
    </section>
  );
}

function activityColumns(t: (k: Key) => string, lang: string): Column<ShopData['activity'][number]>[] {
  return [
    { key: 'at', label: t('shop.date'), render: a => new Date(a.at).toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB'), sort: a => a.at },
    { key: 'action', label: t('shop.action'), render: a => t(`shop.act.${a.action}`) },
    { key: 'detail', label: t('shop.detail'), render: a => a.detail || '—' }
  ];
}

export function ShopScreen() {
  const { t } = useT();
  const tab = useStore(uiStore, s => s.shopTab), open = useStore(uiStore, s => s.shopOrder), status = useStore(shopStore, s => s.status);
  useEffect(() => { void reloadShop(); }, []);
  return (
    <div className="shop" data-testid="shop">
      <nav className="shop-nav" aria-label={t('view.shop')}>
        {TABS.map(x => (
          <button key={x} type="button" className={x === tab ? 'on' : ''} aria-current={x === tab ? 'page' : undefined} onClick={() => go(x)} data-testid={`shop-${x}`}>{t(`shop.tab.${x}`)}</button>
        ))}
      </nav>
      <main className="shop-main">
        {status === 'loading' && <p className="hint" role="status">{t('shop.loading')}</p>}
        {status === 'error' && (
          <div className="notice bad" role="alert" data-testid="shop-error">
            <p>{t('shop.loadFailed')}</p>
            <button type="button" className="btn" onClick={() => void reloadShop()}>{t('shop.retry')}</button>
          </div>
        )}
        {status === 'ready' && <>
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'orders' && <Orders />}
          {tab === 'production' && <Production />}
          {tab === 'customers' && <Customers />}
          {tab === 'stock' && <Stock />}
          {tab === 'money' && <Money />}
          {tab === 'reports' && <Reports />}
          {tab === 'settings' && <SettingsPanel />}
          {open && <OrderDetail id={open} onClose={() => uiStore.patch({ shopOrder: null })} />}
        </>}
      </main>
    </div>
  );
}
