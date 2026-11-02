import { useEffect, useRef, useState } from 'react';
import { createProject } from '../../app/actions';
import { tr, useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { IconButton } from '../../components/ui';
import { deleteProject, listProjects, loadProject, saveProject, type ProjectSummary } from '../../services/db';
import { MAX_PROJECT_BYTES, parseProjectFile, ProjectFileError, readProject } from '../../services/project-io';
import { ask } from '../../stores/confirm-store';
import { flushSave, loadInto, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { go, toast, uiStore } from '../../stores/ui-store';
import { newId } from '../nesting/model';

const afterLoad = () => {
  uiStore.patch({ sheet: 0, selected: [], failures: [], toolpathKey: null, highlightRow: null });
  go('import');
};

export async function openProject(id: string): Promise<void> {
  await flushSave();
  const stored = await loadProject(id);
  if (!stored) return;
  loadInto(readProject(stored));
  afterLoad();
}

/** Every project saved in this browser, plus backup import. */
export function ProjectsPage() {
  const { t, lang } = useT();
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const currentId = useStore(projectStore, s => s.project.id);
  const refresh = () => listProjects().then(setList).catch(() => setList([]));
  useEffect(() => { void flushSave().then(refresh); }, []);

  const duplicate = async (id: string) => {
    const p = await loadProject(id);
    if (!p) return;
    const now = new Date().toISOString();
    await saveProject({ ...p, id: newId('project'), name: tr('open.copyOf', { name: p.name }), createdAt: now, updatedAt: now });
    await refresh();
  };
  const remove = async (s: ProjectSummary) => {
    if (!await ask({ title: tr('confirm.deleteProject'), body: tr('open.deleteConfirm', { name: s.name }), action: tr('confirm.delete'), danger: true })) return;
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
    <div className="page" data-testid="projects">
      <header className="page-head row">
        <div>
          <h1>{t('nav.section.projects')}</h1>
          <p>{t('projects.sub')}</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => void createProject()}><Icon name="new" size={16} />{t('projects.new')}</button>
          <button type="button" className="btn" onClick={() => input.current?.click()}><Icon name="upload" size={16} />{t('open.import')}</button>
        </div>
        <input ref={input} type="file" accept=".json,application/json" hidden data-testid="project-input"
          onChange={e => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ''; }} />
      </header>
      <p className="notice info"><Icon name="info" size={16} /> {t('open.local')}</p>
      {failed && <p className="notice bad" role="alert" data-testid="project-error">{t('open.badFile', { why: failed })}</p>}
      <section className="panel-box">
        <h2 className="box-title">{t('open.recent')}</h2>
        {list === null && <p className="progress-note">…</p>}
        {list && !list.length && <p className="empty-note">{t('open.none')}</p>}
        <ul className="project-list" data-testid="project-list">
          {list?.map(s => (
            <li key={s.id} className={s.id === currentId ? 'on' : ''}>
              <button type="button" className="project-open" onClick={() => void openProject(s.id)}>
                <Icon name="file" size={20} />
                <span>
                  <b>{s.name}</b>
                  <small>{t('open.summary', { designs: s.designs, sheets: s.sheets, date: new Date(s.updatedAt).toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB') })}</small>
                </span>
                {s.id === currentId && <span className="tag run">{t('projects.open')}</span>}
              </button>
              <IconButton icon="copy" label={t('open.duplicate')} onClick={() => void duplicate(s.id)} />
              <IconButton icon="trash" label={t('open.delete')} disabled={s.id === currentId} onClick={() => void remove(s)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
