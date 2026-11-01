import type { Part, Polygon, Rect } from '../../types/geometry';
import type { RowSettings } from '../../types/project';
import type { NestResult, Placement } from './nest';

export interface RowOptions extends RowSettings {
  sheetW: number; sheetH: number; gap: number; margin: number;
  startBox: Rect | null; zones: Rect[];
}

/** Min and max of the other axis inside each 1 mm band along one axis. */
interface Profile { from: number; lo: number[]; hi: number[] }

function profile(polys: Polygon[], u: 0 | 1, du: number): Profile {
  const v = u ? 0 : 1;
  let min = Infinity, max = -Infinity;
  for (const p of polys) for (const q of p) { min = Math.min(min, q[u] + du); max = Math.max(max, q[u] + du); }
  const from = Math.floor(min), n = Math.floor(max) - from + 1;
  const lo = new Array<number>(n).fill(Infinity), hi = new Array<number>(n).fill(-Infinity);
  const mark = (k: number, value: number) => {
    const i = k - from;
    if (value < lo[i]) lo[i] = value;
    if (value > hi[i]) hi[i] = value;
  };
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], u0 = a[u] + du, u1 = b[u] + du;
    const first = Math.floor(Math.min(u0, u1)), last = Math.floor(Math.max(u0, u1));
    for (let k = first; k <= last; k++) {
      const span = u1 - u0, at = (t: number) => (span ? a[v] + (b[v] - a[v]) * Math.min(1, Math.max(0, (t - u0) / span)) : a[v]);
      mark(k, at(k));
      mark(k, at(k + 1));
      if (!span) mark(k, b[v]);
    }
  }
  return { from, lo, hi };
}

/** A plain rectangle profile, used when pieces are spaced by their boxes. */
function boxProfile(p: Profile): Profile {
  const lo = Math.min(...p.lo), hi = Math.max(...p.hi);
  return { from: p.from, lo: p.lo.map(() => lo), hi: p.hi.map(() => hi) };
}

/** Clearance needed between two bands `d` apart so the true distance stays at least the gap. */
function clearances(gap: number): number[] {
  const g = gap + 0.02, out: number[] = [];
  for (let d = 0; ; d++) {
    const dy = Math.max(0, d - 1);
    if (dy >= g) return out;
    out.push(Math.sqrt(g * g - dy * dy));
  }
}

/**
 * Rows of letters of about the same height. A row is laid left to right and the next one
 * goes below it, so the foam can be cut one row at a time. Pieces stay upright.
 */
