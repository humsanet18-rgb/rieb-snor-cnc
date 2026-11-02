import { importIssueText, useT } from '../../app/i18n';
import { Modal } from '../../components/modal';
import { Stat } from '../../components/ui';
import type { ImportReport } from '../../engines/svg-parser/report';
import { projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import type { Design } from '../../types/project';

const list = (counts: Record<string, number>) => Object.entries(counts).map(([k, v]) => `${k} × ${v}`).join(', ');

/** What the importer read from a file: sizes, what it kept and skipped, and what to correct. */
export function ReportBody({ report: r, page }: { report: ImportReport; page?: Design['page'] }) {
  const { t, lang } = useT();
  const s = r.stats, issues = r.issues;
  return (
    <>
      <dl className="stats">
        <Stat label={t('report.parts')} value={s.parts} />
        <Stat label={t('report.contours')} value={s.contours} />
        <Stat label={t('report.holes')} value={s.holes} />
        <Stat label={t('report.points')} value={s.points.toLocaleString()} />
        <Stat label={t('report.size')} value={`${(s.width / 10).toFixed(1)} × ${(s.height / 10).toFixed(1)} cm`} />
        <Stat label={t('report.area')} value={`${(s.area / 100).toFixed(0)} ${t('unit.cm2')}`} />
        <Stat label={t('report.file')} value={`${(r.fileBytes / 1024).toFixed(0)} KB`} />
        {page && <Stat label={t('importm.page')} value={page.w && page.h ? `${page.w.toFixed(1)} × ${page.h.toFixed(1)} mm` : t('importm.pageNone')} />}
      </dl>
      <h3>{t('report.imported')}</h3>
      <p data-testid="report-imported">{list(r.imported) || t('report.nothing')}</p>
      <h3>{t('report.skipped')}</h3>
      <p data-testid="report-skipped">{list(r.skipped) || t('report.nothing')}</p>
      <h3>{t('report.correct')}</h3>
      {issues.length ? (
        <ul className="notices" data-testid="report-issues">
          {issues.map(i => (
            <li key={i.code} className={'notice ' + (i.severity === 'info' ? 'info' : 'warn')}>
              {importIssueText(lang, i.code)}{i.count > 1 ? ` (${i.count})` : ''}
              {i.detail && <code>{i.detail}</code>}
            </li>
          ))}
        </ul>
      ) : <p>{t('report.none')}</p>}
    </>
  );
}

export function ReportDialog({ designId }: { designId: string }) {
  const { t } = useT();
  const design = useStore(projectStore, s => s.project.designs.find(d => d.id === designId));
  if (!design) return null;
  return (
    <Modal size="center" title={t('report.title', { name: design.name })} icon="report" onClose={() => uiStore.patch({ dialog: null })} testId="report-dialog">
      <ReportBody report={design.report} page={design.page} />
    </Modal>
  );
}
