import { useEffect, useRef, useState } from 'react';
import { tr, useT } from '../../app/i18n';
import { Dialog, IconButton } from '../../components/ui';
import { deleteProject, listProjects, loadProject, saveProject, type ProjectSummary } from '../../services/db';
import { MAX_PROJECT_BYTES, parseProjectFile, ProjectFileError, readProject } from '../../services/project-io';
import { flushSave, loadInto, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { toast, uiStore } from '../../stores/ui-store';
import { newId } from '../nesting/model';

const afterLoad = () => uiStore.patch({ dialog: null, sheet: 0, selected: null, failures: [], toolpathKey: null, step: 2 });

export async function openProject(id: string): Promise<void> {
  await flushSave();
  const stored = await loadProject(id);
  if (!stored) return;
  loadInto(readProject(stored));
  afterLoad();
}

export function ProjectDialog() {
  const { t, lang } = useT();
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const currentId = useStore(projectStore, s => s.project.id);
  const refresh = () => listProjects().then(setList).catch(() => setList([]));
  useEffect(() => { void flushSave().then(refresh); }, []);
  const close = () => uiStore.patch({ dialog: null });

  const duplicate = async (id: string) => {
    const p = await loadProject(id);
    if (!p) return;
    const now = new Date().toISOString();
    await saveProject({ ...p, id: newId('project'), name: tr('open.copyOf', { name: p.name }), createdAt: now, updatedAt: now });
    await refresh();
  };
  const remove = async (s: ProjectSummary) => {
    if (!confirm(t('open.deleteConfirm', { name: s.name }))) return;
    await deleteProject(s.id);
    await refresh();
  };
  const importBackup = async (file: File) => {
    setFailed(null);
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new ProjectFileError('file too large');
      const { project, profile } = parseProjectFile(await file.text());
      await flushSave();
      // An imported copy never overwrites what is already on this device.
      const copy = { ...project, id: newId('project') };
      await saveProject(copy);
      loadInto(copy, profile);
      afterLoad();
      toast(tr('toast.restored'));
    } catch (e) {
      setFailed(e instanceof ProjectFileError ? e.field : e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog title={t('open.title')} onClose={close}>
      <p className="notice info">{t('open.local')}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => input.current?.click()}>{t('open.import')}</button>
        <input ref={input} type="file" accept=".json,application/json" hidden data-testid="project-input"
          onChange={e => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ''; }} />
      </div>
      {failed && <p className="notice bad" data-testid="project-error">{t('open.badFile', { why: failed })}</p>}
      <h3>{t('open.recent')}</h3>
      {list && !list.length && <p className="hint">{t('open.none')}</p>}
      <ul className="project-list" data-testid="project-list">
        {list?.map(s => (
          <li key={s.id} className={s.id === currentId ? 'on' : ''}>
            <button type="button" className="project-open" onClick={() => void openProject(s.id)}>
              <b>{s.name}</b>
              <span>{t('open.summary', { designs: s.designs, sheets: s.sheets, date: new Date(s.updatedAt).toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB') })}</span>
            </button>
            <IconButton icon="copy" label={t('open.duplicate')} onClick={() => void duplicate(s.id)} />
            <IconButton icon="trash" label={t('open.delete')} disabled={s.id === currentId} onClick={() => void remove(s)} />
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
