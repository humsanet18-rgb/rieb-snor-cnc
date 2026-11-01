import { useRef, useState, type DragEvent } from 'react';
import { addFiles, addSample } from '../../app/actions';
import { importIssueText, useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';

export function ImportPanel() {
  const { t, lang } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const job = useStore(uiStore, s => s.job);
  const failures = useStore(uiStore, s => s.failures);
  const importing = job?.kind === 'import';
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void addFiles([...e.dataTransfer.files]);
  };
  return (
    <>
      <button type="button" className={'drop' + (over ? ' over' : '')} disabled={!!job} onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <Icon name="upload" size={26} />
        <b>{t('import.drop')}</b>
        <span>{t('import.pick')}</span>
      </button>
      <input ref={input} type="file" accept=".svg,image/svg+xml" multiple hidden data-testid="file-input"
        onChange={e => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <p className="hint">{t('import.hint')}</p>
      {importing && <p className="progress-note" role="status">{t('import.progress', { name: job.name ?? '', done: (job.done ?? 0) + 1, total: job.total ?? 1 })}</p>}
      {failures.length > 0 && (
        <ul className="notices" data-testid="import-failures">
          {failures.map(f => (
            <li key={f.name} className="notice bad"><b>{t('import.failed')}: {f.name}</b><br />{importIssueText(lang, f.code)}</li>
          ))}
        </ul>
      )}
      <div className="sample-row">
        <span>{t('import.samples')}</span>
        <button type="button" className="link" onClick={() => void addSample('block-letters.svg')}>{t('import.sample.letters')}</button>
        <button type="button" className="link" onClick={() => void addSample('mixed-shapes.svg')}>{t('import.sample.shapes')}</button>
        <button type="button" className="link" onClick={() => void addSample('file-with-problems.svg')}>{t('import.sample.warnings')}</button>
      </div>
    </>
  );
}
