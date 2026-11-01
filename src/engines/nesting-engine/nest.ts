import type { Part, Rect } from '../../types/geometry';
import { makeVariants, SheetGrid, type Variant } from './raster';

export type FillDirection = 'rows' | 'columns';

export interface NestOptions {
  sheetW: number; sheetH: number; gap: number; margin: number; angles: number[];
  /** Per-part rotation choice; falls back to `angles`. */
  anglesOf?: (i: number) => number[];
  cell: number; fineCell: number; seconds: number;
  startBox: Rect | null; zones: Rect[]; fill: FillDirection;
}

export interface NestProgress { stage: 'search' | 'fine'; pass: number; sheets: number; t: number }

/** Where a part goes: rotate by `deg` around its own origin, then move by (tx, ty). */
export interface Placement { idx: number; deg: number; tx: number; ty: number }

export interface NestResult { sheets: Placement[][]; unplaced: number[]; passes: number }

interface PassConfig {
  W: number; H: number; marginCells: number;
  startCells: { w: number; h: number } | null;
  zoneCells: { x0: number; y0: number; x1: number; y1: number }[];
  sizeBias: number; flip: boolean; rows: boolean;
}

const defaults: NestOptions = {
  sheetW: 1000, sheetH: 480, gap: 5, margin: 8, angles: [0, 90, 180, 270],
  cell: 3, fineCell: 1.25, seconds: 6, startBox: null, zones: [], fill: 'rows'
};

/**
 * One greedy pass over `order` (part indexes): first sheet that fits, earliest spot in it.
 * cfg.rows fills rows from Y0, leaving a full-width strip on the clamped side;
 * otherwise it fills columns from X0, leaving a full-height strip on the right.
 */
