import type { BBox, Part, Polygon } from '../../types/geometry';
import { bboxOf } from '../geometry-engine/geometry';

export interface Raster { w: number; h: number; rows: [number, number][][] }

export interface Variant { deg: number; bbox: BBox; w: number; h: number; solid: Int32Array; reach: Int32Array }

function rotateOuters(part: Part, deg: number) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const outers: Polygon[] = part.outers.map(p => p.map(q => [q[0] * c - q[1] * s, q[0] * s + q[1] * c]));
  return { outers, bbox: bboxOf(outers.flat()) };
}

/** Conservative raster: every cell the outline touches is solid. Holes count as solid for nesting. */
export function rasterize(outers: Polygon[], bb: BBox, cell: number): Raster {
  const w = Math.ceil((bb.x1 - bb.x0) / cell) + 1, h = Math.ceil((bb.y1 - bb.y0) / cell) + 1;
  const g = new Uint8Array(w * h);
  for (const poly of outers) {
    const P = poly.map(q => [(q[0] - bb.x0) / cell, (q[1] - bb.y0) / cell]);
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
        g[Math.min(h - 1, y | 0) * w + Math.min(w - 1, x | 0)] = 1;
      }
    }
    for (let row = 0; row < h; row++) { // interior, even-odd at row centres
      const y = row + 0.5, xs: number[] = [];
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const a = P[i], b = P[j];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.max(0, xs[i] | 0); x <= Math.min(w - 1, xs[i + 1] | 0); x++) g[row * w + x] = 1;
      }
    }
  }
  const rows: [number, number][][] = [];
  for (let y = 0; y < h; y++) {
    const spans: [number, number][] = [];
    for (let x = 0; x < w; x++) {
      if (g[y * w + x]) { const s = x; while (x < w && g[y * w + x]) x++; spans.push([s, x]); }
    }
    rows.push(spans);
  }
  return { w, h, rows };
}

/** Dilates by a disc: `solid` is what others must avoid, `reach` is what must stay clear. */
export function dilate(r: Raster, rad: number): Int32Array {
  const out = new Map<number, [number, number][]>();
  for (let y = 0; y < r.h; y++) for (const sp of r.rows[y]) {
    for (let dy = -rad; dy <= rad; dy++) {
      const hw = Math.floor(Math.sqrt(rad * rad - dy * dy));
      const yy = y + dy;
      if (!out.has(yy)) out.set(yy, []);
      out.get(yy)!.push([sp[0] - hw, sp[1] + hw]);
    }
  }
  const spans: number[] = [];
  for (const [yy, list] of out) {
    list.sort((a, b) => a[0] - b[0]);
    let c: [number, number] | null = null;
    for (const s of list) {
      if (c && s[0] <= c[1]) c[1] = Math.max(c[1], s[1]);
      else { if (c) spans.push(yy, c[0], c[1]); c = [s[0], s[1]]; }
    }
    if (c) spans.push(yy, c[0], c[1]);
  }
  // Longest spans first: a blocked position then fails on the first few checks.
  const order: number[] = [];
  for (let i = 0; i < spans.length; i += 3) order.push(i);
  order.sort((p, q) => (spans[q + 2] - spans[q + 1]) - (spans[p + 2] - spans[p + 1]));
  const sorted = new Int32Array(spans.length);
  order.forEach((from, k) => { sorted[k * 3] = spans[from]; sorted[k * 3 + 1] = spans[from + 1]; sorted[k * 3 + 2] = spans[from + 2]; });
  return sorted;
}

function solidSpans(r: Raster): Int32Array {
  const s: number[] = [];
  for (let y = 0; y < r.h; y++) for (const sp of r.rows[y]) s.push(y, sp[0], sp[1]);
  return Int32Array.from(s);
}

export class SheetGrid {
  g: Uint8Array;
  pre: Int32Array;
  placed: { idx: number; x: number; y: number; deg: number; bbox: BBox }[] = [];
  failed = new Set<Variant[]>(); // shapes known not to fit; a sheet only ever gets fuller
  used = 0;
  constructor(public W: number, public H: number) {
    this.g = new Uint8Array(W * H);
    this.pre = new Int32Array((W + 1) * H);
  }
  block(x0: number, y0: number, x1: number, y1: number) {
    for (let y = Math.max(0, y0); y < Math.min(this.H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(this.W, x1); x++) this.g[y * this.W + x] = 1;
    this.refresh();
  }
  refresh() {
    const { W, H, g, pre } = this;
    for (let y = 0; y < H; y++) {
      let s = 0;
      const off = y * (W + 1), goff = y * W;
      pre[off] = 0;
      for (let x = 0; x < W; x++) { s += g[goff + x]; pre[off + x + 1] = s; }
    }
  }
  free(reach: Int32Array, ox: number, oy: number): boolean {
    const { W, H, pre } = this, L = W + 1;
    for (let i = 0; i < reach.length; i += 3) {
      const y = reach[i] + oy;
      if (y < 0 || y >= H) continue;
      let a = reach[i + 1] + ox, b = reach[i + 2] + ox;
      if (a < 0) a = 0;
      if (b > W) b = W;
      if (a >= b) continue;
      const off = y * L;
      if (pre[off + b] !== pre[off + a]) return false;
    }
    return true;
  }
  stamp(solid: Int32Array, ox: number, oy: number) {
    const { W, H, g } = this;
    for (let i = 0; i < solid.length; i += 3) {
      const y = solid[i] + oy;
      if (y < 0 || y >= H) continue;
      const a = Math.max(0, solid[i + 1] + ox), b = Math.min(W, solid[i + 2] + ox);
      for (let x = a; x < b; x++) g[y * W + x] = 1;
    }
    this.refresh();
  }
}

/**
 * Two cells kept `rad` apart hold points at least (rad - sqrt 2) cells apart,
 * so this radius guarantees the requested gap whatever the outline does inside a cell.
 */
export const gapRadius = (gap: number, cell: number): number => Math.ceil(gap / cell + Math.SQRT2);

/** Copies of one design share the same part object, so each shape is rasterized once. */
export async function makeVariants(parts: Part[], anglesOf: (i: number) => number[], cell: number, gap: number, tick?: () => unknown): Promise<Variant[][]> {
  const rad = gapRadius(gap, cell);
  const memo = new Map<Part, Map<string, Variant[]>>(), out: Variant[][] = [];
  let lastTick = Date.now();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (tick && Date.now() - lastTick > 150) { await tick(); lastTick = Date.now(); }
    const angles = anglesOf(i);
    const key = angles.join();
    if (!memo.has(p)) memo.set(p, new Map());
    const byAngles = memo.get(p)!;
    if (!byAngles.has(key)) {
      byAngles.set(key, angles.map(deg => {
        const rp = rotateOuters(p, deg);
        const r = rasterize(rp.outers, rp.bbox, cell);
        return { deg, bbox: rp.bbox, w: r.w, h: r.h, solid: solidSpans(r), reach: dilate(r, rad) };
      }));
    }
    out.push(byAngles.get(key)!);
  }
  return out;
}
