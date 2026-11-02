import { describe, expect, it } from 'vitest';
import { bboxOf, polyArea } from '../../src/engines/geometry-engine/geometry';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import { inkBounds, outlines, simplifyRing, traceCoverage } from '../../src/engines/text-engine/trace';
import { scaleOutlines } from '../../src/features/text/geometry';

/** A coverage image with full ink wherever `inside(x, y)` holds for the pixel centre. */
function image(w: number, h: number, inside: (x: number, y: number) => boolean): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) a[j * w + i] = inside(i + 0.5, j + 0.5) ? 255 : 0;
  return a;
}

describe('text outline tracing', () => {
  it('traces a filled rectangle as one closed outline of the right size', () => {
    const a = image(40, 30, (x, y) => x > 10 && x < 30 && y > 5 && y < 25);
    const rings = traceCoverage(a, 40, 30);
    expect(rings).toHaveLength(1);
    const b = bboxOf(rings[0]);
    expect(b.x1 - b.x0).toBeCloseTo(20, 0);
    expect(b.y1 - b.y0).toBeCloseTo(20, 0);
    expect(Math.abs(polyArea(rings[0]))).toBeCloseTo(400, -1);
  });

  it('places edges between pixels from anti-aliased coverage', () => {
    // Column 9 is a quarter covered: the 50% edge sits a quarter of the way from pixel 8 to pixel 9.
    const a = new Uint8Array(20 * 5);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 20; i++) a[j * 20 + i] = i < 9 ? 255 : i === 9 ? 64 : 0;
    const [ring] = traceCoverage(a, 20, 5);
    const right = Math.max(...ring.map(p => p[0]));
    expect(right).toBeGreaterThan(9);
    expect(right).toBeLessThan(10);
  });

  it('gives a ring with a hole, which becomes one piece with one hole', () => {
    const a = image(60, 60, (x, y) => {
      const d = Math.hypot(x - 30, y - 30);
      return d < 25 && d > 12;
    });
    const rings = traceCoverage(a, 60, 60);
    expect(rings).toHaveLength(2);
    const built = buildParts(rings);
    expect(built.parts).toHaveLength(1);
    expect(built.parts[0].holes).toHaveLength(1);
  });

  it('keeps separate shapes separate and joins touching ones', () => {
    const apart = image(50, 20, (x, y) => y > 4 && y < 16 && ((x > 4 && x < 20) || (x > 28 && x < 44)));
    expect(traceCoverage(apart, 50, 20)).toHaveLength(2);
    const touching = image(50, 20, (x, y) => y > 4 && y < 16 && ((x > 4 && x < 25) || (x > 24 && x < 44)));
    expect(traceCoverage(touching, 50, 20)).toHaveLength(1);
  });

  it('closes outlines that touch the image border', () => {
    const rings = traceCoverage(image(10, 10, () => true), 10, 10);
    expect(rings).toHaveLength(1);
    expect(Math.abs(polyArea(rings[0]))).toBeGreaterThan(80);
  });

  it('simplifies straight runs without moving the outline', () => {
    const a = image(200, 100, (x, y) => x > 20 && x < 180 && y > 20 && y < 80);
    const [ring] = traceCoverage(a, 200, 100);
    const simple = simplifyRing(ring, 0.25);
    expect(simple.length).toBeLessThan(ring.length / 10);
    expect(Math.abs(polyArea(simple))).toBeCloseTo(Math.abs(polyArea(ring)), -1);
  });

  it('drops specks and finds the inked area', () => {
    const a = image(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30) || (x > 35 && x < 36 && y > 35 && y < 36));
    expect(outlines(a, 40, 40, { tolerance: 0.2, minArea: 4 })).toHaveLength(1);
    expect(inkBounds(a, 40, 40)).toEqual({ x0: 10, y0: 10, x1: 35, y1: 35 });
    expect(inkBounds(new Uint8Array(16), 4, 4)).toBeNull();
  });

  it('scales traced outlines to millimetres from the reference height', () => {
    // A reference glyph 50 px tall that must be 120 mm: every other outline scales by the same factor.
    const rings = [[[10, 10], [30, 10], [30, 60], [10, 60]] as [number, number][]];
    const mm = scaleOutlines(rings, 120 / 50);
    const b = bboxOf(mm[0]);
    expect(b.y1 - b.y0).toBeCloseTo(120);
    expect(b.x1 - b.x0).toBeCloseTo(48);
    expect(b.x0).toBeCloseTo(0);
    expect(b.y0).toBeCloseTo(0);
  });
});
