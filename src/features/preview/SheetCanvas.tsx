import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { addSample } from '../../app/actions';
import { pickSvgFiles } from '../../app/FilePicker';
import { useT, validationText } from '../../app/i18n';
import { Icon } from '../../components/icons';
import type { BBox, Part, Point, Polygon } from '../../types/geometry';
import type { Design, Layout, PlacedPiece } from '../../types/project';
import { activeLayout, activeProfile, projectStore, setLayout } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { go, uiStore } from '../../stores/ui-store';
import { itemBox, movePieces, partOf, placeItem } from '../nesting/model';
import { CanvasToolbar, type Tool } from './CanvasToolbar';
import { PlaybackBar } from './PlaybackBar';
import { cumulativeLengths, fitView, pointAlong, RULER, tickStep, ticks, zoomAt, type View } from './view';

const contourD = (P: Polygon) => {
  let d = 'M';
  for (let i = 0; i < P.length; i++) d += (i ? 'L' : '') + P[i][0].toFixed(2) + ' ' + P[i][1].toFixed(2);
  return d + 'z';
};
const lineD = (P: Polygon) => {
  let d = '';
  for (let i = 0; i < P.length; i++) d += (i ? 'L' : 'M') + P[i][0] + ' ' + P[i][1];
  return d;
};

