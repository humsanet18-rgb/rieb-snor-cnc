import type { BBox, Matrix, Point, Polygon, Rect } from '../../types/geometry';

export const matMul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
export const matApply = (m: Matrix, x: number, y: number): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function polyArea(p: Polygon): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}

export function bboxOf(p: Polygon): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) {
    if (q[0] < x0) x0 = q[0];
    if (q[0] > x1) x1 = q[0];
    if (q[1] < y0) y0 = q[1];
    if (q[1] > y1) y1 = q[1];
  }
  return { x0, y0, x1, y1 };
}

export function pointInPoly(pt: Point, poly: Polygon): boolean {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function segCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
  const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Liang-Barsky: does segment a-b touch rectangle r? */
export function segHitsRect(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const edges: [number, number][] = [[-dx, a[0] - r.x], [dx, r.x + r.w - a[0]], [-dy, a[1] - r.y], [dy, r.y + r.h - a[1]]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

export function densify(pts: Polygon, step: number): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > step) {
      const n = Math.ceil(d / step);
      for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
  }
  return out;
}

export function pointSegDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export const boxGap = (a: BBox, b: BBox): number =>
  Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));

/** Exact smallest distance between two closed contours; 0 when their edges cross. */
export function contourDistance(A: Polygon, B: Polygon): number {
  const bb = bboxOf(B);
  let best = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length];
    const seg: BBox = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
    if (boxGap(seg, bb) >= best) continue;
    for (let j = 0; j < B.length; j++) {
      const c = B[j], d = B[(j + 1) % B.length];
      if (segCross(a, b, c, d)) return 0;
      const v = Math.min(pointSegDistance(a, c, d), pointSegDistance(b, c, d), pointSegDistance(c, a, b), pointSegDistance(d, a, b));
      if (v < best) best = v;
    }
  }
  return best;
}

/** Rotates by `deg` around the part origin, then moves by (tx, ty): the one transform every placement uses. */
export function placeTransform(deg: number, tx: number, ty: number): (q: Point) => Point {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return q => [q[0] * c - q[1] * s + tx, q[0] * s + q[1] * c + ty];
}
