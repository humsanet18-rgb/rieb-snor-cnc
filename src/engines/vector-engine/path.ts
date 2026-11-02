import { matApply } from '../geometry-engine/geometry';
import type { BBox, Matrix, Point, Polygon } from '../../types/geometry';
import type { Subpath, VNode } from './types';

/** Same tolerance the SVG importer flattens curves with, so drawn and imported shapes cut alike. */
export const FLATTEN_MM = 0.04;

type Cubic = [Point, Point, Point, Point];

/** The segments of a subpath as cubics; a straight segment has its control points on the ends. */
export function cubics(s: Subpath): Cubic[] {
  const n = s.nodes, out: Cubic[] = [];
  const last = s.closed ? n.length : n.length - 1;
  for (let k = 0; k < last; k++) {
    const a = n[k], b = n[(k + 1) % n.length];
    out.push([a.p, a.o ?? a.p, b.i ?? b.p, b.p]);
  }
  return out;
}

const isLine = (c: Cubic) => c[1] === c[0] && c[2] === c[3];

function flatness(c: Cubic): number {
  const [a, , , d] = c, dx = d[0] - a[0], dy = d[1] - a[1], len = Math.hypot(dx, dy);
  const dist = (q: Point) => (len < 1e-9 ? Math.hypot(q[0] - a[0], q[1] - a[1]) : Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / len);
  return Math.max(dist(c[1]), dist(c[2]));
}

function split(c: Cubic): [Cubic, Cubic] {
  const mid = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const ab = mid(c[0], c[1]), bc = mid(c[1], c[2]), cd = mid(c[2], c[3]);
  const abc = mid(ab, bc), bcd = mid(bc, cd), m = mid(abc, bcd);
  return [[c[0], ab, abc, m], [m, bcd, cd, c[3]]];
}

function flattenCubic(c: Cubic, tol: number, out: Point[], depth = 0): void {
  if (isLine(c) || depth >= 18 || flatness(c) <= tol) { out.push(c[3]); return; }
  const [l, r] = split(c);
  flattenCubic(l, tol, out, depth + 1);
  flattenCubic(r, tol, out, depth + 1);
}

/** Straight-line version of a subpath within `tol` mm. A closed result does not repeat its first point. */
export function flatten(s: Subpath, tol = FLATTEN_MM): Polygon {
  if (!s.nodes.length) return [];
  const out: Point[] = [s.nodes[0].p];
  for (const c of cubics(s)) flattenCubic(c, tol, out);
  if (s.closed && out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) out.pop();
  }
  return out;
}

const mapPoint = (m: Matrix, q: Point): Point => matApply(m, q[0], q[1]);
const mapNode = (m: Matrix, n: VNode): VNode => ({ p: mapPoint(m, n.p), ...(n.i ? { i: mapPoint(m, n.i) } : {}), ...(n.o ? { o: mapPoint(m, n.o) } : {}) });

/** Affine maps keep Bézier curves exact, so transforming the nodes transforms the curve. */
export function transformSubpaths(list: Subpath[], m: Matrix): Subpath[] {
  return list.map(s => ({ closed: s.closed, nodes: s.nodes.map(n => mapNode(m, n)) }));
}

/** Parameter values in (0, 1) where one coordinate of a cubic has a turning point. */
function extrema(a: number, b: number, c: number, d: number): number[] {
  const qa = -a + 3 * b - 3 * c + d, qb = 2 * (a - 2 * b + c), qc = b - a;
  const ts: number[] = [];
  if (Math.abs(qa) < 1e-12) { if (Math.abs(qb) > 1e-12) ts.push(-qc / qb); }
  else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) { const r = Math.sqrt(disc); ts.push((-qb + r) / (2 * qa), (-qb - r) / (2 * qa)); }
  }
  return ts.filter(t => t > 0 && t < 1);
}

const at = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/** Exact bounds of the curves, not of their control points. */
export function subpathsBBox(list: Subpath[]): BBox | null {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number) => { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; };
  for (const s of list) {
    for (const n of s.nodes) add(n.p[0], n.p[1]);
    for (const c of cubics(s)) {
      if (isLine(c)) continue;
      for (const t of extrema(c[0][0], c[1][0], c[2][0], c[3][0])) add(at(c[0][0], c[1][0], c[2][0], c[3][0], t), at(c[0][1], c[1][1], c[2][1], c[3][1], t));
      for (const t of extrema(c[0][1], c[1][1], c[2][1], c[3][1])) add(at(c[0][0], c[1][0], c[2][0], c[3][0], t), at(c[0][1], c[1][1], c[2][1], c[3][1], t));
    }
  }
  return Number.isFinite(b.x0) ? b : null;
}

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** SVG path data with the curves kept as curves. */
export function pathData(list: Subpath[]): string {
  let d = '';
  for (const s of list) {
    if (!s.nodes.length) continue;
    d += `M${f(s.nodes[0].p[0])} ${f(s.nodes[0].p[1])}`;
    const list = cubics(s);
    list.forEach((c, k) => {
      // Z draws the closing straight segment itself.
      if (s.closed && k === list.length - 1 && isLine(c)) return;
      d += isLine(c) ? `L${f(c[3][0])} ${f(c[3][1])}` : `C${f(c[1][0])} ${f(c[1][1])} ${f(c[2][0])} ${f(c[2][1])} ${f(c[3][0])} ${f(c[3][1])}`;
    });
    if (s.closed) d += 'Z';
  }
  return d;
}

/** Runs the subpath the other way round; for a wire, that is the cutting direction. */
export function reverseSubpath(s: Subpath): Subpath {
  const nodes = [...s.nodes].reverse().map(n => ({ p: n.p, ...(n.o ? { i: n.o } : {}), ...(n.i ? { o: n.i } : {}) }));
  return { closed: s.closed, nodes };
}

export const nodeCount = (list: Subpath[]): number => list.reduce((sum, s) => sum + s.nodes.length, 0);

/** Even-odd containment against flattened subpaths, matching how the importer treats holes. */
export function pointInSubpaths(pt: Point, polys: Polygon[]): boolean {
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function distanceToPolyline(pt: Point, poly: Polygon, closed: boolean): number {
  let best = Infinity;
  const last = closed ? poly.length : poly.length - 1;
  for (let k = 0; k < last; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy)));
  }
  return poly.length === 1 ? Math.hypot(pt[0] - poly[0][0], pt[1] - poly[0][1]) : best;
}

/** Ramer–Douglas–Peucker, for freehand strokes. */
export function simplifyPoints(pts: Point[], tol: number): Point[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let far = -1, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distanceToPolyline(pts[k], [pts[i], pts[j]], false);
      if (d > far) { far = d; idx = k; }
    }
    if (far > tol && idx > 0) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Smooth Catmull-Rom curve through points, as cubic nodes; used for freehand drawing. */
export function smoothNodes(pts: Point[], closed: boolean): VNode[] {
  const n = pts.length;
  return pts.map((p, k) => {
    const prev = pts[closed ? (k - 1 + n) % n : Math.max(0, k - 1)], next = pts[closed ? (k + 1) % n : Math.min(n - 1, k + 1)];
    const tx = (next[0] - prev[0]) / 6, ty = (next[1] - prev[1]) / 6;
    const ends = !closed && (k === 0 || k === n - 1);
    return ends ? { p, ...(k === 0 ? { o: [p[0] + tx, p[1] + ty] as Point } : { i: [p[0] - tx, p[1] - ty] as Point }) } : { p, i: [p[0] - tx, p[1] - ty], o: [p[0] + tx, p[1] + ty] };
  });
}
