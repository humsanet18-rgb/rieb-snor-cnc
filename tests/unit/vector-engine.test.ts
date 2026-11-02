import { describe, expect, it } from 'vitest';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import { polyArea } from '../../src/engines/geometry-engine/geometry';
import {
  addItems, addLayer, alignItems, breakApart, combineItems, distributeItems, documentToSVG, duplicateItems, emptyDocument, findTop,
  groupItems, itemBBox, moveToLayer, pathItem, removeLayer, reorder, reverseItems, rotateAbout, rotationOf, scaleAbout, selectionBBox,
  toPolygons, transformItems, translate, ungroupItems
} from '../../src/engines/vector-engine/document';
import { flatten, pathData, subpathsBBox } from '../../src/engines/vector-engine/path';
import { ellipse, grid, polygon, rectangle, spiral, star } from '../../src/engines/vector-engine/shapes';
import { parseSvg } from '../../src/engines/svg-parser/parse-svg';

const box = (x: number, y: number, w: number, h: number) => pathItem('rect', 'Rect', rectangle(x, y, w, h));
const near = (b: { x0: number; y0: number; x1: number; y1: number } | null, e: [number, number, number, number]) => {
  expect(b).not.toBeNull();
  [b!.x0, b!.y0, b!.x1, b!.y1].forEach((v, k) => expect(v).toBeCloseTo(e[k], 6));
};

describe('Bézier geometry', () => {
  it('bounds an ellipse exactly and flattens it within 0.04 mm', () => {
    const e = ellipse(10, 20, 100, 60);
    near(subpathsBBox(e), [10, 20, 110, 80]);
    const poly = flatten(e[0]);
    for (const [x, y] of poly) expect(Math.abs(Math.hypot((x - 60) / 50, (y - 50) / 30) - 1)).toBeLessThan(0.001);
    // Area of the flattened curve is that of the true ellipse to well within 0.1%.
    expect(Math.abs(Math.abs(polyArea(poly)) / (Math.PI * 50 * 30) - 1)).toBeLessThan(0.001);
  });

  it('bounds a curve by its extreme points, not its control points', () => {
    const s = [{ closed: false, nodes: [{ p: [0, 0] as [number, number], o: [0, -100] as [number, number] }, { p: [100, 0] as [number, number], i: [100, -100] as [number, number] }] }];
    near(subpathsBBox(s), [0, -75, 100, 0]);
  });

  it('writes curves as C commands and lines as L', () => {
    expect(pathData(rectangle(0, 0, 10, 5))).toBe('M0 0L10 0L10 5L0 5Z');
    expect(pathData(ellipse(0, 0, 10, 10))).toMatch(/^M5 0C/);
  });

  it('shapes fit their box', () => {
    near(subpathsBBox(polygon(0, 0, 100, 100, 6)), [6.698729810778069, 0, 93.30127018922194, 100]);
    expect(star(0, 0, 100, 100, 5, 0.4)[0].nodes).toHaveLength(10);
    expect(spiral(0, 0, 100, 100, 3)[0].closed).toBe(false);
    expect(grid(0, 0, 30, 20, 3, 2)).toHaveLength(6);
  });
});

