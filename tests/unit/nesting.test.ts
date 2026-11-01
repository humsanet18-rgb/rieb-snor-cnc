import { describe, expect, it } from 'vitest';
import { boxGap, contourDistance, pointInPoly } from '../../src/engines/geometry-engine/geometry';
import { nest, type NestOptions, type NestResult } from '../../src/engines/nesting-engine/nest';
import { itemBox, placeItem } from '../../src/features/nesting/model';
import type { Part, PlacedItem, Rect } from '../../src/types/geometry';
import type { PlacedPiece } from '../../src/types/project';
import { rectPart } from './helpers';

const piece = (p: { deg: number; tx: number; ty: number }) => ({ deg: p.deg, tx: p.tx, ty: p.ty }) as PlacedPiece;
const sheetItems = (parts: Part[], r: NestResult, i: number): PlacedItem[] => r.sheets[i].map(p => placeItem(parts[p.idx], piece(p)));
const quick: Partial<NestOptions> = { seconds: 0.4 };

/** Measures real distances on the placed contours, independently of the raster the nester used. */
function assertLayout(parts: Part[], r: NestResult, o: { sheetW: number; sheetH: number; gap: number; margin: number; zones?: Rect[] }) {
  const placedCount = r.sheets.reduce((n, s) => n + s.length, 0) + r.unplaced.length;
  expect(placedCount).toBe(parts.length);
  r.sheets.forEach((_, i) => {
    const items = sheetItems(parts, r, i), boxes = items.map(itemBox);
    boxes.forEach(b => {
      expect(b.x0).toBeGreaterThanOrEqual(o.margin - 1e-6);
      expect(b.y0).toBeGreaterThanOrEqual(o.margin - 1e-6);
      expect(b.x1).toBeLessThanOrEqual(o.sheetW - o.margin + 1e-6);
      expect(b.y1).toBeLessThanOrEqual(o.sheetH - o.margin + 1e-6);
      for (const z of o.zones ?? []) {
        const apart = b.x1 <= z.x || b.x0 >= z.x + z.w || b.y1 <= z.y || b.y0 >= z.y + z.h;
        expect(apart).toBe(true);
      }
    });
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        if (boxGap(boxes[a], boxes[b]) >= o.gap) continue;
        let min = Infinity;
        for (const P of items[a].outers) for (const Q of items[b].outers) min = Math.min(min, contourDistance(P, Q));
        expect(min).toBeGreaterThanOrEqual(o.gap - 1e-6);
        expect(pointInPoly(items[b].outers[0][0], items[a].outers[0])).toBe(false);
      }
    }
  });
}

const L: Part = {
  outers: [[[0, 0], [90, 0], [90, 20], [20, 20], [20, 120], [0, 120]]], holes: [], area: 90 * 20 + 100 * 20,
  bbox: { x0: 0, y0: 0, x1: 90, y1: 120 }
};

describe('automatic nesting (cases 11, 12)', () => {
  it('places all copies with no overlap, inside bounds, gaps respected', async () => {
    const parts = Array.from({ length: 30 }, (_, i) => (i % 2 ? L : rectPart(80, 60)));
    const o = { ...quick, sheetW: 1000, sheetH: 480, gap: 5, margin: 8 };
    const r = await nest(parts, o);
    expect(r.unplaced).toEqual([]);
    assertLayout(parts, r, o);
  });

  it('interlocks shapes: L pieces share space their boxes would not', async () => {
    const parts = Array.from({ length: 12 }, () => L);
    const r = await nest(parts, { ...quick, sheetW: 330, sheetH: 400, gap: 3, margin: 0 });
    expect(r.sheets.length).toBeLessThanOrEqual(1);
  });

  it('holds the gap for every gap size, measured on exact geometry', async () => {
    for (const gap of [0, 2, 7.5, 20]) {
      const parts = Array.from({ length: 10 }, () => rectPart(60, 40));
      const o = { ...quick, sheetW: 500, sheetH: 300, gap, margin: 5 };
      assertLayout(parts, await nest(parts, o), o);
    }
  });

  it('reports progress and finishes within about the search time', async () => {
    const seen: number[] = [];
    const t0 = Date.now();
    await nest(Array.from({ length: 12 }, () => rectPart(50, 50)), { seconds: 0.5 }, p => seen.push(p.t));
    expect(seen.length).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(8000);
  });
});

