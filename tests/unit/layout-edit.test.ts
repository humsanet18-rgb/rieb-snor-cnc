import { describe, expect, it } from 'vitest';
import { alignPieces, itemBox, movePieces, partOf, placeItem, unionBox } from '../../src/features/nesting/model';
import type { Design, Layout, PlacedPiece } from '../../src/types/project';
import { rectPart } from './helpers';

const design: Design = {
  id: 'd', name: 'd', qty: 1, rotation: 'inherit', markers: [], page: { w: 100, h: 100 },
  parts: [rectPart(20, 10), rectPart(40, 30), rectPart(10, 50)],
  report: { fileName: 'd', fileBytes: 1, imported: {}, skipped: {}, issues: [], stats: { parts: 3, contours: 3, holes: 0, points: 12, width: 0, height: 0, area: 0 } }
};

const piece = (i: number, tx: number, ty: number): PlacedPiece => ({ key: `k${i}`, designId: 'd', partIndex: i, copy: 0, deg: 0, tx, ty });

const layout: Layout = {
  id: 'l', number: 1, createdAt: '', mode: 'manual', sheetW: 1000, sheetH: 500, gap: 5, margin: 8, zones: [], fill: 'rows', arrange: 'free', rows: null,
  sheets: [{ pieces: [piece(0, 10, 100), piece(1, 200, 40), piece(2, 500, 20)], start: { x: 0, y: 0 } }], unplaced: [], passes: 1, seconds: 3
};

const boxes = (l: Layout) => l.sheets[0].pieces.map(p => itemBox(placeItem(partOf([design], p)!, p)));
const keys = ['k0', 'k1', 'k2'];

describe('editing several pieces at once', () => {
  it('aligns edges and centres', () => {
    expect(boxes(alignPieces(layout, [design], keys, 'left')).map(b => b.x0)).toEqual([10, 10, 10]);
    expect(boxes(alignPieces(layout, [design], keys, 'right')).map(b => b.x1)).toEqual([510, 510, 510]);
    expect(boxes(alignPieces(layout, [design], keys, 'top')).map(b => b.y0)).toEqual([20, 20, 20]);
    expect(boxes(alignPieces(layout, [design], keys, 'bottom')).map(b => b.y1)).toEqual([110, 110, 110]);
    const mid = boxes(alignPieces(layout, [design], keys, 'middle')).map(b => (b.y0 + b.y1) / 2);
    expect(new Set(mid).size).toBe(1);
    const centre = boxes(alignPieces(layout, [design], keys, 'center')).map(b => (b.x0 + b.x1) / 2);
    expect(new Set(centre).size).toBe(1);
  });

  it('spaces pieces evenly between the outermost two', () => {
    const b = boxes(alignPieces(layout, [design], keys, 'distH')).sort((p, q) => p.x0 - q.x0);
    expect(b[0].x0).toBe(10);
    expect(b[2].x1).toBe(510);
    expect(b[1].x0 - b[0].x1).toBeCloseTo(b[2].x0 - b[1].x1, 6);
  });

  it('leaves the layout alone with too few pieces, and moves several pieces by the same amount', () => {
    expect(alignPieces(layout, [design], ['k0'], 'left')).toBe(layout);
    expect(alignPieces(layout, [design], ['k0', 'k1'], 'distH')).toBe(layout);
    const moved = movePieces(layout, ['k0', 'k2'], 5, -3).sheets[0].pieces;
    expect(moved.map(p => [p.tx, p.ty])).toEqual([[15, 97], [200, 40], [505, 17]]);
  });

  it('measures the box around a selection', () => {
    const items = layout.sheets[0].pieces.map(p => placeItem(partOf([design], p)!, p));
    expect(unionBox(items)).toEqual({ x0: 10, y0: 20, x1: 510, y1: 110 });
    expect(unionBox([])).toBeNull();
  });
});