const Piece = memo(function Piece({ part, piece, colour, selected, label, showOrder, fontSize, dx, dy, dim }: {
  part: Part; piece: PlacedPiece; colour: number; selected: boolean; label: number; showOrder: boolean; fontSize: number; dx: number; dy: number; dim: boolean;
}) {
  const item = useMemo(() => placeItem(part, piece), [part, piece]);
  const d = useMemo(() => [...item.outers, ...item.holes].map(contourD).join(''), [item]);
  const b = useMemo(() => itemBox(item), [item]);
  return (
    <g transform={dx || dy ? `translate(${dx} ${dy})` : undefined} className={`piece d${colour}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`} data-key={piece.key}>
      <path d={d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
      {showOrder && label >= 0 && <text x={(b.x0 + b.x1) / 2} y={(b.y0 + b.y1) / 2} fontSize={fontSize} textAnchor="middle" dominantBaseline="central">{label + 1}</text>}
    </g>
  );
});

function Rulers({ view, width, height }: { view: View; width: number; height: number }) {
  const step = tickStep(view.s, 46);
  const xs = ticks(-view.x / view.s, (width - view.x) / view.s, step), ys = ticks(-view.y / view.s, (height - view.y) / view.s, step);
  return (
    <g className="rulers" aria-hidden="true">
      <rect x={0} y={0} width={width} height={RULER} />
      <rect x={0} y={0} width={RULER} height={height} />
      {xs.map(v => {
        const px = view.x + v * view.s;
        return px < RULER ? null : <g key={v}><path d={`M${px} ${RULER - 7}V${RULER}`} /><text x={px + 3} y={14}>{v}</text></g>;
      })}
      {ys.map(v => {
        const py = view.y + v * view.s;
        return py < RULER ? null : <g key={v}><path d={`M${RULER - 7} ${py}H${RULER}`} /><text x={13} y={py + 3} transform={`rotate(-90 13 ${py + 3})`}>{v}</text></g>;
      })}
      <rect className="corner" x={0} y={0} width={RULER} height={RULER} />
    </g>
  );
}

function Grid({ layout, view }: { layout: Layout; view: View }) {
  const step = tickStep(view.s, 24);
  const d = useMemo(() => {
    let out = '';
    for (const x of ticks(step, layout.sheetW - 1, step)) out += `M${x} 0V${layout.sheetH}`;
    for (const y of ticks(step, layout.sheetH - 1, step)) out += `M0 ${y}H${layout.sheetW}`;
    return out;
  }, [layout.sheetW, layout.sheetH, step]);
  return <path className="grid" d={d} vectorEffect="non-scaling-stroke" />;
}

const union = (list: BBox[]): BBox | null => list.length
  ? { x0: Math.min(...list.map(b => b.x0)), y0: Math.min(...list.map(b => b.y0)), x1: Math.max(...list.map(b => b.x1)), y1: Math.max(...list.map(b => b.y1)) }
  : null;

/** Width above and height to the right of a box, with the numbers in mm. */
function Dimensions({ b, px }: { b: BBox; px: (n: number) => number }) {
  const off = px(16), tick = px(5), fs = px(11.5);
  const w = b.x1 - b.x0, h = b.y1 - b.y0, y = b.y0 - off, x = b.x1 + off;
  return (
    <g className="dims" data-testid="dims">
      <path d={`M${b.x0} ${y}H${b.x1}M${b.x0} ${y - tick}V${y + tick}M${b.x1} ${y - tick}V${y + tick}M${x} ${b.y0}V${b.y1}M${x - tick} ${b.y0}H${x + tick}M${x - tick} ${b.y1}H${x + tick}`} vectorEffect="non-scaling-stroke" />
      <text x={(b.x0 + b.x1) / 2} y={y - px(5)} fontSize={fs} textAnchor="middle">{w.toFixed(1)} mm</text>
      <text x={x + px(5)} y={(b.y0 + b.y1) / 2} fontSize={fs} transform={`rotate(90 ${x + px(5)} ${(b.y0 + b.y1) / 2})`} textAnchor="middle">{h.toFixed(1)} mm</text>
    </g>
  );
}

/** Chevrons along the path in the direction the wire travels, spaced for the zoom level. */
function chevronsD(marks: [number, number, number][], size: number): string {
  let d = '';
  for (const [x, y, a] of marks) {
    const c = Math.cos(a), s = Math.sin(a), at = (u: number, v: number) => `${(x + u * c - v * s).toFixed(2)} ${(y + u * s + v * c).toFixed(2)}`;
    d += `M${at(-size * 0.6, -size * 0.7)}L${at(size * 0.5, 0)}L${at(-size * 0.6, size * 0.7)}`;
  }
  return d;
}

interface Drag { keys: string[]; startX: number; startY: number; dx: number; dy: number; moved: boolean }
interface Marquee { x0: number; y0: number; x1: number; y1: number; add: boolean }

export function SheetCanvas() {
  const { t, lang } = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ s: 1, x: 40, y: 40 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [tool, setTool] = useState<Tool>('pan');
  const project = useStore(projectStore, s => s.project);
  const profile = useStore(projectStore, activeProfile);
  const layout = activeLayout(project);
  const sheetIndex = useStore(uiStore, s => s.sheet);
  const selected = useStore(uiStore, s => s.selected);
  const layers = useStore(uiStore, s => s.layers);
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const position = useStore(uiStore, s => s.playback.position);
  const flash = useStore(uiStore, s => s.flash);
  const highlight = useStore(uiStore, s => s.highlightRow);
  const sheet = layout?.sheets[Math.min(sheetIndex, layout.sheets.length - 1)];
  const index = layout ? Math.min(sheetIndex, Math.max(0, layout.sheets.length - 1)) : 0;
  const stroke = paths?.sheets[index]?.stroke;
  const manual = project.settings.mode === 'manual' && layout?.mode !== 'keep';
  const sheetW = layout?.sheetW ?? project.settings.sheetW, sheetH = layout?.sheetH ?? project.settings.sheetH;
  const chosen = useMemo(() => new Set(selected), [selected]);

  const fit = useCallback(() => setView(fitView(size.w, size.h, sheetW, sheetH)), [size, sheetW, sheetH]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(fit, [fit]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // React registers wheel listeners as passive, and zooming must stop the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView(v => zoomAt(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    if (!flash) return;
    setView(fitView(size.w, size.h, sheetW, sheetH));
    const id = setTimeout(() => uiStore.patch({ flash: null }), 2500);
    return () => clearTimeout(id);
  }, [flash, size, sheetW, sheetH]);

  const boxes = useMemo(() => sheet?.pieces.map(p => {
    const part = partOf(project.designs, p);
    return part ? itemBox(placeItem(part, p)) : null;
  }) ?? [], [sheet, project.designs]);
  const toMm = (px: number, py: number): Point => [(px - view.x) / view.s, (py - view.y) / view.s];

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinch = useRef(0);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
      pan.current = null; setDrag(null); setMarquee(null);
      return;
    }
    const key = (e.target as Element).closest('[data-key]')?.getAttribute('data-key') ?? null;
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (key && e.button === 0) {
      if (add) { uiStore.patch({ selected: chosen.has(key) ? selected.filter(k => k !== key) : [...selected, key] }); return; }
      const keys = chosen.has(key) ? selected : [key];
      if (!chosen.has(key)) uiStore.patch({ selected: keys });
      if (manual) { setDrag({ keys, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false }); return; }
    }
    if (!key && e.button === 0 && (tool === 'select' || e.shiftKey)) {
      const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      setMarquee({ x0: x, y0: y, x1: x, y1: y, add });
      return;
    }
    pan.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (readout.current) readout.current.textContent = `X ${((px - view.x) / view.s).toFixed(1)}  Y ${((py - view.y) / view.s).toFixed(1)} mm`;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      setView(v => zoomAt(v, d / pinch.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top));
      pinch.current = d;
      return;
    }
    if (marquee) setMarquee({ ...marquee, x1: px, y1: py });
    else if (drag) {
      const dx = (e.clientX - drag.startX) / view.s, dy = (e.clientY - drag.startY) / view.s;
      setDrag({ ...drag, dx, dy, moved: drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3 });
    } else if (pan.current) {
      const dx = e.clientX - pan.current.x, dy = e.clientY - pan.current.y;
      pan.current = { x: e.clientX, y: e.clientY, moved: pan.current.moved || Math.hypot(dx, dy) > 2 };
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = 0;
    if (marquee) {
      const [ax, ay] = toMm(Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1));
      const [bx, by] = toMm(Math.max(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1));
      const hit = sheet?.pieces.filter((_, i) => { const b = boxes[i]; return b && b.x1 >= ax && b.x0 <= bx && b.y1 >= ay && b.y0 <= by; }).map(p => p.key) ?? [];
      uiStore.patch({ selected: marquee.add ? [...new Set([...selected, ...hit])] : hit });
      setMarquee(null);
    } else if (drag) {
      if (drag.moved && layout) setLayout(movePieces(layout, drag.keys, drag.dx, drag.dy));
      setDrag(null);
    } else if (pan.current && !pan.current.moved && (e.target as Element).closest('[data-sheet]')) {
      if (!(e.target as Element).closest('[data-key]') && !(e.shiftKey || e.ctrlKey || e.metaKey)) uiStore.patch({ selected: [] });
    }
    pan.current = null;
  };

  const orderOf = useMemo(() => new Map(stroke?.order.map((item, i) => [item, i]) ?? []), [stroke]);
  const bridgesD = useMemo(() => stroke?.bridges.map(b => `M${b[0][0]} ${b[0][1]}L${b[1][0]} ${b[1][1]}`).join('') ?? '', [stroke]);
  const pathD = useMemo(() => (stroke ? lineD(stroke.path) : ''), [stroke]);
  const cumulative = useMemo(() => (stroke ? cumulativeLengths(stroke.path) : []), [stroke]);
  const total = cumulative[cumulative.length - 1] ?? 0;
  const head = stroke && position > 0 ? pointAlong(stroke.path, cumulative, position) : null;
  const spacing = tickStep(view.s, 110);
  const marks = useMemo(() => {
    if (!stroke || total <= 0) return [];
    const step = Math.max(spacing, total / 500), out: [number, number, number][] = [];
    for (let d = step / 2; d < total; d += step) {
      const a = pointAlong(stroke.path, cumulative, Math.max(0, d - 0.5)), b = pointAlong(stroke.path, cumulative, Math.min(total, d + 0.5));
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[1] - a[1], b[0] - a[0])]);
    }
    return out;
  }, [stroke, cumulative, total, spacing]);
  const rows = useMemo(() => stroke?.rows?.map(r => union(r.map(i => boxes[i]).filter((b): b is BBox => !!b))) ?? [], [stroke, boxes]);
  const highlightKeys = useMemo(() => (highlight !== null && stroke?.rows?.[highlight] && sheet ? new Set(stroke.rows[highlight].map(i => sheet.pieces[i]?.key)) : null), [highlight, stroke, sheet]);
  const sheetIssues = useMemo(() => paths?.issues.filter(i => i.sheet === index && i.at) ?? [], [paths, index]);
  const follow = useStore(uiStore, s => s.section === 'editor' && s.follow);
  const headX = head?.[0], headY = head?.[1];
  useEffect(() => {
    if (!follow || headX === undefined || headY === undefined) return;
    const close = fitView(size.w, size.h, sheetW, sheetH).s * 3;
    setView(v => {
      const s = Math.max(v.s, close);
      return { s, x: size.w / 2 - headX * s, y: size.h / 2 - headY * s };
    });
  }, [follow, headX, headY, size, sheetW, sheetH]);
  const colours = useMemo(() => new Map(project.designs.map((d: Design, i) => [d.id, i % 6])), [project.designs]);
  const px = (n: number) => n / view.s;

  const selBox = useMemo(() => {
    if (!sheet || !chosen.size) return null;
    const b = union(sheet.pieces.flatMap((p, i) => (chosen.has(p.key) && boxes[i] ? [boxes[i]!] : [])));
    return b && drag?.moved ? { x0: b.x0 + drag.dx, x1: b.x1 + drag.dx, y0: b.y0 + drag.dy, y1: b.y1 + drag.dy } : b;
  }, [sheet, chosen, boxes, drag]);
  const startPoint: Point | null = sheet ? ('box' in sheet.start ? [sheet.start.box.x + sheet.start.box.w / 2, sheet.start.box.y + sheet.start.box.h / 2] : [sheet.start.x, sheet.start.y]) : null;
  const end = stroke?.path.length ? stroke.path[stroke.path.length - 1] : null;
  const endApart = end && stroke && Math.hypot(end[0] - stroke.path[0][0], end[1] - stroke.path[0][1]) > 1;
  const errors = paths ? paths.issues.filter(i => i.severity === 'error').length : 0;

  return (
    <section className="canvas-area" aria-label={t('canvas.preview', { w: sheetW, h: sheetH })}>
      <CanvasToolbar layout={layout} index={index} fit={fit} tool={tool} setTool={setTool}
        zoom={f => setView(v => zoomAt(v, f, size.w / 2, size.h / 2))} scale={view.s} />
      <div className={'canvas-wrap tool-' + tool} ref={wrap} data-testid="canvas">
        <svg width={size.w} height={size.h} role="img" aria-label={t('canvas.preview', { w: sheetW, h: sheetH })}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>
            <rect className="foam" data-sheet="1" width={sheetW} height={sheetH} vectorEffect="non-scaling-stroke" data-testid="sheet-rect" />
            {layers.grid && layout && <Grid layout={layout} view={view} />}
            {layers.zones && layout?.zones.map((z, i) => <rect key={i} className="zone" x={z.x} y={z.y} width={z.w} height={z.h} vectorEffect="non-scaling-stroke" data-testid="zone" />)}
            {layers.rows && rows.map((b, n) => b && (
              <g key={n} className={'row-band' + (highlight === n ? ' on' : highlight !== null ? ' off' : '')} data-testid="row-band">
                <rect x={b.x0 - px(6)} y={b.y0 - px(6)} width={b.x1 - b.x0 + px(12)} height={b.y1 - b.y0 + px(12)} rx={px(4)} vectorEffect="non-scaling-stroke" />
                <text x={b.x1 + px(12)} y={(b.y0 + b.y1) / 2} fontSize={px(11)} dominantBaseline="central">
                  {t(project.settings.cut.order === 'columns' ? 'canvas.col' : 'canvas.row', { n: n + 1, count: stroke?.rows?.[n].length ?? 0 })}
                </text>
              </g>
            ))}
            {layers.designs && sheet?.pieces.map((p, i) => {
              const part = partOf(project.designs, p), moving = drag?.moved && drag.keys.includes(p.key);
              return part ? (
                <Piece key={p.key} part={part} piece={p} colour={colours.get(p.designId) ?? 0} selected={chosen.has(p.key)} label={orderOf.get(i) ?? -1}
                  showOrder={layers.order} fontSize={px(13)} dx={moving ? drag.dx : 0} dy={moving ? drag.dy : 0} dim={!!highlightKeys && !highlightKeys.has(p.key)} />
              ) : null;
            })}
            {layers.toolpath && <path className="wire" d={pathD} vectorEffect="non-scaling-stroke" data-testid="toolpath" />}
            {layers.toolpath && layers.direction && marks.length > 0 && <path className="arrows" d={chevronsD(marks, px(5))} vectorEffect="non-scaling-stroke" data-testid="direction" />}
            {layers.bridges && <path className="bridge" d={bridgesD} vectorEffect="non-scaling-stroke" data-testid="bridges" />}
            {head && <path className="played" d={pathD} strokeDasharray={`${position} ${total + 1}`} data-testid="played" style={{ strokeWidth: px(2) }} />}
            {layers.start && sheet && ('box' in sheet.start
              ? <rect className="start" x={sheet.start.box.x} y={sheet.start.box.y} width={sheet.start.box.w} height={sheet.start.box.h} vectorEffect="non-scaling-stroke" data-testid="start" />
              : <circle className="start" cx={sheet.start.x} cy={sheet.start.y} r={px(5)} vectorEffect="non-scaling-stroke" data-testid="start" />)}
            {layers.start && stroke && startPoint && <text className="marker-label start-label" x={startPoint[0] + px(10)} y={startPoint[1] + px(16)} fontSize={px(10.5)}>{t('canvas.start')}</text>}
            {layers.start && endApart && end && (
              <g className="end-mark" data-testid="end">
                <rect x={end[0] - px(4)} y={end[1] - px(4)} width={px(8)} height={px(8)} vectorEffect="non-scaling-stroke" />
                <text className="marker-label" x={end[0] + px(8)} y={end[1] - px(8)} fontSize={px(10.5)}>{t('canvas.end')}</text>
              </g>
            )}
            {layers.issues && sheetIssues.map((i, n) => (
              <g key={n} className={'issue ' + i.severity} transform={`translate(${i.at![0]} ${i.at![1]})`} data-testid="issue-mark">
                <title>{validationText(lang, i.code, i.detail)}</title>
                <path d={`M0 ${-px(11)}L${px(10)} ${px(7)}H${-px(10)}z`} vectorEffect="non-scaling-stroke" />
                <text y={px(4.5)} fontSize={px(10)} textAnchor="middle">!</text>
              </g>
            ))}
            {selBox && (
              <>
                <rect className="sel-box" x={selBox.x0} y={selBox.y0} width={selBox.x1 - selBox.x0} height={selBox.y1 - selBox.y0} vectorEffect="non-scaling-stroke" />
                {layers.dims && <Dimensions b={selBox} px={px} />}
              </>
            )}
            <circle className="origin" r={px(4)} />
            {head && <circle className="head" cx={head[0]} cy={head[1]} r={px(5)} data-testid="head" />}
            {flash && <circle className="flash" cx={flash[0]} cy={flash[1]} r={px(24)} vectorEffect="non-scaling-stroke" />}
          </g>
          {marquee && <rect className="marquee" x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} />}
          <Rulers view={view} width={size.w} height={size.h} />
        </svg>
        {!project.designs.length && <EmptyState />}
        {project.designs.length > 0 && !layout && (
          <div className="canvas-note">
            <span>{t('canvas.noLayout')}</span>
            <button type="button" className="btn primary" onClick={() => go('nest')}>{t('canvas.goNest')}</button>
          </div>
        )}
      </div>
      {stroke && <PlaybackBar total={total} />}
      <footer className="statusbar" data-testid="statusbar">
        <span className="sb cursor"><Icon name="pointer" size={14} /><span ref={readout} data-testid="readout">X — Y —</span></span>
        <span className="sb">{t('status.zoom')} <b>{Math.round(view.s * 100)}%</b></span>
        <span className="sb hide-sm">{t('status.sheetSize')} <b>{sheetW} × {sheetH} mm</b></span>
        <span className="sb" data-testid="status-selection">{selected.length ? t('status.selection', { n: selected.length }) : t('status.none')}</span>
        <span className={'sb path-state ' + (busy ? 'busy' : !paths ? '' : errors ? 'bad' : 'ok')} data-testid="status-path">
          <Icon name={busy ? 'history' : !paths ? 'info' : errors ? 'error' : 'ok'} size={14} />
          {busy ? t('status.busy') : !paths ? t('status.noPath') : errors ? t('status.errors', { n: errors }) : t('status.ready')}
        </span>
        <span className="sb hide-sm sb-end" title={t('status.profile')}><Icon name="machine" size={14} />{profile.name} · F{profile.feed} S{profile.power}</span>
      </footer>
    </section>
  );
}

function EmptyState() {
  const { t } = useT();
  return (
    <div className="empty" data-testid="empty-canvas">
      <span className="empty-icon"><Icon name="nest" size={28} /></span>
      <h2>{t('canvas.empty.title')}</h2>
      <p>{t('canvas.empty.body')}</p>
      <div className="btn-row center">
        <button type="button" className="btn primary" onClick={pickSvgFiles}><Icon name="upload" size={16} />{t('canvas.empty.import')}</button>
        <button type="button" className="btn" onClick={() => go('text')}><Icon name="text" size={16} />{t('canvas.empty.text')}</button>
        <button type="button" className="btn" onClick={() => void addSample('block-letters.svg')}>{t('canvas.empty.sample')}</button>
      </div>
    </div>
  );
}
