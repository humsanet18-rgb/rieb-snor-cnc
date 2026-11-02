import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../app/i18n';
import { answer, confirmStore } from '../stores/confirm-store';
import { useStore } from '../stores/store';
import { Icon, type IconName } from './icons';

export function IconButton({ icon, label, onClick, disabled, active, testId, size }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean; testId?: string; size?: number }) {
  return (
    <button type="button" className={'icon-btn' + (active ? ' on' : '')} onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active} data-testid={testId}>
      <Icon name={icon} size={size} />
    </button>
  );
}

/** A short explanation behind an (i) button; it opens on click so it also works on touch screens. */
export function InfoTip({ text }: { text: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="tip">
      <button type="button" className="tip-btn" aria-label={t('more.info')} title={text} aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}>
        <Icon name="info" size={15} />
      </button>
      {open && <span role="tooltip" id={id} className="tip-pop">{text}</span>}
    </span>
  );
}

/** One titled group of controls in a side panel. */
export function PanelCard({ title, icon, tip, actions, children, testId }: { title: string; icon?: IconName; tip?: string; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="card" data-testid={testId}>
      <header className="card-head">
        {icon && <Icon name={icon} size={16} />}
        <h3>{title}</h3>
        {tip && <InfoTip text={tip} />}
        {actions && <span className="card-actions">{actions}</span>}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

interface NumberProps {
  label: string; value: number | null; onChange: (v: number | null) => void;
  min?: number; max?: number; step?: number; scale?: number; optional?: boolean; disabled?: boolean; testId?: string; tip?: string;
}

/** Keeps the typed text until it is a valid number, so an operator never sees a silently changed value. */
export function NumberField({ label, value, onChange, min, max, step = 1, scale = 1, optional, disabled, testId, tip }: NumberProps) {
  const id = useId();
  const shown = value === null ? '' : String(+(value / scale).toFixed(3));
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const parsed = text.trim() === '' ? null : Number(text);
  const invalid = parsed === null ? !optional : !Number.isFinite(parsed) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max);
  const commit = () => {
    if (invalid) { setText(shown); return; }
    if (parsed === null) { if (value !== null) onChange(null); return; }
    const v = +(parsed * scale).toFixed(4);
    if (v !== value) onChange(v);
  };
  return (
    <div className="field">
      <span className="label-row"><label htmlFor={id}>{label}</label>{tip && <InfoTip text={tip} />}</span>
      <input id={id} type="number" inputMode="decimal" value={text} min={min} max={max} step={step} disabled={disabled} aria-invalid={invalid} data-testid={testId}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
    </div>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, wide = true, testId, tip }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; wide?: boolean; testId?: string; tip?: string }) {
  const id = useId();
  return (
    <div className={'field' + (wide ? ' wide' : '')}>
      <span className="label-row"><label htmlFor={id}>{label}</label>{tip && <InfoTip text={tip} />}</span>
      <select id={id} value={value} onChange={e => onChange(e.target.value as T)} data-testid={testId}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function TextField({ label, value, onChange, testId, maxLength = 120 }: { label: string; value: string; onChange: (v: string) => void; testId?: string; maxLength?: number }) {
  const id = useId();
  return (
    <div className="field wide">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)} data-testid={testId} />
    </div>
  );
}

export function Check({ label, checked, onChange, testId }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} data-testid={testId} />
      <span>{label}</span>
    </label>
  );
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className={'dialog' + (wide ? ' wide' : '')} onClose={onClose} onCancel={onClose}>
      <header>
        <h2>{title}</h2>
        <IconButton icon="close" label={t('common.close')} onClick={onClose} />
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

export function Stat({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return <div className="stat"><dt>{label}</dt><dd data-testid={testId}>{value}</dd></div>;
}

/** The app-wide confirmation dialog; actions open it with `ask()`. */
export function ConfirmHost() {
  const { t } = useT();
  const pending = useStore(confirmStore, s => s);
  if (!pending) return null;
  return (
    <Dialog title={pending.title} onClose={() => answer(false)}>
      <p>{pending.body}</p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => answer(false)} data-testid="confirm-no">{t('common.cancel')}</button>
        <button type="button" className={'btn ' + (pending.danger ? 'danger solid' : 'primary')} onClick={() => answer(true)} data-testid="confirm-yes" autoFocus>{pending.action}</button>
      </div>
    </Dialog>
  );
}