export function arrangeRows(parts: Part[], o: RowOptions): NestResult {
  const { sheetW: W, sheetH: H, margin: m, gap } = o;
  const clr = clearances(gap), reach = clr.length - 1;
  const blockers = [...o.zones, ...(o.startBox ? [o.startBox] : [])];
  const heightOf = (i: number) => parts[i].bbox.y1 - parts[i].bbox.y0, widthOf = (i: number) => parts[i].bbox.x1 - parts[i].bbox.x0;
  const usableW = W - m * 2, usableH = H - m * 2;
  const unplaced: number[] = [];
  let remaining = parts.map((_, i) => i).filter(i => {
    const fits = widthOf(i) <= usableW && heightOf(i) <= usableH;
    if (!fits) unplaced.push(i);
    return fits;
  });
  if (o.order === 'height') remaining.sort((a, b) => heightOf(b) - heightOf(a) || a - b);

  const bandCount = Math.ceil(Math.max(W, H)) + 3;
  const newBelow = () => {
    const below = new Float64Array(bandCount).fill(-Infinity);
    for (const b of blockers) {
      if (b.y + b.h / 2 > H / 2) continue;
      for (let x = Math.max(0, Math.floor(b.x)); x <= b.x + b.w && x < bandCount; x++) below[x] = Math.max(below[x], b.y + b.h);
    }
    return below;
  };

  interface Laid { idx: number; tx: number; ty: number; top: Profile; bottom: Profile }

  /** Lays one row with its top at y0, skipping pieces that no longer fit in the width. */
  function layRow(y0: number, rowH: number, members: number[]): Laid[] {
    const sky = new Float64Array(bandCount).fill(-Infinity), limit = new Float64Array(bandCount).fill(W - m);
    for (const b of blockers) {
      const left = b.x + b.w / 2 < W / 2;
      if (left) {
        for (let y = Math.max(0, Math.floor(b.y)); y <= b.y + b.h && y < bandCount; y++) sky[y] = Math.max(sky[y], b.x + b.w);
      } else {
        for (let y = Math.max(0, Math.floor(b.y - gap - 1)); y <= b.y + b.h + gap + 1 && y < bandCount; y++) limit[y] = Math.min(limit[y], b.x - gap);
      }
    }
    const laid: Laid[] = [];
    for (const idx of members) {
      const part = parts[idx], h = heightOf(idx);
      const py = y0 + (o.align === 'top' ? 0 : o.align === 'center' ? (rowH - h) / 2 : rowH - h);
      const ty = py - part.bbox.y0, exact = profile(part.outers, 1, ty), side = o.tight ? exact : boxProfile(exact);
      let tx = m - part.bbox.x0;
      side.lo.forEach((lo, i) => {
        const band = side.from + i;
        for (let d = -reach; d <= reach; d++) {
          const j = band + d;
          if (j >= 0 && j < bandCount && sky[j] > -Infinity) tx = Math.max(tx, sky[j] + clr[Math.abs(d)] - lo);
        }
      });
      const fits = side.hi.every((hi, i) => hi + tx <= limit[Math.min(bandCount - 1, Math.max(0, side.from + i))]);
      if (!fits) { if (o.order === 'file') break; continue; }
      side.hi.forEach((hi, i) => {
        const band = side.from + i;
        if (band >= 0 && band < bandCount) sky[band] = Math.max(sky[band], hi + tx);
      });
      const top = profile(part.outers, 0, tx);
      laid.push({ idx, tx, ty, top: o.tight ? top : boxProfile(top), bottom: o.tight ? top : boxProfile(top) });
    }
    return laid;
  }

  const sheets: Placement[][] = [];
  let current: Placement[] = [], below = newBelow(), y = m, ceiling = m;
  const closeSheet = () => { sheets.push(current); current = []; below = newBelow(); y = m; ceiling = m; };

  while (remaining.length) {
    const lead = remaining[0];
    let rowH = heightOf(lead), members: number[];
    if (o.order === 'file') {
      members = [];
      let used = 0;
      for (const i of remaining) {
        if (members.length && used + widthOf(i) > usableW) break;
        members.push(i);
        used += widthOf(i) + gap;
      }
      rowH = Math.max(...members.map(heightOf));
    } else {
      members = remaining.filter(i => o.fillGaps || heightOf(i) >= rowH - o.tolerance);
    }
    const laid = layRow(y, rowH, members);
    // Raise the whole row into the shapes of the row above, keeping it straight and below that row's middle.
    let shift = 0;
    if (laid.length && o.tight) {
      shift = Math.max(0, Math.min(...laid.map(l => parts[l.idx].bbox.y0 + l.ty)) - ceiling);
      for (const l of laid) {
        l.top.lo.forEach((lo, i) => {
          const band = l.top.from + i;
          for (let d = -reach; d <= reach; d++) {
            const j = band + d;
            if (j >= 0 && j < bandCount && below[j] > -Infinity) shift = Math.min(shift, lo + l.ty - below[j] - clr[Math.abs(d)]);
          }
        });
      }
      shift = Math.max(0, shift);
    }
    const bottom = laid.length ? Math.max(...laid.map(l => parts[l.idx].bbox.y1 + l.ty - shift)) : Infinity;
    if (!laid.length || bottom > H - m) {
      if (current.length) { closeSheet(); continue; }
      unplaced.push(lead);
      remaining = remaining.slice(1);
      continue;
    }
    for (const l of laid) {
      current.push({ idx: l.idx, deg: 0, tx: l.tx, ty: l.ty - shift });
      l.bottom.hi.forEach((hi, i) => {
        const band = l.bottom.from + i;
        if (band >= 0 && band < bandCount) below[band] = Math.max(below[band], hi + l.ty - shift);
      });
    }
    const placed = new Set(laid.map(l => l.idx));
    remaining = remaining.filter(i => !placed.has(i));
    ceiling = (Math.min(...laid.map(l => parts[l.idx].bbox.y0 + l.ty - shift)) + bottom) / 2;
    y = Math.max(y, bottom + gap);
  }
  if (current.length) sheets.push(current);
  return { sheets, unplaced, passes: 1 };
}
