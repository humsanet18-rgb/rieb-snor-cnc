import { hasBlocking } from '../engines/toolpath-engine/validate';
import { layoutOutdated } from '../features/nesting/NestPanel';
import { activeLayout, activeProfile, projectStore } from '../stores/project-store';
import { useStore } from '../stores/store';
import { uiStore, type Section } from '../stores/ui-store';
import type { ToolId } from './tools';

/** The job order a new operator follows; each work screen offers the next step. */
export const NEXT: Partial<Record<Section, ToolId>> = { import: 'nest', nest: 'path', path: 'export' };

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
