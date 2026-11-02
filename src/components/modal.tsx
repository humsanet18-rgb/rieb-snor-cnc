import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { tr, useT } from '../app/i18n';
import { answer, ask, confirmStore } from '../stores/confirm-store';
import { Store, useStore } from '../stores/store';
import { Icon, type IconName } from './icons';

/**
 * center: one focused task (Khmer text options, import, export, reports).
 * workspace: a large workflow with its own preview (nesting, toolpath, calibration, G-code).
 * confirm: a short question (delete, rename, discard).
 */
export type ModalSize = 'center' | 'workspace' | 'confirm';

/** Modals currently on screen, innermost last; app confirmations draw inside the innermost one. */
const stack = new Store<string[]>([]);
const HOST = 'confirm-host:';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(e => !e.closest('[inert]') && e.getClientRects().length > 0);
}

/** Keeps Tab and Shift+Tab inside `root`. */
function trapTab(e: KeyboardEvent, root: Element | null) {
  if (e.key !== 'Tab' || !root) return;
  const list = focusables(root);
  if (!list.length) { e.preventDefault(); return; }
  const first = list[0], last = list[list.length - 1], at = document.activeElement;
  if (e.shiftKey && (at === first || !root.contains(at))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (at === last || !root.contains(at))) { e.preventDefault(); first.focus(); }
}

const typesInLine = (el: EventTarget | null) =>
  el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type);

/** Lets controls inside a modal (such as a Cancel button) close it through the same guards as Escape. */
const ModalContext = createContext<{ requestClose: () => Promise<void> }>({ requestClose: async () => undefined });
export const useModal = () => useContext(ModalContext);

export interface Problem { level: 'error' | 'warning'; text: string }

/** Cancel and Apply for a modal that edits the project; errors keep Apply disabled and are listed beside it. */
export function ApplyBar({ problems, onApply, applyLabel, extra }: { problems: Problem[]; onApply: () => void; applyLabel?: string; extra?: ReactNode }) {
  const { t } = useT();
  const { requestClose } = useModal();
  const errors = problems.filter(p => p.level === 'error');
  return (
    <>
      {problems.length > 0 && (
        <ul className="apply-problems" data-testid="apply-problems" aria-live="polite">
          {problems.map((p, i) => <li key={i} className={p.level === 'error' ? 'bad' : 'warn'}><Icon name={p.level === 'error' ? 'error' : 'warn'} size={15} />{p.text}</li>)}
        </ul>
      )}
      <div className="apply-actions">
        {extra}
        <span className="grow" />
        <button type="button" className="btn" onClick={() => void requestClose()} data-testid="modal-cancel">{t('common.cancel')}</button>
        <button type="button" className="btn primary" disabled={errors.length > 0} onClick={onApply} data-testid="modal-apply"
          title={errors.length ? errors[0].text : undefined}>
          <Icon name="check" size={16} />{applyLabel ?? t('modal.apply')}
        </button>
      </div>
    </>
  );
}

