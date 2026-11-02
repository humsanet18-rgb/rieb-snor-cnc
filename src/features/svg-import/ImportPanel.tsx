import { useRef, useState, type DragEvent } from 'react';
import { addFiles, addSample } from '../../app/actions';
import { importIssueText, useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';

/** Files the last import could not read, with the reason; shown wherever the operator imported from. */
export function ImportFailures() {
  const { t, lang } = useT();
  const failures = useStore(uiStore, s => s.failures);
  if (!failures.length) return null;
  return (
    <ul className="notices" data-testid="import-failures">
      {failures.map(f => (
        <li key={f.name} className="notice bad"><b>{t('import.failed')}: {f.name}</b><br />{importIssueText(lang, f.code)}</li>
      ))}
    </ul>
  );
}

export function ImportPanel() {
  const { t } = useT();
  const [over, setOver] = useState(false);
  // Its own input: the app-wide one sits outside any open modal, where the browser treats it as inert.
  const input = useRef<HTMLInputElement>(null);
  const job = useStore(uiStore, s => s.job);
  const importing = job?.kind === 'import';
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void addFiles([...e.dataTransfer.files]);
  };
  return (
    <>
      <button type="button" className={'drop' + (over ? ' over' : '')} disabled={!!job} onClick={() => input.current?.click()} data-testid="drop"
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <span className="drop-icon"><Icon name="upload" size={24} /></span>
        <b>{t('import.drop')}</b>
        <span>{t('import.pick')}</span>
      </button>
      <input ref={input} type="file" accept=".svg,image/svg+xml" multiple hidden data-testid="import-file-input"
        onChange={e => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <p className="hint">{t('import.hint')}</p>
      {importing && (
        <div className="running" role="status">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}><i style={{ width: `${Math.max(8, Math.round(job.progress * 100))}%` }} /></div>
          <p className="progress-note">{t('import.progress', { name: job.name ?? '', done: (job.done ?? 0) + 1, total: job.total ?? 1 })}</p>
        </div>
      )}
      <ImportFailures />
      <div className="sample-row">
        <span>{t('import.samples')}</span>
        <button type="button" className="link" onClick={() => void addSample('block-letters.svg')}>{t('import.sample.letters')}</button>
        <button type="button" className="link" onClick={() => void addSample('mixed-shapes.svg')}>{t('import.sample.shapes')}</button>
        <button type="button" className="link" onClick={() => void addSample('file-with-problems.svg')}>{t('import.sample.warnings')}</button>
      </div>
    </>
  );
}
