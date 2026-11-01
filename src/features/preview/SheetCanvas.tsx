import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../app/i18n';
import type { Part, Polygon } from '../../types/geometry';
import type { Design, Layout, PlacedPiece } from '../../types/project';
import { activeLayout, projectStore, setLayout } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import { itemBox, partOf, placeItem, updatePiece } from '../nesting/model';
import { CanvasToolbar } from './CanvasToolbar';
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

const Piece = memo(function Piece({ part, piece, colour, selected, label, showOrder, fontSize, dx, dy }: {
  part: Part; piece: PlacedPiece; colour: number; selected: boolean; label: number; showOrder: boolean; fontSize: number; dx: number; dy: number;
}) {
  const item = useMemo(() => placeItem(part, piece), [part, piece]);
  const d = useMemo(() => [...item.outers, ...item.holes].map(contourD).join(''), [item]);
  const b = useMemo(() => itemBox(item), [item]);
  return (
    <g transform={dx || dy ? `translate(${dx} ${dy})` : undefined} className={`piece d${colour}${selected ? ' selected' : ''}`} data-key={piece.key}>
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

interface Drag { key: string; startX: number; startY: number; dx: number; dy: number; moved: boolean }

export function SheetCanvas() {
  const { t } = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ s: 1, x: 40, y: 40 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const project = useStore(projectStore, s => s.project);
  const layout = activeLayout(project);
  const sheetIndex = useStore(uiStore, s => s.sheet);
  const selected = useStore(uiStore, s => s.selected);
  const layers = useStore(uiStore, s => s.layers);
  const paths = useStore(uiStore, s => s.toolpaths);
  const position = useStore(uiStore, s => s.playback.position);
  const flash = useStore(uiStore, s => s.flash);
  const sheet = layout?.sheets[Math.min(sheetIndex, layout.sheets.length - 1)];
  const index = layout ? Math.min(sheetIndex, Math.max(0, layout.sheets.length - 1)) : 0;
  const stroke = paths?.sheets[index]?.stroke;
  const manual = project.settings.mode === 'manual' && layout?.mode !== 'keep';
  const sheetW = layout?.sheetW ?? project.settings.sheetW, sheetH = layout?.sheetH ?? project.settings.sheetH;

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

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinch = useRef(0);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
      pan.current = null; setDrag(null);
      return;
    }
    const key = (e.target as Element).closest('[data-key]')?.getAttribute('data-key') ?? null;
    if (key && e.button === 0) {
      uiStore.patch({ selected: key });
      if (manual) { setDrag({ key, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false }); return; }
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
    if (drag) {
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
    if (drag) {
      if (drag.moved && layout) {
        setLayout(updatePiece(layout, drag.key, p => ({ ...p, tx: +(p.tx + drag.dx).toFixed(2), ty: +(p.ty + drag.dy).toFixed(2) })));
      }
      setDrag(null);
    } else if (pan.current && !pan.current.moved && (e.target as Element).closest('[data-sheet]')) {
      if (!(e.target as Element).closest('[data-key]')) uiStore.patch({ selected: null });
    }
    pan.current = null;
  };

  const orderOf = useMemo(() => new Map(stroke?.order.map((item, i) => [item, i]) ?? []), [stroke]);
  const bridgesD = useMemo(() => stroke?.bridges.map(b => `M${b[0][0]} ${b[0][1]}L${b[1][0]} ${b[1][1]}`).join('') ?? '', [stroke]);
  const pathD = useMemo(() => (stroke ? lineD(stroke.path) : ''), [stroke]);
  const cumulative = useMemo(() => (stroke ? cumulativeLengths(stroke.path) : []), [stroke]);
  const total = cumulative[cumulative.length - 1] ?? 0;
  const head = stroke && position > 0 ? pointAlong(stroke.path, cumulative, position) : null;
  const follow = useStore(uiStore, s => s.view === 'editor' && s.follow);
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

  return (
    <section className="canvas-area" aria-label={t('canvas.preview', { w: sheetW, h: sheetH })}>
      <CanvasToolbar layout={layout} index={index} fit={fit}
        zoom={f => setView(v => zoomAt(v, f, size.w / 2, size.h / 2))} scale={view.s} />
      <div className="canvas-wrap" ref={wrap} data-testid="canvas">
        <svg width={size.w} height={size.h} role="img" aria-label={t('canvas.preview', { w: sheetW, h: sheetH })}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>
            <rect className="foam" data-sheet="1" width={sheetW} height={sheetH} vectorEffect="non-scaling-stroke" data-testid="sheet-rect" />
            {layers.grid && layout && <Grid layout={layout} view={view} />}
            {layers.zones && layout?.zones.map((z, i) => <rect key={i} className="zone" x={z.x} y={z.y} width={z.w} height={z.h} vectorEffect="non-scaling-stroke" data-testid="zone" />)}
            {layers.designs && sheet?.pieces.map((p, i) => {
              const part = partOf(project.designs, p);
              return part ? (
                <Piece key={p.key} part={part} piece={p} colour={colours.get(p.designId) ?? 0} selected={selected === p.key} label={orderOf.get(i) ?? -1}
                  showOrder={layers.order} fontSize={px(13)} dx={drag?.key === p.key ? drag.dx : 0} dy={drag?.key === p.key ? drag.dy : 0} />
              ) : null;
            })}
            {layers.toolpath && <path className="wire" d={pathD} vectorEffect="non-scaling-stroke" data-testid="toolpath" />}
            {layers.bridges && <path className="bridge" d={bridgesD} vectorEffect="non-scaling-stroke" data-testid="bridges" />}
            {head && <path className="played" d={pathD} strokeDasharray={`${position} ${total + 1}`} data-testid="played" style={{ strokeWidth: px(2) }} />}
            {layers.start && sheet && ('box' in sheet.start
              ? <rect className="start" x={sheet.start.box.x} y={sheet.start.box.y} width={sheet.start.box.w} height={sheet.start.box.h} vectorEffect="non-scaling-stroke" data-testid="start" />
              : <circle className="start" cx={sheet.start.x} cy={sheet.start.y} r={px(5)} vectorEffect="non-scaling-stroke" data-testid="start" />)}
            <circle className="origin" r={px(4)} />
            {head && <circle className="head" cx={head[0]} cy={head[1]} r={px(5)} data-testid="head" />}
            {flash && <circle className="flash" cx={flash[0]} cy={flash[1]} r={px(24)} vectorEffect="non-scaling-stroke" />}
          </g>
          <Rulers view={view} width={size.w} height={size.h} />
        </svg>
        <span className="readout" ref={readout} data-testid="readout">X — Y —</span>
        {!project.designs.length && <EmptyState />}
        {project.designs.length > 0 && !layout && <p className="canvas-note">{t('canvas.noLayout')}</p>}
      </div>
      {stroke && <PlaybackBar total={total} />}
    </section>
  );
}

function EmptyState() {
  const { t } = useT();
  return (
    <div className="empty">
      <h2>{t('canvas.empty.title')}</h2>
      <p>{t('canvas.empty.body')}</p>
    </div>
  );
}
