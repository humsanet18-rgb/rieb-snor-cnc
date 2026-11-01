import type { PlacedItem, Point, Polygon, Rect, StartSpec, Stroke } from '../../types/geometry';
import type { MachineProfile, NestMode } from '../../types/project';
import { parseTap } from '../gcode-engine/tap';
import { bboxOf, boxGap, contourDistance, pointInPoly, pointSegDistance, segCross, segHitsRect } from '../geometry-engine/geometry';

export type ValidationCode =
  | 'path-empty' | 'nan' | 'out-of-bounds' | 'unlinked' | 'contour-missing' | 'clamp-collision' | 'clamp-piece'
  | 'start-outside' | 'start-in-zone' | 'start-mismatch' | 'path-open' | 'overlap' | 'gap-violation' | 'margin-violation'
  | 'bridge-crosses' | 'long-bridge' | 'profile-feed' | 'profile-power' | 'profile-name' | 'exceeds-travel'
  | 'tap-format' | 'tap-mismatch' | 'unplaced';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: ValidationCode;
  severity: ValidationSeverity;
  /** Sheet index, or -1 for something that applies to the whole job. */
  sheet: number;
  count: number;
  detail?: string;
  at?: Point;
}

const SEVERITY: Record<ValidationCode, ValidationSeverity> = {
  'path-empty': 'error', 'nan': 'error', 'out-of-bounds': 'error', 'unlinked': 'error', 'contour-missing': 'error',
  'clamp-collision': 'error', 'clamp-piece': 'error', 'start-outside': 'error', 'start-in-zone': 'error', 'start-mismatch': 'error',
  'path-open': 'warning', 'overlap': 'error', 'gap-violation': 'warning', 'margin-violation': 'warning',
  'bridge-crosses': 'warning', 'long-bridge': 'info', 'profile-feed': 'error', 'profile-power': 'error', 'profile-name': 'warning',
  'exceeds-travel': 'error', 'tap-format': 'error', 'tap-mismatch': 'error', 'unplaced': 'warning'
};

const LONG_BRIDGE = 200; // mm
const GAP_TOL = 0.05, PATH_TOL = 0.06;

export interface SheetCheck {
  sheet: number; items: PlacedItem[]; stroke: Stroke; start: StartSpec;
  sheetW: number; sheetH: number; zones: Rect[]; gap: number; margin: number; mode: NestMode;
  /** False when the operator chose to end at the last piece instead of back at the start. */
  closed?: boolean;
}

/** Every contour vertex must lie on the stroke; a spatial hash keeps this linear in path size. */
function missingVertices(items: PlacedItem[], path: Polygon): number {
  const size = 8, grid = new Map<number, number[]>();
  const key = (x: number, y: number) => Math.floor(x / size) * 100003 + Math.floor(y / size);
  const add = (k: number, i: number) => { const l = grid.get(k); if (l) { if (l[l.length - 1] !== i) l.push(i); } else grid.set(k, [i]); };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (size / 2)) + 1;
    for (let k = 0; k <= n; k++) add(key(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n), i);
  }
  let missing = 0;
  for (const it of items) for (const c of [...it.outers, ...it.holes]) for (const q of c) {
    let on = false;
    for (let dx = -1; dx <= 1 && !on; dx++) for (let dy = -1; dy <= 1 && !on; dy++) {
      for (const i of grid.get(key(q[0] + dx * size, q[1] + dy * size)) ?? []) {
        if (pointSegDistance(q, path[i - 1], path[i]) <= PATH_TOL) { on = true; break; }
      }
    }
    if (!on) missing++;
  }
  return missing;
}

function onContour(p: Point, c: Polygon): boolean {
  for (let i = 0; i < c.length; i++) if (pointSegDistance(p, c[i], c[(i + 1) % c.length]) < PATH_TOL) return true;
  return false;
}

