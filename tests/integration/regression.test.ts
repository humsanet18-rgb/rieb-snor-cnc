import { describe, expect, it } from 'vitest';
import { toTAP } from '../../src/engines/gcode-engine/tap';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import { bboxOf } from '../../src/engines/geometry-engine/geometry';
import { parseSvg } from '../../src/engines/svg-parser/parse-svg';
import { buildStroke } from '../../src/engines/toolpath-engine/stroke';
import { toSVG } from '../../src/engines/export/svg-export';
import type { Part, StartSpec } from '../../src/types/geometry';
import { legacy, privateFile } from '../unit/helpers';

const FILES = ['Ba+1 01', 'Ba+1 02', 'Ba+1 03', 'Ba+1 04'];
const DATE = '1/1/2026 12:00:00 AM';
const OPTS = { feed: 500, power: 300, m5: false, date: DATE };
const ZONES = [{ x: 0, y: 430, w: 150, h: 50 }, { x: 950, y: 430, w: 50, h: 50 }];

function startOf(markers: [number, number][][]): StartSpec {
  const b = markers.length ? bboxOf(markers[0]) : null;
  return b ? { box: { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 } } : { x: 0, y: 0 };
}

// The same text through both engines, keep-position mode, compared to the byte.
describe.skipIf(!privateFile('Ba+1 01.svg'))('regression against the original engine (real customer files)', () => {
  for (const name of FILES) {
    const text = privateFile(name + '.svg')!;

    it(`${name}: parser finds the same contours`, () => {
      const a = parseSvg(text), b = legacy.parseSVG(text);
      expect(a.shapes).toEqual(b.shapes);
      expect(a.markers).toEqual(b.markers);
      expect(a.page).toEqual(b.page);
    });

    it(`${name}: parts are identical`, () => {
      const a = buildParts(parseSvg(text).shapes), b = legacy.buildParts(legacy.parseSVG(text).shapes);
      expect(a.parts.map((p: Part) => ({ o: p.outers, h: p.holes, a: p.area }))).toEqual(b.parts.map((p: Part) => ({ o: p.outers, h: p.holes, a: p.area })));
      expect([a.tiny, a.dupes, a.overlaps]).toEqual([b.tiny, b.dupes, b.overlaps]);
    });

    for (const zones of [[], ZONES]) {
      it(`${name}: TAP is byte-identical (${zones.length} zones)`, () => {
        const parsed = parseSvg(text), parts = buildParts(parsed.shapes).parts, start = startOf(parsed.markers);
        const lp = legacy.parseSVG(text), lparts = legacy.buildParts(lp.shapes).parts;
        const stroke = buildStroke(parts, start, zones), ls = legacy.buildStroke(lparts, start, zones);
        expect(stroke.bridges).toEqual(ls.bridges);
        expect(stroke.unlinked).toBe(ls.unlinked);
        expect(toTAP(stroke.path, { ...OPTS, name: name + '.tap' })).toBe(legacy.toTAP(ls.path, { ...OPTS, name: name + '.tap' }));
      });
    }

    it(`${name}: exported SVG is byte-identical`, () => {
      const parts = buildParts(parseSvg(text).shapes).parts;
      const lparts = legacy.buildParts(legacy.parseSVG(text).shapes).parts;
      expect(toSVG(parts, 1000, 480, null)).toBe(legacy.toSVG(lparts, 1000, 480, null));
    });

    it(`${name}: matches the real FCNC TAP within tolerance`, () => {
      const fcnc = privateFile(name + '.tap')!;
      const moves = [...fcnc.matchAll(/G1\s+X(-?[\d.]+)\s+Y(-?[\d.]+)/g)].map(m => [+m[1], +m[2]] as [number, number]);
      const box = bboxOf(moves), ours = bboxOf(buildParts(parseSvg(text).shapes).parts.flatMap(p => p.outers.flat()));
      // FCNC cuts the same geometry, so the job outlines must agree; its start box may reach further toward X0 Y0.
      expect(Math.abs(box.x1 - ours.x1)).toBeLessThan(0.6);
      expect(Math.abs(box.y1 - ours.y1)).toBeLessThan(0.6);
    });
  }
});
