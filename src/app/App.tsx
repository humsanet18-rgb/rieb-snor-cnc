import { useEffect } from 'react';
import { Icon } from '../components/icons';
import { ConfirmHost } from '../components/ui';
import { ShopScreen } from '../features/shop/ShopScreen';
import { DesignWorkspace } from '../features/design/DesignWorkspace';
import { movePieces } from '../features/nesting/model';
import { rotateSelection } from '../features/geometry/AlignTools';
import { selectAllOnSheet } from '../features/preview/CanvasToolbar';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { activeLayout, activeProfile, projectStore, redo, setLayout, undo } from '../stores/project-store';
import { useStore } from '../stores/store';
import { uiStore, WORK_SECTIONS } from '../stores/ui-store';
import { refreshToolpaths } from './actions';
import { Dialogs, SettingsPage } from './Dialogs';
import { FilePicker } from './FilePicker';
import { Home } from './Home';
import { BottomNav, Dock } from './Dock';
import { TopBar, saveNow } from './TopBar';
import { useT } from './i18n';
import { Workspace } from './Workspace';

function onKey(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey, typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target as Element).tagName);
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); void saveNow(); return; }
  // The Design workspace has its own shortcuts.
  if (typing || uiStore.get().dialog || document.querySelector('dialog[open]') || uiStore.get().section === 'design') return;
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  const ui = uiStore.get();
  if (e.key === 'Escape') { uiStore.patch({ selected: [], drawer: null, highlightRow: null, layersOpen: false }); return; }
  if (!WORK_SECTIONS.includes(ui.section)) return;
  if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAllOnSheet(); return; }
  if (!ctrl && !e.altKey && (e.key === 'v' || e.key === 'h')) { uiStore.patch({ tool: e.key === 'v' ? 'select' : 'pan' }); return; }
  const { project } = projectStore.get(), layout = activeLayout(project), keys = ui.selected;
  if (!keys.length || !layout || project.settings.mode !== 'manual' || layout.mode === 'keep') return;
  const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (steps[e.key]) {
    e.preventDefault();
    const k = e.shiftKey ? 10 : 1;
    setLayout(movePieces(layout, keys, steps[e.key][0] * k, steps[e.key][1] * k));
    return;
  }
  if (e.key.toLowerCase() === 'r') rotateSelection();
}

/** Unsaved work or a running job gets the browser's leave-page warning. */
function onLeave(e: BeforeUnloadEvent) {
  if (projectStore.get().saveState !== 'saved' || uiStore.get().job) e.preventDefault();
}

function Main() {
  const section = useStore(uiStore, s => s.section);
  switch (section) {
    case 'home': return <Home />;
    case 'projects': return <ProjectsPage />;
    case 'settings': return <SettingsPage />;
    case 'shop': return <ShopScreen />;
    case 'design': return <DesignWorkspace />;
    default: return <Workspace />;
  }
}

export function App() {
  const { lang } = useT();
  const theme = useStore(uiStore, s => s.theme);
  const toastState = useStore(uiStore, s => s.toast);
  const layout = useStore(projectStore, s => activeLayout(s.project));
  const profile = useStore(projectStore, activeProfile);
  const cut = useStore(projectStore, s => s.project.settings.cut);
  const section = useStore(uiStore, s => s.section);
  const menu = useStore(uiStore, s => s.drawer === 'menu');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);
  useEffect(() => {
    const id = setTimeout(() => void refreshToolpaths(), 200);
    return () => clearTimeout(id);
  }, [layout, profile, cut]);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave); };
  }, []);
  return (
    <div className="app" data-testid="app" data-section={section}>
      <TopBar />
      <div className="shell">
        <Dock />
        <main className="main" id="main"><Main /></main>
      </div>
      <BottomNav />
      {menu && <div className="scrim menu" onClick={() => uiStore.patch({ drawer: null })} aria-hidden="true" />}
      <FilePicker />
      <Dialogs />
      <ConfirmHost />
      {toastState && (
        <div key={toastState.id} className={'toast' + (toastState.bad ? ' bad' : '')} role={toastState.bad ? 'alert' : 'status'} data-testid="toast">
          <Icon name={toastState.bad ? 'error' : 'ok'} size={18} />{toastState.text}
        </div>
      )}
    </div>
  );
}
