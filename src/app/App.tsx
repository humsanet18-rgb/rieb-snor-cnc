import { useEffect } from 'react';
import { EditorPanel } from '../features/editor/EditorPanel';
import { PropertiesPanel } from '../features/geometry/PropertiesPanel';
import { partOf, rotatePiece, updatePiece } from '../features/nesting/model';
import { SheetCanvas } from '../features/preview/SheetCanvas';
import { activeLayout, activeProfile, projectStore, redo, setLayout, undo } from '../stores/project-store';
import { useStore } from '../stores/store';
import { uiStore } from '../stores/ui-store';
import { refreshToolpaths } from './actions';
import { Dialogs } from './Dialogs';
import { TopBar, saveNow } from './TopBar';
import { useT } from './i18n';
import { Workflow } from './Workflow';

function nudge(key: string, dx: number, dy: number) {
  const { project } = projectStore.get(), layout = activeLayout(project);
  if (!layout) return;
  setLayout(updatePiece(layout, key, p => ({ ...p, tx: p.tx + dx, ty: p.ty + dy })));
}

function onKey(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey, typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target as Element).tagName);
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); void saveNow(); return; }
  if (typing || uiStore.get().dialog) return;
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  const { selected } = uiStore.get(), { project } = projectStore.get(), layout = activeLayout(project);
  if (e.key === 'Escape') { uiStore.patch({ selected: null }); return; }
  if (!selected || !layout || project.settings.mode !== 'manual' || layout.mode === 'keep') return;
  const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (steps[e.key]) { e.preventDefault(); nudge(selected, ...steps[e.key]); return; }
  if (e.key.toLowerCase() === 'r') {
    const piece = layout.sheets.flatMap(s => s.pieces).find(p => p.key === selected), part = piece && partOf(project.designs, piece);
    if (part) setLayout(updatePiece(layout, selected, p => rotatePiece(part, p, p.deg + 90)));
  }
}

export function App() {
  const { lang } = useT();
  const theme = useStore(uiStore, s => s.theme);
  const toastState = useStore(uiStore, s => s.toast);
  const layout = useStore(projectStore, s => activeLayout(s.project));
  const profile = useStore(projectStore, activeProfile);
  const cut = useStore(projectStore, s => s.project.settings.cut);
  const screen = useStore(uiStore, s => s.view);
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
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="app" data-testid="app">
      <TopBar />
      <div className="workspace">
        {screen === 'editor' ? <EditorPanel /> : <Workflow />}
        <SheetCanvas />
        <PropertiesPanel />
      </div>
      <Dialogs />
      {toastState && <div key={toastState.id} className={'toast' + (toastState.bad ? ' bad' : '')} role="alert" data-testid="toast">{toastState.text}</div>}
    </div>
  );
}
