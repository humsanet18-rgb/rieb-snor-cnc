import { matMul } from '../geometry-engine/geometry';
import type { BBox, Matrix, Point, Polygon } from '../../types/geometry';
import { flatten, pathData, reverseSubpath, subpathsBBox, transformSubpaths } from './path';
import { DEFAULT_STYLE, IDENTITY, type GroupItem, type PathItem, type ShapeKind, type Subpath, type VectorDocument, type VItem, type VLayer, type VStyle } from './types';

let seq = 0;
export const vid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export function emptyDocument(page: { w: number; h: number }, layerName = 'Layer 1'): VectorDocument {
  const id = vid('layer');
  return { version: 1, page: { ...page }, layers: [{ id, name: layerName, visible: true, locked: false, items: [] }], activeLayerId: id };
}

export function pathItem(kind: ShapeKind, name: string, subpaths: Subpath[], style: VStyle = DEFAULT_STYLE): PathItem {
  return { id: vid('obj'), type: 'path', kind, name, locked: false, hidden: false, subpaths, matrix: IDENTITY, style: { ...style } };
}

/* ---------- reading ---------- */

/** Every item at any depth, with the top-level item it belongs to. */
export function* walk(items: VItem[], top?: VItem): Generator<{ item: VItem; top: VItem }> {
  for (const item of items) {
    yield { item, top: top ?? item };
    if (item.type === 'group') yield* walk(item.children, top ?? item);
  }
}

export const allTop = (doc: VectorDocument): VItem[] => doc.layers.flatMap(l => l.items);

export function findTop(doc: VectorDocument, id: string): { item: VItem; layer: VLayer; index: number } | null {
  for (const layer of doc.layers) {
    const index = layer.items.findIndex(i => i.id === id);
    if (index >= 0) return { item: layer.items[index], layer, index };
  }
  return null;
}

/** The path items inside an item, with geometry already placed on the page. */
export function worldPaths(item: VItem): { item: PathItem; subpaths: Subpath[] }[] {
  const out: { item: PathItem; subpaths: Subpath[] }[] = [];
  for (const { item: it } of walk([item])) if (it.type === 'path') out.push({ item: it, subpaths: placed(it) });
  return out;
}

const placedCache = new WeakMap<PathItem, Subpath[]>();
export function placed(item: PathItem): Subpath[] {
  let s = placedCache.get(item);
  if (!s) { s = transformSubpaths(item.subpaths, item.matrix); placedCache.set(item, s); }
  return s;
}

const flatCache = new WeakMap<PathItem, Polygon[]>();
/** Page-space polygons of a path item, cached per item version. */
export function flatOf(item: PathItem): Polygon[] {
  let f = flatCache.get(item);
  if (!f) { f = placed(item).map(s => flatten(s)); flatCache.set(item, f); }
  return f;
}

export function itemBBox(item: VItem): BBox | null {
  return union(worldPaths(item).map(w => subpathsBBox(w.subpaths)));
}

export function union(list: (BBox | null)[]): BBox | null {
  const b = list.filter((x): x is BBox => !!x);
  if (!b.length) return null;
  return { x0: Math.min(...b.map(x => x.x0)), y0: Math.min(...b.map(x => x.y0)), x1: Math.max(...b.map(x => x.x1)), y1: Math.max(...b.map(x => x.y1)) };
}

export function selectionBBox(doc: VectorDocument, ids: string[]): BBox | null {
  return union(ids.map(id => findTop(doc, id)).map(f => (f ? itemBBox(f.item) : null)));
}

/** Items that can be changed: visible, unlocked, on a visible, unlocked layer. */
export function editable(doc: VectorDocument, ids: string[]): string[] {
  return ids.filter(id => { const f = findTop(doc, id); return !!f && !f.item.locked && !f.item.hidden && f.layer.visible && !f.layer.locked; });
}

/* ---------- changing ---------- */

function mapLayers(doc: VectorDocument, fn: (items: VItem[], layer: VLayer) => VItem[]): VectorDocument {
  return { ...doc, layers: doc.layers.map(l => { const items = fn(l.items, l); return items === l.items ? l : { ...l, items }; }) };
}

/** Replaces chosen top-level items; untouched items keep their identity, so caches stay valid. */
export function updateItems(doc: VectorDocument, ids: string[], fn: (item: VItem) => VItem): VectorDocument {
  const set = new Set(ids);
  return mapLayers(doc, items => (items.some(i => set.has(i.id)) ? items.map(i => (set.has(i.id) ? fn(i) : i)) : items));
}

