import { tr } from '../app/i18n';
import { defaultProfile, newProject } from '../features/nesting/model';
import { saveProfiles, saveProject, StorageError } from '../services/db';
import type { Layout, MachineProfile, Project } from '../types/project';
import { Store } from './store';

const HISTORY = 40;

export interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  profiles: MachineProfile[];
  saveState: 'saved' | 'saving' | 'error';
  saveError: StorageError['reason'] | null;
}

export const projectStore = new Store<ProjectState>({
  project: newProject(tr('project.defaultName')), past: [], future: [], profiles: [defaultProfile()], saveState: 'saved', saveError: null
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  projectStore.patch({ saveState: 'saving' });
  saveTimer = setTimeout(() => { void flushSave(); }, 600);
}

export async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  try {
    await saveProject(projectStore.get().project);
    projectStore.patch({ saveState: 'saved', saveError: null });
  } catch (e) {
    projectStore.patch({ saveState: 'error', saveError: e instanceof StorageError ? e.reason : 'failed' });
  }
}

const stamp = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

/** An undoable change. */
export function commit(fn: (p: Project) => Project): void {
  const s = projectStore.get(), next = fn(s.project);
  if (next === s.project) return;
  projectStore.patch({ project: stamp(next), past: [...s.past.slice(-HISTORY + 1), s.project], future: [] });
  scheduleSave();
}

export function undo(): void {
  const s = projectStore.get(), prev = s.past[s.past.length - 1];
  if (!prev) return;
  projectStore.patch({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future] });
  scheduleSave();
}

export function redo(): void {
  const s = projectStore.get(), [next, ...rest] = s.future;
  if (!next) return;
  projectStore.patch({ project: next, past: [...s.past, s.project], future: rest });
  scheduleSave();
}

/** Switches to another project; history does not carry over. */
export function loadInto(project: Project, profile?: MachineProfile): void {
  const s = projectStore.get();
  const profiles = profile && !s.profiles.some(p => p.id === profile.id) ? [...s.profiles, profile] : s.profiles;
  projectStore.patch({ project, past: [], future: [], profiles, saveState: 'saved', saveError: null });
  if (profiles !== s.profiles) void persistProfiles();
  rememberLast(project.id);
}

export async function persistProfiles(): Promise<void> {
  try { await saveProfiles(projectStore.get().profiles); }
  catch (e) { projectStore.patch({ saveState: 'error', saveError: e instanceof StorageError ? e.reason : 'failed' }); }
}

export function setProfiles(profiles: MachineProfile[]): void {
  projectStore.patch({ profiles });
  void persistProfiles();
}

const LAST_KEY = 'rieb-snor.lastProject';
export function rememberLast(id: string): void {
  try { localStorage.setItem(LAST_KEY, id); } catch { /* opening the last project is only a convenience */ }
}
export function lastProjectId(): string | null {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}

export const activeLayout = (p: Project): Layout | null => p.layouts.find(l => l.id === p.activeLayoutId) ?? null;
export const activeProfile = (s: ProjectState): MachineProfile => s.profiles.find(p => p.id === s.project.profileId) ?? s.profiles[0];

export function setLayout(layout: Layout): void {
  commit(p => ({ ...p, layouts: p.layouts.map(l => l.id === layout.id ? layout : l) }));
}
