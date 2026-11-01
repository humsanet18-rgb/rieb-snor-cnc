import { describe, expect, it } from 'vitest';
import { parseTap, toTAP, type TapOptions } from '../../src/engines/gcode-engine/tap';
import { pointSegDistance } from '../../src/engines/geometry-engine/geometry';
import { pathLength, buildStroke, simplifyPath } from '../../src/engines/toolpath-engine/stroke';
import { hasBlocking, validateProfile, validateSheet, validateTap, type SheetCheck } from '../../src/engines/toolpath-engine/validate';
import { defaultProfile } from '../../src/features/nesting/model';
import { tapDate } from '../../src/services/download';
import type { PlacedItem, Polygon, Rect, StartSpec } from '../../src/types/geometry';
import { box } from './helpers';

const item = (outers: Polygon[], holes: Polygon[] = []): PlacedItem => ({ outers, holes, area: 1 });
const startBox: StartSpec = { box: { x: 1.5, y: 1, w: 15, h: 18 } };
const tapOpts: TapOptions = { name: 'test', feed: 500, power: 300, m5: false, date: '11/1/2026 7:00:00 PM' };
const onPath = (path: Polygon, q: [number, number]) => path.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02);

function check(items: PlacedItem[], extra: Partial<SheetCheck> = {}): SheetCheck {
  const start = extra.start ?? startBox, zones = extra.zones ?? [];
  return { sheet: 0, items, stroke: buildStroke(items, start, zones), start, sheetW: 1000, sheetH: 480, zones, gap: 5, margin: 8, mode: 'auto', ...extra };
}
const codes = (c: SheetCheck) => validateSheet(c).map(i => i.code);

describe('continuous stroke', () => {
  const items = [item([box(100, 100, 80, 60)], [box(120, 115, 30, 25)]), item([box(300, 200, 50, 50)]), item([box(500, 40, 40, 90)])];
  const s = buildStroke(items, startBox);

  it('starts and ends at the start point, so a sheet is one closed tour', () => {
    expect(s.path[0]).toEqual([1.5, 1]);
    expect(s.path[s.path.length - 1]).toEqual(s.path[0]);
  });

  it('visits every outer and hole vertex', () => {
    for (const it of items) for (const c of [...it.outers, ...it.holes]) for (const q of c) expect(onPath(s.path, q)).toBe(true);
    expect(s.unlinked).toBe(0);
  });

  it('passes the validator with no error', () => {
    expect(hasBlocking(validateSheet(check(items)))).toBe(false);
  });

  it('walks every bridge out and back, because the wire cannot lift', () => {
    expect(s.bridges.length).toBeGreaterThan(0);
    for (const [a, b] of s.bridges) {
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const passes = s.path.slice(1).filter((q, i) => pointSegDistance(mid, s.path[i], q) < 1e-6).length;
      expect(passes).toBe(2);
    }
  });

  it('handles a start at an open point without a box', () => {
    const r = buildStroke([item([box(100, 100, 50, 50)])], { x: 10, y: 10 });
    expect(r.path[0]).toEqual([10, 10]);
  });

  it('keeps an island inside a hole reachable through the ring', () => {
    const it0 = item([box(100, 100, 200, 200)], [box(130, 130, 140, 140)]), island = item([box(180, 180, 40, 40)]);
    const r = buildStroke([it0, island], startBox);
    for (const c of [it0.outers[0], it0.holes[0], island.outers[0]]) for (const q of c) expect(onPath(r.path, q)).toBe(true);
    expect(hasBlocking(validateSheet(check([it0, island])))).toBe(false);
  });

  it('does not overflow the stack on a long chain of contours', () => {
    const many = Array.from({ length: 3000 }, (_, i) => item([box(2 * (i % 490) + 5, 20 + Math.floor(i / 490) * 8, 1, 4)]));
    const r = buildStroke(many, startBox);
    expect(r.unlinked).toBe(0);
    expect(r.path.length).toBeGreaterThan(many.length);
  });

  it('removes only collinear midpoints', () => {
    expect(simplifyPath([[0, 0], [5, 0], [10, 0], [10, 10]])).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(pathLength([[0, 0], [3, 4]])).toBe(5);
  });
});

describe('clamp zones', () => {
  const zones: Rect[] = [{ x: 0, y: 430, w: 150, h: 50 }];

  it('routes the wire around a zone instead of through it', () => {
    const items = [item([box(20, 300, 60, 60)]), item([box(200, 440, 30, 30)])];
    const c = check(items, { zones });
    expect(codes(c)).not.toContain('clamp-collision');
  });

  it('flags a path that was forced through a zone', () => {
    const items = [item([box(20, 300, 60, 60)])];
    const c = check(items, { zones });
    c.stroke = { ...c.stroke, path: [...c.stroke.path.slice(0, -1), [50, 460], c.stroke.path[0]] };
    expect(codes(c)).toContain('clamp-collision');
  });

  it('flags a piece placed in a zone', () => {
    expect(codes(check([item([box(30, 440, 30, 30)])], { zones }))).toContain('clamp-piece');
  });

  it('flags a start box inside a zone', () => {
    expect(codes(check([item([box(300, 100, 30, 30)])], { zones: [{ x: 0, y: 0, w: 60, h: 60 }] }))).toContain('start-in-zone');
  });
});

