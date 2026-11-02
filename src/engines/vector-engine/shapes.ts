import type { Point } from '../../types/geometry';
import type { Subpath, VNode } from './types';

/** Circle-to-cubic constant: four quarter arcs within 0.03% of a true ellipse. */
const KAPPA = 0.5522847498;

const line = (pts: Point[], closed: boolean): Subpath => ({ closed, nodes: pts.map(p => ({ p })) });

export function rectangle(x: number, y: number, w: number, h: number): Subpath[] {
  return [line([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true)];
}

export function ellipse(x: number, y: number, w: number, h: number): Subpath[] {
  const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry, kx = rx * KAPPA, ky = ry * KAPPA;
  const nodes: VNode[] = [
    { p: [cx, y], i: [cx - kx, y], o: [cx + kx, y] },
    { p: [x + w, cy], i: [x + w, cy - ky], o: [x + w, cy + ky] },
    { p: [cx, y + h], i: [cx + kx, y + h], o: [cx - kx, y + h] },
    { p: [x, cy], i: [x, cy + ky], o: [x, cy - ky] }
  ];
  return [{ closed: true, nodes }];
}

/** Regular polygon fitted to the box, first corner at the top. */
export function polygon(x: number, y: number, w: number, h: number, sides: number): Subpath[] {
  const n = Math.max(3, Math.round(sides));
  const pts: Point[] = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
    pts.push([x + w / 2 + (w / 2) * Math.cos(a), y + h / 2 + (h / 2) * Math.sin(a)]);
  }
  return [line(pts, true)];
}

/** Star with `points` tips; `inner` is the inner radius as a share of the outer one. */
export function star(x: number, y: number, w: number, h: number, points: number, inner: number): Subpath[] {
  const n = Math.max(3, Math.round(points)), r = Math.min(0.95, Math.max(0.05, inner));
  const pts: Point[] = [];
  for (let k = 0; k < n * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / n, s = k % 2 ? r : 1;
    pts.push([x + w / 2 + (w / 2) * s * Math.cos(a), y + h / 2 + (h / 2) * s * Math.sin(a)]);
  }
  return [line(pts, true)];
}

/** Archimedean spiral from the centre outwards, as an open curve. */
export function spiral(x: number, y: number, w: number, h: number, turns: number): Subpath[] {
  const t = Math.max(1, Math.min(20, turns)), steps = Math.ceil(t * 16), cx = x + w / 2, cy = y + h / 2;
  const pts: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * t * 2 * Math.PI, f = k / steps;
    pts.push([cx + (w / 2) * f * Math.cos(a), cy + (h / 2) * f * Math.sin(a)]);
  }
  return [line(pts, false)];
}

/** Graph-paper grid: one closed cell per row and column, so each cell is its own contour. */
export function grid(x: number, y: number, w: number, h: number, cols: number, rows: number): Subpath[] {
  const c = Math.max(1, Math.min(50, Math.round(cols))), r = Math.max(1, Math.min(50, Math.round(rows)));
  const out: Subpath[] = [];
  for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) out.push(...rectangle(x + (i * w) / c, y + (j * h) / r, w / c, h / r));
  return out;
}

export function segment(a: Point, b: Point): Subpath[] {
  return [line([a, b], false)];
}

export function polyline(pts: Point[], closed: boolean): Subpath[] {
  return [line(pts, closed)];
}
