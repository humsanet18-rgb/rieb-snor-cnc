import { useMemo } from 'react';
import { useT, type Key } from '../../app/i18n';
import { activeLayout, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import { itemBox, sheetItems } from '../nesting/model';
import { setSettings } from '../nesting/SheetPanel';

const range = (v: number[]) => [Math.min(...v), Math.max(...v)].map(x => x.toFixed(0));

/** The rows the wire works through, taken from the built path itself so the list, the sheet and the file agree. */
export function RowList() {
  const { t } = useT();
  const project = useStore(projectStore, s => s.project);
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const sheetIndex = useStore(uiStore, s => s.sheet);
  const highlight = useStore(uiStore, s => s.highlightRow);
  const layout = activeLayout(project), order = project.settings.cut.order;
  const index = layout ? Math.min(sheetIndex, Math.max(0, layout.sheets.length - 1)) : 0;
  const sheet = layout?.sheets[index], rows = paths?.sheets[index]?.stroke.rows;
  const boxes = useMemo(() => (sheet ? sheetItems(sheet, project.designs).map(itemBox) : []), [sheet, project.designs]);
  if (!layout) return <p className="hint">{t('rows.none')}</p>;
  if (busy || !paths) return <p className="progress-note" role="status">{t('rows.busy')}</p>;
  if (!rows) return (
    <>
      <p className="hint">{t('rows.shortest')}</p>
      <button type="button" className="btn" onClick={() => setSettings(x => ({ ...x, cut: { ...x.cut, order: 'rows' } }))} data-testid="use-rows">{t('rows.useRows')}</button>
    </>
  );
  const columns = order === 'columns';
  return (
    <>
      <p className="hint">{t(`rows.flow.${order}` as Key)} {t('rows.hint')}</p>
      {layout.sheets.length > 1 && <p className="sub" data-testid="rows-sheet">{t('rows.sheet', { n: index + 1, total: layout.sheets.length })}</p>}
      <ol className="row-list" data-testid="row-list">
        {rows.map((r, n) => {
          const size = r.map(i => boxes[i]).filter(Boolean).map(b => (columns ? b.x1 - b.x0 : b.y1 - b.y0));
          const [a, b] = size.length ? range(size) : ['—', '—'];
          return (
            <li key={n}>
              <button type="button" className={'row-item' + (highlight === n ? ' on' : '')} aria-pressed={highlight === n}
                onClick={() => uiStore.patch({ highlightRow: highlight === n ? null : n })} data-testid={`row-${n + 1}`}>
                <span className="row-num">{n + 1}</span>
                <span className="row-main">
                  <b>{t(columns ? 'rows.col' : 'rows.row', { n: n + 1 })}</b>
                  <small>{t('rows.count', { n: r.length })} · {t(columns ? 'rows.width' : 'rows.height', { a, b })}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {highlight !== null && <button type="button" className="link" onClick={() => uiStore.patch({ highlightRow: null })}>{t('rows.clear')}</button>}
    </>
  );
}
