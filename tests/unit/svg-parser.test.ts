import { describe, expect, it } from 'vitest';
import { bboxOf, polyArea } from '../../src/engines/geometry-engine/geometry';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import { LIMITS, parseSvg, SvgImportError } from '../../src/engines/svg-parser/parse-svg';
import { partsOf, readSample, svgDoc } from './helpers';

const codes = (text: string) => parseSvg(text).issues.map(i => i.code);
const close = (v: number, want: number, eps = 0.05) => expect(Math.abs(v - want)).toBeLessThan(eps);
const shapeBox = (text: string, i = 0) => bboxOf(parseSvg(text).shapes[i]);

describe('shapes (cases 1, 2)', () => {
  it('reads a simple closed curve as one part', () => {
    const parts = partsOf(svgDoc('<path d="M10 10 C30 0 50 0 70 10 L70 50 L10 50 Z"/>'));
    expect(parts).toHaveLength(1);
    expect(parts[0].outers).toHaveLength(1);
  });

  it('reads every supported element', () => {
    const p = parseSvg(svgDoc(`
      <rect x="1" y="1" width="10" height="10"/>
      <rect x="20" y="1" width="10" height="10" rx="2"/>
      <circle cx="50" cy="10" r="8"/>
      <ellipse cx="70" cy="10" rx="9" ry="5"/>
      <polygon points="1,30 11,30 11,40"/>
      <path d="M30 30 Q40 20 50 30 T70 30 L70 40 Z"/>
      <path d="M80 30 A5 5 0 1 1 80.1 30 Z"/>`));
    expect(p.shapes).toHaveLength(7);
    expect(p.imported.rect).toBe(2);
    expect(p.imported.circle).toBe(1);
    expect(p.imported.ellipse).toBe(1);
    expect(p.imported.polygon).toBe(1);
    expect(p.imported.path).toBe(2);
  });

  it('computes true areas for circle and arcs', () => {
    const [circle] = parseSvg(svgDoc('<circle cx="50" cy="50" r="40"/>')).shapes;
    expect(polyArea(circle) / (Math.PI * 1600)).toBeCloseTo(1, 2);
    const [arc] = parseSvg(svgDoc('<path d="M10 50 A40 40 0 1 1 90 50 A40 40 0 1 1 10 50 Z"/>')).shapes;
    expect(polyArea(arc) / (Math.PI * 1600)).toBeCloseTo(1, 2);
  });

  it('honours relative commands, H, V, S and implicit repeats', () => {
    const b = shapeBox(svgDoc('<path d="M10 10 h30 v20 h-30 z"/>'));
    expect([b.x0, b.y0, b.x1, b.y1]).toEqual([10, 10, 40, 30]);
    const zig = shapeBox(svgDoc('<path d="M0 0 10 0 10 10 0 10z"/>'));
    expect(zig.x1).toBe(10);
    const s = parseSvg(svgDoc('<path d="M0 50 C0 20 30 20 30 50 S60 80 60 50 Z"/>')).shapes[0];
    expect(s.length).toBeGreaterThan(10);
  });

  it('reads arc flags written with no separators', () => {
    const a = parseSvg(svgDoc('<path d="M10 50a40 40 0 1180 0z"/>'));
    expect(a.shapes).toHaveLength(1);
    expect(a.issues.map(i => i.code)).not.toContain('malformed-path');
    close(bboxOf(a.shapes[0]).x1, 90, 0.2);
  });

  it('parses exponent numbers (a bug in the first version)', () => {
    const b = shapeBox(svgDoc('<path d="M1e1 10L4e1 10 40 3e1 10 30Z"/>'));
    expect([b.x0, b.x1, b.y1]).toEqual([10, 40, 30]);
  });
});

describe('holes and compound paths (cases 3, 4)', () => {
  it('finds a hole inside a letter', () => {
    const parts = partsOf(svgDoc('<path d="M10 10H90V90H10ZM30 30V70H70V30Z"/>'));
    expect(parts).toHaveLength(1);
    expect(parts[0].holes).toHaveLength(1);
    expect(parts[0].area).toBeCloseTo(80 * 80 - 40 * 40, 0);
  });

  it('keeps an island inside a hole as its own piece of foam', () => {
    const parts = partsOf(svgDoc('<path d="M5 5H85V85H5ZM20 20V70H70V20Z"/><rect x="35" y="35" width="20" height="20"/>'));
    expect(parts).toHaveLength(2);
    expect(parts.find(p => p.holes.length === 1)).toBeTruthy();
  });

  it('splits one compound path into separate letters', () => {
    const parts = partsOf(svgDoc('<path d="M1 1H21V21H1ZM41 1H61V21H41Z"/>'));
    expect(parts).toHaveLength(2);
  });
});

