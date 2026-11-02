import { describe, expect, it } from 'vitest';
import { bboxOf, contourDistance } from '../../src/engines/geometry-engine/geometry';
import { arrangeRows, type RowOptions } from '../../src/engines/nesting-engine/rows';
import type { NestResult, Placement } from '../../src/engines/nesting-engine/nest';
import { buildCut, cutGroups, cutRows, retraceLength } from '../../src/engines/toolpath-engine/cut';
import { buildStroke, pathLength } from '../../src/engines/toolpath-engine/stroke';
import { nodeAt, pieceVisits } from '../../src/features/editor/motion';
import { cumulativeLengths } from '../../src/features/preview/view';
import { validateSheet } from '../../src/engines/toolpath-engine/validate';
import { placeTransform } from '../../src/engines/geometry-engine/geometry';
import type { Part, PlacedItem, Polygon, Rect, StartSpec } from '../../src/types/geometry';
import type { CutOptions } from '../../src/types/project';
import { box, partsOf, placed, privateFile, privateJobs, readSample, rectPart } from './helpers';

const options = (o: Partial<RowOptions> = {}): RowOptions => ({
  tolerance: 20, align: 'bottom', order: 'height', fillGaps: false, tight: true,
  sheetW: 1000, sheetH: 480, gap: 5, margin: 8, startBox: null, zones: [], ...o
});

const item = (part: Part, p: Placement): PlacedItem => {
  const t = placeTransform(p.deg, p.tx, p.ty), move = (c: Polygon) => c.map(t);
  return { outers: part.outers.map(move), holes: part.holes.map(move), area: part.area };
};

const itemsOf = (parts: Part[], sheet: Placement[]) => sheet.map(p => item(parts[p.idx], p));
const boundsOf = (it: PlacedItem) => bboxOf(it.outers.flat());

