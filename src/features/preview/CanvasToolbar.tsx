import { useT, type Key } from '../../app/i18n';
import { Check, IconButton } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useStore } from '../../stores/store';
import { savePrefs, uiStore, type Layers } from '../../stores/ui-store';
import type { Layout } from '../../types/project';

const LAYERS: (keyof Layers)[] = ['designs', 'toolpath', 'bridges', 'zones', 'start', 'grid', 'order'];

export function CanvasToolbar({ layout, index, fit, zoom, scale }: { layout: Layout | null; index: number; fit: () => void; zoom: (f: number) => void; scale: number }) {
  const { t } = useT();
  const layers = useStore(uiStore, s => s.layers);
  const total = layout?.sheets.length ?? 0;
  const go = (i: number) => uiStore.patch({ sheet: i, selected: null, playback: { ...uiStore.get().playback, position: 0, playing: false } });
  return (
    <div className="canvas-bar">
      <div className="group">
        <IconButton icon="left" label={t('canvas.prev')} disabled={index <= 0} onClick={() => go(index - 1)} testId="prev-sheet" />
        <span data-testid="sheet-label">{total ? t('canvas.sheetOf', { n: index + 1, total }) : '—'}</span>
        <IconButton icon="right" label={t('canvas.next')} disabled={index >= total - 1} onClick={() => go(index + 1)} testId="next-sheet" />
      </div>
      <div className="group">
        <IconButton icon="minus" label={t('canvas.zoomOut')} onClick={() => zoom(1 / 1.3)} testId="zoom-out" />
        <span className="zoom" data-testid="zoom">{Math.round(scale * 100)}%</span>
        <IconButton icon="plus" label={t('canvas.zoomIn')} onClick={() => zoom(1.3)} testId="zoom-in" />
        <IconButton icon="fit" label={t('canvas.fit')} onClick={fit} testId="fit" />
      </div>
      <details className="group layers">
        <summary title={t('canvas.layers')} data-testid="layers"><Icon name="layers" />{t('canvas.layers')}</summary>
        <div className="layer-menu">
          {LAYERS.map(k => (
            <Check key={k} label={<><i className={`key ${k}`} />{t(`layer.${k}` as Key)}</>} checked={layers[k]} testId={`layer-${k}`}
              onChange={v => { uiStore.patch({ layers: { ...uiStore.get().layers, [k]: v } }); savePrefs(); }} />
          ))}
        </div>
      </details>
    </div>
  );
}
