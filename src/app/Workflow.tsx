import type { ReactNode } from 'react';
import { Icon } from '../components/icons';
import { PathPanel } from '../features/cutting-path/PathPanel';
import { ReviewPanel, useIssues } from '../features/cutting-path/ReviewPanel';
import { ExportPanel } from '../features/export/ExportPanel';
import { MachinePanel } from '../features/machine-settings/MachinePanel';
import { NestPanel } from '../features/nesting/NestPanel';
import { SheetPanel } from '../features/nesting/SheetPanel';
import { DesignsPanel } from '../features/svg-import/DesignsPanel';
import { ImportPanel } from '../features/svg-import/ImportPanel';
import { hasBlocking } from '../engines/toolpath-engine/validate';
import { projectStore } from '../stores/project-store';
import { useStore } from '../stores/store';
import { uiStore } from '../stores/ui-store';
import { useT, type Key } from './i18n';

const PANELS: ReactNode[] = [<ImportPanel />, <DesignsPanel />, <SheetPanel />, <NestPanel />, <MachinePanel />, <PathPanel />, <ReviewPanel />, <ExportPanel />];

export function Workflow() {
  const { t } = useT();
  const step = useStore(uiStore, s => s.step);
  const designs = useStore(projectStore, s => s.project.designs.length);
  const layouts = useStore(projectStore, s => s.project.layouts.length);
  const paths = useStore(uiStore, s => s.toolpaths);
  const issues = useIssues();
  const done: boolean[] = [designs > 0, designs > 0, designs > 0, layouts > 0, layouts > 0, !!paths, !!paths && !hasBlocking(issues), false];
  return (
    <aside className="workflow">
      <ol>
        {PANELS.map((panel, i) => {
          const n = i + 1, open = step === n;
          return (
            <li key={n} className={open ? 'open' : ''}>
              <button type="button" className="step-head" aria-expanded={open} onClick={() => uiStore.patch({ step: open ? 0 : n })} data-testid={`step-${n}`}>
                <span className={'num' + (done[i] ? ' done' : '')}>{done[i] ? <Icon name="check" size={14} /> : n}</span>
                {t(`step.${n}` as Key)}
              </button>
              {open && (
                <div className="step-body">
                  {panel}
                  {n < 8 && <button type="button" className="link next" onClick={() => uiStore.patch({ step: n + 1 })}>{t('step.next')}</button>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
