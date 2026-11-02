import type { IconName } from '../components/icons';
import { hasBlocking } from '../engines/toolpath-engine/validate';
import { layoutOutdated } from '../features/nesting/NestPanel';
import { activeLayout, activeProfile, projectStore } from '../stores/project-store';
import { useStore } from '../stores/store';
import { uiStore, type Section } from '../stores/ui-store';

export interface SectionDef { id: Section; icon: IconName; group: 'home' | 'design' | 'produce' | 'manage' }

export const SECTIONS: SectionDef[] = [
  { id: 'home', icon: 'home', group: 'home' },
  { id: 'import', icon: 'upload', group: 'design' },
  { id: 'text', icon: 'text', group: 'design' },
  { id: 'nest', icon: 'nest', group: 'design' },
  { id: 'machine', icon: 'machine', group: 'produce' },
  { id: 'path', icon: 'path', group: 'produce' },
  { id: 'export', icon: 'download', group: 'produce' },
  { id: 'editor', icon: 'editor', group: 'produce' },
  { id: 'projects', icon: 'history', group: 'manage' },
  { id: 'shop', icon: 'shop', group: 'manage' },
  { id: 'settings', icon: 'gear', group: 'manage' }
];

export const iconOf = (id: Section): IconName => SECTIONS.find(s => s.id === id)!.icon;

/** The job order a new operator follows; each work screen offers the next one. */
export const NEXT: Partial<Record<Section, Section>> = { import: 'nest', text: 'nest', nest: 'path', machine: 'path', path: 'export', export: 'editor' };

export type FlowState = 'done' | 'todo' | 'stale' | 'errors';
export type FlowStep = 'import' | 'nest' | 'machine' | 'path' | 'export';
export const FLOW: FlowStep[] = ['import', 'nest', 'machine', 'path', 'export'];

/** Where the current job stands, from the same data the screens use. */
export function useFlow(): Record<FlowStep, FlowState> {
  const designs = useStore(projectStore, s => s.project.designs.length);
  const stale = useStore(projectStore, s => layoutOutdated(s.project, activeLayout(s.project)));
  const hasLayout = useStore(projectStore, s => !!activeLayout(s.project));
  const profileOk = useStore(projectStore, s => { const p = activeProfile(s); return p.feed > 0 && p.power >= 0 && !!p.name.trim(); });
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const confirmed = useStore(uiStore, s => s.confirmed);
  const blocked = !!paths && hasBlocking(paths.issues);
  return {
    import: designs ? 'done' : 'todo',
    nest: !hasLayout ? 'todo' : stale ? 'stale' : 'done',
    machine: profileOk ? 'done' : 'errors',
    path: !paths || busy ? 'todo' : blocked ? 'errors' : 'done',
    export: paths && !busy && !blocked && confirmed ? 'done' : 'todo'
  };
}