describe('transforms (case 5)', () => {
  it('nests transforms from group to element', () => {
    const b = shapeBox(svgDoc('<g transform="translate(10 20)"><g transform="scale(2)"><rect width="5" height="5" transform="translate(1 1)"/></g></g>'));
    expect([b.x0, b.y0, b.x1, b.y1]).toEqual([12, 22, 22, 32]);
  });

  it('applies rotate around a centre and matrix', () => {
    const r = shapeBox(svgDoc('<rect x="40" y="45" width="20" height="10" transform="rotate(90 50 50)"/>'));
    close(r.x1 - r.x0, 10); close(r.y1 - r.y0, 20); close(r.x0, 45);
    const m = shapeBox(svgDoc('<rect width="10" height="10" transform="matrix(2 0 0 3 5 6)"/>'));
    expect([m.x0, m.y0, m.x1, m.y1]).toEqual([5, 6, 25, 36]);
  });

  it('expands <use> and symbols, and stops reference cycles', () => {
    const ok = parseSvg(svgDoc('<defs><rect id="a" width="10" height="10"/></defs><use href="#a" x="20"/><use xlink:href="#a" x="40"/>'));
    expect(ok.shapes).toHaveLength(2);
    expect(bboxOf(ok.shapes[1]).x0).toBe(40);
    expect(codes(svgDoc('<g id="a"><use href="#a"/></g><rect width="9" height="9"/>'))).toContain('use-cycle');
    expect(codes(svgDoc('<use href="other.svg#x"/><rect width="9" height="9"/>'))).toContain('use-external');
  });
});

describe('units and viewBox (case 6)', () => {
  const sized = (attrs: string) => bboxOf(parseSvg(svgDoc('<rect width="100" height="50"/>', attrs)).shapes[0]);

  it('maps the viewBox onto the physical size', () => {
    const b = sized('width="200mm" height="100mm" viewBox="0 0 100 50"');
    close(b.x1, 200); close(b.y1, 100);
    const cm = sized('width="10cm" height="5cm" viewBox="0 0 100 50"');
    close(cm.x1, 100);
    const inch = sized('width="4in" height="2in" viewBox="0 0 100 50"');
    close(inch.x1, 101.6);
  });

  it('respects a viewBox origin and preserveAspectRatio centring', () => {
    const o = bboxOf(parseSvg(svgDoc('<rect x="10" y="10" width="10" height="10"/>', 'width="100mm" height="100mm" viewBox="10 10 100 100"')).shapes[0]);
    close(o.x0, 0);
    const c = bboxOf(parseSvg(svgDoc('<rect width="100" height="100"/>', 'width="200mm" height="100mm" viewBox="0 0 100 100"')).shapes[0]);
    close(c.x0, 50); close(c.x1, 150);
  });

  it('converts absolute units inside attributes', () => {
    const b = bboxOf(parseSvg(svgDoc('<rect width="1cm" height="10mm"/>', 'width="100mm" height="100mm"')).shapes[0]);
    close(b.x1, 10, 0.3);
  });

  it('warns about percent lengths', () => {
    expect(codes(svgDoc('<rect width="50%" height="10"/>'))).toContain('bad-length');
  });
});

describe('styling', () => {
  it('skips hidden shapes and reports them', () => {
    const p = parseSvg(svgDoc('<g style="display:none"><rect width="9" height="9"/></g><rect visibility="hidden" width="9" height="9"/><rect x="20" width="9" height="9"/>'));
    expect(p.shapes).toHaveLength(1);
    expect(p.issues.find(i => i.code === 'hidden')?.count).toBe(2);
  });

  it('applies CSS classes, ids and inheritance', () => {
    const p = parseSvg(svgDoc('<style>.a{fill:none}#b{display:none}</style><rect class="a" width="9" height="9"/><rect id="b" width="9" height="9"/><rect width="9" height="9"/>'));
    expect(p.markers.length + p.shapes.length).toBe(2);
    expect(p.shapes).toHaveLength(1);
  });

  it('reports CSS it cannot read', () => {
    expect(codes(svgDoc('<style>rect:hover{display:none}</style><rect width="9" height="9"/>'))).toContain('css-unsupported');
  });

  it('uses a small unfilled rectangle as the wire start marker', () => {
    const p = parseSvg(svgDoc('<rect x="2" y="2" width="15" height="18" fill="none" stroke="#000"/><rect x="30" width="30" height="30"/>'));
    expect(p.markers).toHaveLength(1);
    expect(p.shapes).toHaveLength(1);
  });
});