export interface ModalProps {
  size: ModalSize;
  title: string;
  subtitle?: string;
  icon?: IconName;
  testId?: string;
  /** Called once the close guards below have passed. */
  onClose: () => void;
  /** What is running, if anything; while set the modal will not close. */
  busy?: string | null;
  /** Stops the running work, offered when someone tries to close during it. */
  onStop?: () => void;
  /** True when closing would lose changes; the operator is asked first. */
  dirty?: () => boolean;
  /** Puts back what was there before; runs when the operator agrees to discard. */
  onDiscard?: () => void;
  /** Enter in a one-line field runs this, when the modal has an obvious confirm action. */
  onEnter?: () => void;
  /** A wider centre modal, for content with tables. */
  wide?: boolean;
  /** Fills the whole window, for reading long content such as G-code. */
  full?: boolean;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** Native modal dialog with guarded closing, contained focus and focus returned to the opener. */
export function Modal({ size, title, subtitle, icon, testId, onClose, busy, onStop, dirty, onDiscard, onEnter, wide, full, headerExtra, footer, children }: ModalProps) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const id = useId(), titleId = `${id}-title`, subId = `${id}-sub`;
  // The standalone confirmation registers apart, so it does not count as a modal covering itself.
  const key = size === 'confirm' ? HOST + id : id;
  const [blocked, setBlocked] = useState(false);
  const pending = useStore(confirmStore, s => s);
  const top = useStore(stack, s => s[s.length - 1] === key);
  const confirming = !!pending && top;
  const live = useRef({ onClose, busy, dirty, onDiscard });
  live.current = { onClose, busy, dirty, onDiscard };

  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.set(s => [...s, key]);
    if (d && !d.open) d.showModal();
    // Start on the first field rather than the close button, so typing can begin at once.
    const first = frame.current && (frame.current.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(frame.current.querySelector('.modal-body') ?? frame.current)[0]);
    first?.focus();
    // A native close (the browser closes a dialog on a second Escape) must not get past the guards.
    const reopen = () => { if (ref.current && !ref.current.open) { ref.current.showModal(); void requestClose(); } };
    d?.addEventListener('close', reopen);
    return () => {
      d?.removeEventListener('close', reopen);
      stack.set(s => s.filter(x => x !== key));
      if (d?.open) d.close();
      // Back to the control that opened the modal, if it is still on screen and not behind another modal.
      requestAnimationFrame(() => {
        const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].pop();
        if (opener?.isConnected && (!open || open.contains(opener))) opener.focus();
        else if (open && !open.contains(document.activeElement)) focusables(open)[0]?.focus();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!busy) setBlocked(false); }, [busy]);

  async function requestClose() {
    const c = live.current;
    if (c.busy) { setBlocked(true); return; }
    if (c.dirty?.()) {
      const yes = await ask({ title: tr('modal.discard.title'), body: tr('modal.discard.body'), action: tr('modal.discard'), danger: true });
      if (!yes) return;
      c.onDiscard?.();
    }
    c.onClose();
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (confirming) return; // the confirmation handles its own keys
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void requestClose(); return; }
    if (e.key === 'Enter' && onEnter && !e.shiftKey && !e.nativeEvent.isComposing && typesInLine(e.target)) { e.preventDefault(); onEnter(); return; }
    trapTab(e, frame.current);
  };

  if (size === 'confirm') {
    return (
      <dialog ref={ref} className="modal modal-confirm-only" role="alertdialog" aria-label={title} onCancel={e => e.preventDefault()}>
        <div ref={frame}>{confirming && <ConfirmSheet standalone />}</div>
      </dialog>
    );
  }
  return (
    <dialog ref={ref} className={`modal modal-${size}${wide ? ' wide' : ''}${full ? ' full' : ''}`} aria-labelledby={titleId} aria-describedby={subtitle ? subId : undefined}
      data-testid={testId} onKeyDown={onKeyDown}
      // Escape with focus outside the dialog reaches it only as a cancel event; it goes through the same guards.
      onCancel={e => { e.preventDefault(); if (!confirming) void requestClose(); }}
      onClick={e => { if (e.target === ref.current && size !== 'workspace') void requestClose(); }}>
      <ModalContext.Provider value={{ requestClose }}>
      <div className="modal-frame" ref={frame} inert={confirming || undefined}>
        <header className="modal-head">
          {icon && <span className="modal-icon"><Icon name={icon} /></span>}
          <div className="modal-titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p id={subId}>{subtitle}</p>}
          </div>
          {headerExtra}
          <button type="button" className="icon-btn" aria-label={t('common.close')} title={`${t('common.close')} (Esc)`} onClick={() => void requestClose()} data-testid="modal-close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {blocked && busy && (
          <div className="modal-blocked notice warn" role="alert" data-testid="modal-blocked">
            <Icon name="warn" size={16} /> {t('modal.busy', { what: busy })}
            {onStop && <button type="button" className="btn" onClick={onStop}>{t('modal.stop')}</button>}
          </div>
        )}
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
      </ModalContext.Provider>
      {confirming && <ConfirmSheet />}
    </dialog>
  );
}

