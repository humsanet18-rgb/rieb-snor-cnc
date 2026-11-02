import { cancelJob, generate } from '../../app/actions';
import { tr, useT } from '../../app/i18n';
import { Check, IconButton, NumberField, PanelCard, SelectField } from '../../components/ui';
import { ask } from '../../stores/confirm-store';
import { activeLayout, commit, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import type { Arrange, Layout, NestMode, Project, RowSettings } from '../../types/project';
import { cornerZones, expandPieces, layoutStats } from './model';
import { setSettings } from './SheetPanel';

const ROTATIONS: Record<string, number[]> = { none: [0], '180': [0, 180], '90': [0, 90, 180, 270], '45': [0, 45, 90, 135, 180, 225, 270, 315] };

/** True when what is on screen no longer reflects the settings or quantities. */
export function layoutOutdated(p: Project, l: Layout | null): boolean {
  if (!l) return false;
  const s = p.settings;
  if (l.sheetW !== s.sheetW || l.sheetH !== s.sheetH) return true;
  if (l.mode === 'keep') return s.mode === 'auto';
  if (s.mode === 'keep' || l.gap !== s.gap || l.margin !== s.margin || l.fill !== s.fill || l.arrange !== s.arrange) return true;
  if (s.arrange === 'rows' && JSON.stringify(l.rows) !== JSON.stringify(s.rows)) return true;
  if (JSON.stringify(l.zones) !== JSON.stringify(cornerZones(s))) return true;
  const count = l.sheets.reduce((n, x) => n + x.pieces.length, 0) + l.unplaced.length;
  return count !== expandPieces(p.designs).length;
}

export function NestPanel() {
  const { t } = useT();
  const project = useStore(projectStore, s => s.project);
  const job = useStore(uiStore, s => s.job);
  const s = project.settings, layout = activeLayout(project), nesting = job?.kind === 'nest';
  const rotation = Object.entries(ROTATIONS).find(([, v]) => v.join() === s.angles.join())?.[0] ?? '90';
  const auto = s.mode !== 'keep', rows = auto && s.arrange === 'rows';
  const setRows = (part: Partial<RowSettings>) => setSettings(x => ({ ...x, rows: { ...x.rows, ...part } }));
  return (
    <>
    <PanelCard title={t('card.arrange')} icon="nest">
      <div className="segmented" role="radiogroup" aria-label={t('nest.mode')}>
        {(['auto', 'keep', 'manual'] as NestMode[]).map(m => (
          <label key={m} className={s.mode === m ? 'on' : ''}>
            <input type="radio" name="mode" checked={s.mode === m} onChange={() => setSettings(x => ({ ...x, mode: m }))} data-testid={`mode-${m}`} />
            {t(`nest.mode.${m}`)}
          </label>
        ))}
      </div>
      {s.mode === 'keep' && <p className="hint">{t('nest.keepHint')}</p>}
      {s.mode === 'manual' && <p className="hint">{t('nest.manualHint')}</p>}
      {auto && (
        <div className="segmented" role="radiogroup" aria-label={t('nest.arrange')}>
          {(['free', 'rows'] as Arrange[]).map(a => (
            <label key={a} className={s.arrange === a ? 'on' : ''}>
              <input type="radio" name="arrange" checked={s.arrange === a} data-testid={`arrange-${a}`}
                onChange={() => setSettings(x => ({ ...x, arrange: a, cut: a === 'rows' ? { ...x.cut, order: 'rows' } : x.cut }))} />
              {t(`nest.arrange.${a}`)}
            </label>
          ))}
        </div>
      )}
      {rows && <p className="hint">{t('nest.rowsHint')}</p>}
      {auto && (
        <div className="fields">
          <NumberField label={t('nest.gap')} value={s.gap} min={0} max={200} testId="gap" tip={t('tip.gap')} onChange={v => { if (v !== null) setSettings(x => ({ ...x, gap: v })); }} />
          {rows ? (
            <>
              <NumberField label={t('nest.tolerance')} value={s.rows.tolerance} min={0} max={1000} testId="row-tolerance" tip={t('tip.tolerance')} onChange={v => { if (v !== null) setRows({ tolerance: v }); }} />
              <SelectField label={t('nest.align')} value={s.rows.align} testId="row-align" onChange={align => setRows({ align })}
                options={[{ value: 'bottom', label: t('nest.align.bottom') }, { value: 'top', label: t('nest.align.top') }, { value: 'center', label: t('nest.align.center') }]} />
              <SelectField label={t('nest.rowOrder')} value={s.rows.order} testId="row-order" onChange={order => setRows({ order })}
                options={[{ value: 'height', label: t('nest.rowOrder.height') }, { value: 'file', label: t('nest.rowOrder.file') }]} />
            </>
          ) : (
            <>
              <SelectField label={t('nest.direction')} value={s.fill} testId="fill" onChange={fill => setSettings(x => ({ ...x, fill }))}
                options={[{ value: 'rows', label: t('nest.rows') }, { value: 'columns', label: t('nest.columns') }]} />
              <SelectField label={t('nest.rotation')} value={rotation} testId="rotation" onChange={r => setSettings(x => ({ ...x, angles: ROTATIONS[r] }))}
                options={[{ value: 'none', label: t('nest.rot.none') }, { value: '180', label: t('nest.rot.180') }, { value: '90', label: t('nest.rot.90') }, { value: '45', label: t('nest.rot.45') }]} />
              <SelectField label={t('nest.time')} value={String(s.seconds)} testId="seconds" onChange={v => setSettings(x => ({ ...x, seconds: +v }))}
                options={['1', '3', '8', '20', '60'].filter(v => v !== '1' || s.seconds === 1).map(v => ({ value: v, label: v === '1' ? '1 s' : t(`nest.time.${v}` as 'nest.time.3') }))} />
            </>
          )}
        </div>
      )}
      {rows && (
        <>
          <Check label={t('nest.fillGaps')} checked={s.rows.fillGaps} testId="row-fill" onChange={fillGaps => setRows({ fillGaps })} />
          <Check label={t('nest.tight')} checked={s.rows.tight} testId="row-tight" onChange={tight => setRows({ tight })} />
        </>
      )}
      {nesting ? (
        <div className="running" role="status">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}><i style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
          <p data-testid="nest-status">{job.stage === 'fine' ? t('nest.tightening') : t('nest.searching', { sheets: job.sheets, pass: job.pass })}</p>
          <button type="button" className="btn" onClick={cancelJob} data-testid="cancel">{t('nest.cancel')}</button>
        </div>
      ) : (
        <button type="button" className="btn primary block" disabled={!!job} onClick={() => void generate()} data-testid="generate">
          {project.layouts.length ? t('nest.again') : t('nest.go')}
        </button>
      )}
      {layoutOutdated(project, layout) && <p className="notice warn" data-testid="stale">{t('nest.stale')}</p>}
      {layout && layout.unplaced.length > 0 && <p className="notice bad" data-testid="unplaced">{t('nest.unplaced', { n: layout.unplaced.length })}</p>}
    </PanelCard>
    {project.layouts.length > 0 && <PanelCard title={t('card.layouts')} icon="layers"><LayoutTable project={project} /></PanelCard>}
    </>
  );
}

