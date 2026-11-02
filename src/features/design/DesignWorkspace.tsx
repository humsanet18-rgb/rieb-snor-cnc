import { useEffect } from 'react';
import { useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { editable, selectionBBox } from '../../engines/vector-engine/document';
import { projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import { docOf, importSvgFiles, nudge } from './actions';
import { COMMANDS, isEnabled, keyName } from './commands';
import { DesignCanvas } from './DesignCanvas';
import { DesignProperties } from './DesignProperties';
import { designStore } from './design-store';
import { MenuBar } from './MenuBar';
import { MainToolbar, setTool, ToolOptions, Toolbox, TOOL_DEFS } from './Toolbars';

/** Keys that mean the same as a listed shortcut. */
const ALIASES: Record<string, string> = { 'Ctrl+Shift+Z': 'Ctrl+Y', Backspace: 'Delete', 'Ctrl++': '+', 'Ctrl+-': '-' };
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Shortcuts for the Design workspace. Typing in a field, an open window or an open menu keeps its own keys. */
export function onDesignKey(e: KeyboardEvent): void {
  if (uiStore.get().section !== 'design' || e.defaultPrevented || e.isComposing) return;
  const target = e.target as HTMLElement;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable) return;
  if (uiStore.get().dialog || document.querySelector('dialog[open]') || target.closest('[role="menu"]')) return;
  let k = keyName(e);
  k = ALIASES[k] ?? k;
  // The app saves on Ctrl+S everywhere.
  if (k === 'Ctrl+S') return;
  const s = designStore.get();
  if (k === 'Esc') {
    if (s.menu) designStore.patch({ menu: null });
    else if (s.tool !== 'pick') setTool('pick');
    else designStore.patch({ selected: [] });
    return;
  }
  const arrow = ARROWS[e.key];
  if (arrow && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (!s.selected.length) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    nudge(arrow[0] * step, arrow[1] * step);
    return;
  }
  const c = COMMANDS.find(x => x.keys === k && (s.mode === 'advanced' || !x.advanced));
  if (c) {
    e.preventDefault();
    if (isEnabled(c)) c.run();
    return;
  }
  const tool = TOOL_DEFS.find(x => x.keys === k && (s.mode === 'advanced' || !x.advanced));
  if (tool) { e.preventDefault(); setTool(tool.id); }
}

function StatusBar() {
  const { t } = useT();
  const cursor = useStore(designStore, s => (s.cursor ? `${s.cursor[0].toFixed(1)}, ${s.cursor[1].toFixed(1)}` : '—'));
  const zoom = useStore(designStore, s => Math.round((s.zoom * 25.4 / 96) * 100));
  const doc = useStore(projectStore, s => docOf(s.project));
  const saveState = useStore(projectStore, s => s.saveState);
  const raw = useStore(designStore, s => s.selected);
  const ids = editable(doc, raw), box = selectionBBox(doc, ids);
  const layer = doc.layers.find(l => l.id === doc.activeLayerId);
  return (
    <footer className="design-status" data-testid="design-status">
      <span title={t('design.status.cursor')}><Icon name="target" size={14} /> <span data-testid="design-cursor">{cursor}</span> mm</span>
      <span data-testid="design-zoom">{t('design.status.zoom', { n: zoom })}</span>
      <span data-testid="design-selection">
        {ids.length ? t('design.status.selected', { n: ids.length }) : t('design.status.nothing')}
        {box && ` · ${(box.x1 - box.x0).toFixed(1)} × ${(box.y1 - box.y0).toFixed(1)} mm`}
      </span>
      <span>{t('design.status.layer', { name: layer?.name ?? '' })}</span>
      <span className="design-status-end">{t(saveState === 'saved' ? 'status.saved' : 'status.unsaved')}</span>
    </footer>
  );
}

/**
 * The Design workspace: draw and arrange vector shapes on a page, then send them to production.
 * Production (nesting, cutting paths, G-code) stays in the existing screens.
 */
export function DesignWorkspace() {
  const { t } = useT();
  const toolbox = useStore(designStore, s => s.toolbox), props = useStore(designStore, s => s.props);
  useEffect(() => {
    window.addEventListener('keydown', onDesignKey);
    return () => window.removeEventListener('keydown', onDesignKey);
  }, []);
  return (
    <div className={'design-ws' + (toolbox ? '' : ' no-toolbox') + (props ? '' : ' no-props')} data-testid="design-workspace">
      <h1 className="sr">{t('nav.section.design')}</h1>
      <MenuBar />
      <MainToolbar />
      <ToolOptions />
      <div className="design-body">
        {toolbox && <Toolbox />}
        <DesignCanvas />
        {props && <DesignProperties />}
      </div>
      <StatusBar />
      <input type="file" hidden multiple accept=".svg,image/svg+xml" data-testid="design-file-input"
        onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void importSvgFiles(files); }} />
    </div>
  );
}
