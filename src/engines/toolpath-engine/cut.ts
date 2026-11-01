import type { BBox, PlacedItem, Point, Polygon, Rect, StartSpec, Stroke } from '../../types/geometry';
import type { CutOptions, CutOrder } from '../../types/project';
import { bboxOf, boxGap, pointInPoly, segCross, segHitsRect } from '../geometry-engine/geometry';
import { buildStroke, simplifyPath } from './stroke';

const box = (it: PlacedItem) => bboxOf(it.outers.flat());
const inside = (a: BBox, b: BBox) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;

/** Pieces whose centre falls inside the first piece's band belong to the same row or column. */
function bands(list: number[], boxes: BBox[], axis: 'x' | 'y'): number[][] {
  const lo = axis === 'y' ? 'y0' : 'x0', hi = axis === 'y' ? 'y1' : 'x1', across = axis === 'y' ? 'x0' : 'y0';
  const centre = (i: number) => (boxes[i][lo] + boxes[i][hi]) / 2;
  const out: number[][] = [];
  let limit = -Infinity;
  for (const i of [...list].sort((a, b) => centre(a) - centre(b))) {
    if (!out.length || centre(i) > limit) { out.push([i]); limit = boxes[i][hi]; }
    else out[out.length - 1].push(i);
  }
  for (const b of out) b.sort((p, q) => boxes[p][across] - boxes[q][across]);
  return out;
}

/** The order groups are cut in. An island stays with the letter around it: the wire can only reach it through that letter. */
export function cutGroups(items: PlacedItem[], order: Exclude<CutOrder, 'shortest'>): number[][] {
  const boxes = items.map(box);
  const host = items.map((it, i) => items.findIndex((o, j) => j !== i && inside(boxes[i], boxes[j]) && o.holes.some(h => pointInPoly(it.outers[0][0], h))));
  const free = items.map((_, i) => i).filter(i => host[i] < 0);
  const rows = bands(free, boxes, order === 'columns' ? 'x' : 'y');
  const groups = order === 'snake' ? rows.flatMap((r, i) => (i % 2 ? [...r].reverse() : r).map(x => [x])) : rows;
  items.forEach((_, i) => {
    if (host[i] < 0) return;
    let root = host[i];
    while (host[root] >= 0) root = host[root];
    groups.find(g => g.includes(root))?.push(i);
  });
  return groups;
}

function clearLink(a: Point, b: Point, items: PlacedItem[], boxes: BBox[], zones: Rect[]): boolean {
  if (zones.some(z => segHitsRect(a, b, z))) return false;
  const span = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
  const near = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.03;
  for (let i = 0; i < items.length; i++) {
    if (boxGap(span, boxes[i]) > 0) continue;
    for (const c of [...items[i].outers, ...items[i].holes]) {
      for (let k = 0; k < c.length; k++) {
        const p = c[k], q = c[(k + 1) % c.length];
        if (near(p, a) || near(q, a) || near(p, b) || near(q, b)) continue;
        if (segCross(a, b, p, q)) return false;
      }
    }
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const m: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (items[i].outers.some(o => pointInPoly(m, o)) && !items[i].holes.some(h => pointInPoly(m, h))) return false;
    }
  }
  return true;
}

interface Link { a: Point; b: Point; retrace: Polygon }

/** Leaves a finished tour for the next group: the short way along cut lines, then one new bridge. */
function bestLink(tour: Polygon, targets: PlacedItem[], items: PlacedItem[], boxes: BBox[], zones: Rect[]): Link {
  const along = [0];
  for (let i = 1; i < tour.length; i++) along.push(along[i - 1] + Math.hypot(tour[i][0] - tour[i - 1][0], tour[i][1] - tour[i - 1][1]));
  const total = along[along.length - 1];
  const ends = targets.flatMap(t => t.outers.flat());
  const endStep = Math.max(1, Math.floor(ends.length / 3000)), tourStep = Math.max(1, Math.floor(tour.length / 500));
  const options: { i: number; b: Point; cost: number; d: number }[] = [];
  for (let i = 0; i < tour.length; i += tourStep) {
    let d = Infinity, b = ends[0];
    for (let j = 0; j < ends.length; j += endStep) {
      const dist = Math.hypot(tour[i][0] - ends[j][0], tour[i][1] - ends[j][1]);
      if (dist < d) { d = dist; b = ends[j]; }
    }
    options.push({ i, b, d, cost: d + Math.min(along[i], total - along[i]) });
  }
  options.sort((p, q) => p.cost - q.cost);
  // A blocked link stays only as a last resort, and the validator then reports it.
  const pick = options.slice(0, 300).find(o => clearLink(tour[o.i], o.b, items, boxes, zones)) ?? options.reduce((p, q) => (q.d < p.d ? q : p));
  const forward = along[pick.i] <= total - along[pick.i];
  return { a: tour[pick.i], b: pick.b, retrace: forward ? tour.slice(1, pick.i + 1) : tour.slice(pick.i, tour.length - 1).reverse() };
}

/** Finishes each group before moving on, then optionally walks back along lines already cut. */
function chain(groups: number[][], items: PlacedItem[], start: StartSpec, zones: Rect[], returnHome: boolean): Stroke {
  const boxes = items.map(box), pick = (g: number[]) => g.map(i => items[i]);
  const first = buildStroke(pick(groups[0]), start, zones);
  const path: Polygon = [...first.path], bridges = [...first.bridges], order = first.order.map(i => groups[0][i]);
  const connectors: Polygon[] = [];
  let unlinked = first.unlinked, tour = first.path;
  for (const g of groups.slice(1)) {
    const link = bestLink(tour, pick(g), items, boxes, zones);
    const next = buildStroke(pick(g), { x: link.b[0], y: link.b[1] }, zones);
    const connector = [tour[0], ...link.retrace, link.b];
    connectors.push(connector);
    path.push(...connector.slice(1), ...next.path);
    bridges.push([link.a, link.b], ...next.bridges.filter(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01));
    order.push(...next.order.map(i => g[i]));
    unlinked += next.unlinked;
    tour = next.path;
  }
  if (returnHome) for (let i = connectors.length - 1; i >= 0; i--) path.push(...[...connectors[i]].reverse());
  return { path: simplifyPath(path), bridges, unlinked, order };
}

export function buildCut(items: PlacedItem[], start: StartSpec, zones: Rect[], cut: CutOptions): Stroke {
  if (cut.order === 'shortest' || items.length < 2) return buildStroke(items, start, zones);
  return chain(cutGroups(items, cut.order), items, start, zones, cut.returnHome);
}

/** Length of moves along a line that was already cut, where the wire removes no new foam. */
export function retraceLength(path: Polygon): number {
  const seen = new Set<string>();
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], p = `${a[0]},${a[1]}`, q = `${b[0]},${b[1]}`, key = p < q ? p + ' ' + q : q + ' ' + p;
    if (seen.has(key)) total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    else seen.add(key);
  }
  return total;
}
