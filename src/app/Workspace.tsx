import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../components/icons';
import { IconButton, PanelCard, Stat } from '../components/ui';
import { PathPanel } from '../features/cutting-path/PathPanel';
import { RowList } from '../features/cutting-path/RowList';
import { EditorPanel } from '../features/editor/EditorPanel';
import { PropertiesPanel } from '../features/geometry/PropertiesPanel';
import { layoutStats } from '../features/nesting/model';
import { LayoutTable, layoutOutdated } from '../features/nesting/NestPanel';
import { SheetCanvas } from '../features/preview/SheetCanvas';
import { DesignsPanel } from '../features/svg-import/DesignsPanel';
import { ImportFailures } from '../features/svg-import/ImportPanel';
import { activeLayout, projectStore } from '../stores/project-store';
import { useStore } from '../stores/store';
import { modalOf, openModal, togglePanel, uiStore, type Section } from '../stores/ui-store';
import { useT, type Key } from './i18n';
import { NEXT } from './sections';
import { runTool, toolForSection, toolOf } from './tools';

/** Where the job stands on the sheet, and the button into the nesting workflow. */
function NestSummary() {
  const { t } = useT();
  const project = useStore(projectStore, s => s.project);
  const layout = activeLayout(project);
  const stats = useMemo(() => (layout ? layoutStats(layout, project.designs) : null), [layout, project.designs]);
  return (
    <>
      {stats ? (
        <dl className="stats">
          <Stat label={t('props.sheets')} value={stats.sheets} />
          <Stat label={t('props.utilization')} value={`${(stats.utilization * 100).toFixed(1)}%`} />
          <Stat label={t('props.waste')} value={`${(stats.waste * 100).toFixed(1)}%`} />
          <Stat label={t('nest.mode')} value={t(`nest.mode.${project.settings.mode}`)} />
        </dl>
      ) : <p className="hint">{t(project.designs.length ? 'nestm.runFirst' : 'nestm.p.noDesigns')}</p>}
      {layoutOutdated(project, layout) && <p className="notice warn" data-testid="stale-summary">{t('nest.stale')}</p>}
      {layout && layout.unplaced.length > 0 && <p className="notice bad" data-testid="unplaced-summary">{t('nest.unplaced', { n: layout.unplaced.length })}</p>}
      <button type="button" className="btn primary block" onClick={() => openModal('nest')} data-testid="open-nesting">
        <Icon name="sliders" size={16} />{t('nestm.open')}
      </button>
    </>
  );
}

function Controls({ section }: { section: Section }): ReactNode {
  const { t } = useT();
  const layouts = useStore(projectStore, s => s.project.layouts.length);
  const project = useStore(projectStore, s => s.project);
  const importOpen = useStore(uiStore, s => modalOf(s.dialog) === 'import');
  switch (section) {
    case 'import': return <>
      <div className="panel-actions">
        <button type="button" className="btn primary" onClick={() => openModal('import')} data-testid="open-import"><Icon name="upload" size={16} />{t('tool.importSvg')}</button>
        <button type="button" className="btn" onClick={() => openModal('text')} data-testid="open-text"><Icon name="text" size={16} />{t('nav.section.text')}</button>
      </div>
      {!importOpen && <ImportFailures />}
      <PanelCard title={t('card.designs')} icon="file"><DesignsPanel /></PanelCard>
    </>;
    case 'nest': return <>
      <PanelCard title={t('card.arrange')} icon="nest"><NestSummary /></PanelCard>
      {layouts > 0 && <PanelCard title={t('card.layouts')} icon="layers"><LayoutTable project={project} /></PanelCard>}
      <PanelCard title={t('card.sequence')} icon="path" testId="sequence-card"><RowList /></PanelCard>
    </>;
    case 'path': return <PathPanel />;
    case 'editor': return <EditorPanel />;
    default: return null;
  }
}

/** Left: the screen's results and its workflow button. Centre: the sheet. Right: what is selected and the job totals. */
export function Workspace() {
  const { t } = useT();
  const section = useStore(uiStore, s => s.section);
  const panels = useStore(uiStore, s => s.panels);
  const drawer = useStore(uiStore, s => s.drawer);
  const width = useStore(uiStore, s => s.propsWidth);
  const next = NEXT[section], tool = toolForSection(section);
  return (
    <div className={'workspace' + (panels.left ? '' : ' no-left') + (panels.right ? '' : ' no-right')} data-drawer={drawer ?? ''}
      style={{ '--rw-user': `${width}px` } as CSSProperties}>
      <aside className="side left" aria-label={t(tool.label)} data-testid="side-panel">
        <header className="side-head">
          <span className="side-icon"><Icon name={tool.icon} /></span>
          <div className="side-title">
            <h2>{t(tool.label)}</h2>
            <p>{t(`sec.${section}.sub` as Key)}</p>
          </div>
          <IconButton icon="panelLeft" label={t('panel.hide')} onClick={() => togglePanel('left')} testId="hide-panel" />
        </header>
        <div className="side-body" key={section}><Controls section={section} /></div>
        {next && (
          <footer className="side-foot">
            <button type="button" className="btn block" onClick={() => runTool(next)} data-testid="next-section">
              {t('next.to', { name: t(toolOf(next).label) })}<Icon name="arrowRight" size={16} />
            </button>
          </footer>
        )}
      </aside>
      <SheetCanvas />
      <PropertiesPanel />
      {drawer === 'right' && <div className="scrim right" onClick={() => uiStore.patch({ drawer: null })} aria-hidden="true" />}
    </div>
  );
}
