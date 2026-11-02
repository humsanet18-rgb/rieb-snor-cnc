import { useEffect, useRef, type KeyboardEvent as RKeyboardEvent } from 'react';
import { useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { command, isEnabled, MENUS, type Command } from './commands';
import { designStore } from './design-store';

/**
 * Enabled and checked state of some commands, as a string, so a component re-renders when one changes
 * and not on every pointer move.
 */
export function useCommandStates(ids: string[]): void {
  const sig = () => ids.map(id => { const c = command(id); return c ? `${isEnabled(c) ? 1 : 0}${c.checked?.() ? 1 : 0}` : ''; }).join();
  useStore(projectStore, sig);
  useStore(designStore, sig);
}

/** The commands of a list that this mode shows, with separators only between groups. */
export function visibleItems(items: string[], advanced: boolean): (Command | '|')[] {
  const out: (Command | '|')[] = [];
  for (const id of items) {
    if (id === '|') { if (out.length && out[out.length - 1] !== '|') out.push('|'); continue; }
    const c = command(id);
    if (c && (advanced || !c.advanced)) out.push(c);
  }
  if (out[out.length - 1] === '|') out.pop();
  return out;
}

const focusItem = (menu: HTMLElement | null, step: number | 'first' | 'last') => {
  const items = [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
  if (!items.length) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = step === 'first' ? 0 : step === 'last' ? items.length - 1 : (at + step + items.length) % items.length;
  items[next].focus();
};

/** A list of commands, used by the menu bar and the canvas's right-click menu. */
export function MenuList({ items, onDone, autoFocus }: { items: string[]; onDone: () => void; autoFocus?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const advanced = useStore(designStore, s => s.mode === 'advanced');
  useCommandStates(items);
  useEffect(() => { if (autoFocus) focusItem(ref.current, 'first'); }, [autoFocus]);
  const onKey = (e: RKeyboardEvent) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
    if (step !== null) { e.preventDefault(); e.stopPropagation(); focusItem(ref.current, step); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone(); }
  };
  return (
    <div ref={ref} role="menu" className="menu-list" onKeyDown={onKey}>
      {visibleItems(items, advanced).map((c, k) => {
        if (c === '|') return <div key={`s${k}`} role="separator" className="menu-sep" />;
        const checked = c.checked?.();
        return (
          <button key={c.id} type="button" role={c.checked ? 'menuitemcheckbox' : 'menuitem'} aria-checked={c.checked ? !!checked : undefined}
            disabled={!isEnabled(c)} className="menu-item" data-testid={`cmd-${c.id}`} tabIndex={-1}
            onClick={() => { onDone(); c.run(); }}>
            <span className="menu-icon" aria-hidden="true">{c.checked ? (checked ? <Icon name="check" size={16} /> : null) : c.icon && <Icon name={c.icon} size={16} />}</span>
            <span className="menu-label">{t(c.label)}</span>
            {c.keys && <kbd>{c.keys}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

/** File, Edit, View… Every entry is a command from the registry, so each one does something. */
export function MenuBar() {
  const { t } = useT();
  const open = useStore(designStore, s => s.menu);
  const bar = useRef<HTMLElement>(null);
  const set = (menu: string | null) => designStore.patch({ menu });

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) set(null); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  const button = (id: string) => bar.current?.querySelector<HTMLButtonElement>(`[data-testid="menu-${id}"]`);
  const move = (from: number, step: number, openIt: boolean) => {
    const next = MENUS[(from + step + MENUS.length) % MENUS.length];
    button(next.id)?.focus();
    if (openIt) set(next.id);
  };
  const onKey = (e: RKeyboardEvent, k: number) => {
    const id = MENUS[k].id;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); move(k, e.key === 'ArrowRight' ? 1 : -1, open !== null); }
    else if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && open !== id) { e.preventDefault(); set(id); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); set(null); button(id)?.focus(); }
  };

  return (
    <nav ref={bar} className="menubar" role="menubar" aria-label={t('design.menubar')} data-testid="design-menubar">
      {MENUS.map((m, k) => (
        <div key={m.id} className="menubar-entry" onKeyDown={e => onKey(e, k)}>
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === m.id} className={open === m.id ? 'on' : ''}
            data-testid={`menu-${m.id}`} onClick={() => set(open === m.id ? null : m.id)} onPointerEnter={() => { if (open && open !== m.id) set(m.id); }}>
            {t(m.label)}
          </button>
          {open === m.id && (
            <div className="menu-pop" data-testid={`menu-pop-${m.id}`}>
              <MenuList items={m.items} autoFocus onDone={() => { set(null); button(m.id)?.focus(); }} />
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