export function addItems(doc: VectorDocument, items: VItem[], layerId = doc.activeLayerId): VectorDocument {
  return mapLayers(doc, (list, l) => (l.id === layerId ? [...list, ...items] : list));
}

export function removeItems(doc: VectorDocument, ids: string[]): VectorDocument {
  const set = new Set(ids);
  return mapLayers(doc, items => (items.some(i => set.has(i.id)) ? items.filter(i => !set.has(i.id)) : items));
}

/** Applies a page-space transform to an item and everything inside it. */
export function transformItem(item: VItem, m: Matrix): VItem {
  if (item.type === 'path') return { ...item, matrix: matMul(m, item.matrix) };
  return { ...item, children: item.children.map(c => transformItem(c, m)) };
}

export const translate = (dx: number, dy: number): Matrix => [1, 0, 0, 1, dx, dy];
export const about = (m: Matrix, cx: number, cy: number): Matrix => matMul(translate(cx, cy), matMul(m, translate(-cx, -cy)));
export const scaleAbout = (sx: number, sy: number, cx: number, cy: number): Matrix => about([sx, 0, 0, sy, 0, 0], cx, cy);
export function rotateAbout(deg: number, cx: number, cy: number): Matrix {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return about([c, s, -s, c, 0, 0], cx, cy);
}
/** Skew in degrees along X (horizontal) and Y (vertical). */
export const skewAbout = (ax: number, ay: number, cx: number, cy: number): Matrix =>
  about([1, Math.tan((ay * Math.PI) / 180), Math.tan((ax * Math.PI) / 180), 1, 0, 0], cx, cy);

export function transformItems(doc: VectorDocument, ids: string[], m: Matrix): VectorDocument {
  return updateItems(doc, ids, i => transformItem(i, m));
}

/** Rotation of an item's first path, in degrees, for display. */
export function rotationOf(item: VItem): number {
  const p = worldPaths(item)[0]?.item;
  if (!p) return 0;
  const deg = (Math.atan2(p.matrix[1], p.matrix[0]) * 180) / Math.PI;
  return Math.round(deg * 100) / 100 || 0;
}

function cloneItem(item: VItem): VItem {
  return item.type === 'path' ? { ...item, id: vid('obj') } : { ...item, id: vid('group'), children: item.children.map(cloneItem) };
}

/** Copies placed just above their originals, moved by (dx, dy). */
export function duplicateItems(doc: VectorDocument, ids: string[], dx: number, dy: number): { doc: VectorDocument; ids: string[] } {
  const newIds: string[] = [];
  const set = new Set(ids);
  const next = mapLayers(doc, items => {
    if (!items.some(i => set.has(i.id))) return items;
    const out: VItem[] = [];
    for (const i of items) {
      out.push(i);
      if (set.has(i.id)) { const c = transformItem(cloneItem(i), translate(dx, dy)); newIds.push(c.id); out.push(c); }
    }
    return out;
  });
  return { doc: next, ids: newIds };
}

/** Copies for the clipboard, with fresh ids so pasting twice gives two objects. */
export const cloneForPaste = (items: VItem[], dx: number, dy: number): VItem[] => items.map(i => transformItem(cloneItem(i), translate(dx, dy)));

