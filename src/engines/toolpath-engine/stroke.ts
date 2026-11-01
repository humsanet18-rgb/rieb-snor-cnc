import type { BBox, PlacedItem, Point, Polygon, Rect, StartSpec, Stroke } from '../../types/geometry';
import { bboxOf, boxGap, densify, pointInPoly, segHitsRect } from '../geometry-engine/geometry';

const DENSIFY = 2.5; // mm max spacing on contours used for bridge search

interface Node { pts: Polygon; part: number; hole: boolean; bbox: BBox }
interface Link { a: number; b: number; d: number; ia: number; ib: number }

function nearestPair(A: Node, B: Node, blocked?: (p: Point, q: Point) => boolean) {
  let best = Infinity, ia = 0, ib = 0;
  const P = A.pts, Q = B.pts;
  for (let i = 0; i < P.length; i++) {
    const x = P[i][0], y = P[i][1];
    for (let j = 0; j < Q.length; j++) {
      const dx = x - Q[j][0], dy = y - Q[j][1], d = dx * dx + dy * dy;
      if (d < best && !(blocked && blocked(P[i], Q[j]))) { best = d; ia = i; ib = j; }
    }
  }
  return { d: Math.sqrt(best), ia, ib };
}

export function simplifyPath(path: Polygon): Polygon {
  const R = (q: Point): Point => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100];
  const out: Polygon = [];
  for (const raw of path) {
    const q = R(raw);
    const n = out.length;
    if (n && out[n - 1][0] === q[0] && out[n - 1][1] === q[1]) continue;
    if (n > 1) {
      const a = out[n - 2], b = out[n - 1];
      const cross = (b[0] - a[0]) * (q[1] - b[1]) - (b[1] - a[1]) * (q[0] - b[0]);
      const dot = (b[0] - a[0]) * (q[0] - b[0]) + (b[1] - a[1]) * (q[1] - b[1]);
      if (Math.abs(cross) < 1e-6 && dot > 0) { out[n - 1] = q; continue; }
    }
    out.push(q);
  }
  return out;
}

export const pathLength = (p: Polygon): number => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
};

/**
 * The wire cannot lift, so every contour is linked into one tree (shortest links first)
 * and the tree is walked as a single continuous stroke that crosses each link twice.
 */
