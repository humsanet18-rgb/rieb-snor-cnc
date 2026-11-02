import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT, type Key } from '../../app/i18n';
import { Icon, type IconName } from '../../components/icons';
import { activeLayout, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { isNarrow, openModal, togglePanel, uiStore } from '../../stores/ui-store';
import { alignSelection, rotateSelection } from '../geometry/AlignTools';
import type { AlignMode } from '../nesting/model';
import { selectAllOnSheet } from './CanvasToolbar';

const ALIGN: { mode: AlignMode; icon: IconName; label: Key; min: number }[] = [
  { mode: 'left', icon: 'alignLeft', label: 'align.left', min: 2 }, { mode: 'center', icon: 'alignCenter', label: 'align.center', min: 2 },
  { mode: 'right', icon: 'alignRight', label: 'align.right', min: 2 }, { mode: 'top', icon: 'alignTop', label: 'align.top', min: 2 },
  { mode: 'middle', icon: 'alignMiddle', label: 'align.middle', min: 2 }, { mode: 'bottom', icon: 'alignBottom', label: 'align.bottom', min: 2 },
  { mode: 'distH', icon: 'distributeH', label: 'align.distH', min: 3 }, { mode: 'distV', icon: 'distributeV', label: 'align.distV', min: 3 }
];

/**
 * The canvas right-click menu (also Shift+F10, the menu key, or a long press on touch screens).
 * Every entry runs the same action as its button elsewhere; entries that cannot apply are disabled, not hidden.
 */
export function CanvasMenu({ x, y, fit, onClose }: { x: number; y: number; fit: () => void; onClose: () => void }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const count = useStore(uiStore, s => s.selected.length);
  const manual = useStore(projectStore, s => s.project.settings.mode === 'manual' && activeLayout(s.project)?.mode !== 'keep');
  const hasLayout = useStore(projectStore, s => !!activeLayout(s.project));
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    // Keep the whole menu inside the canvas.
    const el = box.current, parent = el?.parentElement;
    if (!el || !parent) return;
    const w = parent.clientWidth, h = parent.clientHeight;
    setPos({ x: Math.max(4, Math.min(x, w - el.offsetWidth - 4)), y: Math.max(4, Math.min(y, h - el.offsetHeight - 4)) });
    el.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [x, y]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    // Escape closes the menu even when focus stayed on the canvas (a right-click does not always move it).
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); };
  }, [onClose]);
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (step) { e.preventDefault(); items[(i + step + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1]?.focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };
  const Item = ({ icon, label, onClick, disabled, hint, testId }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; hint?: string; testId: string }) => (
    <button type="button" role="menuitem" className="menu-item" disabled={disabled} onClick={run(onClick)} data-testid={testId}>
      <Icon name={icon} size={16} /><span>{label}</span>{hint && <kbd>{hint}</kbd>}
    </button>
  );
  return (
    <div className="canvas-menu" role="menu" aria-label={t('menu.label')} ref={box} style={{ left: pos.x, top: pos.y }} onKeyDown={onKeyDown}
      onContextMenu={e => e.preventDefault()} data-testid="canvas-menu">
      <Item icon="rotate" label={t('props.rotate90')} hint="R" disabled={!manual || !count} onClick={rotateSelection} testId="menu-rotate" />
      <div className="menu-row" role="group" aria-label={t('align.label')}>
        {ALIGN.map(a => (
          <button key={a.mode} type="button" role="menuitem" className="icon-btn" disabled={!manual || count < a.min} aria-label={t(a.label)} title={t(a.label)}
            onClick={run(() => alignSelection(a.mode))} data-testid={`menu-align-${a.mode}`}>
            <Icon name={a.icon} size={18} />
          </button>
        ))}
      </div>
      {!manual && hasLayout && <p className="menu-note">{t('props.alignManual')}</p>}
      <hr />
      <Item icon="selectAll" label={t('tool.selectAll')} hint="Ctrl+A" disabled={!hasLayout} onClick={selectAllOnSheet} testId="menu-select-all" />
      <Item icon="close" label={t('menu.deselect')} hint="Esc" disabled={!count} onClick={() => uiStore.patch({ selected: [] })} testId="menu-deselect" />
      <Item icon="fit" label={t('canvas.fit')} onClick={fit} testId="menu-fit" />
      <Item icon="panelRight" label={t('panel.props')} onClick={() => {
        const s = uiStore.get();
        if (isNarrow('right')) uiStore.patch({ drawer: 'right' }); else if (!s.panels.right) togglePanel('right');
      }} testId="menu-props" />
      <hr />
      <Item icon="sliders" label={t('nestm.open')} onClick={() => openModal('nest')} testId="menu-nesting" />
      <Item icon="path" label={t('toolpath.open')} disabled={!hasLayout} onClick={() => openModal('toolpath')} testId="menu-toolpath" />
    </div>
  );
}
