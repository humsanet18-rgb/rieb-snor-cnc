import { useState } from 'react';
import { useT } from '../../app/i18n';
import { Dialog, SelectField } from '../../components/ui';
import { changeShop, shopStore } from '../../stores/shop-store';
import { useStore } from '../../stores/store';
import type { Material, MoveKind } from '../../types/shop';
import { newId } from '../nesting/model';
import { isLow, localDate, parseMoney, stockOf } from './logic';
import { DataTable, dateText, FormDialog, Input, moneyInput, MoneyInput, useCurrency, useMoney, type Column } from './parts';

function MaterialForm({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const { t } = useT();
  const currency = useCurrency();
  const [name, setName] = useState(material?.name ?? '');
  const [w, setW] = useState(String(material?.widthMm ?? 1000));
  const [h, setH] = useState(String(material?.heightMm ?? 480));
  const [th, setTh] = useState(String(material?.thicknessMm ?? 50));
  const [cost, setCost] = useState(material ? moneyInput(material.unitCost, currency) : '');
  const [low, setLow] = useState(String(material?.lowStock ?? 5));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const e: Record<string, string> = {}, sizes = [w, h, th].map(Number), unitCost = parseMoney(cost || '0', currency), lowStock = Number(low);
    if (!name.trim()) e.name = t('shop.err.name');
    if (sizes.some(n => !Number.isFinite(n) || n <= 0)) e.size = t('shop.err.number');
    if (unitCost === null) e.cost = t('shop.err.money');
    if (!Number.isFinite(lowStock) || lowStock < 0) e.low = t('shop.err.number');
    setErrors(e);
    if (Object.keys(e).length) return false;
    const fields = { name: name.trim(), widthMm: sizes[0], heightMm: sizes[1], thicknessMm: sizes[2], unitCost: unitCost!, lowStock };
    return changeShop(material ? 'material-edit' : 'material-add', fields.name, d => ({
      ...d, materials: material ? d.materials.map(m => (m.id === material.id ? { ...m, ...fields } : m)) : [{ ...fields, id: newId('mat'), archived: false, createdAt: new Date().toISOString() }, ...d.materials]
    }));
  };
  return (
    <FormDialog title={material ? t('shop.material.edit') : t('shop.material.new')} onClose={onClose} onSubmit={submit} testId="material-form">
      <Input label={t('shop.name')} value={name} onChange={setName} error={errors.name} required wide testId="material-name" />
      <Input label={t('shop.widthMm')} value={w} onChange={setW} error={errors.size} required />
      <Input label={t('shop.heightMm')} value={h} onChange={setH} required />
      <Input label={t('shop.thicknessMm')} value={th} onChange={setTh} required />
      <MoneyInput label={t('shop.unitCost')} value={cost} onChange={setCost} error={errors.cost} testId="material-cost" />
      <Input label={t('shop.lowStock')} value={low} onChange={setLow} error={errors.low} testId="material-low" />
    </FormDialog>
  );
}

function MoveForm({ material, onClose }: { material: Material; onClose: () => void }) {
  const { t } = useT();
  const stock = useStore(shopStore, s => stockOf(s.data, material.id));
  const [kind, setKind] = useState<MoveKind>('in');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(localDate());
  const [error, setError] = useState<string>();
  const submit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || (kind === 'adjust' ? n < 0 : n <= 0)) { setError(t('shop.err.qty')); return false; }
    if (kind === 'out' && n > stock) { setError(t('shop.err.stock', { n: stock })); return false; }
    const change = kind === 'in' ? n : kind === 'out' ? -n : n - stock;
    return changeShop('stock-move', `${material.name} ${change > 0 ? '+' : ''}${change}`, d => ({
      ...d, moves: [{ id: newId('mov'), materialId: material.id, qty: change, kind, orderId: null, note: note.trim(), date: date || localDate() }, ...d.moves]
    }));
  };
  return (
    <FormDialog title={t('shop.stock.title', { name: material.name, n: stock })} onClose={onClose} onSubmit={submit} testId="move-form">
      <SelectField label={t('shop.stock.kind')} value={kind} onChange={setKind} testId="move-kind" options={(['in', 'out', 'adjust'] as const).map(value => ({ value, label: t(`shop.move.${value}`) }))} />
      <Input label={t(kind === 'adjust' ? 'shop.stock.counted' : 'shop.item.qty')} value={qty} onChange={setQty} error={error} required testId="move-qty" />
      <Input label={t('shop.date')} value={date} onChange={setDate} type="date" />
      <Input label={t('shop.notes')} value={note} onChange={setNote} />
    </FormDialog>
  );
}

function History({ material, onClose }: { material: Material; onClose: () => void }) {
  const { t, lang } = useT();
  const moves = useStore(shopStore, s => s.data.moves).filter(m => m.materialId === material.id);
  return (
    <Dialog title={t('shop.stock.history', { name: material.name })} onClose={onClose}>
      {moves.length ? (
        <ul className="plain-list" data-testid="move-history">
          {moves.map(m => <li key={m.id}><span>{dateText(lang, m.date)} · {t(`shop.move.${m.kind}`)}{m.note ? ` · ${m.note}` : ''}</span><b>{m.qty > 0 ? '+' : ''}{m.qty}</b></li>)}
        </ul>
      ) : <p className="hint">{t('shop.stock.noMoves')}</p>}
    </Dialog>
  );
}

export function Stock() {
  const { t } = useT();
  const data = useStore(shopStore, s => s.data), money = useMoney();
  const [form, setForm] = useState<Material | 'new' | null>(null);
  const [moving, setMoving] = useState<Material | null>(null);
  const [history, setHistory] = useState<Material | null>(null);
  const rows = data.materials.filter(m => !m.archived);
  const columns: Column<Material>[] = [
    { key: 'name', label: t('shop.name'), render: m => m.name, sort: m => m.name },
    { key: 'size', label: t('shop.size'), render: m => `${m.widthMm} × ${m.heightMm} × ${m.thicknessMm} mm` },
    { key: 'stock', label: t('shop.stock.onHand'), render: m => <>{stockOf(data, m.id)}{isLow(data, m) && <> <span className="tag bad" data-testid="low-tag">{t('shop.lowTag')}</span></>}</>, sort: m => stockOf(data, m.id), align: 'right' },
    { key: 'cost', label: t('shop.unitCost'), render: m => money(m.unitCost), sort: m => m.unitCost, align: 'right' },
    { key: 'value', label: t('shop.stock.value'), render: m => money(Math.round(stockOf(data, m.id) * m.unitCost)), align: 'right' }
  ];
  return (
    <section aria-label={t('shop.tab.stock')}>
      <div className="section-head">
        <h2>{t('shop.tab.stock')}</h2>
        <button type="button" className="btn primary" onClick={() => setForm('new')} data-testid="material-new">{t('shop.material.new')}</button>
      </div>
      <DataTable rows={rows} columns={columns} testId="stock-table" onRow={setForm} search={m => m.name}
        empty={<><p>{t('shop.stock.empty')}</p><button type="button" className="btn primary" onClick={() => setForm('new')}>{t('shop.material.new')}</button></>}
        actions={m => (
          <>
            <button type="button" className="btn" onClick={() => setMoving(m)} data-testid="stock-move">{t('shop.stock.change')}</button>
            <button type="button" className="btn" onClick={() => setHistory(m)} data-testid="stock-history">{t('shop.history')}</button>
          </>
        )} />
      {form && <MaterialForm material={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {moving && <MoveForm material={moving} onClose={() => setMoving(null)} />}
      {history && <History material={history} onClose={() => setHistory(null)} />}
    </section>
  );
}
