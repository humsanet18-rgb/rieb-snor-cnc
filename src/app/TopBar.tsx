import { Icon } from '../components/icons';
import { IconButton } from '../components/ui';
import { commit, flushSave, projectStore, redo, undo } from '../stores/project-store';
import { useStore } from '../stores/store';
import { savePrefs, toast, uiStore } from '../stores/ui-store';
import { createProject } from './actions';
import { tr, useT } from './i18n';

export async function saveNow(): Promise<void> {
  await flushSave();
  const { saveState } = projectStore.get();
  if (saveState === 'saved') toast(tr('toast.projectSaved'));
}

export function TopBar() {
  const { t, lang } = useT();
  const name = useStore(projectStore, s => s.project.name);
  const canUndo = useStore(projectStore, s => s.past.length > 0), canRedo = useStore(projectStore, s => s.future.length > 0);
  const saveState = useStore(projectStore, s => s.saveState), saveError = useStore(projectStore, s => s.saveError);
  const theme = useStore(uiStore, s => s.theme);
  const view = useStore(uiStore, s => s.view);
  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <rect x="2" y="9" width="28" height="19" rx="2" fill="var(--foam)" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16 2v15c0 5-6 4-6 8" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className="brand-name">{t('app.name')}</span>
      </div>
      <input className="project-name" value={name} aria-label={t('project.rename')} maxLength={120} data-testid="project-name"
        onChange={e => commit(p => ({ ...p, name: e.target.value }))} />
      <div className="view-tabs" role="tablist" aria-label={t('view.tabs')}>
        {(['work', 'editor'] as const).map(v => (
          <button type="button" key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => uiStore.patch({ view: v })} data-testid={`view-${v}`}>
            {t(`view.${v}`)}
          </button>
        ))}
      </div>
      <nav className="actions" aria-label={t('app.name')}>
        <IconButton icon="new" label={t('nav.new')} onClick={() => void createProject()} testId="nav-new" />
        <IconButton icon="open" label={t('nav.open')} onClick={() => uiStore.patch({ dialog: 'open' })} testId="nav-open" />
        <IconButton icon="save" label={t('nav.save')} onClick={() => void saveNow()} testId="nav-save" />
        <span className="sep" />
        <IconButton icon="undo" label={t('nav.undo')} disabled={!canUndo} onClick={undo} testId="undo" />
        <IconButton icon="redo" label={t('nav.redo')} disabled={!canRedo} onClick={redo} testId="redo" />
        <span className="sep" />
        <button type="button" className="lang" onClick={() => { uiStore.patch({ lang: lang === 'km' ? 'en' : 'km' }); savePrefs(); }} data-testid="lang">{t('nav.lang')}</button>
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? t('nav.light') : t('nav.dark')} testId="theme"
          onClick={() => { uiStore.patch({ theme: theme === 'dark' ? 'light' : 'dark' }); savePrefs(); }} />
        <IconButton icon="help" label={t('nav.help')} onClick={() => uiStore.patch({ dialog: 'help' })} testId="nav-help" />
        <IconButton icon="gear" label={t('nav.settings')} onClick={() => uiStore.patch({ dialog: 'settings' })} testId="nav-settings" />
      </nav>
      <span className={'save-state ' + saveState} role="status" data-testid="save-state"
        title={saveState === 'error' ? t(saveError === 'quota' ? 'save.error.quota' : 'save.error.other') : undefined}>
        {saveState === 'error' && <Icon name="warn" size={15} />}
        {t(saveState === 'saved' ? 'save.saved' : saveState === 'saving' ? 'save.saving' : 'save.error')}
      </span>
    </header>
  );
}