describe('Design document', () => {
  const base = () => {
    const a = box(0, 0, 10, 10), b = box(40, 20, 20, 10), c = box(100, 0, 10, 40);
    return { doc: addItems(emptyDocument({ w: 200, h: 100 }), [a, b, c]), a, b, c };
  };

  it('moves, scales and rotates around a point', () => {
    const { doc, a } = base();
    let d = transformItems(doc, [a.id], translate(5, 7));
    near(itemBBox(findTop(d, a.id)!.item), [5, 7, 15, 17]);
    d = transformItems(d, [a.id], scaleAbout(2, 3, 5, 7));
    near(itemBBox(findTop(d, a.id)!.item), [5, 7, 25, 37]);
    d = transformItems(d, [a.id], rotateAbout(90, 15, 22));
    expect(rotationOf(findTop(d, a.id)!.item)).toBe(90);
    near(itemBBox(findTop(d, a.id)!.item), [0, 12, 30, 32]);
  });

  it('duplicates with an offset and fresh ids, groups and ungroups', () => {
    const { doc, a, b } = base();
    const dup = duplicateItems(doc, [a.id], 10, 0);
    expect(dup.ids).toHaveLength(1);
    expect(dup.ids[0]).not.toBe(a.id);
    near(selectionBBox(dup.doc, dup.ids), [10, 0, 20, 10]);
    const g = groupItems(dup.doc, [a.id, b.id], 'Group');
    expect(g.doc.layers[0].items).toHaveLength(3);
    near(selectionBBox(g.doc, [g.id!]), [0, 0, 60, 30]);
    const moved = transformItems(g.doc, [g.id!], translate(1, 1));
    const un = ungroupItems(moved, [g.id!]);
    expect(un.ids.sort()).toEqual([a.id, b.id].sort());
    near(selectionBBox(un.doc, [b.id]), [41, 21, 61, 31]);
  });

  it('aligns to the selection or the page and distributes evenly', () => {
    const { doc, a, b, c } = base();
    const left = alignItems(doc, [a.id, b.id, c.id], 'left');
    for (const id of [a.id, b.id, c.id]) expect(selectionBBox(left, [id])!.x0).toBeCloseTo(0, 9);
    const page = alignItems(doc, [b.id], 'center');
    near(selectionBBox(page, [b.id]), [90, 20, 110, 30]);
    const spread = distributeItems(doc, [a.id, b.id, c.id], 'x');
    // Gaps between 0–10, 40–60 and 100–110 become equal: (110 - 40) / 2 = 35.
    near(selectionBBox(spread, [b.id]), [45, 20, 65, 30]);
  });

  it('changes stacking order within the layer', () => {
    const { doc, a, b, c } = base();
    expect(reorder(doc, [a.id], 'front').layers[0].items.map(i => i.id)).toEqual([b.id, c.id, a.id]);
    expect(reorder(doc, [c.id], 'back').layers[0].items.map(i => i.id)).toEqual([c.id, a.id, b.id]);
    expect(reorder(doc, [a.id], 'forward').layers[0].items.map(i => i.id)).toEqual([b.id, a.id, c.id]);
  });

  it('combines into one object with holes and breaks apart again', () => {
    const outer = box(0, 0, 100, 100), hole = box(25, 25, 50, 50);
    const doc = addItems(emptyDocument({ w: 200, h: 200 }), [outer, hole]);
    const c = combineItems(doc, [outer.id, hole.id], 'Combined');
    expect(c.doc.layers[0].items).toHaveLength(1);
    const parts = buildParts(toPolygons(c.doc.layers[0].items).closed).parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].holes).toHaveLength(1);
    const apart = breakApart(c.doc, [c.id!]);
    expect(apart.ids).toHaveLength(2);
  });

  it('counts open paths instead of sending them to production', () => {
    const doc = addItems(emptyDocument({ w: 100, h: 100 }), [box(0, 0, 10, 10), pathItem('spiral', 'S', spiral(0, 0, 50, 50, 2))]);
    const out = toPolygons(doc.layers[0].items);
    expect(out.closed).toHaveLength(1);
    expect(out.open).toBe(1);
  });

  it('reverses direction and keeps the shape', () => {
    const { doc, a } = base();
    const r = reverseItems(doc, [a.id]);
    near(selectionBBox(r, [a.id]), [0, 0, 10, 10]);
    const before = toPolygons([findTop(doc, a.id)!.item]).closed[0], after = toPolygons([findTop(r, a.id)!.item]).closed[0];
    expect(Math.sign(polyArea(after))).toBe(-Math.sign(polyArea(before)));
  });

  it('manages layers and moves objects between them', () => {
    const { doc, a } = base();
    const two = addLayer(doc, 'Cut');
    const moved = moveToLayer(two, [a.id], two.layers[1].id);
    expect(moved.layers[1].items.map(i => i.id)).toEqual([a.id]);
    const back = removeLayer(moved, moved.layers[1].id);
    expect(back.layers).toHaveLength(1);
    expect(back.layers[0].items).toHaveLength(3);
  });

  it('exports SVG that the importer reads back to the same outlines', () => {
    const { doc } = base();
    const withCurve = addItems(doc, [pathItem('ellipse', 'E', ellipse(150, 10, 40, 30))]);
    const svg = documentToSVG(withCurve);
    expect(svg).toContain('width="200mm"');
    const parsed = parseSvg(svg);
    expect(parsed.shapes).toHaveLength(4);
    const parts = buildParts(parsed.shapes).parts;
    const e = parts.find(p => p.bbox.x0 > 140)!;
    expect(e.bbox.x0).toBeCloseTo(150, 1);
    expect(e.bbox.y1).toBeCloseTo(40, 1);
  });
});
