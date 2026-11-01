import { refreshToolpaths } from '../../app/actions';
import { formatDuration, useT } from '../../app/i18n';
import { Check } from '../../components/ui';
import { CutFields } from './CutFields';
import { activeProfile, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { savePrefs, uiStore } from '../../stores/ui-store';

export function PathPanel() {
  const { t, lang } = useT();
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const showing = useStore(uiStore, s => s.layers.toolpath);
  const feed = useStore(projectStore, s => activeProfile(s).feed);
  if (busy) return <p className="progress-note" role="status">{t('path.busy')}</p>;
  if (!paths) return <><CutFields /><p className="hint">{t('path.none')}</p></>;
  return (
    <>
      <p className="hint">{t('path.summary')}</p>
      <CutFields />
      <Check label={t('path.showOnCanvas')} checked={showing} testId="show-paths"
        onChange={toolpath => { uiStore.patch({ layers: { ...uiStore.get().layers, toolpath } }); savePrefs(); }} />
      <table className="compare" data-testid="path-table">
        <thead><tr><th scope="col">#</th><th scope="col">{t('path.length')}</th><th scope="col">{t('path.time')}</th><th scope="col">{t('path.bridges')}</th></tr></thead>
        <tbody>
          {paths.sheets.map((s, i) => (
            <tr key={i}>
              <td><button type="button" className="link" aria-label={t('path.sheet', { n: i + 1 })} onClick={() => uiStore.patch({ sheet: i })}>{i + 1}</button></td>
              <td>{(s.length / 1000).toFixed(2)} {t('unit.m')}</td>
              <td>{feed > 0 ? formatDuration(lang, s.length / feed) : '—'}</td>
              <td>{s.stroke.bridges.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{t('path.timeNote')}</p>
      <button type="button" className="btn" onClick={() => { uiStore.patch({ toolpathKey: null }); void refreshToolpaths(); }}>{t('path.rebuild')}</button>
      <button type="button" className="btn" onClick={() => uiStore.patch({ view: 'editor' })} data-testid="open-editor">{t('path.openEditor')}</button>
    </>
  );
}
