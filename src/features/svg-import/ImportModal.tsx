import { memo, useMemo, useState } from 'react';
import { cancelJob } from '../../app/actions';
import { applySession, useEditSession } from '../../app/edit-session';
import { useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { ApplyBar, Modal, type Problem } from '../../components/modal';
import { Check, IconButton } from '../../components/ui';
import { needsCorrection } from '../../engines/svg-parser/report';
import { projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { closeModal, uiStore } from '../../stores/ui-store';
import type { Polygon } from '../../types/geometry';
import type { Design } from '../../types/project';
import { confirmRemove, setDesign } from './DesignsPanel';
import { ImportFailures, ImportPanel } from './ImportPanel';
import { ReportBody } from './ReportDialog';

const ringD = (P: Polygon) => 'M' + P.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L') + 'z';

/** The outlines exactly as imported, before they go anywhere near a sheet. */
const DesignThumb = memo(function DesignThumb({ design, label }: { design: Design; label: string }) {
  const { d, box } = useMemo(() => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of design.parts) { b.x0 = Math.min(b.x0, p.bbox.x0); b.y0 = Math.min(b.y0, p.bbox.y0); b.x1 = Math.max(b.x1, p.bbox.x1); b.y1 = Math.max(b.y1, p.bbox.y1); }
    return { d: design.parts.flatMap(p => [...p.outers, ...p.holes]).map(ringD).join(''), box: b };
  }, [design]);
  const w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0), pad = Math.max(w, h) * 0.06;
  return (
    <svg className="design-thumb" viewBox={`${box.x0 - pad} ${box.y0 - pad} ${w + pad * 2} ${h + pad * 2}`} role="img" aria-label={label}>
      <path d={d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

/**
 * Choose or drop SVG files, see each one drawn with its size, page and import report, set copies,
 * then add them. Cancel takes every file read in this window back out of the project.
 */
export function ImportModal() {
  const { t } = useT();
  const { dirty, discard } = useEditSession();
  const designs = useStore(projectStore, s => s.project.designs);
  const job = useStore(uiStore, s => s.job);
  const [before] = useState(() => new Set(projectStore.get().project.designs.map(d => d.id)));
  const [report, setReport] = useState<string | null>(null);
  const added = designs.filter(d => !before.has(d.id));
  const importing = job?.kind === 'import';

  const problems: Problem[] = [];
  if (importing) problems.push({ level: 'error', text: t('importm.p.running') });
  const fix = added.filter(d => needsCorrection(d.report)).length;
  if (fix) problems.push({ level: 'warning', text: t('importm.p.fix', { n: fix }) });

  return (
    <Modal size="center" wide title={t('importm.title')} subtitle={t('importm.sub')} icon="upload" testId="import-modal"
      onClose={closeModal} dirty={dirty} onDiscard={discard} busy={importing ? t('importm.busy') : null} onStop={cancelJob}
      footer={<ApplyBar problems={problems} onApply={() => applySession(problems)} applyLabel={added.length ? t('importm.apply', { n: added.length }) : t('modal.done')} />}>
      <ImportPanel />
      <ImportFailures />
      <h3 className="mini-head">{t('importm.added', { n: added.length })}</h3>
      {added.length ? (
        <ul className="import-list" data-testid="import-list">
          {added.map(d => (
            <li key={d.id} className={needsCorrection(d.report) ? 'warn' : ''}>
              <DesignThumb design={d} label={d.name} />
              <div className="import-info">
                <div className="design-head">
                  <b className="design-name" title={d.name}>{d.name}</b>
                  {needsCorrection(d.report) && <span className="tag warn">{t('designs.check')}</span>}
                  <IconButton icon="trash" label={t('designs.remove', { name: d.name })} onClick={() => void confirmRemove(d)} />
                </div>
                <span className="design-sub">
                  {t('designs.pieces', { n: d.parts.length })} · {(d.report.stats.width).toFixed(1)} × {(d.report.stats.height).toFixed(1)} mm
                  {d.page.w > 0 && d.page.h > 0 && <> · {t('importm.pageShort', { w: d.page.w.toFixed(0), h: d.page.h.toFixed(0) })}</>}
                </span>
                <div className="design-row">
                  <span className="qty" role="group" aria-label={t('designs.qty')}>
                    <IconButton icon="minus" label={t('designs.less')} disabled={d.qty <= 1} onClick={() => setDesign(d.id, x => ({ ...x, qty: x.qty - 1 }))} />
                    <b>{d.qty}</b>
                    <IconButton icon="plus" label={t('designs.more')} disabled={d.qty >= 999} onClick={() => setDesign(d.id, x => ({ ...x, qty: x.qty + 1 }))} />
                  </span>
                  <Check label={t('designs.fixed')} checked={d.rotation === 'fixed'} onChange={v => setDesign(d.id, x => ({ ...x, rotation: v ? 'fixed' : 'inherit' }))} />
                  <button type="button" className="link" aria-expanded={report === d.id} onClick={() => setReport(r => (r === d.id ? null : d.id))}>
                    {t(report === d.id ? 'importm.hideReport' : 'importm.showReport')}
                  </button>
                </div>
                {report === d.id && <div className="import-report"><ReportBody report={d.report} page={d.page} /></div>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="empty-note">{t('importm.none')}</p>}
      <p className="hint"><Icon name="info" size={14} /> {t('importm.original')}</p>
    </Modal>
  );
}
