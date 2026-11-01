import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useT, type Key } from '../../app/i18n';
import { Dialog } from '../../components/ui';
import { shopStore } from '../../stores/shop-store';
import { useStore } from '../../stores/store';
import type { Currency, OrderStatus } from '../../types/shop';
import { formatMoney, moneyText, parseMoney } from './logic';

export const useCurrency = () => useStore(shopStore, s => s.data.settings.currency);

export function useMoney() {
  const currency = useCurrency();
  return (minor: number) => formatMoney(minor, currency);
}

/** Day first in both languages, the way dates are written in Cambodia. */
export const dateText = (_lang: string, iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-GB');
};

/** One labelled control. The error sits under it and stays until the value is fixed. */
export function Field({ label, error, required, wide, children }: { label: string; error?: string; required?: boolean; wide?: boolean; children: (id: string, invalid: boolean) => ReactNode }) {
  const id = useId();
  return (
    <div className={'field' + (wide ? ' wide' : '')}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      {children(id, !!error)}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}

interface TextProps { label: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean; wide?: boolean; type?: string; testId?: string; maxLength?: number }

export function Input({ label, value, onChange, error, required, wide, type = 'text', testId, maxLength = 200 }: TextProps) {
  return (
    <Field label={label} error={error} required={required} wide={wide}>
      {(id, invalid) => <input id={id} type={type} value={value} maxLength={maxLength} required={required} aria-invalid={invalid} onChange={e => onChange(e.target.value)} data-testid={testId} />}
    </Field>
  );
}

export function Area({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId?: string }) {
  return (
    <Field label={label} wide>
      {id => <textarea id={id} rows={2} value={value} maxLength={2000} onChange={e => onChange(e.target.value)} data-testid={testId} />}
    </Field>
  );
}

export const moneyInput = (minor: number, currency: Currency) => moneyText(minor, currency);

/** Amounts stay as typed text in a form, then go through `parseMoney` once on save. */
export function MoneyInput({ label, value, onChange, error, required, testId }: { label: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean; testId?: string }) {
  const currency = useCurrency();
  return (
    <Field label={`${label} (${currency === 'USD' ? '$' : '៛'})`} error={error} required={required}>
      {(id, invalid) => <input id={id} type="text" inputMode="decimal" value={value} required={required} aria-invalid={invalid} onChange={e => onChange(e.target.value)} data-testid={testId} />}
    </Field>
  );
}

export function checkMoney(text: string, currency: Currency, message: string): { value: number; error?: string } {
  const value = parseMoney(text || '0', currency);
  return value === null ? { value: 0, error: message } : { value };
}

/** A dialog form that keeps its input on failure and ignores a second click while saving. */
export function FormDialog({ title, onClose, onSubmit, children, submit, wide, testId }: {
  title: string; onClose: () => void; onSubmit: () => Promise<boolean>; children: ReactNode; submit?: string; wide?: boolean; testId?: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await onSubmit();
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog title={title} onClose={onClose} wide={wide}>
      <form onSubmit={e => void send(e)} noValidate data-testid={testId}>
        <div className="fields">{children}</div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>{t('shop.cancel')}</button>
          <button type="submit" className="btn primary" disabled={busy} data-testid="form-save">{busy ? t('shop.saving') : submit ?? t('shop.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function ConfirmDialog({ title, body, action, danger, onYes, onClose }: { title: string; body: string; action: string; danger?: boolean; onYes: () => void; onClose: () => void }) {
  const { t } = useT();
  return (
    <Dialog title={title} onClose={onClose}>
      <p>{body}</p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>{t('shop.cancel')}</button>
        <button type="button" className={'btn ' + (danger ? 'danger' : 'primary')} data-testid="confirm-yes" onClick={() => { onYes(); onClose(); }}>{action}</button>
      </div>
    </Dialog>
  );
}

const STATUS_STYLE: Record<OrderStatus, string> = { quote: '', pending: 'warn', in_progress: 'run', done: 'ok', delivered: 'ok', cancelled: 'off' };

export function StatusTag({ status }: { status: OrderStatus }) {
  const { t } = useT();
  return <span className={'tag ' + STATUS_STYLE[status]} data-testid="status">{t(`shop.status.${status}`)}</span>;
}

export interface Column<R> { key: string; label: string; render: (r: R) => ReactNode; sort?: (r: R) => string | number; align?: 'right' }

const PAGE = 20;

/** Search, sort and paging in one place. Under 760 px each row becomes a labelled card, so nothing scrolls sideways. */
export function DataTable<R extends { id: string }>({ rows, columns, search, empty, filters, actions, onRow, testId }: {
  rows: R[]; columns: Column<R>[]; search?: (r: R) => string; empty: ReactNode; filters?: ReactNode; actions?: (r: R) => ReactNode; onRow?: (r: R) => void; testId?: string;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; down: boolean } | null>(null);
  const [page, setPage] = useState(0);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q && search ? rows.filter(r => search(r).toLowerCase().includes(q)) : rows;
    const col = sort && columns.find(c => c.key === sort.key);
    if (!col?.sort) return list;
    const value = col.sort, dir = sort!.down ? -1 : 1;
    return [...list].sort((a, b) => {
      const x = value(a), y = value(b);
      return dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)));
    });
  }, [rows, columns, query, search, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), current = Math.min(page, pages - 1);
  const slice = shown.slice(current * PAGE, (current + 1) * PAGE);
  return (
    <div className="table-area">
      {(search || filters) && (
        <div className="table-tools">
          {search && <input type="search" value={query} placeholder={t('shop.search')} aria-label={t('shop.search')} onChange={e => { setQuery(e.target.value); setPage(0); }} data-testid="table-search" />}
          {filters}
        </div>
      )}
      {!slice.length ? <div className="empty-state" data-testid="table-empty">{query ? t('shop.noMatch') : empty}</div> : (
        <table className="data-table" data-testid={testId}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} scope="col" className={c.align === 'right' ? 'amount' : undefined} aria-sort={sort?.key === c.key ? (sort.down ? 'descending' : 'ascending') : undefined}>
                  {c.sort ? <button type="button" onClick={() => setSort(s => ({ key: c.key, down: s?.key === c.key ? !s.down : false }))}>{c.label}{sort?.key === c.key ? (sort.down ? ' ↓' : ' ↑') : ''}</button> : c.label}
                </th>
              ))}
              {actions && <th scope="col"><span className="sr">{t('shop.actions')}</span></th>}
            </tr>
          </thead>
          <tbody>
            {slice.map(r => (
              <tr key={r.id}>
                {columns.map((c, i) => (
                  <td key={c.key} data-label={c.label} className={c.align === 'right' ? 'amount' : undefined}>
                    {i === 0 && onRow ? <button type="button" className="link" onClick={() => onRow(r)}>{c.render(r)}</button> : c.render(r)}
                  </td>
                ))}
                {actions && <td className="row-actions">{actions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <div className="pager">
          <button type="button" className="btn" disabled={current <= 0} onClick={() => setPage(current - 1)} data-testid="page-prev">{t('shop.prev')}</button>
          <span data-testid="page-label">{t('shop.pageOf', { n: current + 1, total: pages })}</span>
          <button type="button" className="btn" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} data-testid="page-next">{t('shop.next')}</button>
        </div>
      )}
    </div>
  );
}

export function Card({ label, value, tone, onClick, testId }: { label: Key; value: ReactNode; tone?: 'bad' | 'warn' | 'ok'; onClick?: () => void; testId?: string }) {
  const { t } = useT();
  const body = <><span>{t(label)}</span><b data-testid={testId}>{value}</b></>;
  return onClick
    ? <button type="button" className={'stat-card ' + (tone ?? '')} onClick={onClick}>{body}</button>
    : <div className={'stat-card ' + (tone ?? '')}>{body}</div>;
}
