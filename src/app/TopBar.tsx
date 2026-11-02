import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/icons';
import { IconButton } from '../components/ui';
import { activeProfile, commit, flushSave, projectStore, redo, undo } from '../stores/project-store';
import { useStore } from '../stores/store';
import { go, openModal, savePrefs, toast, uiStore } from '../stores/ui-store';
import { readiness } from '../features/machine-settings/calibration';
import { createProject } from './actions';
import { tr, useT, type Key } from './i18n';
import { useFlow, type FlowStep } from './sections';
import { isActive, runTool, toolForFlow } from './tools';

export async function saveNow(): Promise<void> {
  await flushSave();
  const { saveState } = projectStore.get();
  if (saveState === 'saved') toast(tr('toast.projectSaved'));
}

/** A labelled action: icon-only in the bar, icon and text in the phone menu. */
function Act({ icon, label, onClick, testId, phone }: { icon: IconName; label: string; onClick: () => void; testId: string; phone?: boolean }) {
  return (
    <button type="button" className={'top-act' + (phone ? ' phone-only' : '')} onClick={onClick} aria-label={label} title={label} data-testid={testId}>
      <Icon name={icon} /><span className="top-act-label">{label}</span>
    </button>
  );
}

const STEPS: FlowStep[] = ['import', 'nest', 'path', 'export'];

/** The job's main steps in order, each showing whether it is done, out of date or has errors. */
function Workflow() {
  const { t } = useT();
  const flow = useFlow();
  const section = useStore(uiStore, s => s.section);
  return (
    <nav className="workflow" aria-label={t('workflow.label')} data-testid="workflow">
      <ol>
        {STEPS.map((step, i) => {
          const tool = toolForFlow(step), on = isActive(tool, { section, tool: 'pan', layersOpen: false });
          return (
            <li key={step} className={flow[step] + (on ? ' on' : '')}>
              <button type="button" onClick={() => runTool(tool.id)} aria-current={on ? 'step' : undefined} data-testid={`workflow-${step}`}
                title={`${t(tool.label)} — ${t(`flow.${flow[step]}` as Key)}`}>
                <span className="wf-num">{flow[step] === 'done' ? <Icon name="check" size={12} /> : i + 1}</span>
                <span className="wf-name">{t(`flow.${step}` as Key)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The machine profile in use and whether it has been checked on the machine; opens calibration. */
function MachineChip() {
  const { t } = useT();
  const profile = useStore(projectStore, activeProfile);
  const ready = readiness(profile);
  return (
    <button type="button" className={'machine-chip ' + ready} onClick={() => openModal('machine')} data-testid="machine-chip"
      title={`${profile.name} — ${t(`calib.ready.${ready}` as Key)}`} aria-label={`${t('nav.section.machine')}: ${profile.name}, ${t(`calib.ready.${ready}` as Key)}`}>
      <Icon name="machine" size={16} /><span className="chip-name">{profile.name}</span><i className="dot" aria-hidden="true" />
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
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}icon-192.png`} width="30" height="30" alt="" data-testid="brand-logo" />
        <span className="brand-name">{t('app.name')}</span>
      </button>
      {project && <input className="project-name" value={name} aria-label={t('project.rename')} maxLength={120} data-testid="project-name"
        onChange={e => commit(p => ({ ...p, name: e.target.value }))} />}
      {project && <span className={'save-state ' + saveState} role="status" data-testid="save-state"
        title={saveState === 'error' ? t(saveError === 'quota' ? 'save.error.quota' : 'save.error.other') : undefined}>
        <Icon name={saveState === 'error' ? 'warn' : saveState === 'saving' ? 'history' : 'ok'} size={15} />
        <span className="save-text">{t(saveState === 'saved' ? 'save.saved' : saveState === 'saving' ? 'save.saving' : 'save.error')}</span>
      </span>}
      {project && <Workflow />}
      <span className="top-spacer" />
      {project && <MachineChip />}
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
          <Act icon="download" label={t('nav.section.export')} onClick={run(() => openModal('export'))} testId="top-export" />
          <Act icon="machine" label={t('calib.title')} onClick={run(() => openModal('machine'))} testId="top-machine" phone />
          <span className="sep" />
        </>}
        <Act icon="gear" label={t('nav.section.settings')} onClick={run(() => go('settings'))} testId="top-settings" />
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