describe('sheet sizes and multiple sheets (cases 14, 17)', () => {
  it('works on other sheet sizes', async () => {
    for (const [sheetW, sheetH] of [[600, 300], [1220, 2440], [200, 200]]) {
      const parts = Array.from({ length: 5 }, () => rectPart(80, 70));
      const o = { ...quick, sheetW, sheetH, gap: 3, margin: 2 };
      const r = await nest(parts, o);
      expect(r.unplaced).toEqual([]);
      assertLayout(parts, r, o);
    }
  });

  it('opens more sheets when one is not enough', async () => {
    const parts = Array.from({ length: 12 }, () => rectPart(300, 200));
    const o = { ...quick, sheetW: 1000, sheetH: 480, gap: 5, margin: 8 };
    const r = await nest(parts, o);
    expect(r.sheets.length).toBe(2);
    assertLayout(parts, r, o);
  });

  it('reports a part that cannot fit instead of hiding it', async () => {
    const parts = [rectPart(2000, 100), rectPart(50, 50)];
    const r = await nest(parts, { ...quick, sheetW: 1000, sheetH: 480 });
    expect(r.unplaced).toEqual([0]);
    expect(r.sheets.flat().map(p => p.idx)).toEqual([1]);
  });

  it('places a part within the raster tolerance of the usable sheet', async () => {
    const parts = [rectPart(979, 459)];
    const o = { ...quick, sheetW: 1000, sheetH: 480, gap: 5, margin: 8 };
    const r = await nest(parts, o);
    expect(r.unplaced).toEqual([]);
    assertLayout(parts, r, o);
  });

  it('returns an empty result for no parts', async () => {
    const r = await nest([], quick);
    expect(r.sheets).toEqual([]);
    expect(r.unplaced).toEqual([]);
  });
});

describe('rotation (case 15)', () => {
  it('uses only the allowed angles', async () => {
    const parts = Array.from({ length: 10 }, () => L);
    const r = await nest(parts, { ...quick, angles: [0, 180] });
    for (const p of r.sheets.flat()) expect([0, 180]).toContain(p.deg);
  });

  it('keeps a locked design upright while others rotate', async () => {
    const parts = Array.from({ length: 8 }, () => L);
    const r = await nest(parts, { ...quick, anglesOf: i => (i < 4 ? [0] : [0, 90, 180, 270]) });
    for (const p of r.sheets.flat()) if (p.idx < 4) expect(p.deg).toBe(0);
  });

  it('only fits when rotation is allowed', async () => {
    const tall = [rectPart(60, 400)];
    const r0 = await nest(tall, { ...quick, sheetW: 500, sheetH: 200, margin: 0, angles: [0] });
    expect(r0.unplaced).toEqual([0]);
    const r90 = await nest(tall, { ...quick, sheetW: 500, sheetH: 200, margin: 0, angles: [0, 90] });
    expect(r90.unplaced).toEqual([]);
  });
});

describe('clamp zones and start box (case 16)', () => {
  const zones: Rect[] = [{ x: 0, y: 430, w: 150, h: 50 }, { x: 950, y: 430, w: 50, h: 50 }];
  const startBox: Rect = { x: 1.5, y: 1, w: 15, h: 18 };

  it('keeps every piece out of the zones and the start box', async () => {
    const parts = Array.from({ length: 40 }, () => rectPart(90, 70));
    const o = { ...quick, sheetW: 1000, sheetH: 480, gap: 5, margin: 8, zones, startBox };
    const r = await nest(parts, o);
    assertLayout(parts, r, { ...o, zones: [...zones, startBox] });
  });
});

describe('fill direction', () => {
  const parts = Array.from({ length: 8 }, () => rectPart(100, 80));
  const extent = (r: NestResult, ps: Part[]) => {
    const b = sheetItems(ps, r, 0).map(itemBox);
    return { maxX: Math.max(...b.map(x => x.x1)), maxY: Math.max(...b.map(x => x.y1)) };
  };

  it('rows leave a full-width strip at the bottom', async () => {
    const r = await nest(parts, { ...quick, fill: 'rows', angles: [0] });
    expect(extent(r, parts).maxY).toBeLessThan(300);
  });

  it('columns leave a full-height strip at the right', async () => {
    const r = await nest(parts, { ...quick, fill: 'columns', angles: [0] });
    expect(extent(r, parts).maxX).toBeLessThan(450);
  });
});
