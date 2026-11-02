import { refreshToolpaths } from '../../app/actions';
import { formatDuration, useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { Check, PanelCard } from '../../components/ui';
import { CutFields } from './CutFields';
import { ReviewPanel } from './ReviewPanel';
import { RowList } from './RowList';
import { activeProfile, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { go, savePrefs, uiStore } from '../../stores/ui-store';

function PathTable() {
  const { t, lang } = useT();
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const feed = useStore(projectStore, s => activeProfile(s).feed);
  const sheet = useStore(uiStore, s => s.sheet);
  if (busy) return <p className="progress-note" role="status">{t('path.busy')}</p>;
  if (!paths) return <p className="hint">{t('path.none')}</p>;
  return (
    <>
      <p className="hint">{t('path.summary')}</p>
      <table className="compare" data-testid="path-table">
        <thead><tr><th scope="col">#</th><th scope="col">{t('path.length')}</th><th scope="col">{t('path.time')}</th><th scope="col">{t('path.bridges')}</th></tr></thead>
        <tbody>
          {paths.sheets.map((s, i) => (
            <tr key={i} className={i === sheet ? 'on' : ''}>
              <td><button type="button" className="link" aria-label={t('path.sheet', { n: i + 1 })} onClick={() => uiStore.patch({ sheet: i, selected: [], highlightRow: null })}>{i + 1}</button></td>
              <td>{(s.length / 1000).toFixed(2)} {t('unit.m')}</td>
              <td>{feed > 0 ? formatDuration(lang, s.length / feed) : '—'}</td>
              <td>{s.stroke.bridges.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{t('path.timeNote')}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => { uiStore.patch({ toolpathKey: null }); void refreshToolpaths(); }}><Icon name="rotate" size={16} />{t('path.rebuild')}</button>
        <button type="button" className="btn" onClick={() => go('editor')} data-testid="open-editor"><Icon name="editor" size={16} />{t('path.openEditor')}</button>
      </div>
    </>
  );
}

export function PathPanel() {
  const { t } = useT();
  const showing = useStore(uiStore, s => s.layers.toolpath);
  return (
    <>
      <PanelCard title={t('card.order')} icon="path" tip={t('tip.order')}>
        <CutFields />
        <Check label={t('path.showOnCanvas')} checked={showing} testId="show-paths"
          onChange={toolpath => { uiStore.patch({ layers: { ...uiStore.get().layers, toolpath } }); savePrefs(); }} />
      </PanelCard>
      <PanelCard title={t('card.sequence')} icon="layers" testId="sequence-card"><RowList /></PanelCard>
      <PanelCard title={t('card.paths')} icon="ruler"><PathTable /></PanelCard>
      <PanelCard title={t('card.review')} icon="ok" testId="review-card"><ReviewPanel /></PanelCard>
      <PanelCard title={t('card.moves')} icon="info"><p className="hint">{t('moves.body')}</p></PanelCard>
      <PanelCard title={t('card.kerf')} icon="info"><p className="hint">{t('kerf.body')}</p></PanelCard>
    </>
  );
}
