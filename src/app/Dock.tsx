import { useState } from 'react';
import { Icon, type IconName } from '../components/icons';
import { useStore } from '../stores/store';
import { go, toast, uiStore, type Section } from '../stores/ui-store';
import { tr, useT, type Key } from './i18n';
import { useFlow, type FlowStep } from './sections';
import { isActive, runTool, togglePin, TOOLS, type ToolDef, type ToolGroup } from './tools';

const GROUPS: ToolGroup[] = ['canvas', 'design', 'produce', 'manage'];

function DockItem({ tool, pinnedCopy, editing }: { tool: ToolDef; pinnedCopy?: boolean; editing: boolean }) {
  const { t } = useT();
  const section = useStore(uiStore, s => s.section), current = useStore(uiStore, s => s.tool), layersOpen = useStore(uiStore, s => s.layersOpen);
  const pinned = useStore(uiStore, s => s.pinned.includes(tool.id));
  const flow = useFlow();
  const on = isActive(tool, { section, tool: current, layersOpen }), label = t(tool.label);
  const state = tool.flow ? flow[tool.flow as FlowStep] : null;
  const pin = () => { togglePin(tool.id); toast(tr(pinned ? 'dock.unpinned' : 'dock.pinned.toast', { name: label })); };
  return (
    <div className="dock-row">
      <button type="button" className={'rail-item' + (on ? ' on' : '')} title={tool.modal ? `${label} — ${t('dock.opensWindow')}` : label}
        aria-current={tool.section && on ? 'page' : undefined} aria-pressed={tool.group === 'canvas' ? on : undefined} aria-haspopup={tool.modal ? 'dialog' : undefined}
        onClick={() => runTool(tool.id)} onContextMenu={e => { e.preventDefault(); pin(); }}
        data-testid={pinnedCopy ? `pinned-${tool.id}` : tool.testId}>
        <Icon name={tool.icon} />
        <span className="rail-text">{label}</span>
        {state && state !== 'todo' && <><i className={`dot ${state}`} aria-hidden="true" /><span className="sr">{t(`flow.${state}` as Key)}</span></>}
      </button>
      {editing && !pinnedCopy && (
        <button type="button" className={'pin-btn' + (pinned ? ' on' : '')} aria-pressed={pinned} onClick={pin} data-testid={`pin-${tool.id}`}
          aria-label={t(pinned ? 'dock.unpin' : 'dock.pin', { name: label })} title={t(pinned ? 'dock.unpin' : 'dock.pin', { name: label })}>
          <Icon name="pin" size={16} />
        </button>
      )}
    </div>
  );
}

/**
 * The tool dock: canvas tools, the design and production workflows, and the app's pages.
 * Right-click (or Customize) pins a tool to the top. A sidebar on wide screens, a drawer from More on phones.
 */
export function Dock() {
  const { t } = useT();
  const open = useStore(uiStore, s => s.drawer === 'menu');
  const pinned = useStore(uiStore, s => s.pinned);
  const [editing, setEditing] = useState(false);
  const pinnedTools = pinned.map(id => TOOLS.find(x => x.id === id)).filter((x): x is ToolDef => !!x);
  return (
    <nav className={'rail dock' + (open ? ' open' : '') + (editing ? ' editing' : '')} aria-label={t('dock.label')} data-testid="rail">
      {pinnedTools.length > 0 && (
        <div className="rail-group pinned" role="group" aria-label={t('dock.group.pinned')} data-testid="dock-pinned">
          <span className="rail-label" aria-hidden="true">{t('dock.group.pinned')}</span>
          {pinnedTools.map(x => <DockItem key={x.id} tool={x} pinnedCopy editing={editing} />)}
        </div>
      )}
      {GROUPS.map(g => (
        <div className="rail-group" key={g} role="group" aria-label={t(`dock.group.${g}` as Key)}>
          <span className="rail-label" aria-hidden="true">{t(`dock.group.${g}` as Key)}</span>
          {TOOLS.filter(x => x.group === g).map(x => <DockItem key={x.id} tool={x} editing={editing} />)}
        </div>
      ))}
      <div className="dock-foot">
        <button type="button" className={'rail-item' + (editing ? ' on' : '')} aria-pressed={editing} onClick={() => setEditing(e => !e)}
          title={t(editing ? 'dock.done' : 'dock.customize')} data-testid="dock-customize">
          <Icon name={editing ? 'check' : 'pin'} />
          <span className="rail-text">{t(editing ? 'dock.done' : 'dock.customize')}</span>
        </button>
      </div>
    </nav>
  );
}

const TABS: { id: Section; icon: IconName; label: Key }[] = [
  { id: 'home', icon: 'home', label: 'nav.section.home' },
  { id: 'import', icon: 'file', label: 'nav.short.import' },
  { id: 'nest', icon: 'nest', label: 'nav.short.nest' },
  { id: 'path', icon: 'path', label: 'nav.short.path' }
];

/** Thumb-reach navigation on phones; every other tool is one tap away under More. */
export function BottomNav() {
  const { t } = useT();
  const section = useStore(uiStore, s => s.section);
  const menu = useStore(uiStore, s => s.drawer === 'menu');
  const inTabs = TABS.some(x => x.id === section);
  return (
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      {TABS.map(x => (
        <button type="button" key={x.id} className={section === x.id && !menu ? 'on' : ''} aria-current={section === x.id ? 'page' : undefined}
          onClick={() => go(x.id)} data-testid={`tab-${x.id}`}>
          <Icon name={x.icon} /><span>{t(x.label)}</span>
        </button>
      ))}
      <button type="button" className={menu || !inTabs ? 'on' : ''} aria-expanded={menu} onClick={() => uiStore.patch({ drawer: menu ? null : 'menu' })} data-testid="tab-more">
        <Icon name="menu" /><span>{t('nav.more')}</span>
      </button>
    </nav>
  );
}
