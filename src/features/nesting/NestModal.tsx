import { useMemo, useState } from 'react';
import { cancelJob } from '../../app/actions';
import { applySession, useEditSession } from '../../app/edit-session';
import { useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { ApplyBar, Modal, ModalTabs, type Problem } from '../../components/modal';
import { IconButton, Stat } from '../../components/ui';
import { activeLayout, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { closeModal, uiStore } from '../../stores/ui-store';
import type { Project } from '../../types/project';
import { SheetPreview } from '../preview/SheetPreview';
import { expandPieces, layoutStats } from './model';
import { ArrangeControls, layoutOutdated, removeLayout, selectLayout } from './NestPanel';
import { ClampPanel, SheetPanel } from './SheetPanel';

type Tab = 'material' | 'arrange' | 'clamps';

/** Layouts made so far, side by side, each with its first sheet, so the operator can pick the best one. */
function Candidates({ project }: { project: Project }) {
  const { t } = useT();
  const stats = useMemo(() => project.layouts.map(l => layoutStats(l, project.designs)), [project.layouts, project.designs]);
  const best = stats.length ? project.layouts[stats.reduce((b, s, i) => (s.sheets < stats[b].sheets || (s.sheets === stats[b].sheets && s.utilization > stats[b].utilization) ? i : b), 0)].id : null;
  if (!project.layouts.length) return <p className="empty-note">{t('nestm.noCandidates')}</p>;
  return (
    <ul className="candidates" data-testid="candidates" aria-label={t('card.layouts')}>
      {project.layouts.map((l, i) => {
        const st = stats[i], on = l.id === project.activeLayoutId;
        return (
          <li key={l.id} className={on ? 'on' : ''}>
            <button type="button" className="candidate" aria-pressed={on} onClick={() => selectLayout(l.id)} data-testid={`candidate-${l.number}`}>
              <SheetPreview layout={l} designs={project.designs} sheet={0} label={t('nestm.candidate', { n: l.number })} />
              <span className="candidate-text">
                <b>#{l.number}{l.id === best && project.layouts.length > 1 && <span className="tag ok">{t('nestm.fewest')}</span>}</b>
                <small>{t('nestm.candidateStats', { sheets: st.sheets, used: (st.utilization * 100).toFixed(1), waste: (st.waste * 100).toFixed(1) })}</small>
                {l.unplaced.length > 0 && <small className="bad-text">{t('nest.unplaced', { n: l.unplaced.length })}</small>}
              </span>
            </button>
            <IconButton icon="trash" label={t('nest.remove', { n: l.number })} onClick={() => void removeLayout(l.id, l.number)} />
          </li>
        );
      })}
    </ul>
  );
}

/** Material, gaps, rotation and clamps on the left; the resulting layout and the alternatives on the right. */
export function NestModal() {
  const { t } = useT();
  const { dirty, discard } = useEditSession();
  const project = useStore(projectStore, s => s.project);
  const job = useStore(uiStore, s => s.job);
  const [tab, setTab] = useState<Tab>('arrange');
  const [sheet, setSheet] = useState(0);
  const layout = activeLayout(project);
  const stats = useMemo(() => (layout ? layoutStats(layout, project.designs) : null), [layout, project.designs]);
  const pieces = useMemo(() => expandPieces(project.designs).length, [project.designs]);
  const index = layout ? Math.min(sheet, layout.sheets.length - 1) : 0;
  const nesting = job?.kind === 'nest';

  const problems: Problem[] = [];
  if (nesting) problems.push({ level: 'error', text: t('nestm.p.running') });
  if (!project.designs.length) problems.push({ level: 'warning', text: t('nestm.p.noDesigns') });
  else if (!layout) problems.push({ level: 'warning', text: t('nestm.p.noLayout') });
  if (layoutOutdated(project, layout)) problems.push({ level: 'warning', text: t('nest.stale') });
  if (layout?.unplaced.length) problems.push({ level: 'warning', text: t('nest.unplaced', { n: layout.unplaced.length }) });

  return (
    <Modal size="workspace" title={t('nestm.title')} subtitle={t('nestm.sub')} icon="nest" testId="nest-modal"
      onClose={closeModal} dirty={dirty} onDiscard={discard} busy={nesting ? t('nestm.busy') : null} onStop={cancelJob}
      footer={<ApplyBar problems={problems} onApply={() => applySession(problems)} applyLabel={t('nestm.apply')} />}>
      <div className="modal-split">
        <section className="modal-side" aria-label={t('modal.settings')}>
          <ModalTabs<Tab> label={t('modal.settings')} active={tab} onChange={setTab} tabs={[
            { id: 'material', label: t('card.sheet'), icon: 'ruler' },
            { id: 'arrange', label: t('card.arrange'), icon: 'nest' },
            { id: 'clamps', label: t('nestm.tab.clamps'), icon: 'warn' }
          ]} />
          <div className="tab-panel" role="tabpanel">
            {tab === 'material' && <><SheetPanel /><p className="hint">{t('nestm.materialHint', { n: pieces })}</p></>}
            {tab === 'arrange' && <ArrangeControls />}
            {tab === 'clamps' && <><p className="hint">{t('tip.corners')}</p><ClampPanel /></>}
          </div>
        </section>
        <section className="modal-main" aria-label={t('modal.preview')}>
          <div className="preview-head">
            <span className="tag run"><Icon name="layers" size={14} />{t('modal.preview')}</span>
            {layout && layout.sheets.length > 1 && (
              <span className="group">
                <IconButton icon="left" label={t('canvas.prev')} disabled={index <= 0} onClick={() => setSheet(index - 1)} />
                <span className="sheet-label">{t('canvas.sheetOf', { n: index + 1, total: layout.sheets.length })}</span>
                <IconButton icon="right" label={t('canvas.next')} disabled={index >= layout.sheets.length - 1} onClick={() => setSheet(index + 1)} />
              </span>
            )}
          </div>
          <div className="preview-box">
            {layout ? <SheetPreview layout={layout} designs={project.designs} sheet={index} label={t('canvas.preview', { w: layout.sheetW, h: layout.sheetH })} testId="nest-preview" />
              : <p className="empty-note">{t(project.designs.length ? 'nestm.runFirst' : 'nestm.p.noDesigns')}</p>}
          </div>
          {stats && (
            <dl className="stats wide-stats" data-testid="nest-stats">
              <Stat label={t('props.sheets')} value={stats.sheets} />
              <Stat label={t('props.pieces')} value={stats.pieces} />
              <Stat label={t('props.utilization')} value={`${(stats.utilization * 100).toFixed(1)}%`} />
              <Stat label={t('props.waste')} value={`${(stats.waste * 100).toFixed(1)}%`} />
            </dl>
          )}
          <h3 className="mini-head">{t('nestm.compare')}</h3>
          <Candidates project={project} />
        </section>
      </div>
    </Modal>
  );
}
