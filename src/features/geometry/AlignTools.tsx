import { tr, useT, type Key } from '../../app/i18n';
import type { IconName } from '../../components/icons';
import { IconButton } from '../../components/ui';
import { activeLayout, projectStore, setLayout } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { toast, uiStore } from '../../stores/ui-store';
import { alignPieces, partOf, rotatePiece, updatePieces, type AlignMode } from '../nesting/model';

const TOOLS: { mode: AlignMode; icon: IconName; label: Key }[] = [
  { mode: 'left', icon: 'alignLeft', label: 'align.left' }, { mode: 'center', icon: 'alignCenter', label: 'align.center' },
  { mode: 'right', icon: 'alignRight', label: 'align.right' }, { mode: 'top', icon: 'alignTop', label: 'align.top' },
  { mode: 'middle', icon: 'alignMiddle', label: 'align.middle' }, { mode: 'bottom', icon: 'alignBottom', label: 'align.bottom' },
  { mode: 'distH', icon: 'distributeH', label: 'align.distH' }, { mode: 'distV', icon: 'distributeV', label: 'align.distV' }
];

export function alignSelection(mode: AlignMode): void {
  const { project } = projectStore.get(), layout = activeLayout(project), keys = uiStore.get().selected;
  if (!layout) return;
  const next = alignPieces(layout, project.designs, keys, mode);
  if (next !== layout) { setLayout(next); toast(tr('align.done', { n: keys.length })); }
}

/** Turns every selected piece a quarter turn about its own centre; manual layouts only. */
export function rotateSelection(): void {
  const { project } = projectStore.get(), layout = activeLayout(project), keys = uiStore.get().selected;
  if (!layout || !keys.length || project.settings.mode !== 'manual' || layout.mode === 'keep') return;
  setLayout(updatePieces(layout, keys, p => { const part = partOf(project.designs, p); return part ? rotatePiece(part, p, p.deg + 90) : p; }));
}

/** Align and distribute for the selected pieces, one undo step each. */
export function AlignTools() {
  const { t } = useT();
  const count = useStore(uiStore, s => s.selected.length);
  return (
    <div className="align-tools" role="group" aria-label={t('align.label')} data-testid="align-tools">
      {TOOLS.map(x => (
        <IconButton key={x.mode} icon={x.icon} label={t(x.label)} disabled={count < (x.mode.startsWith('dist') ? 3 : 2)}
          onClick={() => alignSelection(x.mode)} testId={`align-${x.mode}`} size={18} />
      ))}
    </div>
  );
}
