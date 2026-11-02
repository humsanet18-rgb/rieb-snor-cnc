import { useMemo, useState, type KeyboardEvent } from 'react';
import { translate, useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { Modal } from '../../components/modal';
import { uiStore, type DesignDialog } from '../../stores/ui-store';
import { useStore } from '../../stores/store';
import { COMMANDS, command, isEnabled, type Command } from './commands';
import { DEFAULT_TOOLBAR, designStore, saveDesignPrefs } from './design-store';
import { TOOL_DEFS } from './Toolbars';

const close = () => uiStore.patch({ dialog: null });

/** Every command by name, in either language. Enter runs the highlighted one. */
function CommandPalette() {
  const { t } = useT();
  const advanced = useStore(designStore, s => s.mode === 'advanced');
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return COMMANDS.filter(c => c.id !== 'tools.palette' && (advanced || !c.advanced)).filter(c => {
      const text = `${translate('km', c.label)} ${translate('en', c.label)} ${c.id} ${c.keys ?? ''}`.toLowerCase();
      return words.every(w => text.includes(w));
    });
  }, [q, advanced]);
  const run = (c: Command | undefined) => {
    if (!c || !isEnabled(c)) return;
    close();
    // After the palette has closed, so a command that opens a window is not blocked by it.
    requestAnimationFrame(() => c.run());
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, Math.min(list.length - 1, a + (e.key === 'ArrowDown' ? 1 : -1)))); }
    else if (e.key === 'Enter') { e.preventDefault(); run(list[at]); }
  };
  return (
    <Modal size="center" title={t('design.cmd.palette')} icon="command" testId="design-palette" onClose={close}>
      <input type="search" className="palette-input" value={q} placeholder={t('design.palette.search')} aria-label={t('design.palette.search')} data-autofocus
        aria-controls="palette-list" aria-activedescendant={list[at] ? `pal-${list[at].id}` : undefined}
        onChange={e => { setQ(e.target.value); setAt(0); }} onKeyDown={onKey} data-testid="palette-input" />
      <ul id="palette-list" className="palette-list" role="listbox" aria-label={t('design.cmd.palette')}>
        {list.map((c, k) => (
          <li key={c.id} id={`pal-${c.id}`} role="option" aria-selected={k === at} aria-disabled={!isEnabled(c)} className={(k === at ? 'on' : '') + (isEnabled(c) ? '' : ' off')}
            onPointerEnter={() => setAt(k)} onClick={() => run(c)} data-testid={`palette-${c.id}`}>
            {c.icon && <Icon name={c.icon} size={16} />}<span>{t(c.label)}</span>{c.keys && <kbd>{c.keys}</kbd>}
          </li>
        ))}
        {!list.length && <li className="muted" role="presentation">{t('design.palette.none')}</li>}
      </ul>
    </Modal>
  );
}

function ShortcutsDialog() {
  const { t } = useT();
  const rows: [string, string][] = [
    ...TOOL_DEFS.map(x => [t(x.label), x.keys] as [string, string]),
    ...COMMANDS.filter(c => c.keys).map(c => [t(c.label), c.keys!] as [string, string]),
    [t('design.keys.nudge'), '← ↑ → ↓'], [t('design.keys.nudge10'), 'Shift + ← ↑ → ↓'],
    [t('design.keys.constrain'), 'Shift'], [t('design.keys.pan'), t('design.keys.middle')], [t('design.keys.zoom'), t('design.keys.wheel')],
    [t('design.keys.polyline'), 'Enter / Backspace / Esc']
  ];
  return (
    <Modal size="center" wide title={t('design.cmd.shortcuts')} icon="keyboard" testId="design-shortcuts" onClose={close}>
      <table className="keys-table">
        <tbody>{rows.map(([label, keys], k) => <tr key={k}><td>{label}</td><td><kbd>{keys}</kbd></td></tr>)}</tbody>
      </table>
    </Modal>
  );
}

/** Which commands sit on the main toolbar, and in what order. Changes apply at once and are remembered on this device. */
function CustomizeToolbar() {
  const { t } = useT();
  const bar = useStore(designStore, s => s.toolbar);
  const set = (toolbar: string[]) => { designStore.patch({ toolbar }); saveDesignPrefs(); };
  const move = (k: number, step: number) => {
    const j = k + step;
    if (j < 0 || j >= bar.length) return;
    const next = [...bar];
    [next[k], next[j]] = [next[j], next[k]];
    set(next);
  };
  const available = COMMANDS.filter(c => c.icon && !bar.includes(c.id));
  return (
    <Modal size="center" wide title={t('design.cmd.customize')} icon="sliders" testId="design-customize" onClose={close}
      footer={<>
        <button type="button" className="btn" onClick={() => set([...bar, '|'])} data-testid="customize-sep">{t('design.customize.separator')}</button>
        <button type="button" className="btn" onClick={() => set(DEFAULT_TOOLBAR)} data-testid="customize-reset">{t('design.customize.reset')}</button>
        <button type="button" className="btn primary" onClick={close} data-testid="customize-done">{t('modal.done')}</button>
      </>}>
      <div className="customize-cols">
        <section>
          <h3>{t('design.customize.on')}</h3>
          <ol className="customize-list" data-testid="customize-current">
            {bar.map((id, k) => {
              const c = command(id);
              return (
                <li key={`${id}-${k}`}>
                  {c?.icon && <Icon name={c.icon} size={16} />}<span>{c ? t(c.label) : t('design.customize.separator')}</span>
                  <button type="button" className="icon-btn" disabled={k === 0} aria-label={t('design.customize.up')} title={t('design.customize.up')} onClick={() => move(k, -1)}><Icon name="up" size={16} /></button>
                  <button type="button" className="icon-btn" disabled={k === bar.length - 1} aria-label={t('design.customize.down')} title={t('design.customize.down')} onClick={() => move(k, 1)}><Icon name="down" size={16} /></button>
                  <button type="button" className="icon-btn" aria-label={t('design.customize.remove')} title={t('design.customize.remove')} onClick={() => set(bar.filter((_, j) => j !== k))}
                    data-testid={`customize-remove-${id}`}><Icon name="close" size={16} /></button>
                </li>
              );
            })}
          </ol>
        </section>
        <section>
          <h3>{t('design.customize.add')}</h3>
          <ul className="customize-list">
            {available.map(c => (
              <li key={c.id}>
                <Icon name={c.icon!} size={16} /><span>{t(c.label)}</span>
                <button type="button" className="icon-btn" aria-label={t('design.customize.addOne', { name: t(c.label) })} title={t('design.customize.addOne', { name: t(c.label) })}
                  onClick={() => set([...bar, c.id])} data-testid={`customize-add-${c.id}`}><Icon name="plus" size={16} /></button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

export function DesignDialogs({ which }: { which: DesignDialog }) {
  return which === 'palette' ? <CommandPalette /> : which === 'shortcuts' ? <ShortcutsDialog /> : <CustomizeToolbar />;
}