describe('duplicates and open contours (cases 7, 8)', () => {
  it('removes duplicates and counts them', () => {
    const r = buildParts(parseSvg(svgDoc('<rect width="20" height="20"/><rect width="20" height="20"/><rect x="40" width="20" height="20"/>')).shapes);
    expect(r.dupes).toBe(1);
    expect(r.parts).toHaveLength(2);
  });

  it('closes open outlines and reports it', () => {
    const p = parseSvg(svgDoc('<path d="M10 10L50 10L50 50"/>'));
    expect(p.shapes).toHaveLength(1);
    expect(p.issues.map(i => i.code)).toContain('open-closed');
  });

  it('drops strokes that cannot form a shape', () => {
    const p = parseSvg(svgDoc('<path d="M10 10L50 10"/><rect x="60" width="9" height="9"/>'));
    expect(p.shapes).toHaveLength(1);
    expect(p.issues.map(i => i.code)).toContain('dropped-open');
  });

  it('drops tiny specks', () => {
    const r = buildParts(parseSvg(svgDoc('<rect width="0.5" height="0.5"/><rect x="10" width="9" height="9"/>')).shapes);
    expect(r.tiny).toBe(1);
    expect(r.parts).toHaveLength(1);
  });

  it('flags crossing shapes', () => {
    const r = buildParts(parseSvg(svgDoc('<rect width="30" height="30"/><rect x="15" y="15" width="30" height="30"/>')).shapes);
    expect(r.overlaps).toBeGreaterThan(0);
  });
});

describe('unsupported content is reported, never silent (case 9)', () => {
  const report = parseSvg(readSample('file-with-problems.svg'));
  const found = report.issues.map(i => i.code);

  it.each(['text', 'image', 'script', 'open-closed', 'line', 'malformed-path'] as const)('reports %s', code => {
    expect(found).toContain(code);
  });

  it('keeps geometry read before a path error', () => {
    const p = parseSvg(svgDoc('<path d="M10 10H50V50H10Z M 20 20 Q"/>'));
    expect(p.shapes).toHaveLength(1);
    expect(p.issues.map(i => i.code)).toContain('malformed-path');
  });

  it('reports foreignObject, clip and unknown elements', () => {
    const c = codes(svgDoc('<foreignObject><div/></foreignObject><clipPath id="c"><rect width="9" height="9"/></clipPath><rect width="9" height="9" clip-path="url(#c)"/><blink/>'));
    expect(c).toEqual(expect.arrayContaining(['foreign-object', 'clip-mask', 'unknown-element']));
  });

  it('ignores editor namespaces instead of warning about them', () => {
    const text = svgDoc('<inkscape:path xmlns:inkscape="urn:x"/><rect width="9" height="9"/>');
    expect(codes(text)).not.toContain('unknown-element');
  });
});

describe('hostile input (phase 10)', () => {
  it('never executes script or event handlers', () => {
    const w = globalThis as { pwned?: boolean };
    parseSvg(svgDoc('<script>globalThis.pwned = true</script><rect width="9" height="9" onload="globalThis.pwned=true"/>'));
    expect(w.pwned).toBeUndefined();
  });

  it('refuses non-SVG and damaged files with a typed error', () => {
    const err = (t: string) => { try { parseSvg(t); } catch (e) { return e as SvgImportError; } return null; };
    expect(err('<html><body>hi</body></html>')).toBeInstanceOf(SvgImportError);
    expect(err('')).toBeInstanceOf(SvgImportError);
    expect(err('not markup at all')).toBeInstanceOf(SvgImportError);
  });

  it('refuses entity-expansion bombs', () => {
    const lol = `<!DOCTYPE svg [${Array.from({ length: LIMITS.entities + 2 }, (_, i) => `<!ENTITY a${i} "x">`).join('')}]><svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9"/></svg>`;
    expect(() => parseSvg(lol)).toThrow(SvgImportError);
  });

  it('refuses geometry beyond the limits', () => {
    const body = '<g/>'.repeat(LIMITS.elements * 2 + 10);
    expect(() => parseSvg(svgDoc(body))).toThrow(SvgImportError);
  });

  it('reads ordinary nesting and refuses absurd nesting cleanly', () => {
    const nested = (n: number) => svgDoc('<g>'.repeat(n) + '<rect width="9" height="9"/>' + '</g>'.repeat(n));
    expect(parseSvg(nested(100)).shapes).toHaveLength(1);
    expect(() => parseSvg(nested(20000))).toThrow(SvgImportError);
  }, 180_000); // jsdom takes about a minute to build a tree this deep

  it('handles NaN and infinite coordinates without leaking them', () => {
    const p = parseSvg(svgDoc('<rect width="NaN" height="10"/><rect x="1e999" width="9" height="9"/><rect x="20" width="9" height="9"/>'));
    for (const s of p.shapes) for (const q of s) expect(Number.isFinite(q[0]) && Number.isFinite(q[1])).toBe(true);
  });
});
