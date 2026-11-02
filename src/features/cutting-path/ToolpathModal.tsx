import { useState } from 'react';
import { applySession, useEditSession } from '../../app/edit-session';
import { formatDuration, useT, type Key } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { ApplyBar, Modal, ModalTabs, type Problem } from '../../components/modal';
import { Check, IconButton, SelectField, Stat } from '../../components/ui';
import { hasBlocking } from '../../engines/toolpath-engine/validate';
import { activeLayout, activeProfile, commit, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { closeModal, openModal, savePrefs, uiStore } from '../../stores/ui-store';
import { fieldState, readiness } from '../machine-settings/calibration';
import { SheetPreview } from '../preview/SheetPreview';
import { CutFields } from './CutFields';
import { ReviewPanel, useIssues } from './ReviewPanel';

type Tab = 'order' | 'machine' | 'kerf' | 'review';

/** The machine values the path will be written with, each marked sample, set or missing. */
function MachineSummary() {
  const { t } = useT();
  const state = useStore(projectStore, s => s);
  const profile = activeProfile(state), ready = readiness(profile);
  const row = (label: string, value: string, f: 'feed' | 'power' | 'maxX' | 'maxY') => {
    const st = fieldState(profile, f);
    return <li><span>{label}</span><b>{value}</b><span className={'tag ' + (st === 'set' ? 'ok' : 'warn')}>{t(`calib.state.${st}` as Key)}</span></li>;
  };
  return (
    <>
      <SelectField label={t('machine.profile')} value={profile.id} testId="toolpath-profile" onChange={id => commit(p => ({ ...p, profileId: id }))}
        options={state.profiles.map(p => ({ value: p.id, label: p.name || '—' }))} />
      <p className={'notice ' + (ready === 'verified' ? 'ok' : 'warn')} data-testid="toolpath-readiness">{t(`calib.ready.${ready}` as Key)}</p>
      <ul className="value-list">
        {row(t('machine.feed'), `F${profile.feed}`, 'feed')}
        {row(t('machine.power'), `S${profile.power}`, 'power')}
        {row(t('machine.maxX'), profile.maxX === null ? '—' : `${profile.maxX} mm`, 'maxX')}
        {row(t('machine.maxY'), profile.maxY === null ? '—' : `${profile.maxY} mm`, 'maxY')}
      </ul>
      <p className="hint">{t('toolpath.machineHint')}</p>
    </>
  );
}

/** Cutting order, finish, machine profile and checks for the wire path, with the path drawn live. */
export function ToolpathModal() {
  const { t, lang } = useT();
  const { dirty, discard } = useEditSession();
  const project = useStore(projectStore, s => s.project);
  const profile = useStore(projectStore, activeProfile);
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const showing = useStore(uiStore, s => s.layers.toolpath);
  const issues = useIssues();
  const [tab, setTab] = useState<Tab>('order');
  const [sheet, setSheet] = useState(() => uiStore.get().sheet);
  const layout = activeLayout(project);
  const index = layout ? Math.min(sheet, layout.sheets.length - 1) : 0;
  const sp = paths?.sheets[index];
  const ready = readiness(profile), blocking = hasBlocking(issues);

  const problems: Problem[] = [];
  if (!layout) problems.push({ level: 'warning', text: t('toolpath.p.noLayout') });
  if (ready === 'incomplete') problems.push({ level: 'warning', text: t('toolpath.p.incomplete') });
  else if (ready === 'unverified') problems.push({ level: 'warning', text: t('toolpath.p.unverified') });
  if (paths && !busy && blocking) problems.push({ level: 'warning', text: t('toolpath.p.blocking') });
  if (project.settings.cut.order !== 'shortest' && !project.settings.cut.returnHome) problems.push({ level: 'warning', text: t('cut.noReturn') });

  return (
    <Modal size="workspace" title={t('toolpath.title')} subtitle={t('toolpath.sub')} icon="path" testId="toolpath-modal"
      onClose={closeModal} dirty={dirty} onDiscard={discard}
      footer={<ApplyBar problems={problems} onApply={() => applySession(problems)} extra={
        <button type="button" className="btn" onClick={() => { if (applySession(problems)) openModal('machine'); }} data-testid="toolpath-to-machine">
          <Icon name="machine" size={16} />{t('toolpath.toMachine')}
        </button>} />}>
      <div className="modal-split">
        <section className="modal-side" aria-label={t('modal.settings')}>
          <ModalTabs<Tab> label={t('modal.settings')} active={tab} onChange={setTab} tabs={[
            { id: 'order', label: t('toolpath.tab.order'), icon: 'path' },
            { id: 'machine', label: t('toolpath.tab.machine'), icon: 'machine', state: ready === 'verified' ? 'ok' : 'warn' },
            { id: 'kerf', label: t('toolpath.tab.kerf'), icon: 'info' },
            { id: 'review', label: t('card.review'), icon: 'ok', state: !paths || busy ? undefined : blocking ? 'bad' : 'ok' }
          ]} />
          <div className="tab-panel" role="tabpanel">
            {tab === 'order' && (
              <>
                <p className="hint">{t('tip.order')}</p>
                <CutFields />
                <Check label={t('path.showOnCanvas')} checked={showing} testId="show-paths"
                  onChange={toolpath => { uiStore.patch({ layers: { ...uiStore.get().layers, toolpath } }); savePrefs(); }} />
                <h4 className="mini-head">{t('card.moves')}</h4>
                <p className="hint">{t('moves.body')}</p>
              </>
            )}
            {tab === 'machine' && <MachineSummary />}
            {tab === 'kerf' && (
              <>
                <p className="notice warn" data-testid="kerf-note"><Icon name="info" size={16} />{t('toolpath.kerfNotApplied')}</p>
                <p className="hint">{t('kerf.body')}</p>
                <h4 className="mini-head">{t('toolpath.leadTitle')}</h4>
                <p className="hint">{t('toolpath.leadBody')}</p>
              </>
            )}
            {tab === 'review' && <ReviewPanel />}
          </div>
        </section>
        <section className="modal-main" aria-label={t('modal.preview')}>
          <div className="preview-head">
            <span className={'tag ' + (busy ? 'run' : sp ? 'ok' : '')}><Icon name={busy ? 'history' : 'path'} size={14} />{busy ? t('status.busy') : t('modal.preview')}</span>
            {layout && layout.sheets.length > 1 && (
              <span className="group">
                <IconButton icon="left" label={t('canvas.prev')} disabled={index <= 0} onClick={() => setSheet(index - 1)} />
                <span className="sheet-label">{t('canvas.sheetOf', { n: index + 1, total: layout.sheets.length })}</span>
                <IconButton icon="right" label={t('canvas.next')} disabled={index >= layout.sheets.length - 1} onClick={() => setSheet(index + 1)} />
              </span>
            )}
          </div>
          <div className="preview-box">
            {layout ? <SheetPreview layout={layout} designs={project.designs} sheet={index} stroke={sp?.stroke} issues={issues} label={t('canvas.preview', { w: layout.sheetW, h: layout.sheetH })} testId="toolpath-preview" />
              : <p className="empty-note">{t('toolpath.p.noLayout')}</p>}
          </div>
          {sp && (
            <dl className="stats wide-stats" data-testid="toolpath-stats">
              <Stat label={t('path.length')} value={`${(sp.length / 1000).toFixed(2)} ${t('unit.m')}`} />
              <Stat label={t('path.time')} value={profile.feed > 0 ? formatDuration(lang, sp.length / profile.feed) : '—'} />
              <Stat label={t('path.bridges')} value={sp.stroke.bridges.length} />
              <Stat label={t('editor.retrace')} value={`${(sp.retrace / 1000).toFixed(2)} ${t('unit.m')}`} />
            </dl>
          )}
        </section>
      </div>
    </Modal>
  );
}