function LayoutTable({ project }: { project: Project }) {
  const { t } = useT();
  const select = (id: string) => { commit(p => ({ ...p, activeLayoutId: id })); uiStore.patch({ sheet: 0, selected: [], highlightRow: null }); };
  const remove = async (id: string, n: number) => {
    if (!await ask({ title: tr('confirm.deleteLayout'), body: tr('confirm.deleteLayout.body', { n }), action: tr('confirm.delete'), danger: true })) return;
    commit(p => {
      const layouts = p.layouts.filter(l => l.id !== id);
      return { ...p, layouts, activeLayoutId: p.activeLayoutId === id ? layouts[layouts.length - 1]?.id ?? null : p.activeLayoutId };
    });
  };
  return (
    <>
      <table className="compare" data-testid="layouts">
        <thead>
          <tr><th scope="col">#</th><th scope="col">{t('nest.col.sheets')}</th><th scope="col">{t('nest.col.util')}</th><th /></tr>
        </thead>
        <tbody>
          {project.layouts.map(l => {
            const st = layoutStats(l, project.designs), on = l.id === project.activeLayoutId;
            return (
              <tr key={l.id} className={on ? 'on' : ''}>
                <td><button type="button" className="link" aria-pressed={on} aria-label={t('nest.use')} onClick={() => select(l.id)}>{l.number}</button></td>
                <td>{st.sheets}</td>
                <td>{(st.utilization * 100).toFixed(1)}%</td>
                <td><IconButton icon="trash" label={t('nest.remove', { n: l.number })} onClick={() => void remove(l.id, l.number)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint"><b>{t('nest.best')}.</b> {t('nest.bestHint')}</p>
    </>
  );
}
