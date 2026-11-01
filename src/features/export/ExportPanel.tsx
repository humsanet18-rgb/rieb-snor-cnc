import { useState } from 'react';
import { canExportMachineFiles, downloadProject, downloadSvg, downloadTap, downloadZip } from '../../app/actions';
import { tr, useT } from '../../app/i18n';
import { Check, TextField } from '../../components/ui';
import { hasBlocking } from '../../engines/toolpath-engine/validate';
import { commit, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { toast, uiStore } from '../../stores/ui-store';
import { useIssues } from '../cutting-path/ReviewPanel';
import { makeCuttingReport } from './pdf-report';

export function ExportPanel() {
  const { t } = useT();
  const baseName = useStore(projectStore, s => s.project.baseName);
  const paths = useStore(uiStore, s => s.toolpaths);
  const confirmed = useStore(uiStore, s => s.confirmed);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const issues = useIssues();
  const [making, setMaking] = useState(false);
  const blocked = hasBlocking(issues);
  const ready = canExportMachineFiles();
  const pdf = async () => {
    setMaking(true);
    try { await makeCuttingReport(issues); }
    catch (e) { toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true); }
    setMaking(false);
  };
  return (
    <>
      <div className="fields">
        <TextField label={t('export.base')} value={baseName} onChange={v => commit(p => ({ ...p, baseName: v }))} testId="base-name" />
      </div>
      {paths && !busy ? (
        <>
          <h3 className="sub">{t('export.safety')}</h3>
          <ul className="checklist">
            <li>{t('export.s1')}</li><li>{t('export.s2')}</li><li>{t('export.s3')}</li><li>{t('export.s4')}</li>
          </ul>
          {blocked ? <p className="notice bad">{t('review.blocked')}</p> : (
            <Check label={t('export.confirm')} checked={confirmed} onChange={v => uiStore.patch({ confirmed: v })} testId="confirm" />
          )}
          {!blocked && !confirmed && <p className="hint">{t('export.needConfirm')}</p>}
          <button type="button" className="btn primary block" disabled={!ready} onClick={downloadZip} data-testid="download-zip">{t('export.all')}</button>
          <ul className="sheet-files">
            {paths.sheets.map((_, i) => (
              <li key={i}>
                <span>{t('path.sheet', { n: i + 1 })}</span>
                <button type="button" className="btn" disabled={!ready} onClick={() => downloadTap(i)} data-testid={`tap-${i}`}>{t('export.tap')}</button>
                <button type="button" className="btn" onClick={() => downloadSvg(i)} data-testid={`svg-${i}`}>{t('export.svg')}</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn block" disabled={making} onClick={() => void pdf()} data-testid="download-pdf">{making ? t('export.pdfBusy') : t('export.pdf')}</button>
          <p className="hint">{t('export.after')}</p>
        </>
      ) : <p className="hint">{busy ? t('path.busy') : t('path.none')}</p>}
      <button type="button" className="btn block" onClick={downloadProject} data-testid="download-project">{t('export.project')}</button>
    </>
  );
}
