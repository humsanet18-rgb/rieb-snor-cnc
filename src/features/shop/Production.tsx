import { tr, useT } from '../../app/i18n';
import { IconButton } from '../../components/ui';
import { changeShop, shopStore } from '../../stores/shop-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import type { ShopData, ShopOrder } from '../../types/shop';
import { actualMinutes, applyStatus, finishedLate, isDelayed, queueOf } from './logic';
import { DataTable, dateText, StatusTag, type Column } from './parts';

const nameOf = (d: ShopData, id: string) => d.customers.find(c => c.id === id)?.name ?? '—';

function setStatus(order: ShopOrder, status: 'in_progress' | 'done') {
  void changeShop('order-status', `${order.number}: ${tr(`shop.status.${status}`)}`, d => ({ ...d, orders: d.orders.map(o => (o.id === order.id ? applyStatus(o, status, new Date().toISOString()) : o)) }));
}

/** Swaps queue numbers with the neighbour, so only the two jobs change. */
function shift(order: ShopOrder, by: -1 | 1) {
  const list = queueOf(shopStore.get().data), at = list.findIndex(o => o.id === order.id), other = list[at + by];
  if (!other) return;
  void changeShop('order-edit', order.number, d => ({
    ...d, orders: d.orders.map(o => (o.id === order.id ? { ...o, queue: other.queue } : o.id === other.id ? { ...o, queue: order.queue } : o))
  }));
}

export function Production() {
  const { t, lang } = useT();
  const data = useStore(shopStore, s => s.data);
  const queue = queueOf(data);
  const history = data.orders.filter(o => o.finishedAt).sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!));
  const columns: Column<ShopOrder>[] = [
    { key: 'number', label: t('shop.number'), render: o => o.number },
    { key: 'customer', label: t('shop.customer'), render: o => nameOf(data, o.customerId) },
    { key: 'title', label: t('shop.order.title'), render: o => o.title },
    { key: 'status', label: t('shop.status'), render: o => <><StatusTag status={o.status} />{isDelayed(o) && <> <span className="tag bad">{t('shop.late')}</span></>}</> },
    { key: 'due', label: t('shop.due'), render: o => dateText(lang, o.dueDate) },
    { key: 'machine', label: t('shop.machine'), render: o => o.machine || '—' },
    { key: 'assignee', label: t('shop.assignee'), render: o => o.assignee || '—' },
    { key: 'est', label: t('shop.estMinutes'), render: o => o.estMinutes ?? '—', align: 'right' }
  ];
  const done: Column<ShopOrder>[] = [
    { key: 'number', label: t('shop.number'), render: o => o.number, sort: o => o.number },
    { key: 'title', label: t('shop.order.title'), render: o => o.title, sort: o => o.title },
    { key: 'finished', label: t('shop.finished'), render: o => dateText(lang, o.finishedAt!), sort: o => o.finishedAt! },
    { key: 'est', label: t('shop.estMinutes'), render: o => o.estMinutes ?? '—', align: 'right' },
    { key: 'actual', label: t('shop.actualMinutes'), render: o => actualMinutes(o) ?? '—', sort: o => actualMinutes(o) ?? 0, align: 'right' },
    { key: 'late', label: t('shop.onTime'), render: o => (o.dueDate ? <span className={'tag ' + (finishedLate(o) ? 'bad' : 'ok')}>{t(finishedLate(o) ? 'shop.lateDone' : 'shop.onTimeYes')}</span> : '—') }
  ];
  return (
    <section aria-label={t('shop.tab.production')}>
      <div className="section-head"><h2>{t('shop.queue')}</h2></div>
      <DataTable rows={queue} columns={columns} testId="queue-table" onRow={o => uiStore.patch({ shopOrder: o.id })}
        empty={<p>{t('shop.queue.empty')}</p>}
        actions={o => (
          <>
            {o.status === 'pending'
              ? <button type="button" className="btn primary" onClick={() => setStatus(o, 'in_progress')} data-testid="queue-start">{t('shop.go.in_progress')}</button>
              : <button type="button" className="btn primary" onClick={() => setStatus(o, 'done')} data-testid="queue-finish">{t('shop.go.done')}</button>}
            {o.status === 'pending' && <>
              <IconButton icon="up" label={t('shop.queue.up')} onClick={() => shift(o, -1)} />
              <IconButton icon="down" label={t('shop.queue.down')} onClick={() => shift(o, 1)} />
            </>}
          </>
        )} />
      <div className="section-head"><h2>{t('shop.history')}</h2></div>
      <DataTable rows={history} columns={done} testId="history-table" onRow={o => uiStore.patch({ shopOrder: o.id })} empty={<p>{t('shop.history.empty')}</p>} />
    </section>
  );
}
