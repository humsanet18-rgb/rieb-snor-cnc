import type { Point, Polygon } from '../../types/geometry';
import { polyArea } from '../geometry-engine/geometry';

/**
 * Outlines of a coverage image (one byte per pixel, row by row), as closed polygons in pixel units.
 * Marching squares on pixel centres, with each crossing placed by linear interpolation of the coverage,
 * so an anti-aliased rendering gives sub-pixel edges. Touching or overlapping shapes come out as one outline.
 */
export function traceCoverage(alpha: ArrayLike<number>, w: number, h: number, threshold = 128): Polygon[] {
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : alpha[j * w + i]);
  const gw = w + 2;
  // Edge ids: horizontal edge from sample (i, j) to (i + 1, j) is even, vertical edge from (i, j) to (i, j + 1) is odd.
  const hEdge = (i: number, j: number) => ((j + 1) * gw + (i + 1)) * 2;
  const vEdge = (i: number, j: number) => ((j + 1) * gw + (i + 1)) * 2 + 1;
  const next = new Map<number, number>();
  const where = new Map<number, Point>();
  const cross = (a: number, b: number) => (a === b ? 0.5 : (threshold - a) / (b - a));
  const point = (id: number): Point => {
    let p = where.get(id);
    if (p) return p;
    const cell = id >> 1, i = (cell % gw) - 1, j = Math.floor(cell / gw) - 1;
    p = id & 1 ? [i + 0.5, j + 0.5 + cross(at(i, j), at(i, j + 1))] : [i + 0.5 + cross(at(i, j), at(i + 1, j)), j + 0.5];
    where.set(id, p);
    return p;
  };

  for (let j = -1; j < h; j++) {
    for (let i = -1; i < w; i++) {
      const tl = at(i, j), tr = at(i + 1, j), br = at(i + 1, j + 1), bl = at(i, j + 1);
      let c = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0) | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
      if (c === 0 || c === 15) continue;
      if ((c === 5 || c === 10) && (tl + tr + br + bl) / 4 >= threshold) c += 16;
      const edges = [hEdge(i, j), vEdge(i + 1, j), hEdge(i, j + 1), vEdge(i, j)];
      for (const [from, to] of TABLE[c]) next.set(edges[from], edges[to]);
    }
  }

  const out: Polygon[] = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const ring: Polygon = [];
    let id: number | undefined = start;
    while (id !== undefined && next.has(id)) {
      ring.push(point(id));
      const to: number = next.get(id)!;
      next.delete(id);
      id = to;
    }
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

/* Edges of a cell: 0 top, 1 right, 2 bottom, 3 left. Corner bits: 8 top-left, 4 top-right, 2 bottom-right, 1 bottom-left.
 * Each case lists directed segments with the inside always on the same side, so every crossing has exactly one
 * segment leaving it and rings can be followed without searching. Cases 21 and 26 are the saddles joined through the middle. */
const MID: Point[] = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const CORNER: Record<number, Point> = { 8: [0, 0], 4: [1, 0], 2: [1, 1], 1: [0, 1] };
const SHARED: Record<string, number> = { '0,1': 4, '1,2': 2, '2,3': 1, '0,3': 8 };
const PAIRS: Record<number, [number, number][]> = {
  1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 6: [[0, 2]], 7: [[0, 3]], 8: [[0, 3]], 9: [[0, 2]],
  11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
  5: [[0, 1], [3, 2]], 21: [[0, 3], [2, 1]], 10: [[0, 3], [2, 1]], 26: [[0, 1], [3, 2]]
};
const TABLE: [number, number][][] = Array.from({ length: 27 }, (_, c) => (PAIRS[c] ?? []).map(([a, b]) => {
  const key = a < b ? `${a},${b}` : `${b},${a}`, ref = SHARED[key] ?? 8, mask = c & 15;
  const [p, q, k] = [MID[a], MID[b], CORNER[ref]];
  const side = (q[0] - p[0]) * (k[1] - p[1]) - (q[1] - p[1]) * (k[0] - p[0]);
  return (side > 0) === ((mask & ref) !== 0) ? [a, b] as [number, number] : [b, a] as [number, number];
}));

/** Douglas-Peucker on a closed ring; keeps every point further than `tolerance` from the simplified outline. */
export function simplifyRing(ring: Polygon, tolerance: number): Polygon {
  if (ring.length <= 4 || tolerance <= 0) return ring;
  let far = 0, best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, ring.length]];
  while (stack.length) {
    const [a, b] = stack.pop()!, p = ring[a], q = ring[b % ring.length];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    let worst = -1, index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((ring[i][0] - p[0]) * dy - (ring[i][1] - p[1]) * dx) / len;
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > tolerance) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : ring;
}

/** Rows and columns that hold ink, or null for a blank image. */
export function inkBounds(alpha: ArrayLike<number>, w: number, h: number, threshold = 128): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (alpha[j * w + i] < threshold) continue;
    if (i < x0) x0 = i; if (i > x1) x1 = i;
    if (j < y0) y0 = j; if (j > y1) y1 = j;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export interface TraceOptions { threshold?: number; tolerance: number; minArea: number }

/** Outlines in pixels, simplified, with specks below `minArea` square pixels dropped. */
export function outlines(alpha: ArrayLike<number>, w: number, h: number, o: TraceOptions): Polygon[] {
  return traceCoverage(alpha, w, h, o.threshold)
    .filter(r => Math.abs(polyArea(r)) >= o.minArea)
    .map(r => simplifyRing(r, o.tolerance));
}