async function greedyPass(order: number[], variants: Variant[][], cfg: PassConfig, tick?: () => unknown) {
  let lastTick = Date.now();
  const sheets: SheetGrid[] = [], unplaced: number[] = [];
  const newSheet = () => {
    const s = new SheetGrid(cfg.W, cfg.H);
    if (cfg.startCells) s.block(0, 0, cfg.startCells.w, cfg.startCells.h);
    for (const z of cfg.zoneCells) s.block(z.x0, z.y0, z.x1, z.y1);
    sheets.push(s);
    return s;
  };
  const m = cfg.marginCells;
  interface Spot { x: number; y: number; v: Variant; score: number }
  const tryPlace = (s: SheetGrid, vs: Variant[]): Spot | null => {
    let best: Spot | null = null;
    for (const v of vs) {
      const xMax = cfg.W - m - v.w, yMax = cfg.H - m - v.h;
      const mainMax = cfg.rows ? yMax : xMax, crossMax = cfg.rows ? xMax : yMax, size = cfg.rows ? v.h : v.w;
      for (let a = m; a <= mainMax; a++) {
        if (best && a + size * cfg.sizeBias >= best.score) break;
        let found = false;
        for (let k = 0; k <= crossMax - m; k++) {
          const c = cfg.flip ? crossMax - k : m + k;
          const x = cfg.rows ? c : a, y = cfg.rows ? a : c;
          if (s.free(v.reach, x, y)) {
            const score = a + size * cfg.sizeBias;
            if (!best || score < best.score) best = { x, y, v, score };
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    return best;
  };
  const commit = (s: SheetGrid, idx: number, b: Spot) => {
    s.stamp(b.v.solid, b.x, b.y);
    s.placed.push({ idx, x: b.x, y: b.y, deg: b.v.deg, bbox: b.v.bbox });
    s.used = Math.max(s.used, cfg.rows ? b.y + b.v.h : b.x + b.v.w);
  };
  for (const idx of order) {
    const vs = variants[idx];
    let done = false;
    for (const s of sheets.length ? sheets : [newSheet()]) {
      if (s.failed.has(vs)) continue;
      if (tick && Date.now() - lastTick > 150) { await tick(); lastTick = Date.now(); }
      const b = tryPlace(s, vs);
      if (b) { commit(s, idx, b); done = true; break; }
      s.failed.add(vs);
    }
    if (done) continue;
    const s = newSheet();
    const b = tryPlace(s, vs);
    if (b) commit(s, idx, b);
    else { sheets.pop(); unplaced.push(idx); }
  }
  return { sheets: sheets.filter(s => s.placed.length), unplaced };
}

/** Searches until the time budget ends and returns the best layout it found, which need not be the optimum. */
export async function nest(parts: Part[], opts: Partial<NestOptions>, onProgress?: (p: NestProgress) => unknown): Promise<NestResult> {
  const o: NestOptions = { ...defaults, ...opts };
  const grow = Math.max(1, Math.sqrt(o.sheetW * o.sheetH / 480000)); // big sheets get a coarser grid
  const coarseCell = o.cell * grow, fineCell = o.fineCell * grow;
  const mkCfg = (cell: number): PassConfig => ({
    W: Math.floor(o.sheetW / cell), H: Math.floor(o.sheetH / cell),
    marginCells: Math.ceil(o.margin / cell),
    startCells: o.startBox ? { w: Math.ceil((o.startBox.x + o.startBox.w + o.gap) / cell) + 1, h: Math.ceil((o.startBox.y + o.startBox.h + o.gap) / cell) + 1 } : null,
    zoneCells: o.zones.map(z => ({ x0: Math.floor(z.x / cell), y0: Math.floor(z.y / cell), x1: Math.ceil((z.x + z.w) / cell), y1: Math.ceil((z.y + z.h) / cell) })),
    sizeBias: 1, flip: false, rows: o.fill !== 'columns'
  });
  const anglesOf = o.anglesOf ?? (() => o.angles);
  const t0 = Date.now();
  type Pass = Awaited<ReturnType<typeof greedyPass>>;
  let best: { score: number; r: Pass; flip: boolean; bias: number } | null = null, pass = 0;
  const tell = (stage: NestProgress['stage'], sheets: number) => onProgress?.({ stage, pass, sheets, t: Math.min(1, (Date.now() - t0) / 1000 / o.seconds) });
  const coarse = await makeVariants(parts, anglesOf, coarseCell, o.gap, () => tell('search', 0));
  const cfg = mkCfg(coarseCell);
  const area = parts.map(p => (p.bbox.x1 - p.bbox.x0) * (p.bbox.y1 - p.bbox.y0));
  const base = parts.map((_, i) => i).sort((a, b) => area[b] - area[a]);
  let rng = 12345;
  const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296;
  while (pass === 0 || Date.now() - t0 < o.seconds * 1000) {
    const order = base.slice();
    if (pass) { // jitter the big-first order, more strongly as passes go on
      const jitter = 0.05 + rand() * 0.45;
      const key = new Map(order.map(i => [i, area[i] * (1 + (rand() - 0.5) * 2 * jitter)]));
      order.sort((a, b) => key.get(b)! - key.get(a)!);
    }
    cfg.flip = pass % 3 === 2;
    cfg.sizeBias = pass % 2 ? 1 : 0.6;
    const r = await greedyPass(order, coarse, cfg, () => tell('search', best ? best.r.sheets.length : 0));
    const last = r.sheets[r.sheets.length - 1];
    const score = r.unplaced.length * 1e7 + r.sheets.length * 1e5 + (last ? last.used / (cfg.rows ? cfg.H : cfg.W) * 1e4 : 0);
    if (!best || score < best.score) best = { score, r, flip: cfg.flip, bias: cfg.sizeBias };
    pass++;
    await tell('search', best.r.sheets.length);
  }
  const found = best!;
  const toPlacement = (pl: SheetGrid['placed'][number], cell: number): Placement =>
    ({ idx: pl.idx, deg: pl.deg, tx: pl.x * cell - pl.bbox.x0, ty: pl.y * cell - pl.bbox.y0 });
  // Tighten each sheet on a finer grid with its own parts and angles; a sheet that does not refit stays as found.
  const chosen = new Array<number>(parts.length).fill(0);
  found.r.sheets.forEach(s => s.placed.forEach(pl => { chosen[pl.idx] = pl.deg; }));
  await tell('fine', found.r.sheets.length);
  const fine = await makeVariants(parts, i => [chosen[i]], fineCell, o.gap, () => tell('fine', found.r.sheets.length));
  const fcfg = mkCfg(fineCell);
  fcfg.flip = found.flip; fcfg.sizeBias = found.bias;
  const sheets: Placement[][] = [];
  for (const s of found.r.sheets) {
    const rf = await greedyPass(s.placed.map(pl => pl.idx), fine, fcfg, () => tell('fine', found.r.sheets.length));
    const ok = rf.sheets.length === 1 && !rf.unplaced.length;
    const src = ok ? rf.sheets[0] : s, cell = ok ? fineCell : coarseCell;
    sheets.push(src.placed.map(pl => toPlacement(pl, cell)));
  }
  // The coarse grid rounds sizes up, so a part close to sheet size gets one more try on the fine grid.
  let unplaced = found.r.unplaced;
  if (unplaced.length) {
    const wanted = new Set(unplaced);
    const big = await makeVariants(parts, i => wanted.has(i) ? anglesOf(i) : [], fineCell, o.gap);
    const rb = await greedyPass(unplaced, big, fcfg);
    rb.sheets.forEach(s => sheets.push(s.placed.map(pl => toPlacement(pl, fineCell))));
    unplaced = rb.unplaced;
  }
  return { sheets, unplaced, passes: pass };
}