function rowsOf(parts: Part[], sheet: Placement[]) {
  const bottoms = new Map<number, Placement[]>();
  for (const p of sheet) {
    const b = Math.round(parts[p.idx].bbox.y1 + p.ty);
    bottoms.set(b, [...(bottoms.get(b) ?? []), p]);
  }
  return [...bottoms.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
}

function expectClear(parts: Part[], r: NestResult, o: RowOptions) {
  for (const sheet of r.sheets) {
    const items = itemsOf(parts, sheet);
    items.forEach((a, i) => {
      const b = boundsOf(a);
      expect(b.x0).toBeGreaterThanOrEqual(o.margin - 1e-6);
      expect(b.y0).toBeGreaterThanOrEqual(o.margin - 1e-6);
      expect(b.x1).toBeLessThanOrEqual(o.sheetW - o.margin + 1e-6);
      expect(b.y1).toBeLessThanOrEqual(o.sheetH - o.margin + 1e-6);
      for (const z of [...o.zones, ...(o.startBox ? [o.startBox] : [])]) {
        const apart = b.x1 <= z.x || b.x0 >= z.x + z.w || b.y1 <= z.y || b.y0 >= z.y + z.h;
        if (!apart) expect(contourDistance(a.outers[0], box(z.x, z.y, z.w, z.h))).toBeGreaterThan(0);
      }
      for (const c of items.slice(i + 1)) {
        for (const p of a.outers) for (const q of c.outers) expect(contourDistance(p, q)).toBeGreaterThanOrEqual(o.gap - 0.05);
      }
    });
  }
}

const mixed = [...Array(6).fill(0).map((_, i) => rectPart(60, 150 - i)), ...Array(5).fill(0).map(() => rectPart(50, 90)), ...Array(7).fill(0).map(() => rectPart(40, 42))];
const L = (): Part => {
  const o: Polygon = [[0, 0], [20, 0], [20, 80], [80, 80], [80, 100], [0, 100]];
  return { outers: [o], holes: [], area: 2800, bbox: { x0: 0, y0: 0, x1: 80, y1: 100 } };
};

describe('rows of the same height', () => {
  it('puts each height band in a row of its own, tallest first', () => {
    const r = arrangeRows(mixed, options());
    expect(r.unplaced).toEqual([]);
    expect(r.sheets).toHaveLength(1);
    const rows = rowsOf(mixed, r.sheets[0]);
    expect(rows.map(x => x.length)).toEqual([6, 5, 7]);
    for (const row of rows) {
      const hs = row.map(p => mixed[p.idx].bbox.y1 - mixed[p.idx].bbox.y0);
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(20);
    }
    expectClear(mixed, r, options());
  });

  it('honours the height tolerance setting', () => {
    const r = arrangeRows(mixed, options({ tolerance: 2 }));
    const hs = rowsOf(mixed, r.sheets[0]).map(row => row.map(p => mixed[p.idx].bbox.y1));
    for (const row of hs) expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(2);
    expect(hs.length).toBeGreaterThan(3);
  });

  it('keeps pieces upright and holds exact gaps at every gap size', () => {
    for (const gap of [0, 2, 5, 12]) {
      const o = options({ gap }), parts = [...mixed, L(), L(), L(), L()], r = arrangeRows(parts, o);
      expect(r.sheets.flat().every(p => p.deg === 0)).toBe(true);
      expectClear(parts, r, o);
    }
  });

  it('closes up along real shapes when tight, and along boxes when not', () => {
    const wedge = (o: Polygon): Part => ({ outers: [o], holes: [], area: 4000, bbox: { x0: 0, y0: 0, x1: 80, y1: 100 } });
    const up = () => wedge([[0, 0], [80, 0], [0, 100]]), down = () => wedge([[80, 0], [80, 100], [0, 100]]);
    const parts = [up(), down(), up()], tight = arrangeRows(parts, options()), loose = arrangeRows(parts, options({ tight: false }));
    const right = (r: NestResult) => Math.max(...itemsOf(parts, r.sheets[0]).map(i => boundsOf(i).x1));
    expect(right(tight)).toBeLessThan(right(loose));
    expect(right(loose)).toBeCloseTo(8 + 80 * 3 + 10, 1);
    expectClear(parts, tight, options());
  });

  it('aligns a row to the bottom, top or centre', () => {
    const parts = [rectPart(50, 100), rectPart(50, 80)];
    const edges = (align: RowOptions['align']) => {
      const r = arrangeRows(parts, options({ align })), [a, b] = itemsOf(parts, r.sheets[0]).map(boundsOf);
      return { top: a.y0 - b.y0, bottom: a.y1 - b.y1 };
    };
    expect(edges('bottom').bottom).toBeCloseTo(0);
    expect(edges('top').top).toBeCloseTo(0);
    expect(edges('center').top).toBeCloseTo(-10);
  });

  it('keeps clear of clamp corners and the start box', () => {
    const zones: Rect[] = [{ x: 0, y: 430, w: 150, h: 50 }, { x: 950, y: 430, w: 50, h: 50 }];
    const startBox: Rect = { x: 0, y: 0, w: 28, h: 26 }, o = options({ zones, startBox });
    const parts = Array(60).fill(0).map(() => rectPart(70, 100)), r = arrangeRows(parts, o);
    expect(r.unplaced).toEqual([]);
    expectClear(parts, r, o);
  });

  it('opens a new sheet when the next row does not fit', () => {
    const parts = Array(40).fill(0).map(() => rectPart(120, 200)), r = arrangeRows(parts, options());
    expect(r.unplaced).toEqual([]);
    expect(r.sheets.length).toBeGreaterThan(1);
    expect(r.sheets.flat()).toHaveLength(40);
    expectClear(parts, r, options());
  });

  it('reports a piece too large for the sheet', () => {
    const r = arrangeRows([rectPart(1200, 50), rectPart(50, 50)], options());
    expect(r.unplaced).toEqual([0]);
    expect(r.sheets.flat()).toHaveLength(1);
  });

  it('fills the free end of a row with shorter pieces only when asked', () => {
    const parts = [rectPart(300, 200), rectPart(300, 60), rectPart(300, 60), rectPart(300, 60)];
    expect(rowsOf(parts, arrangeRows(parts, options()).sheets[0])).toHaveLength(2);
    const r = arrangeRows(parts, options({ fillGaps: true }));
    expect(rowsOf(parts, r.sheets[0]).map(x => x.length)).toEqual([3, 1]);
    expectClear(parts, r, options());
  });

  it('keeps file order when asked', () => {
    const parts = [rectPart(400, 50), rectPart(400, 150), rectPart(400, 100)];
    const r = arrangeRows(parts, options({ order: 'file' }));
    expect(r.sheets[0].map(p => p.idx)).toEqual([0, 1, 2]);
    expectClear(parts, r, options());
  });

  it('never lets a later row climb over one very tall piece', () => {
    const tall: Part = { outers: [[[0, 0], [90, 0], [90, 200], [40, 256], [0, 200]]], holes: [], area: 20000, bbox: { x0: 0, y0: 0, x1: 90, y1: 256 } };
    const parts = [tall, ...Array(5).fill(0).map(() => rectPart(120, 150)), ...Array(5).fill(0).map(() => rectPart(150, 130))];
    const r = arrangeRows(parts, options());
    expect(r.unplaced).toEqual([]);
    expectClear(parts, r, options());
    const items = itemsOf(parts, r.sheets[0]), tops = r.sheets[0].filter(p => p.idx > 0).map((_, i) => boundsOf(items[i + 1]).y0);
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(8 + 256 / 2 - 0.01);
  });

  it('handles an empty job', () => {
    expect(arrangeRows([], options())).toMatchObject({ sheets: [], unplaced: [] });
  });

  it('arranges real letter outlines with holes', () => {
    const parts = partsOf(readSample('block-letters.svg')), o = options(), r = arrangeRows(parts, o);
    expect(r.unplaced).toEqual([]);
    expectClear(parts, r, o);
  });
});

const start: StartSpec = { box: { x: 1.5, y: 1, w: 15, h: 18 } };
const check = (items: PlacedItem[], stroke: ReturnType<typeof buildStroke>, closed = true) => validateSheet({
  sheet: 0, items, stroke, start, sheetW: 1000, sheetH: 480, zones: [], gap: 5, margin: 8, mode: 'auto', closed
});

function firstVisit(path: Polygon, it: PlacedItem) {
  return Math.min(...it.outers[0].map(q => path.findIndex(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06)));
}
function lastVisit(path: Polygon, it: PlacedItem) {
  let last = -1;
  for (const q of it.outers[0]) {
    let first = -1;
    path.forEach((p, i) => { if (first < 0 && Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06) first = i; });
    last = Math.max(last, first);
  }
  return last;
}

const grid = (rows: number, cols: number) => {
  const items: PlacedItem[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) items.push(placed(rectPart(100, 80, 40 + c * 150, 40 + r * 130)));
  return items;
};
const cut = (o: Partial<CutOptions> = {}): CutOptions => ({ order: 'rows', returnHome: true, ...o });

describe('cutting order', () => {
  it('leaves the shortest order exactly as before', () => {
    const items = grid(3, 4);
    expect(buildCut(items, start, [], cut({ order: 'shortest' }))).toEqual(buildStroke(items, start, []));
  });

  it('finishes every piece of a row before going down to the next', () => {
    const items = grid(4, 5), stroke = buildCut(items, start, [], cut());
    expect(stroke.unlinked).toBe(0);
    for (let row = 0; row < 3; row++) {
      const done = Math.max(...items.slice(row * 5, row * 5 + 5).map(i => lastVisit(stroke.path, i)));
      const next = Math.min(...items.slice((row + 1) * 5, (row + 1) * 5 + 5).map(i => firstVisit(stroke.path, i)));
      expect(done).toBeLessThan(next);
    }
  });

  it('gives a path the validator accepts, and comes home by default', () => {
    const items = grid(3, 4), stroke = buildCut(items, start, [], cut());
    expect(check(items, stroke).filter(i => i.severity !== 'info')).toEqual([]);
    expect(stroke.path[stroke.path.length - 1]).toEqual(stroke.path[0]);
  });

  it('may end at the last piece, which is shorter and not reported as open', () => {
    const items = grid(3, 4), home = buildCut(items, start, [], cut()), open = buildCut(items, start, [], cut({ returnHome: false }));
    expect(pathLength(open.path)).toBeLessThan(pathLength(home.path));
    const last = open.path[open.path.length - 1];
    expect(Math.hypot(last[0] - open.path[0][0], last[1] - open.path[0][1])).toBeGreaterThan(1);
    expect(check(items, open, false).filter(i => i.severity !== 'info')).toEqual([]);
    expect(check(items, open, true).map(i => i.code)).toContain('path-open');
  });

  it('never makes a new cut through a letter between rows', () => {
    const parts = partsOf(readSample('block-letters.svg')), r = arrangeRows(parts, options());
    const items = itemsOf(parts, r.sheets[0]), stroke = buildCut(items, start, [], cut());
    expect(stroke.unlinked).toBe(0);
    expect(check(items, stroke).filter(i => i.severity !== 'info').map(i => i.code)).toEqual([]);
  });

  it('cuts by columns and by snake, one group at a time', () => {
    const items = grid(2, 3);
    expect(cutGroups(items, 'rows')).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(cutGroups(items, 'columns')).toEqual([[0, 3], [1, 4], [2, 5]]);
    expect(cutGroups(items, 'snake')).toEqual([[0], [1], [2], [5], [4], [3]]);
    for (const order of ['columns', 'snake'] as const) {
      const stroke = buildCut(items, start, [], cut({ order }));
      expect(stroke.order).toHaveLength(6);
      expect(check(items, stroke).filter(i => i.severity !== 'info')).toEqual([]);
    }
  });

  it('keeps an island in the row of the letter around it', () => {
    const ring: PlacedItem = { outers: [box(40, 40, 200, 200)], holes: [box(90, 90, 100, 100)], area: 30000 };
    const island = placed(rectPart(40, 40, 120, 120)), right = placed(rectPart(100, 100, 300, 300));
    expect(cutGroups([ring, right, island], 'rows')).toEqual([[0, 2], [1]]);
    const items = [ring, right, island], stroke = buildCut(items, start, [], cut());
    expect(check(items, stroke).filter(i => i.severity === 'error')).toEqual([]);
  });

  it('returns the rows the stroke was built from, so the preview and the wire agree', () => {
    const items = grid(2, 3);
    expect(cutRows(items, 'rows')).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(cutRows(items, 'columns')).toEqual([[0, 3], [1, 4], [2, 5]]);
    expect(cutRows(items, 'snake')).toEqual([[0, 1, 2], [5, 4, 3]]);
    for (const order of ['rows', 'columns', 'snake'] as const) {
      const stroke = buildCut(items, start, [], cut({ order }));
      expect(stroke.rows).toEqual(cutRows(items, order));
      // The wire reaches every piece of a row before any piece of the next row.
      const rowOf = new Map(stroke.rows!.flatMap((r, n) => r.map(i => [i, n] as const)));
      const visited = stroke.order.map(i => rowOf.get(i)!);
      expect(visited).toEqual([...visited].sort((a, b) => a - b));
    }
    expect(buildCut(items, start, [], cut({ order: 'shortest' })).rows).toBeUndefined();
    const ring: PlacedItem = { outers: [box(40, 40, 200, 200)], holes: [box(90, 90, 100, 100)], area: 30000 };
    expect(cutRows([ring, placed(rectPart(100, 100, 300, 300)), placed(rectPart(40, 40, 120, 120))], 'rows')).toEqual([[0, 2], [1]]);
  });

  it('measures lines walked twice', () => {
    expect(retraceLength([[0, 0], [10, 0], [0, 0]])).toBeCloseTo(10);
    expect(retraceLength([[0, 0], [10, 0], [10, 10]])).toBe(0);
  });

  const job = privateJobs().length ? privateFile(privateJobs()[0] + '.svg') : null;
  it.skipIf(!job)('handles a real job in rows, cut row by row', () => {
    const parts = partsOf(job!), r = arrangeRows(parts, options({ startBox: { x: 0, y: 0, w: 28, h: 26 }, zones: [{ x: 0, y: 430, w: 150, h: 50 }, { x: 950, y: 430, w: 50, h: 50 }] }));
    expect(r.unplaced).toEqual([]);
    for (const sheet of r.sheets) {
      const items = itemsOf(parts, sheet), stroke = buildCut(items, start, [], cut());
      expect(stroke.unlinked).toBe(0);
      expect(check(items, stroke).filter(i => i.severity === 'error')).toEqual([]);
    }
  });
});

describe('editor motion', () => {
  it('finds each piece in cutting order, and which piece the wire is on', () => {
    const items = grid(2, 3), stroke = buildCut(items, start, [], cut()), m = pieceVisits(stroke.path, items);
    expect(m.visits.slice(0, 3).map(v => v.piece).sort()).toEqual([0, 1, 2]);
    expect(m.visits.slice(3).map(v => v.piece).sort()).toEqual([3, 4, 5]);
    expect(m.pieceAt).toHaveLength(stroke.path.length);
    for (const v of m.visits) expect(m.pieceAt[v.node]).toBe(v.piece);
    expect(m.pieceAt[0]).toBe(-1);
  });

  it('turns a distance into the node reached', () => {
    const c = cumulativeLengths([[0, 0], [10, 0], [10, 5], [10, 25]]);
    expect([0, 9.9, 10, 12, 15, 99].map(d => nodeAt(c, d))).toEqual([0, 0, 1, 1, 2, 3]);
    expect(nodeAt([], 3)).toBe(0);
  });
});