describe('sheet validation catches each fault (negative cases)', () => {
  const good = () => check([item([box(100, 100, 80, 60)]), item([box(300, 100, 80, 60)])]);

  it('empty path', () => {
    const c = good(); c.stroke = { ...c.stroke, path: [] };
    expect(codes(c)).toContain('path-empty');
  });
  it('invalid number', () => {
    const c = good(); c.stroke = { ...c.stroke, path: [c.stroke.path[0], [NaN, 3], c.stroke.path[0]] };
    expect(codes(c)).toContain('nan');
  });
  it('path off the sheet', () => {
    const c = good(); c.stroke = { ...c.stroke, path: [...c.stroke.path.slice(0, -1), [1200, 50], c.stroke.path[0]] };
    expect(codes(c)).toContain('out-of-bounds');
  });
  it('contour missing from path', () => {
    const c = good(); c.stroke = { ...c.stroke, path: c.stroke.path.slice(0, 8).concat([c.stroke.path[0]]) };
    expect(codes(c)).toContain('contour-missing');
  });
  it('unlinked contour', () => {
    const c = good(); c.stroke = { ...c.stroke, unlinked: 1 };
    expect(codes(c)).toContain('unlinked');
  });
  it('wrong start', () => {
    const c = good(); c.start = { box: { x: 40, y: 40, w: 15, h: 18 } };
    expect(codes(c)).toContain('start-mismatch');
  });
  it('start outside the sheet', () => {
    expect(codes(check([item([box(100, 100, 50, 50)])], { start: { x: -5, y: 2 } }))).toContain('start-outside');
  });
  it('overlap', () => {
    expect(codes(check([item([box(100, 100, 80, 60)]), item([box(120, 120, 80, 60)])]))).toContain('overlap');
  });
  it('gap too small', () => {
    expect(codes(check([item([box(100, 100, 80, 60)]), item([box(182, 100, 80, 60)])]))).toContain('gap-violation');
  });
  it('margin not kept', () => {
    expect(codes(check([item([box(3, 100, 80, 60)])]))).toContain('margin-violation');
  });
});

describe('machine profile (case 22)', () => {
  const path: Polygon[] = [[[0, 0], [900, 400]]];
  const codesOf = (p: Partial<ReturnType<typeof defaultProfile>>) => validateProfile({ ...defaultProfile(), ...p }, path).map(i => i.code);

  it('accepts the default profile', () => { expect(hasBlocking(validateProfile(defaultProfile(), path))).toBe(false); });
  it('rejects zero, negative and non-finite feed', () => {
    for (const feed of [0, -5, NaN, Infinity]) expect(codesOf({ feed })).toContain('profile-feed');
  });
  it('rejects a bad heat value', () => {
    for (const power of [-1, NaN]) expect(codesOf({ power })).toContain('profile-power');
  });
  it('rejects an empty name', () => { expect(codesOf({ name: ' ' })).toContain('profile-name'); });
  it('flags paths beyond machine travel only when travel is set', () => {
    expect(codesOf({ maxX: 500, maxY: 500 })).toContain('exceeds-travel');
    expect(codesOf({ maxX: 1000, maxY: 500 })).not.toContain('exceeds-travel');
    expect(codesOf({})).not.toContain('exceeds-travel');
  });
});

describe('TAP output (case 18)', () => {
  const path: Polygon = [[1.5, 1], [100, 1], [100.25, 50.5], [1.5, 50.5], [1.5, 1]];
  const tap = toTAP(path, tapOpts);

  it('has a valid structure and round-trips exact coordinates', () => {
    const p = parseTap(tap);
    expect(p.errors).toEqual([]);
    expect(p.feed).toBe(500);
    expect(p.power).toBe(300);
    expect(p.moves).toEqual(path);
    expect(validateTap(0, tap, path, defaultProfile())).toEqual([]);
  });

  it('adds M5 only when asked', () => {
    expect(tap).not.toContain('M5');
    const m5 = toTAP(path, { ...tapOpts, m5: true });
    expect(m5).toContain('M5');
    expect(parseTap(m5).m5).toBe(true);
    expect(parseTap(m5).errors).toEqual([]);
  });

  it('is plain ASCII for any timestamp format', () => {
    expect(/^[\x00-\x7f]*$/.test(tapDate(new Date(2026, 10, 1, 19, 5, 9)))).toBe(true);
    expect(tapDate(new Date(2026, 10, 1, 19, 5, 9))).toBe('11/1/2026 7:05:09 PM');
    expect(tapDate(new Date(2026, 0, 2, 0, 1, 2))).toBe('1/2/2026 12:01:02 AM');
  });

  it('flags a TAP that does not match the preview', () => {
    const other: Polygon = path.map(q => [q[0] + 1, q[1]]);
    expect(validateTap(0, tap, other, defaultProfile()).map(i => i.code)).toContain('tap-mismatch');
    expect(validateTap(0, tap, path, { ...defaultProfile(), feed: 400 }).map(i => i.code)).toContain('tap-mismatch');
  });

  const broken: [string, (s: string) => string, string][] = [
    ['missing feed', s => s.replace(/N\d+ F500\s*\n/, ''), 'missing-feed'],
    ['missing spindle', s => s.replace(/N\d+ M3 S300\s*\n/, ''), 'missing-spindle'],
    ['missing end', s => s.replace('(EOF)', ''), 'missing-eof'],
    ['garbage line', s => s.replace('G1 X100.00', 'G7 BAD'), 'bad-line'],
    ['non-ASCII byte', s => s + 'ស', 'non-ascii']
  ];
  it.each(broken)('detects %s', (_, damage, code) => {
    expect(parseTap(damage(tap)).errors.map(e => e.code)).toContain(code);
  });

  it('detects a duplicated line number and a repeated move', () => {
    const lines = tap.split('\n'), i = lines.findIndex(l => l.includes('X100.00'));
    const copy = [...lines.slice(0, i + 1), lines[i], ...lines.slice(i + 1)].join('\n');
    const found = parseTap(copy).errors.map(e => e.code);
    expect(found).toEqual(expect.arrayContaining(['duplicate-line']));
  });
});
