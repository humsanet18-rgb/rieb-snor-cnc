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

/**
 * A modal's editing session. Changes show live everywhere, but nothing is saved until Apply,
 * and Cancel puts back exactly what was there, history included.
 */
interface Transaction { project: Project; past: Project[]; future: Project[]; profiles: MachineProfile[]; saveState: ProjectState['saveState'] }
let txn: Transaction | null = null;

export const inTransaction = (): boolean => txn !== null;

export function beginTransaction(): void {
  if (txn) return;
  const s = projectStore.get();
  txn = { project: s.project, past: s.past, future: s.future, profiles: s.profiles, saveState: s.saveState };
}

export function transactionDirty(): boolean {
  const s = projectStore.get();
  return !!txn && (s.project !== txn.project || s.profiles !== txn.profiles);
}

/** Keeps the session's changes as one undo step and saves them. */
export function commitTransaction(): void {
  if (!txn) return;
  const t = txn, s = projectStore.get();
  txn = null;
  if (s.project !== t.project) projectStore.patch({ past: [...t.past.slice(-HISTORY + 1), t.project], future: [] });
  else projectStore.patch({ past: t.past, future: t.future });
  if (s.profiles !== t.profiles) void persistProfiles();
  if (s.project !== t.project || t.saveState !== 'saved') scheduleSave();
  else projectStore.patch({ saveState: t.saveState });
}

export function rollbackTransaction(): void {
  if (!txn) return;
  const t = txn;
  txn = null;
  projectStore.patch({ project: t.project, past: t.past, future: t.future, profiles: t.profiles, saveState: t.saveState });
  if (t.saveState !== 'saved') scheduleSave();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  projectStore.patch({ saveState: 'saving' });
  // Inside a modal session nothing is written until Apply; the leave-page warning still covers it.
  if (txn) return;
  saveTimer = setTimeout(() => { void flushSave(); }, 600);
}

export async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  if (txn) return;
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
  if (txn) { projectStore.patch({ saveState: 'saving' }); return; }
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
