import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/icons';
import { layoutStats } from '../features/nesting/model';
import { openProject } from '../features/projects/ProjectsPage';
import { listProjects, type ProjectSummary } from '../services/db';
import { activeLayout, flushSave, projectStore } from '../stores/project-store';
import { useStore } from '../stores/store';
import { go, openModal, savePrefs, uiStore } from '../stores/ui-store';
import { addSample } from './actions';
import { useT, type Key } from './i18n';
import { FLOW, useFlow } from './sections';
import { runTool, toolForFlow } from './tools';

function Action({ icon, title, sub, onClick, testId, primary }: { icon: IconName; title: string; sub: string; onClick: () => void; testId: string; primary?: boolean }) {
  return (
    <button type="button" className={'action-card' + (primary ? ' primary' : '')} onClick={onClick} data-testid={testId}>
      <span className="action-icon"><Icon name={icon} size={22} /></span>
      <span className="action-text"><b>{title}</b><small>{sub}</small></span>
      <Icon name="right" size={18} />
    </button>
  );
}

export function Home() {
  const { t, lang } = useT();
  const project = useStore(projectStore, s => s.project);
  const guided = useStore(uiStore, s => s.guided);
  const flow = useFlow();
  const [recent, setRecent] = useState<ProjectSummary[] | null>(null);
  useEffect(() => { void flushSave().then(listProjects).then(setRecent).catch(() => setRecent([])); }, []);
  const layout = activeLayout(project);
  const stats = layout ? layoutStats(layout, project.designs) : null;
  const pieces = project.designs.reduce((n, d) => n + d.qty * d.parts.length, 0);
  const firstOpen = FLOW.find(s => flow[s] !== 'done') ?? 'export';
  const others = (recent ?? []).filter(r => r.id !== project.id).slice(0, 5);
  return (
    <div className="page home" data-testid="home">
      <header className="page-head">
        <h1>{t('home.title')}</h1>
        <p>{t('home.sub')}</p>
      </header>

      <section aria-labelledby="start-head">
        <h2 id="start-head" className="page-sub">{t('home.start')}</h2>
        <div className="action-grid">
          <Action icon="upload" title={t('home.importSvg')} sub={t('home.importSvg.sub')} onClick={() => openModal('import')} testId="home-import" primary />
          <Action icon="text" title={t('home.typeText')} sub={t('home.typeText.sub')} onClick={() => openModal('text')} testId="home-text" />
          <Action icon="file" title={t('home.sample')} sub={t('home.sample.sub')} onClick={() => void addSample('block-letters.svg')} testId="home-sample" />
          <Action icon="open" title={t('home.open')} sub={t('home.open.sub')} onClick={() => go('projects')} testId="home-open" />
        </div>
      </section>

      <div className="home-grid">
        <section className="panel-box" aria-labelledby="current-head">
          <div className="box-head">
            <h2 id="current-head">{t('home.current')}</h2>
            <button type="button" className="btn primary" onClick={() => runTool(toolForFlow(firstOpen).id)} data-testid="home-continue">{t('home.continue')}<Icon name="arrowRight" size={16} /></button>
          </div>
          <p className="project-title">{project.name}</p>
          <p className="hint">{t('home.stats', { designs: project.designs.length, pieces, sheets: stats?.sheets ?? 0 })}</p>
          <h3 className="mini-head">{t('flow.title')}</h3>
          <ol className="flow-list" data-testid="flow">
            {FLOW.map((s, i) => (
              <li key={s} className={flow[s]}>
                <button type="button" onClick={() => runTool(toolForFlow(s).id)}>
                  <span className="flow-num">{flow[s] === 'done' ? <Icon name="check" size={14} /> : flow[s] === 'errors' || flow[s] === 'stale' ? <Icon name="warn" size={14} /> : i + 1}</span>
                  <span className="flow-name">{t(`flow.${s}` as Key)}</span>
                  <span className="flow-state">{t(`flow.${flow[s]}` as Key)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel-box" aria-labelledby="recent-head">
          <div className="box-head">
            <h2 id="recent-head">{t('home.recent')}</h2>
            <button type="button" className="link" onClick={() => go('projects')}>{t('home.all')}</button>
          </div>
          {recent === null ? <p className="progress-note">…</p> : others.length ? (
            <ul className="recent-list">
              {others.map(r => (
                <li key={r.id}>
                  <button type="button" onClick={() => void openProject(r.id)}>
                    <Icon name="file" size={18} />
                    <span><b>{r.name}</b><small>{t('open.summary', { designs: r.designs, sheets: r.sheets, date: new Date(r.updatedAt).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB') })}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="empty-note">{t('home.noOthers')}</p>}
        </section>

        {!guided && (
          <section className="panel-box guide" aria-labelledby="guide-head" data-testid="guide">
            <div className="box-head">
              <h2 id="guide-head">{t('home.guide.title')}</h2>
              <button type="button" className="link" onClick={() => { uiStore.patch({ guided: true }); savePrefs(); }} data-testid="hide-guide">{t('home.guide.hide')}</button>
            </div>
            <ol className="guide-list">
              {([1, 2, 3, 4] as const).map(n => <li key={n}><span className="flow-num">{n}</span><span>{t(`home.guide.${n}`)}</span></li>)}
            </ol>
            <p className="notice warn"><Icon name="warn" size={16} /> {t('home.safety')}</p>
          </section>
        )}
      </div>
    </div>
  );
}
