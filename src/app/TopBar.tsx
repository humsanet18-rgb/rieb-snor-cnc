import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/icons';
import { IconButton } from '../components/ui';
import { commit, flushSave, projectStore, redo, undo } from '../stores/project-store';
import { useStore } from '../stores/store';
import { go, savePrefs, toast, uiStore } from '../stores/ui-store';
import { createProject } from './actions';
import { tr, useT } from './i18n';

export async function saveNow(): Promise<void> {
  await flushSave();
  const { saveState } = projectStore.get();
  if (saveState === 'saved') toast(tr('toast.projectSaved'));
}

/** A labelled action: icon-only in the bar, icon and text in the phone menu. */
function Act({ icon, label, onClick, testId }: { icon: IconName; label: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" className="top-act" onClick={onClick} aria-label={label} title={label} data-testid={testId}>
      <Icon name={icon} /><span className="top-act-label">{label}</span>
    </button>
  );
}

export function TopBar() {
  const { t, lang } = useT();
  const name = useStore(projectStore, s => s.project.name);
  const canUndo = useStore(projectStore, s => s.past.length > 0), canRedo = useStore(projectStore, s => s.future.length > 0);
  const saveState = useStore(projectStore, s => s.saveState), saveError = useStore(projectStore, s => s.saveError);
  const theme = useStore(uiStore, s => s.theme);
  const section = useStore(uiStore, s => s.section);
  const [menu, setMenu] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const project = section !== 'shop';
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  const run = (fn: () => void) => () => { setMenu(false); fn(); };
  return (
    <header className="topbar" ref={bar}>
      <button type="button" className="brand" onClick={() => go('home')} aria-label={t('nav.section.home')} title={t('nav.section.home')}>
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect x="2" y="9" width="28" height="19" rx="3" fill="var(--foam)" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16 2v15c0 5-6 4-6 8" fill="none" stroke="var(--wire)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className="brand-name">{t('app.name')}</span>
      </button>
      {project && <input className="project-name" value={name} aria-label={t('project.rename')} maxLength={120} data-testid="project-name"
        onChange={e => commit(p => ({ ...p, name: e.target.value }))} />}
      {project && <span className={'save-state ' + saveState} role="status" data-testid="save-state"
        title={saveState === 'error' ? t(saveError === 'quota' ? 'save.error.quota' : 'save.error.other') : undefined}>
        <Icon name={saveState === 'error' ? 'warn' : saveState === 'saving' ? 'history' : 'ok'} size={15} />
        <span className="save-text">{t(saveState === 'saved' ? 'save.saved' : saveState === 'saving' ? 'save.saving' : 'save.error')}</span>
      </span>}
      <span className="top-spacer" />
      {project && (
        <div className="top-history">
          <IconButton icon="undo" label={`${t('nav.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={undo} testId="undo" />
          <IconButton icon="redo" label={`${t('nav.redo')} (Ctrl+Y)`} disabled={!canRedo} onClick={redo} testId="redo" />
        </div>
      )}
      <div className={'top-actions' + (menu ? ' open' : '')} id="top-actions">
        {project && <>
          <Act icon="new" label={t('nav.new')} onClick={run(() => void createProject())} testId="nav-new" />
          <Act icon="open" label={t('nav.open')} onClick={run(() => go('projects'))} testId="nav-open" />
          <Act icon="save" label={`${t('nav.save')} (Ctrl+S)`} onClick={run(() => void saveNow())} testId="nav-save" />
          <span className="sep" />
        </>}
        <Act icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? t('nav.light') : t('nav.dark')} testId="theme"
          onClick={run(() => { uiStore.patch({ theme: theme === 'dark' ? 'light' : 'dark' }); savePrefs(); })} />
        <Act icon="help" label={t('nav.help')} onClick={run(() => uiStore.patch({ dialog: 'help' }))} testId="nav-help" />
      </div>
      <button type="button" className="lang" onClick={() => { uiStore.patch({ lang: lang === 'km' ? 'en' : 'km' }); savePrefs(); }} data-testid="lang"
        lang={lang === 'km' ? 'en' : 'km'}>{t('nav.lang')}</button>
      <button type="button" className="icon-btn top-menu" aria-label={t('top.more')} title={t('top.more')} aria-expanded={menu} aria-controls="top-actions"
        onClick={() => setMenu(m => !m)} data-testid="top-menu">
        <Icon name="more" />
      </button>
    </header>
  );
}
