import type { MachineProfile, Project } from '../types/project';

const DB_NAME = 'rieb-snor-cnc', DB_VERSION = 1;

export interface ProjectSummary { id: string; name: string; updatedAt: string; designs: number; sheets: number }

export class StorageError extends Error {
  constructor(public reason: 'unavailable' | 'quota' | 'failed', cause?: unknown) {
    super(`Local storage ${reason}${cause instanceof Error ? ': ' + cause.message : ''}`);
  }
}

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new StorageError('unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('summaries', { keyPath: 'id' });
      db.createObjectStore('profiles', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError('unavailable', req.error));
    req.onblocked = () => reject(new StorageError('unavailable'));
  });
  opening.catch(() => { opening = null; });
  return opening;
}

type StoreName = 'projects' | 'summaries' | 'profiles';

async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, work: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction, req: IDBRequest<T> | void;
    const fail = (e: DOMException | null) => reject(new StorageError(e?.name === 'QuotaExceededError' ? 'quota' : 'failed', e));
    try {
      t = db.transaction(stores, mode);
      req = work(t);
    } catch (e) { reject(new StorageError('failed', e)); return; }
    t.oncomplete = () => resolve(req ? req.result : undefined as T);
    t.onerror = () => fail(t.error);
    t.onabort = () => fail(t.error);
  });
}

const summaryOf = (p: Project): ProjectSummary => ({
  id: p.id, name: p.name, updatedAt: p.updatedAt, designs: p.designs.length,
  sheets: p.layouts.find(l => l.id === p.activeLayoutId)?.sheets.length ?? 0
});

export const saveProject = (p: Project): Promise<void> => tx(['projects', 'summaries'], 'readwrite', t => {
  t.objectStore('projects').put(p);
  t.objectStore('summaries').put(summaryOf(p));
});

export const loadProject = (id: string): Promise<Project | undefined> =>
  tx<Project | undefined>(['projects'], 'readonly', t => t.objectStore('projects').get(id));

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<ProjectSummary[]>(['summaries'], 'readonly', t => t.objectStore('summaries').getAll());
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const deleteProject = (id: string): Promise<void> => tx(['projects', 'summaries'], 'readwrite', t => {
  t.objectStore('projects').delete(id);
  t.objectStore('summaries').delete(id);
});

export const saveProfiles = (list: MachineProfile[]): Promise<void> => tx(['profiles'], 'readwrite', t => {
  const s = t.objectStore('profiles');
  s.clear();
  for (const p of list) s.put(p);
});

export const loadProfiles = (): Promise<MachineProfile[]> => tx<MachineProfile[]>(['profiles'], 'readonly', t => t.objectStore('profiles').getAll());

export const clearAll = (): Promise<void> => tx(['projects', 'summaries', 'profiles'], 'readwrite', t => {
  for (const s of ['projects', 'summaries', 'profiles'] as const) t.objectStore(s).clear();
});
