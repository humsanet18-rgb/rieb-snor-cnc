import type { ReactNode } from 'react';
import { Icon } from '../components/icons';
import { IconButton, PanelCard } from '../components/ui';
import { PathPanel } from '../features/cutting-path/PathPanel';
import { RowList } from '../features/cutting-path/RowList';
import { EditorPanel } from '../features/editor/EditorPanel';
import { ExportPanel } from '../features/export/ExportPanel';
import { PropertiesPanel } from '../features/geometry/PropertiesPanel';
import { MachinePanel } from '../features/machine-settings/MachinePanel';
import { NestPanel } from '../features/nesting/NestPanel';
import { ClampPanel, SheetPanel } from '../features/nesting/SheetPanel';
import { SheetCanvas } from '../features/preview/SheetCanvas';
import { DesignsPanel } from '../features/svg-import/DesignsPanel';
import { ImportPanel } from '../features/svg-import/ImportPanel';
import { TextPanel } from '../features/text/TextPanel';
import { TextStage } from '../features/text/TextStage';
import { useStore } from '../stores/store';
import { go, togglePanel, uiStore, type Section } from '../stores/ui-store';
import { useT, type Key } from './i18n';
import { iconOf, NEXT } from './sections';

function Controls({ section }: { section: Section }): ReactNode {
  const { t } = useT();
  switch (section) {
    case 'import': return <>
      <PanelCard title={t('card.import')} icon="upload"><ImportPanel /></PanelCard>
      <PanelCard title={t('card.designs')} icon="file"><DesignsPanel /></PanelCard>
    </>;
    case 'nest': return <>
      <PanelCard title={t('card.sheet')} icon="ruler"><SheetPanel /></PanelCard>
      <PanelCard title={t('card.clamps')} icon="warn" tip={t('tip.corners')}><ClampPanel /></PanelCard>
      <NestPanel />
      <PanelCard title={t('card.sequence')} icon="path" testId="sequence-card"><RowList /></PanelCard>
    </>;
    case 'machine': return <MachinePanel />;
    case 'path': return <PathPanel />;
    case 'export': return <ExportPanel />;
    case 'editor': return <EditorPanel />;
    case 'text': return <TextPanel />;
    default: return null;
  }
}

/** Left: controls for the screen. Centre: the sheet. Right: what is selected and the job totals. */
export function Workspace() {
  const { t } = useT();
  const section = useStore(uiStore, s => s.section);
  const panels = useStore(uiStore, s => s.panels);
  const drawer = useStore(uiStore, s => s.drawer);
  const next = NEXT[section], text = section === 'text';
  return (
    <div className={'workspace' + (panels.left ? '' : ' no-left') + (panels.right && !text ? '' : ' no-right')} data-drawer={drawer ?? ''}>
      <aside className="side left" aria-label={t(`nav.section.${section}` as Key)} data-testid="side-panel">
        <header className="side-head">
          <span className="side-icon"><Icon name={iconOf(section)} /></span>
          <div className="side-title">
            <h2>{t(`nav.section.${section}` as Key)}</h2>
            <p>{t(`sec.${section}.sub` as Key)}</p>
          </div>
          <IconButton icon="panelLeft" label={t('panel.hide')} onClick={() => togglePanel('left')} testId="hide-panel" />
        </header>
        <div className="side-body" key={section}><Controls section={section} /></div>
        {next && (
          <footer className="side-foot">
            <button type="button" className="btn block" onClick={() => go(next)} data-testid="next-section">
              {t('next.to', { name: t(`nav.section.${next}` as Key) })}<Icon name="arrowRight" size={16} />
            </button>
          </footer>
        )}
      </aside>
      {text ? <TextStage /> : <><SheetCanvas /><PropertiesPanel /></>}
      {drawer === 'right' && <div className="scrim right" onClick={() => uiStore.patch({ drawer: null })} aria-hidden="true" />}
    </div>
  );
}
