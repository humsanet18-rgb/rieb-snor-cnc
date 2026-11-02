import { useMemo, useState } from 'react';
import { canExportMachineFiles, downloadTap, downloadZip, tapOf } from '../../app/actions';
import { formatDuration, useT, type Key } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { Modal, ModalTabs } from '../../components/modal';
import { Check, Stat } from '../../components/ui';
import { activeLayout, activeProfile, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { closeModal, openModal, uiStore } from '../../stores/ui-store';
import { GCodeList } from '../editor/EditorPanel';
import { checkTap, type CheckStatus, type TapReport } from './gcode-checks';

const ICON: Record<CheckStatus, 'ok' | 'error' | 'warn' | 'info'> = { pass: 'ok', fail: 'error', warn: 'warn', info: 'info' };

/**
 * The machine file for each sheet, line by line, beside checks made on the file text itself:
 * Mach3 syntax, F/S/M5, the path end, and every move inside the sheet and the machine travel.
 * Downloads stay off until the checks pass and the operator has confirmed.
 */
export function GcodeModal() {
  const { t, lang } = useT();
  const project = useStore(projectStore, s => s.project);
  const profile = useStore(projectStore, activeProfile);
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const confirmed = useStore(uiStore, s => s.confirmed);
  const [sheet, setSheet] = useState(() => uiStore.get().sheet);
  const [line, setLine] = useState(-1);
  const [full, setFull] = useState(false);
  const layout = activeLayout(project), cut = project.settings.cut;

  const files = useMemo(() => {
    if (!paths || busy || !layout) return [];
    return paths.sheets.map((sp, i) => {
      const file = tapOf(i);
      if (!file) return null;
      const blocking = paths.issues.filter(x => (x.sheet === i || x.sheet < 0) && x.severity === 'error').length;
      const report: TapReport = checkTap(file.text, {
        sheetW: layout.sheetW, sheetH: layout.sheetH, maxX: profile.maxX, maxY: profile.maxY, feed: profile.feed, power: profile.power, m5: profile.m5,
        returnHome: cut.order === 'shortest' || cut.returnHome, blocking
      });
      return { ...file, lines: file.text.split('\r\n'), report, length: sp.length };
    });
    // tapOf reads the output name from the project, so it belongs here too.
  }, [paths, busy, layout, profile, cut, project.baseName]);

  const index = Math.min(sheet, Math.max(0, files.length - 1)), f = files[index];
  const allOk = files.length > 0 && files.every(x => x?.report.ok);
  const machineReady = canExportMachineFiles();

  return (
    <Modal size="workspace" full={full} title={t('gcode.title')} subtitle={t('gcode.sub')} icon="code" testId="gcode-modal" onClose={closeModal}
      headerExtra={<button type="button" className="icon-btn" onClick={() => setFull(x => !x)} aria-pressed={full} data-testid="gcode-full"
        aria-label={t(full ? 'gcode.restore' : 'gcode.fullscreen')} title={t(full ? 'gcode.restore' : 'gcode.fullscreen')}><Icon name="fit" /></button>}
      footer={
        <div className="apply-actions">
          <button type="button" className="btn" onClick={() => openModal('export')} data-testid="gcode-to-export"><Icon name="download" size={16} />{t('gcode.toExport')}</button>
          <span className="grow" />
          <button type="button" className="btn" disabled={!f || !f.report.ok || !machineReady} onClick={() => downloadTap(index)} data-testid="gcode-download">
            <Icon name="download" size={16} />{t('gcode.downloadSheet', { n: index + 1 })}
          </button>
          <button type="button" className="btn primary" disabled={!allOk || !machineReady} onClick={downloadZip} data-testid="gcode-download-all">
            <Icon name="download" size={16} />{t('export.all')}
          </button>
        </div>
      }>
      {!files.length ? (
        <p className="empty-note" data-testid="gcode-empty">{busy ? t('path.busy') : t('path.none')}</p>
      ) : (
        <>
          {files.length > 1 && (
            <ModalTabs label={t('gcode.sheets')} active={String(index)} onChange={v => { setSheet(+v); setLine(-1); }}
              tabs={files.map((x, i) => ({ id: String(i), label: t('path.sheet', { n: i + 1 }), state: x?.report.ok ? 'ok' as const : 'bad' as const }))} />
          )}
          {f && (
            <div className="modal-split gcode-split">
              <section className="modal-main" aria-label={f.name}>
                <div className="preview-head">
                  <b className="mono">{f.name}</b>
                  <span className="hint">{t('gcode.lines', { n: f.report.lines })}</span>
                </div>
                <GCodeList lines={f.lines} current={line} pick={setLine} tall testId="gcode-full-list" />
              </section>
              <section className="modal-side" aria-label={t('gcode.checks')}>
                <h3 className="mini-head">{t('gcode.checks')}</h3>
                <ul className="check-list" data-testid="gcode-checks">
                  {f.report.checks.map(c => (
                    <li key={c.id} className={c.status} data-check={c.id} data-status={c.status}>
                      <Icon name={ICON[c.status]} size={16} />
                      <span>
                        <b>{t(`gcode.check.${c.id}` as Key)}</b>
                        <small>{t(`gcode.check.${c.id}.${c.status}` as Key, { detail: c.detail ?? '' })}</small>
                      </span>
                      {c.line && <button type="button" className="link" onClick={() => setLine(c.line! - 1)}>{t('gcode.line', { n: c.line })}</button>}
                    </li>
                  ))}
                </ul>
                <dl className="stats">
                  <Stat label={t('gcode.moves')} value={f.report.moves.toLocaleString()} />
                  <Stat label={t('path.time')} value={profile.feed > 0 ? formatDuration(lang, f.length / profile.feed) : '—'} />
                  <Stat label={t('gcode.extentX')} value={f.report.extent ? `${f.report.extent.x0.toFixed(1)} – ${f.report.extent.x1.toFixed(1)}` : '—'} />
                  <Stat label={t('gcode.extentY')} value={f.report.extent ? `${f.report.extent.y0.toFixed(1)} – ${f.report.extent.y1.toFixed(1)}` : '—'} />
                </dl>
                <p className={'notice ' + (f.report.ok ? 'ok' : 'bad')} data-testid="gcode-verdict">{t(f.report.ok ? 'gcode.ok' : 'gcode.blocked')}</p>
                {f.report.ok && (
                  <div className={'confirm-box' + (confirmed ? ' on' : '')}>
                    <Check label={t('export.confirm')} checked={confirmed} onChange={v => uiStore.patch({ confirmed: v })} testId="gcode-confirm" />
                  </div>
                )}
                <p className="hint">{t('review.disclaimer')}</p>
              </section>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