/** Groups top-level items of one layer; the group takes the place of the topmost one. */
export function groupItems(doc: VectorDocument, ids: string[], name: string): { doc: VectorDocument; id: string | null } {
  const found = ids.map(id => findTop(doc, id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (found.length < 2 || new Set(found.map(f => f.layer.id)).size > 1) return { doc, id: null };
  const layer = found[0].layer, set = new Set(found.map(f => f.item.id));
  const children = layer.items.filter(i => set.has(i.id));
  const group: GroupItem = { id: vid('group'), type: 'group', name, locked: false, hidden: false, children };
  const at = Math.max(...found.map(f => f.index));
  const items: VItem[] = [];
  layer.items.forEach((it, k) => { if (k === at) items.push(group); else if (!set.has(it.id)) items.push(it); });
  return { doc: mapLayers(doc, (list, l) => (l.id === layer.id ? items : list)), id: group.id };
}

export function ungroupItems(doc: VectorDocument, ids: string[]): { doc: VectorDocument; ids: string[] } {
  const set = new Set(ids), out: string[] = [];
  const next = mapLayers(doc, items => {
    if (!items.some(i => set.has(i.id) && i.type === 'group')) return items;
    return items.flatMap(i => {
      if (!set.has(i.id) || i.type !== 'group') return [i];
      out.push(...i.children.map(c => c.id));
      return i.children;
    });
  });
  return { doc: next, ids: out };
}

export type Order = 'front' | 'back' | 'forward' | 'backward';

/** Stacking order within each item's layer. */
export function reorder(doc: VectorDocument, ids: string[], how: Order): VectorDocument {
  const set = new Set(ids);
  return mapLayers(doc, items => {
    if (!items.some(i => set.has(i.id))) return items;
    const picked = items.filter(i => set.has(i.id)), rest = items.filter(i => !set.has(i.id));
    if (how === 'front') return [...rest, ...picked];
    if (how === 'back') return [...picked, ...rest];
    const list = [...items];
    const range = how === 'forward' ? [...list.keys()].reverse() : [...list.keys()];
    for (const k of range) {
      const j = how === 'forward' ? k + 1 : k - 1;
      if (j < 0 || j >= list.length || !set.has(list[k].id) || set.has(list[j].id)) continue;
      [list[k], list[j]] = [list[j], list[k]];
    }
    return list;
  });
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Aligns to the selection's bounds, or to the page when one object is chosen or `toPage` is set. */
export function alignItems(doc: VectorDocument, ids: string[], mode: AlignMode, toPage = false): VectorDocument {
  const ref = toPage || ids.length === 1 ? { x0: 0, y0: 0, x1: doc.page.w, y1: doc.page.h } : selectionBBox(doc, ids);
  if (!ref) return doc;
  return updateItems(doc, ids, item => {
    const b = itemBBox(item);
    if (!b) return item;
    const dx = mode === 'left' ? ref.x0 - b.x0 : mode === 'right' ? ref.x1 - b.x1 : mode === 'center' ? (ref.x0 + ref.x1 - b.x0 - b.x1) / 2 : 0;
    const dy = mode === 'top' ? ref.y0 - b.y0 : mode === 'bottom' ? ref.y1 - b.y1 : mode === 'middle' ? (ref.y0 + ref.y1 - b.y0 - b.y1) / 2 : 0;
    return dx || dy ? transformItem(item, translate(dx, dy)) : item;
  });
}

/** Equal gaps between objects, keeping the outer two where they are. */
export function distributeItems(doc: VectorDocument, ids: string[], axis: 'x' | 'y'): VectorDocument {
  const boxes = ids.map(id => ({ id, b: selectionBBox(doc, [id]) })).filter((x): x is { id: string; b: BBox } => !!x.b);
  if (boxes.length < 3) return doc;
  const lo = (b: BBox) => (axis === 'x' ? b.x0 : b.y0), hi = (b: BBox) => (axis === 'x' ? b.x1 : b.y1);
  boxes.sort((a, b) => lo(a.b) - lo(b.b));
  const span = hi(boxes[boxes.length - 1].b) - lo(boxes[0].b), used = boxes.reduce((s, x) => s + hi(x.b) - lo(x.b), 0);
  const gap = (span - used) / (boxes.length - 1);
  const shift = new Map<string, number>();
  let cursor = lo(boxes[0].b);
  for (const x of boxes) { shift.set(x.id, cursor - lo(x.b)); cursor += hi(x.b) - lo(x.b) + gap; }
  return updateItems(doc, ids, item => {
    const d = shift.get(item.id) ?? 0;
    return Math.abs(d) < 1e-9 ? item : transformItem(item, axis === 'x' ? translate(d, 0) : translate(0, d));
  });
}

/** One object from several, holes and all: the subpaths are kept as they are, in page space. */
export function combineItems(doc: VectorDocument, ids: string[], name: string): { doc: VectorDocument; id: string | null } {
  const found = ids.map(id => findTop(doc, id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (found.length < 2) return { doc, id: null };
  const paths = found.flatMap(f => worldPaths(f.item));
  const item: PathItem = { ...pathItem('curves', name, paths.flatMap(p => p.subpaths), paths[0].item.style) };
  const top = found.reduce((a, b) => (b.index > a.index ? b : a));
  const set = new Set(found.map(f => f.item.id));
  const next = mapLayers(doc, (items, l) => (l.id !== top.layer.id && !items.some(i => set.has(i.id)) ? items
    : items.flatMap(i => (i.id === top.item.id ? [item] : set.has(i.id) ? [] : [i]))));
  return { doc: next, id: item.id };
}

/** Each subpath becomes its own object. */
export function breakApart(doc: VectorDocument, ids: string[]): { doc: VectorDocument; ids: string[] } {
  const out: string[] = [];
  const set = new Set(ids);
  const next = mapLayers(doc, items => items.flatMap(i => {
    if (!set.has(i.id) || i.type !== 'path' || i.subpaths.length < 2) return [i];
    const parts = placed(i).map((s, k) => ({ ...pathItem('curves', `${i.name} ${k + 1}`, [s], i.style) }));
    out.push(...parts.map(p => p.id));
    return parts;
  }));
  return { doc: next, ids: out };
}

export function reverseItems(doc: VectorDocument, ids: string[]): VectorDocument {
  const flip = (i: VItem): VItem => (i.type === 'path' ? { ...i, subpaths: i.subpaths.map(reverseSubpath) } : { ...i, children: i.children.map(flip) });
  return updateItems(doc, ids, flip);
}

export function styleItems(doc: VectorDocument, ids: string[], style: Partial<VStyle>): VectorDocument {
  const apply = (i: VItem): VItem => (i.type === 'path' ? { ...i, style: { ...i.style, ...style } } : { ...i, children: i.children.map(apply) });
  return updateItems(doc, ids, apply);
}

/* ---------- layers ---------- */

export function addLayer(doc: VectorDocument, name: string): VectorDocument {
  const id = vid('layer');
  return { ...doc, layers: [...doc.layers, { id, name, visible: true, locked: false, items: [] }], activeLayerId: id };
}

export function patchLayer(doc: VectorDocument, id: string, part: Partial<Pick<VLayer, 'name' | 'visible' | 'locked'>>): VectorDocument {
  return { ...doc, layers: doc.layers.map(l => (l.id === id ? { ...l, ...part } : l)) };
}

/** Removes a layer; its objects move to the layer below (or above, for the bottom one). The last layer stays. */
export function removeLayer(doc: VectorDocument, id: string): VectorDocument {
  if (doc.layers.length < 2) return doc;
  const k = doc.layers.findIndex(l => l.id === id);
  if (k < 0) return doc;
  const into = doc.layers[k > 0 ? k - 1 : 1];
  const layers = doc.layers.filter(l => l.id !== id).map(l => (l.id === into.id ? { ...l, items: [...l.items, ...doc.layers[k].items] } : l));
  return { ...doc, layers, activeLayerId: doc.activeLayerId === id ? into.id : doc.activeLayerId };
}

export function moveToLayer(doc: VectorDocument, ids: string[], layerId: string): VectorDocument {
  const items = ids.map(id => findTop(doc, id)?.item).filter((i): i is VItem => !!i);
  return addItems(removeItems(doc, ids), items, layerId);
}

/* ---------- output ---------- */

/** Closed outlines in page space, for production; open paths cannot be cut as pieces and are counted instead. */
export function toPolygons(items: VItem[]): { closed: Polygon[]; open: number } {
  const closed: Polygon[] = [];
  let open = 0;
  for (const item of items) {
    for (const w of worldPaths(item)) {
      w.subpaths.forEach((s, k) => {
        const poly = flatOf(w.item)[k];
        if (s.closed && poly.length >= 3) closed.push(poly); else open++;
      });
    }
  }
  return { closed, open };
}

const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

/** The page as SVG in millimetres, curves kept as curves, one group per visible layer. */
export function documentToSVG(doc: VectorDocument, only?: VItem[]): string {
  const draw = (i: VItem): string => {
    if (i.hidden) return '';
    if (i.type === 'group') return `<g id="${esc(i.id)}">${i.children.map(draw).join('')}</g>`;
    const s = i.style;
    return `<path id="${esc(i.id)}" d="${pathData(placed(i))}" fill="${s.fill ?? 'none'}" fill-rule="evenodd" stroke="${s.stroke ?? 'none'}" stroke-width="${s.strokeWidth}"/>`;
  };
  const body = only ? only.map(draw).join('') : doc.layers.filter(l => l.visible).map(l => `<g id="${esc(l.id)}" data-name="${esc(l.name)}">${l.items.map(draw).join('')}</g>`).join('');
  const { w, h } = doc.page;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
}

/** Imported outlines (already flattened by the SVG reader) as one editable object. */
export function polygonsToItem(polys: Polygon[], name: string): PathItem {
  return pathItem('curves', name, polys.map(p => ({ closed: true, nodes: p.map(q => ({ p: q as Point })) })));
}
