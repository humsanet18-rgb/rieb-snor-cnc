import { useMemo } from 'react';
import { formatDuration, useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { IconButton, NumberField, Stat } from '../../components/ui';
import { activeLayout, activeProfile, projectStore, setLayout } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { togglePanel, uiStore } from '../../stores/ui-store';
import type { Layout, PlacedPiece } from '../../types/project';
import { itemBox, layoutStats, moveToSheet, partOf, placeItem, positionPiece, rotatePiece, sheetItems, unionBox, updatePiece } from '../nesting/model';
import { AlignTools } from './AlignTools';

export function PropertiesPanel() {
  const { t } = useT();
  const project = useStore(projectStore, s => s.project);
  const selected = useStore(uiStore, s => s.selected);
  const layout = activeLayout(project);
  const pieces = useMemo(() => {
    const keys = new Set(selected);
    return layout?.sheets.flatMap(s => s.pieces).filter(p => keys.has(p.key)) ?? [];
  }, [layout, selected]);
  return (
    <aside className="side right props" aria-label={t('props.title')} data-testid="props">
      <header className="side-head compact">
        <h2>{t('props.title')}</h2>
        <IconButton icon="panelRight" label={t('panel.hideProps')} onClick={() => togglePanel('right')} testId="hide-props" />
      </header>
      <div className="side-body">
        {layout && pieces.length === 1 ? <PieceProps layout={layout} piece={pieces[0]} />
          : layout && pieces.length > 1 ? <MultiProps layout={layout} pieces={pieces} />
          : <p className="empty-note">{t('props.none')} <small>{t('props.selectHint')}</small></p>}
        {layout && <SheetSummary layout={layout} />}
      </div>
    </aside>
  );
}

function MultiProps({ layout, pieces }: { layout: Layout; pieces: PlacedPiece[] }) {
  const { t } = useT();
  const project = useStore(projectStore, s => s.project);
  const box = useMemo(() => unionBox(pieces.flatMap(p => { const part = partOf(project.designs, p); return part ? [placeItem(part, p)] : []; })), [pieces, project.designs]);
  const manual = project.settings.mode === 'manual' && layout.mode !== 'keep';
  return (
    <div className="prop-group" data-testid="multi-props">
      <div className="prop-title">
        <b>{t('props.multi', { n: pieces.length })}</b>
        <IconButton icon="close" label={t('props.deselect')} onClick={() => uiStore.patch({ selected: [] })} />
      </div>
      {box && (
        <dl className="stats">
          <Stat label={t('props.x')} value={box.x0.toFixed(1)} />
          <Stat label={t('props.y')} value={box.y0.toFixed(1)} />
          <Stat label={t('props.w')} value={`${(box.x1 - box.x0).toFixed(1)} mm`} testId="sel-w" />
          <Stat label={t('props.h')} value={`${(box.y1 - box.y0).toFixed(1)} mm`} testId="sel-h" />
        </dl>
      )}
      {manual ? <AlignTools /> : <p className="hint">{t('props.alignManual')}</p>}
    </div>
  );
}

function PieceProps({ layout, piece }: { layout: Layout; piece: PlacedPiece }) {
  const { t } = useT();
  const project = useStore(projectStore, s => s.project);
  const design = project.designs.find(d => d.id === piece.designId), part = partOf(project.designs, piece);
  const box = useMemo(() => (part ? itemBox(placeItem(part, piece)) : null), [part, piece]);
  if (!design || !part || !box) return null;
  const manual = project.settings.mode === 'manual' && layout.mode !== 'keep';
  const change = (fn: (p: PlacedPiece) => PlacedPiece) => setLayout(updatePiece(layout, piece.key, fn));
  const sheetOf = layout.sheets.findIndex(s => s.pieces.some(p => p.key === piece.key));
  const points = [...part.outers, ...part.holes].reduce((s, c) => s + c.length, 0);
  return (
    <div className="prop-group" data-testid="piece-props">
      <div className="prop-title">
        <b title={design.name}>{design.name}</b>
        <IconButton icon="close" label={t('props.deselect')} onClick={() => uiStore.patch({ selected: [] })} />
      </div>
      <div className="fields">
        <NumberField label={t('props.x')} value={+box.x0.toFixed(2)} disabled={!manual} step={0.5} testId="piece-x"
          onChange={x => { if (x !== null) change(p => positionPiece(part, p, x, box.y0)); }} />
        <NumberField label={t('props.y')} value={+box.y0.toFixed(2)} disabled={!manual} step={0.5} testId="piece-y"
          onChange={y => { if (y !== null) change(p => positionPiece(part, p, box.x0, y)); }} />
        <NumberField label={t('props.rotation')} value={+piece.deg.toFixed(2)} disabled={!manual} step={1} testId="piece-rot"
          onChange={v => { if (v !== null) change(p => rotatePiece(part, p, v)); }} />
        {manual && (
          <div className="field end">
            <button type="button" className="btn" onClick={() => change(p => rotatePiece(part, p, p.deg + 90))} data-testid="rotate-90"><Icon name="rotate" size={16} />{t('props.rotate90')}</button>
          </div>
        )}
      </div>
      {!manual && <p className="hint">{t('props.alignManual')}</p>}
      {manual && layout.sheets.length > 1 && (
        <div className="field">
          <label htmlFor="move-sheet">{t('props.moveSheet')}</label>
          <select id="move-sheet" value={sheetOf} onChange={e => { const n = +e.target.value; setLayout(moveToSheet(layout, piece.key, n)); uiStore.patch({ sheet: n }); }}>
            {layout.sheets.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
          </select>
        </div>
      )}
      <dl className="stats">
        <Stat label={t('props.w')} value={`${(box.x1 - box.x0).toFixed(1)} mm`} />
        <Stat label={t('props.h')} value={`${(box.y1 - box.y0).toFixed(1)} mm`} />
        <Stat label={t('props.area')} value={`${(part.area / 100).toFixed(1)} ${t('unit.cm2')}`} />
        <Stat label={t('props.outers')} value={part.outers.length} />
        <Stat label={t('props.holes')} value={part.holes.length} />
        <Stat label={t('props.points')} value={points} />
        <Stat label={t('props.piece')} value={piece.partIndex + 1} />
        <Stat label={t('props.copy')} value={piece.copy + 1} />
      </dl>
    </div>
  );
}

function SheetSummary({ layout }: { layout: Layout }) {
  const { t, lang } = useT();
  const project = useStore(projectStore, s => s.project);
  const index = useStore(uiStore, s => Math.min(s.sheet, Math.max(0, layout.sheets.length - 1)));
  const paths = useStore(uiStore, s => s.toolpaths);
  const feed = useStore(projectStore, s => activeProfile(s).feed);
  const stats = useMemo(() => layoutStats(layout, project.designs), [layout, project.designs]);
  const sheet = layout.sheets[index], sp = paths?.sheets[index];
  const cut = paths?.sheets.reduce((s, x) => s + x.length, 0) ?? 0;
  const strip = useMemo(() => {
    if (!sheet || layout.mode === 'keep') return null;
    const items = sheetItems(sheet, project.designs);
    if (!items.length) return null;
    const boxes = items.map(itemBox);
    if (layout.fill === 'columns') {
      const left = Math.floor((layout.sheetW - Math.max(...boxes.map(b => b.x1))) / 10);
      return left >= 5 ? `${left} × ${layout.sheetH / 10} cm` : null;
    }
    const left = Math.floor((layout.sheetH - Math.max(...boxes.map(b => b.y1))) / 10);
    return left >= 5 ? `${layout.sheetW / 10} × ${left} cm` : null;
  }, [sheet, layout, project.designs]);
  return (
    <>
      <h3 className="mini-head">{t('props.job')} <span className="best-label">{t('nest.best')} #{layout.number}</span></h3>
      <dl className="stats" data-testid="layout-stats">
        <Stat label={t('props.sheets')} value={stats.sheets} testId="stat-sheets" />
        <Stat label={t('props.pieces')} value={stats.pieces} testId="stat-pieces" />
        <Stat label={t('props.usedArea')} value={`${(stats.usedArea / 1e6).toFixed(3)} m²`} />
        <Stat label={t('props.utilization')} value={`${(stats.utilization * 100).toFixed(1)}%`} testId="stat-util" />
        <Stat label={t('props.waste')} value={`${(stats.waste * 100).toFixed(1)}%`} />
        <Stat label={t('props.cut')} value={`${(cut / 1000).toFixed(2)} ${t('unit.m')}`} testId="stat-cut" />
      </dl>
      {sheet && sp && (
        <>
          <h3 className="mini-head">{t('props.sheet')} {index + 1}</h3>
          <dl className="stats">
            <Stat label={t('props.pieces')} value={sheet.pieces.length} />
            <Stat label={t('path.length')} value={`${(sp.length / 1000).toFixed(2)} ${t('unit.m')}`} />
            <Stat label={t('path.time')} value={feed > 0 ? formatDuration(lang, sp.length / feed) : '—'} />
            <Stat label={t('props.utilization')} value={`${(sp.area / (layout.sheetW * layout.sheetH) * 100).toFixed(1)}%`} />
            {strip && <Stat label={t('props.leftover')} value={strip} testId="leftover" />}
          </dl>
        </>
      )}
    </>
  );
}
