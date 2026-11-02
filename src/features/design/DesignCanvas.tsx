import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useT } from '../../app/i18n';
import { editable, flatOf, itemBBox, pathItem, rotateAbout, scaleAbout, selectionBBox, translate, union, worldPaths, placed } from '../../engines/vector-engine/document';
import { distanceToPolyline, pathData, pointInSubpaths, simplifyPoints, smoothNodes } from '../../engines/vector-engine/path';
import { ellipse, grid, polygon, polyline, rectangle, segment, spiral, star } from '../../engines/vector-engine/shapes';
import type { ShapeKind, Subpath, VectorDocument, VItem } from '../../engines/vector-engine/types';
import { projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import type { BBox, Matrix, Point } from '../../types/geometry';
import { addItem, docOf, transformSelection, zoomBy } from './actions';
import { designStore, type DesignTool } from './design-store';
import { MenuList } from './MenuBar';

const RULER = 22;
const HANDLE = 8;
type Handle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Handle positions as fractions of the box, clockwise from the top-left corner. */
const HANDLES: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
const CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
const SHAPES: Partial<Record<DesignTool, ShapeKind>> = { rect: 'rect', ellipse: 'ellipse', polygon: 'polygon', star: 'star', spiral: 'spiral', grid: 'grid' };
const MENU = ['edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '|', 'object.group', 'object.ungroup', 'path.combine', 'path.breakApart', '|', 'arrange.front', 'arrange.back', 'arrange.centerPage', '|', 'cnc.send'];

type Drag =
  | { kind: 'move'; start: Point; moved: boolean; box: BBox }
  | { kind: 'scale'; handle: Handle; box: BBox }
  | { kind: 'rotate'; c: Point; a0: number }
  | { kind: 'marquee' | 'zoom'; start: Point; additive: boolean }
  | { kind: 'pan'; sx: number; sy: number; pan: { x: number; y: number } }
  | { kind: 'shape'; tool: DesignTool; start: Point }
  | { kind: 'freehand'; pts: Point[] };

/** Every visible item, topmost first, with whether it may be picked. */
function* pickOrder(doc: VectorDocument): Generator<VItem> {
  for (const layer of [...doc.layers].reverse()) {
    if (!layer.visible || layer.locked) continue;
    for (const item of [...layer.items].reverse()) if (!item.hidden && !item.locked) yield item;
  }
}

function hit(doc: VectorDocument, p: Point, tol: number): string | null {
  for (const item of pickOrder(doc)) {
    const b = itemBBox(item);
    if (!b || p[0] < b.x0 - tol || p[0] > b.x1 + tol || p[1] < b.y0 - tol || p[1] > b.y1 + tol) continue;
    for (const w of worldPaths(item)) {
      const polys = flatOf(w.item);
      const closed = polys.filter((_, k) => w.subpaths[k].closed);
      if (w.item.style.fill && closed.length && pointInSubpaths(p, closed)) return item.id;
      if (polys.some((poly, k) => distanceToPolyline(p, poly, w.subpaths[k].closed) <= tol)) return item.id;
    }
  }
  return null;
}

function draft(tool: DesignTool, a: Point, b: Point, square: boolean): Subpath[] {
  let w = b[0] - a[0], h = b[1] - a[1];
  if (square && tool !== 'line') { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
  if (tool === 'line') {
    if (square) { const ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(w, h); return segment(a, [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang)]); }
    return segment(a, b);
  }
  const x = Math.min(a[0], a[0] + w), y = Math.min(a[1], a[1] + h), W = Math.abs(w), H = Math.abs(h);
  const s = designStore.get();
  switch (tool) {
    case 'ellipse': return ellipse(x, y, W, H);
    case 'polygon': return polygon(x, y, W, H, s.sides);
    case 'star': return star(x, y, W, H, s.points, s.inner);
    case 'spiral': return spiral(x, y, W, H, s.turns);
    case 'grid': return grid(x, y, W, H, s.cols, s.rows);
    default: return rectangle(x, y, W, H);
  }
}

const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

function Ruler({ axis, from, zoom, length, cursor }: { axis: 'x' | 'y'; from: number; zoom: number; length: number; cursor: number | null }) {
  const step = NICE.find(n => n * zoom >= 56) ?? 5000, minor = step / (step >= 10 && String(step)[0] === '2' ? 4 : 5);
  const ticks: { v: number; major: boolean }[] = [];
  for (let v = Math.floor(from / minor) * minor; (v - from) * zoom <= length; v += minor) ticks.push({ v: Math.round(v * 1000) / 1000, major: Math.abs(v / step - Math.round(v / step)) < 1e-6 });
  const at = (v: number) => (v - from) * zoom;
  return (
    <svg className={`design-ruler ${axis}`} aria-hidden="true" width={axis === 'x' ? length : RULER} height={axis === 'x' ? RULER : length}>
      {ticks.map(({ v, major }) => axis === 'x'
        ? <g key={v}><line x1={at(v)} x2={at(v)} y1={major ? 8 : 15} y2={RULER} />{major && <text x={at(v) + 3} y={10}>{v}</text>}</g>
        : <g key={v}><line y1={at(v)} y2={at(v)} x1={major ? 8 : 15} x2={RULER} />{major && <text x={10} y={at(v) + 3} transform={`rotate(-90 10 ${at(v) + 3})`}>{v}</text>}</g>)}
      {cursor !== null && (axis === 'x' ? <line className="cursor" x1={at(cursor)} x2={at(cursor)} y1={0} y2={RULER} /> : <line className="cursor" y1={at(cursor)} y2={at(cursor)} x1={0} x2={RULER} />)}
    </svg>
  );
}

/** One object, drawn once per version of it. */
const ItemView = memo(function ItemView({ item, zoom }: { item: VItem; zoom: number }) {
  if (item.hidden) return null;
  if (item.type === 'group') return <g data-id={item.id}>{item.children.map(c => <ItemView key={c.id} item={c} zoom={zoom} />)}</g>;
  const s = item.style, subs = placed(item), open = subs.every(x => !x.closed);
  const width = s.stroke ? Math.max(s.strokeWidth, 1 / zoom) : 0;
  return <path className="v-item" data-id={item.id} d={pathData(subs)} fill={open ? 'none' : s.fill ?? 'none'} fillRule="evenodd" stroke={s.stroke ?? (open ? '#1d3f7a' : 'none')} strokeWidth={width || 1 / zoom} />;
});

export function DesignCanvas() {
  const { t } = useT();
  const doc = useStore(projectStore, s => docOf(s.project));
  const tool = useStore(designStore, s => s.tool);
  const selectedRaw = useStore(designStore, s => s.selected);
  const zoom = useStore(designStore, s => s.zoom), pan = useStore(designStore, s => s.pan), fit = useStore(designStore, s => s.fit);
  const showGrid = useStore(designStore, s => s.grid), rulers = useStore(designStore, s => s.rulers), gridMm = useStore(designStore, s => s.gridMm);
  const cursor = useStore(designStore, s => s.cursor);
  const wrap = useRef<HTMLDivElement>(null);
  // Zero until measured, so fitting waits for the real size.
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<{ m: Matrix | null; box: BBox | null; shape: Subpath[] | null }>({ m: null, box: null, shape: null });
  const [poly, setPoly] = useState<Point[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const selected = useMemo(() => editable(doc, selectedRaw), [doc, selectedRaw]);
  const selBox = useMemo(() => selectionBBox(doc, selected), [doc, selected]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fitting waits for the real canvas size.
  useEffect(() => {
    if (!fit || size.w < 50) return;
    const b = fit === 'selection' && selBox ? selBox : union([{ x0: 0, y0: 0, x1: doc.page.w, y1: doc.page.h }]);
    if (!b) return;
    const pad = fit === 'selection' ? 40 : 28, w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.y1 - b.y0, 1);
    const z = Math.min((size.w - pad * 2) / w, (size.h - pad * 2) / h);
    designStore.patch({ fit: null, zoom: z, pan: { x: (b.x0 + b.x1) / 2 - size.w / 2 / z, y: (b.y0 + b.y1) / 2 - size.h / 2 / z } });
  }, [fit, size, doc.page.w, doc.page.h, selBox]);

  const toPage = (e: { clientX: number; clientY: number }): Point => {
    const r = wrap.current!.getBoundingClientRect();
    return [pan.x + (e.clientX - r.left) / zoom, pan.y + (e.clientY - r.top) / zoom];
  };
  const snap = (p: Point): Point => {
    const s = designStore.get();
    return s.snap ? [Math.round(p[0] / s.gridMm) * s.gridMm, Math.round(p[1] / s.gridMm) * s.gridMm] : p;
  };
  const tol = 6 / zoom;

  // The wheel zooms around the pointer; a non-passive listener so the page itself does not scroll.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const finishPolyline = (closed: boolean) => {
    if (poly && poly.length >= 2) addItem(pathItem('polyline', t('design.shape.polyline'), polyline(poly, closed && poly.length >= 3)));
    cancelPolyline();
  };
  const cancelPolyline = () => { setPoly(null); setLive({ m: null, box: null, shape: null }); };
  useEffect(() => {
    if (!poly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); finishPolyline(false); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelPolyline(); }
      else if (e.key === 'Backspace') { e.preventDefault(); setPoly(p => (p && p.length > 1 ? p.slice(0, -1) : null)); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  useEffect(() => { if (tool !== 'polyline') cancelPolyline(); }, [tool]);

  function onDown(e: RPointerEvent) {
    if (e.button === 2) return;
    setMenu(null);
    wrap.current?.focus({ preventScroll: true });
    const p = toPage(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (e.button === 1 || tool === 'pan') { setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, pan }); return; }
    if (tool === 'zoom') { setDrag({ kind: 'zoom', start: p, additive: e.shiftKey || e.altKey }); return; }
    if (tool === 'polyline') {
      const q = snap(p);
      if (poly && poly.length >= 3 && Math.hypot(q[0] - poly[0][0], q[1] - poly[0][1]) <= tol) { finishPolyline(true); return; }
      if (e.detail >= 2 && poly) { finishPolyline(false); return; }
      setPoly(prev => [...(prev ?? []), q]);
      return;
    }
    if (tool === 'freehand') { setDrag({ kind: 'freehand', pts: [p] }); return; }
    if (tool !== 'pick') { setDrag({ kind: 'shape', tool, start: snap(p) }); return; }

    const target = (e.target as Element).closest<SVGElement>('[data-handle]');
    if (target && selBox) {
      const h = target.dataset.handle!;
      if (h === 'rotate') { const c: Point = [(selBox.x0 + selBox.x1) / 2, (selBox.y0 + selBox.y1) / 2]; setDrag({ kind: 'rotate', c, a0: Math.atan2(p[1] - c[1], p[0] - c[0]) }); }
      else setDrag({ kind: 'scale', handle: +h as Handle, box: selBox });
      return;
    }
    const id = hit(doc, p, tol);
    if (id) {
      const sel = designStore.get().selected;
      const next = e.shiftKey ? (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]) : sel.includes(id) ? sel : [id];
      designStore.patch({ selected: next });
      const box = selectionBBox(doc, editable(doc, next));
      if (box && next.includes(id)) setDrag({ kind: 'move', start: p, moved: false, box });
      return;
    }
    if (!e.shiftKey) designStore.patch({ selected: [] });
    setDrag({ kind: 'marquee', start: p, additive: e.shiftKey });
  }

  function onMove(e: RPointerEvent) {
    const p = toPage(e);
    designStore.patch({ cursor: p });
    if (!drag) { if (poly) setLive(l => ({ ...l, shape: polyline([...poly, snap(p)], false) })); return; }
    switch (drag.kind) {
      case 'pan': designStore.patch({ pan: { x: drag.pan.x - (e.clientX - drag.sx) / zoom, y: drag.pan.y - (e.clientY - drag.sy) / zoom } }); break;
      case 'move': {
        let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const s = designStore.get();
        if (s.snap) { dx = Math.round((drag.box.x0 + dx) / s.gridMm) * s.gridMm - drag.box.x0; dy = Math.round((drag.box.y0 + dy) / s.gridMm) * s.gridMm - drag.box.y0; }
        const moved = drag.moved || Math.hypot(dx, dy) * zoom > 3;
        if (moved !== drag.moved) setDrag({ ...drag, moved });
        setLive({ m: moved ? translate(dx, dy) : null, box: null, shape: null });
        break;
      }
      case 'scale': {
        const b = drag.box, [fx, fy] = HANDLES[drag.handle], ax = b.x0 + (1 - fx) * (b.x1 - b.x0), ay = b.y0 + (1 - fy) * (b.y1 - b.y0);
        const q = snap(p);
        let sx = fx === 0.5 ? 1 : (q[0] - ax) / ((fx ? b.x1 : b.x0) - ax || 1), sy = fy === 0.5 ? 1 : (q[1] - ay) / ((fy ? b.y1 : b.y0) - ay || 1);
        if (e.shiftKey || (fx !== 0.5 && fy !== 0.5 && !e.altKey && e.ctrlKey)) { const k = fx === 0.5 ? sy : fy === 0.5 ? sx : Math.max(Math.abs(sx), Math.abs(sy)) * Math.sign(sx || 1); sx = fx === 0.5 ? k : sx; sy = fy === 0.5 ? k : sy; if (fx !== 0.5 && fy !== 0.5) { sx = k; sy = Math.abs(k) * Math.sign(sy || 1); } }
        if (Math.abs(sx) < 1e-3) sx = 1e-3; if (Math.abs(sy) < 1e-3) sy = 1e-3;
        setLive({ m: scaleAbout(sx, sy, ax, ay), box: null, shape: null });
        break;
      }
      case 'rotate': {
        let deg = ((Math.atan2(p[1] - drag.c[1], p[0] - drag.c[0]) - drag.a0) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        setLive({ m: rotateAbout(deg, drag.c[0], drag.c[1]), box: null, shape: null });
        break;
      }
      case 'marquee': case 'zoom':
        setLive({ m: null, box: { x0: Math.min(drag.start[0], p[0]), y0: Math.min(drag.start[1], p[1]), x1: Math.max(drag.start[0], p[0]), y1: Math.max(drag.start[1], p[1]) }, shape: null });
        break;
      case 'shape': setLive({ m: null, box: null, shape: draft(drag.tool, drag.start, snap(p), e.shiftKey) }); break;
      case 'freehand': {
        const last = drag.pts[drag.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) * zoom > 1.5) { drag.pts.push(p); setLive({ m: null, box: null, shape: polyline(drag.pts, false) }); }
        break;
      }
    }
  }

  function onUp(e: RPointerEvent) {
    const d = drag;
    setDrag(null);
    const l = live;
    setLive({ m: null, box: null, shape: null });
    if (!d) return;
    const p = toPage(e);
    if ((d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate') && l.m) transformSelection(l.m);
    else if (d.kind === 'marquee' && l.box) {
      const b = l.box;
      if ((b.x1 - b.x0) * zoom > 3 || (b.y1 - b.y0) * zoom > 3) {
        const inside = [...pickOrder(doc)].filter(i => { const ib = itemBBox(i); return ib && ib.x0 >= b.x0 && ib.x1 <= b.x1 && ib.y0 >= b.y0 && ib.y1 <= b.y1; }).map(i => i.id);
        designStore.patch({ selected: d.additive ? [...new Set([...designStore.get().selected, ...inside])] : inside });
      }
    } else if (d.kind === 'zoom') {
      const r = wrap.current!.getBoundingClientRect(), at = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (l.box && (l.box.x1 - l.box.x0) * zoom > 8) {
        const b = l.box, z = Math.min(size.w / (b.x1 - b.x0), size.h / (b.y1 - b.y0)) * 0.95;
        designStore.patch({ zoom: z, pan: { x: (b.x0 + b.x1) / 2 - size.w / 2 / z, y: (b.y0 + b.y1) / 2 - size.h / 2 / z } });
      } else zoomBy(d.additive ? 0.5 : 2, at);
    } else if (d.kind === 'shape' && l.shape) {
      const b = union([selectionBBoxOf(l.shape)]);
      if (b && ((b.x1 - b.x0) * zoom > 2 || (b.y1 - b.y0) * zoom > 2)) {
        const kind: ShapeKind = d.tool === 'line' ? 'line' : SHAPES[d.tool] ?? 'rect';
        addItem(pathItem(kind, t(`design.shape.${kind}` as 'design.shape.rect'), l.shape));
      }
    } else if (d.kind === 'freehand' && d.pts.length >= 2) {
      const pts = simplifyPoints(d.pts, 0.6 / zoom);
      const closed = pts.length > 3 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) * zoom < 10;
      if (closed) pts.pop();
      addItem(pathItem('freehand', t('design.shape.freehand'), [{ closed, nodes: smoothNodes(pts, closed) }]));
    }
  }

  const sel = useMemo(() => new Set(selected), [selected]);
  const view = { x0: pan.x, y0: pan.y, x1: pan.x + size.w / zoom, y1: pan.y + size.h / zoom };
  const S = (x: number, y: number): [number, number] => [(x - pan.x) * zoom, (y - pan.y) * zoom];
  const box = selBox && live.m ? boxAfter(selBox, live.m) : selBox;
  const showHandles = tool === 'pick' && box && !drag;

  return (
    <div className={'design-canvas' + (rulers ? ' with-rulers' : '')} data-testid="design-canvas-area">
      {rulers && <>
        <div className="ruler-corner" aria-hidden="true">mm</div>
        <Ruler axis="x" from={pan.x} zoom={zoom} length={size.w} cursor={cursor?.[0] ?? null} />
        <Ruler axis="y" from={pan.y} zoom={zoom} length={size.h} cursor={cursor?.[1] ?? null} />
      </>}
      <div ref={wrap} className={`design-wrap tool-${tool}`} tabIndex={0} aria-label={t('design.canvas')} data-testid="design-canvas"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { setDrag(null); setLive({ m: null, box: null, shape: null }); }}
        onPointerLeave={() => designStore.patch({ cursor: null })}
        onContextMenu={e => {
          e.preventDefault();
          const p = toPage(e), id = hit(doc, p, tol);
          if (id && !designStore.get().selected.includes(id)) designStore.patch({ selected: [id] });
          const r = wrap.current!.getBoundingClientRect();
          setMenu({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onDoubleClick={() => { if (tool === 'polyline') finishPolyline(false); }}>
        <svg width={size.w} height={size.h} className="design-svg">
          <defs>
            <pattern id="dgrid" width={gridMm} height={gridMm} patternUnits="userSpaceOnUse">
              <path d={`M${gridMm} 0H0V${gridMm}`} fill="none" className="grid-line" strokeWidth={1 / zoom} />
            </pattern>
          </defs>
          <g transform={`scale(${zoom}) translate(${-pan.x} ${-pan.y})`}>
            <rect className="page-shadow" x={1.5 / zoom * 3} y={1.5 / zoom * 3} width={doc.page.w} height={doc.page.h} />
            <rect className="page" x={0} y={0} width={doc.page.w} height={doc.page.h} strokeWidth={1 / zoom} data-testid="design-page" />
            {showGrid && <rect x={Math.max(0, view.x0)} y={Math.max(0, view.y0)} width={Math.max(0, Math.min(doc.page.w, view.x1) - Math.max(0, view.x0))}
              height={Math.max(0, Math.min(doc.page.h, view.y1) - Math.max(0, view.y0))} fill="url(#dgrid)" />}
            {doc.layers.filter(l => l.visible).map(layer => (
              <g key={layer.id} data-layer={layer.id} className={layer.locked ? 'locked' : ''}>
                {layer.items.map(item => (sel.has(item.id) && live.m
                  ? <g key={item.id} transform={`matrix(${live.m.join(' ')})`}><ItemView item={item} zoom={zoom} /></g>
                  : <ItemView key={item.id} item={item} zoom={zoom} />))}
              </g>
            ))}
            {selected.map(id => {
              const item = doc.layers.flatMap(l => l.items).find(i => i.id === id);
              if (!item) return null;
              const d = worldPaths(item).map(w => pathData(placed(w.item))).join('');
              return <path key={id} className="v-selected" d={d} transform={live.m ? `matrix(${live.m.join(' ')})` : undefined} strokeWidth={1.5 / zoom} />;
            })}
            {live.shape && <path className="v-draft" d={pathData(live.shape)} strokeWidth={1.5 / zoom} data-testid="design-draft" />}
            {poly && <circle className="v-start" cx={poly[0][0]} cy={poly[0][1]} r={tol} strokeWidth={1.5 / zoom} />}
          </g>
          {live.box && (() => { const [x, y] = S(live.box.x0, live.box.y0); return <rect className="v-marquee" x={x} y={y} width={(live.box.x1 - live.box.x0) * zoom} height={(live.box.y1 - live.box.y0) * zoom} />; })()}
          {box && (() => {
            const [x0, y0] = S(box.x0, box.y0), [x1, y1] = S(box.x1, box.y1);
            return (
              <g className="v-handles" data-testid="selection-box">
                <rect className="v-bbox" x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
                {showHandles && HANDLES.map(([fx, fy], k) => (
                  <rect key={k} data-handle={k} data-testid={`handle-${k}`} className="v-handle" style={{ cursor: CURSORS[k] }}
                    x={x0 + fx * (x1 - x0) - HANDLE / 2} y={y0 + fy * (y1 - y0) - HANDLE / 2} width={HANDLE} height={HANDLE} />
                ))}
                {showHandles && <>
                  <line className="v-bbox" x1={(x0 + x1) / 2} x2={(x0 + x1) / 2} y1={y0} y2={y0 - 22} />
                  <circle data-handle="rotate" data-testid="handle-rotate" className="v-handle rotate" cx={(x0 + x1) / 2} cy={y0 - 22} r={5.5} />
                </>}
              </g>
            );
          })()}
        </svg>
        {menu && <div className="canvas-menu design-menu" style={{ left: Math.min(menu.x, size.w - 240), top: Math.min(menu.y, size.h - 380) }} data-testid="design-menu">
          <MenuList items={MENU} onDone={() => setMenu(null)} />
        </div>}
      </div>
    </div>
  );
}

function selectionBBoxOf(list: Subpath[]): BBox | null {
  const pts = list.flatMap(s => s.nodes.map(n => n.p));
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) };
}

/** Bounds of a box after a transform: the box of its four transformed corners. */
function boxAfter(b: BBox, m: Matrix): BBox {
  const pts: Point[] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  return { x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) };
}

