import { removeDesign } from '../../app/actions';
import { tr, useT } from '../../app/i18n';
import { Check, IconButton } from '../../components/ui';
import { ask, askText } from '../../stores/confirm-store';
import { needsCorrection } from '../../engines/svg-parser/report';
import { commit, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import type { Design } from '../../types/project';

export const setDesign = (id: string, fn: (d: Design) => Design) =>
  commit(p => ({ ...p, designs: p.designs.map(d => d.id === id ? fn(d) : d) }));

async function rename(d: Design) {
  const name = await askText({ title: tr('designs.rename'), body: tr('designs.renameBody'), action: tr('designs.renameAction'), input: { label: tr('designs.name'), value: d.name } });
  if (name && name !== d.name) setDesign(d.id, x => ({ ...x, name }));
}

export async function confirmRemove(d: Design) {
  if (await ask({ title: tr('confirm.removeDesign'), body: tr('confirm.removeDesign.body', { name: d.name }), action: tr('confirm.remove'), danger: true })) removeDesign(d.id);
}

export function DesignsPanel() {
  const { t } = useT();
  const designs = useStore(projectStore, s => s.project.designs);
  if (!designs.length) return <p className="empty-note">{t('designs.empty')}</p>;
  const total = designs.reduce((n, d) => n + d.qty * d.parts.length, 0);
  return (
    <>
      <ul className="design-list" data-testid="design-list">
        {designs.map((d, i) => (
          <li key={d.id}>
            <div className="design-head">
              <i className={`swatch d${i % 6}`} aria-hidden="true" />
              <span className="design-name" title={d.name}>{d.name}</span>
              <IconButton icon="edit" label={t('designs.renameNamed', { name: d.name })} onClick={() => void rename(d)} />
              <IconButton icon="report" label={t('designs.report')} onClick={() => uiStore.patch({ dialog: { report: d.id } })} />
              <IconButton icon="trash" label={t('designs.remove', { name: d.name })} onClick={() => void confirmRemove(d)} />
            </div>
            <div className="design-sub">
              {t('designs.pieces', { n: d.parts.length })} · {t('designs.contours', { n: d.report.stats.contours })} · {t('designs.size', { w: (d.report.stats.width / 10).toFixed(1), h: (d.report.stats.height / 10).toFixed(1) })}
              {needsCorrection(d.report) && <button type="button" className="tag warn" onClick={() => uiStore.patch({ dialog: { report: d.id } })}>{t('designs.check')}</button>}
            </div>
            <div className="design-row">
              <span className="qty" role="group" aria-label={t('designs.qty')}>
                <IconButton icon="minus" label={t('designs.less')} disabled={d.qty <= 1} onClick={() => setDesign(d.id, x => ({ ...x, qty: x.qty - 1 }))} />
                <b data-testid={`qty-${i}`}>{d.qty}</b>
                <IconButton icon="plus" label={t('designs.more')} disabled={d.qty >= 999} onClick={() => setDesign(d.id, x => ({ ...x, qty: x.qty + 1 }))} testId={`more-${i}`} />
              </span>
              <Check label={t('designs.fixed')} checked={d.rotation === 'fixed'} onChange={v => setDesign(d.id, x => ({ ...x, rotation: v ? 'fixed' : 'inherit' }))} />
            </div>
          </li>
        ))}
      </ul>
      <p className="hint" data-testid="pieces-total">{t('designs.total', { n: total })}</p>
    </>
  );
}
