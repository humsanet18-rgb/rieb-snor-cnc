import type { Matrix, Point, Polygon } from '../../types/geometry';
import { matApply, matMul } from '../geometry-engine/geometry';

const FLAT_TOL = 0.04; // mm chord error when flattening curves

export interface PathResult { polys: Polygon[]; open: number; dropped: number; malformed: number }

export function parseTransform(s: string | null | undefined): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(s || ''))) {
    const v = (t[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || []).map(Number);
    let n: Matrix = [1, 0, 0, 1, 0, 0];
    if (t[1] === 'matrix') { if (v.length === 6) n = v as Matrix; }
    else if (t[1] === 'translate') n = [1, 0, 0, 1, v[0], v[1] || 0];
    else if (t[1] === 'scale') n = [v[0], 0, 0, v[1] === undefined ? v[0] : v[1], 0, 0];
    else if (t[1] === 'rotate') {
      const r = v[0] * Math.PI / 180, c = Math.cos(r), z = Math.sin(r);
      n = [c, z, -z, c, 0, 0];
      if (v.length > 2) n = matMul(matMul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
    } else if (t[1] === 'skewX') n = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0];
    else n = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0];
    m = matMul(m, n);
  }
  return m;
}

function flatCubic(out: Polygon, p0: Point, p1: Point, p2: Point, p3: Point, depth: number): void {
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1], len = Math.hypot(dx, dy);
  const d1 = len > 1e-9 ? Math.abs((p1[0] - p3[0]) * dy - (p1[1] - p3[1]) * dx) / len : Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const d2 = len > 1e-9 ? Math.abs((p2[0] - p3[0]) * dy - (p2[1] - p3[1]) * dx) / len : Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  if (depth > 12 || d1 + d2 <= FLAT_TOL * 1.5) { out.push(p3); return; }
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = mid(p0, p1), b = mid(p1, p2), c = mid(p2, p3), e = mid(a, b), f = mid(b, c), g = mid(e, f);
  flatCubic(out, p0, a, e, g, depth + 1);
  flatCubic(out, g, f, c, p3, depth + 1);
}

function arcPoints(x1: number, y1: number, rx: number, ry: number, phi: number, fa: boolean, fs: boolean, x2: number, y2: number): Polygon {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = c * dx + s * dy, yp = -s * dx + c * dy;
  const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let co = den ? Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den)) : 0;
  if (fa === fs) co = -co;
  const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const t1 = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx);
  let dt = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - t1;
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 32)));
  const out: Polygon = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + dt * i / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    out.push([c * ex - s * ey + cx, s * ex + c * ey + cy]);
  }
  return out;
}

const NUM = /[\s,]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const FLAG = /[\s,]*([01])/y;
const CMD = /[\s,]*([a-zA-Z])/y;
const COMMANDS = 'MLHVCSQTAZ';

/** Flattens one path "d" into closed polygons in mm, following the SVG path grammar. */
export function pathToPolys(d: string, m: Matrix, res: PathResult): void {
  let pos = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, prev = '';
  let cur: Polygon | null = null;
  const take = (re: RegExp): string | null => {
    re.lastIndex = pos;
    const t = re.exec(d);
    if (!t) return null;
    pos = re.lastIndex;
    return t[1];
  };
  const num = (): number => {
    const v = take(NUM);
    if (v === null) throw new RangeError('number');
    return parseFloat(v);
  };
  const flag = (): boolean => {
    const v = take(FLAG);
    if (v === null) throw new RangeError('flag');
    return v === '1';
  };
  const finish = (closed: boolean) => {
    if (cur && cur.length > 2) { res.polys.push(cur); if (!closed) res.open++; }
    else if (cur && cur.length === 2) res.dropped++;
    cur = null;
  };
  const line = (): Polygon => (cur ??= [matApply(m, x, y)]);
  try {
    for (;;) {
      const letter = take(CMD);
      if (letter !== null) {
        if (!COMMANDS.includes(letter.toUpperCase())) throw new RangeError('command');
        cmd = letter;
      } else {
        if (!d.slice(pos).replace(/[\s,]/g, '')) break;
        if (!cmd) throw new RangeError('command');
      }
      const rel = cmd >= 'a', C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { finish(true); x = sx; y = sy; prev = C; cmd = ''; continue; }
      if (C === 'M') {
        finish(false);
        x = num() + ox; y = num() + oy; sx = x; sy = y;
        cur = [matApply(m, x, y)];
        cmd = rel ? 'l' : 'L';
      } else if (C === 'L') {
        const p = line(); x = num() + ox; y = num() + oy; p.push(matApply(m, x, y));
      } else if (C === 'H') {
        const p = line(); x = num() + ox; p.push(matApply(m, x, y));
      } else if (C === 'V') {
        const p = line(); y = num() + oy; p.push(matApply(m, x, y));
      } else if (C === 'C' || C === 'S') {
        const p = line();
        let x1: number, y1: number;
        if (C === 'C') { x1 = num() + ox; y1 = num() + oy; }
        else { x1 = (prev === 'C' || prev === 'S') ? 2 * x - cx : x; y1 = (prev === 'C' || prev === 'S') ? 2 * y - cy : y; }
        const x2 = num() + ox, y2 = num() + oy, ex = num() + ox, ey = num() + oy;
        flatCubic(p, matApply(m, x, y), matApply(m, x1, y1), matApply(m, x2, y2), matApply(m, ex, ey), 0);
        cx = x2; cy = y2; x = ex; y = ey;
      } else if (C === 'Q' || C === 'T') {
        const p = line();
        let x1: number, y1: number;
        if (C === 'Q') { x1 = num() + ox; y1 = num() + oy; }
        else { x1 = (prev === 'Q' || prev === 'T') ? 2 * x - qx : x; y1 = (prev === 'Q' || prev === 'T') ? 2 * y - qy : y; }
        const ex = num() + ox, ey = num() + oy;
        const a: Point = [x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y)], b: Point = [ex + 2 / 3 * (x1 - ex), ey + 2 / 3 * (y1 - ey)];
        flatCubic(p, matApply(m, x, y), matApply(m, a[0], a[1]), matApply(m, b[0], b[1]), matApply(m, ex, ey), 0);
        qx = x1; qy = y1; x = ex; y = ey;
      } else {
        const p = line();
        const rx = num(), ry = num(), rot = num() * Math.PI / 180, fa = flag(), fs = flag(), ex = num() + ox, ey = num() + oy;
        for (const q of arcPoints(x, y, rx, ry, rot, fa, fs, ex, ey)) p.push(matApply(m, q[0], q[1]));
        x = ex; y = ey;
      }
      prev = C;
    }
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    res.malformed++; // as browsers do, keep what was read before the error
  }
  finish(false);
}
