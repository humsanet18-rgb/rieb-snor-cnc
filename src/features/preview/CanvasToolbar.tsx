import { useT, type Key } from '../../app/i18n';
import { Check, IconButton } from '../../components/ui';
import { Icon } from '../../components/icons';
import { activeLayout, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { savePrefs, SNAP_MM, togglePanel, uiStore, type Layers } from '../../stores/ui-store';
import type { Layout } from '../../types/project';

const LAYERS: (keyof Layers)[] = ['designs', 'toolpath', 'direction', 'bridges', 'rows', 'order', 'start', 'zones', 'issues', 'dims', 'grid'];


export function selectAllOnSheet(): void {
  const layout = activeLayout(projectStore.get().project), s = layout?.sheets[Math.min(uiStore.get().sheet, layout.sheets.length - 1)];
  if (s) uiStore.patch({ selected: s.pieces.map(p => p.key) });
}

export function CanvasToolbar({ layout, index, fit, zoom, scale }: {
  layout: Layout | null; index: number; fit: () => void; zoom: (f: number) => void; scale: number;
}) {
  const { t } = useT();
  const layers = useStore(uiStore, s => s.layers);
  const tool = useStore(uiStore, s => s.tool), snap = useStore(uiStore, s => s.snap), layersOpen = useStore(uiStore, s => s.layersOpen);
  const setTool = (x: 'pan' | 'select') => uiStore.patch({ tool: x });
  const total = layout?.sheets.length ?? 0;
  const go = (i: number) => uiStore.patch({ sheet: i, selected: [], highlightRow: null, playback: { ...uiStore.get().playback, position: 0, playing: false } });
  return (
    <div className="canvas-bar" role="toolbar" aria-label={t('canvas.layers')} data-single={total <= 1 || undefined}>
      <div className="group">
        <span className="tb-left"><IconButton icon="panelLeft" label={t('panel.show')} onClick={() => togglePanel('left')} testId="show-panel" /></span>
        <IconButton icon="left" label={t('canvas.prev')} disabled={index <= 0} onClick={() => go(index - 1)} testId="prev-sheet" />
        <span className="sheet-label" data-testid="sheet-label">{total ? t('canvas.sheetOf', { n: index + 1, total }) : '—'}</span>
        <IconButton icon="right" label={t('canvas.next')} disabled={index >= total - 1} onClick={() => go(index + 1)} testId="next-sheet" />
      </div>
      <div className="group seg-tools" role="group">
        <IconButton icon="hand" label={t('tool.pan')} active={tool === 'pan'} onClick={() => setTool('pan')} testId="tool-pan" />
        <IconButton icon="pointer" label={t('tool.select')} active={tool === 'select'} onClick={() => setTool('select')} testId="tool-select" />
        <IconButton icon="selectAll" label={t('tool.selectAll')} disabled={!total} onClick={selectAllOnSheet} testId="select-all" />
        <IconButton icon="magnet" label={t('tool.snap', { mm: SNAP_MM })} active={snap} onClick={() => { uiStore.patch({ snap: !snap }); savePrefs(); }} testId="snap" />
      </div>
      <div className="group">
        <IconButton icon="minus" label={t('canvas.zoomOut')} onClick={() => zoom(1 / 1.3)} testId="zoom-out" />
        <span className="zoom" data-testid="zoom">{Math.round(scale * 100)}%</span>
        <IconButton icon="plus" label={t('canvas.zoomIn')} onClick={() => zoom(1.3)} testId="zoom-in" />
        <IconButton icon="fit" label={t('canvas.fit')} onClick={fit} testId="fit" />
      </div>
      <div className="group">
        <details className="layers" open={layersOpen} onToggle={e => { const open = e.currentTarget.open; if (open !== uiStore.get().layersOpen) uiStore.patch({ layersOpen: open }); }}>
          <summary title={t('canvas.layers')} data-testid="layers"><Icon name="layers" /><span className="layers-text">{t('canvas.layers')}</span></summary>
          <div className="layer-menu">
            {LAYERS.map(k => (
              <Check key={k} label={<><i className={`key ${k}`} />{t(`layer.${k}` as Key)}</>} checked={layers[k]} testId={`layer-${k}`}
                onChange={v => { uiStore.patch({ layers: { ...uiStore.get().layers, [k]: v } }); savePrefs(); }} />
            ))}
          </div>
        </details>
        <span className="tb-right"><IconButton icon="panelRight" label={t('panel.showProps')} onClick={() => togglePanel('right')} testId="show-props" /></span>
      </div>
    </div>
  );
}
