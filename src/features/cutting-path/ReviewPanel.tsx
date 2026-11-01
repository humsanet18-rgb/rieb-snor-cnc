import { useMemo } from 'react';
import { validationText, useT } from '../../app/i18n';
import type { ValidationIssue } from '../../engines/toolpath-engine/validate';
import { activeLayout, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';

/** Validation results plus what the worker cannot know: pieces left out of the layout. */
export function useIssues(): ValidationIssue[] {
  const paths = useStore(uiStore, s => s.toolpaths);
  const unplaced = useStore(projectStore, s => activeLayout(s.project)?.unplaced.length ?? 0);
  return useMemo(() => {
    const list = paths?.issues ?? [];
    return unplaced ? [...list, { code: 'unplaced' as const, severity: 'warning' as const, sheet: -1, count: unplaced }] : list;
  }, [paths, unplaced]);
}

const RANK = { error: 0, warning: 1, info: 2 };

export function ReviewPanel() {
  const { t, lang } = useT();
  const issues = useIssues();
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  if (busy) return <p className="progress-note" role="status">{t('path.busy')}</p>;
  if (!paths) return <p className="hint">{t('review.none')}</p>;
  const count = (s: string) => issues.filter(i => i.severity === s).length;
  const errors = count('error');
  const sorted = [...issues].sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.sheet - b.sheet);
  return (
    <>
      <div className="review-sum" data-testid="review-summary">
        <span className={'tag ' + (errors ? 'bad' : 'ok')}>{errors ? t('review.errors', { n: errors }) : t('review.ok')}</span>
        {count('warning') > 0 && <span className="tag warn">{t('review.warnings', { n: count('warning') })}</span>}
        {count('info') > 0 && <span className="tag">{t('review.infos', { n: count('info') })}</span>}
      </div>
      {errors > 0 && <p className="notice bad">{t('review.blocked')}</p>}
      <ul className="notices" data-testid="review-list">
        {sorted.map((i, n) => (
          <li key={n} className={'notice ' + (i.severity === 'error' ? 'bad' : i.severity === 'warning' ? 'warn' : 'info')} data-code={i.code}>
            <b>{i.sheet < 0 ? t('review.job') : t('review.sheet', { n: i.sheet + 1 })}</b>{' '}
            {validationText(lang, i.code, i.detail)}{i.count > 1 ? ` ${t('review.count', { n: i.count })}` : ''}
            {i.at && <button type="button" className="link" onClick={() => uiStore.patch({ sheet: i.sheet, flash: i.at ?? null })}>{t('review.show')}</button>}
          </li>
        ))}
      </ul>
      <p className="hint">{t('review.disclaimer')}</p>
    </>
  );
}
