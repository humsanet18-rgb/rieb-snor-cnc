import { useState } from 'react';
import { canExportMachineFiles, downloadProject, downloadSvg, downloadTap, downloadZip } from '../../app/actions';
import { tr, useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { Check, PanelCard, TextField } from '../../components/ui';
import { hasBlocking } from '../../engines/toolpath-engine/validate';
import { commit, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { closeModal, go, openModal, toast, uiStore } from '../../stores/ui-store';
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
      <PanelCard title={t('card.output')} icon="file">
        <div className="fields">
          <TextField label={t('export.base')} value={baseName} onChange={v => commit(p => ({ ...p, baseName: v }))} testId="base-name" />
        </div>
      </PanelCard>
      <PanelCard title={t('card.files')} icon="download">
        {paths && !busy ? (
          <>
            <h4 className="mini-head">{t('export.safety')}</h4>
            <ul className="checklist">
              <li>{t('export.s1')}</li><li>{t('export.s2')}</li><li>{t('export.s3')}</li><li>{t('export.s4')}</li>
            </ul>
            {blocked ? (
              <div className="notice bad">
                {t('review.blocked')} <button type="button" className="link" onClick={() => { closeModal(); go('path'); }}>{t('nav.section.path')}</button>
              </div>
            ) : (
              <div className={'confirm-box' + (confirmed ? ' on' : '')}>
                <Check label={t('export.confirm')} checked={confirmed} onChange={v => uiStore.patch({ confirmed: v })} testId="confirm" />
              </div>
            )}
            {!blocked && !confirmed && <p className="hint">{t('export.needConfirm')}</p>}
            <button type="button" className="btn block" onClick={() => openModal('gcode')} data-testid="open-gcode"><Icon name="code" size={16} />{t('gcode.review')}</button>
            <button type="button" className="btn primary block" disabled={!ready} onClick={downloadZip} data-testid="download-zip"><Icon name="download" size={16} />{t('export.all')}</button>
            <ul className="sheet-files">
              {paths.sheets.map((_, i) => (
                <li key={i}>
                  <span>{t('path.sheet', { n: i + 1 })}</span>
                  <button type="button" className="btn" disabled={!ready} onClick={() => downloadTap(i)} data-testid={`tap-${i}`}>{t('export.tap')}</button>
                  <button type="button" className="btn" onClick={() => downloadSvg(i)} data-testid={`svg-${i}`}>{t('export.svg')}</button>
                </li>
              ))}
            </ul>
            <p className="hint">{t('export.after')}</p>
          </>
        ) : <p className="hint">{busy ? t('path.busy') : t('path.none')}</p>}
      </PanelCard>
      <PanelCard title={t('card.other')} icon="report">
        {paths && !busy && (
          <button type="button" className="btn block" disabled={making} onClick={() => void pdf()} data-testid="download-pdf">
            <Icon name="report" size={16} />{making ? t('export.pdfBusy') : t('export.pdf')}
          </button>
        )}
        <button type="button" className="btn block" onClick={downloadProject} data-testid="download-project"><Icon name="save" size={16} />{t('export.project')}</button>
      </PanelCard>
    </>
  );
}
