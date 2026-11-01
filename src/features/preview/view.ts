/** Canvas view: `s` is pixels per mm, (x, y) is where sheet X0 Y0 sits in pixels. */
export interface View { s: number; x: number; y: number }

export const RULER = 26, MIN_SCALE = 0.05, MAX_SCALE = 40;

export function fitView(w: number, h: number, sheetW: number, sheetH: number): View {
  const pad = 24, s = Math.max(MIN_SCALE, Math.min((w - RULER - pad * 2) / sheetW, (h - RULER - pad * 2) / sheetH));
  return { s, x: RULER + (w - RULER - sheetW * s) / 2, y: RULER + (h - RULER - sheetH * s) / 2 };
}

/** Zooms around a screen point, which stays over the same spot of the sheet. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor)), k = s / v.s;
  return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

/** Round mm spacing that gives ticks at least `minPx` apart. */
export function tickStep(scale: number, minPx: number): number {
  for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) if (step * scale >= minPx) return step;
  return 20000;
}

export function ticks(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v);
  return out;
}

/** Interpolated point at `distance` mm along a path, for playback. */
export function pointAlong(path: [number, number][], cumulative: number[], distance: number): [number, number] {
  if (!path.length) return [0, 0];
  if (distance <= 0) return path[0];
  let lo = 0, hi = cumulative.length - 1;
  if (distance >= cumulative[hi]) return path[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cumulative[m] <= distance) lo = m; else hi = m; }
  const k = (distance - cumulative[lo]) / ((cumulative[hi] - cumulative[lo]) || 1);
  return [path[lo][0] + (path[hi][0] - path[lo][0]) * k, path[lo][1] + (path[hi][1] - path[lo][1]) * k];
}

export function cumulativeLengths(path: [number, number][]): number[] {
  const out = new Array<number>(path.length);
  let s = 0;
  path.forEach((q, i) => {
    if (i) s += Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1]);
    out[i] = s;
  });
  return out;
}