export function buildStroke(items: PlacedItem[], start: StartSpec, zones: Rect[] = []): Stroke {
  const nodes: Node[] = [];
  const rootPts: Polygon = 'box' in start
    ? [[start.box.x, start.box.y], [start.box.x + start.box.w, start.box.y], [start.box.x + start.box.w, start.box.y + start.box.h], [start.box.x, start.box.y + start.box.h]]
    : [[start.x || 0, start.y || 0]];
  nodes.push({ pts: 'box' in start ? densify(rootPts, DENSIFY) : rootPts, part: -1, hole: false, bbox: bboxOf(rootPts) });
  items.forEach((it, pi) => {
    for (const c of it.outers) { const pts = densify(c, DENSIFY); nodes.push({ pts, part: pi, hole: false, bbox: bboxOf(pts) }); }
    for (const c of it.holes) { const pts = densify(c, DENSIFY); nodes.push({ pts, part: pi, hole: true, bbox: bboxOf(pts) }); }
  });
  const N = nodes.length;
  const uf = nodes.map((_, i) => i);
  const find = (i: number): number => { while (uf[i] !== i) i = uf[i] = uf[uf[i]]; return i; };
  const allowed = (a: number, b: number) => {
    const A = nodes[a], B = nodes[b];
    if (A.hole && B.hole) return false;
    if (!A.hole && !B.hole) return true;
    const hole = A.hole ? A : B, other = A.hole ? B : A;
    return hole.part === other.part || (other.pts.length > 1 && pointInPoly(other.pts[0], hole.pts));
  };
  const cache = new Map<number, Link>();
  const crossesZone = (p: Point, q: Point) => zones.some(z => segHitsRect(p, q, z));
  const pairOf = (a: number, b: number): Link => {
    const lo = Math.min(a, b), hi = Math.max(a, b), k = lo * N + hi;
    let link = cache.get(k);
    if (!link) {
      let r = nearestPair(nodes[lo], nodes[hi]);
      if (zones.length && crossesZone(nodes[lo].pts[r.ia], nodes[hi].pts[r.ib])) {
        const around = nearestPair(nodes[lo], nodes[hi], crossesZone);
        // A link that must cross a corner stays only as the very last resort.
        r = isFinite(around.d) ? around : { d: r.d + 1e6, ia: r.ia, ib: r.ib };
      }
      link = { a: lo, b: hi, d: r.d, ia: r.ia, ib: r.ib };
      cache.set(k, link);
    }
    return link;
  };
  // Boruvka: each component takes its true nearest neighbour, using bbox gaps to skip far pairs.
  const links: Link[] = [];
  let comps = N;
  while (comps > 1) {
    const bestOf = new Map<number, Link>();
    for (let i = 0; i < N; i++) {
      const ri = find(i);
      const cand: [number, number][] = [];
      for (let j = 0; j < N; j++) {
        if (j !== i && find(j) !== ri && allowed(i, j)) cand.push([boxGap(nodes[i].bbox, nodes[j].bbox), j]);
      }
      cand.sort((p, q) => p[0] - q[0]);
      let cur = bestOf.get(ri);
      for (const [g, j] of cand) {
        if (cur && g >= cur.d) break;
        const pr = pairOf(i, j);
        if (!cur || pr.d < cur.d) { cur = pr; bestOf.set(ri, pr); }
      }
    }
    if (!bestOf.size) break;
    for (const pr of bestOf.values()) {
      const ra = find(pr.a), rb = find(pr.b);
      if (ra !== rb) { uf[ra] = rb; links.push(pr); comps--; }
    }
  }
  interface Edge { to: number; at: number; there: number }
  const adj: Edge[][] = nodes.map(() => []);
  for (const l of links) {
    adj[l.a].push({ to: l.b, at: l.ia, there: l.ib });
    adj[l.b].push({ to: l.a, at: l.ib, there: l.ia });
  }
  const path: Polygon = [], bridges: [Point, Point][] = [], order: number[] = [];
  const seen = new Uint8Array(N);
  const reached = new Set<number>();
  // An explicit stack: a long chain of contours must not run out of call stack.
  interface Frame { n: number; entry: number; k: number; at: Map<number, Edge[]>; pending: Edge[]; pos: number }
  const enter = (n: number, from: number, entry: number): Frame => {
    seen[n] = 1;
    if (nodes[n].part >= 0 && !reached.has(nodes[n].part)) { reached.add(nodes[n].part); order.push(nodes[n].part); }
    const at = new Map<number, Edge[]>();
    for (const e of adj[n]) {
      if (e.to === from) continue;
      if (!at.has(e.at)) at.set(e.at, []);
      at.get(e.at)!.push(e);
    }
    return { n, entry, k: 0, at, pending: [], pos: 0 };
  };
  const stack: Frame[] = [enter(0, -1, 0)];
  while (stack.length) {
    const f = stack[stack.length - 1], P = nodes[f.n].pts, L = P.length;
    if (f.pos < f.pending.length) {
      const e = f.pending[f.pos++];
      bridges.push([P[(f.entry + f.k) % L], nodes[e.to].pts[e.there]]);
      stack.push(enter(e.to, f.n, e.there));
      continue;
    }
    if (f.pending.length) { f.pending = []; f.pos = 0; f.k++; }
    if (f.k < L) {
      const idx = (f.entry + f.k) % L;
      path.push(P[idx]);
      const list = f.at.get(idx);
      if (list) f.pending = list;
      else f.k++;
      continue;
    }
    path.push(P[f.entry]);
    stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) {
      const Q = nodes[parent.n].pts;
      path.push(Q[(parent.entry + parent.k) % Q.length]);
    }
  }
  const unlinked = seen.reduce((s, v) => s + (v ? 0 : 1), 0);
  return { path: simplifyPath(path), bridges, unlinked, order };
}