export function validateSheet(c: SheetCheck): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (code: ValidationCode, count = 1, at?: Point, detail?: string) => out.push({ code, severity: SEVERITY[code], sheet: c.sheet, count, at, detail });
  const { items, stroke, zones, sheetW: W, sheetH: H } = c, path = stroke.path;
  if (!path.length) { add('path-empty'); return out; }
  if (path.some(q => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) { add('nan'); return out; }

  const outside = path.filter(q => q[0] < 0 || q[1] < 0 || q[0] > W || q[1] > H);
  if (outside.length) add('out-of-bounds', outside.length, outside[0]);
  if (stroke.unlinked) add('unlinked', stroke.unlinked);
  const missing = missingVertices(items, path);
  if (missing) add('contour-missing', missing);
  let hits = 0, firstHit: Point | undefined;
  for (let i = 1; i < path.length; i++) if (zones.some(z => segHitsRect(path[i - 1], path[i], z))) { hits++; firstHit ??= path[i]; }
  if (hits) add('clamp-collision', hits, firstHit);
  const pieceHits = items.filter(it => it.outers.some(p => p.some(q => zones.some(z => q[0] >= z.x && q[0] <= z.x + z.w && q[1] >= z.y && q[1] <= z.y + z.h))));
  if (pieceHits.length) add('clamp-piece', pieceHits.length, pieceHits[0].outers[0][0]);

  if ('box' in c.start) {
    const b = c.start.box;
    if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) add('start-outside');
    if (zones.some(z => b.x < z.x + z.w && b.x + b.w > z.x && b.y < z.y + z.h && b.y + b.h > z.y)) add('start-in-zone');
    if (Math.hypot(path[0][0] - b.x, path[0][1] - b.y) > 0.02) add('start-mismatch');
  } else {
    if (c.start.x < 0 || c.start.y < 0 || c.start.x > W || c.start.y > H) add('start-outside');
    if (Math.hypot(path[0][0] - c.start.x, path[0][1] - c.start.y) > 0.02) add('start-mismatch');
  }
  const end = path[path.length - 1];
  if (c.closed !== false && Math.hypot(end[0] - path[0][0], end[1] - path[0][1]) > 0.02) add('path-open', 1, end);

  // Exact distances between the outlines, independent of the raster that placed them.
  const boxes = items.map(it => bboxOf(it.outers.flat()));
  let overlaps = 0, tight = 0, tightest = Infinity, overlapAt: Point | undefined, tightAt: Point | undefined;
  const reach = c.mode === 'keep' ? 0 : c.gap;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const apart = boxGap(boxes[i], boxes[j]);
    if (reach ? apart >= reach : apart > 0) continue;
    let d = Infinity;
    for (const A of items[i].outers) for (const B of items[j].outers) d = Math.min(d, contourDistance(A, B));
    const inside = (a: PlacedItem, b: PlacedItem) => {
      const q = a.outers[0][0];
      return b.outers.some(o => pointInPoly(q, o)) && !b.holes.some(h => pointInPoly(q, h));
    };
    if (d === 0 || inside(items[i], items[j]) || inside(items[j], items[i])) { overlaps++; overlapAt ??= items[i].outers[0][0]; }
    else if (c.mode !== 'keep' && d < c.gap - GAP_TOL) { tight++; if (d < tightest) { tightest = d; tightAt = items[i].outers[0][0]; } }
  }
  if (overlaps) add('overlap', overlaps, overlapAt);
  if (tight) add('gap-violation', tight, tightAt, tightest.toFixed(2));
  if (c.mode !== 'keep') {
    const m = c.margin - GAP_TOL;
    const near = items.filter(it => it.outers.some(p => p.some(q => q[0] < m || q[1] < m || q[0] > W - m || q[1] > H - m)));
    if (near.length) add('margin-violation', near.length, near[0].outers[0][0]);
  }

  let crossing = 0, crossAt: Point | undefined, longest = 0;
  const contours = items.flatMap(it => [...it.outers, ...it.holes]).map(p => ({ p, box: bboxOf(p) }));
  for (const [a, b] of stroke.bridges) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > longest) longest = len;
    const box = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
    for (const { p, box: cb } of contours) {
      if (boxGap(box, cb) > 0 || onContour(a, p) || onContour(b, p)) continue;
      if (p.some((q, i) => segCross(a, b, q, p[(i + 1) % p.length]))) { crossing++; crossAt ??= a; break; }
    }
  }
  if (crossing) add('bridge-crosses', crossing, crossAt);
  if (longest > LONG_BRIDGE) add('long-bridge', 1, undefined, longest.toFixed(0));
  return out;
}

export function validateProfile(p: MachineProfile, paths: Polygon[]): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (code: ValidationCode, detail?: string) => out.push({ code, severity: SEVERITY[code], sheet: -1, count: 1, detail });
  if (!Number.isFinite(p.feed) || p.feed <= 0) add('profile-feed', String(p.feed));
  if (!Number.isFinite(p.power) || p.power < 0) add('profile-power', String(p.power));
  if (!p.name.trim()) add('profile-name');
  const pts = paths.flat();
  if (pts.length && (p.maxX !== null || p.maxY !== null)) {
    const b = bboxOf(pts);
    if ((p.maxX !== null && b.x1 > p.maxX) || (p.maxY !== null && b.y1 > p.maxY)) add('exceeds-travel', `${b.x1.toFixed(0)} × ${b.y1.toFixed(0)} mm`);
  }
  return out;
}

/** Re-reads the generated text and compares it with the path shown on screen, move by move. */
export function validateTap(sheet: number, tap: string, path: Polygon, p: MachineProfile): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (code: ValidationCode, count: number, detail?: string, at?: Point) => out.push({ code, severity: SEVERITY[code], sheet, count, detail, at });
  const parsed = parseTap(tap);
  if (parsed.errors.length) add('tap-format', parsed.errors.length, `${parsed.errors[0].code} @${parsed.errors[0].line}`);
  if (parsed.feed !== p.feed || parsed.power !== p.power || parsed.m5 !== p.m5) add('tap-mismatch', 1, 'F/S/M5');
  if (parsed.moves.length !== path.length) add('tap-mismatch', 1, `${parsed.moves.length} vs ${path.length}`);
  else {
    const off = parsed.moves.findIndex((q, i) => Math.abs(q[0] - path[i][0]) > 0.0051 || Math.abs(q[1] - path[i][1]) > 0.0051);
    if (off >= 0) add('tap-mismatch', 1, `move ${off}`, path[off]);
  }
  return out;
}

export const hasBlocking = (list: ValidationIssue[]): boolean => list.some(i => i.severity === 'error');