/** Tabs inside a modal, for workflows with several parts; arrow keys move between them. */
export function ModalTabs<T extends string>({ tabs, active, onChange, label }: { tabs: { id: T; label: string; icon?: IconName; state?: 'ok' | 'warn' | 'bad' }[]; active: T; onChange: (id: T) => void; label: string }) {
  const id = useId();
  const move = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + step + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    document.getElementById(`${id}-${tabs[n].id}`)?.focus();
  };
  return (
    <div className="modal-tabs" role="tablist" aria-label={label}>
      {tabs.map((x, i) => (
        <button key={x.id} type="button" role="tab" id={`${id}-${x.id}`} aria-selected={x.id === active} tabIndex={x.id === active ? 0 : -1}
          className={x.id === active ? 'on' : ''} onClick={() => onChange(x.id)} onKeyDown={e => move(e, i)} data-testid={`tab-${x.id}`}>
          {x.icon && <Icon name={x.icon} size={16} />}<span>{x.label}</span>
          {x.state && <i className={`dot ${x.state === 'ok' ? 'done' : x.state === 'warn' ? 'stale' : 'errors'}`} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

/** A confirmation drawn inside the open modal instead of a second dialog on top of it. */
function ConfirmSheet({ standalone }: { standalone?: boolean }) {
  const { t } = useT();
  const pending = useStore(confirmStore, s => s)!;
  const [value, setValue] = useState(pending.input?.value ?? '');
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const empty = !!pending.input && !value.trim();
  useEffect(() => {
    // A destructive question starts on the safe answer; Enter then cancels rather than deletes.
    const el = box.current?.querySelector<HTMLElement>(pending.input ? 'input' : pending.danger ? '[data-testid="confirm-no"]' : '[data-testid="confirm-yes"]');
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, [pending]);
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); answer(false); return; }
    if (e.key === 'Enter' && pending.input && !empty && e.target instanceof HTMLInputElement) { e.preventDefault(); answer(true, value); return; }
    trapTab(e, box.current);
  };
  return (
    <div className={'modal-confirm-wrap' + (standalone ? ' standalone' : '')}>
      <div className="modal-confirm" role={standalone ? undefined : 'alertdialog'} aria-modal={standalone ? undefined : true} aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`} ref={box} onKeyDown={onKeyDown} data-testid="confirm-dialog">
        <h2 id={`${id}-t`}>{pending.title}</h2>
        <p id={`${id}-b`}>{pending.body}</p>
        {pending.input && (
          <div className="field">
            <label htmlFor={`${id}-i`}>{pending.input.label}</label>
            <input id={`${id}-i`} type="text" value={value} maxLength={pending.input.maxLength ?? 120} onChange={e => setValue(e.target.value)} data-testid="confirm-input" />
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => answer(false)} data-testid="confirm-no">{t('common.cancel')}</button>
          <button type="button" className={'btn ' + (pending.danger ? 'danger solid' : 'primary')} disabled={empty} onClick={() => answer(true, value)} data-testid="confirm-yes">{pending.action}</button>
        </div>
      </div>
    </div>
  );
}

/** App confirmations when no modal is open; with one open, the modal draws them itself. */
export function ConfirmHost() {
  const pending = useStore(confirmStore, s => s);
  const covered = useStore(stack, s => s.some(x => !x.startsWith(HOST)));
  if (!pending || covered) return null;
  return <Modal size="confirm" title={pending.title} onClose={() => answer(false)}>{null}</Modal>;
}

/** The older dialog API, kept for the Workshop screens. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <Modal size="center" title={title} onClose={onClose} wide={wide}>{children}</Modal>;
}
